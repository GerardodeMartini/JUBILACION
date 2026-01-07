from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
import os

class Command(BaseCommand):
    help = 'Creates a superuser if it does not exist'

    def handle(self, *args, **options):
        User = get_user_model()
        username = os.environ.get('DJANGO_SUPERUSER_USERNAME', 'admin')
        password = os.environ.get('DJANGO_SUPERUSER_PASSWORD', 'admin123')
        email = os.environ.get('DJANGO_SUPERUSER_EMAIL', 'admin@example.com')

        if not User.objects.filter(username=username).exists():
            print(f'Creating superuser: {username}')
            User.objects.create_superuser(username=username, email=email, password=password)
            print('Superuser created successfully.')
        else:
            print(f'Superuser {username} already exists. Updating password...')
            user = User.objects.get(username=username)
            user.set_password(password)
            user.email = email
            user.is_staff = True
            user.is_superuser = True
            user.save()
            print('Superuser password/details updated.')
