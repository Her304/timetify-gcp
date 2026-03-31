# 1. Use the slim python image
FROM python:3.12-slim

# 2. Set the working directory to /app
WORKDIR /app

# 3. Install system dependencies for PostgreSQL
RUN apt-get update && apt-get install -y \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# 4. Copy and install requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 5. COPY EVERYTHING from your root into /app
# This ensures the 'backend' folder is copied into /app/backend
COPY . .

# 6. Start Gunicorn
# We use 'backend.wsgi' because wsgi.py is inside the backend folder
CMD ["gunicorn", "--bind", ":8080", "--workers", "1", "--threads", "8", "backend.wsgi:application"]