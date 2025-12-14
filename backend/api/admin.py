from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User, Agent

# Register Custom User Model
@admin.register(User)
class CustomUserAdmin(UserAdmin):
    list_display = ('username', 'email', 'role', 'is_staff', 'is_active')
    list_filter = ('role', 'is_staff', 'is_active')
    fieldsets = UserAdmin.fieldsets + (
        ('Custom Fields', {'fields': ('role',)}),
    )
    add_fieldsets = UserAdmin.add_fieldsets + (
        ('Custom Fields', {'fields': ('role',)}),
    )

# Register Agent Model
@admin.register(Agent)
class AgentAdmin(admin.ModelAdmin):
    list_display = ('dni', 'full_name', 'status', 'ministry', 'retirement_date')
    list_filter = ('status', 'ministry', 'gender')
    search_fields = ('dni', 'full_name', 'affiliate_status')
