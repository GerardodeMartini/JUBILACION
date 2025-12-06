#!/bin/bash
echo "Running migrations..."
python backend/manage.py migrate
echo "Starting Gunicorn..."
cd backend
gunicorn jubilacion_backend.wsgi --log-file -
