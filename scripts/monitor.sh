#!/bin/bash

# Comprehensive Monitoring Script for LLM-Runner-Router
# Monitors system health, performance, and auto-recovery

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PID_FILE="$PROJECT_DIR/llm-router.pid"
LOG_FILE="$PROJECT_DIR/monitoring.log"
ALERT_LOG="$PROJECT_DIR/alerts.log"

# Configuration
BASE_URL="${BASE_URL:-http://localhost:3006}"
HEALTH_URL="$BASE_URL/api/health"
CHECK_INTERVAL=30
MAX_MEMORY_MB=1536  # 1.5GB
MAX_CPU_PERCENT=80
MAX_FAILURES=3
RESTART_COOLDOWN=300  # 5 minutes

# Counters
FAILURE_COUNT=0
LAST_RESTART=0

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

success() {
    echo -e "${GREEN}✅ $1${NC}" | tee -a "$LOG_FILE"
}

warning() {
    echo -e "${YELLOW}⚠️ $1${NC}" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}❌ $1${NC}" | tee -a "$LOG_FILE" "$ALERT_LOG"
}

alert() {
    echo -e "${RED}🚨 ALERT: $1${NC}" | tee -a "$ALERT_LOG"
    # Send notification if webhook is configured
    send_notification "ALERT" "$1"
}

# Send notification via webhook if configured
send_notification() {
    local level="$1"
    local message="$2"
    
    if [[ -n "${WEBHOOK_URL:-}" ]]; then
        curl -s -X POST "$WEBHOOK_URL" \
            -H "Content-Type: application/json" \
            -d "{\"level\":\"$level\",\"service\":\"llm-router\",\"message\":\"$message\",\"timestamp\":\"$(date -Iseconds)\"}" \
            2>/dev/null || true
    fi
}

# Get process ID
get_pid() {
    if [[ -f "$PID_FILE" ]]; then
        cat "$PID_FILE"
    else
        pgrep -f "node.*server.js" | head -1 || echo ""
    fi
}

# Check if service is running
is_running() {
    local pid=$(get_pid)
    [[ -n "$pid" ]] && ps -p "$pid" > /dev/null 2>&1
}

# Get memory usage in MB
get_memory_usage() {
    local pid=$(get_pid)
    if [[ -n "$pid" ]]; then
        ps -p "$pid" -o rss= 2>/dev/null | awk '{print int($1/1024)}' || echo "0"
    else
        echo "0"
    fi
}

# Get CPU usage percentage
get_cpu_usage() {
    local pid=$(get_pid)
    if [[ -n "$pid" ]]; then
        ps -p "$pid" -o %cpu= 2>/dev/null | awk '{print int($1)}' || echo "0"
    else
        echo "0"
    fi
}

# Health check via HTTP
health_check() {
    curl -f -s --max-time 10 "$HEALTH_URL" > /dev/null 2>&1
}

# System resource check
check_system_resources() {
    # Check disk space
    local disk_usage=$(df "$PROJECT_DIR" | awk 'NR==2 {print int($5)}')
    if [[ $disk_usage -gt 90 ]]; then
        warning "High disk usage: ${disk_usage}%"
        # Clean up old logs
        find "$PROJECT_DIR" -name "*.log" -mtime +7 -delete 2>/dev/null || true
    fi
    
    # Check system memory
    local system_mem=$(free | awk 'NR==2{printf "%.0f", $3*100/$2}')
    if [[ $system_mem -gt 85 ]]; then
        warning "High system memory usage: ${system_mem}%"
    fi
}

# Start the service
start_service() {
    log "Starting LLM Router service..."
    
    cd "$PROJECT_DIR"
    
    # Check if already running
    if is_running; then
        warning "Service is already running"
        return 0
    fi
    
    # Start server
    nohup node server.js > server.log 2>&1 &
    local pid=$!
    echo $pid > "$PID_FILE"
    
    # Wait for startup
    sleep 10
    
    # Verify startup
    if health_check; then
        success "Service started successfully (PID: $pid)"
        FAILURE_COUNT=0
        send_notification "INFO" "LLM Router service started"
        return 0
    else
        error "Service failed to start properly"
        kill $pid 2>/dev/null || true
        rm -f "$PID_FILE"
        return 1
    fi
}

# Stop the service
stop_service() {
    log "Stopping LLM Router service..."
    
    local pid=$(get_pid)
    if [[ -n "$pid" ]]; then
        kill $pid 2>/dev/null
        sleep 5
        
        # Force kill if still running
        if ps -p "$pid" > /dev/null 2>&1; then
            kill -9 $pid 2>/dev/null || true
        fi
        
        rm -f "$PID_FILE"
        success "Service stopped"
        send_notification "INFO" "LLM Router service stopped"
    else
        warning "Service was not running"
    fi
}

