#!/bin/bash

# 🛡️ LLM Router SaaS Security Hardening Script
# Comprehensive security implementation for production deployment

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}🛡️ LLM Router SaaS Security Hardening${NC}\n"

# Configuration
PROJECT_DIR="/home/mikecerqua/projects/LLM-Runner-Router"
SERVICE_NAME="llm-router-saas"
DOMAIN="${1:-llm-api.local}"  # Use provided domain or default
PUBLIC_IP="178.156.181.117"
BASE_URL="${BASE_URL:-http://localhost:3006}"

echo -e "${YELLOW}📋 Configuration:${NC}"
echo -e "  Project: $PROJECT_DIR"
echo -e "  Service: $SERVICE_NAME"
echo -e "  Domain: $DOMAIN"
echo -e "  Public IP: $PUBLIC_IP"
echo ""

cd "$PROJECT_DIR"

# Phase 1: Nginx Installation and Configuration
echo -e "${BLUE}📦 Phase 1: Nginx Setup${NC}"

# Check if Nginx is installed
if ! command -v nginx &> /dev/null; then
    echo -e "${YELLOW}⚠️ Nginx not installed. Manual installation required:${NC}"
    echo -e "  sudo apt update"
    echo -e "  sudo apt install nginx"
    echo -e "  sudo systemctl enable nginx"
    echo -e "  sudo systemctl start nginx"
    echo ""
    echo -e "${RED}❌ Cannot proceed without sudo access for Nginx installation${NC}"
    echo -e "${YELLOW}💡 Alternative: Use a user-space reverse proxy or run without SSL for testing${NC}"
    NGINX_AVAILABLE=false
else
    echo -e "${GREEN}✅ Nginx is installed${NC}"
    NGINX_AVAILABLE=true
fi

# Phase 2: SSL Certificate Setup
echo -e "${BLUE}🔒 Phase 2: SSL Certificate${NC}"

if [ "$NGINX_AVAILABLE" = true ]; then
    # Create self-signed certificate for testing
    echo -e "${YELLOW}🔧 Creating self-signed SSL certificate for testing...${NC}"
    
    SSL_DIR="$PROJECT_DIR/ssl"
    mkdir -p "$SSL_DIR"
    
    # Generate self-signed certificate
    if [ ! -f "$SSL_DIR/cert.pem" ]; then
        openssl req -x509 -newkey rsa:4096 -keyout "$SSL_DIR/key.pem" -out "$SSL_DIR/cert.pem" -days 365 -nodes -subj "/C=US/ST=VPS/L=Cloud/O=LLM-Router/CN=$DOMAIN" 2>/dev/null || {
            echo -e "${RED}❌ OpenSSL not available for certificate generation${NC}"
            echo -e "${YELLOW}💡 Manual certificate creation required${NC}"
        }
        
        if [ -f "$SSL_DIR/cert.pem" ]; then
            echo -e "${GREEN}✅ Self-signed certificate created${NC}"
            chmod 600 "$SSL_DIR/key.pem"
            chmod 644 "$SSL_DIR/cert.pem"
        fi
    else
        echo -e "${GREEN}✅ SSL certificate already exists${NC}"
    fi
else
    echo -e "${YELLOW}⚠️ Skipping SSL setup (Nginx required)${NC}"
fi

# Phase 3: Nginx Configuration
echo -e "${BLUE}⚙️ Phase 3: Nginx Configuration${NC}"

if [ "$NGINX_AVAILABLE" = true ]; then
    # Create Nginx configuration
    NGINX_CONFIG="$PROJECT_DIR/nginx-llm-router.conf"
    
    cat > "$NGINX_CONFIG" << EOF
# LLM Router SaaS Nginx Configuration
# Secure reverse proxy with SSL termination

upstream llm_router_backend {
    server 127.0.0.1:3006;
    keepalive 32;
}

# Rate limiting zones
limit_req_zone \$binary_remote_addr zone=api:10m rate=60r/m;
limit_req_zone \$binary_remote_addr zone=admin:10m rate=5r/m;

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name $DOMAIN $PUBLIC_IP;
    return 301 https://\$server_name\$request_uri;
}

