import os
import threading
import google.generativeai as genai
from flask import Flask, jsonify, request, render_template, send_from_directory
import requests
from bs4 import BeautifulSoup
import time
import random
import re
import json
import pickle
from openai import OpenAI

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
from datetime import datetime
from planning_logic import PlanningLogic

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
    {"param_name": "bonus_to_be_received", "prompt": "What is the HIGHEST cash bonus amount available in dollars? If there are multiple bonus tiers, identify the maximum bonus possible. (e.g., 300, 500.50). If not found, respond with '0'."},
    {"param_name": "initial_deposit_amount", "prompt": "What is the initial deposit amount required to open the account? Look for phrases like 'initial deposit', 'opening deposit', 'minimum opening deposit', or 'deposit to open'. This is separate from the qualifying deposit amount for the bonus. (e.g., 25, 100, 500). If not found, respond with '0'."},
    {"param_name": "minimum_deposit_amount", "prompt": "What is the MINIMUM qualifying direct deposit amount required to be ELIGIBLE for ANY bonus? If there are multiple tiers, use the lowest qualifying amount. Look for phrases like 'minimum deposit', 'qualifying deposit', 'required deposit', or 'deposit at least'. (e.g., 1000, 15000). If not found, respond with '0'."},
    {"param_name": "num_required_deposits", "prompt": "As an integer, how many separate qualifying deposits (including direct deposits) are required to earn the bonus? If not specified, respond with '1'."},
    {"param_name": "deal_expiration_date", "prompt": "Search the text for an offer expiration date, often phrased as 'offer ends', 'must open by', or 'valid through'. Provide the date in YYYY-MM-DD format. If no specific date is found, respond with 'N/A'."},
    {"param_name": "minimum_monthly_fee", "prompt": "What is the lowest possible monthly fee for this account, assuming all waiver conditions are met? If the fee can be waived to $0, the answer is '0'. If there is a non-waivable fee, state that amount. Respond with only a number."},
    {"param_name": "fee_is_conditional", "prompt": "Can the monthly fee be waived by meeting certain conditions (like minimum balance or direct deposits)? Answer only Yes or No."},
    {"param_name": "minimum_daily_balance_required", "prompt": "What is the minimum daily balance required to waive fees or qualify for the bonus? If not found, respond with '0'."},
    {"param_name": "days_for_deposit", "prompt": "Within how many days of opening must the qualifying deposit be made? If not found, respond with 'N/A'."},
    {"param_name": "days_for_bonus", "prompt": "After all requirements are met, how many days until the bonus is paid to the account? Do not use any words other than 'days'. If not found, respond with 'N/A'."},
    {"param_name": "must_be_open_for", "prompt": "For how many days must the account be kept open to avoid losing the bonus? (e.g., 90, 180). If not explicitly stated, identify potentialy answers that could be inferred. Output just the number, followed by the word 'days'. If not found, respond with just 'N/A'."},
    {"param_name": "clawback_clause_present", "prompt": "Is there a clause that mentions the bank can take back the bonus if the account is closed early? Answer only Yes or No."},
    {"param_name": "clawback_details", "prompt": "If there is a clawback clause, briefly describe what triggers it (e.g., 'Close account within 6 months', 'Don't maintain minimum balance'). If no clawback clause, respond with 'N/A'."},
    {"param_name": "total_deposit_required", "prompt": "Calculate the total deposit amount required for this offer. This should be: (minimum qualifying deposit amount) × (number of required deposits). For example, if $1000 is required and 2 deposits are needed, the total would be $2000. Provide only the total amount in dollars."},
    {"param_name": "bonus_tiers", "prompt": "If there are multiple bonus tiers with different deposit requirements, list them in format 'Tier1: $X bonus for $Y deposit, Tier2: $Z bonus for $W deposit'. If only one bonus amount, respond with 'Single tier'."},
    {"param_name": "bonus_tiers_detailed", "prompt": "Extract detailed information for each bonus tier. For each tier, provide: tier number, bonus amount, and deposit requirement. Format as JSON array: [{'tier': 1, 'bonus': 250, 'deposit': 2000}, {'tier': 2, 'bonus': 350, 'deposit': 5000}]. If single tier, respond with 'Single tier'."},
    {"param_name": "total_deposit_by_tier", "prompt": "Calculate total deposit required for each tier (deposit amount × number of required deposits). Format as JSON array: [{'tier': 1, 'total_deposit': 2000}, {'tier': 2, 'total_deposit': 5000}]. If single tier, respond with 'Single tier'."},
]

# --- AI Configuration ---
# The model will read the API key from the GEMINI_API_KEY environment variable.
try:
    genai.configure(api_key=os.environ["GEMINI_API_KEY"])
    generation_config = {
        "temperature": 0,
        "top_p": 1,
        "top_k": 1,
        "max_output_tokens": LONG_PROMPT_MAX_TOKENS,
    }

    # Initialize both models
    flash_model = genai.GenerativeModel(
        model_name="gemini-2.5-flash",
        generation_config=generation_config
    )
    pro_model = genai.GenerativeModel(
        model_name="gemini-2.5-pro",
        generation_config=generation_config
    )
    print("✅ Gemini AI Models (Flash & Pro) configured successfully.")
except KeyError:
    print("❌ ERROR: GEMINI_API_KEY environment variable not found.")
    print("Please set the variable and restart the application.")
    flash_model = None
    pro_model = None
except Exception as e:
    print(f"An error occurred during Gemini configuration: {e}")
    flash_model = None
    pro_model = None

# --- OpenAI Configuration ---
try:
    
    openai_model_default = "gpt-4.1"
    if os.environ.get("OPENAI_API_KEY"):
        print("✅ OpenAI configured successfully.")
        OPENAI_ENABLED = True
    else:
        print("⚠️  OPENAI_API_KEY not set. ChatGPT features disabled.")
        OPENAI_ENABLED = False
