document.addEventListener('DOMContentLoaded', () => {
    // --- HELPER FUNCTIONS ---
    // Global spinner management
    window.spinnerManager = {
        spinners: new Map(),
        animationId: null,
        
        startSpinner: (spinner, startTime) => {
            const spinnerId = Math.random().toString(36).substr(2, 9);
            window.spinnerManager.spinners.set(spinnerId, { spinner, startTime });
            
            if (!window.spinnerManager.animationId) {
                window.spinnerManager.animate();
            }
            
            return spinnerId;
        },
        
        stopSpinner: (spinnerId) => {
            window.spinnerManager.spinners.delete(spinnerId);
            
            if (window.spinnerManager.spinners.size === 0 && window.spinnerManager.animationId) {
                cancelAnimationFrame(window.spinnerManager.animationId);
                window.spinnerManager.animationId = null;
            }
        },
        
        animate: () => {
            const now = Date.now();
            
            window.spinnerManager.spinners.forEach(({ spinner, startTime }) => {
                if (spinner && spinner.isConnected) {
                    const elapsed = now - startTime;
                    const rotation = (elapsed / 1000) * 360; // 360 degrees per second
                    spinner.style.transform = `rotate(${rotation}deg)`;
                }
            });
            
            window.spinnerManager.animationId = requestAnimationFrame(() => {
                window.spinnerManager.animate();
            });
        }
    };

    const initializeSpinners = () => {
        // Initialize any existing spinners with proper rotation based on elapsed time
        document.querySelectorAll('.spinner-continuous').forEach(spinner => {
            const tile = spinner.closest('.metric-tile, .considerations-container');
            if (tile) {
                const fieldName = tile.dataset.field;
                const offerId = tile.dataset.offerId;
                const activeKey = `${offerId}:${fieldName}`;
                const activeRefresh = window.app && window.app.activeRefreshes && window.app.activeRefreshes[activeKey];
                
                if (activeRefresh && activeRefresh.startTime) {
                    // Start the spinner animation
                    const spinnerId = window.spinnerManager.startSpinner(spinner, activeRefresh.startTime);
                    spinner.dataset.spinnerId = spinnerId;
                }
            }
        });
    };

    // --- TEXT CONFIGURATION ---
    const TEXT_CONTENT = {
        app: {
            title: 'Churn³',
            mainTitle: 'Dashboard',
            subtitle: 'Track and manage your bank account bonus offers with ChurnChurnChurn.',
            addOfferTitle: 'Add New Offer',
            urlInputPlaceholder: 'Paste a bank offer URL here...',
            submitButtonText: 'Add Offer',
            manualSubmitButtonText: 'Process Content',

            noOffersMessage: 'No offers have been added yet. Paste a URL above to get started.',
        },
        summary: {
            totalClaimed: 'Total Claimed',
            totalPending: 'Total Pending',
        },
        list: {
            expires: 'Expires:',
            orderBy: 'Order by:',
            orderOptions: {
                all: 'All Offers',
                bonus: 'Bonus Amount',
                expiration: 'Expiration Date',
                status: 'Status'
            },
            sortOrder: 'Sort Order',
            ascending: 'Ascending',
            descending: 'Descending'
        },
        detail: {
            backLink: 'Back to Dashboard',
            updateStatusTitle: 'Update Offer Status',
            processingTitle: 'Processing Offer',
            considerationsTitle: 'Additional Considerations',
            deleteButton: 'Delete Offer',
            deleteConfirmation: 'Are you sure you want to delete this offer? This cannot be undone.',
            sourceLink: 'Original Offer',
            refreshButton: 'Refresh All Data',
            // Metric tiles
            initialDeposit: 'Initial Deposit',
            totalDeposit: 'Total Deposit Required',
            offerExpires: 'Offer Expires',
            monthlyFee: 'Monthly Fee',
            minBalance: 'Min. Daily Balance',
            depositsRequired: 'Deposits Required',
            depositWithin: 'Must Deposit Within',
            bonusPayout: 'Bonus Payout Delivered',
            clawback: 'Clawback Clause',
            daysToWithdraw: 'Must Be Open For',
            feeConditional: 'conditionally',

        },
        status: {
            processing: 'Processing...',
            failed: 'Failed',
            claimed: 'Claimed',
            waiting: 'Waiting for Bonus',
            pendingDeposit: 'Pending Deposit',
            unopened: 'Unopened',
            opened: 'Opened',
            deposited: 'Deposited',
        },
        errors: {
            scrapingFailedTitle: 'Scraping Failed',
            scrapingFailedMessage: 'The application was unable to retrieve information from this URL. The website may be down or is actively blocking automated scrapers.',

        },
        // For processing progress bar
        processingSteps: ["Scraping Website", "Validating Offer", "Condensing Terms", "Extracting Details", "Analyzing Fine Print", "Done"],
        manualProcessingSteps: ["Validating Content", "Condensing Terms", "Extracting Details", "Analyzing Fine Print", "Done"],


    };

    // --- HELPER FUNCTIONS ---
    const parseBonusAmount = (bonusStr) => {
        if (!bonusStr) return 0;
        const str = String(bonusStr).toLowerCase();
        
        // Handle "up to" cases - extract the maximum amount
        if (str.includes('up to')) {
            // Try different patterns for "up to" cases
            const patterns = [
                /up to\s*\$?([0-9,]+(?:\.[0-9]+)?)/,
                /up to\s*([0-9,]+(?:\.[0-9]+)?)/,
                /up to\s*\$([0-9,]+(?:\.[0-9]+)?)/
            ];
            
            for (const pattern of patterns) {
                const match = str.match(pattern);
                if (match) {
                    return parseFloat(match[1].replace(/,/g, '')) || 0;
                }
            }
        }
        
        // Handle regular cases - extract any number
        const match = str.match(/([0-9,]+(?:\.[0-9]+)?)/);
        return match ? parseFloat(match[1].replace(/,/g, '')) || 0 : 0;
    };

    const getEffectiveBonusAmount = (offer) => {
        const details = offer.details || {};
        const bonusAmount = parseBonusAmount(details.bonus_to_be_received);
        
        // If the offer is marked as received and has a selected tier, use that tier's bonus
        if (offer.user_controlled && offer.user_controlled.received && offer.user_controlled.selected_tier) {
            const selectedTier = offer.user_controlled.selected_tier;
            
            // Handle "maximum" tier selection
            if (selectedTier === 'maximum') {
                return bonusAmount; // Return the main bonus amount for maximum tier
            }
            
            // Handle regular tier selection
            const tiers = parseTierData(details.bonus_tiers_detailed, details.total_deposit_by_tier);
            if (tiers) {
                const tierData = tiers.find(tier => tier.tier === selectedTier);
                if (tierData && tierData.bonus) {
                    return tierData.bonus;
                }
            }
        }
        
        // Otherwise, use the main bonus amount
        return bonusAmount;
    };

    const API_URL = '/api/offers';
    const app = {
        // Views
        listView: document.getElementById('list-view'),
        detailView: document.getElementById('detail-view'),
        // Track previous page for back button
        previousPage: null,
        // List View Elements
        form: document.getElementById('add-offer-form'),
        urlInput: document.getElementById('url-input'),
        offersList: document.getElementById('offers-list'),
        noOffersMessage: document.getElementById('no-offers-message'),
        submitButton: document.getElementById('submit-button'),
        submitButtonText: document.getElementById('submit-button-text'),
        submitSpinner: document.getElementById('submit-spinner'),
        totalClaimedEl: document.getElementById('total-claimed'),
        totalPendingEl: document.getElementById('total-pending'),
        totalOffersCount: document.getElementById('total-offers-count'),
        totalPotential: document.getElementById('total-potential'),
        filterSelect: document.getElementById('filter-select'),
        filterLabel: document.getElementById('filter-label'),
        sortOrderBtn: document.getElementById('sort-order-btn'),
        sortOrderText: document.getElementById('sort-order-text'),
        sortOrderIcon: document.getElementById('sort-order-icon'),
        // Manual Mode Elements
        urlModeBtn: document.getElementById('url-mode-btn'),
        manualModeBtn: document.getElementById('manual-mode-btn'),
        urlInputContainer: document.getElementById('url-input-container'),
        manualInputContainer: document.getElementById('manual-input-container'),
        manualContent: document.getElementById('manual-content'),
        manualSubmitButton: document.getElementById('manual-submit-button'),
        manualSubmitButtonText: document.getElementById('manual-submit-button-text'),
        manualSubmitSpinner: document.getElementById('manual-submit-spinner'),
        charCount: document.getElementById('char-count'),
        // State
        offers: {},
        currentFilter: 'status',
        isAscending: false,
        currentMode: 'url', // 'url' or 'manual'
    };

    // --- INITIALIZE STATIC TEXT ---
    const initStaticText = () => {
        document.getElementById('app-title-tag').textContent = TEXT_CONTENT.app.title;
        document.getElementById('main-title').textContent = TEXT_CONTENT.app.mainTitle;
        document.getElementById('main-subtitle').textContent = TEXT_CONTENT.app.subtitle;

        document.getElementById('add-offer-title').textContent = TEXT_CONTENT.app.addOfferTitle;
        app.urlInput.placeholder = TEXT_CONTENT.app.urlInputPlaceholder;
        app.submitButtonText.textContent = TEXT_CONTENT.app.submitButtonText;
        app.manualSubmitButtonText.textContent = TEXT_CONTENT.app.manualSubmitButtonText;
        document.getElementById('no-offers-text').textContent = TEXT_CONTENT.app.noOffersMessage;
        app.filterLabel.textContent = TEXT_CONTENT.list.orderBy;
        document.getElementById('filter-all').textContent = TEXT_CONTENT.list.orderOptions.all;
        document.getElementById('filter-bonus').textContent = TEXT_CONTENT.list.orderOptions.bonus;
        document.getElementById('filter-expiration').textContent = TEXT_CONTENT.list.orderOptions.expiration;
        document.getElementById('filter-status').textContent = TEXT_CONTENT.list.orderOptions.status;
        app.sortOrderText.textContent = TEXT_CONTENT.list.descending;
        updateSortOrderButton();
        

    };

    // --- HELPERS & FORMATTERS ---
    const skeleton = (width = 'w-24', alignClass = 'mx-auto') => `<div class="skeleton-loader h-8 ${width} ${alignClass}"></div>`;

    // --- CONSIDERATIONS CONTENT GENERATOR ---
    // This helper is used throughout the app to render the "Additional Considerations" section.
    // It was originally declared inside renderDetailView, which meant it wasn't available to
    // top-level helpers like fetchAllOffers(). Moving it here ensures it is in scope anywhere
    // within the DOMContentLoaded callback.
    const createConsiderationsContent = (data, offerStatus) => {
        const icons = {
            GOOD: `<svg class="w-5 h-5 text-green-500 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>`,
            WARNING: `<svg class="w-5 h-5 text-red-500 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>`,
            CAUTION: `<svg class="w-5 h-5 text-yellow-500 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`
        };

        // Always return the container, but show different content based on state
        let contentHtml = '';

        // Check if data is processing or empty
        const isProcessing = !data || String(data).toLowerCase() === 'n/a' || String(data).toLowerCase().includes('processing');
        
        if (isProcessing) {
            if (offerStatus === 'processing') {
                contentHtml = `<div class="flex items-center justify-center py-8">${skeleton('w-full')}</div>`;
            } else {
                contentHtml = `<div class="flex items-center justify-center py-8 text-gray-500">No additional considerations.</div>`;
            }
        } else {
            const considerationGroups = { WARNING: [], CAUTION: [], GOOD: [] };
            
            // Handle both literal \n strings and actual newlines, and normalize whitespace
            let normalizedData = data.replace(/\\n/g, '\n').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
            
            // If the data doesn't contain newlines, try to split by consideration types
            if (!normalizedData.includes('\n')) {
                // Split by consideration types (WARNING:, CAUTION:, GOOD:)
                const considerationRegex = /(WARNING:|CAUTION:|GOOD:)/g;
                const parts = normalizedData.split(considerationRegex);
                
                // Reconstruct with newlines
                let reconstructed = '';
                for (let i = 0; i < parts.length; i++) {
                    if (parts[i].match(/^(WARNING:|CAUTION:|GOOD:)$/)) {
                        // This is a consideration type, add it to the reconstructed string
                        if (reconstructed && !reconstructed.endsWith('\n')) {
                            reconstructed += '\n';
                        }
                        reconstructed += parts[i];
                    } else if (parts[i].trim()) {
                        // This is the content, add it after the type with a space
                        reconstructed += ' ' + parts[i].trim();
                    }
                }
                normalizedData = reconstructed;
            }
            
            const lines = normalizedData.split('\n');
            
            lines.forEach((item, index) => {
                const trimmedItem = item.trim();
                if (!trimmedItem) return; // Skip empty lines
                
                const colonIndex = trimmedItem.indexOf(':');
                if (colonIndex === -1) return; // Skip lines without colons
                
                const type = trimmedItem.substring(0, colonIndex).trim();
                const text = trimmedItem.substring(colonIndex + 1).trim().replace(/\.$/, '');
                const key = type.toUpperCase();
                
                if (icons[key] && text && text.length > 0) {
                    considerationGroups[key].push(text);
                }
            });

            const allItems = [
                ...considerationGroups.GOOD.map(text => ({ type: 'GOOD', text })),
                ...considerationGroups.CAUTION.map(text => ({ type: 'CAUTION', text })),
                ...considerationGroups.WARNING.map(text => ({ type: 'WARNING', text }))
            ];

            if (allItems.length === 0) {
                contentHtml = `<div class="flex items-center justify-center py-8 text-gray-500">No additional considerations.</div>`;
            } else {
                const itemsHtml = allItems.map((item, index) =>
                    `<li class="flex items-start py-2 consideration-line" data-line-index="${index}"><span class="flex-shrink-0">${icons[item.type]}</span><span class="text-gray-900 !text-gray-900" style="color: #111827 !important;">${item.text}</span></li>`
                ).join('');
                contentHtml = `<ul class="divide-y divide-gray-200">${itemsHtml}</ul>`;
            }
        }

        return contentHtml;
    };


    const isOfferExpired = (offer) => {
        const details = offer.details || {};
        const dateString = details.deal_expiration_date;
        
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
            return false; // Not a valid date, can't be expired
        }
        
        const expirationDate = new Date(dateString + 'T00:00:00Z');
        if (isNaN(expirationDate.getTime())) {
            return false;
        }
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const daysUntilExpiration = Math.ceil((expirationDate - today) / (1000 * 60 * 60 * 24));
        return daysUntilExpiration <= 0;
    };

    const isExpiredAndUnopened = (offer) => {
        // Check if offer is unopened
        const userControlled = offer.user_controlled || { opened: false, deposited: false, received: false };
        const isUnopened = !userControlled.opened && !userControlled.deposited && !userControlled.received;
        
        // Check if offer is expired
        const isExpired = isOfferExpired(offer);
        
        return isUnopened && isExpired;
    };

    const getExpirationColor = (dateString, offer = null) => {
        // Check if this is an offer that should have greyed out expiration
        if (offer && offer.user_controlled && (offer.user_controlled.deposited || offer.user_controlled.received)) {
            return 'text-gray-400'; // Grey for opened, waiting, or claimed offers
        }
        
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
            return 'text-gray-900'; // This handles N/A and other non-date values
        }
        const expirationDate = new Date(dateString + 'T00:00:00Z');
        if (isNaN(expirationDate.getTime())) {
            return 'text-gray-900';
        }
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const daysUntilExpiration = Math.ceil((expirationDate - today) / (1000 * 60 * 60 * 24));
        
        if (daysUntilExpiration <= 0) {
            return 'text-red-600 font-semibold'; // Expired - red and bold
        } else if (daysUntilExpiration <= 3) {
            return 'text-red-600 font-semibold'; // Red for within 3 days - red and bold
        } else if (daysUntilExpiration <= 7) {
            return 'text-yellow-600 font-semibold'; // Orange/yellow for within 7 days - yellow and bold
        } else {
            return 'text-gray-900'; // Normal color
        }
    };

    const formatDateString = (dateString) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
            return dateString;
        }
        const date = new Date(dateString + 'T00:00:00Z');
        if (isNaN(date.getTime())) {
            return dateString;
        }
        const month = date.getUTCMonth() + 1;
        const day = date.getUTCDate();
        const year = String(date.getUTCFullYear()).slice(-2);
        return `${month}/${day}/${year}`;
    };

    const truncateUrl = (url, length = 35) => {
        if (!url) return '';
        let cleanUrl = url.replace(/^(?:https?:\/\/)?(?:www\.)?/i, '');
        if (cleanUrl.endsWith('/')) {
            cleanUrl = cleanUrl.slice(0, -1);
        }
        if (cleanUrl.length > length) {
            return cleanUrl.substring(0, length) + '...';
        }
        return cleanUrl;
    };

    const getValueType = (fieldName) => {
        const typeMap = {
            'initial_deposit_amount': 'currency',
            'minimum_deposit_amount': 'currency',
            'total_deposit_required': 'currency',
            'deal_expiration_date': 'date',
            'minimum_monthly_fee': 'currency',
            'minimum_daily_balance_required': 'currency',
            'num_required_deposits': 'text',
            'days_for_deposit': 'days',
            'days_for_bonus': 'days',
            'clawback_clause_present': 'boolean',
            'must_be_open_for': 'days',
            'bonus_to_be_received': 'currency',
            'bank_name': 'text',
            'account_title': 'text'
        };
        return typeMap[fieldName] || 'text';
    };

    const formatValue = (value, type = 'text', options = {}) => {
        const { skeletonOptions = {}, offerStatus = '', fieldName = '', offer = null } = options;
        if (offerStatus !== 'failed' && String(value).toLowerCase().includes('processing')) {
            const { width, alignClass } = skeletonOptions;
            // Special handling for bonus field to ensure skeleton stays in container
            if (fieldName === 'bonus_to_be_received') {
                return skeleton(width, alignClass);
            }
            return skeleton(width, alignClass);
        }
        if (offerStatus === 'failed' && String(value).toLowerCase().includes('processing')) {
            return '<span class="text-gray-500">N/A</span>';
        }
        if (value === null || value === undefined || String(value).toLowerCase() === 'n/a') {
            // Check if this is a deal_expiration_date field for an opened/waiting/claimed offer
            if (fieldName === 'deal_expiration_date' && offer && offer.user_controlled && (offer.user_controlled.deposited || offer.user_controlled.received)) {
                return '<span class="text-gray-400">N/A</span>';
            }
            return '<span class="text-gray-500">N/A</span>';
        }
        
        // Convert to lowercase for all fields except clawback_clause_present, bank_name, and account_title
        let processedValue = value;
        if (fieldName !== 'clawback_clause_present' && fieldName !== 'bank_name' && fieldName !== 'account_title') {
            processedValue = String(value).charAt(0).toLowerCase() + String(value).slice(1);
        }
        
        switch(type) {
            case 'currency':
                const num = parseFloat(String(processedValue).replace(/[^0-9.-]+/g,""));
                const formattedCurrency = !isNaN(num) ? `$${num.toLocaleString()}` : processedValue;
                // Special handling for bonus field to ensure proper container structure
                if (fieldName === 'bonus_to_be_received') {
                    return formattedCurrency;
                }
                return formattedCurrency;
            case 'boolean':
                const valStr = String(processedValue).toLowerCase().replace(/[^\w]/g, '');
                if (valStr === 'true' || valStr === 'yes') return 'Yes';
                if (valStr === 'false' || valStr === 'no') return 'No';
                return processedValue;
            case 'days':
                 const daysNum = parseInt(processedValue, 10);
                 return !isNaN(daysNum) ? `${daysNum} days` : processedValue;
            case 'date':
                const formattedDate = formatDateString(processedValue);
                // Add color for expiration dates
                if (fieldName === 'deal_expiration_date') {
                    const colorClass = getExpirationColor(processedValue, offer);
                    return `<span class="${colorClass}">${formattedDate}</span>`;
                }
                return formattedDate;
            default:
                return processedValue;
        }
    };

    const parseTierData = (bonusTiersDetailed, totalDepositByTier) => {
        if (!bonusTiersDetailed || bonusTiersDetailed === 'Single tier' || bonusTiersDetailed === 'N/A' || 
            String(bonusTiersDetailed).toLowerCase().includes('processing')) {
            return null;
        }

        // Clean up the JSON string first
        let cleanedJson = bonusTiersDetailed;
        if (typeof cleanedJson === 'string') {
            // Remove any "json" prefix that might be present (more robust)
            cleanedJson = cleanedJson.replace(/^json\s*\n?/i, '').trim();
            // Also handle cases where "json" appears at the start of the actual content
            if (cleanedJson.startsWith('json\n') || cleanedJson.startsWith('json ')) {
                cleanedJson = cleanedJson.substring(cleanedJson.indexOf('\n') + 1).trim();
            }
            // Fix single quotes to double quotes for valid JSON
            cleanedJson = cleanedJson.replace(/'/g, '"');
        }

        try {
            // Validate JSON structure before parsing
            if (!cleanedJson || cleanedJson.trim() === '') {
                console.warn('Empty tier data');
                return null;
            }
            
            // Try to parse as JSON first
            const tiers = JSON.parse(cleanedJson);
            // Clean totalDepositByTier data too
            let cleanedDeposits = totalDepositByTier;
            if (cleanedDeposits && cleanedDeposits !== 'Single tier' && 
                !String(cleanedDeposits).toLowerCase().includes('processing') && 
                typeof cleanedDeposits === 'string') {
                cleanedDeposits = cleanedDeposits.replace(/^json\s*\n?/i, '').trim();
                cleanedDeposits = cleanedDeposits.replace(/'/g, '"');
            }
            const deposits = cleanedDeposits && cleanedDeposits !== 'Single tier' ? JSON.parse(cleanedDeposits) : null;
            
            // Ensure we have valid tiers array
            if (!Array.isArray(tiers) || tiers.length === 0) {
                return null;
            }
            
            return tiers.map(tier => {
                // Validate tier object structure
                if (!tier || typeof tier !== 'object') {
                    console.warn('Invalid tier object:', tier);
                    return null;
                }
                
                // Handle mixed data types in deposit field
                let depositAmount = tier.deposit;
                let depositDescription = null;
                
                // If deposit is a string (description), try to extract numeric value
                if (typeof depositAmount === 'string') {
                    // Look for dollar amounts in the description
                    const dollarMatch = depositAmount.match(/\$?([\d,]+)/);
                    if (dollarMatch) {
                        const numericValue = parseFloat(dollarMatch[1].replace(',', ''));
                        if (!isNaN(numericValue)) {
                            depositDescription = depositAmount;
                            depositAmount = numericValue;
                        }
                    } else {
                        // No numeric value found, treat as special requirement
                        depositDescription = depositAmount;
                        depositAmount = 0; // Use 0 for display purposes
                    }
                }
                
                return {
                    tier: tier.tier || 1,
                    bonus: tier.bonus || 0,
                    deposit: depositAmount,
                    depositDescription: depositDescription,
                    totalDeposit: deposits ? deposits.find(d => d.tier === tier.tier)?.total_deposit : depositAmount
                };
            }).filter(tier => tier !== null);
        } catch (e) {
            console.warn('Failed to parse tier data as JSON:', e);
            console.warn('Original data:', bonusTiersDetailed);
            console.warn('Cleaned data:', cleanedJson);
            // Fallback to regex parsing if JSON fails
            const tierPattern = /Tier(\d+):\s*\$?([\d,]+)\s*bonus\s*for\s*\$?([\d,]+)\s*deposit/g;
            const tiers = [];
            let match;
            
            while ((match = tierPattern.exec(bonusTiersDetailed)) !== null) {
                tiers.push({
                    tier: parseInt(match[1]),
                    bonus: parseFloat(match[2].replace(',', '')),
                    deposit: parseFloat(match[3].replace(',', '')),
                    depositDescription: null,
                    totalDeposit: parseFloat(match[3].replace(',', ''))
                });
            }
            
            return tiers.length > 0 ? tiers : null;
        }
    };

    const validateTierCompleteness = (offer) => {
        const details = offer.details || {};
        const maxBonus = parseBonusAmount(details.bonus_to_be_received);
        const tiers = parseTierData(details.bonus_tiers_detailed, details.total_deposit_by_tier);
        
        if (!tiers || tiers.length === 0) {
            return { isValid: true, message: null }; // Single tier or no tiers
        }
        
        const totalTierBonus = tiers.reduce((sum, tier) => sum + (tier.bonus || 0), 0);
        const difference = maxBonus - totalTierBonus;
        
        if (Math.abs(difference) < 10) { // Allow small rounding differences
            return { isValid: true, message: null };
        }
        
        if (difference > 0) {
            return {
                isValid: false,
                message: `Missing ${difference > 0 ? difference : 0} in bonus tiers. Total tiers: $${totalTierBonus}, Maximum: $${maxBonus}`,
                missingAmount: difference
            };
        }
        
        return { isValid: true, message: null };
    };

    const shortenTierDescription = (description) => {
        if (!description) return description;
        
        // Keep the original description for pattern matching
        let cleaned = description.trim();
        
        // If the description is already concise and specific (under 60 chars), preserve it
        if (cleaned.length <= 60 && !/complete.*qualifying|meet.*requirements|other.*activities|qualifying.*activities/i.test(cleaned)) {
            return cleaned;
        }
        
        // Detect and reject vague descriptions
        if (/complete.*qualifying|meet.*requirements|other.*activities|qualifying.*activities|see.*requirements|check.*requirements/i.test(cleaned)) {
            return 'See offer details';
        }
        
        // Handle specific patterns to create meaningful, concise descriptions
        
        // Complex direct deposit patterns with amounts and timeframes
        const directDepositAmountMatch = /direct deposit.*?\$([\d,]+).*?(\d+)\s*days?/i.exec(cleaned);
        if (directDepositAmountMatch) {
            const amount = directDepositAmountMatch[1];
            const days = directDepositAmountMatch[2];
            return `Direct deposit $${amount} within ${days} days`;
        }
        
        // Multiple direct deposits with specific counts and amounts
        const multipleDepositsSpecificMatch = /(\d+)\s*direct deposits.*?\$([\d,]+).*?each/i.exec(cleaned);
        if (multipleDepositsSpecificMatch) {
            const count = multipleDepositsSpecificMatch[1];
            const amount = multipleDepositsSpecificMatch[2];
            return `${count} direct deposits $${amount}+ each`;
        }
        
        // Direct deposit with balance maintenance
        const directDepositMaintainMatch = /direct deposit.*?maintain.*?\$([\d,]+)/i.exec(cleaned);
        if (directDepositMaintainMatch) {
            const balance = directDepositMaintainMatch[1];
            return `Direct deposit + maintain $${balance}`;
        }
        
        // Simple direct deposit patterns
        if (/direct deposit/i.test(cleaned) && !/\$/g.test(cleaned)) {
            return 'Set up direct deposit';
        }
        
        // Recurring savings increases (like "$200/mo x 12")
        const savingsIncreaseMatch = /increase.*?savings.*?\$([\d,]+)\/mo.*?(\d+)/i.exec(cleaned);
        if (savingsIncreaseMatch) {
            const monthlyAmount = savingsIncreaseMatch[1];
            const months = savingsIncreaseMatch[2];
            return `Increase savings $${monthlyAmount}/month for ${months} months`;
        }
        
        // Pattern like "$15K + maintain 90 days" or "$15,000 + maintain 90 days"
        const dollarPlusMaintainMatch = /\$([\d,]+)K?\s*(?:deposit\s*)?\+?\s*maintain\s*(\d+)?\s*days?/i.exec(cleaned);
        if (dollarPlusMaintainMatch) {
            const amount = dollarPlusMaintainMatch[1];
            const days = dollarPlusMaintainMatch[2];
            const numericAmount = amount.includes('K') ? parseInt(amount.replace(',', '')) * 1000 : parseInt(amount.replace(',', ''));
            
            if (days && parseInt(days) > 0) {
                return `Deposit $${numericAmount.toLocaleString()} + maintain ${days} days`;
            } else if (numericAmount > 100) {
                return `Deposit $${numericAmount.toLocaleString()} + maintain balance`;
            } else {
                return 'Maintain minimum balance';
            }
        }
        
        // Pattern like "$15 + maintain 90 days" (missing K but should be $15K)
        const shortDollarMaintainMatch = /\$(\d{1,2})\s*\+\s*maintain\s*(\d+)\s*days?/i.exec(cleaned);
        if (shortDollarMaintainMatch) {
            const amount = shortDollarMaintainMatch[1];
            const days = shortDollarMaintainMatch[2];
            const numericAmount = parseInt(amount);
            
            // If it's a small number like $15, it's likely meant to be $15K
            if (numericAmount <= 50 && parseInt(days) > 30) {
                return `Deposit $${(numericAmount * 1000).toLocaleString()} + maintain ${days} days`;
            } else if (numericAmount > 100) {
                return `Deposit $${numericAmount.toLocaleString()} + maintain ${days} days`;
            } else {
                return 'Maintain minimum balance';
            }
        }
        
        // Complex multi-account requirements with more detail
        if (/open both.*accounts/i.test(cleaned)) {
            // Extract key requirements
            const hasDirectDeposit = /direct deposit/i.test(cleaned);
            const depositMatch = cleaned.match(/\$([\d,]+)K?/);
            const maintainMatch = /maintain.*?(\d+)\s*days/i.exec(cleaned);
            const maintainBalanceMatch = /maintain.*?\$([\d,]+)/i.exec(cleaned);
            const meetBothMatch = /meet both/i.test(cleaned);
            
            let parts = ['Open both accounts'];
            
            if (meetBothMatch) {
                parts.push('meet all requirements');
            } else {
                if (hasDirectDeposit) parts.push('set up direct deposit');
                if (depositMatch) {
                    const amount = depositMatch[1];
                    const numericAmount = amount.includes('K') ? parseInt(amount.replace(',', '')) * 1000 : parseInt(amount.replace(',', ''));
                    if (numericAmount > 100) parts.push(`deposit $${numericAmount.toLocaleString()}`);
                }
                if (maintainMatch && parseInt(maintainMatch[1]) > 0) parts.push(`maintain ${maintainMatch[1]} days`);
                if (maintainBalanceMatch) parts.push(`maintain $${maintainBalanceMatch[1]}`);
            }
            
            return parts.join(' + ');
        }
        
        // Multiple direct deposits pattern
        const multipleDepositsMatch = /(\d+)\s*direct deposits.*?\$([\d,]+)/i.exec(cleaned);
        if (multipleDepositsMatch) {
            const count = multipleDepositsMatch[1];
            const amount = multipleDepositsMatch[2];
            return `${count} direct deposits of $${amount}+ each`;
        }
        
        // Simple deposit amounts with maintenance (different pattern)
        const depositMaintainMatch = /deposit.*?\$([\d,]+).*?maintain.*?(\d+)\s*days/i.exec(cleaned);
        if (depositMaintainMatch) {
            return `Deposit $${depositMaintainMatch[1]} + maintain ${depositMaintainMatch[2]} days`;
        }
        
        // Simple deposit amounts with timeframe
        const depositTimeMatch = /deposit.*?\$([\d,]+).*?(\d+)\s*days/i.exec(cleaned);
        if (depositTimeMatch) {
            return `Deposit $${depositTimeMatch[1]} within ${depositTimeMatch[2]} days`;
        }
        
        // Specific deposit amounts with exact timeframes
        const exactDepositTimeMatch = /deposit.*?\$([\d,]+).*?within.*?(\d+)\s*days/i.exec(cleaned);
        if (exactDepositTimeMatch) {
            return `Deposit $${exactDepositTimeMatch[1]} within ${exactDepositTimeMatch[2]} days`;
        }
        
        // Balance maintenance with specific timeframes
        const balanceMaintainTimeMatch = /maintain.*?\$([\d,]+).*?(\d+)\s*days/i.exec(cleaned);
        if (balanceMaintainTimeMatch) {
            return `Maintain $${balanceMaintainTimeMatch[1]} for ${balanceMaintainTimeMatch[2]} days`;
        }
        
        // Simple deposit amounts
        const simpleDepositMatch = /deposit.*?\$([\d,]+)/i.exec(cleaned);
        if (simpleDepositMatch) {
            return `Deposit $${simpleDepositMatch[1]}`;
        }
        
        // Maintenance requirements (fallback)
        const maintainMatch = /maintain.*?\$([\d,]+).*?(\d+)\s*days/i.exec(cleaned);
        if (maintainMatch) {
            return `Maintain $${maintainMatch[1]} for ${maintainMatch[2]} days`;
        }
        
        // Account opening + simple requirement
        if (/open.*account.*direct deposit/i.test(cleaned)) {
            return 'Open account + direct deposit';
        }
        
        // Account opening with specific requirements
        const openAccountMatch = /open.*?(\w+).*?account.*?(\w+)/i.exec(cleaned);
        if (openAccountMatch) {
            const accountType = openAccountMatch[1];
            const requirement = openAccountMatch[2];
            return `Open ${accountType} account + ${requirement}`;
        }
        
        // Cash back percentages
        const cashbackMatch = /(\d+)%.*?cash back/i.exec(cleaned);
        if (cashbackMatch) {
            return `${cashbackMatch[1]}% cash back`;
        }
        
        // Qualifying purchases
        if (/qualifying purchases/i.test(cleaned)) {
            return 'Make qualifying purchases';
        }
        
        // Handle specific patterns that should be preserved but made more readable
        cleaned = cleaned
            .replace(/open checking \+ direct deposit/i, 'Open checking + direct deposit')
            .replace(/open savings \+ direct deposit/i, 'Open savings + direct deposit')
            .replace(/At least (\d+|\w+) qualifying/i, '')
            .replace(/electronic/i, '')
            .replace(/from employer.*?benefits/i, '')
            .replace(/meet both reqs/i, 'meet all requirements')
            .replace(/for 0 days/i, '')
            .replace(/set up/i, 'setup')
            .replace(/complete.*qualifying.*activities/i, 'See offer details')
            .replace(/meet.*requirements/i, 'See offer details')
            .replace(/other.*qualifying.*activities/i, 'See offer details')
            .replace(/\s+/g, ' ')
            .trim();
        
        // Final length check - truncate if still too long but preserve key info
        if (cleaned.length > 80) {
            // Try to preserve the most important part (amounts and key actions)
            const importantParts = cleaned.match(/\$([\d,]+)|direct deposit|open|maintain|\d+\s*days?|cash back|qualifying|purchases/gi);
            if (importantParts && importantParts.length > 0) {
                cleaned = importantParts.slice(0, 5).join(' + ');
                if (cleaned.length > 80) {
                    cleaned = cleaned.substring(0, 77) + '...';
                }
            } else {
                cleaned = cleaned.substring(0, 77) + '...';
            }
        }
        
        return cleaned || 'See requirements';
    };

    const createTierDisplay = (tiers, displayBonus, selectedTier = null, offer = null) => {
        if (!tiers || tiers.length <= 1) {
            return '';
        }

        // Get main bonus amount from the offer details
        const details = offer?.details || {};
        const mainBonusAmount = parseBonusAmount(details.bonus_to_be_received);
        const tierSum = tiers.reduce((sum, t) => sum + t.bonus, 0);
        const hasMaximumTier = mainBonusAmount > tierSum + 10; // Allow small rounding differences

        const tierItems = tiers.map(tier => {
            // Format deposit requirement based on whether it's numeric or descriptive
            let depositText;
            if (tier.depositDescription) {
                // Use shortened version of descriptive text for complex requirements
                depositText = shortenTierDescription(tier.depositDescription);
            } else if (tier.deposit === 0) {
                depositText = "See requirements";
            } else if (typeof tier.deposit === 'number') {
                depositText = `$${tier.deposit.toLocaleString()} deposit`;
            } else {
                // Fallback for any other format
                depositText = shortenTierDescription(String(tier.deposit));
            }

            const isSelected = selectedTier === tier.tier;
            const selectedClass = isSelected ? 'bg-green-50 border-green-200' : '';
            const selectedIcon = isSelected ? '<svg class="w-4 h-4 text-green-600 ml-2" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path></svg>' : '';

            return `
                <div class="py-2 border-b border-gray-100 last:border-b-0 ${selectedClass} rounded px-2">
                    <div class="flex justify-between items-start mb-1">
                        <div class="flex items-center">
                            <span class="text-xs font-medium text-gray-700">Tier ${tier.tier}</span>
                            ${selectedIcon}
                        </div>
                        <span class="text-xs font-semibold text-green-600">$${tier.bonus ? tier.bonus.toLocaleString() : 'N/A'}</span>
                    </div>
                    <div class="text-xs text-gray-500">
                        ${depositText}
                    </div>
                </div>
            `;
        }).join('');

        // Add maximum tier option if it exists
        const maximumTierItem = hasMaximumTier ? `
            <div class="py-2 border-b border-gray-100 last:border-b-0 ${selectedTier === 'maximum' ? 'bg-green-50 border-green-200' : ''} rounded px-2">
                <div class="flex justify-between items-start mb-1">
                    <div class="flex items-center">
                        <span class="text-xs font-medium text-gray-700">Maximum Bonus</span>
                        ${selectedTier === 'maximum' ? '<svg class="w-4 h-4 text-green-600 ml-2" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path></svg>' : ''}
                    </div>
                    <span class="text-xs font-semibold text-green-600">$${mainBonusAmount.toLocaleString()}</span>
                </div>
                <div class="text-xs text-gray-500">Complete all requirements for maximum bonus</div>
            </div>
        ` : '';

        const selectedText = selectedTier ? 
            (selectedTier === 'maximum' ? ' (Maximum Bonus selected)' : ` (Tier ${selectedTier} selected)`) : '';

        // Check for tier completeness
        const validation = offer ? validateTierCompleteness(offer) : { isValid: true, message: null };
        const validationWarning = !validation.isValid ? `
            <div class="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded-md">
                <div class="flex items-center">
                    <svg class="w-4 h-4 text-yellow-600 mr-2" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path>
                    </svg>
                    <span class="text-xs text-yellow-800">${validation.message}</span>
                </div>
            </div>
        ` : '';

        return `
            <div class="bg-white rounded-lg shadow-md border border-gray-200 p-4 w-full lg:w-80">
                <div class="flex items-center justify-between mb-3">
                    <span class="text-sm font-semibold text-gray-800">Tier Options${selectedText}</span>
                    <span class="text-xs font-medium text-green-600">Up to ${formatValue(displayBonus, 'currency')}</span>
                </div>
                <div class="space-y-2 max-h-64 overflow-y-auto">
                    ${tierItems}
                    ${maximumTierItem}
                </div>
                ${validationWarning}
            </div>
        `;
    };
    
    const setLoadingState = (isLoading) => {
        app.submitButton.disabled = isLoading;
        app.urlInput.disabled = isLoading;
        app.submitButtonText.classList.toggle('hidden', isLoading);
        app.submitSpinner.classList.toggle('hidden', !isLoading);
    };

    const setManualLoadingState = (isLoading) => {
        app.manualSubmitButton.disabled = isLoading;
        app.manualContent.disabled = isLoading;
        app.manualSubmitButtonText.classList.toggle('hidden', isLoading);
        app.manualSubmitSpinner.classList.toggle('hidden', !isLoading);
    };



    const getOfferStatus = (offer) => {
        if (offer.status === 'processing') return { status: 'processing', statusClass: 'status-processing', statusText: TEXT_CONTENT.status.processing };
        if (offer.status === 'failed') return { status: 'failed', statusClass: 'status-failed', statusText: TEXT_CONTENT.status.failed };
        
        // Defensive checks for user_controlled object
        const userControlled = offer.user_controlled || { opened: false, deposited: false, received: false };
        
        if (userControlled.received) return { status: 'claimed', statusClass: 'status-claimed', statusText: TEXT_CONTENT.status.claimed };
        if (userControlled.deposited) return { status: 'waiting', statusClass: 'status-waiting', statusText: TEXT_CONTENT.status.waiting };
        if (userControlled.opened) return { status: 'pending-deposit', statusClass: 'status-pending-deposit', statusText: TEXT_CONTENT.status.pendingDeposit };
        
        // Check if unopened offer is expired
        if (isExpiredAndUnopened(offer)) {
            return { status: 'unopened', statusClass: 'status-unopened-expired', statusText: TEXT_CONTENT.status.unopened };
        }
        
        return { status: 'unopened', statusClass: 'status-unopened', statusText: TEXT_CONTENT.status.unopened };
    };

    // --- PLANNING FEATURE ---
    
    const getUnopenedOffers = () => {
        return Object.values(app.offers).filter(offer => {
            const { status } = getOfferStatus(offer);
            return status === 'unopened' && offer.status !== 'processing' && offer.status !== 'failed';
        });
    };











    // --- VIEW RENDERING LOGIC ---
    
    const sortOffers = (offersArray) => {
        const filterType = app.currentFilter;
        const isAscending = app.isAscending;
        
        return offersArray.sort((a, b) => {
            let comparison = 0;
            
            switch (filterType) {
                case 'all':
                    comparison = b.id - a.id; // Default: newest first
                    break;
                case 'bonus':
                    const bonusA = getEffectiveBonusAmount(a);
                    const bonusB = getEffectiveBonusAmount(b);
                    comparison = bonusB - bonusA; // Default: highest first
                    break;
                case 'expiration':
                    const dateA = a.details.deal_expiration_date;
                    const dateB = b.details.deal_expiration_date;
                    if (!dateA || dateA === 'N/A' || !/^\d{4}-\d{2}-\d{2}$/.test(dateA)) comparison = 1;
                    else if (!dateB || dateB === 'N/A' || !/^\d{4}-\d{2}-\d{2}$/.test(dateB)) comparison = -1;
                    else comparison = new Date(dateA) - new Date(dateB); // Default: earliest first
                    break;
                case 'status':
                    const statusA = getOfferStatus(a).status;
                    const statusB = getOfferStatus(b).status;
                    const statusOrder = ['processing', 'failed', 'unopened', 'pending-deposit', 'waiting', 'claimed'];
                    comparison = statusOrder.indexOf(statusA) - statusOrder.indexOf(statusB);
                    break;
                default:
                    comparison = b.id - a.id;
            }
            
            // Apply ascending/descending order
            return isAscending ? -comparison : comparison;
        });
    };

    const updateSortOrderButton = () => {
        app.sortOrderText.textContent = app.isAscending ? TEXT_CONTENT.list.ascending : TEXT_CONTENT.list.descending;
        app.sortOrderIcon.style.transform = app.isAscending ? 'rotate(180deg)' : 'rotate(0deg)';
    };

    const switchMode = (mode) => {
        app.currentMode = mode;
        
        if (mode === 'url') {
            app.urlModeBtn.classList.add('bg-white', 'text-gray-900', 'shadow-sm');
            app.urlModeBtn.classList.remove('text-gray-600');
            app.manualModeBtn.classList.remove('bg-white', 'text-gray-900', 'shadow-sm');
            app.manualModeBtn.classList.add('text-gray-600');
            
            app.urlInputContainer.classList.remove('hidden');
            app.manualInputContainer.classList.add('hidden');
            app.urlInput.required = true;
            app.manualContent.required = false;
            
            // Focus on URL input
            setTimeout(() => app.urlInput.focus(), 100);
        } else {
            app.manualModeBtn.classList.add('bg-white', 'text-gray-900', 'shadow-sm');
            app.manualModeBtn.classList.remove('text-gray-600');
            app.urlModeBtn.classList.remove('bg-white', 'text-gray-900', 'shadow-sm');
            app.urlModeBtn.classList.add('text-gray-600');
            
            app.urlInputContainer.classList.add('hidden');
            app.manualInputContainer.classList.remove('hidden');
            app.urlInput.required = false;
            app.manualContent.required = true;
            
            // Focus on manual content textarea
            setTimeout(() => app.manualContent.focus(), 100);
        }
    };

    const updateCharCount = () => {
        const count = app.manualContent.value.length;
        app.charCount.textContent = count.toLocaleString();
    };

    const renderOfferList = () => {
        const offersArray = Object.values(app.offers);
        app.offersList.innerHTML = '';
        app.noOffersMessage.classList.toggle('hidden', offersArray.length > 0);
        
        // Show/hide filter controls based on whether there are offers
        const filterContainer = document.querySelector('.bg-white.rounded-lg.shadow-md.overflow-hidden .p-4.border-b.border-gray-200');
        if (filterContainer) {
            filterContainer.classList.toggle('hidden', offersArray.length === 0);
        }
        
        let totalClaimed = 0;
        let totalPending = 0;

        const sortedOffers = sortOffers(offersArray);

        // Group offers by status if status filter is selected
        if (app.currentFilter === 'status') {
            renderOffersGroupedByStatus(sortedOffers);
        } else {
            renderOffersAsTiles(sortedOffers);
        }

        // Calculate totals for all offers
        sortedOffers.forEach(offer => {
            const effectiveBonusAmount = getEffectiveBonusAmount(offer);
            if (!isNaN(effectiveBonusAmount)) {
                if (offer.user_controlled && offer.user_controlled.received) {
                    totalClaimed += effectiveBonusAmount;
                } else if (offer.user_controlled && offer.user_controlled.deposited) {
                    totalPending += effectiveBonusAmount;
                }
            }
        });

        // Update summary stats
        app.totalClaimedEl.textContent = `$${totalClaimed.toLocaleString()}`;
        app.totalPendingEl.textContent = `$${totalPending.toLocaleString()}`;
        app.totalOffersCount.textContent = offersArray.length;
        
        // Calculate total potential earnings
        const totalPotential = totalClaimed + totalPending;
        app.totalPotential.textContent = `$${totalPotential.toLocaleString()}`;
    };

    const renderOffersAsTiles = (offers) => {
        // Create a grid container for tiles
        const tilesContainer = document.createElement('div');
        tilesContainer.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4';
        
        offers.forEach(offer => {
            const tile = createOfferTile(offer);
            tilesContainer.appendChild(tile);
        });
        
        app.offersList.appendChild(tilesContainer);
    };

    const renderOffersGroupedByStatus = (offers) => {
        // Group offers by status
        const groupedOffers = {};
        const baseStatusOrder = ['unopened', 'pending-deposit', 'waiting', 'processing', 'claimed', 'failed'];
        
        // Apply sort order to status groups - reverse for descending
        const statusOrder = app.isAscending ? baseStatusOrder : [...baseStatusOrder].reverse();
        
        offers.forEach(offer => {
            const { statusText } = getOfferStatus(offer);
            const statusKey = getStatusKey(offer);
            if (!groupedOffers[statusKey]) {
                groupedOffers[statusKey] = { statusText, offers: [] };
            }
            groupedOffers[statusKey].offers.push(offer);
        });

        // Sort offers within each status group
        Object.keys(groupedOffers).forEach(statusKey => {
            groupedOffers[statusKey].offers.sort((a, b) => {
                // For unopened offers, sort expired ones to the end
                if (statusKey === 'unopened') {
                    const aExpired = isExpiredAndUnopened(a);
                    const bExpired = isExpiredAndUnopened(b);
                    
                    // If one is expired and the other isn't, put non-expired first
                    if (aExpired !== bExpired) {
                        return aExpired ? 1 : -1; // Non-expired first
                    }
                }
                
                // Then sort by bonus amount (descending)
                const bonusA = getEffectiveBonusAmount(a);
                const bonusB = getEffectiveBonusAmount(b);
                return bonusB - bonusA; // Descending order (highest bonus first)
            });
        });

        // Render groups in order
        statusOrder.forEach(statusKey => {
            if (groupedOffers[statusKey] && groupedOffers[statusKey].offers.length > 0) {
                const group = groupedOffers[statusKey];
                
                // Create status group header
                const groupHeader = document.createElement('div');
                groupHeader.className = 'px-4 py-3 bg-gray-100 border-b border-gray-200 cursor-pointer hover:bg-gray-200 transition-colors duration-200';
                groupHeader.innerHTML = `
                    <div class="flex items-center justify-between">
                        <h3 class="text-sm font-semibold text-gray-700 uppercase tracking-wider">
                            ${group.statusText} (${group.offers.length})
                        </h3>
                        <svg class="w-5 h-5 text-gray-500 transition-transform duration-200 group-collapse-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                        </svg>
                    </div>
                `;
                
                // Add click handler for collapse/expand
                groupHeader.addEventListener('click', () => {
                    const icon = groupHeader.querySelector('.group-collapse-icon');
                    const tilesContainer = groupHeader.nextElementSibling;
                    const isCollapsed = tilesContainer.style.display === 'none';
                    
                    if (isCollapsed) {
                        tilesContainer.style.display = 'grid';
                        icon.style.transform = 'rotate(0deg)';
                    } else {
                        tilesContainer.style.display = 'none';
                        icon.style.transform = 'rotate(-90deg)';
                    }
                });
                
                app.offersList.appendChild(groupHeader);
                
                // Create tiles container for this group
                const tilesContainer = document.createElement('div');
                tilesContainer.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4 bg-gray-50 transition-all duration-200';
                
                group.offers.forEach(offer => {
                    const tile = createOfferTile(offer);
                    tilesContainer.appendChild(tile);
                });
                
                app.offersList.appendChild(tilesContainer);
            }
        });
    };

    const createOfferTile = (offer) => {
        const { statusClass, statusText } = getOfferStatus(offer);
        const tile = document.createElement('a');
        tile.href = `#/offer/${offer.id}`;
        
        // Check if offer is expired and unopened to apply grey styling
        const isExpiredUnopened = isExpiredAndUnopened(offer);
        const baseClasses = 'block rounded-lg shadow-sm border transition-all duration-200 p-4';
        const normalClasses = 'bg-white border-gray-200 hover:shadow-md hover:border-blue-300';
        const expiredClasses = 'bg-gray-100 border-gray-300 hover:shadow-sm hover:border-gray-400 opacity-60';
        
        tile.className = `${baseClasses} ${isExpiredUnopened ? expiredClasses : normalClasses}`;
        
        // Defensive check for offer.details
        const details = offer.details || {};
        
        const effectiveBonusAmount = getEffectiveBonusAmount(offer);

        // Parse tier information for tile view
        const tiers = parseTierData(details.bonus_tiers_detailed, details.total_deposit_by_tier);
        const hasMultipleTiers = tiers && tiers.length > 1;
        
        // For sorting: use the main bonus amount (total maximum)
        // For display: use the main bonus amount unless it's significantly different from tier sum
        const tierSum = tiers ? tiers.reduce((sum, t) => sum + t.bonus, 0) : 0;
        const displayBonus = hasMultipleTiers && Math.abs(tierSum - effectiveBonusAmount) <= 10 ? tierSum : effectiveBonusAmount;

        // Apply grey styling to text elements for expired unopened offers
        const bankNameColorClass = isExpiredUnopened ? 'text-gray-500' : 'text-blue-600';
        const accountTitleColorClass = isExpiredUnopened ? 'text-gray-500' : 'text-gray-900';
        const bonusColorClass = isExpiredUnopened ? 'text-gray-500' : 'text-green-600';
        const expirationColorClass = isExpiredUnopened ? 'text-gray-400' : 'text-gray-500';

        tile.innerHTML = `
            <div class="flex flex-col h-full">
                <div class="flex items-start justify-between mb-3">
                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-semibold ${bankNameColorClass} truncate" data-field="bank_name">
                            ${formatValue(details.bank_name, 'text', { skeletonOptions: { width: 'w-24', alignClass: '' }, offerStatus: offer.status, fieldName: 'bank_name' })}
                        </p>
                        <h3 class="text-lg font-bold ${accountTitleColorClass} truncate leading-tight" data-field="account_title">
                            ${formatValue(details.account_title, 'text', { skeletonOptions: { width: 'w-32', alignClass: '' }, offerStatus: offer.status, fieldName: 'account_title' })}
                        </h3>
                    </div>
                    <span class="px-2 py-1 text-xs font-semibold rounded-full ${statusClass} ml-2">
                        ${statusText}
                    </span>
                </div>
                
                <div class="flex-1 mb-3">
                    <div class="text-2xl font-bold ${bonusColorClass} mb-2" data-field="bonus_to_be_received">
                        ${(() => {
                            // Check if bonus value is available (not processing)
                            const bonusValue = details.bonus_to_be_received;
                            const isBonusAvailable = bonusValue && !String(bonusValue).toLowerCase().includes('processing');
                            
                            if (isBonusAvailable) {
                                // If we have multiple tiers and they're available, show tier display
                                if (hasMultipleTiers && details.bonus_tiers_detailed && !String(details.bonus_tiers_detailed).toLowerCase().includes('processing')) {
                                    const tierTextColorClass = isExpiredUnopened ? 'text-gray-500' : 'text-gray-900';
                                    const tierBonusColorClass = isExpiredUnopened ? 'text-gray-500' : 'text-green-600';
                                    return `<div class="text-sm font-normal ${tierTextColorClass} mb-0.5">Up to</div><div class="text-2xl font-bold ${tierBonusColorClass}">${formatValue(displayBonus, 'currency')}</div>`;
                                } else {
                                    // Show single bonus value
                                    return formatValue(bonusValue, 'currency');
                                }
                            } else {
                                // Show skeleton
                                return formatValue(bonusValue, 'currency', { skeletonOptions: { width: 'w-20', alignClass: '' }, offerStatus: offer.status, fieldName: 'bonus_to_be_received' });
                            }
                        })()}
                    </div>
                </div>
                
                <div class="text-sm ${expirationColorClass} flex items-center">
                    <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                    </svg>
                    <span>${TEXT_CONTENT.list.expires}</span>
                    <span class="ml-1" data-field="deal_expiration_date">
                        ${formatValue(details.deal_expiration_date, 'date', { skeletonOptions: { width: 'w-16', alignClass: '' }, offerStatus: offer.status, fieldName: 'deal_expiration_date', offer: offer })}
                    </span>
                </div>
            </div>
        `;
        
        return tile;
    };

    const getStatusKey = (offer) => {
        const { statusClass } = getOfferStatus(offer);
        // Treat expired unopened offers as regular unopened for grouping purposes
        if (statusClass === 'status-unopened-expired') {
            return 'unopened';
        }
        return statusClass.replace('status-', '').replace(' ', '_');
    };



    const renderDetailView = (offer) => {
        // Defensive check for offer.details
        const details = offer.details || {};
        
        // Handle failed offers first
        if (offer.status === 'failed') {
            app.detailView.innerHTML = `
                <header class="mb-8 pt-8">
                    <a href="#" class="inline-flex items-center text-blue-600 hover:underline">
                        <svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
                        ${TEXT_CONTENT.detail.backLink}
                    </a>
                </header>
                <div class="bg-gradient-to-br from-red-50 to-orange-50 border border-red-200 rounded-xl shadow-lg my-8 overflow-hidden">
                    <!-- Header with icon -->
                    <div class="bg-gradient-to-r from-red-500 to-orange-500 px-6 py-4">
                        <div class="flex items-center">
                            <div class="bg-white/20 rounded-full p-2 mr-3">
                                <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                </svg>
                            </div>
                            <div>
                                <h3 class="text-xl font-bold text-white">${TEXT_CONTENT.errors.scrapingFailedTitle}</h3>
                                <p class="text-red-100 text-sm">We couldn't automatically extract the offer details</p>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Content area -->
                    <div class="p-6">
                        <div class="mb-6">
                            <p class="text-gray-700 leading-relaxed">${TEXT_CONTENT.errors.scrapingFailedMessage}</p>
                            
                            <!-- Source link -->
                            <div class="mt-4 inline-flex items-center">
                                <a href="${offer.url}" target="_blank" class="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors duration-200 text-sm font-medium" title="${offer.url}">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                                    </svg>
                                    ${TEXT_CONTENT.detail.sourceLink}
                                </a>
                            </div>
                        </div>
                        
                        <!-- Manual input section -->
                        <div class="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6">
                            <div class="flex items-center mb-4">
                                <div class="bg-blue-100 rounded-full p-2 mr-3">
                                    <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                                    </svg>
                                </div>
                                <div>
                                    <h4 class="text-lg font-semibold text-gray-800">Manual Content Entry</h4>
                                    <p class="text-sm text-gray-600">Please paste the website content below to process manually</p>
                                </div>
                            </div>
                            
                            <div class="space-y-4">
                                <div class="relative">
                                    <textarea 
                                        id="failed-scrape-content" 
                                        rows="8" 
                                        class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 resize-none font-mono text-sm bg-white shadow-sm" 
                                        placeholder="Paste the website content, HTML, or text here...

Tips:
• Copy the entire page content (Ctrl+A, Ctrl+C)
• Include terms, conditions, and bonus details
• You can paste HTML or plain text"
                                        autofocus
                                    ></textarea>

                                </div>
                                
                                <div class="flex justify-end">
                                    <button 
                                        id="submit-failed-content-btn" 
                                        class="bg-green-600 text-white font-semibold px-6 py-2 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition duration-200"
                                    >
                                        Process Content
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="flex justify-end mt-4">
                    <button id="delete-offer-btn" data-id="${offer.id}" class="text-sm text-red-600 hover:text-red-800 py-2 px-4 rounded-md hover:bg-red-50 transition">${TEXT_CONTENT.detail.deleteButton}</button>
                </div>
            `;
            document.getElementById('delete-offer-btn').addEventListener('click', deleteOffer);
            
            // Add back button functionality for failed offers
            const backButton = document.querySelector('a[href="#"]');
            if (backButton) {
                backButton.addEventListener('click', async (e) => {
                    e.preventDefault();

                    if (app.previousPage === 'planning') {
                        window.location.href = '/planning';
                    } else {
                        // Delete the failed offer when navigating back to dashboard
                        try {
                            await fetch(`${API_URL}/${offer.id}`, { method: 'DELETE' });
                            delete app.offers[offer.id];
                        } catch (error) {
                            console.error('Error deleting failed offer:', error);
                        }

                        // Refresh offers before navigating back to dashboard
                        await fetchAllOffers();
                        window.location.hash = '';
                        // Force a re-render of the dashboard to show updated data
                        setTimeout(() => {
                            handleRouteChange();
                        }, 10);
                    }
                });
            }
            
            // Add failed scrape content submission functionality
            const failedScrapeContent = document.getElementById('failed-scrape-content');
            const submitFailedBtn = document.getElementById('submit-failed-content-btn');
            
            // Auto-submit on paste
            failedScrapeContent.addEventListener('paste', (e) => {
                e.preventDefault();
                const pastedText = (e.clipboardData || window.clipboardData).getData('text');
                failedScrapeContent.value = pastedText;
                // Auto-submit after a short delay to allow the paste to complete
                setTimeout(() => {
                    submitFailedBtn.click();
                }, 100);
            });
            
            submitFailedBtn.addEventListener('click', async () => {
                const content = document.getElementById('failed-scrape-content').value.trim();
                if (!content) {
                    alert('Please paste the website content before submitting.');
                    return;
                }
                
                // Show loading state
                const submitBtn = document.getElementById('submit-failed-content-btn');
                const originalText = submitBtn.textContent;
                submitBtn.textContent = 'Processing...';
                submitBtn.disabled = true;
                
                try {
                    // Delete the failed offer first
                    await fetch(`${API_URL}/${offer.id}`, { method: 'DELETE' });
                    delete app.offers[offer.id];
                    
                    // Submit the content as a new offer
                    const response = await fetch(API_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            content,
                            original_url: offer.url 
                        })
                    });
                    
                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(errorData.error || 'An unknown error occurred while processing the content.');
                    }

                    const newOffer = await response.json();
                    app.offers[newOffer.id] = newOffer;
                    
                    // Clear the form
                    document.getElementById('failed-scrape-content').value = '';
                    
                    // Start polling if processing
                    if (newOffer.status === 'processing') {

                        scheduleNextFetch();
                    }
                    
                    // Trigger route change and navigate to the new offer's detail page
                    handleRouteChange();
                    window.location.hash = `#/offer/${newOffer.id}`;
                    
                } catch (error) {
                    console.error('Error processing failed scrape content:', error);
                    alert(`Failed to process the content: ${error.message}`);
                    
                    // Reset button state
                    submitBtn.textContent = originalText;
                    submitBtn.disabled = false;
                }
            });
            return; // Stop further rendering
        }

        const oldProgressBar = document.getElementById('processing-progress-bar');
        const initialWidth = oldProgressBar ? oldProgressBar.style.width : '0%';

        const createMetricTile = (label, value, { extraClass = '', subtitle = '', fieldName = '', offerId = '', hasClawback = false, clawbackDetails = '' } = {}) => {
            // Check if the value contains N/A or is empty/null
            const isNAValue = !value || 
                            String(value).toLowerCase() === 'n/a' || 
                            String(value).includes('<span class="text-gray-500">N/A</span>') ||
                            String(value).includes('<span class="text-gray-400">N/A</span>');
            
            const hiddenClass = isNAValue ? 'metric-tile-na hidden' : '';

            // Preserve in-progress refresh overlay across re-renders
            const activeKey = `${offerId}:${fieldName}`;
            const active = (window.app && window.app.activeRefreshes) ? window.app.activeRefreshes[activeKey] : null;
            const progressHiddenClass = active ? '' : 'hidden';
            const progressLabel = (active && active.label) ? active.label : 'Rescraping';
            
            return `
            <div class="metric-tile bg-white p-4 rounded-lg shadow-md text-center flex flex-col justify-center min-h-32 relative group ${hiddenClass}" data-field="${fieldName}" data-offer-id="${offerId}" data-label="${label}">
                <dt class="text-sm font-medium text-gray-500 truncate">${label}</dt>
                <dd class="metric-value mt-1 text-3xl font-bold tracking-tight ${extraClass}" data-field="${fieldName}">${value}</dd>
                ${subtitle ? `<dd class="text-xs text-gray-400 -mt-1">${subtitle}</dd>` : ''}
                ${hasClawback ? `<div class="clawback-icon absolute top-2 left-2 text-red-500 cursor-help" title="Click to view clawback details">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                    </svg>
                    <div class="clawback-tooltip absolute left-0 top-8 bg-gray-900 text-white text-xs rounded py-2 px-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10">
                        <div class="font-semibold mb-1">⚠️ Clawback Clause</div>
                        <div class="text-gray-300">${clawbackDetails && clawbackDetails !== 'N/A' && clawbackDetails !== 'Processing...' ? clawbackDetails : clawbackDetails === 'Processing...' ? 'Processing clawback details...' : 'The bank can take back the bonus if you close the account early or don\'t meet requirements.'}</div>
                        <div class="absolute top-0 left-4 transform -translate-y-1 w-2 h-2 bg-gray-900 rotate-45"></div>
                    </div>
                </div>` : ''}
                <div class="refresh-progress ${progressHiddenClass} absolute inset-0 bg-blue-50 bg-opacity-90 rounded-lg flex items-center justify-center">
                    <div class="text-center w-full px-4">
                        <div class="flex items-center justify-center mb-2">
                            <svg class="spinner-continuous h-6 w-6 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        </div>
                        <div class="text-xs text-blue-600">${progressLabel}</div>
                    </div>
                </div>
                <button class="refresh-button absolute top-3 right-3 bg-white text-gray-600 rounded-lg w-8 h-8 flex items-center justify-center text-xs hover:bg-gray-50 hover:text-blue-600 border border-gray-200 shadow-sm transition-all duration-200 opacity-0 group-hover:opacity-100 transform scale-90 group-hover:scale-100" title="Rescan?" style="display: ${active ? 'none' : 'none'};">
                    <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                    </svg>
                </button>
            </div>`;
        };

        const createStatusDropdown = (offer) => {
            if (offer.status === 'processing') {
                return `
                    <div class="status-oblong-button processing">
                        <div class="status-dot processing-dot">
                            <svg class="animate-spin h-3 w-3 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        </div>
                        <span class="status-label">${TEXT_CONTENT.status.processing}</span>
                    </div>
                `;
            }

            const statuses = [
                { key: 'unopened', label: TEXT_CONTENT.status.unopened, dotColor: '#6b7280' },    // grey
                { key: 'opened', label: TEXT_CONTENT.status.opened, dotColor: '#f59e0b' },        // amber - action needed
                { key: 'deposited', label: TEXT_CONTENT.status.deposited, dotColor: '#3b82f6' },  // blue - waiting for bonus
                { key: 'received', label: TEXT_CONTENT.status.claimed, dotColor: '#22c55e' }      // green - completed
            ];

            let currentStatusKey = 'unopened';
            if (offer.user_controlled && offer.user_controlled.received) currentStatusKey = 'received';
            else if (offer.user_controlled && offer.user_controlled.deposited) currentStatusKey = 'deposited';
            else if (offer.user_controlled && offer.user_controlled.opened) currentStatusKey = 'opened';

            const currentStatus = statuses.find(s => s.key === currentStatusKey);

            return `
                <div class="relative">
                    <button type="button" class="status-oblong-button status-dropdown-trigger" data-offer-id="${offer.id}">
                        <div class="status-dot" style="background-color: ${currentStatus.dotColor}"></div>
                        <span class="status-label">${currentStatus.label}</span>
                        <svg class="status-chevron" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                            <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" />
                        </svg>
                    </button>
                    <div class="status-dropdown-menu absolute right-0 mt-2 w-52 bg-white rounded-lg shadow-lg border border-gray-200 hidden z-50">
                        <div class="py-2">
                            ${statuses.map(status => `
                                <button type="button" class="status-dropdown-option flex items-center w-full text-left px-4 py-3 text-sm transition-colors duration-150 hover:bg-gray-50 ${status.key === currentStatusKey ? 'bg-blue-50' : ''}" data-status="${status.key}" data-id="${offer.id}">
                                    <div class="status-dot mr-3" style="background-color: ${status.dotColor}"></div>
                                    <span class="flex-1">${status.label}</span>
                                    ${status.key === currentStatusKey ? '<svg class="h-4 w-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path></svg>' : ''}
                                </button>
                            `).join('')}
                        </div>
                    </div>
                </div>
            `;
        };

        const createStatusSelector = (offer, initialProgressBarWidth) => {
            if (offer.status === 'processing') {
                // Determine if this is a manual mode offer
                const isManualMode = offer.url && offer.url.startsWith('manual-content-');
                const steps = isManualMode ? TEXT_CONTENT.manualProcessingSteps : TEXT_CONTENT.processingSteps;
                


                let currentStepIndex = steps.indexOf(offer.processing_step);
                
                // If exact match not found, try to find partial match
                if (currentStepIndex === -1) {
                    currentStepIndex = steps.findIndex(step => 
                        offer.processing_step && offer.processing_step.toLowerCase().startsWith(step.toLowerCase())
                    );
                }
                
                // If still not found, try case-insensitive exact match
                if (currentStepIndex === -1) {
                    currentStepIndex = steps.findIndex(step => 
                        offer.processing_step && offer.processing_step.toLowerCase() === step.toLowerCase()
                    );
                }
                
                // Special handling for backend/frontend step name mismatch
                if (currentStepIndex === -1 && offer.processing_step === "Validating Content" && !isManualMode) {
                    // Backend is sending "Validating Content" for URL mode, map it to "Validating Offer"
                    currentStepIndex = steps.indexOf("Validating Offer");
                }
                
                // If still not found, handle error states or default to 0
                if (currentStepIndex === -1) {
                    // Handle error states that aren't in the normal flow
                    if (offer.processing_step === "Validation Failed" || 
                        offer.processing_step === "Scraping Failed" || 
                        offer.processing_step === "Processing Error") {
                        // For error states, show as the last step before "Done"
                        currentStepIndex = steps.length - 2; // Second to last step
                    } else {
                        currentStepIndex = 0;
                    }
                }

                // Ensure "Done" step shows 100% progress
                const progressPercentage = offer.processing_step === "Done" ? 100 : ((currentStepIndex + 1) / steps.length) * 100;
                

                
                return `
                    <div class="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-6 border border-blue-200">
                        <div class="flex items-center justify-between mb-4">
                            <div class="flex items-center space-x-3">
                                <div class="bg-blue-100 rounded-full p-2">
                                    <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                                    </svg>
                                </div>
                                <div>
                                    <h3 class="text-lg font-semibold text-blue-900">${TEXT_CONTENT.detail.processingTitle}</h3>
                                </div>
                            </div>
                            <div class="text-right">
                                <div class="text-2xl font-bold text-blue-900">${Math.round(progressPercentage)}%</div>
                                <div class="text-xs text-blue-600">Complete</div>
                            </div>
                        </div>
                        
                        <div class="mb-3">
                            <div class="flex items-center justify-between text-sm text-blue-700 mb-2">
                                <span class="font-medium">${offer.processing_step}</span>
                                <span class="text-xs step-counter">Step ${currentStepIndex + 1} of ${steps.length}</span>
                            </div>
                            <div class="relative">
                                <div class="w-full bg-blue-200 rounded-full h-3 overflow-hidden">
                                    <div id="processing-progress-bar" 
                                         style="width: ${initialProgressBarWidth}; transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);" 
                                         data-target-width="${progressPercentage}%" 
                                         class="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-1000 relative overflow-hidden">
                                        <div class="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-30 animate-pulse"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        

                    </div>
                `;
            }

            const statuses = [
                { key: 'unopened', label: TEXT_CONTENT.status.unopened },
                { key: 'opened', label: TEXT_CONTENT.status.opened },
                { key: 'deposited', label: TEXT_CONTENT.status.deposited },
                { key: 'received', label: TEXT_CONTENT.status.claimed }
            ];

            let currentStatusKey = 'unopened';
            if (offer.user_controlled && offer.user_controlled.received) currentStatusKey = 'received';
            else if (offer.user_controlled && offer.user_controlled.deposited) currentStatusKey = 'deposited';
            else if (offer.user_controlled && offer.user_controlled.opened) currentStatusKey = 'opened';

            let html = '<div class="isolate inline-flex rounded-md shadow-sm w-full">';
            statuses.forEach((status, index) => {
                const isCurrent = status.key === currentStatusKey;
                const positionClass = index === 0 ? 'rounded-l-md' : (index === statuses.length - 1 ? 'rounded-r-md' : '');
                const activeClass = isCurrent ? 'bg-blue-600 text-white z-10' : 'bg-white text-gray-900 hover:bg-gray-50';
                
                html += `
                    <button type="button" class="status-button relative inline-flex items-center justify-center flex-1 px-3 py-2 text-sm font-semibold ring-1 ring-inset ring-gray-300 focus:z-10 ${activeClass} ${positionClass}" data-status="${status.key}" data-id="${offer.id}">
                        ${status.label}
                    </button>
                `;
            });
            html += '</div>';
            return `<h3 class="text-lg font-semibold mb-4 text-center">${TEXT_CONTENT.detail.updateStatusTitle}</h3>${html}`;
        };



        const createConsiderationsList = (offer) => {
            const data = (offer.details || {}).additional_considerations || 'N/A';
            const contentHtml = createConsiderationsContent(data, offer.status);
            const fieldName = 'additional_considerations';
            const activeKey = `${offer.id}:${fieldName}`;
            const active = (window.app && window.app.activeRefreshes) ? window.app.activeRefreshes[activeKey] : null;
            const progressHiddenClass = active ? '' : 'hidden';
            const progressLabel = (active && active.label) ? active.label : 'Rescraping';

            return `
                <div class="considerations-container bg-white p-6 rounded-lg shadow-md relative group min-h-48" data-field="additional_considerations" data-offer-id="${offer.id}">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="text-lg font-semibold">${TEXT_CONTENT.detail.considerationsTitle}</h3>
                        <button class="refresh-button bg-white text-gray-600 rounded-lg w-8 h-8 flex items-center justify-center text-xs hover:bg-gray-50 hover:text-blue-600 border border-gray-200 shadow-sm transition-all duration-200 opacity-0 group-hover:opacity-100 transform scale-90 group-hover:scale-100" title="Refresh considerations" style="display: ${active ? 'none' : 'none'};">
                            <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                            </svg>
                        </button>
                    </div>
                    ${contentHtml}
                    <div class="refresh-progress ${progressHiddenClass} absolute inset-0 bg-blue-50 bg-opacity-90 rounded-lg flex items-center justify-center">
                        <div class="text-center w-full px-4">
                            <div class="flex items-center justify-center mb-2">
                                <svg class="spinner-continuous h-6 w-6 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                            </div>
                            <div class="text-xs text-blue-600">${progressLabel}</div>
                        </div>
                    </div>
                </div>`;
        };

        const bonusAmount = parseBonusAmount(details.bonus_to_be_received);
        
        // Helper function to normalize yes/no values with punctuation
        const normalizeYesNo = (value) => {
            const normalized = String(value || 'No').toLowerCase().replace(/[^\w]/g, '');
            return normalized === 'yes';
        };
        
        const feeIsConditional = normalizeYesNo(details.fee_is_conditional);
        const clawbackStatus = String(details.clawback_clause_present || 'No');
        const hasClawback = normalizeYesNo(details.clawback_clause_present);
        const clawbackDetails = details.clawback_details;
        const clawbackValue = formatValue(clawbackStatus === 'Processing...' ? 'Processing...' : (hasClawback ? 'Yes' : 'No'), 'text', { offerStatus: offer.status, fieldName: 'clawback_clause_present' });
        const clawbackClass = clawbackStatus === 'Processing...' ? 'text-blue-600' : (hasClawback ? 'text-red-600' : 'text-green-600');

        // Parse tier information
        const tiers = parseTierData(details.bonus_tiers_detailed, details.total_deposit_by_tier);
        const hasMultipleTiers = tiers && tiers.length > 1;
        
        // For sorting: use the main bonus amount (total maximum)
        // For display: use the main bonus amount unless it's significantly different from tier sum
        const tierSum = tiers ? tiers.reduce((sum, t) => sum + t.bonus, 0) : 0;
        const displayBonus = hasMultipleTiers && Math.abs(tierSum - bonusAmount) <= 10 ? tierSum : bonusAmount;
        
        // Check if a tier has been selected for this offer
        const selectedTier = offer.user_controlled && offer.user_controlled.selected_tier;
        const selectedTierData = selectedTier && tiers ? tiers.find(tier => tier.tier === selectedTier) : null;

        app.detailView.innerHTML = `
            <div class="detail-layout">
                <!-- Main Content -->
                <div class="detail-main-content flex-1 max-w-4xl">
                    <header class="mb-8 pt-8">
                        <a href="#" id="back-button" class="inline-flex items-center text-blue-600 hover:underline mb-4">
                            <svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
                            ${app.previousPage === 'planning' ? 'Back to Planning' : TEXT_CONTENT.detail.backLink}
                        </a>
                        <div class="md:flex justify-between items-start">
                            <div class="flex-1">
                                <h1 class="text-4xl font-bold text-gray-900" data-field="account_title">${formatValue(details.account_title, 'text', { skeletonOptions: { width: 'w-3/4', alignClass: '' }, offerStatus: offer.status, fieldName: 'account_title' })}</h1>
                                <p class="text-2xl text-gray-600 mt-1" data-field="bank_name">${formatValue(details.bank_name, 'text', { skeletonOptions: { width: 'w-1/2', alignClass: '' }, offerStatus: offer.status, fieldName: 'bank_name' })}</p>
                            </div>
                            <div class="text-left md:text-right mt-4 md:mt-0 md:ml-6">
                                <div class="flex flex-col items-end">
                                    <p class="text-5xl font-bold text-green-600" data-field="bonus_to_be_received">
                                        ${(() => {
                                            // Check if bonus value is available (not processing)
                                            const bonusValue = details.bonus_to_be_received;
                                            const isBonusAvailable = bonusValue && !String(bonusValue).toLowerCase().includes('processing');
                                            
                                            // Always show the green container
                                            if (isBonusAvailable) {
                                                // If we have multiple tiers and they're available, show tier display
                                                if (hasMultipleTiers && details.bonus_tiers_detailed && !String(details.bonus_tiers_detailed).toLowerCase().includes('processing')) {
                                                    return `<div class="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-4 border-l-4 border-green-500">
                                                        <div class="text-sm font-normal text-gray-700 mb-1">Up to</div>
                                                        <div class="text-5xl font-bold text-green-600">${formatValue(displayBonus, 'currency')}</div>
                                                    </div>`;
                                                } else {
                                                    // Show single bonus value
                                                    return `<div class="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-4 border-l-4 border-green-500">
                                                        <div class="text-5xl font-bold text-green-600">${formatValue(bonusValue, 'currency')}</div>
                                                    </div>`;
                                                }
                                            } else {
                                                // Show skeleton
                                                return `<div class="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-4 border-l-4 border-green-500">
                                                    <div class="text-5xl font-bold text-green-600">${formatValue(bonusValue, 'currency', { skeletonOptions: { width: 'w-32', alignClass: '' }, offerStatus: offer.status, fieldName: 'bonus_to_be_received' })}</div>
                                                </div>`;
                                            }
                                        })()}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </header>
            <div class="space-y-6">
                <!-- Mobile status + tier panel (top) -->
                <div class="block lg:hidden space-y-4">
                    ${createStatusDropdown(offer)}
                    ${hasMultipleTiers ? createTierDisplay(tiers, displayBonus, selectedTier, offer) : ''}
                </div>
                ${offer.status === 'processing' ? `<div class="bg-white p-6 rounded-lg shadow-md">
                     ${createStatusSelector(offer, initialWidth)}
                </div>` : ''}

                <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4" id="metric-tiles-grid">
                    ${createMetricTile(TEXT_CONTENT.detail.initialDeposit, formatValue(details.initial_deposit_amount, 'currency', { fieldName: 'initial_deposit_amount', offerStatus: offer.status }), { fieldName: 'initial_deposit_amount', offerId: offer.id })}
                    ${createMetricTile(TEXT_CONTENT.detail.totalDeposit, formatValue(details.total_deposit_required, 'currency', { fieldName: 'total_deposit_required', offerStatus: offer.status }), { fieldName: 'total_deposit_required', offerId: offer.id })}
                    ${createMetricTile(TEXT_CONTENT.detail.offerExpires, formatValue(details.deal_expiration_date, 'date', { fieldName: 'deal_expiration_date', offerStatus: offer.status, offer: offer }), { fieldName: 'deal_expiration_date', offerId: offer.id })}
                    ${createMetricTile(TEXT_CONTENT.detail.monthlyFee, formatValue(details.minimum_monthly_fee, 'currency', { fieldName: 'minimum_monthly_fee', offerStatus: offer.status }), { subtitle: feeIsConditional ? TEXT_CONTENT.detail.feeConditional : '', fieldName: 'minimum_monthly_fee', offerId: offer.id })}
                    ${createMetricTile(TEXT_CONTENT.detail.minBalance, formatValue(details.minimum_daily_balance_required, 'currency', { fieldName: 'minimum_daily_balance_required', offerStatus: offer.status }), { fieldName: 'minimum_daily_balance_required', offerId: offer.id })}
                    ${createMetricTile(TEXT_CONTENT.detail.depositsRequired, formatValue(details.num_required_deposits, 'text', { fieldName: 'num_required_deposits', offerStatus: offer.status }), { fieldName: 'num_required_deposits', offerId: offer.id })}
                    ${createMetricTile(TEXT_CONTENT.detail.depositWithin, formatValue(details.days_for_deposit, 'days', { fieldName: 'days_for_deposit', offerStatus: offer.status }), { fieldName: 'days_for_deposit', offerId: offer.id })}
                    ${createMetricTile(TEXT_CONTENT.detail.bonusPayout, formatValue(details.days_for_bonus, 'days', { fieldName: 'days_for_bonus', offerStatus: offer.status }), { fieldName: 'days_for_bonus', offerId: offer.id })}
                    ${createMetricTile(TEXT_CONTENT.detail.clawback, clawbackValue, { extraClass: clawbackClass, fieldName: 'clawback_clause_present', offerId: offer.id, hasClawback: hasClawback, clawbackDetails: clawbackDetails })}
                    ${createMetricTile(TEXT_CONTENT.detail.daysToWithdraw, formatValue(details.must_be_open_for, 'days', { fieldName: 'must_be_open_for', offerStatus: offer.status }), { fieldName: 'must_be_open_for', offerId: offer.id })}
                </div>
                
                <!-- Hidden tiles indicator -->
                <div id="hidden-tiles-indicator" class="hidden-tiles-indicator bg-gray-50 border rounded-lg p-4 mt-4 hidden">
                    <div class="hidden-tiles-toggle flex items-center justify-between cursor-pointer" onclick="toggleHiddenTiles()">
                        <div class="flex items-center">
                            <svg class="w-5 h-5 text-gray-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L12 12m-3-3l6.364 6.364M21 21l-3.5-3.5m-2.5-2.5L9.878 9.878"></path>
                            </svg>
                            <span class="text-sm font-medium text-gray-700">
                                <span id="hidden-tiles-count">0</span> metric tiles hidden (N/A values)
                            </span>
                        </div>
                        <svg id="hidden-tiles-chevron" class="w-4 h-4 text-gray-500 transform transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                        </svg>
                    </div>
                    <div id="hidden-tiles-list" class="hidden-tiles-list">
                        <div class="text-xs text-gray-600 mb-2">Hidden tiles:</div>
                        <div id="hidden-tiles-names" class="flex flex-wrap gap-2">
                            <!-- Hidden tile names will be populated here -->
                        </div>
                    </div>
                </div>
                
                ${createConsiderationsList(offer)}

                <div class="flex justify-between items-center bg-white p-4 rounded-lg shadow-md">
                     <div class="flex items-center gap-2">
                         <a href="${offer.url}" target="_blank" class="text-sm text-blue-500 hover:underline flex items-center gap-1" title="${offer.url}">
                             ${TEXT_CONTENT.detail.sourceLink}
                             <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                 <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                             </svg>
                         </a>
                     </div>
                     <div class="flex items-center gap-2">
                         <button id="refresh-all-btn" data-id="${offer.id}" class="text-sm text-blue-600 hover:text-blue-800 py-2 px-4 rounded-md hover:bg-blue-50 transition flex items-center gap-1 ${offer.status === 'processing' ? 'opacity-50 cursor-not-allowed' : ''}" ${offer.status === 'processing' ? 'disabled' : ''}>
                             <svg class="w-4 h-4 ${offer.status === 'processing' ? 'animate-spin' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                 <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                             </svg>
                             ${offer.status === 'processing' ? 'Processing...' : TEXT_CONTENT.detail.refreshButton}
                         </button>
                         <button id="delete-offer-btn" data-id="${offer.id}" class="text-sm text-red-600 hover:text-red-800 py-2 px-4 rounded-md hover:bg-red-50 transition">${TEXT_CONTENT.detail.deleteButton}</button>
                     </div>
                </div>
            </div>
        </div>

        <!-- Sidebar (desktop only) -->
        <div class="hidden lg:block relative space-y-4">
            ${createStatusDropdown(offer)}
            ${hasMultipleTiers ? createTierDisplay(tiers, displayBonus, selectedTier, offer) : ''}
        </div>
    </div>
        `;

        const progressBar = document.getElementById('processing-progress-bar');
        if (progressBar) {
            requestAnimationFrame(() => {
                progressBar.style.width = progressBar.dataset.targetWidth;
            });
        }

        // Update the offer in the app state immediately to prevent re-rendering
        app.offers[offer.id] = offer;

        document.querySelectorAll('.status-button, .status-step').forEach(button => {
            button.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                const status = e.currentTarget.dataset.status;
                updateOfferStatus(id, status);
            });
        });

        // Add status dropdown functionality for ALL instances (mobile + sidebar)
        const dropdownTriggers = Array.from(document.querySelectorAll('.status-dropdown-trigger'));
        const closeAllStatusMenus = () => {
            document.querySelectorAll('.status-dropdown-menu').forEach(menu => menu.classList.add('hidden'));
            document.querySelectorAll('.status-dropdown-menu').forEach(menu => menu.classList.remove('show'));
            document.querySelectorAll('.status-chevron').forEach(ch => ch.classList.remove('rotated'));
        };

        dropdownTriggers.forEach(trigger => {
            const wrapper = trigger.closest('.relative');
            if (!wrapper) return;
            const menu = wrapper.querySelector('.status-dropdown-menu');
            const chevron = trigger.querySelector('.status-chevron');

            if (!menu) return;

            // Toggle dropdown on trigger click (per instance)
            trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                const isHidden = menu.classList.contains('hidden');
                closeAllStatusMenus();
                if (isHidden) {
                    menu.classList.remove('hidden');
                    menu.classList.add('show');
                    if (chevron) chevron.classList.add('rotated');
                }
            });

            // Handle dropdown option selection (per instance)
            wrapper.querySelectorAll('.status-dropdown-option').forEach(option => {
                option.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const id = e.currentTarget.dataset.id;
                    const status = e.currentTarget.dataset.status;

                    if (statusUpdateTimeout) return;

                    updateOfferStatus(id, status, trigger);
                    menu.classList.remove('show');
                    menu.classList.add('hidden');
                    if (chevron) chevron.classList.remove('rotated');
                });
            });
        });

        // Close any open dropdown when clicking outside
        document.addEventListener('click', (e) => {
            const anyWrapper = (e.target && (e.target.closest && e.target.closest('.status-dropdown-trigger')))
                || (e.target && (e.target.closest && e.target.closest('.status-dropdown-menu')));
            if (!anyWrapper) {
                closeAllStatusMenus();
            }
        });
        document.getElementById('delete-offer-btn').addEventListener('click', deleteOffer);
        document.getElementById('refresh-all-btn').addEventListener('click', refreshAllData);
        
        // Add back button functionality
        document.getElementById('back-button').addEventListener('click', async (e) => {
            e.preventDefault();

            if (app.previousPage === 'planning') {
                window.location.href = '/planning';
            } else {

                // Refresh offers before navigating back to dashboard
                await fetchAllOffers();
                window.location.hash = '';
                // Force a re-render of the dashboard to show updated data
                setTimeout(() => {

                    handleRouteChange();
                }, 10);
            }
        });
        


        // Add hover functionality for metric tiles
        document.querySelectorAll('.metric-tile').forEach(tile => {
            const fieldName = tile.dataset.field;
            const offerId = tile.dataset.offerId;
            const refreshButton = tile.querySelector('.refresh-button');
            const progressDiv = tile.querySelector('.refresh-progress');
            const offer = app.offers[offerId];

            // Only show refresh button if offer is not in processing state
            if (offer && offer.status !== 'processing') {
                refreshButton.style.display = 'block';
                
                tile.addEventListener('mouseenter', () => {
                    refreshButton.style.opacity = '1';
                });

                tile.addEventListener('mouseleave', () => {
                    refreshButton.style.opacity = '0';
                });
            }

            refreshButton.addEventListener('click', async (e) => {
                e.stopPropagation();
                
                // Show progress and hide button

                progressDiv.classList.remove('hidden');
                refreshButton.style.display = 'none';
                // Track active refresh so overlay persists across re-renders
                window.app.activeRefreshes = window.app.activeRefreshes || {};
                const activeKey_metric = `${offerId}:${fieldName}`;
                const refreshStartTime = Date.now();
                window.app.activeRefreshes[activeKey_metric] = { label: 'Rescraping', startTime: refreshStartTime };
                
                const stepText = tile.querySelector('.refresh-progress .text-xs:last-child');
                const spinner = tile.querySelector('.spinner-continuous');
                
                // Start the spinner animation
                if (spinner) {
                    const spinnerId = window.spinnerManager.startSpinner(spinner, refreshStartTime);
                    spinner.dataset.spinnerId = spinnerId;
                }
                
                // Update text for step 1 (rescraping)
                stepText.textContent = 'Rescraping';

                
                try {
                    // Grace period to avoid race where backend hasn't set refresh_status yet
                    const refreshStartTime = Date.now();
                    let seenRefreshStatus = false;

                    const response = await fetch(`${API_URL}/${offerId}/refresh`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ field: fieldName })
                    });
                    
                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({}));
                        throw new Error(errorData.error || `Refresh failed (HTTP ${response.status})`);
                    }

                    
                    // Poll for updates with progress tracking
                    const pollForUpdate = async () => {
                        try {

                            const offerResponse = await fetch(`${API_URL}/${offerId}`);
                            const updatedOffer = await offerResponse.json();

                            
                            if (updatedOffer.refresh_status && updatedOffer.refresh_status[fieldName]) {
                                seenRefreshStatus = true;
                                // Update text based on actual status
                                const status = updatedOffer.refresh_status[fieldName];
                                if (status === 'rescraping') {
                                    stepText.textContent = 'Rescraping';
                                    window.app.activeRefreshes[activeKey_metric] = { label: 'Rescraping', startTime: refreshStartTime };

                                } else if (status === 'querying') {
                                    stepText.textContent = 'Querying';
                                    window.app.activeRefreshes[activeKey_metric] = { label: 'Querying', startTime: refreshStartTime };

                                } else if (status === 'consensus') {
                                    stepText.textContent = 'Consensus';
                                    window.app.activeRefreshes[activeKey_metric] = { label: 'Consensus', startTime: refreshStartTime };

                                }
                                
                                // Check for value changes and animate immediately
                                const oldOffer = app.offers[offerId];
                                if (oldOffer) {
                                    for (const [fieldName, newValue] of Object.entries(updatedOffer.details)) {
                                        // Special handling for bonus field - maintain container structure by re-rendering
                                        if (fieldName === 'bonus_to_be_received') {
                                            // Preserve current overlay state before re-render
                                            const prevText = stepText ? stepText.textContent : '';
                                            const activeRefresh = window.app.activeRefreshes[activeKey_metric];
                                            const elapsed = activeRefresh ? Date.now() - activeRefresh.startTime : 0;
                                            // Update the offer in app state
                                            app.offers[offerId] = updatedOffer;
                                            // Re-render the detail view to ensure the green container and skeleton are correct
                                            renderDetailView(updatedOffer);
                                            // Initialize spinners after re-render
                                            setTimeout(initializeSpinners, 0);
                                            // Re-acquire elements and keep overlay visible with previous text and spinner rotation
                                            const newTile = document.querySelector(`.metric-tile[data-offer-id="${offerId}"][data-field="${fieldName}"]`);
                                            if (newTile) {
                                                const newProgressDiv = newTile.querySelector('.refresh-progress');
                                                const newStep = newTile.querySelector('.refresh-progress .text-xs:last-child');
                                                const newSpinner = newTile.querySelector('.spinner-continuous');
                                                if (newProgressDiv) newProgressDiv.classList.remove('hidden');
                                                if (newStep && prevText) newStep.textContent = prevText;
                                                if (newSpinner && activeRefresh && activeRefresh.startTime) {
                                                    // Restart the spinner animation with the same start time
                                                    const spinnerId = window.spinnerManager.startSpinner(newSpinner, activeRefresh.startTime);
                                                    newSpinner.dataset.spinnerId = spinnerId;
                                                }
                                                // Update local refs
                                                stepText = newStep || stepText;
                                            }
                                            // Continue polling
                                            setTimeout(pollForUpdate, 500);
                                            return;
                                        }
                                        const oldValue = oldOffer.details[fieldName];
                                        if (oldValue && newValue !== oldValue) {
                                            const metricValue = document.querySelector(`[data-field="${fieldName}"].metric-value`);
                                            if (metricValue) {
                                                const formattedValue = formatValue(newValue, getValueType(fieldName), { fieldName, offerStatus: updatedOffer.status });
                                                animateValue(metricValue, formattedValue);
                                            }
                                            
                                            // Special handling for considerations
                                            if (fieldName === 'additional_considerations') {
                                                const considerationsContainer = document.querySelector(`[data-field="${fieldName}"].considerations-container`);
                                                if (considerationsContainer) {
                                                    const contentDiv = considerationsContainer.querySelector('div:not(.refresh-progress):not(.flex)');
                                                    if (contentDiv) {
                                                        const newContentHtml = createConsiderationsContent(newValue, updatedOffer.status);
                                                        animateConsiderationsLineByLine(contentDiv, newContentHtml);
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                                
                                // Update the offer in app state
                                app.offers[offerId] = updatedOffer;
                                
                                // Continue polling every 500ms during refresh
                                setTimeout(pollForUpdate, 500);
                                                            } else {

                                    // If we haven't seen any refresh status yet, keep polling briefly
                                    if (!seenRefreshStatus && (Date.now() - refreshStartTime) < 2000) {
                                        setTimeout(pollForUpdate, 200);
                                        return;
                                    }
                                    // Check if the progress div is still visible (user hasn't navigated away)
                                    if (!progressDiv.classList.contains('hidden')) {
                                        // Complete - show completion state for a moment
                                        stepText.textContent = 'Complete!';
                                        window.app.activeRefreshes[activeKey_metric] = { label: 'Complete!', startTime: refreshStartTime };


                                        const finalUpdate = () => {
                                            // Check for any values that changed during processing
                                            const oldOffer = app.offers[offerId];
                                            if (oldOffer) {
                                                for (const [fieldName, newValue] of Object.entries(updatedOffer.details)) {
                                                    const oldValue = oldOffer.details[fieldName];
                                                    // Animate any value change during processing, not just from "Processing..." to actual values
                                                    if (oldValue && newValue !== oldValue) {
                                                        const metricValue = document.querySelector(`[data-field="${fieldName}"].metric-value`);
                                                        if (metricValue) {
                                                            const formattedValue = formatValue(newValue, getValueType(fieldName), { fieldName, offerStatus: updatedOffer.status });
                                                            animateValue(metricValue, formattedValue);
                                                        }
                                                        
                                                        // Special handling for considerations
                                                        if (fieldName === 'additional_considerations') {
                                                            const considerationsContainer = document.querySelector(`[data-field="${fieldName}"].considerations-container`);
                                                            if (considerationsContainer) {
                                                                const contentDiv = considerationsContainer.querySelector('div:not(.refresh-progress):not(.flex)');
                                                                if (contentDiv) {
                                                                    // Re-render the considerations content
                                                                    const newContentHtml = createConsiderationsContent(newValue, updatedOffer.status);
                                                                    animateConsiderationsLineByLine(contentDiv, newContentHtml);
                                                                }
                                                            }
                                                        }
                                                    
                                                    // Handle bank name and account title animations (bonus is re-rendered below)
                                                    if (fieldName === 'bank_name' || fieldName === 'account_title') {
                                                        const formattedValue = formatValue(newValue, getValueType(fieldName), { fieldName, offerStatus: updatedOffer.status });
                                                        
                                                        // Animate elements with data-field attribute
                                                        const elements = document.querySelectorAll(`[data-field="${fieldName}"]`);
                                                        elements.forEach(element => {
                                                            animateValue(element, formattedValue);
                                                        });
                                                    }
                                                }
                                            }
                                        }
                                        
                                        // Stop the spinner animation
                                        const oldSpinner = tile.querySelector('.spinner-continuous');
                                        if (oldSpinner && oldSpinner.dataset.spinnerId) {
                                            window.spinnerManager.stopSpinner(oldSpinner.dataset.spinnerId);
                                        }
                                        
                                        // Clear active refresh BEFORE updating offer and re-rendering
                                        if (window.app && window.app.activeRefreshes) {
                                            delete window.app.activeRefreshes[activeKey_metric];
                                        }
                                        
                                        app.offers[offerId] = updatedOffer;
                                        renderDetailView(updatedOffer);
                                        // Initialize spinners after re-render
                                        setTimeout(initializeSpinners, 0);
                                    };

                                    // Check if the view is still active before updating
                                    if (document.getElementById(`detail-view`).offsetParent !== null) {
                                        setTimeout(finalUpdate, 1000);
                                    } else {
                                        finalUpdate();
                                    }
                                }
                            }
                        } catch (error) {
                            console.error('Error polling for update:', error);
                            
                            // Show error completion state briefly before hiding
                            stepText.textContent = 'Error';
                            
                            setTimeout(() => {

                                // Stop the spinner animation
                                const oldSpinner = tile.querySelector('.spinner-continuous');
                                if (oldSpinner && oldSpinner.dataset.spinnerId) {
                                    window.spinnerManager.stopSpinner(oldSpinner.dataset.spinnerId);
                                }
                                progressDiv.classList.add('hidden');
                                refreshButton.style.display = 'block';
                                refreshButton.style.opacity = '0';
                                if (window.app && window.app.activeRefreshes) {
                                    delete window.app.activeRefreshes[activeKey_metric];
                                }
                            }, 1000);
                        }
                    };
                    
                    pollForUpdate();
                    
                } catch (error) {
                    console.error('Error refreshing field:', error);

                    // Stop the spinner animation
                    const oldSpinner = tile.querySelector('.spinner-continuous');
                    if (oldSpinner && oldSpinner.dataset.spinnerId) {
                        window.spinnerManager.stopSpinner(oldSpinner.dataset.spinnerId);
                    }
                    progressDiv.classList.add('hidden');
                    refreshButton.style.display = 'block';
                    refreshButton.style.opacity = '0';
                    if (window.app && window.app.activeRefreshes) {
                        delete window.app.activeRefreshes[activeKey_metric];
                    }
                    
                    // Show error message to user
                    alert(`Failed to refresh field: ${error.message}`);
                }
            });
        });

        // Add hover functionality for considerations container
        document.querySelectorAll('.considerations-container').forEach(container => {
            const fieldName = container.dataset.field;
            const offerId = container.dataset.offerId;
            const refreshButton = container.querySelector('.refresh-button');
            const progressDiv = container.querySelector('.refresh-progress');
            const offer = app.offers[offerId];

            // Only show refresh button if offer is not in processing state
            if (offer && offer.status !== 'processing') {
                refreshButton.style.display = 'block';
                
                container.addEventListener('mouseenter', () => {
                    refreshButton.style.opacity = '1';
                });

                container.addEventListener('mouseleave', () => {
                    refreshButton.style.opacity = '0';
                });
            }

            refreshButton.addEventListener('click', async (e) => {
                e.stopPropagation();
                
                // Show progress and hide button

                progressDiv.classList.remove('hidden');
                refreshButton.style.display = 'none';
                // Track active refresh so overlay persists across re-renders
                window.app.activeRefreshes = window.app.activeRefreshes || {};
                const activeKey_cons = `${offerId}:${fieldName}`;
                const refreshStartTime = Date.now();
                window.app.activeRefreshes[activeKey_cons] = { label: 'Starting...', startTime: refreshStartTime };
                
                const stepText = container.querySelector('.refresh-progress .text-xs:last-child');
                const spinner = container.querySelector('.spinner-continuous');
                
                // Start the spinner animation
                if (spinner) {
                    const spinnerId = window.spinnerManager.startSpinner(spinner, refreshStartTime);
                    spinner.dataset.spinnerId = spinnerId;
                }
                
                // Update text for step 1 (rescraping)
                stepText.textContent = 'Starting...';

                
                try {
                    // Grace period to avoid race where backend hasn't set refresh_status yet
                    const refreshStartTime = Date.now();
                    let seenRefreshStatus = false;

                    const response = await fetch(`${API_URL}/${offerId}/refresh`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ field: fieldName })
                    });
                    
                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({}));
                        throw new Error(errorData.error || `Refresh failed (HTTP ${response.status})`);
                    }
                    
                    // Poll for updates with progress tracking
                    const pollForUpdate = async () => {
                        try {

                            const offerResponse = await fetch(`${API_URL}/${offerId}`);
                            const updatedOffer = await offerResponse.json();

                            
                            if (updatedOffer.refresh_status && updatedOffer.refresh_status[fieldName]) {
                                seenRefreshStatus = true;
                                // Update text based on actual status
                                const status = updatedOffer.refresh_status[fieldName];
                                if (status === 'rescraping') {
                                    stepText.textContent = 'Rescraping';
                                    window.app.activeRefreshes[activeKey_cons] = { label: 'Rescraping', startTime: refreshStartTime };

                                } else if (status === 'querying') {
                                    stepText.textContent = 'Querying';
                                    window.app.activeRefreshes[activeKey_cons] = { label: 'Querying', startTime: refreshStartTime };

                                } else if (status === 'consensus') {
                                    stepText.textContent = 'Consensus';
                                    window.app.activeRefreshes[activeKey_cons] = { label: 'Consensus', startTime: refreshStartTime };

                                }
                                
                                // Check for value changes and animate immediately
                                const oldOffer = app.offers[offerId];
                                if (oldOffer) {
                                    for (const [fieldName, newValue] of Object.entries(updatedOffer.details)) {
                                        const oldValue = oldOffer.details[fieldName];
                                        if (oldValue && newValue !== oldValue) {
                                            const metricValue = document.querySelector(`[data-field="${fieldName}"].metric-value`);
                                            if (metricValue) {
                                                const formattedValue = formatValue(newValue, getValueType(fieldName), { fieldName, offerStatus: updatedOffer.status });
                                                animateValue(metricValue, formattedValue);
                                            }
                                            
                                            // Special handling for considerations
                                            if (fieldName === 'additional_considerations') {
                                                const considerationsContainer = document.querySelector(`[data-field="${fieldName}"].considerations-container`);
                                                if (considerationsContainer) {
                                                    const contentDiv = considerationsContainer.querySelector('div:not(.refresh-progress):not(.flex)');
                                                    if (contentDiv) {
                                                        const newContentHtml = createConsiderationsContent(newValue, updatedOffer.status);
                                                        animateConsiderationsLineByLine(contentDiv, newContentHtml);
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                                
                                // Update the offer in app state
                                app.offers[offerId] = updatedOffer;
                                
                                // Continue polling every 500ms during refresh
                                setTimeout(pollForUpdate, 500);
                                                            } else {

                                    // If we haven't seen any refresh status yet, keep polling briefly
                                    if (!seenRefreshStatus && (Date.now() - refreshStartTime) < 2000) {
                                        setTimeout(pollForUpdate, 200);
                                        return;
                                    }
                                    // Check if the progress div is still visible (user hasn't navigated away)
                                    if (!progressDiv.classList.contains('hidden')) {
                                        // Complete - show completion state for a moment
                                        stepText.textContent = 'Complete';
                                        window.app.activeRefreshes[activeKey_cons] = { label: 'Complete', startTime: refreshStartTime };
                                        // Hide overlay shortly after completion
                                        setTimeout(() => {
                                            try {
                                                progressDiv.classList.add('hidden');
                                                refreshButton.style.display = 'block';
                                                refreshButton.style.opacity = '0';
                                            } catch (_) {}
                                        }, 600);


                                        const finalUpdate = () => {
                                            // Check for any values that changed during processing
                                            const oldOffer = app.offers[offerId];
                                            if (oldOffer) {
                                                for (const [fieldName, newValue] of Object.entries(updatedOffer.details)) {
                                                    const oldValue = oldOffer.details[fieldName];
                                                    // Animate any value change during processing, not just from "Processing..." to actual values
                                                    if (oldValue && newValue !== oldValue) {
                                                        const metricValue = document.querySelector(`[data-field="${fieldName}"].metric-value`);
                                                        if (metricValue) {
                                                            const formattedValue = formatValue(newValue, getValueType(fieldName), { fieldName, offerStatus: updatedOffer.status });
                                                            animateValue(metricValue, formattedValue);
                                                        }
                                                        
                                                        // Special handling for considerations
                                                        if (fieldName === 'additional_considerations') {
                                                            const considerationsContainer = document.querySelector(`[data-field="${fieldName}"].considerations-container`);
                                                            if (considerationsContainer) {
                                                                const contentDiv = considerationsContainer.querySelector('div:not(.refresh-progress):not(.flex)');
                                                                if (contentDiv) {
                                                                    // Re-render the considerations content
                                                                    const newContentHtml = createConsiderationsContent(newValue, updatedOffer.status);
                                                                    animateConsiderationsLineByLine(contentDiv, newContentHtml);
                                                                }
                                                            }
                                                        }
                                                    
                                                    // Handle bonus amount, bank name, and account title animations
                                                    if (fieldName === 'bonus_to_be_received' || fieldName === 'bank_name' || fieldName === 'account_title') {
                                                        const formattedValue = formatValue(newValue, getValueType(fieldName), { fieldName, offerStatus: updatedOffer.status });
                                                        
                                                        // Animate elements with data-field attribute
                                                        const elements = document.querySelectorAll(`[data-field="${fieldName}"]`);
                                                        elements.forEach(element => {
                                                            animateValue(element, formattedValue);
                                                        });
                                                    }
                                                }
                                            }
                                        }
                                        
                                        app.offers[offerId] = updatedOffer;
                                        renderDetailView(updatedOffer);
                                        // Initialize spinners after re-render
                                        setTimeout(initializeSpinners, 0);
                                    };

                                    // Check if the view is still active before updating
                                    if (document.getElementById(`detail-view`).offsetParent !== null) {
                                        setTimeout(finalUpdate, 750);
                                    } else {
                                        finalUpdate();
                                    }
                                    // Stop the spinner animation
                                    const oldSpinner = container.querySelector('.spinner-continuous');
                                    if (oldSpinner && oldSpinner.dataset.spinnerId) {
                                        window.spinnerManager.stopSpinner(oldSpinner.dataset.spinnerId);
                                    }
                                    
                                    // After showing completion briefly, clear active refresh tracking
                                    setTimeout(() => {
                                        if (window.app && window.app.activeRefreshes) {
                                            delete window.app.activeRefreshes[activeKey_cons];
                                        }
                                    }, 1000);
                                }
                            }
                        } catch (error) {
                            console.error('Error polling for update:', error);
                            
                            // Show error completion state briefly before hiding
                            stepText.textContent = 'Error';
                            
                            setTimeout(() => {

                                // Stop the spinner animation
                                const oldSpinner = container.querySelector('.spinner-continuous');
                                if (oldSpinner && oldSpinner.dataset.spinnerId) {
                                    window.spinnerManager.stopSpinner(oldSpinner.dataset.spinnerId);
                                }
                                progressDiv.classList.add('hidden');
                                refreshButton.style.display = 'block';
                                refreshButton.style.opacity = '0';
                                if (window.app && window.app.activeRefreshes) {
                                    delete window.app.activeRefreshes[activeKey_cons];
                                }
                            }, 1000);
                        }
                    };
                    
                    pollForUpdate();
                    
                } catch (error) {
                    console.error('Error refreshing field:', error);

                    // Stop the spinner animation
                    const oldSpinner = container.querySelector('.spinner-continuous');
                    if (oldSpinner && oldSpinner.dataset.spinnerId) {
                        window.spinnerManager.stopSpinner(oldSpinner.dataset.spinnerId);
                    }
                    progressDiv.classList.add('hidden');
                    refreshButton.style.display = 'block';
                    refreshButton.style.opacity = '0';
                    if (window.app && window.app.activeRefreshes) {
                        delete window.app.activeRefreshes[activeKey_cons];
                    }
                    
                    // Show error message to user
                    alert(`Failed to refresh field: ${error.message}`);
                }
            });
        });
        
        // After rendering, update the hidden tiles indicator
        updateHiddenTilesIndicator();
    };

    // Function to update the hidden tiles indicator
    const updateHiddenTilesIndicator = () => {
        const hiddenTiles = document.querySelectorAll('.metric-tile-na.hidden');
        const indicator = document.getElementById('hidden-tiles-indicator');
        const countElement = document.getElementById('hidden-tiles-count');
        const namesContainer = document.getElementById('hidden-tiles-names');
        
        if (hiddenTiles.length > 0) {
            indicator.classList.remove('hidden');
            countElement.textContent = hiddenTiles.length;
            
            // Clear and populate the names
            namesContainer.innerHTML = '';
            hiddenTiles.forEach(tile => {
                const label = tile.getAttribute('data-label');
                if (label) {
                    const nameTag = document.createElement('span');
                    nameTag.className = 'bg-gray-200 text-gray-700 px-2 py-1 rounded-full text-xs';
                    nameTag.textContent = label;
                    namesContainer.appendChild(nameTag);
                }
            });
        } else {
            indicator.classList.add('hidden');
        }
    };

    // Function to toggle the hidden tiles list visibility
    window.toggleHiddenTiles = () => {
        const list = document.getElementById('hidden-tiles-list');
        const chevron = document.getElementById('hidden-tiles-chevron');
        
        if (list.classList.contains('expanded')) {
            list.classList.remove('expanded');
            chevron.style.transform = 'rotate(0deg)';
        } else {
            list.classList.add('expanded');
            chevron.style.transform = 'rotate(180deg)';
        }
    };

    const showListView = () => {
        app.detailView.classList.add('hidden');
        app.listView.classList.remove('hidden');
        renderOfferList();
        
        // Auto-focus the URL input field for better UX
        setTimeout(() => {
            app.urlInput.focus();
        }, 100);
    };

    const showDetailView = async (offerId) => {
        app.listView.classList.add('hidden');
        app.detailView.classList.remove('hidden');
        
        const offer = app.offers[offerId];
        if (offer) {
            renderDetailView(offer);
        } else {
            app.detailView.innerHTML = `<div class="space-y-8 pt-8"><div class="skeleton-loader h-12 w-3/4"></div><div class="skeleton-loader h-48 w-full"></div><div class="skeleton-loader h-32 w-full"></div></div>`;
            try {
                const response = await fetch(`${API_URL}/${offerId}`);
                if (!response.ok) {
                    // Show brief message and redirect to home page if offer doesn't exist
                    window.location.hash = '';
                    window.history.replaceState(null, '', window.location.pathname);
                    
                    // Show a brief notification to the user
                    setTimeout(() => {
                        const existingAlert = document.querySelector('.temp-alert');
                        if (!existingAlert) {
                            const alert = document.createElement('div');
                            alert.className = 'temp-alert fixed top-4 right-4 bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 rounded shadow-lg z-50';
                            alert.innerHTML = `
                                <div class="flex">
                                    <div class="flex-shrink-0">
                                        <svg class="h-5 w-5 text-yellow-500" viewBox="0 0 20 20" fill="currentColor">
                                            <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
                                        </svg>
                                    </div>
                                    <div class="ml-3">
                                        <p class="text-sm">Offer not found. Redirected to home page.</p>
                                    </div>
                                </div>
                            `;
                            document.body.appendChild(alert);
                            
                            // Remove the alert after 4 seconds
                            setTimeout(() => {
                                if (alert.parentNode) {
                                    alert.parentNode.removeChild(alert);
                                }
                            }, 4000);
                        }
                    }, 100);
                    return;
                }
                const fetchedOffer = await response.json();
                app.offers[offerId] = fetchedOffer;
                renderDetailView(fetchedOffer);
            } catch (error) {
                // Show brief message and redirect to home page if there's an error
                console.error(`Error loading offer ${offerId}:`, error);
                window.location.hash = '';
                window.history.replaceState(null, '', window.location.pathname);
                
                // Show a brief notification to the user
                setTimeout(() => {
                    const existingAlert = document.querySelector('.temp-alert');
                    if (!existingAlert) {
                        const alert = document.createElement('div');
                        alert.className = 'temp-alert fixed top-4 right-4 bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded shadow-lg z-50';
                        alert.innerHTML = `
                            <div class="flex">
                                <div class="flex-shrink-0">
                                    <svg class="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
                                    </svg>
                                </div>
                                <div class="ml-3">
                                    <p class="text-sm">Error loading offer. Redirected to home page.</p>
                                </div>
                            </div>
                        `;
                        document.body.appendChild(alert);
                        
                        // Remove the alert after 4 seconds
                        setTimeout(() => {
                            if (alert.parentNode) {
                                alert.parentNode.removeChild(alert);
                            }
                        }, 4000);
                    }
                }, 100);
            }
        }
    };

    // --- DATA ACTIONS & ROUTING ---
    const scheduleNextFetch = () => {
        // Check if any offers are processing or if any refresh operations are in progress
        const isProcessing = Object.values(app.offers).some(offer => offer.status === 'processing');
        const isRefreshing = (
            (Object.values(app.offers).some(offer => offer.refresh_status && 
                Object.values(offer.refresh_status).some(status => status === 'rescraping' || status === 'querying' || status === 'consensus')))
            || (window.app && window.app.refreshActiveCount > 0)
        );
        

        
        // Fast polling during processing/rescraping, otherwise no polling
        if (isProcessing || isRefreshing) {
            setTimeout(fetchAllOffers, 500);
        }
    };

    const removeSkeletonLoaders = (el) => {
        if (!el) return;
        // 1. Remove any skeletons inside the element (legacy case)
        el.querySelectorAll('.skeleton-loader').forEach(s => s.remove());
        // 2. Remove skeleton siblings directly after or before the element
        const maybeRemoveSibling = (sibling) => {
            if (sibling && sibling.classList && sibling.classList.contains('skeleton-loader')) {
                sibling.remove();
            }
        };
        maybeRemoveSibling(el.nextElementSibling);
        maybeRemoveSibling(el.previousElementSibling);
    };

    // Detect whether a formatted value should be treated as N/A
    const isNAFormattedValue = (value) => {
        if (value === null || value === undefined) return true;
        const lower = String(value).toLowerCase();
        return (
            lower === 'n/a' ||
            lower.includes('<span') && lower.includes('n/a')
        );
    };

    // Toggle a metric tile's visibility based on the provided formatted value
    const updateMetricTileVisibility = (element, formattedValue) => {
        if (!element || !element.classList || !element.classList.contains('metric-value')) return;
        const tile = element.closest('.metric-tile');
        if (!tile) return;
        const shouldHide = isNAFormattedValue(formattedValue);
        if (shouldHide) {
            tile.classList.add('metric-tile-na', 'hidden');
        } else {
            tile.classList.remove('metric-tile-na', 'hidden');
        }
        if (typeof updateHiddenTilesIndicator === 'function') {
            updateHiddenTilesIndicator();
        }
    };

    const animateValue = (element, newValue) => {
        if (!element) return;
        
        // Add animation class for visual feedback
        element.classList.add('fade-in-glide-up');
        
        // Swap in the real value
        element.innerHTML = newValue;
        // If this is a metric tile value, update tile hidden/visible state immediately
        updateMetricTileVisibility(element, newValue);
        
        // Remove any skeleton loaders that were children of this element
        removeSkeletonLoaders(element);
        
        // Clean-up animation class after it finishes
        setTimeout(() => {
            element.classList.remove('fade-in-glide-up');
        }, 600);
    };

    const animatePercentage = (startValue, endValue, element) => {
        if (!element) return;
        
        const duration = 1000; // 1 second duration
        const startTime = performance.now();
        
        const easeOutCubic = (t) => {
            return 1 - Math.pow(1 - t, 2);
        };
        
        const updatePercentage = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easedProgress = easeOutCubic(progress);
            
            const currentValue = Math.round(startValue + (endValue - startValue) * easedProgress);
            element.textContent = `${currentValue}%`;
            
            if (progress < 1) {
                requestAnimationFrame(updatePercentage);
            }
        };
        
        requestAnimationFrame(updatePercentage);
    };

    // Helper function to find the considerations content div reliably
    const findConsiderationsContentDiv = (considerationsContainer) => {
        // Try multiple selectors to find the content div
        const selectors = [
            'div:not(.refresh-progress):not(.flex)',
            'div:not(.refresh-progress)',
            'div'
        ];
        
        for (const selector of selectors) {
            const contentDiv = considerationsContainer.querySelector(selector);
            if (contentDiv && !contentDiv.classList.contains('refresh-progress') && !contentDiv.classList.contains('flex')) {
                return contentDiv;
            }
        }
        
        // If no div found, return the container itself
        return considerationsContainer;
    };

    const animateConsiderationsLineByLine = (container, newContentHtml) => {
        if (!container) return;

        // Immediately remove any skeleton loaders.
        const skeleton = container.querySelector('.skeleton-loader');
        if (skeleton) skeleton.remove();

        // Set the new content.
        container.innerHTML = newContentHtml;

        // Animate all lines simultaneously.
        const lines = container.querySelectorAll('.consideration-line');
        if (lines.length > 0) {
            lines.forEach((line) => {
                line.style.opacity = '0';
                // Add animation class immediately for all lines at the same time
                line.classList.add('fade-in-glide-up');
            });
        }
    };



    const fetchAllOffers = async () => {
        try {
            const response = await fetch(API_URL);
            const offersData = await response.json();
            let hasChanged = false;
            
            // Check if any refresh is currently in progress
            const isRefreshInProgress = document.querySelector('.refresh-progress:not(.hidden)') !== null;
            
            // Check for changes and animate individual values
            for (const newOffer of offersData) {
                const oldOffer = app.offers[newOffer.id];
                if (oldOffer) {
                    // Check if any individual values have changed during processing
                    for (const [fieldName, newValue] of Object.entries(newOffer.details)) {
                        const oldValue = oldOffer.details[fieldName];
                        // Animate any value change during processing, including from "Processing..." to actual values
                        const isProcessingToValue = String(oldValue).toLowerCase().includes('processing') && !String(newValue).toLowerCase().includes('processing');
                        const isValueChange = oldValue && newValue !== oldValue;
                        
                        if (isProcessingToValue || isValueChange) {
                            // Find the corresponding metric value element and animate it
                            const metricValue = document.querySelector(`[data-field="${fieldName}"].metric-value`);
                            if (metricValue) {
                                const formattedValue = formatValue(newValue, getValueType(fieldName), { fieldName, offerStatus: newOffer.status });
                                animateValue(metricValue, formattedValue);
                            }
                            
                            // Special handling for considerations
                            if (fieldName === 'additional_considerations') {
                                const considerationsContainer = document.querySelector(`[data-field="${fieldName}"].considerations-container`);
                                if (considerationsContainer) {
                                    const contentDiv = findConsiderationsContentDiv(considerationsContainer);
                                    if (contentDiv) {
                                        // Re-render the considerations content with line-by-line animation
                                        const newContentHtml = createConsiderationsContent(newValue, newOffer.status);
                                        animateConsiderationsLineByLine(contentDiv, newContentHtml);
                                    }
                                }
                            }
                            
                            // Handle bonus amount, bank name, and account title animations
                            if (fieldName === 'bonus_to_be_received' || fieldName === 'bank_name' || fieldName === 'account_title') {
                                // Special handling for bonus field - re-render the entire detail view
                                if (fieldName === 'bonus_to_be_received') {
                                    // Update the offer in app state
                                    app.offers[newOffer.id] = newOffer;
                                    
                                    // Re-render the detail view to show the updated bonus
                                    renderDetailView(newOffer);
                                    
                                    // Continue polling
                                    setTimeout(fetchAllOffers, 500);
                                    return;
                                }
                                
                                const formattedValue = formatValue(newValue, getValueType(fieldName), { fieldName, offerStatus: newOffer.status });
                                
                                // Animate all elements with the data-field attribute
                                const elements = document.querySelectorAll(`[data-field="${fieldName}"]`);
                                elements.forEach((element, index) => {
                                    animateValue(element, formattedValue);
                                });
                                
                                // Also animate elements by their content patterns (for elements without data-field)
                                const allElements = document.querySelectorAll('p, h1, h2, h3, span');
                                allElements.forEach(element => {
                                    const currentText = element.textContent || element.innerHTML;
                                    if (currentText.includes(oldValue) && !element.classList.contains('metric-value')) {
                                        const newFormattedValue = formatValue(newValue, getValueType(fieldName), { fieldName, offerStatus: newOffer.status });
                                        animateValue(element, newFormattedValue);
                                    }
                                });
                            }
                        }
                    }
                    
                    // Update progress bar for processing offers
                    if (newOffer.status === 'processing' && oldOffer.status === 'processing') {
                        const progressBar = document.getElementById('processing-progress-bar');
                        if (progressBar) {
                            // Determine if this is a manual mode offer
                            const isManualMode = newOffer.url && newOffer.url.startsWith('manual-content-');
                            const steps = isManualMode ? TEXT_CONTENT.manualProcessingSteps : TEXT_CONTENT.processingSteps;
                            


                            let currentStepIndex = steps.indexOf(newOffer.processing_step);
                            
                            // If exact match not found, try to find partial match
                            if (currentStepIndex === -1) {
                                currentStepIndex = steps.findIndex(step => 
                                    newOffer.processing_step && newOffer.processing_step.toLowerCase().startsWith(step.toLowerCase())
                                );
                            }
                            
                            // If still not found, try case-insensitive exact match
                            if (currentStepIndex === -1) {
                                currentStepIndex = steps.findIndex(step => 
                                    newOffer.processing_step && newOffer.processing_step.toLowerCase() === step.toLowerCase()
                                );
                            }
                            
                            // Special handling for backend/frontend step name mismatch
                            if (currentStepIndex === -1 && newOffer.processing_step === "Validating Content" && !isManualMode) {
                                // Backend is sending "Validating Content" for URL mode, map it to "Validating Offer"
                                currentStepIndex = steps.indexOf("Validating Offer");
                            }
                            
                            // If still not found, handle error states or default to 0
                            if (currentStepIndex === -1) {
                                // Handle error states that aren't in the normal flow
                                if (newOffer.processing_step === "Validation Failed" || 
                                    newOffer.processing_step === "Scraping Failed" || 
                                    newOffer.processing_step === "Processing Error") {
                                    // For error states, show as the last step before "Done"
                                    currentStepIndex = steps.length - 2; // Second to last step
                                } else {
                                    currentStepIndex = 0;
                                }
                            }
                            const progressPercentage = newOffer.processing_step === "Done" ? 100 : ((currentStepIndex + 1) / steps.length) * 100;
                            

                            
                            progressBar.style.width = `${progressPercentage}%`;
                            
                            // Animate the percentage display
                            const percentageDisplay = document.querySelector('.text-2xl.font-bold.text-blue-900');
                            if (percentageDisplay) {
                                const currentPercentage = parseFloat(percentageDisplay.textContent) || 0;
                                const targetPercentage = Math.round(progressPercentage);
                                
                                if (currentPercentage !== targetPercentage) {
                                    animatePercentage(currentPercentage, targetPercentage, percentageDisplay);
                                }
                            }
                            
                            // Update the step text
                            const stepText = document.querySelector('.text-sm.text-blue-700 .font-medium');
                            if (stepText) {
                                stepText.textContent = newOffer.processing_step;
                            }
                            
                            // Update the step counter
                            const stepCounter = document.querySelector('.step-counter');
                            if (stepCounter) {
                                stepCounter.textContent = `Step ${currentStepIndex + 1} of ${steps.length}`;
                            }
                        }
                    }
                    
                    // Handle completion of processing
                    if (oldOffer.status === 'processing' && newOffer.status !== 'processing') {
                        // Fade out the progress bar smoothly
                        const progressContainer = document.querySelector('.bg-gradient-to-r.from-blue-50.to-indigo-50');
                        if (progressContainer) {
                            progressContainer.style.transition = 'opacity 0.5s ease-out';
                            progressContainer.style.opacity = '0';
                            
                            // Remove the progress bar after fade-out
                            setTimeout(() => {
                                if (progressContainer.parentNode) {
                                    progressContainer.parentNode.removeChild(progressContainer);
                                }
                            }, 500);
                        }
                        
                        // Processing is complete, immediately replace all skeleton placeholders
                        for (const [fieldName, newValue] of Object.entries(newOffer.details)) {
                            const oldValue = oldOffer.details[fieldName];
                            const isProcessingToValue = String(oldValue).toLowerCase().includes('processing') && !String(newValue).toLowerCase().includes('processing');
                            const isValueChange = oldValue && newValue !== oldValue;
                            
                            if (isProcessingToValue || isValueChange) {
                                const elements = document.querySelectorAll(`[data-field="${fieldName}"]`);
                                elements.forEach((element, index) => {
                                    const formattedValue = formatValue(newValue, getValueType(fieldName), { fieldName, offerStatus: newOffer.status });
                                    animateValue(element, formattedValue);
                                });
                            }
                        }
                        
                        // Trigger a full re-render to ensure all skeleton placeholders are replaced
                        setTimeout(() => {
                            handleRouteChange();
                        }, 600); // Increased delay to allow fade-out animation to complete
                    }
                }
            }
            
            if (offersData.length !== Object.keys(app.offers).length) {
                hasChanged = true;
            } else {
                for (const offer of offersData) {
                    if (JSON.stringify(app.offers[offer.id]) !== JSON.stringify(offer)) {
                        hasChanged = true;
                        break;
                    }
                }
            }

            if (hasChanged) {
                // Check if any processing offers have completed BEFORE updating app.offers
                const hasProcessingCompleted = offersData.some(offer => {
                    const oldOffer = app.offers[offer.id];
                    const completed = oldOffer && oldOffer.status === 'processing' && offer.status !== 'processing';
                    if (completed) {
                    }
                    return completed;
                });
                
                offersData.forEach(offer => { app.offers[offer.id] = offer; });
                
                // Re-render if:
                // 1. No refresh is in progress AND current offer is not processing, OR
                // 2. A processing offer has completed (to show final results)
                const currentOffer = window.location.hash.startsWith('#/offer/') ? 
                    app.offers[parseInt(window.location.hash.split('/')[2], 10)] : null;
                
                // Always re-render when processing completes, regardless of other conditions
                if (hasProcessingCompleted) {
                    handleRouteChange();
                } else if (!isRefreshInProgress && (!currentOffer || currentOffer.status !== 'processing')) {
                    handleRouteChange();
                }
            }
        } catch (error) {
            console.error('Error fetching offers:', error);
        } finally {
            scheduleNextFetch();
        }
    };
    
    const getCurrentStatusKey = (offer) => {
        if (offer.user_controlled && offer.user_controlled.received) return 'received';
        if (offer.user_controlled && offer.user_controlled.deposited) return 'deposited';
        if (offer.user_controlled && offer.user_controlled.opened) return 'opened';
        return 'unopened';
    };

    // Global lock to prevent simultaneous API calls to the same offer
    const offerUpdateLocks = new Set();
    
    // Debounce status updates to prevent rapid successive calls
    let statusUpdateTimeout = null;
    
    const showTierSelectionModal = (tiers, offer) => {
        return new Promise((resolve) => {
            const details = offer.details || {};
            const mainBonusAmount = parseBonusAmount(details.bonus_to_be_received);
            const tierSum = tiers.reduce((sum, t) => sum + t.bonus, 0);
            
            // Check if main bonus amount is higher than tier sum (indicating a maximum tier)
            const hasMaximumTier = mainBonusAmount > tierSum + 10; // Allow small rounding differences
            
            // Create tier options
            const tierOptions = tiers.map(tier => {
                // Format deposit requirement based on whether it's numeric or descriptive
                let depositText;
                if (tier.depositDescription) {
                    depositText = shortenTierDescription(tier.depositDescription);
                } else if (tier.deposit === 0) {
                    depositText = "See requirements";
                } else if (typeof tier.deposit === 'number') {
                    depositText = `$${tier.deposit.toLocaleString()} deposit`;
                } else {
                    depositText = shortenTierDescription(String(tier.deposit));
                }
                
                return `
                    <label class="flex items-center p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                        <input type="radio" name="selected-tier" value="${tier.tier}" class="mr-3 text-blue-600 focus:ring-blue-500">
                        <div class="flex-1">
                            <div class="flex justify-between items-start mb-1">
                                <span class="text-sm font-medium text-gray-700">Tier ${tier.tier}</span>
                                <span class="text-sm font-semibold text-green-600">$${tier.bonus ? tier.bonus.toLocaleString() : 'N/A'}</span>
                            </div>
                            <div class="text-xs text-gray-500">${depositText}</div>
                        </div>
                    </label>
                `;
            }).join('');
            
            // Add maximum tier option if it exists
            const maximumTierOption = hasMaximumTier ? `
                <label class="flex items-center p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer bg-blue-50 border-blue-200">
                    <input type="radio" name="selected-tier" value="maximum" class="mr-3 text-blue-600 focus:ring-blue-500">
                    <div class="flex-1">
                        <div class="flex justify-between items-start mb-1">
                            <span class="text-sm font-medium text-gray-700">Maximum Bonus</span>
                            <span class="text-sm font-semibold text-green-600">$${mainBonusAmount.toLocaleString()}</span>
                        </div>
                        <div class="text-xs text-gray-500">Complete all requirements for maximum bonus</div>
                    </div>
                </label>
            ` : '';
            
            // Create modal HTML
            const modalHTML = `
                <div id="tier-selection-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div class="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
                        <div class="p-6">
                            <div class="flex items-center justify-between mb-4">
                                <h3 class="text-lg font-semibold text-gray-900">Select Completed Tier</h3>
                                <button id="close-tier-modal" class="text-gray-400 hover:text-gray-600">
                                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                                    </svg>
                                </button>
                            </div>
                            <p class="text-sm text-gray-600 mb-4">
                                This offer has multiple bonus tiers. Please select which tier you completed to receive the correct bonus amount.
                            </p>
                            <div class="space-y-3">
                                ${tierOptions}
                                ${maximumTierOption}
                            </div>
                            <div class="flex justify-end space-x-3 mt-6">
                                <button id="cancel-tier-selection" class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">
                                    Cancel
                                </button>
                                <button id="confirm-tier-selection" class="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed" disabled>
                                    Confirm
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            // Add modal to DOM
            document.body.insertAdjacentHTML('beforeend', modalHTML);
            
            const modal = document.getElementById('tier-selection-modal');
            const closeBtn = document.getElementById('close-tier-modal');
            const cancelBtn = document.getElementById('cancel-tier-selection');
            const confirmBtn = document.getElementById('confirm-tier-selection');
            const radioButtons = document.querySelectorAll('input[name="selected-tier"]');
            
            // Handle radio button selection
            radioButtons.forEach(radio => {
                radio.addEventListener('change', () => {
                    confirmBtn.disabled = false;
                });
            });
            
            // Handle close/cancel
            const closeModal = () => {
                modal.remove();
                resolve(null);
            };
            
            closeBtn.addEventListener('click', closeModal);
            cancelBtn.addEventListener('click', closeModal);
            
            // Handle confirm
            confirmBtn.addEventListener('click', () => {
                const selectedTier = document.querySelector('input[name="selected-tier"]:checked');
                if (selectedTier) {
                    modal.remove();
                    resolve(parseInt(selectedTier.value));
                }
            });
            
            // Close on outside click
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    closeModal();
                }
            });
            
            // Close on escape key
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    closeModal();
                }
            });
        });
    };
    
    const updateOfferStatus = async (id, statusKey, triggerElement = null) => {
        // Check if this offer is already being updated
        if (offerUpdateLocks.has(id)) {

            return;
        }
        
        // Lock this offer to prevent simultaneous updates
        offerUpdateLocks.add(id);
        
        try {
            // Clear any pending status update
            if (statusUpdateTimeout) {
                clearTimeout(statusUpdateTimeout);
                statusUpdateTimeout = null;
            }
            
            // Get current status before updating
            const currentOffer = app.offers[id];
            const currentStatus = getCurrentStatusKey(currentOffer);
            
            // Check if this is marking as received and has multiple tiers
            if (statusKey === 'received') {
                const details = currentOffer.details || {};
                const tiers = parseTierData(details.bonus_tiers_detailed, details.total_deposit_by_tier);
                const hasMultipleTiers = tiers && tiers.length > 1;
                
                if (hasMultipleTiers) {
                    // Show tier selection modal
                    const selectedTier = await showTierSelectionModal(tiers, currentOffer);
                    if (selectedTier === null) {
                        // User cancelled
                        offerUpdateLocks.delete(id);
                        return;
                    }
                    // Store the selected tier
                    await fetch(`${API_URL}/${id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ field: 'selected_tier', value: selectedTier })
                    });
                }
            }
            
            // Only animate if status is actually changing
            if (currentStatus !== statusKey) {

            
            // Trigger sliding animation
            const statusDot = triggerElement ? triggerElement.querySelector('.status-dot') : document.querySelector('.status-dropdown-trigger .status-dot');
            const statusLabel = triggerElement ? triggerElement.querySelector('.status-label') : document.querySelector('.status-dropdown-trigger .status-label');
            

            
            if (statusDot && statusLabel) {

                
                // Do the API request first, then handle animations
                const updates = {
                    opened: false,
                    deposited: false,
                    received: false,
                };

                if (statusKey === 'opened') {
                    updates.opened = true;
                } else if (statusKey === 'deposited') {
                    updates.opened = true;
                    updates.deposited = true;
                } else if (statusKey === 'received') {
                    updates.opened = true;
                    updates.deposited = true;
                    updates.received = true;
                }

                try {
                    // Make sequential API calls to prevent corruption
                    for (const [field, value] of Object.entries(updates)) {
                        await fetch(`${API_URL}/${id}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ field, value })
                        });
                    }
                    
                    // Clear selected tier if changing from received to any other status
                    if (currentStatus === 'received' && statusKey !== 'received') {
                        await fetch(`${API_URL}/${id}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ field: 'selected_tier', value: null })
                        });

                        
                        // Immediately update the offer object to reflect the cleared tier
                        if (app.offers[id]) {
                            app.offers[id].user_controlled.selected_tier = null;
                        }
                    }
                    
                    const response = await fetch(`${API_URL}/${id}`);
                    const updatedOffer = await response.json();
                    app.offers[id] = updatedOffer;
                    
                    // Now do the smooth animation sequence
                    // First, slide out the current status
                    statusLabel.classList.add('status-slide-out');
                    
                    // Wait for slide out to complete, then update content and slide in
                    setTimeout(() => {
                        // Update the UI with new status
                        const newStatus = getCurrentStatusKey(updatedOffer);
                        const statuses = [
                            { key: 'unopened', label: TEXT_CONTENT.status.unopened, dotColor: '#6b7280' },
                            { key: 'opened', label: TEXT_CONTENT.status.opened, dotColor: '#f59e0b' },
                            { key: 'deposited', label: TEXT_CONTENT.status.deposited, dotColor: '#3b82f6' },
                            { key: 'received', label: TEXT_CONTENT.status.claimed, dotColor: '#22c55e' }
                        ];
                        const newStatusData = statuses.find(s => s.key === newStatus);
                        
                        if (newStatusData) {
                            statusDot.style.backgroundColor = newStatusData.dotColor;
                            statusLabel.textContent = newStatusData.label;
                            
                            // Update dropdown options to reflect new current status
                            const wrapper = triggerElement ? triggerElement.closest('.relative') : null;
                            const optionsToUpdate = wrapper ? wrapper.querySelectorAll('.status-dropdown-option') : document.querySelectorAll('.status-dropdown-option');
                            optionsToUpdate.forEach(option => {
                                const optionStatus = option.dataset.status;
                                const isCurrent = optionStatus === newStatus;
                                
                                // Update active state
                                if (isCurrent) {
                                    option.classList.add('bg-blue-50');
                                    option.innerHTML = `
                                        <div class="status-dot mr-3" style="background-color: ${newStatusData.dotColor}"></div>
                                        <span class="flex-1">${newStatusData.label}</span>
                                        <svg class="h-4 w-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path></svg>
                                    `;
                                } else {
                                    option.classList.remove('bg-blue-50');
                                    const statuses = [
                                        { key: 'unopened', label: TEXT_CONTENT.status.unopened, dotColor: '#6b7280' },
                                        { key: 'opened', label: TEXT_CONTENT.status.opened, dotColor: '#f59e0b' },
                                        { key: 'deposited', label: TEXT_CONTENT.status.deposited, dotColor: '#3b82f6' },
                                        { key: 'received', label: TEXT_CONTENT.status.claimed, dotColor: '#22c55e' }
                                    ];
                                    const optionStatusData = statuses.find(s => s.key === optionStatus);
                                    if (optionStatusData) {
                                        option.innerHTML = `
                                            <div class="status-dot mr-3" style="background-color: ${optionStatusData.dotColor}"></div>
                                            <span class="flex-1">${optionStatusData.label}</span>
                                        `;
                                    }
                                }
                            });
                            
                            // Small delay to ensure smooth transition before slide-in
                            setTimeout(() => {
                                // Now slide in the new status and pulse the dot
                                statusLabel.classList.remove('status-slide-out');
                                statusDot.classList.add('status-dot-pulse');
                                statusLabel.classList.add('status-slide-in');
                            }, 50);
                            
                            // Clean up animation classes after completion
                            setTimeout(() => {
                                statusLabel.classList.remove('status-slide-in');
                            }, 300); // 250ms + 50ms delay
                            
                            // Clean up pulse animation after it completes
                            setTimeout(() => {
                                statusDot.classList.remove('status-dot-pulse');
                            }, 550); // 500ms + 50ms delay
                            
                            // Re-render the detail view to update tier display and other UI elements
                            renderDetailView(updatedOffer);
                            
                            // Show visual feedback if tier was cleared
                            if (currentStatus === 'received' && statusKey !== 'received') {
                                // Add a brief flash to indicate tier was cleared
                                setTimeout(() => {
                                    const tierDisplays = document.querySelectorAll('.bg-white.rounded-lg.shadow-md.border.border-gray-200.p-4');
                                    tierDisplays.forEach(display => {
                                        if (display.textContent.includes('Tier Options')) {
                                            display.style.transition = 'all 0.3s ease';
                                            display.style.backgroundColor = '#fef3c7'; // Light yellow flash
                                            display.style.borderColor = '#f59e0b'; // Amber border
                                            setTimeout(() => {
                                                display.style.backgroundColor = '';
                                                display.style.borderColor = '';
                                            }, 800);
                                        }
                                    });
                                }, 100); // Small delay to ensure re-render is complete
                            }
                        }
                    }, 250); // Wait for slide out to complete
                    
                } catch (error) {
                    console.error(`Error updating status:`, error);
                    // Reset animation classes on error
                    statusLabel.classList.remove('status-slide-out', 'status-slide-in');
                }
            }
        } else {
            // Status is the same, just update normally without animation
            const updates = {
                opened: false,
                deposited: false,
                received: false,
            };

            if (statusKey === 'opened') {
                updates.opened = true;
            } else if (statusKey === 'deposited') {
                updates.opened = true;
                updates.deposited = true;
            } else if (statusKey === 'received') {
                updates.opened = true;
                updates.deposited = true;
                updates.received = true;
            }

            try {
                // Make sequential API calls to prevent corruption
                for (const [field, value] of Object.entries(updates)) {
                    await fetch(`${API_URL}/${id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ field, value })
                    });
                }
                
                // Clear selected tier if changing from received to any other status
                if (currentStatus === 'received' && statusKey !== 'received') {
                    await fetch(`${API_URL}/${id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ field: 'selected_tier', value: null })
                    });

                    
                    // Immediately update the offer object to reflect the cleared tier
                    if (app.offers[id]) {
                        app.offers[id].user_controlled.selected_tier = null;
                    }
                }
                
                const response = await fetch(`${API_URL}/${id}`);
                const updatedOffer = await response.json();
                app.offers[id] = updatedOffer;
                renderDetailView(updatedOffer);
            } catch (error) {
                console.error(`Error updating status:`, error);
            }
        }
    } catch (error) {
        console.error(`Error in updateOfferStatus:`, error);
    } finally {
        // Always unlock the offer when done
        offerUpdateLocks.delete(id);
    }
    };

    const deleteOffer = async (e) => {
        const id = e.target.dataset.id;
        if (confirm(TEXT_CONTENT.detail.deleteConfirmation)) {
            try {
                await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
                delete app.offers[id];
                window.location.hash = '';
                // Fetch all offers to update the list
                await fetchAllOffers();
            } catch (error) {
                console.error('Error deleting offer:', error);
                alert('Failed to delete the offer.');
            }
        }
    };

    const refreshAllData = async (e) => {
        const id = parseInt(e.target.dataset.id);
        
        if (isNaN(id)) {
            alert('Invalid offer ID.');
            return;
        }
        
        const offer = app.offers[id];
        
        if (!offer) {
            alert('Offer not found.');
            return;
        }

        // Don't allow refresh if already processing
        if (offer.status === 'processing') {
            alert('Offer is already being processed. Please wait for it to complete.');
            return;
        }

        if (confirm('This will re-process the entire offer from scratch. This may take a minute. Continue?')) {
            try {
                
                // Show processing state and reset all fields to skeletons
                offer.status = 'processing';
                offer.processing_step = 'Scraping Website';
                
                // Start polling immediately for refresh operations
                scheduleNextFetch();
                
                // Reset all details to Processing... state
                offer.details = {
                    bank_name: 'Processing...',
                    account_title: 'Processing...',
                    bonus_to_be_received: 'Processing...',
                    initial_deposit_amount: 'Processing...',
                    minimum_deposit_amount: 'Processing...',
                    num_required_deposits: 'Processing...',
                    deal_expiration_date: 'Processing...',
                    minimum_monthly_fee: 'Processing...',
                    fee_is_conditional: 'Processing...',
                    minimum_daily_balance_required: 'Processing...',
                    days_for_deposit: 'Processing...',
                    days_for_bonus: 'Processing...',
                    must_be_open_for: 'Processing...',
                    clawback_clause_present: 'Processing...',
                    clawback_details: 'Processing...',
                    total_deposit_required: 'Processing...',
                    bonus_tiers: 'Processing...',
                    additional_considerations: 'Processing...'
                };
                
                // Clear any existing refresh status
                if (offer.refresh_status) {
                    delete offer.refresh_status;
                }
                
                // Re-render to show processing state with skeletons
                renderDetailView(offer);
                
                // Start the refresh process
                const requestBody = { refresh_offer_id: id };
                
                requestBody.url = offer.url;
                
                const response = await fetch(`${API_URL}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody)
                });
                
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.error || `Failed to refresh offer (HTTP ${response.status})`);
                }
                
                // Poll for updates
                const pollForUpdate = async () => {
                    try {
                        const offerResponse = await fetch(`${API_URL}/${id}`);
                        if (!offerResponse.ok) {
                            throw new Error('Failed to fetch offer status');
                        }
                        
                        const updatedOffer = await offerResponse.json();
                        
                        // Update the offer in app state
                        app.offers[id] = updatedOffer;
                        
                        if (updatedOffer.status === 'processing') {
                            // Still processing - automatic polling disabled
                            // setTimeout(pollForUpdate, 1000);
                        } else if (updatedOffer.status === 'completed') {
                            // Processing complete, re-render
                            renderDetailView(updatedOffer);
                        } else if (updatedOffer.status === 'failed') {
                            // Processing failed
                            alert('Failed to refresh the offer. Please try again.');
                            renderDetailView(updatedOffer);
                        }
                    } catch (error) {
                        console.error('Error polling for updates:', error);
                        alert('Error checking offer status. Please refresh the page.');
                        
                        // Reset offer status on error
                        offer.status = 'completed';
                        renderDetailView(offer);
                    }
                };
                
                // Automatic polling disabled - check status manually if needed
                // setTimeout(pollForUpdate, 1000);
                
            } catch (error) {
                console.error('Error refreshing offer:', error);
                alert(`Failed to refresh the offer: ${error.message}`);
                
                // Reset offer status
                offer.status = 'completed';
                renderDetailView(offer);
            }
        }
    };
    
    const updateOfferUrl = async (offerId, newUrl) => {
        // URL validation
        const urlPattern = /^(https?:\/\/)([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(\/.*)?$/;
        if (!urlPattern.test(newUrl)) {
            alert('Please enter a valid URL starting with http:// or https://');
            return;
        }
        
        try {
            const response = await fetch(`${API_URL}/${offerId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ field: 'url', value: newUrl })
            });
            
            if (!response.ok) {
                throw new Error('Failed to update offer URL');
            }
            
            const updatedOffer = await response.json();
            app.offers[offerId] = updatedOffer;
            
            // Re-render the detail view to show the updated URL
            renderDetailView(updatedOffer);
            
        } catch (error) {
            console.error('Error updating offer URL:', error);
            alert('Failed to update the offer URL.');
        }
    };
    
    const submitUrl = async (url) => {
        if (app.submitButton.disabled) return;
        setLoadingState(true);
        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                
                // Handle duplicate offer case
                if (response.status === 409 && errorData.duplicate_offer_id) {
                    const duplicateOffer = errorData.duplicate_offer;
                    const bankName = duplicateOffer.details?.bank_name || 'Unknown Bank';
                    const accountTitle = duplicateOffer.details?.account_title || 'Unknown Account';
                    
                    const message = `This offer is already being tracked!\n\nBank: ${bankName}\nAccount: ${accountTitle}\n\nWould you like to view the existing offer?`;
                    
                    if (confirm(message)) {
                        // Navigate to the existing offer
                        window.location.hash = `#/offer/${errorData.duplicate_offer_id}`;
                    }
                    return;
                }
                
                alert(errorData.error || 'An unknown error occurred while adding the offer.');
                return;
            }

            const newOffer = await response.json();
            app.offers[newOffer.id] = newOffer;
            app.urlInput.value = '';
            handleRouteChange();
            // Start polling immediately if the new offer is processing
            if (newOffer.status === 'processing') {
                scheduleNextFetch();
            }
            // Go directly to the new offer's detail page
            window.location.hash = `#/offer/${newOffer.id}`;

        } catch (error) {
            console.error('Error adding offer:', error);
            alert('A network error occurred. Please check your connection and try again.');
        } finally {
            setLoadingState(false);
        }
    };

    const submitManualContent = async (content) => {
        if (app.manualSubmitButton.disabled) return;
        setManualLoadingState(true);
        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content })
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                alert(errorData.error || 'An unknown error occurred while processing the content.');
                return;
            }

            const newOffer = await response.json();
            app.offers[newOffer.id] = newOffer;
            app.manualContent.value = '';
            updateCharCount();
            handleRouteChange();
            // Start polling immediately if the new offer is processing
            if (newOffer.status === 'processing') {
                scheduleNextFetch();
            }
            // Go directly to the new offer's detail page
            window.location.hash = `#/offer/${newOffer.id}`;

        } catch (error) {
            console.error('Error processing manual content:', error);
            alert('A network error occurred. Please check your connection and try again.');
        } finally {
            setManualLoadingState(false);
        }
    };

    app.form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (app.currentMode === 'url') {
            submitUrl(app.urlInput.value.trim());
        } else {
            submitManualContent(app.manualContent.value.trim());
        }
    });

    app.urlInput.addEventListener('paste', (e) => {
        e.preventDefault();
        const pastedText = (e.clipboardData || window.clipboardData).getData('text');
        app.urlInput.value = pastedText;
        submitUrl(pastedText.trim());
    });



    app.filterSelect.addEventListener('change', (e) => {
        app.currentFilter = e.target.value;
        renderOfferList();
    });

    app.sortOrderBtn.addEventListener('click', () => {
        app.isAscending = !app.isAscending;
        updateSortOrderButton();
        renderOfferList();
    });

    // Mode toggle functionality
    app.urlModeBtn.addEventListener('click', () => switchMode('url'));
    app.manualModeBtn.addEventListener('click', () => switchMode('manual'));
    
    // Manual content character count
    app.manualContent.addEventListener('input', updateCharCount);



    const handleRouteChange = () => {
        const hash = window.location.hash;
        if (hash.startsWith('#/offer/')) {
            const offerId = parseInt(hash.split('/')[2], 10);
            // Track if we're coming from planning page
            if (window.location.hash.includes('from=planning')) {
                app.previousPage = 'planning';
            } else {
                app.previousPage = 'dashboard';
            }
            showDetailView(offerId);
        } else {
            showListView();
        }
    };

    // --- INITIALIZATION ---
    initStaticText(); // Populate the main page text
    

    
    window.addEventListener('hashchange', handleRouteChange);
    
    // Handle initial route on page load (important for direct URLs like /offer/1)
    handleRouteChange();
    
    // Load offers on initial page load if we're on the main page
    if (!window.location.hash || window.location.hash === '#') {
        fetchAllOffers();
    }
    
    // Make app globally accessible for planning page
    window.app = app;
});