# Main HTTPS server
server {
    listen 443 ssl http2;
    server_name $DOMAIN $PUBLIC_IP;
    
    # SSL Configuration
    ssl_certificate $SSL_DIR/cert.pem;
    ssl_certificate_key $SSL_DIR/key.pem;
    
    # SSL Security Settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    
    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';" always;
    
    # Remove server version
    server_tokens off;
    
    # API Routes with rate limiting
    location /api/admin/ {
        limit_req zone=admin burst=3 nodelay;
        proxy_pass http://llm_router_backend;
        include proxy_params;
    }
    
    location /api/ {
        limit_req zone=api burst=20 nodelay;
        proxy_pass http://llm_router_backend;
        include proxy_params;
    }
    
    # WebSocket support
    location /ws {
        proxy_pass http://llm_router_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    
    # Default route
    location / {
        proxy_pass http://llm_router_backend;
        include proxy_params;
    }
    
    # Block access to sensitive files
    location ~ /\\.env {
        deny all;
        return 404;
    }
    
    location ~ /logs/ {
        deny all;
        return 404;
    }
}

# Proxy parameters file
EOF

    # Create proxy_params file
    PROXY_PARAMS="$PROJECT_DIR/proxy_params"
    cat > "$PROXY_PARAMS" << EOF
proxy_set_header Host \$http_host;
proxy_set_header X-Real-IP \$remote_addr;
proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto \$scheme;
proxy_set_header X-Forwarded-Host \$host;
proxy_set_header X-Forwarded-Port \$server_port;
proxy_connect_timeout 30s;
proxy_send_timeout 30s;
proxy_read_timeout 30s;
proxy_buffering off;
proxy_request_buffering off;
EOF

    echo -e "${GREEN}✅ Nginx configuration created${NC}"
    echo -e "${YELLOW}📁 Config file: $NGINX_CONFIG${NC}"
    echo -e "${YELLOW}📁 Proxy params: $PROXY_PARAMS${NC}"
    
    echo -e "${YELLOW}⚠️ Manual step required:${NC}"
    echo -e "  sudo cp $NGINX_CONFIG /etc/nginx/sites-available/llm-router"
    echo -e "  sudo cp $PROXY_PARAMS /etc/nginx/proxy_params"
    echo -e "  sudo ln -sf /etc/nginx/sites-available/llm-router /etc/nginx/sites-enabled/"
    echo -e "  sudo nginx -t"
    echo -e "  sudo systemctl reload nginx"
else
    echo -e "${YELLOW}⚠️ Skipping Nginx configuration (Nginx not available)${NC}"
fi

# Phase 4: Firewall Configuration Script
echo -e "${BLUE}🔥 Phase 4: Firewall Configuration${NC}"

UFW_SCRIPT="$PROJECT_DIR/setup-firewall.sh"
cat > "$UFW_SCRIPT" << 'EOF'
#!/bin/bash
# UFW Firewall Setup for LLM Router SaaS
# Run with: sudo bash setup-firewall.sh

echo "🔥 Configuring UFW Firewall..."

# Reset UFW to defaults
ufw --force reset

# Default policies
ufw default deny incoming
ufw default allow outgoing

# SSH access (adjust port if needed)
ufw allow 22/tcp comment 'SSH access'

# HTTP and HTTPS
ufw allow 80/tcp comment 'HTTP (redirect to HTTPS)'
ufw allow 443/tcp comment 'HTTPS (LLM Router SaaS)'

# Optional: Allow specific admin IPs only
# ufw allow from YOUR_ADMIN_IP to any port 443

# Enable firewall
ufw --force enable

# Show status
ufw status numbered

echo "✅ Firewall configured successfully"
echo "⚠️ Important: Test SSH access before disconnecting!"
EOF

chmod +x "$UFW_SCRIPT"
echo -e "${GREEN}✅ Firewall setup script created${NC}"
echo -e "${YELLOW}📁 Script: $UFW_SCRIPT${NC}"
echo -e "${YELLOW}⚠️ Run with: sudo bash $UFW_SCRIPT${NC}"

# Phase 5: Service Security Configuration
echo -e "${BLUE}🔒 Phase 5: Service Security${NC}"

# Secure environment file
echo -e "${YELLOW}🔧 Securing environment configuration...${NC}"

# Generate new secure admin key
NEW_ADMIN_KEY=$(openssl rand -hex 32)
echo -e "${GREEN}✅ New admin key generated${NC}"

# Update PM2 configuration to bind to localhost only
SECURE_PM2_CONFIG="$PROJECT_DIR/ecosystem.secure.config.cjs"
cat > "$SECURE_PM2_CONFIG" << EOF
/**
 * 🛡️ Secure PM2 Configuration for LLM Router SaaS
 * Localhost binding with enhanced security
 */

module.exports = {
  apps: [
    {
      name: 'llm-router-saas',
      script: 'server.js',
      cwd: '$PROJECT_DIR',
      
      // Bind to localhost only (behind Nginx proxy)
      instances: 1,
      exec_mode: 'fork',
      
      // Auto-restart Configuration
      watch: false,
      autorestart: true,
      max_restarts: 5,
      min_uptime: '30s',
      
      // Resource Management
      max_memory_restart: '1G',
      
      // Environment Variables (secure)
      env: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',  // Localhost only
        PORT: 3006,
        AUTO_INIT: 'true',
        ROUTING_STRATEGY: 'balanced',
        ADMIN_API_KEY: '$NEW_ADMIN_KEY',
        LOG_LEVEL: 'warn'
      },
      
      // Logging Configuration
      log_file: './logs/llm-router-combined.log',
      out_file: './logs/llm-router-out.log',
      error_file: './logs/llm-router-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      
      // Security Settings
      kill_timeout: 3000,
      listen_timeout: 3000,
      shutdown_with_message: true,
      
      // Node.js Options
      node_args: '--max-old-space-size=1024'
    }
  ]
};
EOF

