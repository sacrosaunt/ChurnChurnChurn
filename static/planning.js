document.addEventListener('DOMContentLoaded', () => {
    // --- TEXT CONTENT ---
    const TEXT_CONTENT = {
        planning: {
            title: 'Smart Planning',
            subtitle: 'Get ROI-based recommendations prioritizing multi-month offers while considering expiration dates',
            payCycleLabel: 'Pay Cycle Duration (days)',
            paycheckLabel: 'Average Paycheck Amount',
            accountsPerPaycycleLabel: 'Accounts per Pay Cycle',
            generatePlanButton: 'Generate Plan',
            planTitle: 'Recommended Order',
            planSubtitle: 'Based on your pay cycle and offer details',
            noUnopenedOffers: 'No unopened offers available for planning',
            planExplanation: 'This plan prioritizes offers based on:',
            planFactors: [
                'Expiration date (earlier = higher priority)',
                'Multi-month completion time (longer = higher priority)',
                'Bonus ROI (bonus amount relative to deposit requirements)',
                'Deposit requirements (lower = higher priority)',
                'Your pay cycle and available funds'
            ],
            priorityScore: 'Priority Score',
            estimatedTimeline: 'Estimated Timeline',
            totalBonus: 'Total Potential Bonus',
            monthlyCost: 'Total Monthly Fees',
            riskLevel: 'Risk Level',
            riskLevels: {
                low: 'Low Risk',
                medium: 'Medium Risk', 
                high: 'High Risk'
            },
            timelineNote: 'Timeline considers your ability to fund multiple accounts per pay cycle. Each offer counts against the pay cycle quota when initiated, regardless of completion time.',
            resetButton: 'Reset Plan',
            savePlanButton: 'Save Plan',
            loadingText: 'Generating Plan...',
            errorMessage: 'Failed to generate plan',
            progressSteps: [
                'Analyzing offers...',
                'Calculating priorities...',
                'Optimizing timeline...',
                'Generating recommendations...',
                'Finalizing plan...'
            ]
        }
    };

    // --- PERSISTENT STORAGE ---
    const STORAGE_KEY = 'planning_settings';
    
    const loadPersistedSettings = () => {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                const settings = JSON.parse(saved);
                document.getElementById('pay-cycle-days').value = settings.payCycleDays || 14;
                document.getElementById('average-paycheck').value = settings.averagePaycheck || 2000;
                document.getElementById('accounts-per-paycycle').value = settings.accountsPerPaycycle || 2;
            } catch (e) {
                console.error('Error loading persisted settings:', e);
            }
        }
    };
    
    const savePersistedSettings = () => {
        const settings = {
            payCycleDays: parseInt(document.getElementById('pay-cycle-days').value) || 14,
            averagePaycheck: parseFloat(document.getElementById('average-paycheck').value) || 2000,
            accountsPerPaycycle: parseInt(document.getElementById('accounts-per-paycycle').value) || 2
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    };

    const saveCurrentPlan = (plan) => {
        const planData = {
            timestamp: new Date().toISOString(),
            payCycleDays: parseInt(document.getElementById('pay-cycle-days').value) || 14,
            averagePaycheck: parseFloat(document.getElementById('average-paycheck').value) || 2000,
            accountsPerPaycycle: parseInt(document.getElementById('accounts-per-paycycle').value) || 2,
            plan: plan
        };
        localStorage.setItem('current_plan', JSON.stringify(planData));
    };

    const loadCurrentPlan = () => {
        const savedPlan = localStorage.getItem('current_plan');
        if (savedPlan) {
            const planData = JSON.parse(savedPlan);
            // Check if plan is less than 24 hours old
            const planAge = Date.now() - new Date(planData.timestamp).getTime();
            const maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
            
            if (planAge < maxAge) {
                return planData.plan;
            } else {
                // Remove expired plan
                localStorage.removeItem('current_plan');
            }
        }
        return null;
    };

    // --- PROGRESS BAR FUNCTIONS ---
    const showProgressBar = () => {
        const progressDiv = document.getElementById('planning-progress');
        const progressText = document.getElementById('progress-text');
        const progressPercentage = document.getElementById('progress-percentage');
        const progressBar = document.getElementById('progress-bar');
        
        progressDiv.classList.remove('hidden');
        progressText.textContent = TEXT_CONTENT.planning.progressSteps[0];
        progressPercentage.textContent = '0%';
        progressBar.style.width = '0%';
    };
    
    const updateProgress = (step, percentage) => {
        const progressText = document.getElementById('progress-text');
        const progressPercentage = document.getElementById('progress-percentage');
        const progressBar = document.getElementById('progress-bar');
        
        if (step < TEXT_CONTENT.planning.progressSteps.length) {
            progressText.textContent = TEXT_CONTENT.planning.progressSteps[step];
        }
        progressPercentage.textContent = `${percentage}%`;
        progressBar.style.width = `${percentage}%`;
    };
    
    const hideProgressBar = () => {
        const progressDiv = document.getElementById('planning-progress');
        progressDiv.classList.add('hidden');
    };
    
    // --- PLANNING FUNCTIONS ---
    const generatePlan = async (payCycleDays, averagePaycheck, accountsPerPaycycle) => {
        try {
            // Show progress bar
            showProgressBar();
            
            // Start progress updates immediately
            updateProgress(0, 10);
            
            // Make the API call
            const response = await fetch('/api/planning/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pay_cycle_days: payCycleDays,
                    average_paycheck: averagePaycheck,
                    accounts_per_paycycle: accountsPerPaycycle
                })
            });
            
            // Update progress during processing
            updateProgress(1, 30);
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to generate plan');
            }
            
            // Update progress as we process the response
            updateProgress(2, 60);
            
            const planData = await response.json();
            
            // Update progress as we render results
            updateProgress(3, 80);
            
            // Final progress update
            updateProgress(4, 100);
            
            // Small delay to show completion
            await new Promise(resolve => setTimeout(resolve, 300));
            
            return planData;
        } catch (error) {
            console.error('Error generating plan:', error);
            throw error;
        }
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(amount);
    };

    const formatDate = (date) => {
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    const getRiskLevelColor = (riskLevel) => {
        switch (riskLevel) {
            case 'low': return 'text-green-600 bg-green-100';
            case 'medium': return 'text-yellow-600 bg-yellow-100';
            case 'high': return 'text-red-600 bg-red-100';
            default: return 'text-gray-600 bg-gray-100';
        }
    };

    const isOptimized = (timing) => {
        // Check if the account opening was delayed for optimization
        const now = new Date();
        const openDate = new Date(timing.account_open_date);
        const daysUntilOpen = Math.ceil((openDate - now) / (1000 * 60 * 60 * 24));
        
        // If opening is delayed by more than 7 days, it's optimized
        return daysUntilOpen > 7;
    };

    const isUrgent = (timing) => {
        // Check if deposit deadline is within 7 days
        const now = new Date();
        const depositDeadline = new Date(timing.deposit_deadline);
        const daysUntilDeadline = Math.ceil((depositDeadline - now) / (1000 * 60 * 60 * 24));
        
        return daysUntilDeadline <= 7;
    };

    const generateMasterTimeline = (timeline) => {
        // Collect all timeline events
        const events = [];
        
        timeline.forEach(item => {
            const offer = item.offer;
            const timing = item.timing;
            
            // Add account opening
            events.push({
                date: new Date(timing.account_open_date),
                type: 'open',
                offer: offer,
                description: `Open ${offer.details.bank_name} account`,
                color: 'blue'
            });
            
            // Add multiple deposits if required
            if (timing.deposits_required > 1) {
                timing.deposit_dates.forEach(deposit => {
                    events.push({
                        date: new Date(deposit.date),
                        type: 'deposit',
                        offer: offer,
                        description: `Make deposit ${deposit.number} (${formatCurrency(deposit.amount)}) to ${offer.details.bank_name}`,
                        color: 'yellow'
                    });
                });
            } else {
                // Single deposit
                events.push({
                    date: new Date(timing.deposit_deadline),
                    type: 'deposit',
                    offer: offer,
                    description: `Make deposit (${formatCurrency(timing.deposit_dates[0].amount)}) to ${offer.details.bank_name}`,
                    color: 'yellow'
                });
            }
            
            // Add bonus payout
            events.push({
                date: new Date(timing.bonus_payout_date),
                type: 'bonus',
                offer: offer,
                description: `Bonus payout from ${offer.details.bank_name}`,
                color: 'green'
            });
            
            // Add account close date if available
            if (timing.account_close_date) {
                events.push({
                    date: new Date(timing.account_close_date),
                    type: 'close',
                    offer: offer,
                    description: `Can close ${offer.details.bank_name} account`,
                    color: 'red'
                });
            }
        });
        
        // Sort events by date
        events.sort((a, b) => a.date - b.date);
        
        // Group events by month for better organization
        const groupedEvents = {};
        events.forEach(event => {
            const monthKey = event.date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
            if (!groupedEvents[monthKey]) {
                groupedEvents[monthKey] = [];
            }
            groupedEvents[monthKey].push(event);
        });
        
        // Generate HTML for grouped events
        return Object.entries(groupedEvents).map(([month, monthEvents]) => `
            <div class="mb-4">
                <h4 class="text-sm font-semibold text-gray-700 mb-2">${month}</h4>
                <div class="space-y-2">
                    ${monthEvents.map(event => `
                        <div class="flex items-center gap-3 p-2 bg-gray-50 rounded">
                            <div class="w-3 h-3 bg-${event.color}-500 rounded-full"></div>
                            <div class="flex-1">
                                <div class="text-sm font-medium">${event.description}</div>
                                <div class="text-xs text-gray-500">${formatDate(event.date)}</div>
                            </div>
                            <div class="text-xs text-gray-400">${event.offer.details.bank_name}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `).join('');
    };

    const renderPlanResults = (plan) => {
        if (!plan) {
            return `
                <div class="text-center py-8 text-gray-500">
                    <p>${TEXT_CONTENT.planning.noUnopenedOffers}</p>
                </div>
            `;
        }
        
        // Check if any offers were excluded due to expiration
        const allOffers = Object.values(window.app?.offers || {});
        const unopenedOffers = allOffers.filter(offer => 
            !offer.user_controlled.opened && 
            !offer.user_controlled.deposited && 
            !offer.user_controlled.received &&
            offer.status !== 'processing' && 
            offer.status !== 'failed'
        );
        
        const excludedOffers = unopenedOffers.filter(offer => 
            !plan.offers.some(planOffer => planOffer.id === offer.id)
        );
        
        let excludedMessage = '';
        if (excludedOffers.length > 0) {
            const expiredOffers = excludedOffers.filter(offer => {
                const expirationDate = offer.details.deal_expiration_date;
                if (expirationDate && expirationDate !== 'N/A') {
                    try {
                        const expiration = new Date(expirationDate);
                        const now = new Date();
                        return expiration < now;
                    } catch (e) {
                        return false;
                    }
                }
                return false;
            });
            
            if (expiredOffers.length > 0) {
                excludedMessage = `
                    <div class="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-r-lg mb-6">
                        <div class="flex">
                            <div class="flex-shrink-0">
                                <svg class="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                                    <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
                                </svg>
                            </div>
                            <div class="ml-3">
                                <p class="text-sm text-yellow-700">
                                    <strong>Note:</strong> ${excludedOffers.length} offer${excludedOffers.length > 1 ? 's' : ''} excluded from plan due to expiration date constraints.
                                </p>
                            </div>
                        </div>
                    </div>
                `;
            }
        }
        
        const { offers, timeline, total_bonus, total_monthly_fees, estimated_duration, total_pay_cycles, accounts_per_paycycle } = plan;
        
        // Calculate timeline in months and days
        const months = Math.floor(estimated_duration / 30);
        const days = estimated_duration % 30;
        const timelineText = months > 0 ? `${months} month${months > 1 ? 's' : ''}${days > 0 ? ` ${days} days` : ''}` : `${days} days`;
        
        return `
            <div class="space-y-6">
                ${excludedMessage}
                <div class="bg-blue-50 border-l-4 border-blue-400 p-4 rounded-r-lg">
                    <div class="flex">
                        <div class="flex-shrink-0">
                            <svg class="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                                <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
                            </svg>
                        </div>
                        <div class="ml-3">
                            <p class="text-sm text-blue-700">
                                ${TEXT_CONTENT.planning.planExplanation}
                            </p>
                            <ul class="mt-2 text-sm text-blue-700 list-disc list-inside">
                                ${TEXT_CONTENT.planning.planFactors.map(factor => `<li>${factor}</li>`).join('')}
                            </ul>
                        </div>
                    </div>
                </div>
                
                ${plan.tier_selections && plan.tier_selections.length > 0 ? `
                <div class="bg-purple-50 border-l-4 border-purple-400 p-4 rounded-r-lg">
                    <div class="flex">
                        <div class="flex-shrink-0">
                            <svg class="h-5 w-5 text-purple-400" viewBox="0 0 20 20" fill="currentColor">
                                <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
                            </svg>
                        </div>
                        <div class="ml-3">
                            <p class="text-sm font-medium text-purple-700">Tier Selections</p>
                            <p class="text-sm text-purple-600 mt-1">The following bonus tiers were selected for optimal ROI:</p>
                            <div class="mt-2 space-y-1">
                                ${plan.tier_selections.map(selection => `
                                    <div class="text-sm text-purple-700">
                                        <span class="font-medium">${selection.bank_name}</span>: ${selection.selected_tier}
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                </div>
                ` : ''}
                
                <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <div class="bg-green-50 p-4 rounded-lg">
                        <p class="text-sm font-medium text-green-800">${TEXT_CONTENT.planning.totalBonus}</p>
                        <p class="text-2xl font-bold text-green-600">${formatCurrency(total_bonus)}</p>
                    </div>
                    <div class="bg-red-50 p-4 rounded-lg">
                        <p class="text-sm font-medium text-red-800">Total Deposit Required</p>
                        <p class="text-2xl font-bold text-red-600">${formatCurrency(offers.reduce((total, offer) => {
                            const initialDeposit = parseFloat(String(offer.details.initial_deposit_amount).replace(/[^0-9.-]+/g,"")) || 0;
                            const minDeposit = parseFloat(String(offer.details.minimum_deposit_amount).replace(/[^0-9.-]+/g,"")) || 0;
                            const depositsRequired = parseInt(String(offer.details.num_required_deposits).replace(/[^0-9]+/g,"")) || 1;
                            const totalDepositRequired = minDeposit * depositsRequired;
                            return total + initialDeposit + totalDepositRequired;
                        }, 0))}</p>
                    </div>
                    <div class="bg-yellow-50 p-4 rounded-lg">
                        <p class="text-sm font-medium text-yellow-800">${TEXT_CONTENT.planning.monthlyCost}</p>
                        <p class="text-2xl font-bold text-yellow-600">${formatCurrency(total_monthly_fees)}</p>
                    </div>
                    <div class="bg-blue-50 p-4 rounded-lg">
                        <p class="text-sm font-medium text-blue-800">${TEXT_CONTENT.planning.estimatedTimeline}</p>
                        <p class="text-2xl font-bold text-blue-600">${timelineText}</p>
                    </div>
                </div>
                
                <div class="space-y-4">
                    <h3 class="text-lg font-semibold text-gray-900">${TEXT_CONTENT.planning.planTitle}</h3>
                    <p class="text-sm text-gray-600 mb-4">${TEXT_CONTENT.planning.planSubtitle}</p>
                    
                    ${timeline.map((item, index) => {
                        const { offer, position, start_date, estimated_completion, pay_cycle } = item;
                        const details = offer.details;
                        const bonus = parseFloat(String(details.bonus_to_be_received).replace(/[^0-9.-]+/g,"")) || 0;
                        const initialDeposit = parseFloat(String(details.initial_deposit_amount).replace(/[^0-9.-]+/g,"")) || 0;
                        const minDeposit = parseFloat(String(details.minimum_deposit_amount).replace(/[^0-9.-]+/g,"")) || 0;
                        const totalDeposit = parseFloat(String(details.total_deposit_required).replace(/[^0-9.-]+/g,"")) || 0;
                        const depositsRequired = parseInt(String(details.num_required_deposits).replace(/[^0-9]+/g,"")) || 1;
                        
                        // Check if this is a tier variant
                        const isTierVariant = offer.is_tier_variant;
                        const tierInfo = offer.tier_info;
                        const originalOfferId = offer.original_offer_id;
                        
                        // Get tier display info
                        let tierDisplay = '';
                        if (isTierVariant && tierInfo) {
                            tierDisplay = `
                                <div class="bg-purple-50 border-l-4 border-purple-400 p-3 rounded-r-lg mb-3">
                                    <div class="flex items-center gap-2">
                                        <svg class="h-4 w-4 text-purple-400" viewBox="0 0 20 20" fill="currentColor">
                                            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
                                        </svg>
                                        <span class="text-sm font-medium text-purple-700">Selected Tier: ${tierInfo.description}</span>
                                    </div>
                                    <p class="text-xs text-purple-600 mt-1">This tier was selected based on optimal ROI and your deposit capacity.</p>
                                </div>
                            `;
                        }
                        
                        return `
                            <div class="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors bg-white shadow-sm cursor-pointer" data-offer-id="${offer.id}" onclick="window.location.href='/#/offer/${originalOfferId || offer.id}?from=planning'">
                                <div class="flex items-start justify-between">
                                    <div class="flex-1">
                                        ${tierDisplay}
                                        <div class="flex items-center gap-3 mb-2">
                                            <span class="bg-blue-600 text-white text-sm font-bold rounded-full w-8 h-8 flex items-center justify-center">
                                                ${position}
                                            </span>
                                            <div>
                                                <h4 class="font-semibold text-gray-900">${details.bank_name || 'Unknown Bank'}</h4>
                                                <p class="text-sm text-gray-600">${details.account_title || 'Unknown Account'}</p>
                                                <p class="text-xs text-gray-500 mt-1">Offer #${originalOfferId || offer.id} - Deposit Requirements</p>
                                            </div>
                                        </div>
                                        
                                        <div class="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                                            <div>
                                                <span class="text-gray-500">Bonus:</span>
                                                <span class="font-semibold text-green-600 ml-1">${formatCurrency(bonus)}</span>
                                            </div>
                                            <div>
                                                <span class="text-gray-500">Initial Deposit:</span>
                                                <span class="font-semibold ml-1">${formatCurrency(initialDeposit)}</span>
                                            </div>
                                            <div>
                                                <span class="text-gray-500">Total Required:</span>
                                                <span class="font-semibold ml-1">${formatCurrency(totalDeposit)}</span>
                                            </div>
                                            <div>
                                                <span class="text-gray-500">${TEXT_CONTENT.planning.priorityScore}:</span>
                                                <span class="font-semibold text-blue-600 ml-1">${offer.priority_score}</span>
                                            </div>
                                            <div>
                                                <span class="text-gray-500">Initiated in:</span>
                                                <span class="font-semibold text-purple-600 ml-1">Pay Cycle ${pay_cycle}</span>
                                            </div>
                                        </div>
                                        
                                        <div class="flex items-center gap-4 mt-3">
                                            <div>
                                                <span class="text-gray-500 text-sm">Start:</span>
                                                <span class="font-medium text-sm ml-1">${formatDate(new Date(item.timing.account_open_date))}</span>
                                            </div>
                                            <div>
                                                <span class="text-gray-500 text-sm">Complete:</span>
                                                <span class="font-medium text-sm ml-1">${formatDate(new Date(estimated_completion))}</span>
                                            </div>
                                            <div>
                                                <span class="text-gray-500 text-sm">${TEXT_CONTENT.planning.riskLevel}:</span>
                                                <span class="px-2 py-1 text-xs font-medium rounded-full ${getRiskLevelColor(offer.risk_level)} ml-1">
                                                    ${TEXT_CONTENT.planning.riskLevels[offer.risk_level]}
                                                </span>
                                            </div>
                                        </div>
                                        
                                        <!-- Timeline Actions -->
                                        <div class="mt-4 bg-gray-50 p-3 rounded-lg">
                                            <h5 class="text-sm font-semibold text-gray-700 mb-2">Timeline Actions:</h5>
                                            <div class="space-y-2 text-xs">
                                                <div class="flex items-center gap-2">
                                                    <div class="w-2 h-2 bg-blue-500 rounded-full"></div>
                                                    <span class="text-gray-600">Open Account:</span>
                                                    <span class="font-medium">${formatDate(new Date(item.timing.account_open_date))}</span>
                                                    ${isOptimized(item.timing) ? '<span class="text-blue-600 text-xs">(Optimized)</span>' : ''}
                                                </div>
                                                ${item.timing.deposits_required > 1 ? 
                                                    item.timing.deposit_dates.map(deposit => `
                                                        <div class="flex items-center gap-2">
                                                            <div class="w-2 h-2 bg-yellow-500 rounded-full"></div>
                                                            <span class="text-gray-600">Make Deposit ${deposit.number} (${formatCurrency(deposit.amount)}):</span>
                                                            <span class="font-medium">${formatDate(new Date(deposit.date))}</span>
                                                            ${isUrgent({ deposit_deadline: deposit.date }) ? '<span class="text-red-600 text-xs">(Urgent)</span>' : ''}
                                                        </div>
                                                    `).join('') :
                                                    `<div class="flex items-center gap-2">
                                                        <div class="w-2 h-2 bg-yellow-500 rounded-full"></div>
                                                        <span class="text-gray-600">Make Deposit (${formatCurrency(item.timing.deposit_dates[0].amount)}):</span>
                                                        <span class="font-medium">${formatDate(new Date(item.timing.deposit_deadline))}</span>
                                                        ${isUrgent(item.timing) ? '<span class="text-red-600 text-xs">(Urgent)</span>' : ''}
                                                    </div>`
                                                }
                                                <div class="flex items-center gap-2">
                                                    <div class="w-2 h-2 bg-green-500 rounded-full"></div>
                                                    <span class="text-gray-600">Bonus Payout:</span>
                                                    <span class="font-medium">${formatDate(new Date(item.timing.bonus_payout_date))}</span>
                                                </div>
                                                ${item.timing.account_close_date ? `
                                                <div class="flex items-center gap-2">
                                                    <div class="w-2 h-2 bg-red-500 rounded-full"></div>
                                                    <span class="text-gray-600">Can Close Account:</span>
                                                    <span class="font-medium">${formatDate(new Date(item.timing.account_close_date))}</span>
                                                </div>
                                                ` : ''}
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div class="flex-shrink-0 ml-4">
                                        <a href="/#/offer/${originalOfferId || offer.id}?from=planning" class="text-blue-600 hover:text-blue-800 text-sm font-medium" onclick="event.stopPropagation()">
                                            View Details →
                                        </a>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
                
                <!-- Master Timeline -->
                <div class="bg-white p-6 rounded-lg shadow-md">
                    <h3 class="text-lg font-semibold text-gray-900 mb-4">Master Timeline</h3>
                    <div class="space-y-3">
                        ${generateMasterTimeline(timeline)}
                    </div>
                </div>
                
                <div class="bg-gray-50 p-4 rounded-lg">
                    <p class="text-sm text-gray-600">${TEXT_CONTENT.planning.timelineNote}</p>
                </div>
                
                <div class="flex justify-end gap-3">
                    <button id="save-plan-btn" class="bg-green-600 text-white font-semibold px-4 py-2 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition duration-200">
                        ${TEXT_CONTENT.planning.savePlanButton}
                    </button>
                </div>
            </div>
        `;
    };

    // --- EVENT LISTENERS ---
    const setupEventListeners = () => {
        const generatePlanBtn = document.getElementById('generate-plan-btn');
        const savePlanBtn = document.getElementById('save-plan-btn');
        
        // Save settings when inputs change
        const inputs = ['pay-cycle-days', 'average-paycheck', 'accounts-per-paycycle'];
        inputs.forEach(id => {
            const input = document.getElementById(id);
            if (input) {
                input.addEventListener('change', savePersistedSettings);
            }
        });
        
        if (generatePlanBtn) {
            generatePlanBtn.addEventListener('click', async () => {
                const payCycleDays = parseInt(document.getElementById('pay-cycle-days').value) || 14;
                const averagePaycheck = parseFloat(document.getElementById('average-paycheck').value) || 2000;
                const accountsPerPaycycle = parseInt(document.getElementById('accounts-per-paycycle').value) || 2;
                
                try {
                    generatePlanBtn.disabled = true;
                    generatePlanBtn.textContent = TEXT_CONTENT.planning.loadingText;
                    
                    const plan = await generatePlan(payCycleDays, averagePaycheck, accountsPerPaycycle);
                    const resultsDiv = document.getElementById('planning-results');
                    resultsDiv.innerHTML = renderPlanResults(plan);
                    resultsDiv.classList.remove('hidden');
                    
                    // Save the current plan
                    saveCurrentPlan(plan);
                    
                    // Hide no offers message if it was showing
                    const noOffersDiv = document.getElementById('no-unopened-offers');
                    if (noOffersDiv) {
                        noOffersDiv.classList.add('hidden');
                    }
                    
                    // Setup save button event listener
                    setupSaveButton();
                    
                    // Add hover effects to highlight specific offers
                    document.querySelectorAll('[data-offer-id]').forEach(card => {
                        card.addEventListener('mouseenter', () => {
                            card.classList.add('ring-2', 'ring-blue-200');
                        });
                        card.addEventListener('mouseleave', () => {
                            card.classList.remove('ring-2', 'ring-blue-200');
                        });
                    });
                    
                } catch (error) {
                    console.error('Error generating plan:', error);
                    alert(TEXT_CONTENT.planning.errorMessage + ': ' + error.message);
                } finally {
                    generatePlanBtn.disabled = false;
                    generatePlanBtn.textContent = TEXT_CONTENT.planning.generatePlanButton;
                    hideProgressBar();
                }
            });
        }
    };

    const setupSaveButton = () => {
        const savePlanBtn = document.getElementById('save-plan-btn');
        if (savePlanBtn) {
            savePlanBtn.addEventListener('click', () => {
                const planData = {
                    timestamp: new Date().toISOString(),
                    payCycleDays: parseInt(document.getElementById('pay-cycle-days').value) || 14,
                    averagePaycheck: parseFloat(document.getElementById('average-paycheck').value) || 2000,
                    accountsPerPaycycle: parseInt(document.getElementById('accounts-per-paycycle').value) || 2,
                    planHtml: document.getElementById('planning-results').innerHTML
                };
                
                localStorage.setItem('saved_plan', JSON.stringify(planData));
                
                // Show success message
                const alert = document.createElement('div');
                alert.className = 'fixed top-4 right-4 bg-green-100 border-l-4 border-green-500 text-green-700 p-4 rounded shadow-lg z-50';
                alert.innerHTML = `
                    <div class="flex">
                        <div class="flex-shrink-0">
                            <svg class="h-5 w-5 text-green-500" viewBox="0 0 20 20" fill="currentColor">
                                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                            </svg>
                        </div>
                        <div class="ml-3">
                            <p class="text-sm">Plan saved successfully!</p>
                        </div>
                    </div>
                `;
                document.body.appendChild(alert);
                
                setTimeout(() => {
                    if (alert.parentNode) {
                        alert.parentNode.removeChild(alert);
                    }
                }, 3000);
            });
        }
    };

    // --- INITIALIZATION ---
    loadPersistedSettings();
    setupEventListeners();
    
    // Load current plan if available
    const currentPlan = loadCurrentPlan();
    if (currentPlan) {
        const resultsDiv = document.getElementById('planning-results');
        resultsDiv.innerHTML = renderPlanResults(currentPlan);
        resultsDiv.classList.remove('hidden');
        
        // Hide no offers message if it was showing
        const noOffersDiv = document.getElementById('no-unopened-offers');
        if (noOffersDiv) {
            noOffersDiv.classList.add('hidden');
        }
        
        // Setup save button event listener
        setupSaveButton();
        
        // Add hover effects to highlight specific offers
        document.querySelectorAll('[data-offer-id]').forEach(card => {
            card.addEventListener('mouseenter', () => {
                card.classList.add('ring-2', 'ring-blue-200');
            });
            card.addEventListener('mouseleave', () => {
                card.classList.remove('ring-2', 'ring-blue-200');
            });
        });
    }
}); 