import os
import google.generativeai as genai
from openai import OpenAI
from key_management import load_api_keys
from config import SHORT_PROMPT_MAX_TOKENS, LONG_PROMPT_MAX_TOKENS, CONTEXT_SIZE

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
    
    openai_api_key, gemini_api_key = load_api_keys()
    
    if openai_api_key:
        os.environ['OPENAI_API_KEY'] = openai_api_key
    if gemini_api_key:
        os.environ['GEMINI_API_KEY'] = gemini_api_key

    # Configure OpenAI
    try:
        if os.environ.get("OPENAI_API_KEY"):
            client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
            print("✅ OpenAI configured successfully.")
            OPENAI_ENABLED = True
        else:
            print("⚠️  OPENAI_API_KEY not set. ChatGPT features disabled.")
            OPENAI_ENABLED = False
    except Exception as e:
        print(f"An error occurred while configuring OpenAI: {e}")

    # Configure Gemini
    try:
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
        print("✅ Gemini AI Models (Flash & Pro) configured successfully.")
    except KeyError:
        print("❌ ERROR: GEMINI_API_KEY environment variable not found.")
    except Exception as e:
        print(f"An error occurred during Gemini configuration: {e}")

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
    if OPENAI_ENABLED and client: # Use 'client' instead of 'openai_model_default'
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
