#!/bin/bash

# 🔥 Firewall Configuration Script for LLM-Runner-Router
# This script configures UFW to allow external access to the chat application

echo "🔥 LLM-Runner-Router Firewall Configuration"
echo "============================================"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "❌ This script must be run with sudo privileges"
    echo "   Please run: sudo ./configure-firewall.sh"
    exit 1
fi

echo "📋 Current firewall status:"
ufw status verbose

echo ""
echo "🔧 Configuring firewall rules..."

BASE_URL="${BASE_URL:-http://localhost:3006}"

# Enable UFW if not already enabled
if ! ufw status | grep -q "Status: active"; then
    echo "⚠️  UFW is not active. Enabling UFW..."
    # IMPORTANT: Allow SSH first to not lock ourselves out
    ufw allow 22/tcp comment 'SSH access'
    echo "✅ SSH port 22 allowed"
fi

# Allow LLM Router API port
echo "📡 Allowing port 3006 (API server)..."
ufw allow 3006/tcp comment 'LLM Router API'

# Allow LLM Router Chat UI port
echo "💬 Allowing port 3001 (Chat interface)..."
ufw allow 3001/tcp comment 'LLM Router Chat UI'

# Allow HTTP and HTTPS for future use
echo "🌐 Allowing HTTP/HTTPS ports..."
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'

# Enable UFW if not already active
if ! ufw status | grep -q "Status: active"; then
    echo ""
    echo "🚀 Enabling UFW firewall..."
    ufw --force enable
fi

echo ""
echo "📊 Updated firewall status:"
ufw status numbered

echo ""
echo "✅ Firewall configuration complete!"
echo ""
echo "🔍 Testing accessibility..."

# Test local connectivity
echo -n "  Local API (3006): "
if curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/health" | grep -q "200"; then
    echo "✅ Working"
else
    echo "❌ Not responding"
fi

echo -n "  Local Chat (3001): "
if curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/ | grep -q "200\|304"; then
    echo "✅ Working"
else
    echo "❌ Not responding"
fi

echo ""
echo "📱 Your services should now be accessible at:"
echo "  🔗 API: http://178.156.181.117:3006/api/health"
echo "  💬 Chat: http://178.156.181.117:3001/standalone.html"
echo ""
echo "⚠️  IMPORTANT: If services are still not accessible externally,"
echo "   you may need to configure Hetzner Cloud Firewall via the console:"
echo "   https://console.hetzner.cloud/"
echo ""
echo "   Add these rules in Hetzner Cloud Console:"
echo "   • Inbound TCP Port 3006 from 0.0.0.0/0"
echo "   • Inbound TCP Port 3001 from 0.0.0.0/0"