except Exception as e:
    print(f"An error occurred while configuring OpenAI: {e}")
    openai_model_default = None

# --- Flask App ---
app = Flask(__name__, static_folder='static')

# Storage configuration
STORAGE_DIR = 'data'
OFFERS_FILE = os.path.join(STORAGE_DIR, 'offers.json')
NEXT_ID_FILE = os.path.join(STORAGE_DIR, 'next_id.txt')

# Ensure storage directory exists
os.makedirs(STORAGE_DIR, exist_ok=True)

def load_offers():
    """Load offers from local storage."""
    global offers, next_offer_id
    
    try:
        if os.path.exists(OFFERS_FILE):
            with open(OFFERS_FILE, 'r', encoding='utf-8') as f:
                offers_data = json.load(f)
                # Convert string keys back to integers
                offers = {int(k): v for k, v in offers_data.items()}
                print(f"✅ Loaded {len(offers)} offers from storage")
        else:
            offers = {}
            print("📁 No offers file found, starting fresh")
    except Exception as e:
        print(f"❌ Error loading offers: {e}")
        offers = {}
    
    try:
        if os.path.exists(NEXT_ID_FILE):
            with open(NEXT_ID_FILE, 'r') as f:
                next_offer_id = int(f.read().strip())
                print(f"✅ Loaded next offer ID: {next_offer_id}")
        else:
            next_offer_id = 1
            print("📁 No next ID file found, starting with ID 1")
    except Exception as e:
        print(f"❌ Error loading next ID: {e}")
        next_offer_id = 1

def save_offers():
    """Save offers to local storage."""
    try:
        # Convert offers to JSON-serializable format
        offers_data = {str(k): v for k, v in offers.items()}
        
        with open(OFFERS_FILE, 'w', encoding='utf-8') as f:
            json.dump(offers_data, f, indent=2, ensure_ascii=False)
        
        with open(NEXT_ID_FILE, 'w') as f:
            f.write(str(next_offer_id))
        
        print(f"💾 Saved {len(offers)} offers to storage")
    except Exception as e:
        print(f"❌ Error saving offers: {e}")

def save_offer(offer_id):
    """Save a single offer to storage."""
    try:
        # Load current data
        if os.path.exists(OFFERS_FILE):
            with open(OFFERS_FILE, 'r', encoding='utf-8') as f:
                offers_data = json.load(f)
        else:
            offers_data = {}
        
        # Update with new offer
        offers_data[str(offer_id)] = offers[offer_id]
        
        # Save back to file
        with open(OFFERS_FILE, 'w', encoding='utf-8') as f:
            json.dump(offers_data, f, indent=2, ensure_ascii=False)
        
        # Update next ID
        with open(NEXT_ID_FILE, 'w') as f:
            f.write(str(next_offer_id))
        
        print(f"💾 Saved offer {offer_id} to storage")
    except Exception as e:
        print(f"❌ Error saving offer {offer_id}: {e}")

def delete_offer_from_storage(offer_id):
    """Delete a single offer from storage."""
    try:
        if os.path.exists(OFFERS_FILE):
            with open(OFFERS_FILE, 'r', encoding='utf-8') as f:
                offers_data = json.load(f)
            
            # Remove the offer
            if str(offer_id) in offers_data:
                del offers_data[str(offer_id)]
                
                # Save back to file
                with open(OFFERS_FILE, 'w', encoding='utf-8') as f:
                    json.dump(offers_data, f, indent=2, ensure_ascii=False)
                
                print(f"🗑️ Deleted offer {offer_id} from storage")
    except Exception as e:
        print(f"❌ Error deleting offer {offer_id} from storage: {e}")

def backup_offers():
    """Create a backup of the offers data."""
    try:
        if os.path.exists(OFFERS_FILE):
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_file = os.path.join(STORAGE_DIR, f'offers_backup_{timestamp}.json')
            
            with open(OFFERS_FILE, 'r', encoding='utf-8') as f:
                offers_data = json.load(f)
            
            with open(backup_file, 'w', encoding='utf-8') as f:
                json.dump(offers_data, f, indent=2, ensure_ascii=False)
            
            print(f"💾 Created backup: {backup_file}")
            return backup_file
    except Exception as e:
        print(f"❌ Error creating backup: {e}")
        return None

def get_storage_stats():
    """Get statistics about the stored data."""
    try:
        stats = {
            'total_offers': len(offers),
            'completed_offers': len([o for o in offers.values() if o.get('status') == 'completed']),
            'failed_offers': len([o for o in offers.values() if o.get('status') == 'failed']),
            'processing_offers': len([o for o in offers.values() if o.get('status') == 'processing']),
            'storage_file_size': os.path.getsize(OFFERS_FILE) if os.path.exists(OFFERS_FILE) else 0,
            'next_offer_id': next_offer_id
        }
        return stats
    except Exception as e:
        print(f"❌ Error getting storage stats: {e}")
        return {}

# Initialize data store
load_offers()

