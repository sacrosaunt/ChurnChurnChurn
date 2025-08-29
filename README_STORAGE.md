# Local Storage Documentation

## Overview
The application now includes persistent local storage for tracked offers and their parsed data. This ensures that data persists between application sessions.

## Storage Structure

### Directory Structure
```
churn/
├── data/                    # Storage directory
│   ├── offers.json         # Main offers data file
│   ├── next_id.txt         # Next offer ID counter
│   └── offers_backup_*.json # Backup files (timestamped)
├── app.py                  # Main application
└── README_STORAGE.md       # This file
```

### Data Files

#### `offers.json`
- **Format**: JSON
- **Content**: All tracked offers with their complete data
- **Structure**: 
  ```json
  {
    "1": {
      "id": 1,
      "url": "https://example.com/offer",
      "user_controlled": {
        "opened": false,
        "deposited": false,
        "received": false
      },
      "status": "completed",
      "processing_step": "Done",
      "details": {
        "bank_name": "Example Bank",
        "account_title": "Checking Account",
        "bonus_to_be_received": "300",
        // ... other extracted fields
      }
    }
  }
  ```

#### `next_id.txt`
- **Format**: Plain text
- **Content**: Next available offer ID (integer)
- **Purpose**: Ensures unique offer IDs across sessions

## Features

### Automatic Persistence
- **Offer Creation**: New offers are immediately saved to storage
- **Data Updates**: All field updates (AI processing, user changes) are saved
- **Status Changes**: Processing status and completion are persisted
- **User Actions**: Checkbox changes (opened, deposited, received) are saved
- **Deletions**: Removed offers are deleted from storage

### Error Handling
- **Graceful Degradation**: If storage fails, the app continues to work
- **Detailed Logging**: All storage operations are logged with emojis
- **Fallback Behavior**: Missing storage files are handled gracefully

### Backup System
- **Automatic Backups**: Can create timestamped backups
- **API Endpoint**: `/api/storage/backup` (POST)
- **Backup Location**: `data/offers_backup_YYYYMMDD_HHMMSS.json`

### Statistics
- **Storage Stats**: `/api/storage/stats` (GET)
- **Metrics**: Total offers, completed, failed, processing counts
- **File Size**: Storage file size information

## API Endpoints

### Storage Statistics
```http
GET /api/storage/stats
```
**Response:**
```json
{
  "total_offers": 5,
  "completed_offers": 3,
  "failed_offers": 1,
  "processing_offers": 1,
  "storage_file_size": 2048,
  "next_offer_id": 6
}
```

### Create Backup
```http
POST /api/storage/backup
```
**Response:**
```json
{
  "message": "Backup created successfully",
  "backup_file": "data/offers_backup_20241201_143022.json"
}
```

## Implementation Details

### Storage Functions

#### `load_offers()`
- Loads offers from `offers.json`
- Converts string keys back to integers
- Handles missing files gracefully
- Loads next offer ID from `next_id.txt`

#### `save_offer(offer_id)`
- Saves a single offer to storage
- Updates both offers data and next ID
- Handles concurrent access safely

#### `save_offers()`
- Saves all offers at once
- Used for bulk operations

#### `delete_offer_from_storage(offer_id)`
- Removes an offer from storage
- Updates the JSON file

#### `backup_offers()`
- Creates timestamped backup
- Returns backup file path

#### `get_storage_stats()`
- Returns comprehensive storage statistics
- Includes offer counts by status

### Integration Points

#### Offer Creation
```python
offers[offer_id] = {...}
save_offer(offer_id)  # Immediately saved
```

#### AI Processing
```python
offers[offer_id]['details'][field_name] = result
save_offer(offer_id)  # Saved after each field
```

#### User Actions
```python
offers[offer_id]['user_controlled'][field] = bool(value)
save_offer(offer_id)  # Saved on user changes
```

#### Offer Deletion
```python
del offers[offer_id]
delete_offer_from_storage(offer_id)  # Removed from storage
```

## Benefits

1. **Data Persistence**: Offers survive application restarts
2. **User Continuity**: No data loss between sessions
3. **Reliability**: Robust error handling and logging
4. **Backup Safety**: Automatic backup creation capability
5. **Performance**: Efficient single-offer saves
6. **Monitoring**: Storage statistics and health checks

## Migration

### From In-Memory to Persistent
- **Automatic**: Existing in-memory data is preserved
- **Seamless**: No user action required
- **Backward Compatible**: Works with existing frontend

### File Format
- **JSON**: Human-readable and editable
- **UTF-8**: Supports international characters
- **Pretty-printed**: Easy to inspect and debug

## Troubleshooting

### Common Issues

#### Storage File Corruption
```bash
# Check file integrity
python -c "import json; json.load(open('data/offers.json'))"
```

#### Missing Storage Directory
```bash
# Create directory
mkdir -p data
```

#### Permission Issues
```bash
# Check permissions
ls -la data/
chmod 755 data/
```

### Recovery

#### From Backup
```python
# Restore from backup
import json
with open('data/offers_backup_20241201_143022.json', 'r') as f:
    offers_data = json.load(f)
with open('data/offers.json', 'w') as f:
    json.dump(offers_data, f, indent=2)
```

#### Reset Storage
```bash
# Remove storage files
rm data/offers.json data/next_id.txt
# Restart application
```

## Future Enhancements

1. **Compression**: Gzip compression for large datasets
2. **Encryption**: Optional encryption for sensitive data
3. **Database**: SQLite migration for complex queries
4. **Cloud Sync**: Remote backup and synchronization
5. **Versioning**: Data versioning and rollback capabilities 