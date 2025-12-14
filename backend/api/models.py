from django.db import models
from django.contrib.auth.models import AbstractUser

class User(AbstractUser):
    ROLE_CHOICES = (
        ('admin', 'Admin'),
        ('user', 'User'),
    )
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default='user')

class Agent(models.Model):
    id = models.UUIDField(primary_key=True, default=None, editable=False) # We will generate UUIDs or let Django do it. 
    # Actually, standard Django uses AutoField (int) for ID. The current app uses UUID strings.
    # To keep compatibility with frontend which expects string IDs, UUIDField is good.
    # But I need to import uuid.
    
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='agents')
    full_name = models.CharField(max_length=255, db_index=True)
    birth_date = models.DateField(null=True, blank=True)
    gender = models.CharField(max_length=10)
    retirement_date = models.DateField(null=True, blank=True)
    status = models.JSONField(default=dict) # Stores {code: '...', label: '...'}
    agreement = models.CharField(max_length=255, blank=True, null=True)
    law = models.CharField(max_length=255, blank=True, null=True)
    affiliate_status = models.CharField(max_length=255, blank=True, null=True)
    ministry = models.CharField(max_length=255, blank=True, null=True)
    location = models.CharField(max_length=255, blank=True, null=True) # Ubicacion
    branch = models.CharField(max_length=255, blank=True, null=True)   # Rama
    cuil = models.CharField(max_length=50, blank=True, null=True, db_index=True)      # CUIL
    dni = models.CharField(max_length=20, blank=True, null=True, db_index=True, unique=True)       # DNI
    seniority = models.CharField(max_length=50, blank=True, null=True) # Antiguedad
    created_at = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        if not self.id:
            import uuid
            self.id = uuid.uuid4()
        super().save(*args, **kwargs)