def call_gemini(prompt, model_instance, use_short_tokens=False):
    """Generic function to call a specific Gemini API model and return the text response."""
    if not model_instance:
        return "AI Model Not Configured"
    
    # Determine token limit based on prompt type
    token_limit = SHORT_PROMPT_MAX_TOKENS if use_short_tokens else LONG_PROMPT_MAX_TOKENS
    
    # Try Gemini once, then retry once if it fails
    for attempt in range(2):
        try:
            # Create a temporary model instance with the appropriate token limit
            temp_config = {
                "temperature": 0,
                "top_p": 1,
                "top_k": 1,
                "max_output_tokens": token_limit,
            }
            
            # Create a temporary model with the specific token limit
            temp_model = genai.GenerativeModel(
                model_name=model_instance.model_name,
                generation_config=temp_config
            )
            
            response = temp_model.generate_content(prompt)
            
            if response.candidates and response.candidates[0].content and response.candidates[0].content.parts:
                 text = response.candidates[0].content.parts[0].text
                 cleaned_text = text.strip().replace("`", "").replace("*", "")
                 # Ensure we don't return completely empty responses
                 if not cleaned_text:
                     print(f"Gemini response from {model_instance.model_name} was empty after cleaning (attempt {attempt + 1}/2). Original: '{text}'")
                     if attempt == 0:
                         print(f"Retrying... (attempt 2/2)")
                         continue
                     else:
                         print(f"Both Gemini attempts failed. Falling back to OpenAI")
                         break
                 return cleaned_text
            else:
                print(f"Gemini response from {model_instance.model_name} was empty or blocked (attempt {attempt + 1}/2). Full response:", response)
                if attempt == 0:
                    print(f"Retrying... (attempt 2/2)")
                    continue
                else:
                    print(f"Both Gemini attempts failed. Falling back to OpenAI")
                    break
        except Exception as e:
            print(f"Error calling Gemini API ({model_instance.model_name}) (attempt {attempt + 1}/2): {e}")
            if attempt == 0:
                print(f"Retrying... (attempt 2/2)")
                continue
            else:
                print(f"Both Gemini attempts failed. Falling back to OpenAI")
                break
    
    # Gemini failed twice; fall back to OpenAI if available
    if OPENAI_ENABLED and openai_model_default:
        print("🔄 Gemini failed twice – switching to OpenAI as fallback")
        return call_ai(prompt, openai_model_default, use_short_tokens)
    # If OpenAI not available, return error
    return "AI Error: Gemini failed and OpenAI not available"

# --- Unified AI Call Helper ---

def call_ai(prompt, model, use_short_tokens=False):
    """Generic AI call supporting both Gemini model instances and OpenAI ChatGPT model names (string)."""
    # If model is a string -> assume OpenAI ChatCompletion
    if isinstance(model, str):
        if not OPENAI_ENABLED:
            return "AI Model Not Configured"
        try:
            # Determine token limit based on prompt type
            token_limit = SHORT_PROMPT_MAX_TOKENS if use_short_tokens else LONG_PROMPT_MAX_TOKENS
            
            response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=token_limit)
            if response.choices and response.choices[0].message:
                return response.choices[0].message.content.strip()
            return "AI Error: No content returned"
        except Exception as e:
            print(f"OpenAI API error: {e}")
            return "AI Error"
    else:
        # Fallback to Gemini style call (reuse call_gemini)
        return call_gemini(prompt, model, use_short_tokens)


def is_banking_offer_page(content):
    """Uses AI to determine if the page content is a banking offer."""
    prompt = f"""
    Analyze the following text from a webpage. Does it describe a bank account bonus, promotion, or new account offer?
    Please answer with only 'yes' or 'no'.

    --- TEXT START ---
    {content[-CONTEXT_SIZE:]}
    --- TEXT END ---
    """
    response = call_gemini(prompt, flash_model, use_short_tokens=True)
    print(f"AI Check for Banking Offer Page. Response: '{response}'")
    return "yes" in response.lower()

def normalize_url_for_comparison(url):
    """Normalize URL by removing common referral parameters and fragments."""
    from urllib.parse import urlparse, parse_qs, urlunparse
    
    # Parse the URL
    parsed = urlparse(url)
    
    # Get query parameters
    query_params = parse_qs(parsed.query)
    
    # Remove common referral/tracking parameters
    referral_params = [
        'ref', 'referrer', 'referral', 'source', 'utm_source', 'utm_medium', 
        'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid',
        'mc_cid', 'mc_eid', 'affiliate', 'partner', 'tracking', 'campaign',
        'clickid', 'adid', 'ad_id', 'creative', 'placement', 'network',
        'device', 'device_type', 'platform', 'os', 'browser', 'geo',
        'country', 'region', 'city', 'zip', 'postal', 'state', 'province',
        'language', 'lang', 'locale', 'currency', 'timezone', 'timestamp',
        'session', 'user', 'visitor', 'customer', 'client', 'account',
        'member', 'subscriber', 'newsletter', 'email', 'phone', 'mobile',
        'desktop', 'tablet', 'ios', 'android', 'windows', 'mac', 'linux',
        'chrome', 'firefox', 'safari', 'edge', 'opera', 'ie', 'internet_explorer'
    ]
    
    # Remove referral parameters
    for param in referral_params:
        if param in query_params:
            del query_params[param]
    
    # Rebuild query string
    new_query = '&'.join([f"{k}={v[0]}" for k, v in query_params.items()]) if query_params else ''
    
    # Reconstruct URL without fragment and with cleaned query
    normalized_url = urlunparse((
        parsed.scheme,
        parsed.netloc,
        parsed.path,
        parsed.params,
        new_query,
        ''  # Remove fragment
    ))
    
    return normalized_url

def check_existing_accounts_with_same_bank(bank_name, current_offer_id):
    """Check if user has any opened accounts with the same bank."""
    global offers
    
    if not bank_name or bank_name.lower() in ['processing...', 'n/a', 'ai error']:
        return []
    
    existing_accounts = []
    for offer_id, offer in offers.items():
        if offer_id == current_offer_id:
            continue  # Skip the current offer
            
        if (offer['user_controlled']['opened'] and 
            offer['details'].get('bank_name') and 
            offer['details']['bank_name'].lower() == bank_name.lower()):
            existing_accounts.append({
                'id': offer_id,
                'account_title': offer['details'].get('account_title', 'Unknown Account'),
                'status': 'opened'
            })
    
    return existing_accounts

