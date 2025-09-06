# Docker & Containerization Examples

Complete guide to containerizing LLM-Runner-Router applications for development, testing, and production deployment.

## Table of Contents
- [Basic Docker Setup](#basic-docker-setup)
- [Multi-stage Builds](#multi-stage-builds)
- [Docker Compose Development](#docker-compose-development)
- [Production Deployment](#production-deployment)
- [Kubernetes Deployment](#kubernetes-deployment)
- [Model Management in Containers](#model-management-in-containers)
- [Monitoring & Logging](#monitoring--logging)
- [Scaling & Load Balancing](#scaling--load-balancing)

## Basic Docker Setup

### 1. Simple Node.js Dockerfile

```dockerfile
# Dockerfile
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install dependencies for native modules
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    curl \
    bash

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY src/ ./src/
COPY public/ ./public/

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S appuser -u 1001
RUN chown -R appuser:nodejs /app
USER appuser

# Create directories for models and cache
RUN mkdir -p /app/models /app/cache

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Start application
CMD ["node", "src/index.js"]
```

### 2. Development Dockerfile with Hot Reload

```dockerfile
# Dockerfile.dev
FROM node:18-alpine

# Install development dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    curl \
    bash \
    git

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev)
RUN npm ci

# Copy source code
COPY . .

# Create models directory
RUN mkdir -p /app/models /app/cache

# Expose port and debugger port
EXPOSE 3000 9229

# Start with nodemon for hot reload
CMD ["npm", "run", "dev"]
```

### 3. Application with Environment Variables

```javascript
// src/docker-server.js
import LLMRouter from 'llm-runner-router';
import express from 'express';
import path from 'path';
import fs from 'fs';

class DockerizedLLMServer {
    constructor() {
        this.app = express();
        this.port = process.env.PORT || 3000;
        this.modelsPath = process.env.MODELS_PATH || '/app/models';
        this.cachePath = process.env.CACHE_PATH || '/app/cache';
        
        this.router = new LLMRouter({
            strategy: process.env.LLM_STRATEGY || 'balanced',
            logLevel: process.env.LOG_LEVEL || 'info',
            cacheTTL: parseInt(process.env.CACHE_TTL || '3600000'),
            maxModels: parseInt(process.env.MAX_MODELS || '10')
        });
        
        this.setupDirectories();
        this.setupMiddleware();
        this.setupRoutes();
        this.setupHealthChecks();
    }
    
    setupDirectories() {
        // Ensure required directories exist
        [this.modelsPath, this.cachePath].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                console.log(`📁 Created directory: ${dir}`);
            }
        });
    }
    
    setupMiddleware() {
        this.app.use(express.json({ limit: '10mb' }));
        
        // Request logging
        this.app.use((req, res, next) => {
            console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
            next();
        });
        
        // CORS for container environments
        this.app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
            res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
            if (req.method === 'OPTIONS') {
                res.sendStatus(200);
            } else {
                next();
            }
        });
    }
    
    setupRoutes() {
        // Generation endpoint
        this.app.post('/api/generate', async (req, res) => {
            try {
                const { prompt, options = {} } = req.body;
                const result = await this.router.quick(prompt, options);
                
                res.json({
                    success: true,
                    data: result,
                    container: {
                        hostname: process.env.HOSTNAME,
                        version: process.env.npm_package_version
                    }
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message,
                    container: process.env.HOSTNAME
                });
            }
        });
        
        // Models management
        this.app.get('/api/models', (req, res) => {
            const models = this.router.registry.list();
            res.json({
                success: true,
                models: models.map(m => ({
                    id: m.id,
                    name: m.name,
                    size: m.size,
                    path: m.path?.startsWith(this.modelsPath) ? 
                        path.relative(this.modelsPath, m.path) : m.path
                }))
            });
        });
        
        this.app.post('/api/models/load', async (req, res) => {
            try {
                const { filename } = req.body;
                const modelPath = path.join(this.modelsPath, filename);
                
                if (!fs.existsSync(modelPath)) {
                    return res.status(404).json({
                        success: false,
                        error: `Model file not found: ${filename}`
                    });
                }
                
                const model = await this.router.load(modelPath);
                res.json({
                    success: true,
                    model: {
                        id: model.id,
                        name: model.name,
                        loaded: true
                    }
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });
    }
    
    setupHealthChecks() {
        // Kubernetes liveness probe
        this.app.get('/health', (req, res) => {
            const status = this.router.getStatus();
            const health = {
                status: status.initialized ? 'healthy' : 'initializing',
                timestamp: new Date().toISOString(),
                version: process.env.npm_package_version,
                container: process.env.HOSTNAME,
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                models: status.modelsLoaded || 0,
                engine: status.engine
            };
            
            res.status(status.initialized ? 200 : 503).json(health);
        });
        
        // Kubernetes readiness probe
        this.app.get('/ready', (req, res) => {
            const status = this.router.getStatus();
            if (status.initialized) {
                res.status(200).json({ ready: true });
            } else {
                res.status(503).json({ ready: false, reason: 'Router not initialized' });
            }
        });
        
        // Detailed metrics
        this.app.get('/metrics', (req, res) => {
            const metrics = this.router.getMetrics();
            const containerMetrics = {
                ...metrics,
                container: {
                    hostname: process.env.HOSTNAME,
                    version: process.env.npm_package_version,
                    uptime: process.uptime(),
                    memory: process.memoryUsage(),
                    platform: process.platform,
                    nodeVersion: process.version
                },
                filesystem: {
                    modelsPath: this.modelsPath,
                    cachePath: this.cachePath,
                    diskUsage: this.getDiskUsage()
                }
            };
            
            res.json(containerMetrics);
        });
    }
    
    getDiskUsage() {
        try {
            const stats = fs.statSync('/app');
            return {
                size: stats.size,
                accessed: stats.atime,
                modified: stats.mtime
            };
        } catch (error) {
            return { error: error.message };
        }
    }
    
    async start() {
        try {
            console.log('🔄 Initializing LLM Router...');
            await this.router.initialize();
            
            // Load models from environment variable
            const modelsToLoad = process.env.PRELOAD_MODELS?.split(',') || [];
            for (const modelFile of modelsToLoad) {
                const modelPath = path.join(this.modelsPath, modelFile.trim());
                if (fs.existsSync(modelPath)) {
                    try {
                        console.log(`📦 Loading model: ${modelFile}`);
                        await this.router.load(modelPath);
                    } catch (error) {
                        console.error(`❌ Failed to load ${modelFile}:`, error.message);
                    }
                }
            }
            
            this.server = this.app.listen(this.port, '0.0.0.0', () => {
                console.log(`🚀 Dockerized LLM Server running on port ${this.port}`);
                console.log(`📊 Health: http://localhost:${this.port}/health`);
                console.log(`📈 Metrics: http://localhost:${this.port}/metrics`);
                console.log(`🏠 Container: ${process.env.HOSTNAME}`);
            });
            
            // Graceful shutdown
            process.on('SIGTERM', this.shutdown.bind(this));
            process.on('SIGINT', this.shutdown.bind(this));
            
        } catch (error) {
            console.error('❌ Failed to start server:', error);
            process.exit(1);
        }
    }
    
    async shutdown(signal) {
        console.log(`🔄 Received ${signal}, shutting down gracefully...`);
        
        if (this.server) {
            await new Promise(resolve => this.server.close(resolve));
        }
        
        await this.router.cleanup();
        console.log('✅ Server stopped gracefully');
        process.exit(0);
    }
}

const server = new DockerizedLLMServer();
server.start();
```

## Multi-stage Builds

### 1. Optimized Production Build

```dockerfile
# Dockerfile.multi-stage
# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./
COPY src/ ./src/

# Install all dependencies
RUN npm ci

# Production stage
FROM node:18-alpine AS production

WORKDIR /app

# Install only runtime dependencies
RUN apk add --no-cache curl bash

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy application source from builder stage
COPY --from=builder /app/src ./src

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S appuser -u 1001 -G nodejs

# Create directories
RUN mkdir -p /app/models /app/cache /app/logs && \
    chown -R appuser:nodejs /app

USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "src/index.js"]
```

### 2. Multi-architecture Build

```dockerfile
# Dockerfile.multi-arch
FROM --platform=$BUILDPLATFORM node:18-alpine AS base

ARG TARGETPLATFORM
ARG BUILDPLATFORM
RUN echo "Building on $BUILDPLATFORM, targeting $TARGETPLATFORM"

WORKDIR /app

# Install dependencies based on target platform
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    curl \
    bash

# Build stage
FROM base AS builder

COPY package*.json ./
COPY src/ ./src/
COPY scripts/ ./scripts/

RUN npm ci
RUN npm prune --production

# Production stage
FROM base AS production

COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

COPY --from=builder /app/src ./src

RUN addgroup -g 1001 -S nodejs && \
    adduser -S appuser -u 1001 -G nodejs && \
    mkdir -p /app/models /app/cache /app/logs && \
    chown -R appuser:nodejs /app

USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "src/index.js"]

# Build commands:
# docker buildx build --platform linux/amd64,linux/arm64 -t llm-router:latest .
# docker buildx build --platform linux/amd64,linux/arm64 --push -t your-registry/llm-router:latest .
```

## Docker Compose Development

### 1. Development Stack

```yaml
# docker-compose.dev.yml
version: '3.8'

services:
  llm-router:
    build:
      context: .
      dockerfile: Dockerfile.dev
    ports:
      - "3000:3000"
      - "9229:9229"  # Debug port
    environment:
      - NODE_ENV=development
      - LOG_LEVEL=debug
      - LLM_STRATEGY=balanced
      - MAX_MODELS=5
      - CACHE_TTL=1800000
    volumes:
      - ./src:/app/src:ro
      - ./models:/app/models
      - ./cache:/app/cache
      - node_modules:/app/node_modules
    depends_on:
      - redis
      - postgres
    networks:
      - llm-network
    restart: unless-stopped
    
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes
    volumes:
      - redis-data:/data
    networks:
      - llm-network
    restart: unless-stopped
    
  postgres:
    image: postgres:15-alpine
    ports:
      - "5432:5432"
    environment:
      - POSTGRES_DB=llm_router
      - POSTGRES_USER=llm_user
      - POSTGRES_PASSWORD=llm_password
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./sql/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
    networks:
      - llm-network
    restart: unless-stopped
    
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/dev.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - llm-router
    networks:
      - llm-network
    restart: unless-stopped

volumes:
  node_modules:
  redis-data:
  postgres-data:

networks:
  llm-network:
    driver: bridge
```

### 2. Production Stack

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  llm-router:
    image: llm-router:latest
    deploy:
      replicas: 3
      resources:
        limits:
          cpus: '2'
          memory: 4G
        reservations:
          cpus: '1'
          memory: 2G
      restart_policy:
        condition: on-failure
        delay: 10s
        max_attempts: 3
        window: 60s
    environment:
      - NODE_ENV=production
      - LOG_LEVEL=info
      - LLM_STRATEGY=speed-priority
      - MAX_MODELS=3
      - REDIS_URL=redis://redis:6379
      - DATABASE_URL=postgres://llm_user:llm_password@postgres:5432/llm_router
      - PRELOAD_MODELS=llama-7b.gguf,codellama-7b.gguf
    volumes:
      - models-volume:/app/models:ro
      - cache-volume:/app/cache
      - logs-volume:/app/logs
    networks:
      - llm-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
      
  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis-data:/data
    networks:
      - llm-network
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
    restart: unless-stopped
    
  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=llm_router
      - POSTGRES_USER=llm_user
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./sql/schema.sql:/docker-entrypoint-initdb.d/schema.sql:ro
    networks:
      - llm-network
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 1G
    restart: unless-stopped
    
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/prod.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
      - logs-volume:/var/log/nginx
    depends_on:
      - llm-router
    networks:
      - llm-network
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 256M
    restart: unless-stopped
    
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus-data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--web.console.libraries=/etc/prometheus/console_libraries'
      - '--web.console.templates=/etc/prometheus/consoles'
    networks:
      - llm-network
      
  grafana:
    image: grafana/grafana:latest
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD}
    volumes:
      - grafana-data:/var/lib/grafana
      - ./monitoring/grafana/dashboards:/etc/grafana/provisioning/dashboards:ro
      - ./monitoring/grafana/datasources:/etc/grafana/provisioning/datasources:ro
    networks:
      - llm-network

volumes:
  models-volume:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /data/models
  cache-volume:
  logs-volume:
  redis-data:
  postgres-data:
  prometheus-data:
  grafana-data:

networks:
  llm-network:
    driver: overlay
    attachable: true

# Deploy command: docker stack deploy -c docker-compose.prod.yml llm-stack
```

### 3. Model Management Service

```yaml
# docker-compose.models.yml
version: '3.8'

services:
  model-downloader:
    build:
      context: ./scripts
      dockerfile: Dockerfile.downloader
    environment:
      - MODELS_PATH=/models
      - HUGGINGFACE_TOKEN=${HUGGINGFACE_TOKEN}
    volumes:
      - models-volume:/models
    command: |
      sh -c '
        echo "Downloading models..."
        python download_models.py --models "meta-llama/Llama-2-7b-hf,codellama/CodeLlama-7b-hf"
        echo "Models downloaded successfully"
      '
    restart: "no"
    
  model-converter:
    build:
      context: ./scripts
      dockerfile: Dockerfile.converter
    volumes:
      - models-volume:/models
    depends_on:
      - model-downloader
    command: |
      sh -c '
        echo "Converting models to GGUF format..."
        python convert_to_gguf.py --input-dir /models --output-dir /models/gguf
        echo "Model conversion complete"
      '
    restart: "no"

volumes:
  models-volume:
    external: true
```

```dockerfile
# scripts/Dockerfile.downloader
FROM python:3.11-slim

RUN pip install huggingface_hub transformers torch

COPY download_models.py /app/
WORKDIR /app

CMD ["python", "download_models.py"]
```

```python
# scripts/download_models.py
import os
import argparse
from huggingface_hub import snapshot_download

def download_models(models, models_path):
    """Download models from HuggingFace Hub"""
    os.makedirs(models_path, exist_ok=True)
    
    for model_name in models:
        print(f"Downloading {model_name}...")
        try:
            snapshot_download(
                repo_id=model_name,
                cache_dir=models_path,
                local_dir=f"{models_path}/{model_name.replace('/', '_')}",
                local_dir_use_symlinks=False
            )
            print(f"✅ Downloaded {model_name}")
        except Exception as e:
            print(f"❌ Failed to download {model_name}: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--models", required=True, help="Comma-separated list of models")
    parser.add_argument("--models-path", default="/models", help="Path to store models")
    
    args = parser.parse_args()
    models = args.models.split(",")
    
    download_models(models, args.models_path)
```

## Production Deployment

### 1. Production Docker Stack

```bash
#!/bin/bash
# deploy.sh - Production deployment script

set -e

# Configuration
STACK_NAME="llm-router"
COMPOSE_FILE="docker-compose.prod.yml"
REGISTRY="your-registry.com"
IMAGE_TAG="${1:-latest}"

echo "🚀 Deploying LLM Router Stack"
echo "Stack: $STACK_NAME"
echo "Image: $REGISTRY/llm-router:$IMAGE_TAG"

# Build and push image
echo "📦 Building production image..."
docker build -t $REGISTRY/llm-router:$IMAGE_TAG -f Dockerfile.multi-stage .
docker push $REGISTRY/llm-router:$IMAGE_TAG

# Generate environment variables
cat > .env <<EOF
POSTGRES_PASSWORD=$(openssl rand -base64 32)
REDIS_PASSWORD=$(openssl rand -base64 32)
GRAFANA_PASSWORD=$(openssl rand -base64 32)
HUGGINGFACE_TOKEN=${HUGGINGFACE_TOKEN}
LLM_ROUTER_IMAGE=$REGISTRY/llm-router:$IMAGE_TAG
EOF

# Create Docker secrets
echo $POSTGRES_PASSWORD | docker secret create postgres_password -
echo $REDIS_PASSWORD | docker secret create redis_password -

# Deploy stack
echo "🔄 Deploying stack..."
docker stack deploy -c $COMPOSE_FILE $STACK_NAME

# Wait for services to be healthy
echo "⏳ Waiting for services to be ready..."
for i in {1..30}; do
    if docker service ls | grep -q "replicated.*3/3"; then
        echo "✅ All services are running"
        break
    fi
    sleep 10
done

# Show status
echo "📊 Stack status:"
docker service ls
docker stack ps $STACK_NAME

echo "🎯 Deployment complete!"
echo "Health check: curl -f http://localhost/health"
```

### 2. Blue-Green Deployment

```yaml
# docker-compose.blue-green.yml
version: '3.8'

services:
  # Blue environment (current production)
  llm-router-blue:
    image: ${LLM_ROUTER_IMAGE}
    environment:
      - NODE_ENV=production
      - ENVIRONMENT=blue
      - PORT=3000
    networks:
      - llm-network
    deploy:
      replicas: 3
      labels:
        - "environment=blue"
        - "traefik.enable=false"  # Initially disabled
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 10s
      timeout: 5s
      retries: 3
      
  # Green environment (new deployment)
  llm-router-green:
    image: ${LLM_ROUTER_IMAGE_NEW}
    environment:
      - NODE_ENV=production
      - ENVIRONMENT=green
      - PORT=3000
    networks:
      - llm-network
    deploy:
      replicas: 3
      labels:
        - "environment=green"
        - "traefik.enable=true"
        - "traefik.http.routers.llm-router.rule=Host(`api.example.com`)"
        - "traefik.http.services.llm-router.loadbalancer.server.port=3000"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 10s
      timeout: 5s
      retries: 3
      
  traefik:
    image: traefik:v2.10
    command:
      - "--api.insecure=true"
      - "--providers.docker=true"
      - "--providers.docker.swarmMode=true"
      - "--entrypoints.web.address=:80"
    ports:
      - "80:80"
      - "8080:8080"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    networks:
      - llm-network
    deploy:
      placement:
        constraints: [node.role == manager]

networks:
  llm-network:
    external: true
```

```bash
#!/bin/bash
# blue-green-deploy.sh

STACK_NAME="llm-router"
NEW_IMAGE="$1"

if [ -z "$NEW_IMAGE" ]; then
    echo "Usage: $0 <new-image-tag>"
    exit 1
fi

echo "🔄 Starting blue-green deployment"
echo "New image: $NEW_IMAGE"

# Set environment variables
export LLM_ROUTER_IMAGE_NEW="registry.com/llm-router:$NEW_IMAGE"

# Deploy green environment
echo "📦 Deploying green environment..."
docker stack deploy -c docker-compose.blue-green.yml $STACK_NAME

# Wait for green to be healthy
echo "⏳ Waiting for green environment to be healthy..."
sleep 60

# Check green health
GREEN_HEALTH=$(curl -f http://api.example.com/health | jq -r '.status')
if [ "$GREEN_HEALTH" != "healthy" ]; then
    echo "❌ Green environment is not healthy, rolling back..."
    exit 1
fi

echo "✅ Green environment is healthy"

# Switch traffic to green (update Traefik labels)
echo "🔀 Switching traffic to green..."
docker service update --label-rm traefik.enable=true llm-router_llm-router-blue
docker service update --label-add traefik.enable=true llm-router_llm-router-green

echo "🎯 Blue-green deployment complete!"
```

## Kubernetes Deployment

### 1. Kubernetes Manifests

```yaml
# k8s/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: llm-router
  labels:
    app: llm-router
---
# k8s/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: llm-router-config
  namespace: llm-router
data:
  NODE_ENV: "production"
  LOG_LEVEL: "info"
  LLM_STRATEGY: "balanced"
  MAX_MODELS: "5"
  CACHE_TTL: "3600000"
  PRELOAD_MODELS: "llama-7b.gguf,codellama-7b.gguf"
---
# k8s/secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: llm-router-secrets
  namespace: llm-router
type: Opaque
data:
  redis-password: <base64-encoded-password>
  postgres-password: <base64-encoded-password>
  huggingface-token: <base64-encoded-token>
---
# k8s/persistent-volume.yaml
apiVersion: v1
kind: PersistentVolume
metadata:
  name: models-pv
spec:
  capacity:
    storage: 100Gi
  accessModes:
    - ReadOnlyMany
  persistentVolumeReclaimPolicy: Retain
  storageClassName: fast-ssd
  hostPath:
    path: /data/models
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: models-pvc
  namespace: llm-router
spec:
  accessModes:
    - ReadOnlyMany
  resources:
    requests:
      storage: 100Gi
  storageClassName: fast-ssd
---
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: llm-router
  namespace: llm-router
  labels:
    app: llm-router
spec:
  replicas: 3
  selector:
    matchLabels:
      app: llm-router
  template:
    metadata:
      labels:
        app: llm-router
    spec:
      containers:
      - name: llm-router
        image: your-registry.com/llm-router:latest
        ports:
        - containerPort: 3000
          name: http
        env:
        - name: PORT
          value: "3000"
        envFrom:
        - configMapRef:
            name: llm-router-config
        - secretRef:
            name: llm-router-secrets
        volumeMounts:
        - name: models-volume
          mountPath: /app/models
          readOnly: true
        - name: cache-volume
          mountPath: /app/cache
        - name: logs-volume
          mountPath: /app/logs
        resources:
          requests:
            memory: "2Gi"
            cpu: "1000m"
          limits:
            memory: "4Gi"
            cpu: "2000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 60
          periodSeconds: 30
          timeoutSeconds: 10
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
      volumes:
      - name: models-volume
        persistentVolumeClaim:
          claimName: models-pvc
      - name: cache-volume
        emptyDir:
          sizeLimit: 10Gi
      - name: logs-volume
        emptyDir:
          sizeLimit: 1Gi
      nodeSelector:
        node-type: gpu-node
      tolerations:
      - key: "gpu-node"
        operator: "Equal"
        value: "true"
        effect: "NoSchedule"
---
# k8s/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: llm-router-service
  namespace: llm-router
  labels:
    app: llm-router
spec:
  selector:
    app: llm-router
  ports:
  - name: http
    port: 80
    targetPort: 3000
    protocol: TCP
  type: ClusterIP
---
# k8s/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: llm-router-ingress
  namespace: llm-router
  annotations:
    kubernetes.io/ingress.class: nginx
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/proxy-body-size: "10m"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "300"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "300"
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
spec:
  tls:
  - hosts:
    - api.example.com
    secretName: llm-router-tls
  rules:
  - host: api.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: llm-router-service
            port:
              number: 80
---
# k8s/hpa.yaml
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

### 2. Helm Chart

```yaml
# helm/llm-router/Chart.yaml
apiVersion: v2
name: llm-router
description: A Helm chart for LLM Router
type: application
version: 1.0.0
appVersion: "1.0.0"
dependencies:
- name: redis
  version: "17.x.x"
  repository: "https://charts.bitnami.com/bitnami"
  condition: redis.enabled
- name: postgresql
  version: "12.x.x"
  repository: "https://charts.bitnami.com/bitnami"
  condition: postgresql.enabled
```

```yaml
# helm/llm-router/values.yaml
replicaCount: 3

image:
  repository: your-registry.com/llm-router
  pullPolicy: IfNotPresent
  tag: "latest"

nameOverride: ""
fullnameOverride: ""

service:
  type: ClusterIP
  port: 80
  targetPort: 3000

ingress:
  enabled: true
  className: "nginx"
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/proxy-body-size: "10m"
  hosts:
    - host: api.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: llm-router-tls
      hosts:
        - api.example.com

resources:
  limits:
    cpu: 2000m
    memory: 4Gi
  requests:
    cpu: 1000m
    memory: 2Gi

autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70
  targetMemoryUtilizationPercentage: 80

persistence:
  models:
    enabled: true
    size: 100Gi
    storageClass: fast-ssd
    accessMode: ReadOnlyMany
    hostPath: /data/models
  cache:
    enabled: true
    size: 10Gi
    storageClass: standard

config:
  nodeEnv: production
  logLevel: info
  llmStrategy: balanced
  maxModels: 5
  cacheTTL: 3600000
  preloadModels: "llama-7b.gguf,codellama-7b.gguf"

secrets:
  redisPassword: ""
  postgresPassword: ""
  huggingfaceToken: ""

redis:
  enabled: true
  auth:
    enabled: true
    password: ""
  architecture: standalone
  
postgresql:
  enabled: true
  auth:
    postgresPassword: ""
    username: "llm_user"
    password: ""
    database: "llm_router"

nodeSelector:
  node-type: gpu-node

tolerations:
  - key: "gpu-node"
    operator: "Equal"
    value: "true"
    effect: "NoSchedule"

affinity: {}
```

```yaml
# helm/llm-router/templates/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "llm-router.fullname" . }}
  labels:
    {{- include "llm-router.labels" . | nindent 4 }}
spec:
  {{- if not .Values.autoscaling.enabled }}
  replicas: {{ .Values.replicaCount }}
  {{- end }}
  selector:
    matchLabels:
      {{- include "llm-router.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      labels:
        {{- include "llm-router.selectorLabels" . | nindent 8 }}
    spec:
      containers:
        - name: {{ .Chart.Name }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          ports:
            - name: http
              containerPort: 3000
              protocol: TCP
          env:
            - name: NODE_ENV
              value: {{ .Values.config.nodeEnv | quote }}
            - name: LOG_LEVEL
              value: {{ .Values.config.logLevel | quote }}
            - name: LLM_STRATEGY
              value: {{ .Values.config.llmStrategy | quote }}
            - name: MAX_MODELS
              value: {{ .Values.config.maxModels | quote }}
            - name: CACHE_TTL
              value: {{ .Values.config.cacheTTL | quote }}
            - name: PRELOAD_MODELS
              value: {{ .Values.config.preloadModels | quote }}
            {{- if .Values.redis.enabled }}
            - name: REDIS_URL
              value: "redis://{{ include "llm-router.redis.fullname" . }}:6379"
            - name: REDIS_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: {{ include "llm-router.secretName" . }}
                  key: redis-password
            {{- end }}
            {{- if .Values.postgresql.enabled }}
            - name: DATABASE_URL
              value: "postgres://{{ .Values.postgresql.auth.username }}:$(POSTGRES_PASSWORD)@{{ include "llm-router.postgresql.fullname" . }}:5432/{{ .Values.postgresql.auth.database }}"
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: {{ include "llm-router.secretName" . }}
                  key: postgres-password
            {{- end }}
          volumeMounts:
            {{- if .Values.persistence.models.enabled }}
            - name: models-volume
              mountPath: /app/models
              readOnly: true
            {{- end }}
            {{- if .Values.persistence.cache.enabled }}
            - name: cache-volume
              mountPath: /app/cache
            {{- end }}
          livenessProbe:
            httpGet:
              path: /health
              port: http
            initialDelaySeconds: 60
            periodSeconds: 30
          readinessProbe:
            httpGet:
              path: /ready
              port: http
            initialDelaySeconds: 30
            periodSeconds: 10
          resources:
            {{- toYaml .Values.resources | nindent 12 }}
      volumes:
        {{- if .Values.persistence.models.enabled }}
        - name: models-volume
          persistentVolumeClaim:
            claimName: {{ include "llm-router.fullname" . }}-models
        {{- end }}
        {{- if .Values.persistence.cache.enabled }}
        - name: cache-volume
          persistentVolumeClaim:
            claimName: {{ include "llm-router.fullname" . }}-cache
        {{- end }}
      {{- with .Values.nodeSelector }}
      nodeSelector:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      {{- with .Values.affinity }}
      affinity:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      {{- with .Values.tolerations }}
      tolerations:
        {{- toYaml . | nindent 8 }}
      {{- end }}
```

### 3. Deployment Script

```bash
#!/bin/bash
# k8s-deploy.sh

set -e

NAMESPACE="llm-router"
CHART_PATH="./helm/llm-router"
RELEASE_NAME="llm-router"

# Function to generate random password
generate_password() {
    openssl rand -base64 32
}

# Create namespace
kubectl create namespace $NAMESPACE --dry-run=client -o yaml | kubectl apply -f -

# Create secrets
kubectl create secret generic llm-router-secrets \
    --namespace=$NAMESPACE \
    --from-literal=redis-password=$(generate_password) \
    --from-literal=postgres-password=$(generate_password) \
    --from-literal=huggingface-token=${HUGGINGFACE_TOKEN} \
    --dry-run=client -o yaml | kubectl apply -f -

# Deploy with Helm
helm upgrade --install $RELEASE_NAME $CHART_PATH \
    --namespace $NAMESPACE \
    --values $CHART_PATH/values.yaml \
    --set image.tag=${IMAGE_TAG:-latest} \
    --wait --timeout=10m

echo "✅ Deployment complete!"
echo "Check status: kubectl get pods -n $NAMESPACE"
echo "Get logs: kubectl logs -n $NAMESPACE deployment/llm-router"
```

## Model Management in Containers

### 1. Model Init Container

```yaml
# k8s/model-init-job.yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: model-downloader
  namespace: llm-router
spec:
  template:
    spec:
      initContainers:
      - name: download-models
        image: python:3.11-slim
        command: 
        - /bin/sh
        - -c
        - |
          pip install huggingface_hub
          python3 << EOF
          from huggingface_hub import snapshot_download
          import os
          
          models = [
              "meta-llama/Llama-2-7b-hf",
              "codellama/CodeLlama-7b-hf"
          ]
          
          for model in models:
              print(f"Downloading {model}...")
              snapshot_download(
                  repo_id=model,
                  cache_dir="/models",
                  local_dir=f"/models/{model.replace('/', '_')}",
                  local_dir_use_symlinks=False
              )
              print(f"Downloaded {model}")
          EOF
        volumeMounts:
        - name: models-volume
          mountPath: /models
        env:
        - name: HUGGINGFACE_HUB_TOKEN
          valueFrom:
            secretKeyRef:
              name: llm-router-secrets
              key: huggingface-token
      containers:
      - name: convert-models
        image: python:3.11-slim
        command:
        - /bin/sh
        - -c
        - |
          pip install transformers torch
          echo "Models ready for conversion"
          # Add GGUF conversion logic here
        volumeMounts:
        - name: models-volume
          mountPath: /models
      volumes:
      - name: models-volume
        persistentVolumeClaim:
          claimName: models-pvc
      restartPolicy: OnFailure
```

### 2. Sidecar Model Updater

```yaml
# k8s/deployment-with-sidecar.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: llm-router-with-updater
  namespace: llm-router
spec:
  replicas: 3
  selector:
    matchLabels:
      app: llm-router
  template:
    metadata:
      labels:
        app: llm-router
    spec:
      containers:
      # Main application container
      - name: llm-router
        image: your-registry.com/llm-router:latest
        ports:
        - containerPort: 3000
        volumeMounts:
        - name: models-volume
          mountPath: /app/models
        - name: shared-data
          mountPath: /app/shared
        resources:
          limits:
            memory: 4Gi
            cpu: 2000m
          requests:
            memory: 2Gi
            cpu: 1000m
            
      # Model updater sidecar
      - name: model-updater
        image: your-registry.com/model-updater:latest
        env:
        - name: CHECK_INTERVAL
          value: "3600"  # 1 hour
        - name: MODELS_PATH
          value: "/models"
        - name: HUGGINGFACE_TOKEN
          valueFrom:
            secretKeyRef:
              name: llm-router-secrets
              key: huggingface-token
        volumeMounts:
        - name: models-volume
          mountPath: /models
        - name: shared-data
          mountPath: /shared
        resources:
          limits:
            memory: 1Gi
            cpu: 500m
          requests:
            memory: 512Mi
            cpu: 250m
            
      volumes:
      - name: models-volume
        persistentVolumeClaim:
          claimName: models-pvc
      - name: shared-data
        emptyDir: {}
```

## Monitoring & Logging

### 1. Logging Configuration

```yaml
# k8s/fluentd-config.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: fluentd-config
  namespace: llm-router
data:
  fluent.conf: |
    <source>
      @type tail
      path /app/logs/*.log
      pos_file /var/log/fluentd-llm.log.pos
      tag llm-router.*
      format json
      time_key timestamp
      time_format %Y-%m-%dT%H:%M:%S.%L%z
    </source>
    
    <match llm-router.**>
      @type elasticsearch
      host elasticsearch.logging.svc.cluster.local
      port 9200
      index_name llm-router-${Time.at(time).strftime('%Y.%m.%d')}
      type_name _doc
      logstash_format true
      logstash_prefix llm-router
      
      <buffer>
        @type file
        path /var/log/fluentd-buffers/kubernetes.system.buffer
        flush_mode interval
        retry_type exponential_backoff
        flush_thread_count 2
        flush_interval 5s
        retry_forever true
        retry_max_interval 30
        chunk_limit_size 2M
        queue_limit_length 8
        overflow_action block
      </buffer>
    </match>
```

### 2. Prometheus Metrics

```yaml
# k8s/servicemonitor.yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: llm-router-metrics
  namespace: llm-router
  labels:
    app: llm-router
spec:
  selector:
    matchLabels:
      app: llm-router
  endpoints:
  - port: metrics
    path: /metrics
    interval: 30s
    scrapeTimeout: 10s
```

```javascript
// src/metrics.js - Prometheus metrics for the application
import prometheus from 'prom-client';

// Create metrics registry
const register = new prometheus.Registry();

// Default metrics (CPU, memory, etc.)
prometheus.collectDefaultMetrics({ register });

// Custom application metrics
const httpRequestDuration = new prometheus.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.1, 0.5, 1, 2, 5, 10]
});

const llmInferenceCount = new prometheus.Counter({
  name: 'llm_inference_total',
  help: 'Total number of LLM inferences',
  labelNames: ['model', 'status']
});

const llmInferenceDuration = new prometheus.Histogram({
  name: 'llm_inference_duration_seconds',
  help: 'Duration of LLM inferences in seconds',
  labelNames: ['model'],
  buckets: [0.5, 1, 2, 5, 10, 30, 60]
});

const activeConnections = new prometheus.Gauge({
  name: 'websocket_connections_active',
  help: 'Number of active WebSocket connections'
});

const modelLoadGauge = new prometheus.Gauge({
  name: 'models_loaded_count',
  help: 'Number of models currently loaded',
  labelNames: ['model_type']
});

// Register metrics
register.registerMetric(httpRequestDuration);
register.registerMetric(llmInferenceCount);
register.registerMetric(llmInferenceDuration);
register.registerMetric(activeConnections);
register.registerMetric(modelLoadGauge);

export {
  register,
  httpRequestDuration,
  llmInferenceCount,
  llmInferenceDuration,
  activeConnections,
  modelLoadGauge
};
```

This completes the comprehensive Docker and containerization examples, covering everything from basic Docker setups to production Kubernetes deployments with monitoring, logging, and scaling capabilities.