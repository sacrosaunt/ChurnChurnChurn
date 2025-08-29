import os
import pickle
from cryptography.fernet import Fernet

# --- Key Management ---
KEYS_FILE = 'data/api_keys.key'
ENCRYPTION_KEY_FILE = 'data/encryption.key'

def generate_encryption_key():
    """Generate and save an encryption key."""
    key = Fernet.generate_key()
    with open(ENCRYPTION_KEY_FILE, 'wb') as f:
        f.write(key)
    return key

def load_encryption_key():
    """Load the encryption key from file."""
    if os.path.exists(ENCRYPTION_KEY_FILE):
        with open(ENCRYPTION_KEY_FILE, 'rb') as f:
            return f.read()
    return None

def save_api_keys(openai_key, gemini_key):
    """Encrypt and save API keys."""
    encryption_key = load_encryption_key()
    if not encryption_key:
        encryption_key = generate_encryption_key()
    
    fernet = Fernet(encryption_key)
    encrypted_openai = fernet.encrypt(openai_key.encode())
    encrypted_gemini = fernet.encrypt(gemini_key.encode())
    
    keys = {
        'openai_api_key': encrypted_openai,
        'gemini_api_key': encrypted_gemini
    }
    
    with open(KEYS_FILE, 'wb') as f:
        pickle.dump(keys, f)

def load_api_keys():
    """Load and decrypt API keys."""
    encryption_key = load_encryption_key()
    if not encryption_key or not os.path.exists(KEYS_FILE):
        return None, None
        
    fernet = Fernet(encryption_key)
    with open(KEYS_FILE, 'rb') as f:
        keys = pickle.load(f)
        
    openai_key = fernet.decrypt(keys['openai_api_key']).decode()
    gemini_key = fernet.decrypt(keys['gemini_api_key']).decode()
    
    return openai_key, gemini_key
