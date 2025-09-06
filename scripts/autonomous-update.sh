#!/bin/bash

# Autonomous Update Script for LLM-Runner-Router
# Safely updates dependencies and rebuilds the project

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="$PROJECT_DIR/backups/$(date +%Y%m%d_%H%M%S)"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() {
    echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

warning() {
    echo -e "${YELLOW}⚠️ $1${NC}"
}

error() {
    echo -e "${RED}❌ $1${NC}"
}

# Create backup
create_backup() {
    log "Creating backup..."
    mkdir -p "$BACKUP_DIR"
    
    # Backup critical files
    cp "$PROJECT_DIR/package.json" "$BACKUP_DIR/"
    cp "$PROJECT_DIR/package-lock.json" "$BACKUP_DIR/" 2>/dev/null || true
    cp "$PROJECT_DIR/.env" "$BACKUP_DIR/" 2>/dev/null || true
    
    # Backup source if no git
    if [[ ! -d "$PROJECT_DIR/.git" ]]; then
        cp -r "$PROJECT_DIR/src" "$BACKUP_DIR/"
    fi
    
    success "Backup created at $BACKUP_DIR"
}

# Update dependencies safely
update_dependencies() {
    log "Updating dependencies..."
    
    cd "$PROJECT_DIR"
    
    # Check for security vulnerabilities
    if npm audit --audit-level=moderate > /tmp/audit.log 2>&1; then
        success "No security vulnerabilities found"
    else
        warning "Security vulnerabilities detected, attempting fix..."
        npm audit fix --only=prod || warning "Some vulnerabilities could not be auto-fixed"
    fi
    
    # Update dependencies with caution
    log "Updating patch and minor versions..."
    npm update --save-dev=false || warning "Some updates failed"
    
    success "Dependencies updated"
}

# Rebuild project
rebuild_project() {
    log "Rebuilding project..."
    
    cd "$PROJECT_DIR"
    
    # Clean build
    rm -rf dist/
    
    # Install and build
    npm ci --only=production --no-optional 2>/dev/null || npm install --only=production
    
    # Build documentation
    npm run docs || warning "Documentation build had issues"
    
    # Build distribution
    npm run build
    
    success "Project rebuilt"
}

# Run validation tests
validate_update() {
    log "Validating update..."
    
    cd "$PROJECT_DIR"
    
    # Run basic tests
    if npm run test:unit 2>/dev/null; then
        success "Unit tests passed"
    else
        error "Unit tests failed - rolling back"
        return 1
    fi
    
    # Test server startup
    log "Testing server startup..."
    timeout 30s npm start > /tmp/startup.log 2>&1 &
    SERVER_PID=$!
    
    sleep 10
    
    # Health check
    BASE_URL="${BASE_URL:-http://localhost:3006}"
    if curl -f -s "$BASE_URL/api/health" > /dev/null 2>&1; then
        success "Server startup test passed"
        kill $SERVER_PID 2>/dev/null || true
        return 0
    else
        error "Server startup test failed"
        kill $SERVER_PID 2>/dev/null || true
        return 1
    fi
}

# Rollback on failure
rollback() {
    warning "Rolling back changes..."
    
    cd "$PROJECT_DIR"
    
    # Restore package files
    cp "$BACKUP_DIR/package.json" .
    cp "$BACKUP_DIR/package-lock.json" . 2>/dev/null || true
    
    # Reinstall from backup
    npm ci --only=production
    npm run build
    
    success "Rollback completed"
}

# Clean up old backups
cleanup_backups() {
    log "Cleaning up old backups..."
    
    # Keep only last 5 backups
    find "$PROJECT_DIR/backups" -maxdepth 1 -type d -name "20*" | sort -r | tail -n +6 | xargs rm -rf
    
    success "Old backups cleaned up"
}

# Main update process
main() {
    log "🔄 Starting autonomous update process..."
    
    # Pre-flight checks
    if [[ ! -f "$PROJECT_DIR/package.json" ]]; then
        error "Not in a valid Node.js project directory"
        exit 1
    fi
    
    # Check if server is running
    if pgrep -f "node.*server.js" > /dev/null; then
        warning "Server appears to be running. Please stop it first."
        read -p "Continue anyway? [y/N] " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
    
    # Create backup
    create_backup
    
    # Perform update
    if update_dependencies && rebuild_project && validate_update; then
        success "🎉 Update completed successfully!"
        cleanup_backups
        
        log "📋 Update Summary:"
        log "   • Dependencies updated"
        log "   • Project rebuilt"
        log "   • Tests passed"
        log "   • Backup available at: $BACKUP_DIR"
        
    else
        error "Update failed, performing rollback..."
        rollback
        
        error "❌ Update failed and was rolled back"
        log "Check the backup at: $BACKUP_DIR"
        log "Review logs in /tmp/ for more details"
        exit 1
    fi
}

# Handle interruption
trap 'error "Update interrupted"; exit 1' INT TERM

# Run update
main "$@"