def check_duplicate_offer(url):
    """Check if we're already tracking this offer using smart URL comparison."""
    global offers
    
    normalized_new_url = normalize_url_for_comparison(url)
    
    for offer_id, offer in offers.items():
        normalized_existing_url = normalize_url_for_comparison(offer['url'])
        
        # Check if normalized URLs match
        if normalized_new_url == normalized_existing_url:
            return offer_id
        
        # Additional check: if both URLs have the same domain and similar paths
        from urllib.parse import urlparse
        new_parsed = urlparse(normalized_new_url)
        existing_parsed = urlparse(normalized_existing_url)
        
        # If same domain and similar path structure, it might be the same offer
        if (new_parsed.netloc == existing_parsed.netloc and
            new_parsed.path.split('/')[-1] == existing_parsed.path.split('/')[-1]):
            return offer_id
    
    return None

def extract_offer_details_with_ai(summary_content, raw_text, offer_id):
    """Sends parallel AI queries to extract offer details from a summary."""
    global offers

    def extract_detail(param_name, prompt):
        """Runs a single AI query in a thread using the flash model against the summary."""
        print(f"🚀 Starting AI query for: {param_name}")
        full_prompt = f"""
        Based on the summarized text below, answer the following question.
        Provide only the answer, without any extra explanation.

        Question: {prompt}

        --- SUMMARY TEXT START ---
        {summary_content}
        --- SUMMARY TEXT END ---
        """
        result = call_gemini(full_prompt, flash_model, use_short_tokens=True)
        
        if offer_id in offers and 'details' in offers[offer_id]:
             offers[offer_id]['details'][param_name] = result
             # Save the updated offer to storage
             save_offer(offer_id)
        print(f"✅ Finished AI query for: {param_name} -> {result}")

    threads = []
    for task in FIELD_EXTRACTION_TASKS:
        thread = threading.Thread(target=extract_detail, args=(task["param_name"], task["prompt"]))
        threads.append(thread)
        thread.start()

    for thread in threads:
        thread.join()

    if offer_id in offers:
        offers[offer_id]['processing_step'] = "Analyzing Fine Print"
        extracted_data = offers[offer_id]['details']
        context_summary = "\n".join([f"- {key.replace('_', ' ').title()}: {value}" for key, value in extracted_data.items() if value != 'Processing...'])
        
        # Check for existing accounts with the same bank
        bank_name = extracted_data.get('bank_name', '')
        existing_accounts = check_existing_accounts_with_same_bank(bank_name, offer_id)
        
        existing_accounts_info = ""
        if existing_accounts:
            existing_accounts_info = f"""
IMPORTANT CONTEXT: The user has {len(existing_accounts)} existing opened account(s) with {bank_name}:
{chr(10).join([f"- {account['account_title']} (ID: {account['id']})" for account in existing_accounts])}

This information is crucial because many bank offers are restricted to "new customers only" or have specific eligibility requirements for existing customers. Pay special attention to any terms about:
- New customer requirements
- Existing customer restrictions
- Eligibility for current account holders
- Whether the offer applies to existing customers
- Any special terms for current account holders
"""
        
        considerations_prompt = f"""
        You have already extracted the following information about a bank offer:
        {context_summary}
        {existing_accounts_info}

        Now, analyze the original raw website text below for CRUCIAL details that are NOT ALREADY MENTIONED in the information above. Focus ONLY on information DIRECTLY or INDIRECTLY related to:
        - Claiming the bonus (requirements, processes, eligibility)
        - Anything that might PREVENT the user from claiming the bonus (disqualifications, exclusions, penalties)
        - Critical deadlines or time-sensitive requirements for bonus eligibility
        - Important exclusions or disqualifying conditions
        - Unusual terms that could cause bonus loss or clawback
        - Hidden fees or charges that could reduce the bonus value
        - Specific requirements that are easy to miss and could disqualify the user
        - Important limitations or restrictions on bonus claiming
        - New customer vs existing customer eligibility requirements
        - Whether the offer is restricted to new customers only
        - Multiple bonus tiers and their different requirements

        List UP TO 6 (can be less or even zero) of the most critical points as a newline-separated list. Each line MUST start with 'GOOD:', 'WARNING:', or 'CAUTION:'.
        GOOD is something beneficial to the user (relating to the bonus), CAUTION is something the user should be aware of, and WARNING is something that could prevent the user from claiming the bonus.
        Limit GOOD considerations to 3 maximum. DO NOT repeat information already extracted above. Focus only on truly crucial, unique details that could make or break the bonus. 

        IMPORTANT: Write clear statements that users can understand without additional context. Each sentence should be concise.

        If no such critical points are found, you MUST respond with 'N/A'. Do not use any kind of formatting or markdown.

        --- RAW WEBSITE TEXT START ---
        {raw_text[-CONTEXT_SIZE:]}
        --- RAW WEBSITE TEXT END ---
        """
        
        print("🚀 Starting AI query for: additional_considerations (ChatGPT/Gemini context)")
        model_for_considerations = openai_model_default if openai_model_default else flash_model
        result = call_ai(considerations_prompt, model_for_considerations, use_short_tokens=False)
        
        # Ensure we have a meaningful response
        if not result or result.strip() == "" or result.strip().lower() in ["", "none", "nothing"]:
            result = "N/A"
            print("⚠️ Additional considerations returned empty, setting to N/A")
            
        offers[offer_id]['details']['additional_considerations'] = result
        print(f"✅ Finished AI query for: additional_considerations -> '{result}'")

    if offer_id in offers:
        offers[offer_id]['processing_step'] = "Done"
        print(f"🎉 All AI processing finished for offer {offer_id}")
        
        # Brief delay to ensure "Done" step is visible in UI before status change
        time.sleep(1.0)
        
        offers[offer_id]['status'] = 'completed'
        # Save the completed offer to storage
        save_offer(offer_id)
        print(f"✅ Offer {offer_id} status set to completed")


