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

### 4. Environment Variables

This project requires API keys for AI services. You'll need to set them as environment variables.

1.  Create a file named `.env` in the root of the project directory.
2.  Add your API keys to the `.env` file in the following format:

    ```
    GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
    OPENAI_API_KEY="YOUR_OPENAI_API_KEY"
    ```

    Replace `"YOUR_GEMINI_API_KEY"` and `"YOUR_OPENAI_API_KEY"` with your actual API keys. The application uses `python-dotenv` to load these variables automatically.

### 5. Running the Application

Once the setup is complete, you can run the Flask application:

```sh
python app.py
```

The application will be available at `http://127.0.0.1:5000`.
