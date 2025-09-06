# Multi-stage Dockerfile for LLM Runner Router
# Optimized for production deployment

# Stage 1: Builder
FROM node:20-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++ cmake

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies including dev packages for build
RUN npm ci

# Copy source code (no build step required)
COPY . .

# Remove development dependencies to slim runtime image
RUN npm prune --production

# Stage 2: Runtime
FROM node:20-alpine

# Install runtime dependencies
RUN apk add --no-cache \
    python3 \
    py3-pip \
    && rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy from builder
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/src ./src
COPY --from=builder --chown=nodejs:nodejs /app/server.js ./
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./
COPY --from=builder --chown=nodejs:nodejs /app/models ./models
COPY --from=builder --chown=nodejs:nodejs /app/config ./config

# Create directories for cache and models
RUN mkdir -p /app/cache /app/models/cache && \
    chown -R nodejs:nodejs /app/cache /app/models/cache

# Switch to non-root user
USER nodejs

# Expose ports
EXPOSE 3006
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3006/api/health', (r) => {r.statusCode === 200 ? process.exit(0) : process.exit(1)})"

# Environment variables
ENV NODE_ENV=production \
    PORT=3006 \
    WS_PORT=8080 \
    MAX_MEMORY=4096 \
    ROUTING_STRATEGY=balanced \
    CACHE_ENABLED=true \
    LOG_LEVEL=info

# Start the server
CMD ["node", "server.js"]