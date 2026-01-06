from typing import Any, Dict
from rest_framework import serializers
from .models import User, Agent
from django.contrib.auth.password_validation import validate_password

class UserSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(required=True)
    first_name = serializers.CharField(required=False)
    last_name = serializers.CharField(required=False)
    confirm_password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'role', 'password', 'confirm_password', 'first_name', 'last_name')
        extra_kwargs = {'password': {'write_only': True}}


    def validate(self, data):
        if data['password'] != data['confirm_password']:
            raise serializers.ValidationError({"password": "Las contraseñas no coinciden."})
        
        # Enforce password complexity
        user = User(**data) if not self.instance else self.instance
        validate_password(data['password'], user)
        
        return data

    def create(self, validated_data: Dict[str, Any]) -> User:
        """
        Create and return a new User instance, given the validated data.
        """
        validated_data.pop('confirm_password')
        user = User.objects.create_user(**validated_data)
        return user

class AgentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Agent
        fields = [
            'id', 'user', 'full_name', 'birth_date', 'gender', 
            'retirement_date', 'status', 'agreement', 'law', 
            'affiliate_status', 'ministry', 'location', 
            'branch', 'cuil', 'dni', 'seniority'
        ]
        read_only_fields = ['user']