echo -e "${GREEN}✅ Secure PM2 configuration created${NC}"
echo -e "${YELLOW}📁 Config: $SECURE_PM2_CONFIG${NC}"

# Phase 6: Generate deployment script
echo -e "${BLUE}🚀 Phase 6: Secure Deployment Script${NC}"

DEPLOY_SCRIPT="$PROJECT_DIR/deploy-secure.sh"
cat > "$DEPLOY_SCRIPT" << EOF
#!/bin/bash
# 🛡️ Secure Deployment Script for LLM Router SaaS

echo "🛡️ Deploying LLM Router SaaS with security..."

# Stop current service
pm2 stop llm-router-saas 2>/dev/null || echo "Service not running"

# Use secure configuration
pm2 start ecosystem.secure.config.cjs --env production

# Save PM2 configuration
pm2 save

# Test localhost binding
sleep 3
if curl -s http://127.0.0.1:3006/api/health > /dev/null; then
    echo "✅ Service running on ${BASE_URL}"
else
    echo "❌ Service not responding on localhost"
    exit 1
fi

# Check if external access is blocked (should fail)
if curl -s --connect-timeout 2 http://178.156.181.117:3006/api/health > /dev/null; then
    echo "⚠️ WARNING: Service still accessible externally!"
    echo "   This is expected if Nginx reverse proxy is configured"
else
    echo "✅ Direct external access blocked (service on localhost only)"
fi

echo "🎉 Secure deployment completed!"
echo "📋 Next steps:"
echo "   1. Configure Nginx reverse proxy"
echo "   2. Setup SSL certificate"
echo "   3. Enable firewall"
echo "   4. Test HTTPS access"

echo ""
echo "🔑 New Admin Key: $NEW_ADMIN_KEY"
echo "⚠️ SAVE THIS KEY SECURELY - it won't be shown again!"
EOF

chmod +x "$DEPLOY_SCRIPT"
echo -e "${GREEN}✅ Secure deployment script created${NC}"
echo -e "${YELLOW}📁 Script: $DEPLOY_SCRIPT${NC}"

# Final Summary
echo -e "\n${BLUE}📋 Security Hardening Summary${NC}"
echo -e "${GREEN}✅ Generated Components:${NC}"
echo -e "  📄 Nginx configuration: nginx-llm-router.conf"
echo -e "  🔒 SSL certificates: ssl/ directory"
echo -e "  🔥 Firewall script: setup-firewall.sh"
echo -e "  ⚙️ Secure PM2 config: ecosystem.secure.config.cjs"
echo -e "  🚀 Deployment script: deploy-secure.sh"

echo -e "\n${YELLOW}⚠️ Manual Steps Required (with sudo):${NC}"
echo -e "  1. Install Nginx: sudo apt install nginx"
echo -e "  2. Configure Nginx: sudo cp nginx-llm-router.conf /etc/nginx/sites-available/"
echo -e "  3. Enable site: sudo ln -sf /etc/nginx/sites-available/llm-router /etc/nginx/sites-enabled/"
echo -e "  4. Setup firewall: sudo bash setup-firewall.sh"
echo -e "  5. Reload Nginx: sudo systemctl reload nginx"

echo -e "\n${BLUE}🎯 Deployment Options:${NC}"
echo -e "  A. Full security: Complete all manual steps, then run ./deploy-secure.sh"
echo -e "  B. Localhost only: Run ./deploy-secure.sh (service on 127.0.0.1:3006)"
echo -e "  C. Testing mode: Keep current setup for development"

echo -e "\n${GREEN}🔑 New Admin Key: $NEW_ADMIN_KEY${NC}"
echo -e "${RED}⚠️ IMPORTANT: Save this key securely!${NC}"

echo -e "\n${BLUE}🚀 Ready for secure deployment!${NC}"
EOF

chmod +x /home/mikecerqua/projects/LLM-Runner-Router/scripts/security-setup.sh