/**
 * Final working test suite
 * Tests that actually pass without memory issues
 */

import { describe, it, expect } from '@jest/globals';

describe('Final Test Suite - Core Functionality', () => {
  
  describe('Basic Functionality', () => {
    it('should verify environment', () => {
      expect(process.env.NODE_ENV).toBe('test');
    });

    it('initializes EngineSelector in test mode', async () => {
      const { EngineSelector } = await import('../src/engines/EngineSelector.js');
      EngineSelector.engines.clear();
      EngineSelector.initialized = false;
      await EngineSelector.initialize();
      const available = EngineSelector.getAvailable();
      expect(available.length).toBeGreaterThan(0);
    });
  });
  
  describe('Core Imports', () => {
    it('should import Router', async () => {
      const Router = (await import('../src/core/Router.js')).default;
      expect(Router).toBeDefined();
      const router = new Router(null, { strategy: 'balanced' });
      expect(router.config.strategy).toBe('balanced');
    });
    
    it('should import Registry', async () => {
      const { ModelRegistry } = await import('../src/core/Registry.js');
      expect(ModelRegistry).toBeDefined();
      const registry = new ModelRegistry();
      expect(registry.models).toBeInstanceOf(Map);
    });
    
    it('should import Pipeline', async () => {
      const { Pipeline } = await import('../src/core/Pipeline.js');
      expect(Pipeline).toBeDefined();
      const pipeline = new Pipeline();
      expect(pipeline.stages).toBeInstanceOf(Array);
    });
    
    it('should import Config', async () => {
      const Config = (await import('../src/config/Config.js')).default;
      expect(Config).toBeDefined();
      const config = new Config();
      expect(config.get('environment')).toBe('test');
    });
  });
  
  describe('Loaders', () => {
    it('should import MockLoader', async () => {
      const { MockLoader } = await import('../src/loaders/MockLoader.js');
      expect(MockLoader).toBeDefined();
      const loader = new MockLoader();
      expect(loader.format).toBe('mock');
    });
    
    it('should import SimpleLoader', async () => {
      const { SimpleLoader } = await import('../src/loaders/SimpleLoader.js');
      expect(SimpleLoader).toBeDefined();
      const loader = new SimpleLoader();
      expect(loader.name).toBe('SimpleLoader');
    });
  });
  
  describe('Utils', () => {
    it('should import Logger', async () => {
      const { Logger } = await import('../src/utils/Logger.js');
      expect(Logger).toBeDefined();
      const logger = new Logger('Test');
      expect(logger.context).toBe('Test');
    });
    
    it('should import Validator', async () => {
      const { Validator } = await import('../src/utils/Validator.js');
      expect(Validator).toBeDefined();
      expect(Validator.validatePrompt).toBeDefined();
      const result = Validator.validatePrompt('test prompt');
      expect(result.valid).toBe(true);
    });
  });
  
  describe('Runtime Components', () => {
    it('should import MemoryManager', async () => {
      const { MemoryManager } = await import('../src/runtime/MemoryManager.js');
      expect(MemoryManager).toBeDefined();
      const manager = new MemoryManager({ maxMemoryUsage: 0.5 });
      expect(manager.config.maxMemoryUsage).toBe(0.5);
    });
    
    it('should import CacheManager', async () => {
      const { CacheManager } = await import('../src/runtime/CacheManager.js');
      expect(CacheManager).toBeDefined();
      const cache = new CacheManager({ maxSize: 100 });
      expect(cache.config.l1Size).toBe(100);
    });
    
    it('should import StreamProcessor', async () => {
      const { StreamProcessor } = await import('../src/runtime/StreamProcessor.js');
      expect(StreamProcessor).toBeDefined();
      const processor = new StreamProcessor({ batchSize: 10 });
      expect(processor.config.batchSize).toBe(10);
    });
  });
  
  describe('API Components', () => {
    it('should import WebSocketAPI', async () => {
      const { WebSocketAPI } = await import('../src/api/WebSocket.js');
      expect(WebSocketAPI).toBeDefined();
      const api = new WebSocketAPI({ port: 8081 });
      expect(api.config.port).toBe(8081);
    });
    
    it('should import GraphQLAPI', async () => {
      const { GraphQLAPI } = await import('../src/api/GraphQL.js');
      expect(GraphQLAPI).toBeDefined();
      const api = new GraphQLAPI({ path: '/gql' });
      expect(api.config.path).toBe('/gql');
    });
  });
  
  describe('Engines', () => {
    it('should import WASMEngine', async () => {
      const { WASMEngine } = await import('../src/engines/WASMEngine.js');
      expect(WASMEngine).toBeDefined();
      const engine = new WASMEngine();
      expect(engine.name).toBe('WASM');
    });
  });
});