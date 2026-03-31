FROM python:3.12-slim

# 1. Environment variables to keep Python happy
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1
# This ensures Python can see the 'backend' package from the root
ENV PYTHONPATH=/app

WORKDIR /app

# 2. Install dependencies
RUN apt-get update && apt-get install -y \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 3. Copy the entire project
# This copies your 'backend' folder into '/app/backend'
COPY . .

# 4. Start Gunicorn
# Note the path: folder_name.file_name:variable_name
CMD ["gunicorn", "--bind", ":8080", "--workers", "1", "--threads", "8", "backend.wsgi:application"]