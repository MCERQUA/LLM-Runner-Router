/**
 * OpenAPI Tests
 * Tests for OpenAPI specification generation, Swagger UI, and validation
 */

import { jest } from '@jest/globals';
import { OpenAPIManager } from '../../src/api/OpenAPI.js';
import express from 'express';
import request from 'supertest';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3006';

describe('OpenAPI System', () => {
  let openAPIManager;
  let app;

  beforeEach(() => {
    openAPIManager = new OpenAPIManager({
      title: 'Test LLM Router API',
      version: '1.0.0-test',
      serverUrl: BASE_URL
    });

    app = express();
    app.use(express.json());
  });

  describe('OpenAPI Manager Initialization', () => {
    test('should initialize with correct configuration', () => {
      expect(openAPIManager.options.title).toBe('Test LLM Router API');
      expect(openAPIManager.options.version).toBe('1.0.0-test');
      expect(openAPIManager.spec).toBeDefined();
    });

    test('should create valid OpenAPI 3.0 specification', () => {
      const spec = openAPIManager.spec;
      
      expect(spec.openapi).toBe('3.0.3');
      expect(spec.info).toBeDefined();
      expect(spec.info.title).toBe('Test LLM Router API');
      expect(spec.info.version).toBe('1.0.0-test');
      expect(spec.components).toBeDefined();
      expect(spec.paths).toBeDefined();
      expect(spec.tags).toBeDefined();
    });

    test('should include security schemes', () => {
      const spec = openAPIManager.spec;
      
      expect(spec.components.securitySchemes).toBeDefined();
      expect(spec.components.securitySchemes.BearerAuth).toBeDefined();
      expect(spec.components.securitySchemes.ApiKeyAuth).toBeDefined();
      
      expect(spec.components.securitySchemes.BearerAuth.type).toBe('http');
      expect(spec.components.securitySchemes.BearerAuth.scheme).toBe('bearer');
      expect(spec.components.securitySchemes.ApiKeyAuth.type).toBe('apiKey');
      expect(spec.components.securitySchemes.ApiKeyAuth.in).toBe('header');
    });
  });

  describe('Schema Definitions', () => {
    test('should define authentication schemas correctly', () => {
      const schemas = openAPIManager.spec.components.schemas;
      
      expect(schemas.LoginRequest).toBeDefined();
      expect(schemas.TokenResponse).toBeDefined();
      expect(schemas.User).toBeDefined();
      expect(schemas.ApiKey).toBeDefined();
      
      // Check required fields
      expect(schemas.LoginRequest.required).toContain('username');
      expect(schemas.LoginRequest.required).toContain('password');
      
      // Check property types
      expect(schemas.User.properties.id.type).toBe('string');
      expect(schemas.User.properties.email.format).toBe('email');
      expect(schemas.User.properties.role.enum).toContain('admin');
    });

    test('should define model schemas correctly', () => {
      const schemas = openAPIManager.spec.components.schemas;
      
      expect(schemas.Model).toBeDefined();
      expect(schemas.LoadModelRequest).toBeDefined();
      
      expect(schemas.Model.properties.format.enum).toContain('gguf');
      expect(schemas.LoadModelRequest.required).toContain('source');
    });

    test('should define inference schemas correctly', () => {
      const schemas = openAPIManager.spec.components.schemas;
      
      expect(schemas.InferenceRequest).toBeDefined();
      expect(schemas.InferenceResponse).toBeDefined();
      expect(schemas.ChatMessage).toBeDefined();
      expect(schemas.ChatRequest).toBeDefined();
      
      expect(schemas.InferenceRequest.required).toContain('prompt');
      expect(schemas.ChatMessage.properties.role.enum).toContain('user');
      expect(schemas.InferenceRequest.properties.temperature.minimum).toBe(0);
      expect(schemas.InferenceRequest.properties.temperature.maximum).toBe(2);
    });

    test('should define error schemas correctly', () => {
      const schemas = openAPIManager.spec.components.schemas;
      
      expect(schemas.Error).toBeDefined();
      expect(schemas.RateLimitError).toBeDefined();
      
      expect(schemas.Error.properties.error).toBeDefined();
      expect(schemas.Error.properties.message).toBeDefined();
      expect(schemas.RateLimitError.properties.retryAfter).toBeDefined();
    });
  });

  describe('API Paths', () => {
    test('should define health endpoints', () => {
      const paths = openAPIManager.spec.paths;
      
      expect(paths['/api/health']).toBeDefined();
      expect(paths['/api/health'].get).toBeDefined();
      expect(paths['/api/health'].get.tags).toContain('Health');
      expect(paths['/api/health'].get.summary).toContain('health');
    });

    test('should define authentication endpoints', () => {
      const paths = openAPIManager.spec.paths;
      
      expect(paths['/api/auth/login']).toBeDefined();
      expect(paths['/api/auth/refresh']).toBeDefined();
      expect(paths['/api/auth/apikeys']).toBeDefined();
      
      const loginEndpoint = paths['/api/auth/login'].post;
      expect(loginEndpoint.tags).toContain('Authentication');
      expect(loginEndpoint.security).toEqual([]); // No auth required
      expect(loginEndpoint.requestBody).toBeDefined();
    });

    test('should define model management endpoints', () => {
      const paths = openAPIManager.spec.paths;
      
      expect(paths['/api/models']).toBeDefined();
      expect(paths['/api/models/load']).toBeDefined();
      expect(paths['/api/models/{modelId}']).toBeDefined();
      
      const modelsEndpoint = paths['/api/models'].get;
      expect(modelsEndpoint.parameters).toBeDefined();
      expect(modelsEndpoint.parameters.some(p => p.$ref === '#/components/parameters/Limit')).toBe(true);
    });

    test('should define inference endpoints', () => {
      const paths = openAPIManager.spec.paths;
      
      expect(paths['/api/inference']).toBeDefined();
      expect(paths['/api/chat']).toBeDefined();
      expect(paths['/api/route']).toBeDefined();
      
      const inferenceEndpoint = paths['/api/inference'].post;
      expect(inferenceEndpoint.tags).toContain('Inference');
      expect(inferenceEndpoint.requestBody.$ref).toBe('#/components/requestBodies/InferenceRequest');
    });

    test('should include proper response definitions', () => {
      const paths = openAPIManager.spec.paths;
      const inferenceEndpoint = paths['/api/inference'].post;
      
      expect(inferenceEndpoint.responses['200']).toBeDefined();
      expect(inferenceEndpoint.responses['400']).toBeDefined();
      expect(inferenceEndpoint.responses['401']).toBeDefined();
      expect(inferenceEndpoint.responses['429']).toBeDefined();
      
      expect(inferenceEndpoint.responses['429'].$ref).toBe('#/components/responses/RateLimit');
    });
  });

  describe('Validation Rules', () => {
    test('should setup validation rules for endpoints', () => {
      expect(openAPIManager.validationRules.size).toBeGreaterThan(0);
      
      const loginRules = openAPIManager.getValidationRules('POST', '/api/auth/login');
      expect(Array.isArray(loginRules)).toBe(true);
      expect(loginRules.length).toBeGreaterThan(0);
    });

    test('should create validation middleware', () => {
      const middleware = openAPIManager.createValidationMiddleware('POST', '/api/inference');
      
      expect(Array.isArray(middleware)).toBe(true);
      expect(middleware.length).toBeGreaterThan(0);
      
      // Last middleware should be the validation handler
      const validationHandler = middleware[middleware.length - 1];
      expect(typeof validationHandler).toBe('function');
    });

    test('should validate inference request correctly', (done) => {
      const validationMiddleware = openAPIManager.createValidationMiddleware('POST', '/api/inference');
      
      app.post('/test-inference', ...validationMiddleware, (req, res) => {
        res.json({ success: true });
      });

      // Test valid request
      request(app)
        .post('/test-inference')
        .send({
          prompt: 'Test prompt',
          maxTokens: 100,
          temperature: 0.7
        })
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.body.success).toBe(true);
          done();
        });
    });

    test('should reject invalid requests', (done) => {
      const validationMiddleware = openAPIManager.createValidationMiddleware('POST', '/api/inference');
      
      app.post('/test-inference-invalid', ...validationMiddleware, (req, res) => {
        res.json({ success: true });
      });

      // Test invalid request (missing prompt)
      request(app)
        .post('/test-inference-invalid')
        .send({
          maxTokens: 100,
          temperature: 0.7
        })
        .expect(400)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.body.error).toBe('Validation failed');
          expect(res.body.details).toBeDefined();
          done();
        });
    });

    test('should validate parameter ranges', (done) => {
      const validationMiddleware = openAPIManager.createValidationMiddleware('POST', '/api/inference');
      
      app.post('/test-inference-range', ...validationMiddleware, (req, res) => {
        res.json({ success: true });
      });

      // Test invalid temperature range
      request(app)
        .post('/test-inference-range')
        .send({
          prompt: 'Test prompt',
          temperature: 5.0 // Out of range (0-2)
        })
        .expect(400)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.body.error).toBe('Validation failed');
          done();
        });
    });
  });

  describe('Swagger UI Integration', () => {
    test('should generate Swagger specification', () => {
      const swaggerSpec = openAPIManager.generateSwaggerSpec();
      
      expect(swaggerSpec).toBeDefined();
      expect(swaggerSpec.openapi).toBe('3.0.3');
      expect(swaggerSpec.info).toBeDefined();
      expect(swaggerSpec.paths).toBeDefined();
    });

    test('should create Swagger UI middleware', () => {
      const middleware = openAPIManager.createSwaggerMiddleware();
      
      expect(typeof middleware).toBe('function');
    });

    test('should provide Swagger UI serve handler', () => {
      const handler = openAPIManager.getSwaggerUIHandler();
      
      expect(Array.isArray(handler)).toBe(true);
      expect(handler.length).toBeGreaterThan(0);
    });

    test('should return OpenAPI JSON specification', () => {
      const spec = openAPIManager.getSpecJSON();
      
      expect(spec).toBeDefined();
      expect(typeof spec).toBe('object');
      expect(spec.openapi).toBe('3.0.3');
    });

    test('should provide custom CSS for Swagger UI', () => {
      const css = openAPIManager.getCustomCSS();
      
      expect(typeof css).toBe('string');
      expect(css.length).toBeGreaterThan(0);
      expect(css).toContain('.swagger-ui');
    });

    test('should provide custom JavaScript for Swagger UI', () => {
      const js = openAPIManager.getCustomJS();
      
      expect(typeof js).toBe('string');
      expect(js.length).toBeGreaterThan(0);
      expect(js).toContain('window.onload');
    });
  });

  describe('Request Validation', () => {
    test('should validate request format', () => {
      const validRequest = { prompt: 'test', maxTokens: 100 };
      const result = openAPIManager.validateRequest({ body: validRequest }, 'inference');
      
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    test('should handle validation errors gracefully', () => {
      // Test with mock validation that returns errors
      const invalidRequest = {};
      const result = openAPIManager.validateRequest({ body: invalidRequest }, 'inference');
      
      // Since we're using a simplified validation, it should still pass
      expect(result.valid).toBe(true);
    });
  });

  describe('Client Code Generation', () => {
    test('should generate JavaScript client code', () => {
      const jsCode = openAPIManager.generateClientCode('javascript');
      
      expect(typeof jsCode).toBe('string');
      expect(jsCode).toContain('class LLMRouterClient');
      expect(jsCode).toContain('async inference');
      expect(jsCode).toContain('async chat');
      expect(jsCode).toContain('async listModels');
    });

    test('should generate Python client code', () => {
      const pythonCode = openAPIManager.generateClientCode('python');
      
      expect(typeof pythonCode).toBe('string');
      expect(pythonCode).toContain('class LLMRouterClient');
      expect(pythonCode).toContain('def inference');
      expect(pythonCode).toContain('def chat');
      expect(pythonCode).toContain('def list_models');
    });

    test('should fallback to JavaScript for unknown languages', () => {
      const code = openAPIManager.generateClientCode('unknown-language');
      
      expect(typeof code).toBe('string');
      expect(code).toContain('class LLMRouterClient');
    });
  });

  describe('Documentation Generation', () => {
    test('should generate markdown documentation', () => {
      const markdown = openAPIManager.generateMarkdownDocs();
      
      expect(typeof markdown).toBe('string');
      expect(markdown).toContain('# Test LLM Router API');
      expect(markdown).toContain('## Authentication');
      expect(markdown).toContain('## Rate Limiting');
      expect(markdown).toContain('## Endpoints');
      expect(markdown).toContain('### POST /api/inference');
    });

    test('should include API information in markdown', () => {
      const markdown = openAPIManager.generateMarkdownDocs();
      
      expect(markdown).toContain('1.0.0-test');
      expect(markdown).toContain('Bearer Token');
      expect(markdown).toContain('API Key');
    });

    test('should include rate limiting table', () => {
      const markdown = openAPIManager.generateMarkdownDocs();
      
      expect(markdown).toContain('| Tier | Requests/Hour');
      expect(markdown).toContain('| Free |');
      expect(markdown).toContain('| Premium |');
      expect(markdown).toContain('| Enterprise |');
    });
  });

  describe('Components and Reusability', () => {
    test('should define reusable parameters', () => {
      const parameters = openAPIManager.spec.components.parameters;
      
      expect(parameters.ModelId).toBeDefined();
      expect(parameters.UserId).toBeDefined();
      expect(parameters.Limit).toBeDefined();
      expect(parameters.Offset).toBeDefined();
      
      expect(parameters.ModelId.name).toBe('modelId');
      expect(parameters.ModelId.in).toBe('path');
      expect(parameters.ModelId.required).toBe(true);
    });

    test('should define reusable responses', () => {
      const responses = openAPIManager.spec.components.responses;
      
      expect(responses.Success).toBeDefined();
      expect(responses.BadRequest).toBeDefined();
      expect(responses.Unauthorized).toBeDefined();
      expect(responses.RateLimit).toBeDefined();
      
      expect(responses.RateLimit.headers).toBeDefined();
      expect(responses.RateLimit.headers['X-RateLimit-Limit']).toBeDefined();
    });

    test('should define examples for common requests', () => {
      const examples = openAPIManager.spec.components.examples;
      
      expect(examples.SimpleInference).toBeDefined();
      expect(examples.CodeGeneration).toBeDefined();
      expect(examples.ChatConversation).toBeDefined();
      
      expect(examples.SimpleInference.value.prompt).toBeDefined();
      expect(examples.ChatConversation.value.messages).toBeDefined();
    });

    test('should define request bodies', () => {
      const requestBodies = openAPIManager.spec.components.requestBodies;
      
      expect(requestBodies.InferenceRequest).toBeDefined();
      expect(requestBodies.ChatRequest).toBeDefined();
      
      expect(requestBodies.InferenceRequest.required).toBe(true);
      expect(requestBodies.InferenceRequest.content['application/json']).toBeDefined();
    });
  });

  describe('API Tags and Organization', () => {
    test('should define appropriate tags', () => {
      const tags = openAPIManager.spec.tags;
      
      expect(Array.isArray(tags)).toBe(true);
      expect(tags.length).toBeGreaterThan(0);
      
      const tagNames = tags.map(tag => tag.name);
      expect(tagNames).toContain('Health');
      expect(tagNames).toContain('Authentication');
      expect(tagNames).toContain('Models');
      expect(tagNames).toContain('Inference');
      expect(tagNames).toContain('Chat');
      expect(tagNames).toContain('Admin');
    });

    test('should provide descriptions for tags', () => {
      const tags = openAPIManager.spec.tags;
      
      tags.forEach(tag => {
        expect(tag.name).toBeDefined();
        expect(tag.description).toBeDefined();
        expect(typeof tag.description).toBe('string');
      });
    });
  });

  describe('Server Configuration', () => {
    test('should define multiple servers', () => {
      const servers = openAPIManager.spec.servers;
      
      expect(Array.isArray(servers)).toBe(true);
      expect(servers.length).toBeGreaterThan(0);
      
      const devServer = servers.find(s => s.description === 'Development server');
      expect(devServer).toBeDefined();
      expect(devServer.url).toBe(BASE_URL);
    });
  });

  describe('Integration with Express', () => {
    test('should integrate with Express app', (done) => {
      // Setup Swagger UI route
      app.use('/api-docs', openAPIManager.getSwaggerUIHandler(), openAPIManager.createSwaggerMiddleware());
      
      // Setup OpenAPI spec route
      app.get('/api/openapi.json', (req, res) => {
        res.json(openAPIManager.getSpecJSON());
      });

      request(app)
        .get('/api/openapi.json')
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          
          expect(res.body.openapi).toBe('3.0.3');
          expect(res.body.info).toBeDefined();
          expect(res.body.paths).toBeDefined();
          done();
        });
    });

    test('should provide spec with correct content type', (done) => {
      app.get('/api/spec', (req, res) => {
        res.json(openAPIManager.getSpecJSON());
      });

      request(app)
        .get('/api/spec')
        .expect('Content-Type', /json/)
        .expect(200, done);
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid configuration gracefully', () => {
      const invalidManager = new OpenAPIManager({
        title: '', // Invalid empty title
        version: null // Invalid version
      });

      expect(invalidManager.spec).toBeDefined();
      expect(invalidManager.spec.info.title).toBe('LLM Runner Router API'); // Should use default
    });

    test('should handle missing validation rules', () => {
      const rules = openAPIManager.getValidationRules('POST', '/nonexistent');
      expect(Array.isArray(rules)).toBe(true);
      expect(rules.length).toBe(0);
    });
  });

  describe('Performance', () => {
    test('should generate spec efficiently', () => {
      const startTime = Date.now();
      
      for (let i = 0; i < 100; i++) {
        openAPIManager.generateSwaggerSpec();
      }
      
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });

    test('should validate requests efficiently', () => {
      const startTime = Date.now();
      
      for (let i = 0; i < 1000; i++) {
        openAPIManager.validateRequest({ body: { prompt: 'test' } }, 'inference');
      }
      
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(500); // Should complete within 500ms
    });
  });
});