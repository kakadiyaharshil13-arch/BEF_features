# Bharat Exam Fest — AI Answer Evaluator (FastAPI Version)

## Setup

1. Open `.env`
2. Replace `YOUR_GEMINI_API_KEY_HERE` with your actual Google Gemini API key
3. Install dependencies:
   ```bash
   venv\Scripts\pip install -r requirements.txt
   ```
4. Start the server:
   ```bash
   venv\Scripts\python main.py
   ```
5. Open `http://127.0.0.1:5000` in your browser.

## Getting a Gemini API Key
- Go to https://aistudio.google.com/app/apikey
- Create a new API key
- Paste it into the `.env` file as `GEMINI_API_KEY`

## ⚠️ Security Note
In this version, the API key is handled securely by the Python backend and is not exposed to the browser.
