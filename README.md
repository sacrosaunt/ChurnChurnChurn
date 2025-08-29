# ChurnChurnChurn

This project is a Flask application for tracking and planning bank account churning offers.

## Setup

Follow these instructions to set up and run the project locally.

### 1. Prerequisites

- Python 3.8+
- `venv` module (usually included with Python)

### 2. Create and Activate Virtual Environment

It is highly recommended to use a virtual environment to manage project dependencies.

**On macOS and Linux:**

```sh
# Create the virtual environment
python3 -m venv .venv

# Activate the virtual environment
source .venv/bin/activate
```

**On Windows:**

```sh
# Create the virtual environment
python -m venv .venv

# Activate the virtual environment
.venv\Scripts\activate
```

You should see `(.venv)` at the beginning of your terminal prompt, indicating that the virtual environment is active.

### 3. Install Dependencies

Install the required Python packages using pip and the `requirements.txt` file:

```sh
pip install -r requirements.txt
```

### 4. Running the Application

Once the setup is complete, you can run the Flask application:

```sh
python app.py
```

The application will automatically open in a new browser tab at `http://127.0.0.1:5000`.

### 5. API Key Setup

On the first run, you will be redirected to a setup page to enter your API keys.

-   You need to provide at least one key (either OpenAI or Gemini) to use the application.
-   The keys are stored locally and securely in the `data` directory.
-   After submitting your keys, the application will be ready to use.
