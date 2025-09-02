import os
import webbrowser
import threading
import re
import requests
import random
import time
from flask import Flask, jsonify, request, render_template, send_from_directory, redirect, url_for
from dotenv import load_dotenv
from bs4 import BeautifulSoup

from src.utils.key_management import save_api_keys, load_api_keys
from src.services.ai_clients import initialize_ai_clients, flash_model, pro_model, call_ai, openai_model_default, OPENAI_ENABLED
from src.data.data_manager import (
    offers,
    next_offer_id,
    save_offer,
    delete_offer_from_storage,
    backup_offers,
    get_storage_stats,
    get_next_available_offer_id,
)
from src.core.offer_processing import (
    check_duplicate_offer,
    check_existing_accounts_with_same_bank,
)
from src.core.scraping import scrape_and_process_url, process_manual_content
from src.core.plan_generation import PlanGeneration
from src.utils.config import FIELD_EXTRACTION_TASKS, USER_AGENTS, CONTEXT_SIZE


load_dotenv()

# Initialize clients on startup
initialize_ai_clients()

# --- Flask App ---
app = Flask(__name__, static_folder='static')


# --- API Key Setup Route ---
@app.route('/setup', methods=['GET', 'POST'])
def setup():
    if request.method == 'POST':
        openai_key = request.form.get('openai_api_key', '').strip()
        gemini_key = request.form.get('gemini_api_key', '').strip()
        
        if not openai_key and not gemini_key:
            return render_template('setup.html', error="At least one API key is required.")
            
        save_api_keys(openai_key, gemini_key)
        
        # Re-initialize clients with the new keys
        initialize_ai_clients()
        
        return redirect(url_for('index'))
        
    return render_template('setup.html')


@app.before_request
def check_api_keys():
    if request.endpoint in ['setup', 'static']:
        return
    
    openai_key, gemini_key = load_api_keys()
    if not openai_key and not gemini_key:
        return redirect(url_for('setup'))


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
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Request data is required'}), 400

        # Check if this is a refresh request - refresh operations can work with just OpenAI
        refresh_offer_id = data.get('refresh_offer_id')
        if refresh_offer_id:
            # For refresh operations, we only need OpenAI to be available
            from src.services.ai_clients import OPENAI_ENABLED
            if not OPENAI_ENABLED:
                return jsonify({'error': 'OpenAI client not configured. Check server logs.'}), 500
        else:
            # For new offer creation, we need at least one AI model (Gemini or OpenAI)
            # Import the current values directly from the module
            from src.services.ai_clients import flash_model, pro_model, OPENAI_ENABLED
            # Check if we have any AI models available
            has_ai_models = bool(flash_model or pro_model or OPENAI_ENABLED)
            if not has_ai_models:
                return jsonify({'error': 'AI models not configured. Check server logs.'}), 500

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

        # Handle refresh requests
        if refresh_offer_id:
            
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

        offer_id = get_next_available_offer_id()
        
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
    
    # Check if at least one AI client is available for refresh operations
    # Import current values to avoid stale imports
    from src.services.ai_clients import OPENAI_ENABLED, flash_model, pro_model
    if not OPENAI_ENABLED and not flash_model and not pro_model:
        return jsonify({'error': 'No AI clients configured. Please configure OpenAI or Gemini API keys.'}), 500
    
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


