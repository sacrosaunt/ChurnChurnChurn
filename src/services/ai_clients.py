import os
import google.generativeai as genai
from openai import OpenAI
from src.utils.key_management import load_api_keys
from src.utils.config import SHORT_PROMPT_MAX_TOKENS, LONG_PROMPT_MAX_TOKENS, CONTEXT_SIZE
import logging

logger = logging.getLogger(__name__)

# --- Global AI Clients ---
client = None
flash_model = None
pro_model = None
openai_model_default = "gpt-4.1"
OPENAI_ENABLED = False

# --- AI Configuration ---
def initialize_ai_clients():
    """Load API keys and initialize AI clients."""
    global client, flash_model, pro_model, OPENAI_ENABLED
    
    logger.info("🔧 Initializing AI clients...")
    openai_api_key, gemini_api_key = load_api_keys()
    
    logger.info(f"📋 OpenAI API key loaded: {'Yes' if openai_api_key else 'No'}")
    logger.info(f"📋 Gemini API key loaded: {'Yes' if gemini_api_key else 'No'}")
    
    if openai_api_key:
        os.environ['OPENAI_API_KEY'] = openai_api_key
        logger.info("✅ OpenAI API key set in environment")
    if gemini_api_key:
        os.environ['GEMINI_API_KEY'] = gemini_api_key
        logger.info("✅ Gemini API key set in environment")

    # Configure OpenAI
    logger.info("🔧 Configuring OpenAI...")
    try:
        if os.environ.get("OPENAI_API_KEY"):
            logger.info("✅ OpenAI API key found in environment")
            client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
            OPENAI_ENABLED = True
            logger.info("✅ OpenAI client created successfully")
            logger.info("OpenAI client configured successfully")
        else:
            logger.warning("❌ OpenAI API key not found in environment")
            logger.warning("⚠️  OPENAI_API_KEY not set. ChatGPT features disabled.")
            OPENAI_ENABLED = False
    except Exception as e:
        logger.error(f"💥 Error configuring OpenAI: {e}")
        logger.error(f"An error occurred while configuring OpenAI: {e}")
        OPENAI_ENABLED = False
    
    logger.info(f"📊 OpenAI status: {'Enabled' if OPENAI_ENABLED else 'Disabled'}")

    # Configure Gemini
    try:
        if os.environ.get("GEMINI_API_KEY"):
            logger.info("Configuring Gemini AI models...")
            genai.configure(api_key=os.environ["GEMINI_API_KEY"])
            generation_config = {
                "temperature": 0,
                "top_p": 1,
                "top_k": 1,
                "max_output_tokens": 8192,  # Using LONG_PROMPT_MAX_TOKENS directly
            }

            flash_model = genai.GenerativeModel(
                model_name="gemini-2.5-flash",
                generation_config=generation_config
            )
            pro_model = genai.GenerativeModel(
                model_name="gemini-2.5-pro",
                generation_config=generation_config
            )
            logger.info("Gemini models configured successfully")
        else:
            # Silently disable Gemini when no API key is available
            logger.info("No GEMINI_API_KEY found - Gemini features disabled")
            flash_model = None
            pro_model = None
    except Exception as e:
        # Silently handle any Gemini configuration errors
        logger.error(f"Error configuring Gemini models: {e}")
        flash_model = None
        pro_model = None

    # Final status report
    logger.info(f"🎯 AI Client Initialization Complete:")
    logger.info(f"   OpenAI: {'✅ Enabled' if OPENAI_ENABLED else '❌ Disabled'}")
    logger.info(f"   Gemini Flash: {'✅ Available' if flash_model else '❌ Not Available'}")
    logger.info(f"   Gemini Pro: {'✅ Available' if pro_model else '❌ Not Available'}")
    logger.info(f"   OpenAI Client: {'✅ Created' if client else '❌ Not Created'}")

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
                    logger.warning(f"Gemini response from {model_instance.model_name} was empty after cleaning (attempt {attempt + 1}/2). Original: '{text}'")
                    if attempt == 0:
                        logger.info(f"Retrying... (attempt 2/2)")
                        continue
                    else:
                        logger.warning(f"Both Gemini attempts failed. Falling back to OpenAI")
                        break
                logger.info(f"Gemini API call successful using model: {model_instance.model_name}")
                return cleaned_text
            else:
                logger.warning(f"Gemini response from {model_instance.model_name} was empty or blocked (attempt {attempt + 1}/2). Full response:", response)
                if attempt == 0:
                    logger.info(f"Retrying... (attempt 2/2)")
                    continue
                else:
                    logger.warning(f"Both Gemini attempts failed. Falling back to OpenAI")
                    break
        except Exception as e:
            logger.error(f"Error calling Gemini API ({model_instance.model_name}) (attempt {attempt + 1}/2): {e}")
            if attempt == 0:
                logger.info(f"Retrying... (attempt 2/2)")
                continue
            else:
                logger.warning(f"Both Gemini attempts failed. Falling back to OpenAI")
                break
    
    # Gemini failed twice; fall back to OpenAI if available
    if OPENAI_ENABLED and client: # Use 'client' instead of 'openai_model_default'
        logger.info("🔄 Gemini failed twice – switching to OpenAI as fallback")
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
                logger.info(f"OpenAI API call successful using model: {model}")
                return response.choices[0].message.content.strip()
            logger.warning("OpenAI API returned no content")
            return "AI Error: No content returned"
        except Exception as e:
            logger.error(f"OpenAI API error: {e}")
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
    
    # Try Gemini first if available, otherwise fall back to OpenAI
    if flash_model:
        response = call_gemini(prompt, flash_model, use_short_tokens=True)
    elif OPENAI_ENABLED:
        response = call_ai(prompt, openai_model_default, use_short_tokens=True)
    else:
        logger.error("No AI models available for banking offer validation")
        return False
    
    logger.info(f"AI Check for Banking Offer Page. Response: '{response}'")
    return "yes" in response.lower()
