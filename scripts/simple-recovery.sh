#!/bin/bash

# 🔧 Simple Recovery Script for LLM-Runner-Router
# Works without sudo or additional dependencies

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

PROJECT_DIR="/home/mikecerqua/projects/LLM-Runner-Router"
LOG_DIR="$PROJECT_DIR/logs"
PM2_APP_NAME="llm-router-http"

# Logging functions
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

# Check PM2 status
check_pm2_status() {
    info "Checking PM2 status..."
    
    if ! pm2 list | grep -q "$PM2_APP_NAME"; then
        error "PM2 app '$PM2_APP_NAME' not found"
        return 1
    fi
    
    # Check if app is online
    if pm2 list | grep "$PM2_APP_NAME" | grep -q "online"; then
        log "PM2 app is online"
        return 0
    else
        warning "PM2 app is not online"
        return 1
    fi
}

# Check API health
check_api_health() {
    info "Checking API health..."

    # Check health endpoint
    BASE_URL="${BASE_URL:-http://localhost:3006}"
    if curl -s -f -o /dev/null "$BASE_URL/health"; then
        log "API health check passed"
        return 0
    else
        error "API health check failed"
        return 1
    fi
}

# Check system resources
check_system_resources() {
    info "Checking system resources..."
    
    # Check memory
    MEMORY_USAGE=$(free | grep Mem | awk '{printf "%.0f", $3/$2 * 100}')
    if [ "$MEMORY_USAGE" -gt 85 ]; then
        warning "High memory usage: ${MEMORY_USAGE}%"
        return 1
    fi
    
    # Check disk space
    DISK_USAGE=$(df -h / | tail -1 | awk '{gsub("%","",$5); print $5}')
    if [ "$DISK_USAGE" -gt 90 ]; then
        error "Critical disk usage: ${DISK_USAGE}%"
        return 1
    fi
    
    log "System resources OK (Memory: ${MEMORY_USAGE}%, Disk: ${DISK_USAGE}%)"
    return 0
}

# Restart service
restart_service() {
    info "Restarting service..."
    
    # Try graceful reload first
    if pm2 reload "$PM2_APP_NAME"; then
        log "Service reloaded successfully"
        sleep 3
        if check_api_health; then
            log "Service is healthy after reload"
            return 0
        fi
    fi
    
    # If reload failed, try restart
    warning "Reload failed, trying restart..."
    if pm2 restart "$PM2_APP_NAME"; then
        log "Service restarted"
        sleep 5
        if check_api_health; then
            log "Service is healthy after restart"
            return 0
        fi
    fi
    
    # If restart failed, delete and start again
    error "Restart failed, trying full restart..."
    pm2 delete "$PM2_APP_NAME" 2>/dev/null || true
    pm2 start "$PROJECT_DIR/server-http.js" --name "$PM2_APP_NAME"
    sleep 5
    
    if check_api_health; then
        log "Service recovered after full restart"
        return 0
    else
        error "Failed to recover service"
        return 1
    fi
}

# Clear cache and logs
clear_cache() {
    info "Clearing cache and old logs..."
    
    # Clear old logs (older than 7 days)
    find "$LOG_DIR" -name "*.log" -mtime +7 -delete 2>/dev/null || true
    
    # Clear PM2 logs if too large (>100MB)
    for logfile in "$HOME/.pm2/logs/"*.log; do
        if [ -f "$logfile" ]; then
            SIZE=$(du -m "$logfile" | cut -f1)
            if [ "$SIZE" -gt 100 ]; then
                warning "Large log file: $logfile (${SIZE}MB)"
                echo "" > "$logfile"
                log "Cleared large log file"
            fi
        fi
    done
    
    log "Cache and logs cleaned"
}

# Monitor continuously
monitor_mode() {
    info "Starting monitor mode (Ctrl+C to stop)..."
    
    while true; do
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        
        # Run all checks
        ISSUES=0
        
        if ! check_system_resources; then
            ((ISSUES++))
        fi
        
        if ! check_pm2_status; then
            ((ISSUES++))
        fi
        
        if ! check_api_health; then
            ((ISSUES++))
        fi
        
        # If issues found, attempt recovery
        if [ "$ISSUES" -gt 0 ]; then
            warning "Found $ISSUES issue(s), attempting recovery..."
            
            # Try to fix based on issue type
            if ! check_pm2_status || ! check_api_health; then
                restart_service
            fi
            
            if ! check_system_resources; then
                clear_cache
            fi
        else
            log "✅ All systems healthy"
        fi
        
        # Wait before next check
        sleep 30
    done
}

# Full recovery
full_recovery() {
    info "Starting full recovery..."
    
    # Step 1: Clear cache if resources are constrained
    if ! check_system_resources; then
        clear_cache
    fi
    
    # Step 2: Check and fix PM2
    if ! check_pm2_status; then
        restart_service
    fi
    
    # Step 3: Verify API health
    if ! check_api_health; then
        restart_service
    fi
    
    # Final verification
    if check_pm2_status && check_api_health && check_system_resources; then
        log "✅ Recovery complete - System healthy"
        return 0
    else
        error "❌ Recovery incomplete - Manual intervention may be required"
        return 1
    fi
}

# Show status
show_status() {
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}🏥 LLM-Router-Router Health Status${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    # System resources
    echo ""
    check_system_resources
    
    # PM2 status
    echo ""
    check_pm2_status
    
    # API health
    echo ""
    check_api_health
    
    # Show PM2 details
    echo ""
    echo -e "${BLUE}PM2 Process Details:${NC}"
    pm2 list | grep -E "(─|$PM2_APP_NAME|id.*name)"
    
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# Main script
case "${1:-status}" in
    status)
        show_status
        ;;
    
    check)
        info "Running health check..."
        check_system_resources
        check_pm2_status
        check_api_health
        ;;
    
    recover)
        full_recovery
        ;;
    
    restart)
        restart_service
        ;;
    
    clean)
        clear_cache
        ;;
    
    monitor)
        monitor_mode
        ;;
    
    *)
        echo "Usage: $0 {status|check|recover|restart|clean|monitor}"
        echo ""
        echo "Commands:"
        echo "  status   - Show detailed system status (default)"
        echo "  check    - Run health checks"
        echo "  recover  - Run full recovery process"
        echo "  restart  - Restart the service"
        echo "  clean    - Clear cache and old logs"
        echo "  monitor  - Continuous monitoring mode"
        exit 1
        ;;
esac

exit $?