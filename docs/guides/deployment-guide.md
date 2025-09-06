# Deployment Guide

This guide covers production deployment strategies for LLM Runner Router across various platforms and environments.

## Table of Contents

1. [Production Checklist](#production-checklist)
2. [Docker Deployment](#docker-deployment)
3. [Kubernetes Deployment](#kubernetes-deployment)
4. [Cloud Platform Deployment](#cloud-platform-deployment)
5. [Load Balancing](#load-balancing)
6. [Security Configuration](#security-configuration)
7. [Monitoring & Observability](#monitoring--observability)
8. [Scaling Strategies](#scaling-strategies)
9. [Backup & Recovery](#backup--recovery)
10. [Performance Optimization](#performance-optimization)

## Production Checklist

Before deploying to production, ensure you have:

### ✅ Infrastructure Requirements

- [ ] **CPU**: Minimum 4 cores, recommended 8+ cores
- [ ] **RAM**: Minimum 8GB, recommended 16GB+ 
- [ ] **Storage**: Minimum 50GB SSD, recommended 100GB+ NVMe
- [ ] **Network**: Stable internet connection, low latency
- [ ] **GPU** (optional): For CUDA/WebGPU acceleration

### ✅ Security Requirements

- [ ] HTTPS/TLS certificates configured
- [ ] API authentication and authorization
- [ ] Rate limiting enabled
- [ ] Input validation and sanitization
- [ ] Secrets management (API keys, tokens)
- [ ] Network security (firewalls, VPC)

### ✅ Monitoring Requirements

- [ ] Application metrics (Prometheus/Grafana)
- [ ] Log aggregation (ELK/Fluentd)
- [ ] Health checks and alerting
- [ ] Error tracking (Sentry)
- [ ] Performance monitoring (APM)

### ✅ Backup Requirements

- [ ] Model registry backup
- [ ] Configuration backup
- [ ] Log retention policy
- [ ] Disaster recovery plan

## Docker Deployment

### Basic Docker Setup

```dockerfile
# Use the official Node.js image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S llmrouter -u 1001

# Set ownership
RUN chown -R llmrouter:nodejs /app
USER llmrouter

# Expose port
EXPOSE 3006

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3006/health || exit 1

# Start the application
CMD ["npm", "start"]
```

### Multi-Stage Production Build

```dockerfile
# Build stage
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production stage
FROM node:18-alpine AS production

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src ./src

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S llmrouter -u 1001

# Create necessary directories
RUN mkdir -p /app/models /app/logs /app/cache && \
    chown -R llmrouter:nodejs /app

USER llmrouter

EXPOSE 3006

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3006/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

CMD ["node", "server.js"]
```

### Docker Compose Setup

```yaml
version: '3.8'

services:
  llm-router:
    build: .
    ports:
      - "3006:3006"
    environment:
      - NODE_ENV=production
      - PORT=3006
      - REDIS_URL=redis://redis:6379
      - DATABASE_URL=postgresql://user:pass@postgres:5432/llmrouter
    volumes:
      - models:/app/models
      - logs:/app/logs
      - ./config:/app/config:ro
    depends_on:
      - redis
      - postgres
    restart: unless-stopped
    
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    restart: unless-stopped
    
  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=llmrouter
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped
    
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - llm-router
    restart: unless-stopped

volumes:
  models:
  logs:
  redis_data:
  postgres_data:
```

### Production Docker Commands

```bash
# Build production image
docker build -t llm-router:latest .

# Run with production settings
docker run -d \
  --name llm-router-prod \
  -p 3006:3006 \
  -e NODE_ENV=production \
  -v $(pwd)/models:/app/models \
  -v $(pwd)/logs:/app/logs \
  --restart unless-stopped \
  llm-router:latest

# Start with compose
docker-compose -f docker-compose.prod.yml up -d

# Check logs
docker logs -f llm-router-prod

# Scale horizontally
docker-compose up --scale llm-router=3
```

## Kubernetes Deployment

### Namespace Setup

```yaml
# namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: llm-router
  labels:
    name: llm-router
    environment: production
```

### ConfigMap

```yaml
# configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: llm-router-config
  namespace: llm-router
data:
  NODE_ENV: "production"
  PORT: "3006"
  LOG_LEVEL: "info"
  MAX_CONCURRENT_REQUESTS: "20"
  ENABLE_METRICS: "true"
  CACHE_TTL: "3600"
```

### Secret

```yaml
# secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: llm-router-secrets
  namespace: llm-router
type: Opaque
data:
  OPENAI_API_KEY: <base64-encoded-key>
  HUGGINGFACE_TOKEN: <base64-encoded-token>
  JWT_SECRET: <base64-encoded-secret>
  DATABASE_URL: <base64-encoded-url>
```

### Deployment

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: llm-router
  namespace: llm-router
  labels:
    app: llm-router
    version: v1
spec:
  replicas: 3
  selector:
    matchLabels:
      app: llm-router
  template:
    metadata:
      labels:
        app: llm-router
        version: v1
    spec:
      containers:
      - name: llm-router
        image: llm-router:latest
        ports:
        - containerPort: 3006
          name: http
        envFrom:
        - configMapRef:
            name: llm-router-config
        - secretRef:
            name: llm-router-secrets
        resources:
          requests:
            memory: "2Gi"
            cpu: "500m"
          limits:
            memory: "4Gi"
            cpu: "2000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3006
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /ready
            port: 3006
          initialDelaySeconds: 5
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 3
        volumeMounts:
        - name: models-storage
          mountPath: /app/models
        - name: logs-storage
          mountPath: /app/logs
      volumes:
      - name: models-storage
        persistentVolumeClaim:
          claimName: models-pvc
      - name: logs-storage
        persistentVolumeClaim:
          claimName: logs-pvc
```

### Service

```yaml
# service.yaml
apiVersion: v1
kind: Service
metadata:
  name: llm-router-service
  namespace: llm-router
  labels:
    app: llm-router
spec:
  type: ClusterIP
  ports:
  - port: 80
    targetPort: 3006
    protocol: TCP
    name: http
  selector:
    app: llm-router
```

### Ingress

```yaml
# ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: llm-router-ingress
  namespace: llm-router
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/rate-limit: "100"
    nginx.ingress.kubernetes.io/rate-limit-window: "1m"
spec:
  tls:
  - hosts:
    - api.yourcompany.com
    secretName: llm-router-tls
  rules:
  - host: api.yourcompany.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: llm-router-service
            port:
              number: 80
```

### Horizontal Pod Autoscaler

```yaml
# hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: llm-router-hpa
  namespace: llm-router
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: llm-router
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

### Deploy to Kubernetes

```bash
# Apply all configurations
kubectl apply -f namespace.yaml
kubectl apply -f configmap.yaml
kubectl apply -f secret.yaml
kubectl apply -f pvc.yaml
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml
kubectl apply -f ingress.yaml
kubectl apply -f hpa.yaml

# Check deployment status
kubectl get pods -n llm-router
kubectl get services -n llm-router
kubectl get ingress -n llm-router

# Check logs
kubectl logs -f deployment/llm-router -n llm-router

# Scale deployment
kubectl scale deployment/llm-router --replicas=5 -n llm-router
```

## Cloud Platform Deployment

### AWS Deployment (EKS)

```bash
# Install AWS CLI and eksctl
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip && sudo ./aws/install

# Create EKS cluster
eksctl create cluster \
  --name llm-router-cluster \
  --version 1.28 \
  --region us-west-2 \
  --nodegroup-name standard-workers \
  --node-type m5.large \
  --nodes 3 \
  --nodes-min 1 \
  --nodes-max 10 \
  --managed

# Configure kubectl
aws eks update-kubeconfig --region us-west-2 --name llm-router-cluster

# Deploy the application
kubectl apply -f k8s/
```

### Google Cloud Platform (GKE)

```bash
# Create GKE cluster
gcloud container clusters create llm-router-cluster \
  --num-nodes=3 \
  --machine-type=n1-standard-4 \
  --enable-autoscaling \
  --min-nodes=1 \
  --max-nodes=10 \
  --zone=us-central1-a

# Get credentials
gcloud container clusters get-credentials llm-router-cluster --zone=us-central1-a

# Deploy
kubectl apply -f k8s/
```

### Azure (AKS)

```bash
# Create resource group
az group create --name llm-router-rg --location eastus

# Create AKS cluster
az aks create \
  --resource-group llm-router-rg \
  --name llm-router-cluster \
  --node-count 3 \
  --node-vm-size Standard_D4s_v3 \
  --enable-cluster-autoscaler \
  --min-count 1 \
  --max-count 10

# Get credentials
az aks get-credentials --resource-group llm-router-rg --name llm-router-cluster

# Deploy
kubectl apply -f k8s/
```

## Load Balancing

### Nginx Configuration

```nginx
# nginx.conf
upstream llm_router_backend {
    least_conn;
    server llm-router-1:3006 weight=1 max_fails=3 fail_timeout=30s;
    server llm-router-2:3006 weight=1 max_fails=3 fail_timeout=30s;
    server llm-router-3:3006 weight=1 max_fails=3 fail_timeout=30s;
}

server {
    listen 80;
    server_name api.yourcompany.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.yourcompany.com;

    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=100r/m;
    limit_req zone=api burst=20 nodelay;

    # Load balancing
    location / {
        proxy_pass http://llm_router_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts
        proxy_connect_timeout 30s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
        
        # Health checks
        proxy_next_upstream error timeout invalid_header http_500 http_502 http_503;
    }

    # Health check endpoint
    location /health {
        access_log off;
        proxy_pass http://llm_router_backend;
        proxy_set_header Host $host;
    }

    # Metrics endpoint (restrict access)
    location /metrics {
        allow 10.0.0.0/8;
        deny all;
        proxy_pass http://llm_router_backend;
    }
}
```

### HAProxy Configuration

```haproxy
# haproxy.cfg
global
    daemon
    maxconn 4096
    log 127.0.0.1:514 local0

defaults
    mode http
    timeout connect 5000ms
    timeout client 50000ms
    timeout server 300000ms
    option httplog
    option redispatch
    balance roundrobin

frontend llm_router_frontend
    bind *:80
    bind *:443 ssl crt /etc/ssl/certs/certificate.pem
    redirect scheme https if !{ ssl_fc }
    
    # Rate limiting
    stick-table type ip size 100k expire 30s store http_req_rate(10s)
    http-request track-sc0 src
    http-request reject if { sc_http_req_rate(0) gt 100 }
    
    default_backend llm_router_backend

backend llm_router_backend
    option httpchk GET /health
    server llm-router-1 llm-router-1:3006 check inter 30s
    server llm-router-2 llm-router-2:3006 check inter 30s
    server llm-router-3 llm-router-3:3006 check inter 30s
```

## Security Configuration

### Environment Variables

```bash
# production.env
NODE_ENV=production
PORT=3006

# Security
JWT_SECRET=your-super-secure-jwt-secret-here
API_KEY_SALT=your-api-key-salt-here
SESSION_SECRET=your-session-secret-here

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_ENABLED=true

# CORS
CORS_ORIGIN=https://yourapp.com,https://admin.yourapp.com
CORS_CREDENTIALS=true

# HTTPS
FORCE_HTTPS=true
HSTS_MAX_AGE=31536000

# Content Security Policy
CSP_DEFAULT_SRC="'self'"
CSP_SCRIPT_SRC="'self' 'unsafe-inline'"
CSP_STYLE_SRC="'self' 'unsafe-inline'"

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/llmrouter
DATABASE_SSL=true

# Redis
REDIS_URL=rediss://user:password@localhost:6379
REDIS_TLS=true

# API Keys
OPENAI_API_KEY=sk-...
HUGGINGFACE_TOKEN=hf_...
```

### Security Middleware

```javascript
// security.js
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { body, validationResult } from 'express-validator';

export const securityMiddleware = [
    // Helmet for security headers
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'", "data:", "https:"],
            },
        },
        hsts: {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true
        }
    }),

    // Rate limiting
    rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // limit each IP to 100 requests per windowMs
        message: 'Too many requests from this IP',
        standardHeaders: true,
        legacyHeaders: false,
    }),

    // Input validation
    body('prompt').trim().isLength({ min: 1, max: 10000 }),
    body('maxTokens').optional().isInt({ min: 1, max: 4000 }),
    body('temperature').optional().isFloat({ min: 0, max: 2 }),

    // Validation error handler
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }
        next();
    }
];
```

## Monitoring & Observability

### Prometheus Metrics

```javascript
// metrics.js
import client from 'prom-client';

// Create a Registry
export const register = new client.Registry();

// Default metrics
client.collectDefaultMetrics({ register });

// Custom metrics
export const httpRequestsTotal = new client.Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code']
});

export const httpRequestDuration = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route'],
    buckets: [0.1, 0.5, 1, 2, 5, 10]
});

export const modelInferenceTotal = new client.Counter({
    name: 'model_inference_total',
    help: 'Total number of model inferences',
    labelNames: ['model_id', 'status']
});

export const modelInferenceDuration = new client.Histogram({
    name: 'model_inference_duration_seconds',
    help: 'Duration of model inference in seconds',
    labelNames: ['model_id'],
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30]
});

export const activeConnections = new client.Gauge({
    name: 'active_connections',
    help: 'Number of active connections'
});

// Register metrics
register.registerMetric(httpRequestsTotal);
register.registerMetric(httpRequestDuration);
register.registerMetric(modelInferenceTotal);
register.registerMetric(modelInferenceDuration);
register.registerMetric(activeConnections);
```

### Grafana Dashboard

```json
{
  "dashboard": {
    "title": "LLM Router Dashboard",
    "panels": [
      {
        "title": "Request Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(http_requests_total[5m])",
            "legendFormat": "{{method}} {{route}}"
          }
        ]
      },
      {
        "title": "Response Time",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))",
            "legendFormat": "95th percentile"
          }
        ]
      },
      {
        "title": "Model Performance",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(model_inference_total[5m])",
            "legendFormat": "{{model_id}}"
          }
        ]
      }
    ]
  }
}
```

## Scaling Strategies

### Horizontal Scaling

```yaml
# Auto-scaling based on CPU and memory
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: llm-router-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: llm-router
  minReplicas: 3
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Percent
        value: 10
        periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
      - type: Percent
        value: 50
        periodSeconds: 60
```

### Vertical Scaling

```yaml
# Vertical Pod Autoscaler
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: llm-router-vpa
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: llm-router
  updatePolicy:
    updateMode: "Auto"
  resourcePolicy:
    containerPolicies:
    - containerName: llm-router
      minAllowed:
        cpu: 500m
        memory: 1Gi
      maxAllowed:
        cpu: 4
        memory: 8Gi
      controlledResources: ["cpu", "memory"]
```

## Backup & Recovery

### Backup Script

```bash
#!/bin/bash
# backup.sh

BACKUP_DIR="/backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

# Backup model registry
kubectl get configmap llm-router-config -n llm-router -o yaml > "$BACKUP_DIR/config.yaml"
kubectl get secret llm-router-secrets -n llm-router -o yaml > "$BACKUP_DIR/secrets.yaml"

# Backup models
kubectl exec -n llm-router deployment/llm-router -- tar czf - /app/models | gzip > "$BACKUP_DIR/models.tar.gz"

# Backup database
kubectl exec -n llm-router deployment/postgres -- pg_dump llmrouter | gzip > "$BACKUP_DIR/database.sql.gz"

# Upload to S3
aws s3 sync "$BACKUP_DIR" "s3://llm-router-backups/$(basename $BACKUP_DIR)/"

echo "Backup completed: $BACKUP_DIR"
```

### Recovery Script

```bash
#!/bin/bash
# recovery.sh

BACKUP_DATE=$1
if [ -z "$BACKUP_DATE" ]; then
    echo "Usage: $0 <backup_date>"
    exit 1
fi

BACKUP_DIR="/backups/$BACKUP_DATE"

# Download from S3
aws s3 sync "s3://llm-router-backups/$BACKUP_DATE/" "$BACKUP_DIR/"

# Restore configuration
kubectl apply -f "$BACKUP_DIR/config.yaml"
kubectl apply -f "$BACKUP_DIR/secrets.yaml"

# Restore models
kubectl exec -n llm-router deployment/llm-router -- tar xzf - -C / < "$BACKUP_DIR/models.tar.gz"

# Restore database
gunzip < "$BACKUP_DIR/database.sql.gz" | kubectl exec -i -n llm-router deployment/postgres -- psql llmrouter

echo "Recovery completed from: $BACKUP_DATE"
```

## Performance Optimization

### Production Configuration

```javascript
// production.config.js
export default {
    performance: {
        // Maximize concurrent requests
        maxConcurrent: 50,
        
        // Enable all optimization features
        enableStreaming: true,
        enableEnsemble: true,
        enableCaching: true,
        
        // Aggressive caching
        cacheStrategy: 'aggressive',
        cacheTTL: 3600,
        
        // Model optimization
        enableQuantization: true,
        preferGPU: true,
        enableModelSharding: true
    },
    
    engines: {
        preferred: ['webgpu', 'cuda', 'wasm', 'native'],
        fallback: true,
        autoSelect: true
    },
    
    routing: {
        strategy: 'balanced',
        loadBalancing: true,
        healthChecks: true,
        timeoutMs: 30000
    },
    
    monitoring: {
        enabled: true,
        metricsEnabled: true,
        tracingEnabled: true,
        profilingEnabled: false
    }
};
```

### Container Optimization

```dockerfile
# Optimized production Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm prune --production

# Production stage
FROM node:20-alpine AS runner
WORKDIR /app

# Add non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S llmrouter -u 1001

# Copy application source and dependencies
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/server.js ./
COPY --from=builder /app/package*.json ./

# Set proper ownership
RUN chown -R llmrouter:nodejs /app

USER llmrouter

# Optimize Node.js for production
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=4096"

EXPOSE 3006

CMD ["node", "server.js"]
```

This deployment guide provides comprehensive coverage of production deployment strategies. Continue to the [monitoring setup tutorial](../tutorials/monitoring-setup.md) for detailed observability configuration.