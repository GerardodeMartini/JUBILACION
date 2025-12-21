import requests
import json

try:
    response = requests.post(
        'http://127.0.0.1:8000/api/chat/',
        json={'message': 'Hola, funciona?'}
    )
    print(f"Status Code: {response.status_code}")
    print("Response Body:")
    print(response.text)
except Exception as e:
    print(f"Error: {e}")