# Restart the service with cooldown
restart_service() {
    local current_time=$(date +%s)
    
    # Check restart cooldown
    if [[ $((current_time - LAST_RESTART)) -lt $RESTART_COOLDOWN ]]; then
        warning "Restart in cooldown period, skipping..."
        return 1
    fi
    
    alert "Restarting service due to health check failure"
    
    stop_service
    sleep 5
    
    if start_service; then
        LAST_RESTART=$current_time
        FAILURE_COUNT=0
        success "Service restarted successfully"
        return 0
    else
        error "Service restart failed"
        return 1
    fi
}

# Main monitoring loop
monitor_loop() {
    log "🔍 Starting monitoring loop (interval: ${CHECK_INTERVAL}s)"
    
    while true; do
        if is_running; then
            local memory=$(get_memory_usage)
            local cpu=$(get_cpu_usage)
            
            # Log current status
            log "Status: Running | Memory: ${memory}MB | CPU: ${cpu}%"
            
            # Check memory usage
            if [[ $memory -gt $MAX_MEMORY_MB ]]; then
                warning "High memory usage: ${memory}MB (limit: ${MAX_MEMORY_MB}MB)"
                
                # Auto-restart on excessive memory usage
                if [[ $memory -gt $((MAX_MEMORY_MB + 512)) ]]; then
                    alert "Memory usage critical (${memory}MB), restarting service"
                    restart_service
                fi
            fi
            
            # Check CPU usage
            if [[ $cpu -gt $MAX_CPU_PERCENT ]]; then
                warning "High CPU usage: ${cpu}% (limit: ${MAX_CPU_PERCENT}%)"
            fi
            
            # HTTP health check
            if health_check; then
                FAILURE_COUNT=0
            else
                FAILURE_COUNT=$((FAILURE_COUNT + 1))
                error "Health check failed (attempt $FAILURE_COUNT/$MAX_FAILURES)"
                
                if [[ $FAILURE_COUNT -ge $MAX_FAILURES ]]; then
                    alert "Maximum failures reached, attempting restart"
                    if restart_service; then
                        FAILURE_COUNT=0
                    else
                        alert "Service restart failed after health check failures"
                    fi
                fi
            fi
            
        else
            warning "Service is not running"
            FAILURE_COUNT=$((FAILURE_COUNT + 1))
            
            if [[ $FAILURE_COUNT -ge 2 ]]; then
                alert "Service down, attempting to start"
                if start_service; then
                    FAILURE_COUNT=0
                else
                    error "Failed to start service"
                fi
            fi
        fi
        
        # Check system resources
        check_system_resources
        
        # Rotate logs if too large
        if [[ -f "$LOG_FILE" ]] && [[ $(stat -f%z "$LOG_FILE" 2>/dev/null || stat -c%s "$LOG_FILE") -gt 10485760 ]]; then  # 10MB
            mv "$LOG_FILE" "${LOG_FILE}.old"
            log "Log file rotated"
        fi
        
        sleep $CHECK_INTERVAL
    done
}

# Status report
status_report() {
    echo "🔍 LLM Router Status Report"
    echo "=========================="
    
    if is_running; then
        local pid=$(get_pid)
        local memory=$(get_memory_usage)
        local cpu=$(get_cpu_usage)
        
        echo "Status: ✅ Running (PID: $pid)"
        echo "Memory: ${memory}MB"
        echo "CPU: ${cpu}%"
        
        # Health check
        if health_check; then
            echo "Health: ✅ Healthy"
        else
            echo "Health: ❌ Unhealthy"
        fi
    else
        echo "Status: ❌ Not running"
    fi
    
    echo ""
    echo "System Resources:"
    echo "=================="
    free -h | head -2
    echo ""
    df -h "$PROJECT_DIR" | tail -1
    
    echo ""
    echo "Recent Alerts:"
    echo "=============="
    if [[ -f "$ALERT_LOG" ]]; then
        tail -5 "$ALERT_LOG" || echo "No recent alerts"
    else
        echo "No alerts logged"
    fi
}

# Usage information
usage() {
    echo "Usage: $0 {start|stop|restart|status|monitor|health}"
    echo ""
    echo "Commands:"
    echo "  start     - Start the LLM Router service"
    echo "  stop      - Stop the LLM Router service"
    echo "  restart   - Restart the LLM Router service"
    echo "  status    - Show detailed status report"
    echo "  monitor   - Start continuous monitoring loop"
    echo "  health    - Perform single health check"
    echo ""
}

# Main script
case "${1:-}" in
    start)
        start_service
        ;;
    stop)
        stop_service
        ;;
    restart)
        restart_service
        ;;
    status)
        status_report
        ;;
    monitor)
        monitor_loop
        ;;
    health)
        if health_check; then
            success "Health check passed"
            exit 0
        else
            error "Health check failed"
            exit 1
        fi
        ;;
    *)
        usage
        exit 1
        ;;
esac