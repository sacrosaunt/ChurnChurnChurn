# ChurnChurnChurn

This project is a Flask application for tracking and planning bank account churning offers.

## Features

- Track bank account offers from URLs or manual content input
- AI-powered content analysis using OpenAI and Google Gemini
- Plan account opening strategies based on pay cycles
- Secure API key management
- Web-based interface for easy management

## About The Project

"Bank account churning" is the practice of opening new bank accounts to take advantage of promotional offers and sign-up bonuses. While it can be a great way to earn extra money, it can be challenging to keep track of different offers, their requirements (like minimum deposits or direct deposit setups), and important dates.

That's where ChurnChurnChurn comes in. This tool is designed to be your personal assistant for bank account churning. It helps you:

- **Discover and Track Offers:** Easily save and organize bank account offers you find online.
- **Understand the Fine Print:** Our AI-powered analysis extracts key details from offer descriptions, so you know exactly what you need to do to qualify for a bonus.
- **Plan Your Strategy:** The planning feature helps you schedule account openings and actions around your pay cycles to meet direct deposit requirements efficiently.
- **Stay Organized:** Keep all your churning activities in one place, so you never miss a deadline or a bonus.

Whether you're new to churning or a seasoned pro, ChurnChurnChurn helps you maximize your rewards and minimize the hassle.

## Quick Start

### 0. Prerequisites

- Python 3.8+
- `venv` module (usually included with Python)

### 1. Installation

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

### 2. Running the Application

```sh
# Option 1: Direct execution
python3 app.py

# Option 2: Using launcher script (after install.py)
./churnchurnchurn
```

The application will automatically open in a new browser tab at `http://127.0.0.1:5000`.

### 3. API Key Setup

On the first run, you will be redirected to a setup page to enter your API keys.

You need to provide at least one key (either OpenAI or Gemini) to use the application.


## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
