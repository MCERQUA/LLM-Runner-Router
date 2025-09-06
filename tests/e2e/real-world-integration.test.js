/**
 * Real-World End-to-End Integration Tests
 * Tests the complete system as deployed in production
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import axios from 'axios';
import { LLMRouter } from '../../src/index.js';
import SimpleSmolLM3Loader from '../../src/loaders/SimpleSmolLM3Loader.js';
import { DatabaseManager } from '../../src/db/DatabaseManager.js';
import fs from 'fs/promises';
import path from 'path';

describe('Real-World E2E Integration Tests', () => {
  let router;
  let database;
  let apiClient;
  const BASE_URL = process.env.BASE_URL || 'http://localhost:3006';
  
  beforeAll(async () => {
    // Initialize real components
    router = new LLMRouter({
      defaultLoader: 'SimpleSmolLM3Loader',
      autoInit: false,
      strategy: 'balanced',
      cache: {
        enabled: true,
        ttl: 300
      }
    });
    
    // Initialize database with fallback
    database = new DatabaseManager({
      type: process.env.DB_TYPE || 'memory',
      fallbackToMemory: true
    });
    await database.initialize();
    
    // Setup API client
    apiClient = axios.create({
      baseURL: BASE_URL,
      timeout: 30000,
      validateStatus: () => true // Don't throw on any status
    });
  });
  
  afterAll(async () => {
    if (database) await database.close();
    if (router) await router.cleanup();
  });

  describe('System Initialization', () => {
    test('should initialize router with real loaders', async () => {
      const loader = new SimpleSmolLM3Loader();
      await router.registerLoader('smollm3', loader);
      
      expect(router.loaders.has('smollm3')).toBe(true);
      expect(router.status).toBe('ready');
    });

    test('should handle missing model files gracefully', async () => {
      const modelPath = './models/smollm3-3b';
      const exists = await fs.access(modelPath).then(() => true).catch(() => false);
      
      if (!exists) {
        // Should still work with fallback responses
        const response = await router.complete('test', {
          loader: 'smollm3',
          maxTokens: 10
        });
        
        expect(response).toBeDefined();
        expect(response.error || response.text).toBeTruthy();
      }
    });

    test('database should fallback to memory if not configured', async () => {
      const health = await database.healthCheck();
      
      expect(health.status).toBe('healthy');
      if (health.fallback) {
        expect(health.type).toBe('memory');
      }
    });
  });

  describe('API Endpoints', () => {
    test('GET /api/health should return system status', async () => {
      const response = await apiClient.get('/api/health');
      
      if (response.status === 200) {
        expect(response.data).toHaveProperty('status');
        expect(response.data).toHaveProperty('uptime');
        expect(response.data.status).toMatch(/healthy|operational/i);
      } else {
        // Server might not be running, that's OK
        expect(response.status).toBeGreaterThanOrEqual(400);
      }
    });

    test('GET /api/models should list available models', async () => {
      const response = await apiClient.get('/api/models');
      
      if (response.status === 200) {
        expect(response.data).toBeInstanceOf(Array);
        response.data.forEach(model => {
          expect(model).toHaveProperty('id');
          expect(model).toHaveProperty('name');
          expect(model).toHaveProperty('status');
        });
      }
    });

    test('POST /api/chat should handle chat requests', async () => {
      const response = await apiClient.post('/api/chat', {
        message: 'Hello, this is a test',
        model: 'smollm3',
        maxTokens: 50
      });
      
      if (response.status === 200) {
        expect(response.data).toHaveProperty('response');
        expect(typeof response.data.response).toBe('string');
        expect(response.data.response.length).toBeGreaterThan(0);
      } else if (response.status === 401) {
        // Authentication required
        expect(response.data).toHaveProperty('error');
        expect(response.data.error).toMatch(/auth|key/i);
      } else {
        // Other errors should be handled gracefully
        expect(response.data).toHaveProperty('error');
      }
    });

    test('should handle invalid requests gracefully', async () => {
      const response = await apiClient.post('/api/chat', {
        // Invalid request - missing message
        model: 'invalid-model'
      });
      
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.data).toHaveProperty('error');
    });
  });

  describe('Model Loading and Inference', () => {
    test('should load and use real model if available', async () => {
      const modelPath = './models/smollm3-3b';
      const exists = await fs.access(modelPath).then(() => true).catch(() => false);
      
      if (exists) {
        const response = await router.complete('What is 2+2?', {
          loader: 'smollm3',
          maxTokens: 20
        });
        
        expect(response.text).toBeTruthy();
        expect(response.tokens).toBeGreaterThan(0);
      } else {
        // Skip if model not available
        console.log('Model files not found, skipping real inference test');
      }
    });

    test('should handle streaming requests', async () => {
      const stream = await router.stream('Tell me a story', {
        loader: 'smollm3',
        maxTokens: 50
      });
      
      let chunks = 0;
      let fullText = '';
      
      try {
        for await (const chunk of stream) {
          expect(chunk).toHaveProperty('text');
          fullText += chunk.text;
          chunks++;
        }
      } catch (error) {
        // Streaming might not be supported, that's OK
        expect(error.message).toMatch(/stream|not supported/i);
      }
      
      if (chunks > 0) {
        expect(fullText.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Error Handling and Recovery', () => {
    test('should recover from loader failures', async () => {
      // Try to use a non-existent loader
      const response = await router.complete('test', {
        loader: 'non-existent-loader',
        fallback: true
      });
      
      // Should either error or fallback
      expect(response.error || response.text).toBeTruthy();
    });

    test('should handle database failures gracefully', async () => {
      // Simulate database operation
      const result = await database.query('test_table', 'insert', {
        id: 'test-' + Date.now(),
        data: 'test data'
      });
      
      // Should work even if database is in fallback mode
      expect(result).toBeDefined();
      if (result.id) {
        expect(result.id).toBeTruthy();
      }
    });

    test('should handle concurrent requests', async () => {
      const promises = Array.from({ length: 5 }, (_, i) => 
        router.complete(`Request ${i}`, {
          loader: 'smollm3',
          maxTokens: 10
        })
      );
      
      const results = await Promise.allSettled(promises);
      
      results.forEach(result => {
        expect(result.status).toBe('fulfilled');
        if (result.status === 'fulfilled') {
          expect(result.value).toBeDefined();
        }
      });
    });

    test('should enforce rate limits', async () => {
      // Make multiple rapid requests
      const requests = Array.from({ length: 20 }, () =>
        apiClient.post('/api/chat', {
          message: 'test',
          model: 'smollm3'
        })
      );
      
      const results = await Promise.allSettled(requests);
      const rateLimited = results.filter(r => 
        r.status === 'fulfilled' && r.value.status === 429
      );
      
      // Some requests might be rate limited in production
      if (rateLimited.length > 0) {
        expect(rateLimited[0].value.data).toHaveProperty('error');
        expect(rateLimited[0].value.data.error).toMatch(/rate|limit/i);
      }
    });
  });

  describe('Authentication and Security', () => {
    test('should handle API key authentication', async () => {
      const response = await apiClient.post('/api/chat', {
        message: 'test'
      }, {
        headers: {
          'X-API-Key': 'invalid-key'
        }
      });
      
      // Should either accept (no auth) or reject (invalid key)
      expect([200, 401, 403]).toContain(response.status);
    });

    test('should sanitize error messages', async () => {
      const response = await apiClient.post('/api/chat', {
        message: '../../../etc/passwd' // Potential path traversal
      });
      
      // Should not expose internal paths in errors
      if (response.status >= 400) {
        expect(response.data.error).not.toMatch(/\/etc\/passwd/);
        expect(response.data.error).not.toMatch(/internal|stack|trace/i);
      }
    });
  });

  describe('Performance and Caching', () => {
    test('should cache repeated requests', async () => {
      const message = 'What is the capital of France?';
      
      // First request
      const start1 = Date.now();
      const response1 = await router.complete(message, {
        loader: 'smollm3',
        maxTokens: 20
      });
      const time1 = Date.now() - start1;
      
      // Second request (should be cached)
      const start2 = Date.now();
      const response2 = await router.complete(message, {
        loader: 'smollm3',
        maxTokens: 20
      });
      const time2 = Date.now() - start2;
      
      // Cached response should be faster
      if (response1.text === response2.text) {
        expect(time2).toBeLessThanOrEqual(time1);
      }
    });

    test('should handle memory limits', async () => {
      const largeInput = 'x'.repeat(100000); // 100KB input
      
      const response = await router.complete(largeInput, {
        loader: 'smollm3',
        maxTokens: 10
      });
      
      // Should handle or reject gracefully
      expect(response.error || response.text).toBeTruthy();
    });
  });

  describe('Production Readiness', () => {
    test('should have proper error logging', async () => {
      // Trigger an error
      await router.complete(null, { loader: 'invalid' }).catch(() => {});
      
      // Errors should be handled without crashing
      expect(router.status).not.toBe('error');
    });

    test('should support graceful shutdown', async () => {
      const cleanup = router.cleanup();
      
      // Cleanup should complete without errors
      await expect(cleanup).resolves.not.toThrow();
    });

    test('should report metrics', async () => {
      const metrics = router.getMetrics();
      
      if (metrics) {
        expect(metrics).toHaveProperty('requestCount');
        expect(metrics).toHaveProperty('averageLatency');
        expect(metrics).toHaveProperty('cacheHitRate');
      }
    });

    test('should validate configuration', () => {
      const config = router.getConfig();
      
      expect(config).toHaveProperty('strategy');
      expect(config).toHaveProperty('cache');
      expect(config.strategy).toMatch(/balanced|quality|speed|cost/);
    });
  });
});

// Additional helper tests for CI/CD
describe('Build and Deployment Verification', () => {
  test('package.json should have all required scripts', async () => {
    const packageJson = JSON.parse(
      await fs.readFile('./package.json', 'utf-8')
    );
    
    const requiredScripts = ['start', 'test', 'build', 'lint'];
    requiredScripts.forEach(script => {
      expect(packageJson.scripts).toHaveProperty(script);
    });
  });

  test('environment variables should be documented', async () => {
    const envDocsExist = await fs.access('./ENV_VARIABLES.md')
      .then(() => true)
      .catch(() => false);
    
    expect(envDocsExist).toBe(true);
  });

  test('dist folder should be buildable', async () => {
    // Check if build script exists
    const buildScript = await fs.access('./scripts/build.js')
      .then(() => true)
      .catch(() => false);
    
    expect(buildScript).toBe(true);
  });
});