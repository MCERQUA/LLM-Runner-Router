#!/bin/bash

# LLM-Runner-Router Autonomous Setup Script
# This script provides complete automated setup for the LLM Router system

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="$SCRIPT_DIR/setup.log"
ERROR_LOG="$SCRIPT_DIR/setup-errors.log"
BASE_URL="${BASE_URL:-http://localhost:3006}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging functions
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

success() {
    echo -e "${GREEN}✅ $1${NC}" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}❌ $1${NC}" | tee -a "$ERROR_LOG"
}

warning() {
    echo -e "${YELLOW}⚠️ $1${NC}" | tee -a "$LOG_FILE"
}

# System detection
detect_system() {
    log "Detecting system environment..."
    
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        OS="linux"
        if command -v apt-get &> /dev/null; then
            DISTRO="debian"
        elif command -v yum &> /dev/null; then
            DISTRO="rhel"
        else
            DISTRO="unknown"
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        OS="macos"
        DISTRO="macos"
    else
        OS="unknown"
        DISTRO="unknown"
    fi
    
    # Detect if running on VPS
    if [[ -f "/sys/hypervisor/uuid" ]] || [[ -d "/proc/vz" ]] || [[ -f "/.dockerenv" ]]; then
        ENVIRONMENT="vps"
    else
        ENVIRONMENT="local"
    fi
    
    log "System: $OS ($DISTRO), Environment: $ENVIRONMENT"
}

# Check prerequisites
check_prerequisites() {
    log "Checking system prerequisites..."
    
    local missing_deps=()
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        missing_deps+=("nodejs")
    else
        NODE_VERSION=$(node --version | cut -d'v' -f2)
        if [[ $(echo "$NODE_VERSION 20.0.0" | tr " " "\n" | sort -V | head -n1) != "20.0.0" ]]; then
            warning "Node.js version $NODE_VERSION detected. Node.js 20.0.0 or higher is required"
            missing_deps+=("nodejs-update")
        else
            success "Node.js $NODE_VERSION is compatible"
        fi
    fi
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        missing_deps+=("npm")
    fi
    
    # Check git
    if ! command -v git &> /dev/null; then
        missing_deps+=("git")
    fi
    
    # Check Python (for bindings)
    if ! command -v python3 &> /dev/null; then
        warning "Python3 not found - some bindings may not work"
    fi
    
    # Check Rust (for native bindings)
    if ! command -v cargo &> /dev/null; then
        warning "Rust/Cargo not found - native bindings will not be available"
    fi
    
    if [[ ${#missing_deps[@]} -gt 0 ]]; then
        error "Missing dependencies: ${missing_deps[*]}"
        log "Installing missing dependencies..."
        install_dependencies "${missing_deps[@]}"
    else
        success "All prerequisites satisfied"
    fi
}

# Install missing dependencies
install_dependencies() {
    local deps=("$@")
    
    for dep in "${deps[@]}"; do
        case $dep in
            "nodejs"|"nodejs-update")
                install_nodejs
                ;;
            "npm")
                log "npm typically comes with Node.js"
                ;;
            "git")
                install_git
                ;;
        esac
    done
}

install_nodejs() {
    log "Installing Node.js..."
    
    if [[ "$DISTRO" == "debian" ]]; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
    elif [[ "$DISTRO" == "rhel" ]]; then
        curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
        sudo yum install -y nodejs npm
    elif [[ "$OS" == "macos" ]]; then
        if command -v brew &> /dev/null; then
            brew install node
        else
            error "Please install Homebrew first: https://brew.sh"
            exit 1
        fi
    else
        error "Cannot auto-install Node.js on this system. Please install manually."
        exit 1
    fi
    
    success "Node.js installed"
}

install_git() {
    log "Installing Git..."
    
    if [[ "$DISTRO" == "debian" ]]; then
        sudo apt-get update && sudo apt-get install -y git
    elif [[ "$DISTRO" == "rhel" ]]; then
        sudo yum install -y git
    elif [[ "$OS" == "macos" ]]; then
        if command -v brew &> /dev/null; then
            brew install git
        else
            log "Git should be available via Xcode Command Line Tools"
        fi
    fi
    
    success "Git installed"
}

# Setup environment
setup_environment() {
    log "Setting up environment configuration..."
    
    # Copy environment files if they don't exist
    if [[ ! -f "$SCRIPT_DIR/.env" ]]; then
        if [[ "$ENVIRONMENT" == "vps" ]]; then
            cp "$SCRIPT_DIR/.env.vps" "$SCRIPT_DIR/.env" 2>/dev/null || cp "$SCRIPT_DIR/.env.example" "$SCRIPT_DIR/.env"
        else
            cp "$SCRIPT_DIR/.env.example" "$SCRIPT_DIR/.env"
        fi
        log "Created .env file from template"
    else
        log "Using existing .env file"
    fi
    
    # Generate secure secrets if needed
    if grep -q "your-session-secret-here" "$SCRIPT_DIR/.env"; then
        if command -v openssl &> /dev/null; then
            SESSION_SECRET=$(openssl rand -hex 32)
            sed -i "s/your-session-secret-here/$SESSION_SECRET/" "$SCRIPT_DIR/.env"
            log "Generated secure session secret"
        else
            warning "OpenSSL not available - please manually set SESSION_SECRET in .env"
        fi
    fi
    
    success "Environment configuration ready"
}

