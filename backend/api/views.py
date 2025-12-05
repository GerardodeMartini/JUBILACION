from rest_framework import viewsets, permissions, status, generics
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.db import transaction
from .models import User, Agent
from .serializers import UserSerializer, AgentSerializer

# Custom Token Serializer to include user info in response
class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        data['token'] = data.pop('access')
        data['username'] = self.user.username
        data['role'] = self.user.role
        return data

class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer

class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    permission_classes = (permissions.AllowAny,)
    serializer_class = UserSerializer

class AgentViewSet(viewsets.ModelViewSet):
    serializer_class = AgentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'admin':
            return Agent.objects.all()
        return Agent.objects.filter(user=user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=False, methods=['post'])
    def bulk(self, request):
        agents_data = request.data
        if not isinstance(agents_data, list):
            return Response({'error': 'Expected a list of agents'}, status=status.HTTP_400_BAD_REQUEST)
        
        created_agents = []
        try:
            with transaction.atomic():
                for agent_data in agents_data:
                    # Map frontend fields to backend fields if necessary, 
                    # but serializer expects snake_case usually. 
                    # The frontend sends camelCase? Let's check script.js.
                    # script.js sends: fullName, birthDate, gender, retirementDate, status, agreement, law, affiliateStatus, ministry
                    # Model expects: full_name, birth_date, ...
                    # I need to map keys or configure DRF to accept camelCase.
                    # Simplest is to map manually here or use a parser.
                    # Let's map manually for bulk since it's custom.
                    
                    data = {
                        'full_name': agent_data.get('fullName'),
                        'birth_date': agent_data.get('birthDate'),
                        'gender': agent_data.get('gender'),
                        'retirement_date': agent_data.get('retirementDate'),
                        'status': agent_data.get('status'),
                        'agreement': agent_data.get('agreement'),
                        'law': agent_data.get('law'),
                        'affiliate_status': agent_data.get('affiliateStatus'),
                        'ministry': agent_data.get('ministry'),
                        'user': request.user.id
                    }
                    serializer = self.get_serializer(data=data)
                    serializer.is_valid(raise_exception=True)
                    self.perform_create(serializer)
                    created_agents.append(serializer.data)
            return Response({'message': f'{len(created_agents)} agentes creados'}, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    # Override create to handle camelCase from frontend for single create too?
    # Or I can use djangorestframework-camel-case library.
    # Or just update frontend to send snake_case.
    # Updating frontend is cleaner but requires editing script.js.
    # Handling it in backend allows frontend to stay same.
    # I'll handle it in backend by overriding create or using a parser.
    # Actually, for single create, I can just override create method in ViewSet.
    
    def create(self, request, *args, **kwargs):
        # Manual mapping for single create to support existing frontend
        data = request.data.copy()
        mapping = {
            'fullName': 'full_name',
            'birthDate': 'birth_date',
            'retirementDate': 'retirement_date',
            'affiliateStatus': 'affiliate_status'
        }
        for camel, snake in mapping.items():
            if camel in data:
                data[snake] = data.pop(camel)
        
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)
