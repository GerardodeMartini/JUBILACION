from typing import Any, Dict
from django.http import HttpResponse
from django.db.models import QuerySet
from rest_framework import viewsets, permissions, status, generics
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.db import transaction
from .models import User, Agent
from .serializers import UserSerializer, AgentSerializer

# Custom Token Serializer to include user info in response
class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validates the token request and adds custom claims (username, role).

        Args:
            attrs (Dict[str, Any]): The validation attributes.

        Returns:
            Dict[str, Any]: Validated data with custom claims.
        """
        data = super().validate(attrs)
        data['token'] = data.pop('access')
        data['username'] = self.user.username  # type: ignore
        data['role'] = self.user.role  # type: ignore
        return data

class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer

class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    # permission_classes = (permissions.AllowAny,) # Default is AllowAny? Let's be explicit
    permission_classes = (permissions.AllowAny,)
    serializer_class = UserSerializer

    def create(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        """
        Creates a new user instance.

        Args:
            request (Request): The HTTP request containing user data.

        Returns:
            Response: The created user data or an error message.
        """
        try:
            return super().create(request, *args, **kwargs)
        except Exception as e:
            import traceback
            traceback.print_exc()
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class AgentViewSet(viewsets.ModelViewSet):
    serializer_class = AgentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self) -> QuerySet:
        """
        Returns the list of agents belonging to the current user.
        Supports filtering by specific fields and status.
        """
        user = self.request.user
        queryset = Agent.objects.filter(user=user).select_related('user')
        
        # Status Filter
        status_param = self.request.query_params.get('status')
        if status_param:
            queryset = queryset.filter(status__code=status_param)

        # Specific Field Filters
        dni = self.request.query_params.get('dni')
        if dni:
            queryset = queryset.filter(dni__icontains=dni)

        name = self.request.query_params.get('name') # Search in full_name
        if name:
            queryset = queryset.filter(full_name__icontains=name)

        cuil = self.request.query_params.get('cuil')
        if cuil:
            queryset = queryset.filter(cuil__icontains=cuil)

        affiliate = self.request.query_params.get('affiliate')
        if affiliate:
            queryset = queryset.filter(affiliate_status__icontains=affiliate)

        ministry = self.request.query_params.get('ministry') # Filter by jurisdiction (Col M)
        if ministry:
            queryset = queryset.filter(ministry__icontains=ministry)
            
        return queryset.order_by('full_name') # Sort alphabetically by default as requested before


    @action(detail=False, methods=['get'])
    def stats(self, request: Request) -> Response:
        """
        Returns global statistics for the user's agents.
        Used to populate dashboard counters independently of pagination.
        """
        user = self.request.user
        queryset = Agent.objects.filter(user=user)
        
        total = queryset.count()
        vencido = queryset.filter(status__code='vencido').count()
        proximo = queryset.filter(status__code='proximo').count()
        inminente = queryset.filter(status__code='inminente').count()
        
        return Response({
            'total': total,
            'vencido': vencido,
            'proximo': proximo,
            'inminente': inminente
        })

    @action(detail=False, methods=['post'])
    def bulk(self, request: Request) -> Response:
        """
        Bulk creates agents from a list of data using bulk_create for performance.
        Skips duplicates (DNI) by pre-fetching existing DNIS.
        """
        agents_data = request.data
        if not isinstance(agents_data, list):
            return Response({'error': 'Expected a list of agents'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            # 1. Extract all DNIs from incoming data to optimize duplicate checking
            # Filter out entries with no DNI to avoid issues or handle them separately
            incoming_dnis = {str(d.get('dni')).strip() for d in agents_data if d.get('dni')}
            
            # 2. Query DB once to find which of these DNIs already exist for this user
            existing_dnis = set(Agent.objects.filter(
                user=request.user, 
                dni__in=incoming_dnis
            ).values_list('dni', flat=True))

            new_agents = []
            skipped_count = 0
            errors = []

            for index, agent_data in enumerate(agents_data):
                dni = agent_data.get('dni')
                # Normalize DNI same way as above
                if dni:
                    dni = str(dni).strip()

                # Deduplication Check
                if dni and dni in existing_dnis:
                    skipped_count += 1
                    continue
                
                # If DNI appeared multiple times in the SAME request, we should also track that
                # We can add 'dni' to existing_dnis immediately to catch duplicates within the file itself
                if dni:
                    existing_dnis.add(dni)

                try:
                    # Prepare agent instance (no save() yet)
                    agent = Agent(
                        user=request.user,
                        full_name=agent_data.get('fullName'),
                        birth_date=agent_data.get('birthDate'),
                        gender=agent_data.get('gender'),
                        retirement_date=agent_data.get('retirementDate'),
                        status=agent_data.get('status'),
                        agreement=agent_data.get('agreement'),
                        law=agent_data.get('law'),
                        affiliate_status=agent_data.get('affiliateStatus'),
                        ministry=agent_data.get('ministry'),
                        location=agent_data.get('location'),
                        branch=agent_data.get('branch'),
                        cuil=agent_data.get('cuil'),
                        dni=dni, # Use normalized DNI
                        seniority=agent_data.get('seniority')
                    )
                    new_agents.append(agent)

                except Exception as e:
                    errors.append(f"Row {index}: Error preparing data - {str(e)}")

            # 3. Bulk Insert
            if new_agents:
                # bulk_create ignores signals like post_save, but is very fast.
                # Since we don't have critical logic in save() other than ID generation 
                # (which custom clean Agent.save logic might handle or UUIDField defaults),
                # we need to be careful.
                # Agent model has 'id = uuid.uuid4()' in save(). 
                # bulk_create DOES NOT call save(). So IDs won't be generated if they are generated in save().
                # We must generate IDs manually here if the model relies on save() for it.
                
                import uuid
                for a in new_agents:
                    if not a.id:
                        a.id = uuid.uuid4()
                        
                Agent.objects.bulk_create(new_agents, batch_size=1000)

            created_count = len(new_agents)
            
            msg = f"Importación finalizada. Creados: {created_count}. Duplicados omitidos: {skipped_count}."
            if errors:
                msg += f" Errores varios: {len(errors)} (ver consola)."
            
            return Response({
                'message': msg,
                'created': created_count,
                'skipped': skipped_count,
                'errors': errors
            }, status=status.HTTP_200_OK)

        except Exception as e:
            import traceback
            traceback.print_exc()
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def create(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        """
        Creates a single agent. Handles camelCase to snake_case mapping for frontend compatibility.

        Args:
            request (Request): HTTP request.

        Returns:
            Response: Created agent or error.
        """
        try:
            # Manual mapping for single create to support existing frontend
            data = request.data.copy()
            mapping = {
                'fullName': 'full_name',
                'birthDate': 'birth_date',
                'retirementDate': 'retirement_date',
                'affiliateStatus': 'affiliate_status',
                'location': 'location',
                'branch': 'branch',
                'cuil': 'cuil',
                'dni': 'dni',
                'seniority': 'seniority'
            }
            for camel, snake in mapping.items():
                if camel in data:
                    data[snake] = data.pop(camel)
            
            return super().create(request, *args, **kwargs)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['delete'])
    def delete_all(self, request: Request) -> Response:
        """
        Deletes all agents belonging to the current user.
        """
        try:
            count, _ = Agent.objects.filter(user=request.user).delete()
            return Response({'message': f'Se eliminaron {count} agentes.'}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['get'])
    def export(self, request: Request) -> HttpResponse:
        """
        Exports the filtered agents to an Excel file.
        """
        import openpyxl


        # 1. Get filtered queryset (reuse existing logic)
        queryset = self.get_queryset()

        # 2. Create Workbook
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Agentes Filtrados"

        # 3. Headers
        headers = [
            'Nombre Completo', 'DNI', 'CUIL', 'Sexo', 'Fecha Nac.', 
            'Fecha Retiro', 'Edad', 'Estado', 'Ley', 'Afiliado', 
            'Ministerio', 'Repartición', 'Localidad', 'Antigüedad', 'Convenio'
        ]
        ws.append(headers)

        # 4. Data Rows
        from datetime import date
        today = date.today()

        for agent in queryset:
            # Calculate Age
            age = None
            if agent.birth_date:
                age = today.year - agent.birth_date.year - ((today.month, today.day) < (agent.birth_date.month, agent.birth_date.day))

            # Format Status
            status_label = agent.status.get('label') if isinstance(agent.status, dict) else str(agent.status)

            ws.append([
                agent.full_name,
                agent.dni,
                agent.cuil,
                agent.gender,
                agent.birth_date,
                agent.retirement_date,
                age,
                status_label,
                agent.law,
                agent.affiliate_status,
                agent.ministry,
                agent.branch,
                agent.location,
                agent.seniority,
                agent.agreement
            ])

        # 5. Response
        response = HttpResponse(content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        response['Content-Disposition'] = 'attachment; filename=agentes_filtrados.xlsx'
        
        wb.save(response)
        return response            

