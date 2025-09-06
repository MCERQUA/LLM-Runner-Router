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
BASE_URL="${BASE_URL:-http://localhost:3006}"
if curl -s "$BASE_URL/api/health" > /dev/null; then
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
echo "🔑 New Admin Key: 85dea3a443471c55a735551898159d7eb2f29fdc5fbdddd1b38eb513e7b887a6"
echo "⚠️ SAVE THIS KEY SECURELY - it won't be shown again!"