def refresh_field_value(offer_id, field_name):
    """Rescrapes and re-queries a specific field value."""
    global offers
    
    try:
        # Set a flag to indicate refresh is in progress without changing the actual value
        if 'refresh_status' not in offers[offer_id]:
            offers[offer_id]['refresh_status'] = {}
        offers[offer_id]['refresh_status'][field_name] = 'rescraping'
        
        # Check if this is a manual mode offer (has stored content)
        if 'original_content' in offers[offer_id]:
            page_text = offers[offer_id]['original_content']
        else:
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
        start_query_time = time.time()
        
        def query_ai(query_num):
            # Use OpenAI as fallback when Gemini models are not available
            if field_name == "additional_considerations":
                model_to_use = openai_model_default
                use_long_tokens = True
            else:
                # Try to use pro_model if available, otherwise fall back to OpenAI
                model_to_use = pro_model if pro_model else openai_model_default
                use_long_tokens = False
            result = call_ai(query_prompt, model_to_use, use_short_tokens=not use_long_tokens)
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
        
        # Brief pause to ensure status is visible
        time.sleep(0.3)
        
        # Send consensus query
        offers[offer_id]['refresh_status'][field_name] = 'consensus'
        start_consensus_time = time.time()
        # Determine if this field expects a numeric value
        numeric_fields = [
            'minimum_daily_balance_required', 'minimum_deposit_amount', 'initial_deposit_amount',
            'bonus_to_be_received', 'minimum_monthly_fee', 'num_required_deposits',
            'days_for_deposit', 'days_for_bonus', 'must_be_open_for', 'total_deposit_required'
        ]
        
        is_numeric_field = field_name in numeric_fields
        
        if is_numeric_field:
            # Special handling for minimum_daily_balance_required
                if field_name == 'minimum_daily_balance_required':
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
                    
                    CRITICAL: This field is for minimum_daily_balance_required. You MUST extract ONLY a single dollar amount.
                    
                    RULES:
                    1. If there are multiple balance requirements (e.g., checking vs savings), prioritize the CHECKING account requirement
                    2. Extract ONLY the dollar amount, no text, no parentheses, no explanations
                    3. Examples: "$1,500 (checking)" → "1500", "$300 savings" → "300", "1500" → "1500"
                    4. If no clear balance requirement is found, respond with "0"
                    5. Do NOT include multiple values or ranges
                    
                    Provide ONLY the numeric value for the checking account minimum daily balance requirement.
                    """
                else:
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
                    
                    IMPORTANT: This field expects a NUMERIC value. Extract ONLY the relevant number from the most accurate answer.
                    
                    For minimum_deposit_amount: Extract only the dollar amount (e.g., "1000" from "$1,000")
                    For bonus amounts: Extract only the dollar amount (e.g., "300" from "$300")
                    For fees: Extract only the dollar amount (e.g., "0" from "$0" or "waived")
                    For counts/days: Extract only the number (e.g., "90" from "90 days")
                    
                    If multiple values exist, choose the most relevant one based on the field context.
                    Provide ONLY the numeric value, no text, no explanation.
                    """
        else:
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
        
        # Use OpenAI as fallback when Gemini models are not available
        if field_name == "additional_considerations":
            model_to_use = openai_model_default
            use_long_tokens = True
        else:
            # Try to use pro_model if available, otherwise fall back to OpenAI
            model_to_use = pro_model if pro_model else openai_model_default
            use_long_tokens = False
        final_result = call_ai(consensus_prompt, model_to_use, use_short_tokens=not use_long_tokens)
        consensus_duration = time.time() - start_consensus_time
        print(f"  Consensus Response: '{final_result.strip()}'")
        
        # Post-process numeric fields to ensure clean numeric values
        if is_numeric_field:
            cleaned_result = final_result.strip()
            # Remove common non-numeric text and extract just the number
            if field_name == 'minimum_daily_balance_required':
                # Extract the first dollar amount found - prioritize checking account requirements
                if 'checking' in cleaned_result.lower():
                    # Look for checking account balance requirement first
                    checking_match = re.search(r'checking.*?\$?([0-9,]+)', cleaned_result, re.IGNORECASE)
                    if checking_match:
                        cleaned_result = checking_match.group(1).replace(',', '')
                    else:
                        # Fall back to any dollar amount
                        dollar_match = re.search(r'\$?([0-9,]+)', cleaned_result)
                        if dollar_match:
                            cleaned_result = dollar_match.group(1).replace(',', '')
                else:
                    # Extract any dollar amount found
                    dollar_match = re.search(r'\$?([0-9,]+)', cleaned_result)
                    if dollar_match:
                        cleaned_result = dollar_match.group(1).replace(',', '')
                
                if cleaned_result == final_result.strip():  # No change made
                    if '0' in cleaned_result.lower() or 'none' in cleaned_result.lower():
                        cleaned_result = '0'
                    elif 'n/a' in cleaned_result.lower():
                        cleaned_result = 'N/A'
                        
            elif field_name in ['days_for_deposit', 'days_for_bonus', 'must_be_open_for', 'num_required_deposits']:
                # Extract just the number
                number_match = re.search(r'([0-9]+)', cleaned_result)
                if number_match:
                    cleaned_result = number_match.group(1)
                elif 'n/a' in cleaned_result.lower():
                    cleaned_result = 'N/A'
                    
            elif field_name in ['minimum_monthly_fee', 'minimum_deposit_amount', 'initial_deposit_amount', 'bonus_to_be_received', 'total_deposit_required']:
                # Extract dollar amount
                dollar_match = re.search(r'\$?([0-9,]+\.?[0-9]*)', cleaned_result)
                if dollar_match:
                    cleaned_result = dollar_match.group(1).replace(',', '')
                elif '0' in cleaned_result.lower() or 'none' in cleaned_result.lower() or 'waived' in cleaned_result.lower():
                    cleaned_result = '0'
            
            print(f"  Cleaned numeric result: '{cleaned_result}'")
            
            # Additional validation for numeric fields
            if field_name == 'minimum_daily_balance_required':
                # Ensure we have a valid numeric result
                if not cleaned_result.isdigit() and cleaned_result != '0' and cleaned_result != 'N/A':
                    print(f"  ⚠️ Warning: Invalid numeric result for {field_name}, attempting to extract again...")
                    # Try one more extraction attempt
                    final_extraction = re.search(r'([0-9]+)', cleaned_result)
                    if final_extraction:
                        cleaned_result = final_extraction.group(1)
                        print(f"  ✅ Final extraction successful: '{cleaned_result}'")
                    else:
                        cleaned_result = '0'
            
            offers[offer_id]['details'][field_name] = cleaned_result
        else:
            # Special handling for additional_considerations to ensure proper formatting
            if field_name == 'additional_considerations':
                result = final_result.strip()
                # If the result doesn't contain newlines, try to split by consideration types
                if '\n' not in result:
                    consideration_regex = re.compile(r'(WARNING:|CAUTION:|GOOD:)')
                    parts = consideration_regex.split(result)
                    
                    # Reconstruct with newlines
                    reconstructed = ''
                    for i, part in enumerate(parts):
                        if re.match(r'^(WARNING:|CAUTION:|GOOD:)$', part):
                            # This is a consideration type, add it to the reconstructed string
                            if reconstructed and not reconstructed.endswith('\n'):
                                reconstructed += '\n'
                            reconstructed += part
                        elif part.strip():
                            # This is the content, add it after the type with a space
                            reconstructed += ' ' + part.strip()
                    
                    result = reconstructed
                
                offers[offer_id]['details'][field_name] = result
            else:
                offers[offer_id]['details'][field_name] = final_result.strip()
        
        # Save the updated offer to storage
        save_offer(offer_id)
        
        # Keep status visible for a moment before clearing
        time.sleep(1.5)
        
        # Clear refresh status
        clear_refresh_status(offer_id, field_name)
        
    except Exception as e:
        print(f"❌ Error refreshing field {field_name} for offer {offer_id}: {e}")
        offers[offer_id]['details'][field_name] = 'Refresh Failed'
        # Save the failed offer to storage
        save_offer(offer_id)
        
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
            plan = PlanGeneration.generate_plan(offers, pay_cycle_days, average_paycheck, accounts_per_paycycle)
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


def main():
    """Main function for running the application."""
    def open_browser():
        webbrowser.open_new('http://127.0.0.1:5000/')
    threading.Timer(1, open_browser).start()

    app.run(debug=True, use_reloader=False)

if __name__ == '__main__':
    main()