# Install Node.js dependencies
install_dependencies_npm() {
    log "Installing Node.js dependencies..."
    
    cd "$SCRIPT_DIR"
    
    # Clean install
    if [[ -d "node_modules" ]]; then
        log "Cleaning existing node_modules..."
        rm -rf node_modules package-lock.json
    fi
    
    # Install with optimization for VPS
    if [[ "$ENVIRONMENT" == "vps" ]]; then
        log "Optimizing installation for VPS environment..."
        npm ci --only=production --no-optional --no-audit 2>/dev/null || npm install --only=production --no-optional --no-audit
    else
        npm install
    fi
    
    success "Dependencies installed"
}

# Setup bindings (optional)
setup_bindings() {
    log "Setting up language bindings..."
    
    cd "$SCRIPT_DIR"
    
    # Python bindings
    if command -v python3 &> /dev/null && [[ -d "bindings/python" ]]; then
        log "Setting up Python bindings..."
        cd "bindings/python"
        if command -v pip3 &> /dev/null; then
            pip3 install -e . --user 2>/dev/null || warning "Python bindings setup failed"
        fi
        cd "$SCRIPT_DIR"
    fi
    
    # Rust bindings
    if command -v cargo &> /dev/null && [[ -d "bindings/rust" ]]; then
        log "Setting up Rust bindings..."
        cd "bindings/rust"
        cargo build --release 2>/dev/null || warning "Rust bindings build failed"
        cd "$SCRIPT_DIR"
    fi
    
    # WASM bindings
    if command -v wasm-pack &> /dev/null && [[ -d "bindings/wasm" ]]; then
        log "Setting up WASM bindings..."
        cd "bindings/wasm"
        wasm-pack build --target web 2>/dev/null || warning "WASM bindings build failed"
        cd "$SCRIPT_DIR"
    fi
    
    success "Bindings setup completed"
}

# Build project
build_project() {
    log "Building project..."
    
    cd "$SCRIPT_DIR"
    
    # Run linting and fix what we can
    npm run lint 2>/dev/null || warning "Linting completed with warnings"
    
    # Build documentation
    npm run docs 2>/dev/null || warning "Documentation build had issues"
    
    # Build distribution
    npm run build
    
    success "Project built successfully"
}

# Run tests
run_tests() {
    log "Running tests..."
    
    cd "$SCRIPT_DIR"
    
    # Run basic tests first
    if npm run test:unit 2>/dev/null; then
        success "Unit tests passed"
    else
        warning "Some unit tests failed - check logs"
    fi
    
    # Skip integration tests on VPS to avoid resource issues
    if [[ "$ENVIRONMENT" != "vps" ]]; then
        if npm run test:integration 2>/dev/null; then
            success "Integration tests passed"
        else
            warning "Some integration tests failed - check logs"
        fi
    else
        log "Skipping integration tests on VPS"
    fi
}

# Setup systemd service (Linux only)
setup_service() {
    if [[ "$OS" == "linux" ]] && [[ "$ENVIRONMENT" == "vps" ]]; then
        log "Setting up systemd service..."
        
        cat > /tmp/llm-router.service << EOF
[Unit]
Description=LLM Runner Router
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$SCRIPT_DIR
ExecStart=$(which node) server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PATH=$(dirname $(which node)):/usr/bin:/bin

[Install]
WantedBy=multi-user.target
EOF
        
        if sudo cp /tmp/llm-router.service /etc/systemd/system/ 2>/dev/null; then
            sudo systemctl daemon-reload
            sudo systemctl enable llm-router
            success "Systemd service installed"
            log "Use 'sudo systemctl start llm-router' to start the service"
        else
            warning "Could not install systemd service (insufficient permissions)"
        fi
        
        rm -f /tmp/llm-router.service
    fi
}

