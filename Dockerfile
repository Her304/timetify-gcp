FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

WORKDIR /app/backend

RUN apt-get update && apt-get install -y \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .
RUN SECRET_KEY=build-time-placeholder-not-used-at-runtime python manage.py collectstatic --noinput

CMD ["sh", "-c", "python manage.py migrate --noinput && exec gunicorn --bind :8080 --workers 2 --threads 2 --timeout 120 --graceful-timeout 30 backend.wsgi:application"]