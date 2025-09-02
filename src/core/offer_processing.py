import threading
import time
import sys
import queue
from urllib.parse import urlparse
from src.utils.utils import normalize_url_for_comparison
from src.data.data_manager import offers, save_offer
from src.services.ai_clients import call_gemini, call_ai
from src.services import ai_clients
from src.utils.config import FIELD_EXTRACTION_TASKS, CONTEXT_SIZE

def check_existing_accounts_with_same_bank(bank_name, current_offer_id):
    """Check if user has any opened accounts with the same bank."""
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
    normalized_new_url = normalize_url_for_comparison(url)
    
    for offer_id, offer in offers.items():
        normalized_existing_url = normalize_url_for_comparison(offer['url'])
        
        # Check if normalized URLs match
        if normalized_new_url == normalized_existing_url:
            return offer_id
        
        # Additional check: if both URLs have the same domain and similar paths
        new_parsed = urlparse(normalized_new_url)
        existing_parsed = urlparse(normalized_existing_url)
        
        # If same domain and similar path structure, it might be the same offer
        if (new_parsed.netloc == existing_parsed.netloc and
            new_parsed.path.split('/')[-1] == existing_parsed.path.split('/')[-1]):
            return offer_id
    
    return None

def extract_offer_details_with_ai(summary_content, raw_text, offer_id):
    """Sends parallel AI queries to extract offer details from a summary."""
    # Progress tracking
    total_queries = len(FIELD_EXTRACTION_TASKS)
    completed_queries = 0
    progress_lock = threading.Lock()
    
    def update_progress(param_name=None, result=None):
        """Updates the progress display on the same line."""
        nonlocal completed_queries
        with progress_lock:
            if param_name and result:
                completed_queries += 1
                # Update the current line with progress
                progress_text = f"🚀 Tile load progress: {completed_queries}/{total_queries} completed"
                if completed_queries < total_queries:
                    sys.stdout.write(f"\r{progress_text}")
                    sys.stdout.flush()
                else:
                    sys.stdout.write(f"\r{progress_text} ✅\n")
                    sys.stdout.flush()
    
    def extract_detail(param_name, prompt):
        """Runs a single AI query in a thread using the flash model against the summary."""
        full_prompt = f"""
        Based on the summarized text below, answer the following question.
        Provide only the answer, without any extra explanation.

        Question: {prompt}

        --- SUMMARY TEXT START ---
        {summary_content}
        --- SUMMARY TEXT END ---
        """
        # Try OpenAI first if available, otherwise fall back to Gemini
        try:
            if ai_clients.OPENAI_ENABLED:
                result = call_ai(full_prompt, ai_clients.openai_model_default, use_short_tokens=True)
            elif ai_clients.flash_model:
                result = call_gemini(full_prompt, ai_clients.flash_model, use_short_tokens=True)
            else:
                result = "AI Error: No models available"
        except Exception as e:
            print(f"⚠️ Error in AI extraction: {e}")
            result = "Processing..."
        
        if offer_id in offers and 'details' in offers[offer_id]:
             offers[offer_id]['details'][param_name] = result
             # Save the updated offer to storage
             save_offer(offer_id)
        
        # Update progress
        update_progress(param_name, result)

    # Show initial progress
    print(f"🚀 Tile load progress: 0/{total_queries} completed", end="")
    sys.stdout.flush()

    threads = []
    for task in FIELD_EXTRACTION_TASKS:
        thread = threading.Thread(target=extract_detail, args=(task["param_name"], task["prompt"]))
        threads.append(thread)
        thread.start()

    for thread in threads:
        thread.join()

    # Validate and potentially update bonus tiers (optional - skip if AI not available)
    if offer_id in offers:
        extracted_data = offers[offer_id]['details']
        
        # Check if we have bonus tiers and need validation
        if extracted_data.get('bonus_tiers_detailed') and extracted_data.get('bonus_tiers_detailed') != 'Single tier':
            try:
                # Check if AI is available before attempting validation
                if not ai_clients.flash_model and not ai_clients.OPENAI_ENABLED:
                    print("⚠️ Skipping bonus tier validation - no AI clients available")
                else:
                    # Create validation prompt with current tiers and maximum bonus
                    bonus_str = extracted_data.get('bonus_to_be_received', '0')
                    if bonus_str == 'Processing...' or not bonus_str:
                        print("⚠️ Skipping bonus tier validation - bonus amount not yet extracted")
                    else:
                        try:
                            max_bonus = float(str(bonus_str).replace(',', '')) or 0
                        except ValueError:
                            print(f"⚠️ Skipping bonus tier validation - invalid bonus amount: {bonus_str}")
                        else:
                            current_tiers = extracted_data.get('bonus_tiers_detailed', '')
                            
                            validation_prompt = f"""
                            CRITICAL VALIDATION: Review the extracted bonus tiers and ensure ALL possible bonus amounts are captured.
                            
                            Maximum Bonus: ${max_bonus}
                            Current Tiers: {current_tiers}
                            
                            If the total maximum bonus is higher than the sum of extracted tiers, create additional tiers to account for the difference. For example: If maximum bonus is $350 but only $100 cash back + $200 direct deposit = $300 total, create a third tier for the remaining $50. If cash back is mentioned as a percentage without a dollar limit, calculate the implied maximum by subtracting other explicit bonuses from the total maximum.
                            
                            Format as valid JSON array with DOUBLE QUOTES. If the current tiers already sum to the maximum bonus, respond with 'VALID'.
                            """
                            
                            # Run validation with simple timeout
                            
                            # Use a queue to get the result from the thread
                            result_queue = queue.Queue()
                            
                            def run_validation():
                                try:
                                    if ai_clients.OPENAI_ENABLED:
                                        validation_result = call_ai(validation_prompt, ai_clients.openai_model_default, use_short_tokens=True)
                                    elif ai_clients.flash_model:
                                        validation_result = call_gemini(validation_prompt, ai_clients.flash_model, use_short_tokens=True)
                                    else:
                                        validation_result = "AI Error: No models available"
                                    result_queue.put(('success', validation_result))
                                except Exception as e:
                                    result_queue.put(('error', str(e)))
                            
                            # Start validation in a separate thread
                            validation_thread = threading.Thread(target=run_validation)
                            validation_thread.daemon = True
                            validation_thread.start()
                            
                            # Wait for result with timeout
                            try:
                                result_type, validation_result = result_queue.get(timeout=30)  # 30 second timeout
                                
                                if result_type == 'success':
                                    # If validation found missing tiers, update the bonus_tiers_detailed
                                    if validation_result and validation_result.strip() != 'VALID' and validation_result.strip() != 'Single tier':
                                        # Try to parse as JSON to validate
                                        import json
                                        try:
                                            json.loads(validation_result)
                                            # If it's valid JSON, update the tiers
                                            offers[offer_id]['details']['bonus_tiers_detailed'] = validation_result
                                            print(f"✅ Updated bonus tiers based on validation")
                                        except json.JSONDecodeError:
                                            print(f"⚠️ Validation result was not valid JSON: {validation_result}")
                                else:
                                    print(f"⚠️ Error during bonus tier validation: {validation_result}")
                                    
                            except queue.Empty:
                                print("⚠️ Bonus tier validation timed out, continuing with original tiers")
                        
            except Exception as e:
                print(f"⚠️ Error during bonus tier validation setup: {e}")

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
        

        model_for_considerations = ai_clients.openai_model_default if ai_clients.OPENAI_ENABLED else ai_clients.flash_model
        result = call_ai(considerations_prompt, model_for_considerations, use_short_tokens=False)
        
        # Ensure we have a meaningful response
        if not result or result.strip() == "" or result.strip().lower() in ["", "none", "nothing"]:
            result = "N/A"
            print("⚠️ Additional considerations returned empty, setting to N/A")
        else:
            # Normalize the additional considerations to ensure proper formatting
            # If the result doesn't contain newlines, try to split by consideration types
            if '\n' not in result:
                import re
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
            
        offers[offer_id]['details']['additional_considerations'] = result

    if offer_id in offers:
        offers[offer_id]['processing_step'] = "Done"
        
        # Brief delay to ensure "Done" step is visible in UI before status change
        time.sleep(1.0)
        
        offers[offer_id]['status'] = 'completed'
        # Save the completed offer to storage
        save_offer(offer_id)