def scrape_and_process_url(url, offer_id):
    """Scrapes, summarizes, and triggers the AI extraction process."""
    global offers
    try:
        offers[offer_id]['processing_step'] = "Scraping Website"
        
        print(f"Scraping URL: {url}")
        session = requests.Session()
        headers = {
            'User-Agent': random.choice(USER_AGENTS),
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'DNT': '1',
        }
        response = session.get(url, headers=headers, timeout=15, allow_redirects=True)
        response.raise_for_status()

        offers[offer_id]['processing_step'] = "Validating Offer"

        print("Scraping successful. Parsing content...")
        soup = BeautifulSoup(response.text, 'html.parser')
        body_content = soup.body
        if body_content:
            for script_or_style in body_content(["script", "style"]):
                script_or_style.decompose()
            page_text = " ".join(body_content.stripped_strings)
        else:
            page_text = ""

        if not page_text:
            raise ValueError("Could not find any text content in the page body.")

        print("Checking if it's a banking offer page with AI.")
        # Add a small delay to make the validation step visible
        time.sleep(0.5)
        if not is_banking_offer_page(page_text):
            print("AI check failed: Not a banking offer page.")
            offers[offer_id]['status'] = 'failed'
            offers[offer_id]['processing_step'] = "Validation Failed"
            offers[offer_id]['details']['bank_name'] = 'AI Check Failed: Not an offer page.'
            # Save the failed offer to storage
            save_offer(offer_id)
            return

        offers[offer_id]['processing_step'] = "Condensing Terms"
        print("AI check passed. Creating a summary of the offer terms.")
        summary_prompt = f"""
        Condense the following bank offer text into a verbose bulleted list of all key terms, conditions, numbers, and dates. 

        IMPORTANT: Prioritize and include information relevant to these specific fields that will be extracted:
        - Bank name and account title
        - Cash bonus amounts (including multiple tiers if present)
        - Minimum qualifying deposit amounts for each tier
        - Number of required deposits (including direct deposits)
        - Offer expiration date
        - Monthly fees and whether they can be waived
        - Minimum daily balance requirements
        - Time limits for deposits and bonus payout
        - Direct deposit requirements
        - Account holding period to avoid clawback
        - Clawback clause details

        If there are multiple bonus tiers with different deposit requirements, clearly identify each tier and its requirements.
        Focus on the most important points that directly affect getting the bonus, avoiding fees, or meeting deadlines. Prioritize critical information over minor details.

        --- RAW TEXT START ---
        {page_text[-CONTEXT_SIZE:]}
        --- RAW TEXT END ---
        """
        summary_content = call_gemini(summary_prompt, pro_model, use_short_tokens=False)
        print(f"Summary created:\n{summary_content}")
        
        offers[offer_id]['processing_step'] = "Extracting Details"
        print("Summary created. Starting parallel AI queries from summary.")
        extract_offer_details_with_ai(summary_content, page_text, offer_id)

    except requests.RequestException as e:
        print(f"Error scraping URL {url}: {e}")
        if offer_id in offers:
            offers[offer_id]['status'] = 'failed'
            offers[offer_id]['processing_step'] = "Scraping Failed"
            offers[offer_id]['details']['bank_name'] = 'Website refused connection'
            # Save the failed offer to storage
            save_offer(offer_id)
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        if offer_id in offers:
            offers[offer_id]['status'] = 'failed'
            offers[offer_id]['processing_step'] = "Processing Error"
            offers[offer_id]['details']['bank_name'] = 'An unknown error occurred'
            # Save the failed offer to storage
            save_offer(offer_id)

def process_manual_content(content, offer_id):
    """Process manually entered content and triggers the AI extraction process."""
    global offers
    try:
        offers[offer_id]['processing_step'] = "Validating Content"
        
        print(f"Processing manual content for offer {offer_id}")
        
        # Clean the content if it's HTML
        if '<html' in content.lower() or '<body' in content.lower():
            soup = BeautifulSoup(content, 'html.parser')
            body_content = soup.body
            if body_content:
                for script_or_style in body_content(["script", "style"]):
                    script_or_style.decompose()
                page_text = " ".join(body_content.stripped_strings)
            else:
                page_text = content
        else:
            page_text = content

        if not page_text:
            raise ValueError("Could not extract any text content from the provided content.")

        print("Checking if it's a banking offer page with AI.")
        # Add a small delay to make the validation step visible
        time.sleep(0.5)
        if not is_banking_offer_page(page_text):
            print("AI check failed: Not a banking offer page.")
            offers[offer_id]['status'] = 'failed'
            offers[offer_id]['processing_step'] = "Validation Failed"
            offers[offer_id]['details']['bank_name'] = 'AI Check Failed: Not an offer page.'
            # Save the failed offer to storage
            save_offer(offer_id)
            return

        offers[offer_id]['processing_step'] = "Condensing Terms"
        print("AI check passed. Creating a summary of the offer terms.")
        summary_prompt = f"""
        Condense the following bank offer text into a verbose bulleted list of all key terms, conditions, numbers, and dates. 

        IMPORTANT: Prioritize and include information relevant to these specific fields that will be extracted:
        - Bank name and account title
        - Cash bonus amounts (including multiple tiers if present)
        - Minimum qualifying deposit amounts for each tier
        - Number of required deposits (including direct deposits)
        - Offer expiration date
        - Monthly fees and whether they can be waived
        - Minimum daily balance requirements
        - Time limits for deposits and bonus payout
        - Direct deposit requirements
        - Account holding period to avoid clawback
        - Clawback clause details

        If there are multiple bonus tiers with different deposit requirements, clearly identify each tier and its requirements.
        Focus on the most important points that directly affect getting the bonus, avoiding fees, or meeting deadlines. Prioritize critical information over minor details.

        --- RAW TEXT START ---
        {page_text[-CONTEXT_SIZE:]}
        --- RAW TEXT END ---
        """
        summary_content = call_gemini(summary_prompt, pro_model, use_short_tokens=False)
        print(f"Summary created:\n{summary_content}")
        
        offers[offer_id]['processing_step'] = "Extracting Details"
        print("Summary created. Starting parallel AI queries from summary.")
        extract_offer_details_with_ai(summary_content, page_text, offer_id)

    except Exception as e:
        print(f"An unexpected error occurred processing manual content: {e}")
        if offer_id in offers:
            offers[offer_id]['status'] = 'failed'
            offers[offer_id]['processing_step'] = "Processing Error"
            offers[offer_id]['details']['bank_name'] = 'An unknown error occurred'
            # Save the failed offer to storage
            save_offer(offer_id)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/planning')
