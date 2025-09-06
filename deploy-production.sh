#!/bin/bash

# 🚀 LLM-Runner-Router Production Deployment Script

echo "🚀 Starting LLM-Runner-Router Production Deployment..."

# Set production environment
export NODE_ENV=production
export LOG_LEVEL=info
export API_PORT=3006
export DEFAULT_STRATEGY=balanced
export MAX_MODELS=10
BASE_URL="${BASE_URL:-http://localhost:3006}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}📋 $1${NC}"
}

# Check prerequisites
print_info "Checking prerequisites..."

# Check Node.js version
NODE_VERSION=$(node --version)
if [[ $? -eq 0 ]]; then
    print_status "Node.js version: $NODE_VERSION"
else
    print_error "Node.js not found"
    exit 1
fi

# Check npm
NPM_VERSION=$(npm --version)
if [[ $? -eq 0 ]]; then
    print_status "npm version: $NPM_VERSION"
else
    print_error "npm not found"
    exit 1
fi

# Install dependencies
print_info "Installing production dependencies..."
npm install --production
if [[ $? -eq 0 ]]; then
    print_status "Dependencies installed"
else
    print_error "Failed to install dependencies"
    exit 1
fi

# Build the project
print_info "Building project for production..."
npm run build
if [[ $? -eq 0 ]]; then
    print_status "Build completed"
else
    print_error "Build failed"
    exit 1
fi

# Create production directories
print_info "Creating production directories..."
mkdir -p logs
mkdir -p models/cache
mkdir -p temp
mkdir -p public
print_status "Directories created"

# Copy production files
print_info "Setting up production configuration..."
cp .env.production .env.prod
cp ecosystem.config.cjs ecosystem.prod.config.cjs

# Set permissions
chmod +x deploy-production.sh
chmod +x setup.sh
print_status "Permissions set"

# Run linting
print_info "Running code quality checks..."
npm run lint > /dev/null 2>&1
if [[ $? -eq 0 ]]; then
    print_status "Code quality checks passed"
else
    print_warning "Code quality checks have warnings (non-blocking)"
fi

# Setup PM2 if available
if command -v pm2 &> /dev/null; then
    print_info "Setting up PM2 process manager..."
    pm2 stop llm-router 2>/dev/null || true
    pm2 delete llm-router 2>/dev/null || true
    pm2 start ecosystem.prod.config.cjs
    print_status "PM2 configured"
else
    print_warning "PM2 not found - manual process management required"
fi

print_status "🎉 Production deployment completed!"
print_info "📊 Server Status:"
echo "  🌐 Environment: production"
echo "  🔧 Engine: WASM"
echo "  📦 Models: Simple fallback available"
echo "  🚀 Ready to start: npm start"
echo ""
print_info "📡 Available Commands:"
echo "  npm start                 - Start production server"
echo "  npm run monitor          - Monitor with PM2"
echo "  npm run logs             - View logs"
echo "  curl $BASE_URL/api/health - Health check"
echo ""
print_status "✅ Deployment ready!"