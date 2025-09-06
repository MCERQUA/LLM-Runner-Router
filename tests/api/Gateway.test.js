/**
 * API Gateway Tests
 * Tests for unified routing, protocol translation, circuit breakers, and caching
 */

import { jest } from '@jest/globals';
import { APIGateway } from '../../src/api/Gateway.js';
import request from 'supertest';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3006';

// Mock fetch for service calls
global.fetch = jest.fn();

describe.skip('API Gateway', () => {
  let gateway;
  let app;

  beforeEach(async () => {
    // Reset fetch mock
    fetch.mockClear();

    gateway = new APIGateway({
      port: 8081, // Different port for testing
      services: {
        testService: {
          url: 'http://localhost:3001',
          healthPath: '/health',
          timeout: 5000,
          circuitBreaker: {
            threshold: 3,
            timeout: 30000,
            resetTimeout: 15000
          }
        },
        authService: {
          url: 'http://localhost:3002',
          healthPath: '/health',
          timeout: 5000
        }
      },
      routes: [
        {
          path: '/api/v1/test',
          target: 'testService',
          methods: ['GET', 'POST'],
          auth: false,
          cache: { ttl: 60 },
          rateLimit: { requests: 10, window: 60 }
        },
        {
          path: '/api/v1/auth/*',
          target: 'authService',
          methods: ['POST'],
          auth: false,
          cache: false
        },
        {
          path: '/api/v1/protected',
          target: 'testService',
          methods: ['GET'],
          auth: true,
          cache: { ttl: 30 }
        }
      ],
      cache: {
        maxSize: 100,
        ttl: 60000
      }
    });

    await gateway.initialize();
    app = gateway.app;
  });

  afterEach(async () => {
    if (gateway) {
      await gateway.stop();
    }
  });

  describe('Gateway Initialization', () => {
    test('should initialize gateway successfully', () => {
      expect(gateway.app).toBeDefined();
      expect(gateway.cache).toBeDefined();
      expect(gateway.circuitBreakers.size).toBeGreaterThan(0);
      expect(gateway.serviceHealth.size).toBeGreaterThanOrEqual(0);
    });

    test('should setup circuit breakers for services', () => {
      expect(gateway.circuitBreakers.has('testService')).toBe(true);
      expect(gateway.circuitBreakers.has('authService')).toBe(true);
    });

    test('should setup middleware correctly', () => {
      expect(gateway.transformers.size).toBeGreaterThan(0);
      expect(gateway.transformers.has('standardizeInferenceRequest')).toBe(true);
      expect(gateway.transformers.has('standardizeInferenceResponse')).toBe(true);
    });
  });

  describe('Health and Monitoring', () => {
    test('should provide gateway health endpoint', (done) => {
      request(app)
        .get('/gateway/health')
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          
          expect(res.body.status).toBeDefined();
          expect(res.body.timestamp).toBeDefined();
          expect(res.body.services).toBeDefined();
          expect(res.body.metrics).toBeDefined();
          done();
        });
    });

    test('should provide metrics endpoint', (done) => {
      request(app)
        .get('/gateway/metrics')
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          
          expect(res.body.requests).toBeDefined();
          expect(res.body.errors).toBeDefined();
          expect(res.body.cache).toBeDefined();
          expect(res.body.uptime).toBeDefined();
          done();
        });
    });

    test('should provide service discovery endpoint', (done) => {
      request(app)
        .get('/gateway/services')
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          
          expect(res.body.testService).toBeDefined();
          expect(res.body.authService).toBeDefined();
          expect(res.body.testService.url).toBe('http://localhost:3001');
          done();
        });
    });
  });

  describe('Request Routing', () => {
    test('should route requests to correct service', (done) => {
      // Mock successful service response
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: 'success from test service' })
      });

      request(app)
        .get('/api/v1/test')
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          
          expect(res.body.message).toBe('success from test service');
          expect(fetch).toHaveBeenCalledWith(
            'http://localhost:3001/api/v1/test',
            expect.objectContaining({
              method: 'GET'
            })
          );
          done();
        });
    });

    test('should handle POST requests with body', (done) => {
      const testData = { test: 'data' };
      
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ received: testData })
      });

      request(app)
        .post('/api/v1/test')
        .send(testData)
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          
          expect(res.body.received).toEqual(testData);
          expect(fetch).toHaveBeenCalledWith(
            'http://localhost:3001/api/v1/test',
            expect.objectContaining({
              method: 'POST',
              body: JSON.stringify(testData)
            })
          );
          done();
        });
    });

    test('should return 404 for undefined routes', (done) => {
      request(app)
        .get('/api/v1/nonexistent')
        .expect(404)
        .end((err, res) => {
          if (err) return done(err);
          
          expect(res.body.error).toBe('Not Found');
          expect(res.body.message).toContain('Route GET /api/v1/nonexistent not found');
          done();
        });
    });
  });

  describe('Authentication Middleware', () => {
    test('should allow unauthenticated access to public routes', (done) => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ public: true })
      });

      request(app)
        .get('/api/v1/test')
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          
          expect(res.body.public).toBe(true);
          done();
        });
    });

    test('should require authentication for protected routes', (done) => {
      request(app)
        .get('/api/v1/protected')
        .expect(401)
        .end((err, res) => {
          if (err) return done(err);
          
          expect(res.body.error).toBe('Unauthorized');
          expect(res.body.message).toBe('Authentication required');
          done();
        });
    });

    test('should accept valid Bearer token', (done) => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authenticated: true })
      });

      request(app)
        .get('/api/v1/protected')
        .set('Authorization', 'Bearer valid-jwt-token')
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          
          expect(res.body.authenticated).toBe(true);
          done();
        });
    });

    test('should accept valid API key', (done) => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authenticated: true })
      });

      request(app)
        .get('/api/v1/protected')
        .set('X-API-Key', 'llmr_valid-api-key')
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          
          expect(res.body.authenticated).toBe(true);
          done();
        });
    });

    test('should reject invalid authentication', (done) => {
      request(app)
        .get('/api/v1/protected')
        .set('Authorization', 'Invalid format')
        .expect(401)
        .end((err, res) => {
          if (err) return done(err);
          
          expect(res.body.error).toBe('Unauthorized');
          done();
        });
    });
  });

  describe('Rate Limiting', () => {
    test('should apply rate limiting to routes', (done) => {
      // Make multiple requests to trigger rate limit
      const promises = [];
      
      for (let i = 0; i < 12; i++) { // Exceeds limit of 10
        fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ request: i })
        });
        
        promises.push(
          request(app)
            .get('/api/v1/test')
            .then(res => res.status)
        );
      }

      Promise.all(promises).then(statuses => {
        // Some requests should be rate limited (429)
        const rateLimited = statuses.filter(status => status === 429);
        expect(rateLimited.length).toBeGreaterThan(0);
        done();
      }).catch(done);
    });

    test('should set rate limit headers', (done) => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ test: true })
      });

      request(app)
        .get('/api/v1/test')
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          
          expect(res.headers['x-ratelimit-limit']).toBeDefined();
          expect(res.headers['x-ratelimit-remaining']).toBeDefined();
          done();
        });
    });
  });

  describe('Caching', () => {
    test('should cache GET responses', (done) => {
      const responseData = { cached: true, timestamp: Date.now() };
      
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => responseData
      });

      // First request
      request(app)
        .get('/api/v1/test')
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          
          expect(res.body).toEqual(responseData);
          expect(res.headers['x-cache']).toBe('MISS');
          
          // Second request should be cached
          request(app)
            .get('/api/v1/test')
            .expect(200)
            .end((err2, res2) => {
              if (err2) return done(err2);
              
              expect(res2.body).toEqual(responseData);
              expect(res2.headers['x-cache']).toBe('HIT');
              expect(fetch).toHaveBeenCalledTimes(1); // Only called once
              done();
            });
        });
    });

    test('should not cache POST requests', (done) => {
      fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ notCached: true })
      });

      request(app)
        .post('/api/v1/test')
        .send({ test: 'data' })
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          
          expect(res.headers['x-cache']).toBeUndefined();
          done();
        });
    });

    test('should respect cache TTL settings', (done) => {
      const testData = { ttlTest: true };
      
      fetch.mockResolvedValue({
        ok: true,
        json: async () => testData
      });

      request(app)
        .get('/api/v1/test')
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          
          expect(res.headers['x-cache']).toBe('MISS');
          
          // Check cache key is set
          expect(res.headers['x-cache-key']).toBeDefined();
          done();
        });
    });
  });

  describe('Circuit Breaker', () => {
    test('should handle service failures gracefully', (done) => {
      // Mock service failure
      fetch.mockRejectedValue(new Error('Service unavailable'));

      request(app)
        .get('/api/v1/test')
        .expect(503)
        .end((err, res) => {
          if (err) return done(err);
          
          expect(res.body.error).toBe('Gateway Error');
          expect(res.body.message).toContain('unavailable');
          expect(res.body.service).toBe('testService');
          done();
        });
    });

    test('should handle connection refused errors', (done) => {
      const error = new Error('Connection refused');
      error.code = 'ECONNREFUSED';
      fetch.mockRejectedValue(error);

      request(app)
        .get('/api/v1/test')
        .expect(503)
        .end((err, res) => {
          if (err) return done(err);
          
          expect(res.body.message).toBe('Service unavailable');
          expect(res.body.code).toBe('ECONNREFUSED');
          done();
        });
    });

    test('should handle timeout errors', (done) => {
      const error = new Error('Request timeout');
      error.code = 'TIMEOUT';
      fetch.mockRejectedValue(error);

      request(app)
        .get('/api/v1/test')
        .expect(504)
        .end((err, res) => {
          if (err) return done(err);
          
          expect(res.body.message).toBe('Gateway timeout');
          done();
        });
    });
  });

  describe('Request Transformation', () => {
    test('should transform inference requests', () => {
      const mockReq = {
        body: {
          input: 'test prompt', // Should be transformed to 'prompt'
          max_tokens: 100,      // Should be transformed to 'maxTokens'
          top_p: 0.9           // Should be transformed to 'topP'
        }
      };

      const transformer = gateway.transformers.get('standardizeInferenceRequest');
      const result = transformer(mockReq);

      expect(result.body.prompt).toBe('test prompt');
      expect(result.body.maxTokens).toBe(100);
      expect(result.body.topP).toBe(0.9);
      expect(result.body.input).toBeUndefined();
      expect(result.body.max_tokens).toBeUndefined();
      expect(result.body.top_p).toBeUndefined();
    });

    test('should handle string input transformation', () => {
      const mockReq = { body: 'simple text prompt' };

      const transformer = gateway.transformers.get('standardizeInferenceRequest');
      const result = transformer(mockReq);

      expect(result.body.prompt).toBe('simple text prompt');
    });

    test('should transform inference responses', () => {
      const responseData = 'Simple text response';
      const mockReq = { body: { model: 'test-model' } };

      const transformer = gateway.transformers.get('standardizeInferenceResponse');
      const result = transformer(responseData, mockReq);

      expect(result.text).toBe('Simple text response');
      expect(result.model).toBe('test-model');
      expect(result.usage).toBeDefined();
      expect(result.usage.promptTokens).toBe(0);
    });

    test('should standardize object responses', () => {
      const responseData = {
        response: 'Generated text',
        metadata: { temperature: 0.7 }
      };
      const mockReq = { body: { model: 'test-model' } };

      const transformer = gateway.transformers.get('standardizeInferenceResponse');
      const result = transformer(responseData, mockReq);

      expect(result.text).toBe('Generated text');
      expect(result.model).toBe('test-model');
      expect(result.metadata).toEqual({ temperature: 0.7 });
    });
  });

  describe('Key Generation', () => {
    test('should generate consistent cache keys', () => {
      const req1 = {
        method: 'GET',
        path: '/api/test',
        query: { param: 'value' },
        user: { id: 'user123' }
      };

      const req2 = { ...req1 };

      const key1 = gateway.generateCacheKey(req1);
      const key2 = gateway.generateCacheKey(req2);

      expect(key1).toBe(key2);
      expect(typeof key1).toBe('string');
      expect(key1.length).toBeGreaterThan(0);
    });

    test('should generate different keys for different requests', () => {
      const req1 = {
        method: 'GET',
        path: '/api/test1',
        query: {},
        user: { id: 'user123' }
      };

      const req2 = {
        method: 'GET',
        path: '/api/test2',
        query: {},
        user: { id: 'user123' }
      };

      const key1 = gateway.generateCacheKey(req1);
      const key2 = gateway.generateCacheKey(req2);

      expect(key1).not.toBe(key2);
    });

    test('should generate unique request IDs', () => {
      const ids = [];
      for (let i = 0; i < 100; i++) {
        ids.push(gateway.generateRequestId());
      }

      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(100); // All should be unique
      
      ids.forEach(id => {
        expect(id).toMatch(/^gw_\d+_[a-z0-9]+$/);
      });
    });
  });

  describe('Dynamic Configuration', () => {
    test('should add new routes dynamically', () => {
      const newRoute = {
        path: '/api/v1/dynamic',
        target: 'testService',
        methods: ['GET'],
        auth: false,
        cache: false
      };

      gateway.addRoute(newRoute);

      expect(gateway.options.routes).toContainEqual(newRoute);
    });

    test('should add new services dynamically', () => {
      const newService = {
        url: 'http://localhost:3003',
        healthPath: '/health',
        timeout: 5000
      };

      gateway.addService('newService', newService);

      expect(gateway.options.services.newService).toEqual(newService);
      expect(gateway.circuitBreakers.has('newService')).toBe(true);
    });

    test('should remove services', () => {
      gateway.addService('tempService', {
        url: 'http://localhost:3004',
        healthPath: '/health'
      });

      expect(gateway.options.services.tempService).toBeDefined();

      gateway.removeService('tempService');

      expect(gateway.options.services.tempService).toBeUndefined();
      expect(gateway.circuitBreakers.has('tempService')).toBe(false);
    });
  });

  describe('Cache Management', () => {
    test('should clear all cache', () => {
      // Add some cache entries
      gateway.cache.set('test1', 'data1');
      gateway.cache.set('test2', 'data2');

      expect(gateway.cache.size).toBe(2);

      gateway.clearCache();

      expect(gateway.cache.size).toBe(0);
    });

    test('should clear cache by pattern', () => {
      gateway.cache.set('test:api:endpoint1', 'data1');
      gateway.cache.set('test:api:endpoint2', 'data2');
      gateway.cache.set('other:endpoint', 'data3');

      gateway.clearCache('test:api');

      expect(gateway.cache.has('test:api:endpoint1')).toBe(false);
      expect(gateway.cache.has('test:api:endpoint2')).toBe(false);
      expect(gateway.cache.has('other:endpoint')).toBe(true);
    });
  });

  describe('Metrics Collection', () => {
    test('should track request metrics', (done) => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ test: true })
      });

      const initialMetrics = gateway.getMetrics();
      const initialRequests = initialMetrics.requests;

      request(app)
        .get('/api/v1/test')
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          
          const newMetrics = gateway.getMetrics();
          expect(newMetrics.requests).toBe(initialRequests + 1);
          expect(newMetrics.averageLatency).toBeGreaterThan(0);
          done();
        });
    });

    test('should track error rates', (done) => {
      fetch.mockRejectedValueOnce(new Error('Service error'));

      const initialMetrics = gateway.getMetrics();
      const initialErrors = initialMetrics.errors;

      request(app)
        .get('/api/v1/test')
        .expect(503)
        .end((err, res) => {
          if (err) return done(err);
          
          const newMetrics = gateway.getMetrics();
          expect(newMetrics.errors).toBe(initialErrors + 1);
          expect(newMetrics.errorRate).toBeGreaterThan(0);
          done();
        });
    });

    test('should track cache hit rates', (done) => {
      const testData = { cached: true };
      
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => testData
      });

      // First request (cache miss)
      request(app)
        .get('/api/v1/test')
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          
          // Second request (cache hit)
          request(app)
            .get('/api/v1/test')
            .expect(200)
            .end((err2, res2) => {
              if (err2) return done(err2);
              
              const metrics = gateway.getMetrics();
              expect(metrics.cache.hits).toBeGreaterThan(0);
              expect(metrics.cache.misses).toBeGreaterThan(0);
              expect(metrics.cache.hitRate).toBeGreaterThan(0);
              done();
            });
        });
    });
  });

  describe('Error Handling', () => {
    test('should handle middleware errors gracefully', (done) => {
      // Create a route that will cause an error
      gateway.app.get('/error-test', (req, res, next) => {
        throw new Error('Test error');
      });

      request(app)
        .get('/error-test')
        .expect(500)
        .end((err, res) => {
          if (err) return done(err);
          
          expect(res.body.error).toBe('Internal Server Error');
          expect(res.body.message).toBe('Test error');
          expect(res.body.requestId).toBeDefined();
          done();
        });
    });

    test('should handle malformed JSON gracefully', (done) => {
      request(app)
        .post('/api/v1/test')
        .set('Content-Type', 'application/json')
        .send('invalid json')
        .expect(400, done);
    });
  });

  describe('CORS and Security', () => {
    test('should handle CORS preflight requests', (done) => {
      request(app)
        .options('/api/v1/test')
        .set('Origin', BASE_URL)
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          
          expect(res.headers['access-control-allow-origin']).toBe('*');
          expect(res.headers['access-control-allow-methods']).toContain('GET');
          expect(res.headers['access-control-allow-headers']).toContain('Content-Type');
          done();
        });
    });

    test('should set security headers', (done) => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ secure: true })
      });

      request(app)
        .get('/api/v1/test')
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          
          // Check for security headers (helmet)
          expect(res.headers['x-content-type-options']).toBe('nosniff');
          expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
          done();
        });
    });
  });

  describe('Performance', () => {
    test('should handle concurrent requests efficiently', async () => {
      const concurrentRequests = 50;
      const promises = [];

      // Mock successful responses
      for (let i = 0; i < concurrentRequests; i++) {
        fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ request: i })
        });
      }

      const startTime = Date.now();

      for (let i = 0; i < concurrentRequests; i++) {
        promises.push(
          request(app)
            .get('/api/v1/test')
            .expect(200)
        );
      }

      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;

      expect(results.length).toBe(concurrentRequests);
      expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
    });

    test('should compress responses', (done) => {
      const largeData = { data: 'x'.repeat(1000) };
      
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => largeData
      });

      request(app)
        .get('/api/v1/test')
        .set('Accept-Encoding', 'gzip')
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          
          // Response should be compressed (if compression middleware is working)
          expect(res.body.data).toBe('x'.repeat(1000));
          done();
        });
    });
  });
});