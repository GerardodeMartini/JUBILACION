#!/bin/bash
echo "Running migrations..."
python backend/manage.py migrate
echo "Creating superuser..."
python backend/manage.py createsu
echo "Starting Gunicorn..."
cd backend
gunicorn jubilacion_backend.wsgi --log-file -
