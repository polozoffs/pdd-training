#!/bin/bash
# PDD Application - Quick Deployment Script
# This script helps you deploy the application quickly

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  PDD Application Deployment Script    ║${NC}"
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed!${NC}"
    echo "Please install Docker first: https://docs.docker.com/engine/install/"
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker compose &> /dev/null; then
    echo -e "${RED}❌ Docker Compose is not installed!${NC}"
    echo "Please install Docker Compose: https://docs.docker.com/compose/install/"
    exit 1
fi

echo -e "${GREEN}✅ Docker and Docker Compose are installed${NC}"
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠️  No .env file found. Creating from .env.example...${NC}"
    cp .env.example .env
    echo -e "${GREEN}✅ Created .env file${NC}"
    echo -e "${YELLOW}💡 You can edit .env to change the port (default: 8002)${NC}"
    echo ""
fi

# Check if data directory exists
if [ ! -d "data" ] || [ ! -f "data/questions.json" ]; then
    echo -e "${RED}❌ Data directory or questions.json not found!${NC}"
    echo "Please ensure the data directory with questions.json exists."
    exit 1
fi

# Count questions
QUESTION_COUNT=$(jq length data/questions.json 2>/dev/null || echo "0")
echo -e "${GREEN}📊 Found ${QUESTION_COUNT} questions in database${NC}"
echo ""

# Ask for deployment type
echo -e "${YELLOW}Choose deployment action:${NC}"
echo "1) Fresh deployment (build and start)"
echo "2) Restart existing containers"
echo "3) Stop application"
echo "4) View logs"
echo "5) Check status"
echo ""
read -p "Enter choice [1-5]: " choice

case $choice in
    1)
        echo ""
        echo -e "${GREEN}🏗️  Building Docker image...${NC}"
        docker compose build --no-cache
        
        echo ""
        echo -e "${GREEN}🚀 Starting application...${NC}"
        docker compose up -d
        
        echo ""
        echo -e "${GREEN}⏳ Waiting for application to be healthy...${NC}"
        sleep 10
        
        # Get the port from .env or use default
        PORT=$(grep PORT .env 2>/dev/null | cut -d '=' -f2 | tr -d ' ' || echo "8002")
        
        # Check health
        if curl -sf http://localhost:${PORT}/api/stats > /dev/null 2>&1; then
            echo -e "${GREEN}✅ Application is healthy!${NC}"
            echo ""
            echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
            echo -e "${GREEN}🎉 Deployment successful!${NC}"
            echo ""
            echo -e "📱 Access the application at:"
            echo -e "   ${YELLOW}http://localhost:${PORT}${NC}"
            echo -e "   ${YELLOW}http://YOUR_SERVER_IP:${PORT}${NC}"
            echo ""
            echo -e "📊 API Stats:"
            echo -e "   ${YELLOW}http://localhost:${PORT}/api/stats${NC}"
            echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        else
            echo -e "${RED}❌ Application health check failed${NC}"
            echo "Run 'docker compose logs' to see what went wrong"
        fi
        ;;
    
    2)
        echo ""
        echo -e "${GREEN}🔄 Restarting application...${NC}"
        docker compose restart
        echo -e "${GREEN}✅ Application restarted${NC}"
        ;;
    
    3)
        echo ""
        echo -e "${YELLOW}🛑 Stopping application...${NC}"
        docker compose down
        echo -e "${GREEN}✅ Application stopped${NC}"
        ;;
    
    4)
        echo ""
        echo -e "${GREEN}📋 Showing logs (Ctrl+C to exit)...${NC}"
        docker compose logs -f --tail=100
        ;;
    
    5)
        echo ""
        echo -e "${GREEN}📊 Application Status:${NC}"
        echo ""
        docker compose ps
        echo ""
        
        if docker ps | grep -q pdd-app; then
            PORT=$(grep PORT .env 2>/dev/null | cut -d '=' -f2 | tr -d ' ' || echo "8002")
            echo -e "${GREEN}🟢 Application is running${NC}"
            echo ""
            if curl -sf http://localhost:${PORT}/api/stats > /dev/null 2>&1; then
                STATS=$(curl -s http://localhost:${PORT}/api/stats)
                echo -e "${GREEN}✅ Health check: PASSED${NC}"
                echo -e "   Stats: ${STATS}"
            else
                echo -e "${RED}❌ Health check: FAILED${NC}"
            fi
            echo ""
            echo -e "Access at: ${YELLOW}http://localhost:${PORT}${NC}"
        else
            echo -e "${RED}🔴 Application is not running${NC}"
        fi
        ;;
    
    *)
        echo -e "${RED}Invalid choice${NC}"
        exit 1
        ;;
esac

echo ""
