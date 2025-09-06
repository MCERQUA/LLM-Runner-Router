/**
 * API Integration Tests
 * Tests all API components working together in a complete system
 */

import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { GRPCServer } from '../../src/api/gRPC.js';
import { AuthenticationManager, AuthMiddleware } from '../../src/api/Auth.js';
import { RateLimitManager } from '../../src/api/RateLimiter.js';
import { OpenAPIManager } from '../../src/api/OpenAPI.js';
import { APIGateway } from '../../src/api/Gateway.js';
import { LLMRouter } from '../../src/index.js';
import bcrypt from 'bcrypt';

describe('API Integration', () => {
  let app;
  let authManager;
  let authMiddleware;
  let rateLimiter;
  let openAPIManager;
  let gateway;
  let grpcServer;
  let router;
  let testUser;
  let testApiKey;

  beforeAll(async () => {
    const adminHash = await bcrypt.hash('admin123', 4);
    const userHash = await bcrypt.hash('user123', 4);
    const apiHash = await bcrypt.hash('api123', 4);
    process.env.DEFAULT_ADMIN_PASSWORD_HASH = adminHash;
    process.env.DEFAULT_USER_PASSWORD_HASH = userHash;
    process.env.DEFAULT_API_PASSWORD_HASH = apiHash;

    // Initialize core components
    router = new LLMRouter({ autoInit: false });
    await router.initialize();

    // Initialize authentication
    authManager = new AuthenticationManager({
      jwtSecret: 'test-integration-secret',
      jwtExpiresIn: '1h',
      bcryptRounds: 4,
      sessionSecret: 'test-session-secret'
    });
    authMiddleware = new AuthMiddleware(authManager);

    // Wait for auth initialization
    await new Promise(resolve => {
      authManager.on('initialized', resolve);
    });

    // Create test user and API key
    testUser = await authManager.authenticateUser('admin', 'admin123');
    testApiKey = await authManager.generateApiKey(testUser.id, 'Integration Test Key');

    // Initialize rate limiter
    rateLimiter = new RateLimitManager({
      useRedis: false,
      tiers: {
        integration: {
          requestsPerHour: 1000,
          requestsPerMinute: 50,
          concurrentRequests: 10,
          costMultiplier: 1
        }
      }
    });
    await rateLimiter.initialize();

    // Initialize OpenAPI manager
    openAPIManager = new OpenAPIManager({
      title: 'Integration Test API',
      version: '1.0.0-integration'
    });

    // Initialize gRPC server
    grpcServer = new GRPCServer({
      host: '127.0.0.1',
      port: 50053
    });
    await grpcServer.initialize(router);
    await grpcServer.start();

    // Create Express app with all integrations
    app = express();
    app.use(express.json());

    // Add request tracking
    app.use((req, res, next) => {
      req.startTime = Date.now();
      req.id = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      res.setHeader('X-Request-ID', req.id);
      next();
    });

    // Setup integrated routes
    setupIntegratedRoutes();
  });

  afterAll(async () => {
    if (grpcServer) {
      await grpcServer.stop();
    }
    if (rateLimiter) {
      await rateLimiter.shutdown();
    }
    if (router) {
      await router.cleanup();
    }
    delete process.env.DEFAULT_ADMIN_PASSWORD_HASH;
    delete process.env.DEFAULT_USER_PASSWORD_HASH;
    delete process.env.DEFAULT_API_PASSWORD_HASH;
  });

  function setupIntegratedRoutes() {
    // OpenAPI documentation
    app.get('/api/openapi.json', (req, res) => {
      res.json(openAPIManager.getSpecJSON());
    });

    // Health endpoint with all components
    app.get('/api/health', (req, res) => {
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        components: {
          auth: authManager.getStats(),
          rateLimit: rateLimiter.getStats(),
          grpc: grpcServer.getMetrics(),
          router: router.getStatus()
        }
      };
      res.json(health);
    });

    // Authentication endpoints
    app.post('/api/auth/login', 
      rateLimiter.createMiddleware({ cost: 2 }),
      ...openAPIManager.createValidationMiddleware('POST', '/api/auth/login'),
      async (req, res) => {
        try {
          const { username, password } = req.body;
          const user = await authManager.authenticateUser(username, password);
          
          if (!user) {
            return res.status(401).json({
              error: 'Unauthorized',
              message: 'Invalid credentials'
            });
          }

          const tokens = authManager.generateTokens(user);
          res.json({
            ...tokens,
            user: user
          });
        } catch (error) {
          res.status(500).json({
            error: 'Authentication Error',
            message: error.message
          });
        }
      }
    );

    app.post('/api/auth/apikeys',
      authMiddleware.authenticate(),
      authMiddleware.requirePermission('apikey:create'),
      rateLimiter.createMiddleware(),
      async (req, res) => {
        try {
          const { name, permissions, expiresAt } = req.body;
          const apiKey = await authManager.generateApiKey(
            req.user.id,
            name,
            permissions,
            expiresAt ? new Date(expiresAt) : null
          );
          res.status(201).json(apiKey);
        } catch (error) {
          res.status(500).json({
            error: 'API Key Creation Error',
            message: error.message
          });
        }
      }
    );

    // Model management with full integration
    app.get('/api/models',
      authMiddleware.authenticateFlexible(),
      authMiddleware.requirePermission('model:read'),
      rateLimiter.createMiddleware(),
      ...openAPIManager.createValidationMiddleware('GET', '/api/models'),
      (req, res) => {
        const models = router.registry.getAll();
        res.json({
          models: models.map(m => ({
            id: m.id,
            name: m.name,
            format: m.format,
            loaded: m.loaded || false
          })),
          total: models.length
        });
      }
    );

    app.post('/api/models/load',
      authMiddleware.authenticateFlexible(),
      authMiddleware.requirePermission('model:write'),
      rateLimiter.createCostMiddleware(3), // High cost operation
      ...openAPIManager.createValidationMiddleware('POST', '/api/models/load'),
      async (req, res) => {
        try {
          const { source, format, id, name } = req.body;
          const model = await router.load({
            source,
            format: format || 'auto',
            id: id || `model-${Date.now()}`,
            name: name || 'Unnamed Model'
          });

          res.json({
            success: true,
            model: {
              id: model.id,
              name: model.name,
              format: model.format
            }
          });
        } catch (error) {
          res.status(500).json({
            error: 'Model Load Error',
            message: error.message
          });
        }
      }
    );

    // Inference with comprehensive integration
    app.post('/api/inference',
      authMiddleware.authenticateFlexible(),
      authMiddleware.requirePermission('inference:create'),
      rateLimiter.createCostMiddleware(req => {
        const maxTokens = req.body?.maxTokens || 100;
        return Math.ceil(maxTokens / 50); // Cost based on token count
      }),
      ...openAPIManager.createValidationMiddleware('POST', '/api/inference'),
      async (req, res) => {
        try {
          const { prompt, model, maxTokens = 100, temperature = 0.7 } = req.body;
          
          const result = await router.quick(prompt, {
            maxTokens,
            temperature,
            modelId: model
          });

          res.json({
            text: result.text || result,
            model: result.model || model || 'unknown',
            usage: {
              promptTokens: prompt.split(' ').length,
              completionTokens: (result.text || result).split(' ').length,
              totalTokens: prompt.split(' ').length + (result.text || result).split(' ').length
            },
            metadata: {
              requestId: req.id,
              processingTime: Date.now() - req.startTime
            }
          });
        } catch (error) {
          res.status(500).json({
            error: 'Inference Error',
            message: error.message
          });
        }
      }
    );

    // Chat endpoint with streaming support detection
    app.post('/api/chat',
      authMiddleware.authenticateFlexible(),
      authMiddleware.requirePermission('chat:create'),
      rateLimiter.createCostMiddleware(req => {
        const messageCount = req.body?.messages?.length || 1;
        return Math.max(1, messageCount);
      }),
      ...openAPIManager.createValidationMiddleware('POST', '/api/chat'),
      async (req, res) => {
        try {
          const { messages, model, maxTokens = 500, temperature = 0.7, stream = false } = req.body;
          
          if (stream) {
            // Set headers for streaming
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            
            // Simulate streaming response
            const chunks = ['Hello', ' from', ' the', ' integrated', ' chat', ' system!'];
            for (const chunk of chunks) {
              res.write(`data: ${JSON.stringify({ content: chunk, done: false })}\n\n`);
              await new Promise(resolve => setTimeout(resolve, 100));
            }
            res.write(`data: ${JSON.stringify({ content: '', done: true })}\n\n`);
            res.end();
          } else {
            // Regular chat response
            const lastMessage = messages[messages.length - 1];
            const response = `Echo: ${lastMessage.content} (from integrated system)`;
            
            res.json({
              response: response,
              model: model || 'integration-chat',
              usage: {
                promptTokens: messages.reduce((sum, m) => sum + m.content.split(' ').length, 0),
                completionTokens: response.split(' ').length,
                totalTokens: messages.reduce((sum, m) => sum + m.content.split(' ').length, 0) + response.split(' ').length
              }
            });
          }
        } catch (error) {
          res.status(500).json({
            error: 'Chat Error',
            message: error.message
          });
        }
      }
    );

    // Admin endpoints
    app.get('/api/admin/stats',
      authMiddleware.authenticateFlexible(),
      authMiddleware.requireRole('admin'),
      rateLimiter.createMiddleware(),
      (req, res) => {
        res.json({
          auth: authManager.getStats(),
          rateLimit: rateLimiter.getStats(),
          grpc: grpcServer.getMetrics(),
          router: router.getStatus(),
          system: {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            timestamp: new Date().toISOString()
          }
        });
      }
    );

    app.post('/api/admin/cache/clear',
      authMiddleware.authenticateFlexible(),
      authMiddleware.requireRole('admin'),
      rateLimiter.createMiddleware(),
      (req, res) => {
        // Clear various caches
        router.registry.clearCache?.();
        authManager.cleanup();
        rateLimiter.clearCache?.();
        
        res.json({
          success: true,
          message: 'All caches cleared',
          timestamp: new Date().toISOString()
        });
      }
    );

    // Error handling
    app.use((error, req, res, next) => {
      console.error('Integration error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
        requestId: req.id,
        timestamp: new Date().toISOString()
      });
    });

    // 404 handler
    app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.method} ${req.originalUrl} not found`,
        timestamp: new Date().toISOString()
      });
    });
  }

  describe('System Health', () => {
    test('should provide comprehensive health status', (done) => {
      request(app)
        .get('/api/health')
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          
          expect(res.body.status).toBe('healthy');
          expect(res.body.components.auth).toBeDefined();
          expect(res.body.components.rateLimit).toBeDefined();
          expect(res.body.components.grpc).toBeDefined();
          expect(res.body.components.router).toBeDefined();
          
          // Check component health details
          expect(res.body.components.auth.totalUsers).toBeGreaterThan(0);
          expect(res.body.components.grpc.totalRequests).toBeGreaterThanOrEqual(0);
          done();
        });
    });

    test('should provide OpenAPI specification', (done) => {
      request(app)
        .get('/api/openapi.json')
        .expect(200)
        .expect('Content-Type', /json/)
        .end((err, res) => {
          if (err) return done(err);
          
          expect(res.body.openapi).toBe('3.0.3');
          expect(res.body.info.title).toBe('Integration Test API');
          expect(res.body.paths).toBeDefined();
          expect(res.body.components).toBeDefined();
          done();
        });
    });
  });

  describe('Authentication Flow', () => {
    test('should authenticate and return JWT tokens', (done) => {
      request(app)
        .post('/api/auth/login')
        .send({
          username: 'admin',
          password: 'admin123'
        })
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          
          expect(res.body.accessToken).toBeDefined();
          expect(res.body.refreshToken).toBeDefined();
          expect(res.body.tokenType).toBe('Bearer');
          expect(res.body.user).toBeDefined();
          expect(res.body.user.username).toBe('admin');
          done();
        });
    });

    test('should reject invalid credentials', (done) => {
      request(app)
        .post('/api/auth/login')
        .send({
          username: 'admin',
          password: 'wrongpassword'
        })
        .expect(401)
        .end((err, res) => {
          if (err) return done(err);
          
          expect(res.body.error).toBe('Unauthorized');
          expect(res.body.message).toBe('Invalid credentials');
          done();
        });
    });

    test('should create API keys with JWT authentication', (done) => {
      // First get a JWT token
      request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'admin123' })
        .expect(200)
        .end((err, loginRes) => {
          if (err) return done(err);
          
          const token = loginRes.body.accessToken;
          
          // Then create API key
          request(app)
            .post('/api/auth/apikeys')
            .set('Authorization', `Bearer ${token}`)
            .send({
              name: 'Integration Test Key',
              permissions: ['model:read', 'inference:create']
            })
            .expect(201)
            .end((err2, res) => {
              if (err2) return done(err2);
              
              expect(res.body.id).toBeDefined();
              expect(res.body.key).toMatch(/^llmr_/);
              expect(res.body.name).toBe('Integration Test Key');
              expect(res.body.permissions).toContain('model:read');
              done();
            });
        });
    });
  });

  describe('Rate Limiting Integration', () => {
    test('should apply rate limiting with cost calculation', (done) => {
      request(app)
        .post('/api/inference')
        .set('X-API-Key', testApiKey.key)
        .send({
          prompt: 'Test prompt',
          maxTokens: 200 // High cost
        })
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          
          expect(res.headers['x-ratelimit-limit']).toBeDefined();
          expect(res.headers['x-ratelimit-remaining']).toBeDefined();
          expect(res.body.text).toBeDefined();
          done();
        });
    });

    test('should enforce authentication before rate limiting', (done) => {
      request(app)
        .post('/api/inference')
        .send({ prompt: 'Test without auth' })
        .expect(401)
        .end((err, res) => {
          if (err) return done(err);
          
          expect(res.body.error).toBe('Unauthorized');
          done();
        });
    });

    test('should allow higher limits for authenticated users', (done) => {
      let requestCount = 0;
      const maxRequests = 5;

      function makeRequest() {
        request(app)
          .get('/api/models')
          .set('X-API-Key', testApiKey.key)
          .end((err, res) => {
            if (err) return done(err);
            
            requestCount++;
            if (requestCount < maxRequests) {
              makeRequest();
            } else {
              // All requests should succeed due to higher limits
              expect(res.status).toBe(200);
              done();
            }
          });
      }

      makeRequest();
    });
  });

  describe('Permission System Integration', () => {
    test('should allow model read with proper permissions', (done) => {
      request(app)
        .get('/api/models')
        .set('X-API-Key', testApiKey.key)
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          
          expect(res.body.models).toBeDefined();
          expect(Array.isArray(res.body.models)).toBe(true);
          done();
        });
    });

    test('should restrict admin functions to admin users', (done) => {
      // Create a regular user API key
      const regularUser = Array.from(authManager.users.values()).find(u => u.role === 'user');
      
      authManager.generateApiKey(regularUser.id, 'Regular User Key')
        .then(regularApiKey => {
          request(app)
            .get('/api/admin/stats')
            .set('X-API-Key', regularApiKey.key)
            .expect(403)
            .end((err, res) => {
              if (err) return done(err);
              
              expect(res.body.error).toBe('Forbidden');
              expect(res.body.message).toContain('Insufficient role');
              done();
            });
        });
    });

    test('should allow admin functions for admin users', (done) => {
      request(app)
        .get('/api/admin/stats')
        .set('X-API-Key', testApiKey.key)
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          
          expect(res.body.auth).toBeDefined();
          expect(res.body.rateLimit).toBeDefined();
          expect(res.body.system).toBeDefined();
          done();
        });
    });
  });

  describe('Model Operations Integration', () => {
    test('should load models with proper authentication and validation', (done) => {
      request(app)
        .post('/api/models/load')
        .set('X-API-Key', testApiKey.key)
        .send({
          source: 'test-integration-model',
          format: 'simple',
          id: 'integration-test-model',
          name: 'Integration Test Model'
        })
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          
          expect(res.body.success).toBe(true);
          expect(res.body.model.id).toBe('integration-test-model');
          expect(res.body.model.name).toBe('Integration Test Model');
          done();
        });
    });

    test('should validate model load requests', (done) => {
      request(app)
        .post('/api/models/load')
        .set('X-API-Key', testApiKey.key)
        .send({
          // Missing required 'source' field
          format: 'simple',
          name: 'Invalid Model'
        })
        .expect(400)
        .end((err, res) => {
          if (err) return done(err);
          
          expect(res.body.error).toBe('Validation failed');
          expect(res.body.details).toBeDefined();
          done();
        });
    });
  });

  describe('Inference Integration', () => {
    test('should perform inference with cost-based rate limiting', (done) => {
      request(app)
        .post('/api/inference')
        .set('X-API-Key', testApiKey.key)
        .send({
          prompt: 'Generate a creative story about robots',
          maxTokens: 150,
          temperature: 0.8
        })
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          
          expect(res.body.text).toBeDefined();
          expect(res.body.model).toBeDefined();
          expect(res.body.usage).toBeDefined();
          expect(res.body.usage.totalTokens).toBeGreaterThan(0);
          expect(res.body.metadata.requestId).toBeDefined();
          expect(res.body.metadata.processingTime).toBeGreaterThan(0);
          done();
        });
    });

    test('should validate inference parameters', (done) => {
      request(app)
        .post('/api/inference')
        .set('X-API-Key', testApiKey.key)
        .send({
          prompt: 'Test',
          temperature: 5.0 // Invalid range
        })
        .expect(400)
        .end((err, res) => {
          if (err) return done(err);
          
          expect(res.body.error).toBe('Validation failed');
          done();
        });
    });
  });

  describe('Chat Integration', () => {
    test('should handle regular chat requests', (done) => {
      request(app)
        .post('/api/chat')
        .set('X-API-Key', testApiKey.key)
        .send({
          messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: 'Hello, how are you?' }
          ],
          maxTokens: 100
        })
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          
          expect(res.body.response).toBeDefined();
          expect(res.body.response).toContain('Echo:');
          expect(res.body.usage).toBeDefined();
          done();
        });
    });

    test('should handle streaming chat requests', (done) => {
      const req = request(app)
        .post('/api/chat')
        .set('X-API-Key', testApiKey.key)
        .send({
          messages: [{ role: 'user', content: 'Tell me a story' }],
          stream: true
        })
        .expect(200);

      let chunks = [];
      req.end((err, res) => {
        if (err) return done(err);
        
        expect(res.headers['content-type']).toContain('text/event-stream');
        // In a real test, you'd parse the streaming response
        done();
      });
    });

    test('should validate chat message format', (done) => {
      request(app)
        .post('/api/chat')
        .set('X-API-Key', testApiKey.key)
        .send({
          messages: [
            { role: 'invalid-role', content: 'Test' } // Invalid role
          ]
        })
        .expect(400)
        .end((err, res) => {
          if (err) return done(err);
          
          expect(res.body.error).toBe('Validation failed');
          done();
        });
    });
  });

  describe('Error Handling Integration', () => {
    test('should handle authentication errors gracefully', (done) => {
      request(app)
        .post('/api/inference')
        .set('X-API-Key', 'invalid-key')
        .send({ prompt: 'Test' })
        .expect(401)
        .end((err, res) => {
          if (err) return done(err);
          
          expect(res.body.error).toBe('Unauthorized');
          expect(res.headers['x-request-id']).toBeDefined();
          done();
        });
    });

    test('should handle validation errors with detailed information', (done) => {
      request(app)
        .post('/api/inference')
        .set('X-API-Key', testApiKey.key)
        .send({
          // Missing required prompt
          maxTokens: 100
        })
        .expect(400)
        .end((err, res) => {
          if (err) return done(err);
          
          expect(res.body.error).toBe('Validation failed');
          expect(res.body.details).toBeDefined();
          expect(Array.isArray(res.body.details)).toBe(true);
          done();
        });
    });

    test('should handle internal server errors', (done) => {
      // Create a route that will cause an error
      app.get('/test-error', (req, res, next) => {
        throw new Error('Test integration error');
      });

      request(app)
        .get('/test-error')
        .expect(500)
        .end((err, res) => {
          if (err) return done(err);
          
          expect(res.body.error).toBe('Internal Server Error');
          expect(res.body.message).toBe('Test integration error');
          expect(res.body.requestId).toBeDefined();
          done();
        });
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle concurrent requests across all systems', async () => {
      const concurrentRequests = 20;
      const promises = [];

      for (let i = 0; i < concurrentRequests; i++) {
        const promise = request(app)
          .post('/api/inference')
          .set('X-API-Key', testApiKey.key)
          .send({
            prompt: `Test prompt ${i}`,
            maxTokens: 50
          })
          .expect(200);
        
        promises.push(promise);
      }

      const startTime = Date.now();
      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;

      expect(results.length).toBe(concurrentRequests);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds

      results.forEach((res, i) => {
        expect(res.body.text).toBeDefined();
        expect(res.body.metadata.requestId).toBeDefined();
      });
    });

    test('should maintain performance with mixed operations', async () => {
      const operations = [
        () => request(app).get('/api/health').set('X-API-Key', testApiKey.key),
        () => request(app).get('/api/models').set('X-API-Key', testApiKey.key),
        () => request(app).post('/api/inference')
          .set('X-API-Key', testApiKey.key)
          .send({ prompt: 'Quick test', maxTokens: 20 }),
        () => request(app).post('/api/chat')
          .set('X-API-Key', testApiKey.key)
          .send({ messages: [{ role: 'user', content: 'Hi' }] })
      ];

      const promises = [];
      for (let i = 0; i < 16; i++) {
        const operation = operations[i % operations.length];
        promises.push(operation());
      }

      const startTime = Date.now();
      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;

      expect(results.length).toBe(16);
      expect(duration).toBeLessThan(3000);

      results.forEach(res => {
        expect(res.status).toBeLessThan(500); // No server errors
      });
    });
  });

  describe('Admin Operations Integration', () => {
    test('should provide comprehensive system statistics', (done) => {
      request(app)
        .get('/api/admin/stats')
        .set('X-API-Key', testApiKey.key)
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          
          const stats = res.body;
          expect(stats.auth.totalUsers).toBeGreaterThan(0);
          expect(stats.rateLimit.totalRequests).toBeGreaterThan(0);
          expect(stats.system.uptime).toBeGreaterThan(0);
          expect(stats.system.memory).toBeDefined();
          done();
        });
    });

    test('should clear system caches', (done) => {
      request(app)
        .post('/api/admin/cache/clear')
        .set('X-API-Key', testApiKey.key)
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          
          expect(res.body.success).toBe(true);
          expect(res.body.message).toContain('cleared');
          done();
        });
    });
  });

  describe('Cross-Component Data Flow', () => {
    test('should track request flow across all components', (done) => {
      request(app)
        .post('/api/inference')
        .set('X-API-Key', testApiKey.key)
        .send({
          prompt: 'Test request flow tracking',
          maxTokens: 50
        })
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          
          // Check that request was processed by all components
          expect(res.headers['x-request-id']).toBeDefined();
          expect(res.headers['x-ratelimit-limit']).toBeDefined();
          expect(res.body.metadata.requestId).toBeDefined();
          expect(res.body.metadata.processingTime).toBeGreaterThan(0);
          
          // Verify metrics were updated
          const rateLimitStats = rateLimiter.getStats();
          expect(rateLimitStats.totalRequests).toBeGreaterThan(0);
          
          done();
        });
    });

    test('should maintain consistency across component failures', (done) => {
      // Temporarily break one component (simulation)
      const originalValidate = openAPIManager.validateRequest;
      openAPIManager.validateRequest = jest.fn().mockReturnValue({ valid: true, errors: [] });
      
      request(app)
        .post('/api/inference')
        .set('X-API-Key', testApiKey.key)
        .send({ prompt: 'Test with simulated component issue' })
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          
          // Restore original function
          openAPIManager.validateRequest = originalValidate;
          
          expect(res.body.text).toBeDefined();
          done();
        });
    });
  });
});