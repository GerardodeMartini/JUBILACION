"""
URL configuration for jubilacion_backend project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include
from django.views.generic import TemplateView

from django.conf import settings

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('api.urls')),
    path('', TemplateView.as_view(template_name='inicio.html'), name='inicio'),
    path('inicio.html', TemplateView.as_view(template_name='inicio.html'), name='inicio_html'),
    path('login.html', TemplateView.as_view(template_name='login.html'), name='login'),
    path('dashboard.html', TemplateView.as_view(template_name='dashboard.html'), name='dashboard'),
    path('registro.html', TemplateView.as_view(
        template_name='registro.html',
        extra_context={'TURNSTILE_SITE_KEY': getattr(settings, 'TURNSTILE_SITE_KEY', '1x00000000000000000000AA')}
    ), name='registro'),
]
