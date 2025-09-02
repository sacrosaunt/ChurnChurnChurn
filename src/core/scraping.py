import requests
import random
import time
from bs4 import BeautifulSoup
from src.data.data_manager import offers, save_offer
from src.services.ai_clients import is_banking_offer_page, call_gemini, pro_model
from src.core.offer_processing import extract_offer_details_with_ai
from src.utils.config import USER_AGENTS, CONTEXT_SIZE

def scrape_and_process_url(url, offer_id):
    """Scrapes, summarizes, and triggers the AI extraction process."""
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
        print("Validation check passed. Creating a summary of the offer terms.")
        summary_prompt = f"""
        Condense the following bank offer text into a verbose bulleted list of all key terms, conditions, numbers, and dates. 

        IMPORTANT: Prioritize and include information relevant to these specific fields that will be extracted:
        - Bank name and account title (keep concise, avoid lengthy descriptions)
        - Cash bonus amounts (including multiple tiers if present)
        - Minimum qualifying deposit amounts for each tier
        - Number of required deposits (including direct deposits)
        - Offer expiration date
        - Monthly fees and whether they can be waived
        - Minimum daily balance requirements (NOTE: If multiple account types have different requirements, clearly separate checking vs savings requirements)
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
        # Try Gemini first if available, otherwise fall back to OpenAI
        if pro_model:
            summary_content = call_gemini(summary_prompt, pro_model, use_short_tokens=False)
        else:
            # Fall back to OpenAI
            from src.services.ai_clients import call_ai, openai_model_default
            summary_content = call_ai(summary_prompt, openai_model_default, use_short_tokens=False)
        # Summary created successfully (content not logged to console)
        
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
        print("Validation check passed. Creating a summary of the offer terms.")
        summary_prompt = f"""
        Condense the following bank offer text into a verbose bulleted list of all key terms, conditions, numbers, and dates. 

        IMPORTANT: Prioritize and include information relevant to these specific fields that will be extracted:
        - Bank name and account title (keep concise, avoid lengthy descriptions)
        - Cash bonus amounts (including multiple tiers if present)
        - Minimum qualifying deposit amounts for each tier
        - Number of required deposits (including direct deposits)
        - Offer expiration date
        - Monthly fees and whether they can be waived
        - Minimum daily balance requirements (NOTE: If multiple account types have different requirements, clearly separate checking vs savings requirements)
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
        # Try Gemini first if available, otherwise fall back to OpenAI
        if pro_model:
            summary_content = call_gemini(summary_prompt, pro_model, use_short_tokens=False)
        else:
            # Fall back to OpenAI
            from src.services.ai_clients import call_ai, openai_model_default
            summary_content = call_ai(summary_prompt, openai_model_default, use_short_tokens=False)
        # Summary created successfully (content not logged to console)
        
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