def planning():
    return render_template('planning.html')

@app.route('/static/<path:path>')
def send_static(path):
    return send_from_directory('static', path)

@app.route('/api/offers', methods=['GET', 'POST'])
def handle_offers():
    global next_offer_id
    if request.method == 'POST':
        if not flash_model or not pro_model:
            return jsonify({'error': 'AI models not configured. Check server logs.'}), 500
        
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Request data is required'}), 400

        # Handle both URL and manual content input
        url = None
        content = None
        original_url = None
        
        if 'url' in data:
            url = data['url'].strip()
            # Simple regex to check for a valid URL format before proceeding
            url_pattern = re.compile(
                r'^(https?://)'  # http:// or https://
                r'([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}'  # domain name
                r'(/.*)?$'  # optional path
            )
            if not url_pattern.match(url):
                return jsonify({'error': 'Invalid URL. Please enter a full URL starting with http:// or https://.'}), 422
        elif 'content' in data:
            content = data['content'].strip()
            if not content:
                return jsonify({'error': 'Content is required for manual mode'}), 400
            # Check if there's an original URL associated with this manual submission
            if 'original_url' in data:
                original_url = data['original_url'].strip()
        else:
            return jsonify({'error': 'Either URL or content is required'}), 400

        # Check if this is a refresh request
        refresh_offer_id = data.get('refresh_offer_id')
        if refresh_offer_id:
            print(f"🔄 Refresh request received for offer ID: {refresh_offer_id} (type: {type(refresh_offer_id)})")
            print(f"📋 Available offer IDs: {list(offers.keys())}")
            
            # Convert to integer if it's a string
            try:
                refresh_offer_id = int(refresh_offer_id)
            except (ValueError, TypeError):
                return jsonify({'error': 'Invalid offer ID format'}), 400
                
            if refresh_offer_id not in offers:
                return jsonify({'error': 'Offer to refresh not found'}), 404
            
            offer_to_refresh = offers[refresh_offer_id]
            
            # Reset the offer to processing state
            offer_to_refresh['status'] = 'processing'
            offer_to_refresh['processing_step'] = 'Validating Content' if 'original_content' in offer_to_refresh else 'Scraping Website'
            offer_to_refresh['details'] = {field['param_name']: 'Processing...' for field in FIELD_EXTRACTION_TASKS + [{"param_name": "additional_considerations"}]}
            
            # Clear any existing refresh status
            if 'refresh_status' in offer_to_refresh:
                del offer_to_refresh['refresh_status']
            
            # Save the updated offer to storage
            save_offer(refresh_offer_id)
            
            # Start processing thread based on offer type
            if 'original_content' in offer_to_refresh:
                # Manual content offer - use stored content
                thread = threading.Thread(target=process_manual_content, args=(offer_to_refresh['original_content'], refresh_offer_id))
            else:
                # URL-based offer - use the URL from the request
                if not url:
                    return jsonify({'error': 'URL is required for refreshing URL-based offers'}), 400
                thread = threading.Thread(target=scrape_and_process_url, args=(url, refresh_offer_id))
            
            thread.start()
            
            return jsonify(offer_to_refresh), 200

        # Check for duplicate offers (only for URL mode)
        duplicate_offer_id = None
        if url:
            duplicate_offer_id = check_duplicate_offer(url)
            if duplicate_offer_id:
                duplicate_offer = offers[duplicate_offer_id]
                return jsonify({
                    'error': 'This offer is already being tracked.',
                    'duplicate_offer_id': duplicate_offer_id,
                    'duplicate_offer': duplicate_offer
                }), 409

        offer_id = next_offer_id
        
        # Create offer with appropriate URL or placeholder
        offer_url = url if url else (original_url if original_url else f"manual-content-{offer_id}")
        
        offers[offer_id] = {
            'id': offer_id, 'url': offer_url,
            'user_controlled': {'opened': False, 'deposited': False, 'received': False},
            'status': 'processing',
            'processing_step': 'Validating Content' if not url else 'Scraping Website',
            'details': {field['param_name']: 'Processing...' for field in FIELD_EXTRACTION_TASKS + [{"param_name": "additional_considerations"}]}
        }
        
        # Store the original content for manual mode offers
        if not url:
            offers[offer_id]['original_content'] = content
        
        # Save the new offer to storage
        save_offer(offer_id)
        
        # Start processing thread
        if url:
            thread = threading.Thread(target=scrape_and_process_url, args=(url, offer_id))
        else:
            thread = threading.Thread(target=process_manual_content, args=(content, offer_id))
        thread.start()
        
        next_offer_id += 1
        return jsonify(offers[offer_id]), 201

    return jsonify(list(offers.values()))

@app.route('/api/offers/<int:offer_id>/refresh', methods=['POST'])
def refresh_offer_field(offer_id):
    """Rescrapes the website and re-queries a specific field."""
    if offer_id not in offers:
        return jsonify({'error': 'Offer not found'}), 404
    
    data = request.get_json()
    field_name = data.get('field')
    if not field_name:
        return jsonify({'error': 'Field name is required'}), 400
    
    if field_name not in offers[offer_id]['details']:
        return jsonify({'error': 'Invalid field name'}), 400
    
    # Start refresh process in background
    thread = threading.Thread(target=refresh_field_value, args=(offer_id, field_name))
    thread.start()
    
    return jsonify({'status': 'refreshing', 'field': field_name}), 202

