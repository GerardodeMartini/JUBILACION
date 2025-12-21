from typing import Any, Dict
from django.http import HttpResponse
from django.db.models import QuerySet
from rest_framework import viewsets, permissions, status, generics, views
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.db import transaction
from .models import User, Agent
from .serializers import UserSerializer, AgentSerializer
from django.contrib.auth.models import Permission
from django.contrib.contenttypes.models import ContentType

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

from django.core.mail import send_mail
from django.conf import settings
from django.urls import reverse
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.contrib.auth.tokens import default_token_generator
from django.shortcuts import redirect

import requests

class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer

class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    permission_classes = (permissions.AllowAny,)
    serializer_class = UserSerializer

    def create(self, request, *args, **kwargs):
        # 1. Verify Turnstile CAPTCHA
        token = request.data.get('turnstile_token')
        
        # In Production, failing to provide a token should be strictly blocked.
        # Check settings to see if we are in a mode that requires it (implied by keys existence)
        site_verify_url = getattr(settings, 'TURNSTILE_VERIFY_URL', 'https://challenges.cloudflare.com/turnstile/v0/siteverify')
        secret_key = getattr(settings, 'TURNSTILE_SECRET_KEY', None)

        if secret_key:
            if not token:
                return Response({'error': 'Por favor completa el desafío de seguridad (CAPTCHA).'}, status=status.HTTP_400_BAD_REQUEST)
            
            try:
                response = requests.post(site_verify_url, data={
                    'secret': secret_key,
                    'response': token,
                    'remoteip': self.get_client_ip(request)
                })
                result = response.json()
                
                if not result.get('success'):
                    return Response({
                        'error': 'Error de validación de seguridad. Intente nuevamente.',
                        'details': result.get('error-codes')
                    }, status=status.HTTP_400_BAD_REQUEST)
            except Exception as e:
                print(f"Turnstile Error: {e}")
                return Response({'error': 'Error interno validando seguridad.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        # 2. Proceed with user creation
        return super().create(request, *args, **kwargs)

    def get_client_ip(self, request):
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            ip = x_forwarded_for.split(',')[0]
        else:
            ip = request.META.get('REMOTE_ADDR')
        return ip

    def perform_create(self, serializer):
        # Create inactive user
        user = serializer.save(is_active=False)
        
        # Generate token and uid
        token = default_token_generator.make_token(user)
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        
        # Construct link (Dynamic for Prod/Dev compatibility)
        # Uses request.scheme (http/https) and get_host() (domain) to build the correct URL
        activation_link = f"{self.request.scheme}://{self.request.get_host()}/api/auth/activate/{uid}/{token}/"
        
        # Send Email
        send_mail(
            subject='Activa tu cuenta en PILIN',
            message=f'Hola {user.username},\n\nPor favor activa tu cuenta haciendo clic en el siguiente enlace:\n{activation_link}\n\nGracias!',
            from_email=settings.DEFAULT_FROM_EMAIL if hasattr(settings, 'DEFAULT_FROM_EMAIL') else 'noreply@pilin.local',
            recipient_list=[user.email],
            fail_silently=False,
        )

        try:
            # Grant View Permission for Agents and Staff Access
            content_type = ContentType.objects.get_for_model(Agent)
            view_permission = Permission.objects.get(codename='view_agent', content_type=content_type)
            user.user_permissions.add(view_permission)
            
            user.is_staff = True
            user.save()
        except Exception as e:
            print(f"Error granting permissions: {e}")

class ActivateAccountView(views.APIView):
    permission_classes = (permissions.AllowAny,)

    def get(self, request, uidb64, token):
        try:
            uid = force_str(urlsafe_base64_decode(uidb64))
            user = User.objects.get(pk=uid)
        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
            user = None

        if user is not None and default_token_generator.check_token(user, token):
            user.is_active = True
            user.save()
            # Redirect to login with success flag
            return redirect('/login.html?activated=true')
        else:
            return Response({'error': 'Token inválido o expirado'}, status=status.HTTP_400_BAD_REQUEST)

class AgentViewSet(viewsets.ModelViewSet):
    serializer_class = AgentSerializer
    serializer_class = AgentSerializer
    
    def get_permissions(self):
        """
        Instantiates and returns the list of permissions that this view requires.
        """
        if self.action in ['create', 'update', 'partial_update', 'destroy', 'bulk', 'delete_all']:
            permission_classes = [permissions.IsAdminUser]
        else:
            permission_classes = [permissions.IsAuthenticated]
        return [permission() for permission in permission_classes]

    def get_queryset(self) -> QuerySet:
        """
        Returns the list of agents belonging to the current user.
        Supports filtering by specific fields and status.
        """
        user = self.request.user
        # Shared DB: All authenticated users see all agents
        queryset = Agent.objects.all().select_related('user')
        
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

        agreement = self.request.query_params.get('agreement') # Filter by Convention (Col I)
        if agreement:
            queryset = queryset.filter(agreement__icontains=agreement)

        surname = self.request.query_params.get('surname') # Alias for name search
        if surname:
            queryset = queryset.filter(full_name__icontains=surname)
            
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
                    if dni in ['-', '']: # Skip invalid placeholders
                        skipped_count += 1
                        continue

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

from groq import Groq

class ChatView(views.APIView):
    permission_classes = [permissions.AllowAny] # Public chatbot

    def post(self, request):
        user_message = request.data.get('message')
        mode = request.data.get('mode', 'public') # 'public' or 'private'

        if not user_message:
            return Response({'error': 'Message is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            client = Groq(
                api_key=getattr(settings, 'GROQ_API_KEY', None),
            )

            # --- PROMPT STRATEGY ---
            if mode == 'private':
                # Dashboard Assistant (Agentic JSON Mode)
                system_prompt = (
                    "Sos 'PILIN', el asistente del Dashboard del sistema de jubilaciones. "
                    "Tu función EXCLUSIVA es controlar la interfaz mediante comandos JSON. "
                    "NO inventes datos. NO agregues explicaciones fuera del JSON. "
                    "Si no entendés la orden, devolvé un JSON con intent='message' preguntando nuevamente. "
                    "SIEMPRE debes responder con un JSON válido (sin markdown ```json). "
                    "Formato de respuesta: {\"intent\": \"...\", \"action\": \"...\", \"value\": \"...\", \"reply\": \"...\"}\n"
                    "INTENCIONES:\n"
                    "1. 'command': Para ejecutar una acción.\n"
                    "   - Buscar DNI: action='search_dni', value='12345678'\n"
                    "   - Filtrar Jurisdicción: action='filter_jurisdiction', value='Salud' (o lo que pida).\n"
                    "   - Filtrar Convenio: action='filter_agreement', value='Ley 643' (o lo que pida).\n"
                    "   - Filtrar Apellido: action='filter_surname', value='Perez'.\n"
                    "2. 'message': Para charlar sin acciones. reply='Texto de respuesta'.\n"
                    "EJEMPLOS:\n"
                    "- User: 'Busca al 20300400' -> {\"intent\": \"command\", \"action\": \"search_dni\", \"value\": \"20300400\", \"reply\": \"Buscando al agente...\"}\n"
                    "- User: 'Mostrame salud' -> {\"intent\": \"command\", \"action\": \"filter_jurisdiction\", \"value\": \"Salud\", \"reply\": \"Filtrando por Salud.\"}\n"
                    "- User: 'Hola' -> {\"intent\": \"message\", \"reply\": \"Hola, ¿qué buscás hoy?\"}"
                )
            else:
                # Public Expert (Friendly but Restricted)
                system_prompt = (
                    "¡Hola! Soy 'PILIN', tu asistente virtual amigable del Instituto de Seguridad Social (ISS) de La Pampa. 🤖✨ "
                    "Estoy aquí para brindarte INFORMACIÓN general sobre jubilaciones."
                    "\n\n"
                    "Mis capacidades son LIMITADAS a:\n"
                    "1. Explicar requisitos de jubilaciones (Ordinaria, Invalidez, etc.).\n"
                    "2. Proveer links a la normativa oficial.\n"
                    "3. Responder saludos y preguntas básicas de cortesía.\n"
                    "\n"
                    "📕 RESPUESTAS ESPECÍFICAS (Usa este texto si preguntan por ANSES/Privados/Monotributo):\n"
                    "  'Para jubilarte necesitás tener la edad (60 años las mujeres y 65 los varones) y 30 años de aportes. Si trabajaste en el sector privado, campo o sos monotributista, te corresponde ANSES.\n"
                    "  ¿Cómo empezar? Primero, revisá tus aportes entrando a la página de ANSES con tu clave. Si te faltan años, no te preocupes: podés consultar por la Moratoria para completarlos.\n"
                    "  ¿Dónde ir? El trámite es con turno previo. Una vez que lo tengas, presentate con tu DNI en la oficina de tu ciudad (Santa Rosa, General Pico, General Acha, Victorica o Realicó). Si sos mamá, no te olvides de llevar las partidas de nacimiento de tus hijos, porque te suman años de aporte.\n"
                    "  Para más información: [🏢 Jubilación por Anses](https://dgp.lapampa.gob.ar/jubilacion-por-anses)'\n"
                    "\n"
                    "⛔ SI PREGUNTAN POR: 'Retiro Especial', 'Jubilación Anticipada', 'Anticipada' o 'Ley 3581' -> RESPONDE SOLO ESTO:\n"
                    "  'Este sistema está diseñado para empleados que cuentan con los años de aportes necesarios pero aún no alcanzan la edad jubilatoria ordinaria. A continuación, te detallo los puntos clave:\n"
                    "\n"
                    "  1. Requisitos para acceder\n"
                    "  Para solicitar este retiro, el agente debe cumplir con las siguientes condiciones:\n"
                    "  - Edad mínima: 55 años para las mujeres y 60 años para los varones.\n"
                    "  - Aportes: Registrar 30 años o más de servicios con aportes.\n"
                    "  - Aportes en La Pampa: De esos 30 años, al menos 20 años deben haber sido aportados al Instituto de Seguridad Social (ISS) de La Pampa.\n"
                    "  - Caja Otorgante: El ISS debe ser la caja otorgante de la prestación (donde se registra la mayor cantidad de aportes).\n"
                    "\n"
                    "  2. Monto del beneficio (Haber)\n"
                    "  - Se garantiza que el monto no sea inferior al haber mínimo jubilatorio vigente.\n"
                    "  - Se mantiene el derecho a percibir el Sueldo Anual Complementario (Aguinaldo) y los aumentos que se otorguen al sector pasivo.\n"
                    "\n"
                    "  Más información: [📜 Retiro Especial](https://dgp.lapampa.gob.ar/jubilaciones-especiales)'\n"
                    "\n"
                    "⛔ SI PREGUNTAN POR: 'Ley 2954', '2954' o 'Suplemento Especial Vitalicio' -> RESPONDE SOLO ESTO:\n"
                    "  'El Suplemento Especial Vitalicio (Ley 2954) es un beneficio previsional específico de la provincia de La Pampa, diseñado para corregir una situación de \"injusticia previsional\" que afectaba a empleados públicos que ingresaron al Estado bajo modalidades de contratación especial y luego pasaron a planta permanente.\n"
                    "\n"
                    "  1. ¿A quiénes está dirigido?\n"
                    "  El beneficio alcanza a los empleados públicos provinciales (y municipales de localidades adheridas) que:\n"
                    "  - Ingresaron al régimen del Instituto de Seguridad Social (ISS) entre el 1 de enero de 2004 y el 31 de diciembre de 2007.\n"
                    "  - Incluye también a quienes pasaron a planta mediante la Ley 2343 (ex pasantes o contratados).\n"
                    "  - Excepciones: No aplica para los escalafones Docente, Judicial ni Policial.\n"
                    "\n"
                    "  Más información: [📜 Suplemento Especial Vitalicio](https://dgp.lapampa.gob.ar/jubilacion-anticipada)'\n"
                    "\n"
                    "🚫 LO QUE NO PUEDO HACER (Y NO DEBO OFRECER):\n"
                    "- NO puedo consultar estado de trámites personales.\n"
                    "- NO puedo completar documentos ni formularios.\n"
                    "- NO puedo ver datos de agentes específicos.\n"
                    "\n"
                    "Enlaces útiles (USA FORMATO MARKDOWN `[Titulo](URL)` para que sean clicables):\n"
                    "- [👵 Jubilación Ordinaria](https://dgp.lapampa.gob.ar/jubilacion-ordinaria)\n"
                    "- [♿ Jubilación por Invalidez](https://dgp.lapampa.gob.ar/jubilacion-anticipada)\n"
                    "- [⏳ Jubilación Anticipada](https://dgp.lapampa.gob.ar/jubilacion-anticipada)\n"
                    "- [📜 Suplemento Especial Vitalicio](https://dgp.lapampa.gob.ar/jubilacion-anticipada)\n"
                    "- [🏢 Jubilación por Anses](https://dgp.lapampa.gob.ar/jubilacion-por-anses)\n\n"
                    "⚠️ REGLA DE ORO: JAMÁS pongas enlaces a `www.anses.gob.ar` ni otros sitios nacionales. SOLO usa los enlaces de `dgp.lapampa.gob.ar` listados arriba. \n"
                    "⚠️ RESTRICCIÓN FINAL: SI LA PREGUNTA COINCIDE CON UN TEMA 'RESPUESTA ESPECÍFICA', USA EL TEXTO LITERAL. NO CAMBIES NI UNA COMA. NO AGREGUES SALUDOS INNECESARIOS AL FINAL."
                )

            chat_completion = client.chat.completions.create(
                messages=[
                    {
                        "role": "system",
                        "content": system_prompt
                    },
                    {
                        "role": "user",
                        "content": user_message
                    }
                ],
                model="llama-3.1-8b-instant",
                temperature=0.0, # ZERO temperature for maximum determinism
            )

            bot_reply = chat_completion.choices[0].message.content
            return Response({'response': bot_reply})

        except Exception as e:
            print(f"Groq API Error: {e}")
            return Response({'response': 'Lo siento, tuve un problema conectando con mi cerebro digital. ¿Podrías intentar de nuevo?'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

