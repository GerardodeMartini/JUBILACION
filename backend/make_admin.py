
from api.models import User

def make_admin():
    # Update all users to admin for local dev convenience
    count = User.objects.update(role='admin', is_staff=True, is_superuser=True)
    print(f"Updated {count} users to Admin role.")

make_admin()