def clear_refresh_status(offer_id, field_name):
    """Helper function to clear refresh status for a field."""
    if 'refresh_status' in offers[offer_id] and field_name in offers[offer_id]['refresh_status']:
        del offers[offer_id]['refresh_status'][field_name]
        print(f"🧹 Cleared refresh status for field '{field_name}' in offer {offer_id}")

def refresh_field_value(offer_id, field_name):
    """Rescrapes and re-queries a specific field value."""
    global offers
    
    try:
        print(f"🔄 Starting refresh for field '{field_name}' in offer {offer_id}")
        # Set a flag to indicate refresh is in progress without changing the actual value
        if 'refresh_status' not in offers[offer_id]:
            offers[offer_id]['refresh_status'] = {}
        offers[offer_id]['refresh_status'][field_name] = 'rescraping'
        
        # Check if this is a manual mode offer (has stored content)
        if 'original_content' in offers[offer_id]:
            print(f"📄 Stage 1: Using stored content for manual mode offer {offer_id}")
            page_text = offers[offer_id]['original_content']
        else:
            print(f"📄 Stage 1: Rescraping website for offer {offer_id}")
            # Rescrape the website
            url = offers[offer_id]['url']
            session = requests.Session()
            headers = {
                'User-Agent': random.choice(USER_AGENTS),
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'DNT': '1',
            }
            response = session.get(url, headers=headers, timeout=15, allow_redirects=True)
            response.raise_for_status()
            
            soup = BeautifulSoup(response.text, 'html.parser')
            body_content = soup.body
            if body_content:
                for script_or_style in body_content(["script", "style"]):
                    script_or_style.decompose()
                page_text = " ".join(body_content.stripped_strings)
            else:
                page_text = ""
        
        if not page_text:
            print(f"❌ No content found for offer {offer_id}, setting field '{field_name}' to N/A")
            offers[offer_id]['details'][field_name] = 'N/A'
            
            # Clear refresh status before returning
            clear_refresh_status(offer_id, field_name)
            return
        
        print(f"✅ Stage 1 Complete: Successfully processed {len(page_text)} characters for offer {offer_id}")
        
        # Brief pause to ensure status is visible
        time.sleep(0.3)
        
        # Get the prompt for the specific field
        field_prompt = None
        for task in FIELD_EXTRACTION_TASKS:
            if task["param_name"] == field_name:
                field_prompt = task["prompt"]
                break
        
        if not field_prompt:
            offers[offer_id]['details'][field_name] = 'N/A'
            
            # Clear refresh status before returning
            clear_refresh_status(offer_id, field_name)
            return
        
        # Check for existing accounts if this is the additional_considerations field
        existing_accounts_context = ""
        if field_name == "additional_considerations":
            bank_name = offers[offer_id]['details'].get('bank_name', '')
            existing_accounts = check_existing_accounts_with_same_bank(bank_name, offer_id)
            
            if existing_accounts:
                existing_accounts_context = f"""
IMPORTANT CONTEXT: The user has {len(existing_accounts)} existing opened account(s) with {bank_name}:
{chr(10).join([f"- {account['account_title']} (ID: {account['id']})" for account in existing_accounts])}

This information is crucial because many bank offers are restricted to "new customers only" or have specific eligibility requirements for existing customers. Pay special attention to any terms about:
- New customer requirements
- Existing customer restrictions
- Eligibility for current account holders
- Whether the offer applies to existing customers
- Any special terms for current account holders
"""
        
        # Send 3 queries to get different perspectives
        query_prompt = f"""
        Based on the following text from a bank offer website, answer this specific question:
        {field_prompt}
        {existing_accounts_context}
        
        Provide only the answer, without any extra explanation.
        
        --- WEBSITE TEXT START ---
        {page_text[-CONTEXT_SIZE:]}
        --- WEBSITE TEXT END ---
        """
        
        # Send 3 parallel queries
        offers[offer_id]['refresh_status'][field_name] = 'querying'
        print(f"🤖 Stage 2: Sending 3 AI queries for field '{field_name}' in offer {offer_id}")
        start_query_time = time.time()
        
        def query_ai(query_num):
            print(f"  Query {query_num}/3: Asking AI about '{field_name}'...")
            # Use flash model for additional_considerations, pro model for other fields
            model_to_use = (openai_model_default if field_name == "additional_considerations" else pro_model)
            # Use long tokens for additional_considerations, short tokens for other fields
            use_long_tokens = (field_name == "additional_considerations")
            result = call_ai(query_prompt, model_to_use, use_short_tokens=not use_long_tokens)
            print(f"  Query {query_num}/3 Response: '{result.strip()}'")
            return result.strip()
        
        # Run queries in parallel
        query_threads = []
        results = [None, None, None]
        
        def run_query(index):
            results[index] = query_ai(index + 1)
        
        for i in range(3):
            thread = threading.Thread(target=run_query, args=(i,))
            query_threads.append(thread)
            thread.start()
        
        for thread in query_threads:
            thread.join()
        
        query_duration = time.time() - start_query_time
        print(f"✅ Stage 2 Complete: Received 3 responses for field '{field_name}' in {query_duration:.1f}s")
        
        # Brief pause to ensure status is visible
        time.sleep(0.3)
        
        # Send consensus query
        offers[offer_id]['refresh_status'][field_name] = 'consensus'
        print(f"🧠 Stage 3: Sending consensus query for field '{field_name}' in offer {offer_id}")
        print(f"  Consensus input: {results}")
        start_consensus_time = time.time()
        consensus_prompt = f"""
        I have 3 different answers for the same question about a bank offer. Please determine the most accurate answer by considering both the original website content and the 3 AI responses:
        
        Question: {field_prompt}
        {existing_accounts_context}
        
        Answer 1: {results[0]}
        Answer 2: {results[1]}
        Answer 3: {results[2]}
        
        --- ORIGINAL WEBSITE CONTENT START ---
        {page_text[-CONTEXT_SIZE:]}
        --- ORIGINAL WEBSITE CONTENT END ---
        
        Consider the context from the original website content and choose the most accurate answer. If the answers are similar, choose the most specific one. If they conflict significantly, choose the most reasonable answer based on the original content and typical bank offer patterns.
        
        Provide only the final answer, without explanation.
        """
        
        # Use flash model for additional_considerations, pro model for other fields
        model_to_use = (openai_model_default if field_name == "additional_considerations" else pro_model)
        # Use long tokens for additional_considerations, short tokens for other fields
        use_long_tokens = (field_name == "additional_considerations")
        final_result = call_ai(consensus_prompt, model_to_use, use_short_tokens=not use_long_tokens)
        consensus_duration = time.time() - start_consensus_time
        print(f"  Consensus Response: '{final_result.strip()}'")
        offers[offer_id]['details'][field_name] = final_result.strip()
        # Save the updated offer to storage
        save_offer(offer_id)
        print(f"✅ Stage 3 Complete: Final result for '{field_name}': '{final_result.strip()}' in {consensus_duration:.1f}s")
        
        # Keep status visible for a moment before clearing
        time.sleep(1.5)
        
        # Clear refresh status
        clear_refresh_status(offer_id, field_name)
        
        print(f"🎉 Refresh Complete: Field '{field_name}' in offer {offer_id} updated successfully")
        
    except Exception as e:
        print(f"❌ Error refreshing field {field_name} for offer {offer_id}: {e}")
        offers[offer_id]['details'][field_name] = 'Refresh Failed'
        # Save the failed offer to storage
        save_offer(offer_id)
        print(f"💥 Refresh Failed: Field '{field_name}' in offer {offer_id} set to 'Refresh Failed'")
        
        # Clear refresh status on error
        if 'refresh_status' in offers[offer_id] and field_name in offers[offer_id]['refresh_status']:
            del offers[offer_id]['refresh_status'][field_name]

