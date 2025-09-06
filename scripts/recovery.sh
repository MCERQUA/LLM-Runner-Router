#!/bin/bash

# 🔧 Recovery Script for LLM-Runner-Router
# Automated recovery from common failure scenarios

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_DIR="/home/mikecerqua/projects/LLM-Runner-Router"
LOG_DIR="$PROJECT_DIR/logs"
PM2_APP_NAME="llm-router-http"
MAX_MEMORY_PERCENT=85
MAX_CPU_PERCENT=90

# Logging
log() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1"
}

warning() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

info() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')] INFO:${NC} $1"
}

# Create log directory if it doesn't exist
mkdir -p "$LOG_DIR"

# Function to check system resources
check_system_resources() {
    info "Checking system resources..."
    
    # Check memory usage
    MEMORY_USAGE=$(free | grep Mem | awk '{print int($3/$2 * 100)}')
    if [ "$MEMORY_USAGE" -gt "$MAX_MEMORY_PERCENT" ]; then
        warning "High memory usage: ${MEMORY_USAGE}%"
        return 1
    fi
    
    # Check CPU usage
    CPU_USAGE=$(top -bn1 | grep "Cpu(s)" | sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | awk '{print int(100 - $1)}')
    if [ "$CPU_USAGE" -gt "$MAX_CPU_PERCENT" ]; then
        warning "High CPU usage: ${CPU_USAGE}%"
        return 1
    fi
    
    # Check disk space
    DISK_USAGE=$(df -h / | tail -1 | awk '{print int($5)}')
    if [ "$DISK_USAGE" -gt 90 ]; then
        error "Critical disk usage: ${DISK_USAGE}%"
        return 1
    fi
    
    log "System resources OK (Memory: ${MEMORY_USAGE}%, CPU: ${CPU_USAGE}%, Disk: ${DISK_USAGE}%)"
    return 0
}

# Function to check PM2 processes
check_pm2_status() {
    info "Checking PM2 status..."
    
    if ! pm2 list | grep -q "$PM2_APP_NAME"; then
        error "PM2 app '$PM2_APP_NAME' not found"
        return 1
    fi
    
    # Check if app is online
    STATUS=$(pm2 jlist | jq -r ".[] | select(.name==\"$PM2_APP_NAME\") | .pm2_env.status")
    if [ "$STATUS" != "online" ]; then
        warning "PM2 app status: $STATUS"
        return 1
    fi
    
    # Check restart count
    RESTART_COUNT=$(pm2 jlist | jq -r ".[] | select(.name==\"$PM2_APP_NAME\") | .pm2_env.restart_time")
    if [ "$RESTART_COUNT" -gt 5 ]; then
        warning "High restart count: $RESTART_COUNT"
    fi
    
    log "PM2 status OK"
    return 0
}

# Function to check API health
check_api_health() {
    info "Checking API health..."

    # Check health endpoint
    BASE_URL="${BASE_URL:-http://localhost:3006}"
    HEALTH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health")
    if [ "$HEALTH_RESPONSE" != "200" ]; then
        error "Health check failed (HTTP $HEALTH_RESPONSE)"
        return 1
    fi
    
    # Check response time
    RESPONSE_TIME=$(curl -s -o /dev/null -w "%{time_total}" "$BASE_URL/health")
    if (( $(echo "$RESPONSE_TIME > 5" | bc -l) )); then
        warning "Slow API response: ${RESPONSE_TIME}s"
    fi
    
    log "API health OK"
    return 0
}

# Function to clear cache and temp files
clear_cache() {
    info "Clearing cache and temporary files..."
    
    # Clear node_modules cache
    cd "$PROJECT_DIR"
    rm -rf node_modules/.cache 2>/dev/null || true
    
    # Clear PM2 logs if they're too large
    if [ -f "$LOG_DIR/pm2-out.log" ]; then
        LOG_SIZE=$(du -m "$LOG_DIR/pm2-out.log" | cut -f1)
        if [ "$LOG_SIZE" -gt 100 ]; then
            warning "Large log file (${LOG_SIZE}MB), rotating..."
            pm2 flush "$PM2_APP_NAME"
        fi
    fi
    
    # Clear old error logs
    find "$LOG_DIR" -name "*.log" -mtime +7 -delete 2>/dev/null || true
    
    log "Cache cleared"
}

