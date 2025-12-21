import os
import django
from django.conf import settings

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'jubilacion_backend.settings')
django.setup()

from api.models import User

users = User.objects.all()
for u in users:
    print(f"Username: {u.username}, Active: {u.is_active}, Staff: {u.is_staff}, Superuser: {u.is_superuser}")