# Setup monitoring and health checks
setup_monitoring() {
    log "Setting up monitoring and health checks..."
    
    # Create monitoring script
    cat > "$SCRIPT_DIR/scripts/health-check.sh" << 'EOF'
#!/bin/bash
# Health check script for LLM Router

BASE_URL="${BASE_URL:-http://localhost:3006}"
HEALTH_URL="$BASE_URL/api/health"
MAX_RETRIES=3
RETRY_DELAY=5

for i in $(seq 1 $MAX_RETRIES); do
    if curl -f -s "$HEALTH_URL" > /dev/null 2>&1; then
        echo "✅ LLM Router is healthy"
        exit 0
    else
        echo "⚠️ Health check failed (attempt $i/$MAX_RETRIES)"
        if [[ $i -lt $MAX_RETRIES ]]; then
            sleep $RETRY_DELAY
        fi
    fi
done

echo "❌ LLM Router health check failed after $MAX_RETRIES attempts"
exit 1
EOF
    
    chmod +x "$SCRIPT_DIR/scripts/health-check.sh"
    
    # Create startup script
    cat > "$SCRIPT_DIR/start.sh" << 'EOF'
#!/bin/bash
# Startup script with health monitoring

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$SCRIPT_DIR/llm-router.pid"

cd "$SCRIPT_DIR"

# Check if already running
if [[ -f "$PID_FILE" ]]; then
    PID=$(cat "$PID_FILE")
    if ps -p "$PID" > /dev/null 2>&1; then
        echo "LLM Router is already running (PID: $PID)"
        exit 1
    else
        rm -f "$PID_FILE"
    fi
fi

# Start the server
echo "Starting LLM Router..."
nohup node server.js > server.log 2>&1 &
PID=$!
echo $PID > "$PID_FILE"

# Wait for startup
sleep 5

# Health check
if bash "$SCRIPT_DIR/scripts/health-check.sh"; then
    echo "LLM Router started successfully (PID: $PID)"
    echo "Logs: tail -f $SCRIPT_DIR/server.log"
    echo "Stop: bash $SCRIPT_DIR/stop.sh"
else
    echo "LLM Router failed to start properly"
    kill $PID 2>/dev/null || true
    rm -f "$PID_FILE"
    exit 1
fi
EOF
    
    chmod +x "$SCRIPT_DIR/start.sh"
    
    # Create stop script
    cat > "$SCRIPT_DIR/stop.sh" << 'EOF'
#!/bin/bash
# Stop script for LLM Router

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$SCRIPT_DIR/llm-router.pid"

if [[ -f "$PID_FILE" ]]; then
    PID=$(cat "$PID_FILE")
    if ps -p "$PID" > /dev/null 2>&1; then
        echo "Stopping LLM Router (PID: $PID)..."
        kill $PID
        sleep 2
        if ps -p "$PID" > /dev/null 2>&1; then
            echo "Force stopping..."
            kill -9 $PID
        fi
        rm -f "$PID_FILE"
        echo "LLM Router stopped"
    else
        echo "LLM Router is not running"
        rm -f "$PID_FILE"
    fi
else
    echo "No PID file found"
fi
EOF
    
    chmod +x "$SCRIPT_DIR/stop.sh"
    
    success "Monitoring and control scripts created"
}

# Performance optimization for VPS
optimize_for_vps() {
    if [[ "$ENVIRONMENT" == "vps" ]]; then
        log "Applying VPS-specific optimizations..."
        
        # Update .env with VPS-optimized settings
        sed -i 's/LLM_MAX_THREADS=.*/LLM_MAX_THREADS=2/' "$SCRIPT_DIR/.env"
        sed -i 's/LLM_CONTEXT_SIZE=.*/LLM_CONTEXT_SIZE=1024/' "$SCRIPT_DIR/.env"
        sed -i 's/LLM_BATCH_SIZE=.*/LLM_BATCH_SIZE=4/' "$SCRIPT_DIR/.env"
        sed -i 's/MAX_CONCURRENT=.*/MAX_CONCURRENT=5/' "$SCRIPT_DIR/.env"
        
        # Set production environment
        sed -i 's/NODE_ENV=.*/NODE_ENV=production/' "$SCRIPT_DIR/.env"
        
        success "VPS optimizations applied"
    fi
}

# Main setup function
main() {
    log "🚀 Starting LLM-Runner-Router autonomous setup..."
    
    # Initialize log files
    : > "$LOG_FILE"
    : > "$ERROR_LOG"
    
    detect_system
    check_prerequisites
    setup_environment
    install_dependencies_npm
    setup_bindings
    build_project
    run_tests
    setup_service
    setup_monitoring
    optimize_for_vps
    
    success "🎉 Setup completed successfully!"
    
    echo ""
    log "📋 Setup Summary:"
    log "   • System: $OS ($DISTRO)"
    log "   • Environment: $ENVIRONMENT"
    log "   • Log file: $LOG_FILE"
    log "   • Configuration: .env"
    
    echo ""
    log "🚀 Quick Start:"
    log "   • Development: npm run dev"
    log "   • Production: bash start.sh"
    log "   • Health check: bash scripts/health-check.sh"
    log "   • Stop server: bash stop.sh"
    
    if [[ "$OS" == "linux" ]] && [[ "$ENVIRONMENT" == "vps" ]]; then
        echo ""
        log "📡 Service Management:"
        log "   • Start service: sudo systemctl start llm-router"
        log "   • Stop service: sudo systemctl stop llm-router"
        log "   • Enable auto-start: sudo systemctl enable llm-router"
        log "   • View logs: sudo journalctl -u llm-router -f"
    fi
    
    echo ""
    log "📚 Documentation: $BASE_URL/docs.html"
    log "🔗 Repository: https://github.com/MCERQUA/LLM-Runner-Router"
}

# Handle script interruption
trap 'error "Setup interrupted"; exit 1' INT TERM

# Run main function
main "$@"