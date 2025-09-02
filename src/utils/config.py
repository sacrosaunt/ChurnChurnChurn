# A list of common User-Agent strings to rotate through
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/115.0",
]

# Context window size for AI queries
CONTEXT_SIZE = 15000

# Token limits for different types of AI calls
SHORT_PROMPT_MAX_TOKENS = 4096
LONG_PROMPT_MAX_TOKENS = 8192

# Field extraction tasks with prompts
FIELD_EXTRACTION_TASKS = [
    {"param_name": "bank_name", "prompt": "What is the name of the bank? Write it exactly as it appears on the page."},
    {"param_name": "account_title", "prompt": "In 6 words or less, what is the title of the checking account offer?"},
    {"param_name": "bonus_to_be_received", "prompt": "What is the HIGHEST cash bonus amount available in dollars? Look for phrases like 'up to $X', 'earn up to $X', 'get up to $X', or 'maximum $X'. If there are multiple bonus tiers, identify the maximum bonus possible. For offers that say 'up to $X', use the highest amount mentioned. (e.g., 300, 500.50). If not found, respond with '0'."},
    {"param_name": "initial_deposit_amount", "prompt": "What is the initial deposit amount required to open the account? Look for phrases like 'initial deposit', 'opening deposit', 'minimum opening deposit', or 'deposit to open'. This is separate from the qualifying deposit amount for the bonus. (e.g., 25, 100, 500). If not found, respond with '0'."},
    {"param_name": "minimum_deposit_amount", "prompt": "What is the MINIMUM qualifying direct deposit amount required to be ELIGIBLE for ANY bonus? If there are multiple tiers, use the lowest qualifying amount. Look for phrases like 'minimum deposit', 'qualifying deposit', 'required deposit', or 'deposit at least'. (e.g., 1000, 15000). If not found, respond with '0'."},
    {"param_name": "num_required_deposits", "prompt": "As an integer, how many separate qualifying deposits (including direct deposits) are required to earn the bonus? Extract ONLY the number (e.g., '2' from '2 deposits' or 'two deposits'). If not specified, respond with '1'."},
    {"param_name": "deal_expiration_date", "prompt": "Search the text for an offer expiration date, often phrased as 'offer ends', 'must open by', or 'valid through'. Provide the date in YYYY-MM-DD format. If no specific date is found, respond with 'N/A'."},
    {"param_name": "minimum_monthly_fee", "prompt": "What is the lowest possible monthly fee for this account, assuming all waiver conditions are met? Extract ONLY the dollar amount. If the fee can be waived to $0, respond with '0'. If there is a non-waivable fee, provide only that amount. Respond with only a number."},
    {"param_name": "fee_is_conditional", "prompt": "Can the monthly fee be waived by meeting certain conditions (like minimum balance or direct deposits)? Answer only Yes or No."},
    {"param_name": "minimum_daily_balance_required", "prompt": "What is the minimum daily balance required to waive fees or qualify for the bonus? Extract ONLY the dollar amount (e.g., '1500' from '$1,500' or '1500 (checking)'). If multiple values exist, provide the most relevant one. If not found, respond with '0'."},
    {"param_name": "days_for_deposit", "prompt": "Within how many days of opening must the qualifying deposit be made? Extract ONLY the number (e.g., '60' from '60 days' or '2 months'). If not found, respond with 'N/A'."},
    {"param_name": "days_for_bonus", "prompt": "After all requirements are met, how many days until the bonus is paid to the account? Extract ONLY the number (e.g., '90' from '90 days' or '3 months'). If not found, respond with 'N/A'."},
    {"param_name": "must_be_open_for", "prompt": "For how many days must the account be kept open to avoid losing the bonus? Extract ONLY the number (e.g., '90' from '90 days' or '6 months'). If not explicitly stated, identify potential answers that could be inferred. Provide only the number. If not found, respond with 'N/A'."},
    {"param_name": "clawback_clause_present", "prompt": "Is there a clause that mentions the bank can take back the bonus if the account is closed early? Answer only Yes or No."},
    {"param_name": "clawback_details", "prompt": "If there is a clawback clause, briefly describe what triggers it (e.g., 'Close account within 6 months', 'Don't maintain minimum balance'). If no clawback clause, respond with 'N/A'."},
    {"param_name": "total_deposit_required", "prompt": "Calculate the total deposit amount required for this offer. This should be: (minimum qualifying deposit amount) × (number of required deposits). For example, if $1000 is required and 2 deposits are needed, the total would be $2000. Extract ONLY the calculated total amount in dollars."},
    {"param_name": "bonus_tiers", "prompt": "If there are multiple bonus tiers with different deposit requirements, list them in format 'Tier1: $X bonus for $Y deposit, Tier2: $Z bonus for $W deposit'. If only one bonus amount, respond with 'Single tier'."},
    {"param_name": "bonus_tiers_detailed", "prompt": "Extract detailed information for each bonus tier. For each tier, provide: tier number, bonus amount, and deposit requirement. Focus on what the user needs to DO to get the bonus. IMPORTANT: Do NOT create separate tiers for monthly rewards or recurring payments. If a bonus is paid monthly (e.g., $5/month for 12 months = $60 total), list it as ONE tier with the TOTAL amount. Use concise, action-oriented descriptions (max 50 characters). Examples: 'Direct deposit $500+', '$15K deposit + maintain 90 days', 'Open both accounts + direct deposit', '$500/month x 2 months', 'Direct deposit + maintain $2K', 'Open checking + savings + direct deposit'. Format as valid JSON array with DOUBLE QUOTES: [{\"tier\": 1, \"bonus\": 250, \"deposit\": 2000}, {\"tier\": 2, \"bonus\": 350, \"deposit\": \"Direct deposit $500+\"}, {\"tier\": 3, \"bonus\": 500, \"deposit\": \"Open both accounts + direct deposit\"}]. If single tier, respond with 'Single tier'."},
    {"param_name": "total_deposit_by_tier", "prompt": "Calculate total deposit required for each tier (deposit amount × number of required deposits). Format as JSON array: [{'tier': 1, 'total_deposit': 2000}, {'tier': 2, 'total_deposit': 5000}]. If single tier, respond with 'Single tier'."},
]
