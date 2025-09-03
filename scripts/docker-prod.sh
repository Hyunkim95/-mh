#!/bin/bash

# Production Docker setup script

echo "🐳 Starting production environment with Docker..."

# Stop any existing containers
echo "Stopping existing containers..."
docker-compose down

# Build and start services
echo "Building and starting services..."
docker-compose up --build -d

# Wait for services to be ready
echo "Waiting for services to start..."
sleep 15

# Check service health
echo "Checking service health..."
docker-compose ps

echo "✅ Production environment is ready!"
echo ""
echo "📱 Web app: http://localhost"
echo "🚀 API: http://localhost:3001"
echo "🐘 PostgreSQL: localhost:5432"
echo ""
echo "To view logs: docker-compose logs -f"
echo "To stop: docker-compose down"
