#!/bin/bash
echo "Resetting database..."
rm -f backend/db.sqlite3
echo "Running migrations..."
python backend/manage.py migrate
echo "Starting Gunicorn..."
cd backend
gunicorn jubilacion_backend.wsgi --log-file -
