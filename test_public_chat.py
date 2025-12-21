import requests
import json

print("\n\n" + "="*50)
try:
    print("TEST: Asking for 'Ordinaria' (Public)...")
    res = requests.post(
        'http://127.0.0.1:8000/api/chat/',
        json={'message': '¿Qué es la jubilación ordinaria?', 'mode': 'public'}
    )
    print("RESPONSE:")
    print(res.json()['response'])
    
    print("\n")

    print("TEST: Asking for 'Ordinaria' (Private)...")
    res2 = requests.post(
        'http://127.0.0.1:8000/api/chat/',
        json={'message': '¿Qué es la jubilación ordinaria?', 'mode': 'private'}
    )
    print("RESPONSE:")
    print(res2.json()['response'])

except Exception as e:
    print(f"ERROR: {e}")
print("="*50 + "\n\n")
