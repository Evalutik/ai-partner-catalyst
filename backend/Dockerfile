FROM python:3.10-slim

WORKDIR /app

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Cloud Run uses the PORT environment variable
ENV PORT=8080
EXPOSE 8080

# Run the application
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT}
