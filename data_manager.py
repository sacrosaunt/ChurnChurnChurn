import os
import json
from datetime import datetime

# Storage configuration
STORAGE_DIR = 'data'
OFFERS_FILE = os.path.join(STORAGE_DIR, 'offers.json')
NEXT_ID_FILE = os.path.join(STORAGE_DIR, 'next_id.txt')

# Ensure storage directory exists
os.makedirs(STORAGE_DIR, exist_ok=True)

offers = {}
next_offer_id = 1

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

def save_offer(offer_id):
    """Save a single offer to storage."""
    global next_offer_id
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
    global next_offer_id
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
