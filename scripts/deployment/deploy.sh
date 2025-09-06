#!/bin/bash

# LLM-Runner-Router Deployment Script
# Secure production deployment with all safety checks

set -e  # Exit on error

echo "🚀 LLM-Runner-Router Deployment Script"
echo "======================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
   echo -e "${RED}❌ Please don't run this script as root${NC}"
   exit 1
fi

# Function to check command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Step 1: Check Prerequisites
echo -e "\n${YELLOW}📋 Checking prerequisites...${NC}"

if ! command_exists node; then
    echo -e "${RED}❌ Node.js is not installed${NC}"
    echo "Please install Node.js 18+ first"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}❌ Node.js version must be 18 or higher${NC}"
    echo "Current version: $(node -v)"
    exit 1
fi

if ! command_exists npm; then
    echo -e "${RED}❌ npm is not installed${NC}"
    exit 1
fi

if ! command_exists git; then
    echo -e "${RED}❌ git is not installed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ All prerequisites met${NC}"

# Step 2: Create necessary directories
echo -e "\n${YELLOW}📁 Creating directories...${NC}"
mkdir -p logs
mkdir -p models
mkdir -p cache
mkdir -p uploads
echo -e "${GREEN}✅ Directories created${NC}"

# Step 3: Check for environment file
echo -e "\n${YELLOW}🔐 Checking environment configuration...${NC}"

if [ ! -f .env.production ]; then
    echo -e "${YELLOW}⚠️  No .env.production file found${NC}"
    echo "Creating from template..."
    cp .env.example .env.production
    
    # Generate API key
    API_KEY=$(openssl rand -hex 32)
    SESSION_SECRET=$(openssl rand -hex 32)
    
    # Update the file with generated keys
    sed -i "s/dev-key-123456789,test-key-987654321/${API_KEY}/" .env.production
    sed -i "s/your-session-secret-here/${SESSION_SECRET}/" .env.production
    
    echo -e "${GREEN}✅ Created .env.production with generated keys${NC}"
    echo -e "${YELLOW}⚠️  Please edit .env.production to set your domain in ALLOWED_ORIGINS${NC}"
else
    echo -e "${GREEN}✅ Environment file exists${NC}"
fi

# Step 4: Install dependencies
echo -e "\n${YELLOW}📦 Installing dependencies...${NC}"
npm ci --production
echo -e "${GREEN}✅ Dependencies installed${NC}"

# Step 5: Build the project
echo -e "\n${YELLOW}🔨 Building project...${NC}"
npm run build
echo -e "${GREEN}✅ Build complete${NC}"

# Step 6: Check PM2 installation
echo -e "\n${YELLOW}🔧 Checking PM2...${NC}"
if ! command_exists pm2; then
    echo "Installing PM2 globally..."
    npm install -g pm2
fi
echo -e "${GREEN}✅ PM2 is available${NC}"

# Step 7: Security checks
echo -e "\n${YELLOW}🔒 Running security checks...${NC}"

# Check for vulnerabilities
npm audit --audit-level=high || true

# Check file permissions
chmod 600 .env.production
chmod 755 logs
chmod 755 models
echo -e "${GREEN}✅ Security checks complete${NC}"

# Step 8: Deployment options
echo -e "\n${YELLOW}🚀 Deployment Options:${NC}"
echo "1) Start with PM2 (recommended for VPS)"
echo "2) Start with Node.js (for testing)"
echo "3) Build for Netlify deployment"
echo "4) Docker build"
echo "5) Exit"

read -p "Select deployment option (1-5): " option

case $option in
    1)
        echo -e "\n${YELLOW}Starting with PM2...${NC}"
        pm2 delete llm-router 2>/dev/null || true
        pm2 start ecosystem.config.js --env production
        pm2 save
        pm2 startup
        echo -e "${GREEN}✅ Server started with PM2${NC}"
        echo "Run 'pm2 status' to check status"
        echo "Run 'pm2 logs' to view logs"
        ;;
    2)
        echo -e "\n${YELLOW}Starting with Node.js...${NC}"
        NODE_ENV=production node server-secure.js
        ;;
    3)
        echo -e "\n${YELLOW}Preparing for Netlify...${NC}"
        echo "Push to GitHub and Netlify will auto-deploy"
        echo "Remember to set environment variables in Netlify dashboard"
        git status
        ;;
    4)
        echo -e "\n${YELLOW}Building Docker image...${NC}"
        if command_exists docker; then
            docker build -t llm-router:latest .
            echo -e "${GREEN}✅ Docker image built${NC}"
            echo "Run: docker run -p 3006:3006 --env-file .env.production llm-router:latest"
        else
            echo -e "${RED}❌ Docker is not installed${NC}"
        fi
        ;;
    5)
        echo "Exiting..."
        exit 0
        ;;
    *)
        echo -e "${RED}Invalid option${NC}"
        exit 1
        ;;
esac

# Step 9: Post-deployment checks
echo -e "\n${YELLOW}🔍 Running post-deployment checks...${NC}"

# Wait for server to start
sleep 5

# Check health endpoint
BASE_URL="${BASE_URL:-http://localhost:3006}"
if curl -f "$BASE_URL/health" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Server health check passed${NC}"
else
    echo -e "${YELLOW}⚠️  Server may still be starting up${NC}"
fi

# Display important information
echo -e "\n${GREEN}=== Deployment Complete ===${NC}"
echo -e "\n📝 Important Information:"
echo -e "- Health check: $BASE_URL/health"
echo -e "- Chat interface: $BASE_URL/chat"
echo -e "- API endpoint: $BASE_URL/api/inference"
echo -e "- Logs directory: ./logs/"

if [ -f .env.production ]; then
    API_KEY=$(grep "^API_KEYS=" .env.production | cut -d'=' -f2 | cut -d',' -f1)
    echo -e "\n🔑 Your API Key (save this!):"
    echo -e "${GREEN}${API_KEY}${NC}"
fi

echo -e "\n📚 Next Steps:"
echo "1. Configure your domain in .env.production (ALLOWED_ORIGINS)"
echo "2. Set up Nginx reverse proxy with SSL"
echo "3. Configure firewall rules (ufw)"
echo "4. Set up monitoring and alerts"
echo "5. Test the API with your API key"

echo -e "\n${GREEN}✨ Deployment script completed successfully!${NC}"