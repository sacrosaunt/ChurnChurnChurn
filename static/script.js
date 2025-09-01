document.addEventListener('DOMContentLoaded', () => {
    // --- TEXT CONFIGURATION ---
    const TEXT_CONTENT = {
        app: {
            title: 'Churn³',
            mainTitle: 'Dashboard',
            subtitle: 'Track and manage your bank account bonus offers with ChurnChurnChurn.',
            addOfferTitle: 'Add New Offer',
            urlInputPlaceholder: 'Paste a bank offer URL here...',
            submitButtonText: 'Add Offer',
            manualContentPlaceholder: 'Paste the website content, HTML, or text here...',
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
            scrapingFailedMessage: 'The application was unable to retrieve information from this URL. The website may be down or is actively blocking automated scrapers. You can try visiting the source URL directly.',
            manualModeSuggestion: 'Try using Manual Mode instead - paste the website content directly to bypass scraping issues.',
        },
        // For processing progress bar
        processingSteps: ["Scraping Website", "Validating Offer", "Condensing Terms", "Extracting Details", "Analyzing Fine Print", "Done"],
        manualProcessingSteps: ["Validating Content", "Condensing Terms", "Extracting Details", "Analyzing Fine Print", "Done"],

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
        filterSelect: document.getElementById('filter-select'),
        filterLabel: document.getElementById('filter-label'),
        sortOrderBtn: document.getElementById('sort-order-btn'),
        sortOrderText: document.getElementById('sort-order-text'),
        sortOrderIcon: document.getElementById('sort-order-icon'),
        // Manual Mode Elements
        urlInputContainer: document.getElementById('url-input-container'),
        manualInputContainer: document.getElementById('manual-input-container'),
        manualContent: document.getElementById('manual-content'),
        manualSubmitButton: document.getElementById('manual-submit-button'),
        manualSubmitButtonText: document.getElementById('manual-submit-button-text'),
        manualSubmitSpinner: document.getElementById('manual-submit-spinner'),
        // State
        offers: {},
        currentFilter: 'status',
        isAscending: false,
        currentMode: 'url', // 'url' or 'manual'
        originalUrlForManual: null, // Track original URL when switching from failed scrape
    };

    // --- INITIALIZE STATIC TEXT ---
    const initStaticText = () => {
        document.getElementById('app-title-tag').textContent = TEXT_CONTENT.app.title;
        document.getElementById('main-title').textContent = TEXT_CONTENT.app.mainTitle;
        document.getElementById('main-subtitle').textContent = TEXT_CONTENT.app.subtitle;
        document.getElementById('total-claimed-label').textContent = TEXT_CONTENT.summary.totalClaimed;
        document.getElementById('total-pending-label').textContent = TEXT_CONTENT.summary.totalPending;
        document.getElementById('add-offer-title').textContent = TEXT_CONTENT.app.addOfferTitle;
        app.urlInput.placeholder = TEXT_CONTENT.app.urlInputPlaceholder;
        app.submitButtonText.textContent = TEXT_CONTENT.app.submitButtonText;
        app.manualContent.placeholder = TEXT_CONTENT.app.manualContentPlaceholder;
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
            const normalizedData = data.replace(/\\n/g, '\n').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
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


    const getExpirationColor = (dateString, offer = null) => {
        // Check if this is an offer that should have greyed out expiration
        if (offer && (offer.user_controlled.deposited || offer.user_controlled.received)) {
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
            return skeleton(width, alignClass);
        }
        if (offerStatus === 'failed' && String(value).toLowerCase().includes('processing')) {
            return '<span class="text-gray-500">N/A</span>';
        }
        if (value === null || value === undefined || String(value).toLowerCase() === 'n/a') {
            // Check if this is a deal_expiration_date field for an opened/waiting/claimed offer
            if (fieldName === 'deal_expiration_date' && offer && (offer.user_controlled.deposited || offer.user_controlled.received)) {
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
                return !isNaN(num) ? `$${num.toLocaleString()}` : processedValue;
            case 'boolean':
                const valStr = String(processedValue).toLowerCase();
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
        if (!bonusTiersDetailed || bonusTiersDetailed === 'Single tier' || bonusTiersDetailed === 'N/A') {
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
            // Try to parse as JSON first
            const tiers = JSON.parse(cleanedJson);
            // Clean totalDepositByTier data too
            let cleanedDeposits = totalDepositByTier;
            if (cleanedDeposits && cleanedDeposits !== 'Single tier' && typeof cleanedDeposits === 'string') {
                cleanedDeposits = cleanedDeposits.replace(/^json\s*\n?/i, '').trim();
                cleanedDeposits = cleanedDeposits.replace(/'/g, '"');
            }
            const deposits = cleanedDeposits && cleanedDeposits !== 'Single tier' ? JSON.parse(cleanedDeposits) : null;
            
            // Ensure we have valid tiers array
            if (!Array.isArray(tiers) || tiers.length === 0) {
                return null;
            }
            
            return tiers.map(tier => {
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
            });
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

    const shortenTierDescription = (description) => {
        if (!description) return description;
        
        // Remove dollar sign prefix
        let cleaned = description.replace(/^\$+/, '').trim();
        
        // Handle specific patterns to create meaningful, concise descriptions
        
        // Direct deposit patterns
        if (/direct deposit/i.test(cleaned)) {
            return 'Set up direct deposit';
        }
        
        // Pattern like "$15,000 + maintain 90 days" or "$X + maintain"
        const dollarPlusMaintainMatch = /\$?([\d,]+)\s*\+\s*maintain\s*(\d+)?\s*days?/i.exec(cleaned);
        if (dollarPlusMaintainMatch) {
            const amount = dollarPlusMaintainMatch[1];
            const days = dollarPlusMaintainMatch[2];
            if (days) {
                return `$${amount} + maintain ${days} days`;
            } else {
                return `$${amount} + maintain`;
            }
        }
        
        // Complex multi-account requirements
        if (/open both.*accounts.*and.*meet.*both/i.test(cleaned)) {
            // Extract key requirements
            const hasDirectDeposit = /direct deposit/i.test(cleaned);
            const depositMatch = cleaned.match(/\$?([\d,]+)/);
            const maintainMatch = /maintain.*?(\d+)\s*days/i.exec(cleaned);
            
            let parts = ['Open both accounts'];
            if (hasDirectDeposit) parts.push('direct deposit');
            if (depositMatch) parts.push(`$${depositMatch[1]} deposit`);
            if (maintainMatch) parts.push(`maintain ${maintainMatch[1]} days`);
            
            return parts.join(' + ');
        }
        
        // Simple deposit amounts with maintenance (different pattern)
        const depositMaintainMatch = /deposit.*?\$?([\d,]+).*?maintain.*?(\d+)\s*days/i.exec(cleaned);
        if (depositMaintainMatch) {
            return `$${depositMaintainMatch[1]} deposit + maintain ${depositMaintainMatch[2]} days`;
        }
        
        // Simple deposit amounts
        const simpleDepositMatch = /deposit.*?\$?([\d,]+)/i.exec(cleaned);
        if (simpleDepositMatch) {
            return `$${simpleDepositMatch[1]} deposit`;
        }
        
        // Maintenance requirements (fallback)
        const maintainMatch = /maintain.*?\$?([\d,]+).*?(\d+)\s*days/i.exec(cleaned);
        if (maintainMatch) {
            return `Maintain $${maintainMatch[1]} for ${maintainMatch[2]} days`;
        }
        
        // If none of the patterns match, try to create a generic short description
        cleaned = cleaned
            .replace(/At least (\d+|\w+) qualifying/i, '')
            .replace(/electronic/i, '')
            .replace(/within \d+ days/i, '')
            .replace(/from employer.*?benefits/i, '')
            .replace(/\s+/g, ' ')
            .trim();
        
        // Final length check - truncate if still too long
        if (cleaned.length > 40) {
            cleaned = cleaned.substring(0, 37) + '...';
        }
        
        return cleaned || 'See requirements';
    };

    const createTierDisplay = (tiers, highestBonus) => {
        if (!tiers || tiers.length <= 1) {
            return '';
        }

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

            return `
                <div class="py-3 border-b border-gray-100 last:border-b-0">
                    <div class="flex justify-between items-start mb-1">
                        <span class="text-sm font-medium text-gray-700">Tier ${tier.tier}</span>
                        <span class="text-sm font-semibold text-green-600">$${tier.bonus ? tier.bonus.toLocaleString() : 'N/A'} bonus</span>
                    </div>
                    <div class="text-xs text-gray-600 max-w-md">
                        ${depositText}
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="mt-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <div class="flex items-center justify-between mb-2">
                    <span class="text-sm font-medium text-blue-800">Multiple Tiers Available</span>
                    <span class="text-xs text-blue-600">Up to ${formatValue(highestBonus, 'currency')}</span>
                </div>
                <div class="space-y-1">
                    ${tierItems}
                </div>
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

    const switchMode = (mode) => {
        app.currentMode = mode;
        
        if (mode === 'url') {
            app.urlInputContainer.classList.remove('hidden');
            app.manualInputContainer.classList.add('hidden');
            app.urlInput.required = true;
            app.manualContent.required = false;
        } else {
            app.urlInputContainer.classList.add('hidden');
            app.manualInputContainer.classList.remove('hidden');
            app.urlInput.required = false;
            app.manualContent.required = true;
        }
    };

    const getOfferStatus = (offer) => {
        if (offer.status === 'processing') return { status: 'processing', statusClass: 'status-processing', statusText: TEXT_CONTENT.status.processing };
        if (offer.status === 'failed') return { status: 'failed', statusClass: 'status-failed', statusText: TEXT_CONTENT.status.failed };
        if (offer.user_controlled.received) return { status: 'claimed', statusClass: 'status-claimed', statusText: TEXT_CONTENT.status.claimed };
        if (offer.user_controlled.deposited) return { status: 'waiting', statusClass: 'status-waiting', statusText: TEXT_CONTENT.status.waiting };
        if (offer.user_controlled.opened) return { status: 'pending-deposit', statusClass: 'status-pending-deposit', statusText: TEXT_CONTENT.status.pendingDeposit };
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
                    const bonusA = parseFloat(String(a.details.bonus_to_be_received).replace(/[^0-9.-]+/g,"")) || 0;
                    const bonusB = parseFloat(String(b.details.bonus_to_be_received).replace(/[^0-9.-]+/g,"")) || 0;
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
            const bonusAmount = parseFloat(String(offer.details.bonus_to_be_received).replace(/[^0-9.-]+/g,""));
            if (!isNaN(bonusAmount)) {
                if (offer.user_controlled.received) {
                    totalClaimed += bonusAmount;
                } else if (offer.user_controlled.deposited) {
                    totalPending += bonusAmount;
                }
            }
        });

        app.totalClaimedEl.textContent = `$${totalClaimed.toLocaleString()}`;
        app.totalPendingEl.textContent = `$${totalPending.toLocaleString()}`;
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
        const baseStatusOrder = ['unopened', 'pending_deposit', 'waiting', 'processing', 'claimed', 'failed'];
        
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
        tile.className = 'block bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md hover:border-blue-300 transition-all duration-200 p-4';
        
        const bonusAmount = parseFloat(String(offer.details.bonus_to_be_received).replace(/[^0-9.-]+/g,""));

        // Parse tier information for tile view
        const tiers = parseTierData(offer.details.bonus_tiers_detailed, offer.details.total_deposit_by_tier);
        const hasMultipleTiers = tiers && tiers.length > 1;
        const highestBonus = tiers ? Math.max(...tiers.map(t => t.bonus)) : bonusAmount;

        tile.innerHTML = `
            <div class="flex flex-col h-full">
                <div class="flex items-start justify-between mb-3">
                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-semibold text-blue-600 truncate" data-field="bank_name">
                            ${formatValue(offer.details.bank_name, 'text', { skeletonOptions: { width: 'w-24', alignClass: '' }, offerStatus: offer.status, fieldName: 'bank_name' })}
                        </p>
                        <h3 class="text-lg font-bold text-gray-900 truncate leading-tight" data-field="account_title">
                            ${formatValue(offer.details.account_title, 'text', { skeletonOptions: { width: 'w-32', alignClass: '' }, offerStatus: offer.status, fieldName: 'account_title' })}
                        </h3>
                    </div>
                    <span class="px-2 py-1 text-xs font-semibold rounded-full ${statusClass} ml-2">
                        ${statusText}
                    </span>
                </div>
                
                <div class="flex-1 mb-3">
                    <div class="text-2xl font-bold text-green-600 mb-2" data-field="bonus_to_be_received">
                        ${hasMultipleTiers ? `Up to ${formatValue(highestBonus, 'currency')}` : formatValue(offer.details.bonus_to_be_received, 'currency', { skeletonOptions: { width: 'w-20', alignClass: '' }, offerStatus: offer.status, fieldName: 'bonus_to_be_received' })}
                    </div>
                    ${hasMultipleTiers ? '<p class="text-xs text-blue-600 mb-2">Multiple tiers available</p>' : ''}
                </div>
                
                <div class="text-sm text-gray-500 flex items-center">
                    <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                    </svg>
                    <span>${TEXT_CONTENT.list.expires}</span>
                    <span class="ml-1" data-field="deal_expiration_date">
                        ${formatValue(offer.details.deal_expiration_date, 'date', { skeletonOptions: { width: 'w-16', alignClass: '' }, offerStatus: offer.status, fieldName: 'deal_expiration_date', offer: offer })}
                    </span>
                </div>
            </div>
        `;
        
        return tile;
    };

    const getStatusKey = (offer) => {
        const { statusClass } = getOfferStatus(offer);
        return statusClass.replace('status-', '').replace(' ', '_');
    };



    const renderDetailView = (offer) => {
        // Handle failed offers first
        if (offer.status === 'failed') {
            app.detailView.innerHTML = `
                <header class="mb-8 pt-8">
                    <a href="#" class="inline-flex items-center text-blue-600 hover:underline">
                        <svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
                        ${TEXT_CONTENT.detail.backLink}
                    </a>
                </header>
                <div class="bg-red-50 border-l-4 border-red-400 p-6 rounded-r-lg shadow-md my-8">
                    <div class="flex">
                        <div class="py-1">
                            <svg class="w-8 h-8 text-red-500 mr-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        </div>
                        <div>
                            <p class="text-xl font-bold text-red-800">${TEXT_CONTENT.errors.scrapingFailedTitle}</p>
                            <p class="text-red-700 mt-2">${TEXT_CONTENT.errors.scrapingFailedMessage}</p>
                            <p class="text-sm text-gray-600 mt-4">
                                <a href="${offer.url}" target="_blank" class="text-blue-500 hover:underline flex items-center gap-1" title="${offer.url}">
                                    ${TEXT_CONTENT.detail.sourceLink}
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                                    </svg>
                                </a>
                            </p>
                            <div class="mt-4 p-4 bg-blue-50 border-l-4 border-blue-400 rounded-r-lg">
                                <p class="text-sm text-blue-800 font-medium">💡 ${TEXT_CONTENT.errors.manualModeSuggestion}</p>
                                <button id="try-manual-mode-btn" class="mt-2 bg-blue-600 text-white text-sm px-4 py-2 rounded-md hover:bg-blue-700 transition">
                                    Switch to Manual Mode
                                </button>
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
                    console.log('🔙 Back button clicked (failed offer), previousPage:', app.previousPage);
                    if (app.previousPage === 'planning') {
                        window.location.href = '/planning';
                    } else {
                        console.log('🔄 Refreshing offers before returning to dashboard');
                        // Refresh offers before navigating back to dashboard
                        await fetchAllOffers();
                        window.location.hash = '';
                        // Force a re-render of the dashboard to show updated data
                        setTimeout(() => {
                            console.log('🏠 Forcing handleRouteChange to refresh dashboard');
                            handleRouteChange();
                        }, 10);
                    }
                });
            }
            
            // Add manual mode button functionality
            document.getElementById('try-manual-mode-btn').addEventListener('click', async () => {
                // Get the original URL from the failed offer
                const originalUrl = offer.url;
                
                // Delete the failed offer
                try {
                    await fetch(`${API_URL}/${offer.id}`, { method: 'DELETE' });
                    delete app.offers[offer.id];
                } catch (error) {
                    console.error('Error deleting failed offer:', error);
                }
                
                // Navigate back to list view and switch to manual mode
                window.location.hash = '';
                window.history.replaceState(null, '', window.location.pathname);
                
                // Switch to manual mode
                setTimeout(() => {
                    const modeToggle = document.getElementById('mode-toggle');
                    if (modeToggle) {
                        modeToggle.checked = true;
                        switchMode('manual');
                        
                        // Set the original URL for manual submission
                        app.originalUrlForManual = originalUrl;
                        
                        // Pre-fill the manual content with a message about the original URL
                        const manualContent = document.getElementById('manual-content');
                        if (manualContent) {
                            manualContent.value = `Please paste the website content from: ${originalUrl}\n\n[Paste the website content here...]`;
                            manualContent.focus();
                            manualContent.setSelectionRange(manualContent.value.length, manualContent.value.length);
                        }
                    }
                }, 100);
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
            
            return `
            <div class="metric-tile bg-white p-4 rounded-lg shadow-md text-center flex flex-col justify-center h-32 relative group ${hiddenClass}" data-field="${fieldName}" data-offer-id="${offerId}" data-label="${label}">
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
                <div class="refresh-progress hidden absolute inset-0 bg-blue-50 bg-opacity-90 rounded-lg flex items-center justify-center">
                    <div class="text-center w-full px-4">
                        <div class="overflow-hidden h-2 mb-2 text-xs flex rounded bg-blue-200">
                            <div class="refresh-progress-bar shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-blue-500 transition-all duration-500 ease-out" style="width: 0%"></div>
                        </div>
                        <div class="text-xs text-blue-600">Rescraping</div>
                    </div>
                </div>
                <button class="refresh-button absolute top-3 right-3 bg-white text-gray-600 rounded-lg w-8 h-8 flex items-center justify-center text-xs hover:bg-gray-50 hover:text-blue-600 border border-gray-200 shadow-sm transition-all duration-200 opacity-0 group-hover:opacity-100 transform scale-90 group-hover:scale-100" title="Rescan?" style="display: none;">
                    <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                    </svg>
                </button>
            </div>`;
        };

        const createStatusSelector = (offer, initialProgressBarWidth) => {
            if (offer.status === 'processing') {
                // Determine if this is a manual mode offer
                const isManualMode = offer.url && offer.url.startsWith('manual-content-');
                const steps = isManualMode ? TEXT_CONTENT.manualProcessingSteps : TEXT_CONTENT.processingSteps;
                let currentStepIndex = steps.indexOf(offer.processing_step);
                if (currentStepIndex === -1) {
                    currentStepIndex = 0;
                }

                // Ensure "Done" step shows 100% progress
                const progressPercentage = offer.processing_step === "Done" ? 100 : ((currentStepIndex + 1) / steps.length) * 100;
                
                return `
                    <h3 class="text-lg font-semibold mb-2 text-center">${TEXT_CONTENT.detail.processingTitle}</h3>
                    <div class="relative pt-2">
                        <div class="flex mb-2 items-center justify-between">
                            <div>
                                <span class="text-xs font-semibold inline-block text-blue-600">
                                    ${offer.processing_step}... (Step ${currentStepIndex + 1} of ${steps.length})
                                </span>
                            </div>
                        </div>
                        <div class="overflow-hidden h-2 mb-4 text-xs flex rounded bg-blue-200">
                            <div id="processing-progress-bar" style="width: ${initialProgressBarWidth}" data-target-width="${progressPercentage}%" class="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-blue-500 transition-all duration-500 ease-out"></div>
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
            if (offer.user_controlled.received) currentStatusKey = 'received';
            else if (offer.user_controlled.deposited) currentStatusKey = 'deposited';
            else if (offer.user_controlled.opened) currentStatusKey = 'opened';

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
            const data = offer.details.additional_considerations || 'N/A';
            const contentHtml = createConsiderationsContent(data, offer.status);

            return `
                <div class="considerations-container bg-white p-6 rounded-lg shadow-md relative group" data-field="additional_considerations" data-offer-id="${offer.id}">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="text-lg font-semibold">${TEXT_CONTENT.detail.considerationsTitle}</h3>
                        <button class="refresh-button bg-white text-gray-600 rounded-lg w-8 h-8 flex items-center justify-center text-xs hover:bg-gray-50 hover:text-blue-600 border border-gray-200 shadow-sm transition-all duration-200 opacity-0 group-hover:opacity-100 transform scale-90 group-hover:scale-100" title="Refresh considerations" style="display: none;">
                            <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                            </svg>
                        </button>
                    </div>
                    ${contentHtml}
                    <div class="refresh-progress hidden absolute inset-0 bg-blue-50 bg-opacity-90 rounded-lg flex items-center justify-center">
                        <div class="text-center w-full px-4">
                            <div class="overflow-hidden h-2 mb-2 text-xs flex rounded bg-blue-200">
                                <div class="refresh-progress-bar shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-blue-500 transition-all duration-500 ease-out" style="width: 0%"></div>
                            </div>
                            <div class="text-xs text-blue-600">Rescraping</div>
                        </div>
                    </div>
                </div>`;
        };

        const bonusAmount = parseFloat(String(offer.details.bonus_to_be_received).replace(/[^0-9.-]+/g,""));
        const feeIsConditional = String(offer.details.fee_is_conditional).toLowerCase() === 'yes';
        const clawbackStatus = String(offer.details.clawback_clause_present);
        const hasClawback = clawbackStatus.toLowerCase() === 'yes';
        const clawbackDetails = offer.details.clawback_details;
        const clawbackValue = formatValue(clawbackStatus === 'Processing...' ? 'Processing...' : (clawbackStatus.toLowerCase() === 'yes' ? 'Yes' : 'No'), 'text', { offerStatus: offer.status, fieldName: 'clawback_clause_present' });
        const clawbackClass = clawbackStatus === 'Processing...' ? 'text-blue-600' : (clawbackStatus.toLowerCase() === 'yes' ? 'text-red-600' : 'text-green-600');

        // Parse tier information
        const tiers = parseTierData(offer.details.bonus_tiers_detailed, offer.details.total_deposit_by_tier);
        const hasMultipleTiers = tiers && tiers.length > 1;
        const highestBonus = tiers ? Math.max(...tiers.map(t => t.bonus)) : bonusAmount;

        app.detailView.innerHTML = `
            <header class="mb-8 pt-8">
                <a href="#" id="back-button" class="inline-flex items-center text-blue-600 hover:underline">
                    <svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
                    ${app.previousPage === 'planning' ? 'Back to Planning' : TEXT_CONTENT.detail.backLink}
                </a>
                <div class="mt-4 md:flex justify-between items-start">
                    <div class="flex-1">
                        <h1 class="text-4xl font-bold text-gray-900" data-field="account_title">${formatValue(offer.details.account_title, 'text', { skeletonOptions: { width: 'w-3/4', alignClass: '' }, offerStatus: offer.status, fieldName: 'account_title' })}</h1>
                        <p class="text-2xl text-gray-600 mt-1" data-field="bank_name">${formatValue(offer.details.bank_name, 'text', { skeletonOptions: { width: 'w-1/2', alignClass: '' }, offerStatus: offer.status, fieldName: 'bank_name' })}</p>
                    </div>
                    <div class="text-left md:text-right mt-4 md:mt-0 md:ml-6">
                        <div class="flex flex-col items-end">
                            <p class="text-5xl font-bold text-green-600" data-field="bonus_to_be_received">
                                ${hasMultipleTiers ? `Up to ${formatValue(highestBonus, 'currency')}` : formatValue(offer.details.bonus_to_be_received, 'currency', { skeletonOptions: { width: 'w-32', alignClass: '' }, offerStatus: offer.status, fieldName: 'bonus_to_be_received' })}
                            </p>
                            ${hasMultipleTiers ? '<span class="text-sm text-gray-500 mt-1">Multiple tiers available</span>' : ''}
                        </div>
                    </div>
                </div>
                ${hasMultipleTiers ? createTierDisplay(tiers, highestBonus) : ''}
            </header>
            <div class="space-y-6">
                <div class="bg-white p-6 rounded-lg shadow-md">
                     ${createStatusSelector(offer, initialWidth)}
                </div>

                <div class="grid grid-cols-2 md:grid-cols-4 gap-4" id="metric-tiles-grid">
                    ${createMetricTile(TEXT_CONTENT.detail.initialDeposit, formatValue(offer.details.initial_deposit_amount, 'currency', { fieldName: 'initial_deposit_amount', offerStatus: offer.status }), { fieldName: 'initial_deposit_amount', offerId: offer.id })}
                    ${createMetricTile(TEXT_CONTENT.detail.totalDeposit, formatValue(offer.details.total_deposit_required, 'currency', { fieldName: 'total_deposit_required', offerStatus: offer.status }), { fieldName: 'total_deposit_required', offerId: offer.id })}
                    ${createMetricTile(TEXT_CONTENT.detail.offerExpires, formatValue(offer.details.deal_expiration_date, 'date', { fieldName: 'deal_expiration_date', offerStatus: offer.status, offer: offer }), { fieldName: 'deal_expiration_date', offerId: offer.id })}
                    ${createMetricTile(TEXT_CONTENT.detail.monthlyFee, formatValue(offer.details.minimum_monthly_fee, 'currency', { fieldName: 'minimum_monthly_fee', offerStatus: offer.status }), { subtitle: feeIsConditional ? TEXT_CONTENT.detail.feeConditional : '', fieldName: 'minimum_monthly_fee', offerId: offer.id })}
                    ${createMetricTile(TEXT_CONTENT.detail.minBalance, formatValue(offer.details.minimum_daily_balance_required, 'currency', { fieldName: 'minimum_daily_balance_required', offerStatus: offer.status }), { fieldName: 'minimum_daily_balance_required', offerId: offer.id })}
                    ${createMetricTile(TEXT_CONTENT.detail.depositsRequired, formatValue(offer.details.num_required_deposits, 'text', { fieldName: 'num_required_deposits', offerStatus: offer.status }), { fieldName: 'num_required_deposits', offerId: offer.id })}
                    ${createMetricTile(TEXT_CONTENT.detail.depositWithin, formatValue(offer.details.days_for_deposit, 'days', { fieldName: 'days_for_deposit', offerStatus: offer.status }), { fieldName: 'days_for_deposit', offerId: offer.id })}
                    ${createMetricTile(TEXT_CONTENT.detail.bonusPayout, formatValue(offer.details.days_for_bonus, 'days', { fieldName: 'days_for_bonus', offerStatus: offer.status }), { fieldName: 'days_for_bonus', offerId: offer.id })}
                    ${createMetricTile(TEXT_CONTENT.detail.clawback, clawbackValue, { extraClass: clawbackClass, fieldName: 'clawback_clause_present', offerId: offer.id, hasClawback: hasClawback, clawbackDetails: clawbackDetails })}
                    ${createMetricTile(TEXT_CONTENT.detail.daysToWithdraw, formatValue(offer.details.must_be_open_for, 'days', { fieldName: 'must_be_open_for', offerStatus: offer.status }), { fieldName: 'must_be_open_for', offerId: offer.id })}
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
                         ${offer.url.startsWith('manual-content-') ? 
                             `<button id="set-original-url-btn" class="text-sm text-blue-500 hover:underline flex items-center gap-1">
                                 ${TEXT_CONTENT.detail.sourceLink}
                                 <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                     <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                                 </svg>
                             </button>` :
                             `<a href="${offer.url}" target="_blank" class="text-sm text-blue-500 hover:underline flex items-center gap-1" title="${offer.url}">
                                 ${TEXT_CONTENT.detail.sourceLink}
                                 <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                     <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                                 </svg>
                             </a>`
                         }
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
        document.getElementById('delete-offer-btn').addEventListener('click', deleteOffer);
        document.getElementById('refresh-all-btn').addEventListener('click', refreshAllData);
        
        // Add back button functionality
        document.getElementById('back-button').addEventListener('click', async (e) => {
            e.preventDefault();
            console.log('🔙 Back button clicked, previousPage:', app.previousPage);
            if (app.previousPage === 'planning') {
                window.location.href = '/planning';
            } else {
                console.log('🔄 Refreshing offers before returning to dashboard');
                // Refresh offers before navigating back to dashboard
                await fetchAllOffers();
                window.location.hash = '';
                // Force a re-render of the dashboard to show updated data
                setTimeout(() => {
                    console.log('🏠 Forcing handleRouteChange to refresh dashboard');
                    handleRouteChange();
                }, 10);
            }
        });
        
        // Add event listener for setting original URL (manual mode offers)
        const setOriginalUrlBtn = document.getElementById('set-original-url-btn');
        if (setOriginalUrlBtn) {
            setOriginalUrlBtn.addEventListener('click', () => {
                const originalUrl = prompt('Enter the original URL for this offer:');
                if (originalUrl && originalUrl.trim()) {
                    // Update the offer URL
                    updateOfferUrl(offer.id, originalUrl.trim());
                }
            });
        }

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
                
                const progressBar = tile.querySelector('.refresh-progress-bar');
                const stepText = tile.querySelector('.refresh-progress .text-xs:last-child');
                
                // Update progress for step 1 (rescraping)
                progressBar.style.width = '0%';
                stepText.textContent = 'Rescraping';
                
                try {
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
                                // Update progress based on actual status
                                const status = updatedOffer.refresh_status[fieldName];
                                if (status === 'rescraping') {
                                    progressBar.style.width = '15%';
                                    stepText.textContent = 'Rescraping';
                                } else if (status === 'querying') {
                                    progressBar.style.width = '40%';
                                    stepText.textContent = 'Querying';
                                } else if (status === 'consensus') {
                                    progressBar.style.width = '80%';
                                    stepText.textContent = 'Consensus';
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
                                
                                // Automatic polling disabled - refresh manually if needed
                                // setTimeout(pollForUpdate, 500);
                                                            } else {
                                    // Check if the progress div is still visible (user hasn't navigated away)
                                    if (!progressDiv.classList.contains('hidden')) {
                                        // Complete - show completion state for a moment
                                        progressBar.style.width = '100%';
                                        stepText.textContent = 'Complete!';

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
                            progressBar.style.width = '100%';
                            stepText.textContent = 'Error';
                            
                            setTimeout(() => {
                                progressDiv.classList.add('hidden');
                                refreshButton.style.display = 'block';
                                refreshButton.style.opacity = '0';
                            }, 1000);
                        }
                    };
                    
                    pollForUpdate();
                    
                } catch (error) {
                    console.error('Error refreshing field:', error);
                    progressDiv.classList.add('hidden');
                    refreshButton.style.display = 'block';
                    refreshButton.style.opacity = '0';
                    
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
                
                const progressBar = container.querySelector('.refresh-progress-bar');
                const stepText = container.querySelector('.refresh-progress .text-xs:last-child');
                
                // Update progress for step 1 (rescraping)
                progressBar.style.width = '0%';
                stepText.textContent = 'Starting...';
                
                try {
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
                                // Update progress based on actual status
                                const status = updatedOffer.refresh_status[fieldName];
                                if (status === 'rescraping') {
                                    progressBar.style.width = '15%';
                                    stepText.textContent = 'Rescraping';
                                } else if (status === 'querying') {
                                    progressBar.style.width = '40%';
                                    stepText.textContent = 'Querying';
                                } else if (status === 'consensus') {
                                    progressBar.style.width = '80%';
                                    stepText.textContent = 'Consensus';
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
                                
                                // Automatic polling disabled - refresh manually if needed
                                // setTimeout(pollForUpdate, 500);
                                                            } else {
                                    // Check if the progress div is still visible (user hasn't navigated away)
                                    if (!progressDiv.classList.contains('hidden')) {
                                        // Complete - show completion state for a moment
                                        progressBar.style.width = '100%';
                                        stepText.textContent = 'Complete';

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
                                    };

                                    // Check if the view is still active before updating
                                    if (document.getElementById(`detail-view`).offsetParent !== null) {
                                        setTimeout(finalUpdate, 750);
                                    } else {
                                        finalUpdate();
                                    }
                                }
                            }
                        } catch (error) {
                            console.error('Error polling for update:', error);
                            
                            // Show error completion state briefly before hiding
                            progressBar.style.width = '100%';
                            stepText.textContent = 'Error';
                            
                            setTimeout(() => {
                                progressDiv.classList.add('hidden');
                                refreshButton.style.display = 'block';
                                refreshButton.style.opacity = '0';
                            }, 1000);
                        }
                    };
                    
                    pollForUpdate();
                    
                } catch (error) {
                    console.error('Error refreshing field:', error);
                    progressDiv.classList.add('hidden');
                    refreshButton.style.display = 'block';
                    refreshButton.style.opacity = '0';
                    
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
        const isRefreshing = Object.values(app.offers).some(offer => offer.refresh_status && 
            Object.values(offer.refresh_status).some(status => status === 'rescraping' || status === 'processing'));
        
        // Debug logging
        if (isProcessing || isRefreshing) {
            console.log(`🔄 Scheduling next fetch in 500ms - Processing: ${isProcessing}, Refreshing: ${isRefreshing}`);
        }
        
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

    const animateValue = (element, newValue) => {
        if (!element) return;
        
        // Add animation class for visual feedback
        element.classList.add('fade-in-glide-up');
        
        // Swap in the real value
        element.innerHTML = newValue;
        
        // Remove any skeleton loaders that were children of this element
        removeSkeletonLoaders(element);
        
        // Clean-up animation class after it finishes
        setTimeout(() => {
            element.classList.remove('fade-in-glide-up');
        }, 600);
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
            console.log('🔍 fetchAllOffers called');
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
                            if (currentStepIndex === -1) {
                                currentStepIndex = 0;
                            }
                            const progressPercentage = newOffer.processing_step === "Done" ? 100 : ((currentStepIndex + 1) / steps.length) * 100;
                            progressBar.style.width = `${progressPercentage}%`;
                            
                            // Update the step text
                            const stepText = document.querySelector('.text-xs.font-semibold.inline-block.text-blue-600');
                            if (stepText) {
                                stepText.textContent = `${newOffer.processing_step}... (Step ${currentStepIndex + 1} of ${steps.length})`;
                            }
                        }
                    }
                    
                    // Handle completion of processing
                    if (oldOffer.status === 'processing' && newOffer.status !== 'processing') {
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
                        }, 100); // Very short delay to allow animations to start
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
    
    const updateOfferStatus = async (id, statusKey) => {
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

        const fetchPromises = Object.entries(updates).map(([field, value]) =>
            fetch(`${API_URL}/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ field, value })
            })
        );

        try {
            await Promise.all(fetchPromises);
            const response = await fetch(`${API_URL}/${id}`);
            const updatedOffer = await response.json();
            app.offers[id] = updatedOffer;
            renderDetailView(updatedOffer);
        } catch (error) {
            console.error(`Error updating status:`, error);
        }
    };

    const deleteOffer = async (e) => {
        const id = e.target.dataset.id;
        if (confirm(TEXT_CONTENT.detail.deleteConfirmation)) {
            try {
                await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
                delete app.offers[id];
                window.location.hash = '';
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

        if (confirm('This will re-process the entire offer from scratch. This may take a few minutes. Continue?')) {
            try {
                console.log('Starting refresh for offer:', offer.id, 'URL:', offer.url, 'Has original_content:', !!offer.original_content);
                
                // Show processing state and reset all fields to skeletons
                offer.status = 'processing';
                offer.processing_step = offer.url.startsWith('manual-content-') ? 'Validating Content' : 'Scraping Website';
                
                // Start polling immediately for refresh operations
                console.log('🚀 Starting polling for refresh operation:', offer.id);
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
                
                // Only include URL if this is a URL-based offer (not manual content)
                if (!offer.url.startsWith('manual-content-')) {
                    requestBody.url = offer.url;
                }
                
                console.log('Sending refresh request:', requestBody);
                
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
                console.log('🚀 Starting polling for new processing offer:', newOffer.id);
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

    app.form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (app.currentMode === 'url') {
            submitUrl(app.urlInput.value.trim());
        } else {
            // For manual mode, we need to send the content
            setManualLoadingState(true);
            try {
                const content = app.manualContent.value.trim();
                const requestBody = { content };
                
                // Include original URL if available (from failed scrape)
                if (app.originalUrlForManual) {
                    requestBody.original_url = app.originalUrlForManual;
                }
                
                const response = await fetch(API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody)
                });
                
                if (!response.ok) {
                    const errorData = await response.json();
                    alert(errorData.error || 'An unknown error occurred while adding the offer.');
                    return;
                }

                const newOffer = await response.json();
                app.offers[newOffer.id] = newOffer;
                app.manualContent.value = ''; // Clear the manual input
                app.originalUrlForManual = null; // Clear the original URL
                handleRouteChange();
                // Start polling immediately if the new offer is processing
                if (newOffer.status === 'processing') {
                    console.log('🚀 Starting polling for new processing offer (manual):', newOffer.id);
                    scheduleNextFetch();
                }
                // Go directly to the new offer's detail page
                window.location.hash = `#/offer/${newOffer.id}`;

            } catch (error) {
                console.error('Error adding offer:', error);
                alert('A network error occurred. Please check your connection and try again.');
            } finally {
                setManualLoadingState(false);
            }
        }
    });

    app.urlInput.addEventListener('paste', (e) => {
        e.preventDefault();
        const pastedText = (e.clipboardData || window.clipboardData).getData('text');
        app.urlInput.value = pastedText;
        submitUrl(pastedText.trim());
    });

    app.manualContent.addEventListener('paste', (e) => {
        e.preventDefault();
        const pastedText = (e.clipboardData || window.clipboardData).getData('text');
        app.manualContent.value = pastedText;
        // Auto-submit the form for manual mode
        app.form.dispatchEvent(new Event('submit'));
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
    
    // Set up mode toggle functionality
    const modeToggle = document.getElementById('mode-toggle');
    modeToggle.addEventListener('change', (e) => {
        const mode = e.target.checked ? 'manual' : 'url';
        switchMode(mode);
    });
    
    // Initialize in automatic (URL) mode
    switchMode('url');
    
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