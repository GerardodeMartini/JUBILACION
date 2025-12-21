import requests
import json

BASE_URL = 'http://127.0.0.1:8000/api/chat/'

def test_query(message, mode='public', label="Test"):
    print(f"\n--- {label} (Mode: {mode}) ---")
    print(f"User: {message}")
    try:
        response = requests.post(
            BASE_URL,
            json={'message': message, 'mode': mode}
        )
        if response.status_code == 200:
            data = response.json()
            if mode == 'private':
                 # Private mode should return a JSON string in 'response' or a structured object?
                 # Looking at views.py: return Response({'response': bot_reply})
                 # And the bot reply is a JSON string.
                 print(f"Bot Raw: {data.get('response')}")
            else:
                print(f"Bot: {data.get('response')}")
        else:
            print(f"Error {response.status_code}: {response.text}")
    except Exception as e:
        print(f"Exception: {e}")

# 1. Public Mode: Standard Question (Should be concise)
test_query("Cómo me jubilo?", mode='public', label="Public: Standard Info")

# 2. Public Mode: Off-topic (Should refuse)
test_query("Dame una receta de torta frita", mode='public', label="Public: Off-topic")

# 3. Public Mode: Hallucination Bait (Should not invent)
test_query("Cual es el trámite para jubilarse como astronauta en La Pampa?", mode='public', label="Public: Non-existent info")

# 4. Private Mode: Command (Should be valid JSON)
test_query("Buscame a Gomez", mode='private', label="Private: Search Command")
