# ChurnChurnChurn

This project is a Flask application for tracking and planning bank account churning offers.

## Features

- Track bank account offers from URLs or manual content input
- AI-powered content analysis using OpenAI and Google Gemini
- Plan account opening strategies based on pay cycles
- Secure API key management
- Web-based interface for easy management

## Quick Start

### 1. Prerequisites

- Python 3.8+
- `venv` module (usually included with Python)

### 2. Installation

**Option A: Automated Installation (Recommended)**
```sh
# Download and extract the package
# Run the installation script
python3 install.py
```

**Option B: Manual Installation**
```sh
# Create and activate virtual environment
python3 -m venv .venv
source .venv/bin/activate  # On macOS/Linux
# .venv\Scripts\activate   # On Windows

# Install dependencies
pip install -r requirements.txt
```

### 3. Running the Application

```sh
# Option 1: Direct execution
python3 app.py

# Option 2: Using launcher script (after install.py)
./churnchurnchurn
```

The application will automatically open in a new browser tab at `http://127.0.0.1:5000`.

### 4. API Key Setup

On the first run, you will be redirected to a setup page to enter your API keys.

-   You need to provide at least one key (either OpenAI or Gemini) to use the application.
-   The keys are stored locally and securely in the `data` directory.
-   After submitting your keys, the application will be ready to use.

## Packaging and Distribution

### Creating Distribution Packages

To create distributable packages:

```sh
python3 deploy.py
```

This creates:
- `dist/churnchurnchurn-YYYYMMDD/` - Package directory
- `dist/churnchurnchurn-YYYYMMDD.zip` - ZIP archive
- `dist/churnchurnchurn-YYYYMMDD.tar.gz` - TAR.GZ archive

### Distributing Your Application

1. Run `python3 deploy.py` to create distribution packages
2. Share the ZIP or TAR.GZ file with users
3. Users can extract and run `python3 install.py` to install

## Project Structure

```
ChurnChurnChurn/
├── app.py                 # Main Flask application
├── src/                   # Source code
│   ├── core/             # Core business logic
│   ├── data/             # Data management
│   ├── services/         # External service integrations
│   └── utils/            # Utility functions
├── static/               # Static assets (CSS, JS)
├── templates/            # HTML templates
├── data/                 # Data storage
├── install.py            # Installation script
├── deploy.py             # Deployment script
├── requirements.txt      # Dependencies
└── README.md            # This file
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