@app.route('/api/offers/<int:offer_id>', methods=['GET', 'PUT', 'DELETE'])
def handle_single_offer(offer_id):
    if offer_id not in offers:
        return jsonify({'error': 'Offer not found'}), 404
        
    if request.method == 'PUT':
        data = request.get_json()
        field = data.get('field')
        value = data.get('value')
        
        if field == 'url':
            # URL validation
            url_pattern = re.compile(
                r'^(https?://)'  # http:// or https://
                r'([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}'  # domain name
                r'(/.*)?$'  # optional path
            )
            if not url_pattern.match(value):
                return jsonify({'error': 'Invalid URL. Please enter a full URL starting with http:// or https://.'}), 422
            
            # Update the offer URL
            offers[offer_id]['url'] = value
            save_offer(offer_id)
            return jsonify(offers[offer_id])
        elif field in offers[offer_id]['user_controlled']:
            offers[offer_id]['user_controlled'][field] = bool(value)
            # Save the updated offer to storage
            save_offer(offer_id)
            return jsonify(offers[offer_id])
        return jsonify({'error': 'Invalid field'}), 400
        
    if request.method == 'DELETE':
        del offers[offer_id]
        # Delete the offer from storage
        delete_offer_from_storage(offer_id)
        return jsonify({'message': 'Offer deleted successfully'}), 200

    return jsonify(offers[offer_id])


@app.route('/api/storage/stats', methods=['GET'])
def get_storage_statistics():
    """Get storage statistics."""
    stats = get_storage_stats()
    return jsonify(stats)


@app.route('/api/planning/generate', methods=['POST'])
def generate_plan():
    """Generate a plan for unopened offers."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Request data is required'}), 400
        
        pay_cycle_days = data.get('pay_cycle_days', 14)
        average_paycheck = data.get('average_paycheck', 2000)
        accounts_per_paycycle = data.get('accounts_per_paycycle', 2)
        
        # Validate inputs
        if not isinstance(pay_cycle_days, int) or pay_cycle_days < 7 or pay_cycle_days > 31:
            return jsonify({'error': 'Pay cycle days must be between 7 and 31'}), 400
        
        if not isinstance(average_paycheck, (int, float)) or average_paycheck < 100:
            return jsonify({'error': 'Average paycheck must be at least $100'}), 400
        
        if not isinstance(accounts_per_paycycle, int) or accounts_per_paycycle < 1 or accounts_per_paycycle > 10:
            return jsonify({'error': 'Accounts per pay cycle must be between 1 and 10'}), 400
        
        # Generate plan using the planning logic
        try:
            plan = PlanningLogic.generate_plan(offers, pay_cycle_days, average_paycheck, accounts_per_paycycle)
        except Exception as planning_error:
            print(f"Error in planning logic: {planning_error}")
            return jsonify({'error': f'Planning calculation failed: {str(planning_error)}'}), 500
        
        if not plan:
            return jsonify({'error': 'No unopened offers available for planning'}), 404
        
        return jsonify(plan), 200
        
    except Exception as e:
        print(f"Error generating plan: {e}")
        return jsonify({'error': f'Failed to generate plan: {str(e)}'}), 500


@app.route('/api/storage/backup', methods=['POST'])
def create_backup():
    """Create a backup of the offers data."""
    backup_file = backup_offers()
    if backup_file:
        return jsonify({'message': 'Backup created successfully', 'backup_file': backup_file}), 200
    else:
        return jsonify({'error': 'Failed to create backup'}), 500


if __name__ == '__main__':
    if not os.path.exists('templates'):
        os.makedirs('templates')
    if not os.path.exists('static'):
        os.makedirs('static')
    
    if os.path.exists('index.html') and not os.path.exists('templates/index.html'):
        os.rename('index.html', 'templates/index.html')
    if os.path.exists('script.js') and not os.path.exists('static/script.js'):
        os.rename('script.js', 'static/script.js')
    
    app.run(debug=True, use_reloader=False)