#!/bin/bash

echo "======================================"
echo "PDD Application - Build & Deploy"
echo "======================================"
echo ""

# Navigate to script directory
cd "$(dirname "$0")"

# Build Docker image
echo "Building Docker image..."
docker build -t pdd-app:latest .

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Build successful!"
    echo ""
    echo "======================================"
    echo "Deployment Options:"
    echo "======================================"
    echo ""
    echo "1. Run with Docker:"
    echo "   docker run -d -p 8000:8000 -v \$(pwd)/data:/app/data --name pdd-app pdd-app:latest"
    echo ""
    echo "2. Run with Docker Compose:"
    echo "   docker-compose up -d"
    echo ""
    echo "3. Access the application:"
    echo "   http://localhost:8000"
    echo ""
    echo "======================================"
else
    echo ""
    echo "❌ Build failed!"
    exit 1
fi
