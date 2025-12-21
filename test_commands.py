import requests
import json

print("\n" + "="*50)
print("TEST: Private Mode (Agentic Commands)")
try:
    # Test DNI Search
    print("\n[CMD] 'Busca al DNI 12345678':")
    res = requests.post(
        'http://127.0.0.1:8000/api/chat/',
        json={'message': 'Busca al DNI 12345678', 'mode': 'private'}
    )
    print("RESPONSE (Raw JSON):")
    print(res.text)

    # Test Filter
    print("\n[CMD] 'Filtrame por salud':")
    res2 = requests.post(
        'http://127.0.0.1:8000/api/chat/',
        json={'message': 'Filtrame por salud', 'mode': 'private'}
    )
    print("RESPONSE (Raw JSON):")
    print(res2.text)

except Exception as e:
    print(f"ERROR: {e}")
print("="*50 + "\n")
