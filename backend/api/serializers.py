from typing import Any, Dict
from rest_framework import serializers
from .models import User, Agent

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ('id', 'username', 'role', 'password')
        extra_kwargs = {'password': {'write_only': True}}

    def create(self, validated_data: Dict[str, Any]) -> User:
        """
        Create and return a new User instance, given the validated data.
        """
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