# Function to restart with recovery
restart_with_recovery() {
    info "Initiating restart with recovery..."
    
    # Save current state
    pm2 save
    
    # Graceful restart
    pm2 reload "$PM2_APP_NAME"
    
    # Wait for app to be ready
    sleep 5
    
    # Verify restart successful
    if check_api_health; then
        log "Restart successful"
        return 0
    else
        error "Restart failed, attempting hard restart..."
        pm2 delete "$PM2_APP_NAME"
        pm2 start "$PROJECT_DIR/ecosystem.resilient.config.js"
        sleep 10
        
        if check_api_health; then
            log "Hard restart successful"
            return 0
        else
            error "Recovery failed"
            return 1
        fi
    fi
}

# Function to reinstall dependencies
reinstall_dependencies() {
    info "Reinstalling dependencies..."
    
    cd "$PROJECT_DIR"
    
    # Backup package-lock.json
    cp package-lock.json package-lock.json.backup 2>/dev/null || true
    
    # Clean install
    rm -rf node_modules
    npm cache clean --force
    npm install
    
    if [ $? -eq 0 ]; then
        log "Dependencies reinstalled successfully"
        return 0
    else
        error "Failed to reinstall dependencies"
        # Restore backup
        cp package-lock.json.backup package-lock.json 2>/dev/null || true
        return 1
    fi
}

# Function to perform full recovery
full_recovery() {
    info "Starting full recovery process..."
    
    # Step 1: Check system resources
    if ! check_system_resources; then
        warning "System resource issues detected"
        clear_cache
    fi
    
    # Step 2: Check PM2 status
    if ! check_pm2_status; then
        warning "PM2 issues detected"
        restart_with_recovery
    fi
    
    # Step 3: Check API health
    if ! check_api_health; then
        warning "API health issues detected"
        
        # Try soft recovery first
        pm2 reload "$PM2_APP_NAME"
        sleep 5
        
        if ! check_api_health; then
            # Try hard recovery
            restart_with_recovery
            
            if ! check_api_health; then
                # Last resort: reinstall and restart
                reinstall_dependencies
                restart_with_recovery
            fi
        fi
    fi
    
    # Final check
    if check_system_resources && check_pm2_status && check_api_health; then
        log "✅ Recovery complete - System healthy"
        return 0
    else
        error "❌ Recovery incomplete - Manual intervention may be required"
        return 1
    fi
}

# Function to monitor continuously
monitor_mode() {
    info "Starting monitoring mode (Ctrl+C to stop)..."
    
    while true; do
        echo "-----------------------------------"
        check_system_resources
        check_pm2_status
        check_api_health
        
        # If any check fails, trigger recovery
        if [ $? -ne 0 ]; then
            warning "Issues detected, triggering recovery..."
            full_recovery
        fi
        
        # Wait before next check
        sleep 30
    done
}

# Main script logic
case "${1:-check}" in
    check)
        info "Running system check..."
        check_system_resources
        check_pm2_status
        check_api_health
        ;;
    
    recover)
        info "Running recovery..."
        full_recovery
        ;;
    
    restart)
        info "Restarting service..."
        restart_with_recovery
        ;;
    
    clean)
        info "Cleaning cache..."
        clear_cache
        ;;
    
    reinstall)
        info "Reinstalling dependencies..."
        reinstall_dependencies
        ;;
    
    monitor)
        monitor_mode
        ;;
    
    *)
        echo "Usage: $0 {check|recover|restart|clean|reinstall|monitor}"
        echo ""
        echo "Commands:"
        echo "  check      - Check system health"
        echo "  recover    - Run full recovery process"
        echo "  restart    - Restart service with recovery"
        echo "  clean      - Clear cache and temp files"
        echo "  reinstall  - Reinstall dependencies"
        echo "  monitor    - Continuous monitoring mode"
        exit 1
        ;;
esac

exit $?