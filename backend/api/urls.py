from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    AgentViewSet, CustomTokenObtainPairView, RegisterView, ActivateAccountView
)

router = DefaultRouter()
router.register(r'agents', AgentViewSet, basename='agent')

urlpatterns = [
    path('auth/login', CustomTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('auth/register', RegisterView.as_view(), name='auth_register'),
    path('auth/activate/<str:uidb64>/<str:token>/', ActivateAccountView.as_view(), name='auth_activate'),
    # Token refresh if needed later: path('auth/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('', include(router.urls)),
]
