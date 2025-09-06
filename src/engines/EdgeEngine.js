/**
 * Edge Engine
 * Optimized for edge computing platforms (Cloudflare Workers, Deno Deploy, Vercel Edge)
 * Provides lightweight, globally distributed inference
 */

import { Logger } from '../utils/Logger.js';
/* global KV, DurableObject, fastly, CF, Deno */

class EdgeEngine {
  constructor(config = {}) {
    this.logger = new Logger('EdgeEngine');
    this.config = {
      platform: config.platform || this.detectPlatform(),
      cacheStrategy: config.cacheStrategy || 'aggressive',
      kvStore: config.kvStore || null,
      durableObjects: config.durableObjects !== false,
      maxMemory: config.maxMemory || 128, // MB - Edge limits
      timeout: config.timeout || 10000, // 10s - Cloudflare limit
      region: config.region || 'auto',
      coldStartOptimization: config.coldStartOptimization !== false
    };
    
    this.initialized = false;
    this.cache = null;
    this.kv = null;
    this.models = new Map();
    this.platform = null;
  }

  /**
   * Detect edge platform
   */
  detectPlatform() {
    // Cloudflare Workers
    if (typeof globalThis.caches !== 'undefined' && typeof globalThis.Request !== 'undefined') {
      if (globalThis.navigator?.userAgent?.includes('Cloudflare-Workers')) {
        return 'cloudflare';
      }
    }
    
    // Deno
    if (typeof Deno !== 'undefined') {
      return 'deno';
    }
    
    // Vercel Edge
    if (process.env.VERCEL_EDGE) {
      return 'vercel';
    }
    
    // Netlify Edge
    if (process.env.NETLIFY_EDGE) {
      return 'netlify';
    }
    
    // Fastly Compute@Edge
    if (typeof fastly !== 'undefined') {
      return 'fastly';
    }
    
    return 'unknown';
  }

  /**
   * Check if the current environment is an edge platform
   */
  async isSupported() {
    return this.config.platform !== 'unknown';
  }

  /**
   * Initialize the engine
   */
  async initialize() {
    if (this.initialized) return true;
    
    try {
      this.logger.info(`Initializing Edge Engine for ${this.config.platform}`);
      
      // Platform-specific initialization
      switch (this.config.platform) {
        case 'cloudflare':
          await this.initializeCloudflare();
          break;
        case 'deno':
          await this.initializeDeno();
          break;
        case 'vercel':
          await this.initializeVercel();
          break;
        default:
          await this.initializeGeneric();
      }
      
      // Initialize cache
      await this.initializeCache();
      
      this.initialized = true;
      this.logger.info(`Edge Engine initialized on ${this.config.platform}`);
      
      return true;
    } catch (error) {
      this.logger.error(`Initialization failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Initialize for Cloudflare Workers
   */
  async initializeCloudflare() {
    this.platform = {
      name: 'cloudflare',
      hasKV: typeof KV !== 'undefined',
      hasDurableObjects: typeof DurableObject !== 'undefined',
      hasCache: typeof caches !== 'undefined',
      hasWebCrypto: typeof crypto !== 'undefined'
    };
    
    // Setup KV namespace if available
    if (this.config.kvStore && this.platform.hasKV) {
      this.kv = this.config.kvStore;
    }
    
    // Setup cache API
    if (this.platform.hasCache) {
      this.cache = caches.default;
    }
    
    this.logger.info('Cloudflare Workers environment initialized');
  }

  /**
   * Initialize for Deno
   */
  async initializeDeno() {
    this.platform = {
      name: 'deno',
      hasKV: typeof Deno.openKv !== 'undefined',
      hasCache: true,
      hasWebCrypto: typeof crypto !== 'undefined',
      permissions: await this.checkDenoPermissions()
    };
    
    // Setup Deno KV if available
    if (this.platform.hasKV) {
      try {
        this.kv = await Deno.openKv();
      } catch (error) {
        this.logger.warn('Could not open Deno KV:', error.message);
      }
    }
    
    this.logger.info('Deno environment initialized');
  }

  /**
   * Check Deno permissions
   */
  async checkDenoPermissions() {
    const permissions = {};
    
    try {
      permissions.read = (await Deno.permissions.query({ name: 'read' })).state === 'granted';
      permissions.write = (await Deno.permissions.query({ name: 'write' })).state === 'granted';
      permissions.net = (await Deno.permissions.query({ name: 'net' })).state === 'granted';
    } catch {
      // Permissions API not available
    }
    
    return permissions;
  }

  /**
   * Initialize for Vercel Edge
   */
  async initializeVercel() {
    this.platform = {
      name: 'vercel',
      hasCache: true,
      hasWebCrypto: typeof crypto !== 'undefined'
    };
    
    this.logger.info('Vercel Edge environment initialized');
  }

  /**
   * Initialize generic edge environment
   */
  async initializeGeneric() {
    this.platform = {
      name: 'generic',
      hasCache: typeof caches !== 'undefined',
      hasWebCrypto: typeof crypto !== 'undefined'
    };
    
    this.logger.info('Generic edge environment initialized');
  }

  /**
   * Initialize cache system
   */
  async initializeCache() {
    if (this.platform?.hasCache) {
      // Use native cache API
      this.cache = typeof caches !== 'undefined' ? caches.default || await caches.open('edge-engine') : null;
    } else {
      // Use in-memory cache
      this.cache = new Map();
    }
  }

  /**
   * Execute computation on edge
   */
  async execute(operation, data) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    // Check cache first
    const cacheKey = this.getCacheKey(operation, data);
    const cached = await this.getFromCache(cacheKey);
    if (cached) {
      return cached;
    }
    
    // Execute operation
    let result;
    const startTime = Date.now();
    
    try {
      switch (operation) {
        case 'inference':
          result = await this.runInference(data);
          break;
        case 'transform':
          result = await this.runTransform(data);
          break;
        case 'compute':
          result = await this.runCompute(data);
          break;
        default:
          throw new Error(`Unknown operation: ${operation}`);
      }
      
      // Add metadata
      result = {
        ...result,
        engine: 'edge',
        platform: this.config.platform,
        region: await this.getRegion(),
        duration: Date.now() - startTime
      };
      
      // Cache result
      await this.putInCache(cacheKey, result);
      
      return result;
    } catch (error) {
      this.logger.error(`Execution failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Run inference on edge
   */
  async runInference(data) {
    const { modelId, input } = data;
    
    // Load model if not cached
    let model = this.models.get(modelId);
    if (!model) {
      model = await this.loadModel(modelId);
    }
    
    // Simulate inference (in real implementation, would use actual model)
    const output = await this.processOnEdge(input, model);
    
    return {
      modelId,
      input,
      output,
      cached: false
    };
  }

  /**
   * Load model for edge execution
   */
  async loadModel(modelId) {
    // Try to load from KV store
    if (this.kv) {
      const stored = await this.getFromKV(`model:${modelId}`);
      if (stored) {
        this.models.set(modelId, stored);
        return stored;
      }
    }
    
    // Simulate model loading (lightweight for edge)
    const model = {
      id: modelId,
      weights: new Float32Array(1000), // Small model for edge
      config: {
        inputSize: 10,
        outputSize: 10,
        layers: 3
      }
    };
    
    this.models.set(modelId, model);
    
    // Store in KV for persistence
    if (this.kv) {
      await this.putInKV(`model:${modelId}`, model);
    }
    
    return model;
  }

  /**
   * Process on edge with optimizations
   */
  async processOnEdge(input, model) {
    // Simulate edge-optimized processing
    const { config } = model;
    
    // Simple neural network simulation
    let output = Array.isArray(input) ? input : [input];
    
    // Process through layers
    for (let layer = 0; layer < config.layers; layer++) {
      output = output.map(val => {
        // Simple activation
        return Math.tanh(val * Math.random());
      });
    }
    
    // Ensure output size matches config
    while (output.length < config.outputSize) {
      output.push(Math.random());
    }
    
    return output.slice(0, config.outputSize);
  }

  /**
   * Run transformation on edge
   */
  async runTransform(data) {
    const { tensor, operation } = data;
    
    let result;
    switch (operation) {
      case 'normalize':
        result = this.normalize(tensor);
        break;
      case 'quantize':
        result = this.quantize(tensor);
        break;
      case 'reshape':
        result = this.reshape(tensor, data.shape);
        break;
      default:
        result = tensor;
    }
    
    return { result, operation };
  }

  /**
   * Run computation on edge
   */
  async runCompute(data) {
    const { operation, input } = data;
    
    let result;
    switch (operation) {
      case 'matmul':
        result = this.matrixMultiply(input.a, input.b);
        break;
      case 'activation':
        result = this.applyActivation(input.tensor, input.type);
        break;
      case 'pooling':
        result = this.applyPooling(input.tensor, input.size);
        break;
      default:
        result = input;
    }
    
    return { result, operation };
  }

  /**
   * Normalize tensor
   */
  normalize(tensor) {
    const flat = Array.isArray(tensor) ? tensor.flat() : [tensor];
    const mean = flat.reduce((a, b) => a + b, 0) / flat.length;
    const std = Math.sqrt(
      flat.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / flat.length
    );
    return flat.map(v => (v - mean) / (std + 1e-7));
  }

  /**
   * Quantize tensor for edge efficiency
   */
  quantize(tensor, bits = 8) {
    const flat = Array.isArray(tensor) ? tensor.flat() : [tensor];
    const max = Math.max(...flat);
    const min = Math.min(...flat);
    const scale = (Math.pow(2, bits) - 1) / (max - min);
    
    return flat.map(v => Math.round((v - min) * scale));
  }

  /**
   * Reshape tensor
   */
  reshape(tensor, shape) {
    return { data: Array.isArray(tensor) ? tensor.flat() : [tensor], shape };
  }

  /**
   * Matrix multiplication (optimized for edge)
   */
  matrixMultiply(a, b) {
    // Simplified for edge constraints
    if (!Array.isArray(a) || !Array.isArray(b)) {
      return [[0]];
    }
    
    const result = [];
    const aRows = a.length;
    const aCols = a[0]?.length || 0;
    const bCols = b[0]?.length || 0;
    
    for (let i = 0; i < aRows; i++) {
      result[i] = [];
      for (let j = 0; j < bCols; j++) {
        let sum = 0;
        for (let k = 0; k < aCols; k++) {
          sum += (a[i][k] || 0) * (b[k]?.[j] || 0);
        }
        result[i][j] = sum;
      }
    }
    
    return result;
  }

  /**
   * Apply activation function
   */
  applyActivation(tensor, type) {
    const flat = Array.isArray(tensor) ? tensor.flat() : [tensor];
    
    switch (type) {
      case 'relu':
        return flat.map(v => Math.max(0, v));
      case 'sigmoid':
        return flat.map(v => 1 / (1 + Math.exp(-v)));
      case 'tanh':
        return flat.map(v => Math.tanh(v));
      case 'gelu':
        // Approximation of GELU
        return flat.map(v => 0.5 * v * (1 + Math.tanh(Math.sqrt(2 / Math.PI) * (v + 0.044715 * Math.pow(v, 3)))));
      default:
        return flat;
    }
  }

  /**
   * Apply pooling
   */
  applyPooling(tensor, size = 2) {
    if (!Array.isArray(tensor)) return tensor;
    
    const result = [];
    for (let i = 0; i < tensor.length; i += size) {
      const pool = tensor.slice(i, i + size);
      result.push(Math.max(...pool)); // Max pooling
    }
    return result;
  }

  /**
   * Get cache key
   */
  getCacheKey(operation, data) {
    const hash = JSON.stringify({ operation, data });
    return `edge:${this.hashString(hash)}`;
  }

  /**
   * Simple hash function
   */
  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  /**
   * Get from cache
   */
  async getFromCache(key) {
    if (!this.cache) return null;
    
    try {
      if (this.cache instanceof Map) {
        return this.cache.get(key);
      } else {
        // Cache API
        const response = await this.cache.match(key);
        if (response) {
          return await response.json();
        }
      }
    } catch (error) {
      this.logger.warn(`Cache get failed: ${error.message}`);
    }
    
    return null;
  }

  /**
   * Put in cache
   */
  async putInCache(key, value) {
    if (!this.cache) return;
    
    try {
      if (this.cache instanceof Map) {
        this.cache.set(key, value);
      } else {
        // Cache API
        const response = new Response(JSON.stringify(value));
        await this.cache.put(key, response);
      }
    } catch (error) {
      this.logger.warn(`Cache put failed: ${error.message}`);
    }
  }

  /**
   * Get from KV store
   */
  async getFromKV(key) {
    if (!this.kv) return null;
    
    try {
      if (this.platform?.name === 'cloudflare') {
        const value = await this.kv.get(key, 'json');
        return value;
      } else if (this.platform?.name === 'deno') {
        const entry = await this.kv.get([key]);
        return entry.value;
      }
    } catch (error) {
      this.logger.warn(`KV get failed: ${error.message}`);
    }
    
    return null;
  }

  /**
   * Put in KV store
   */
  async putInKV(key, value) {
    if (!this.kv) return;
    
    try {
      if (this.platform?.name === 'cloudflare') {
        await this.kv.put(key, JSON.stringify(value));
      } else if (this.platform?.name === 'deno') {
        await this.kv.set([key], value);
      }
    } catch (error) {
      this.logger.warn(`KV put failed: ${error.message}`);
    }
  }

  /**
   * Get current region
   */
  async getRegion() {
    // Cloudflare
    if (this.platform?.name === 'cloudflare' && typeof CF !== 'undefined') {
      return CF.colo || 'unknown';
    }
    
    // Vercel
    if (process.env.VERCEL_REGION) {
      return process.env.VERCEL_REGION;
    }
    
    // Deno Deploy
    if (this.platform?.name === 'deno' && Deno.env.get('DENO_REGION')) {
      return Deno.env.get('DENO_REGION');
    }
    
    return this.config.region || 'unknown';
  }

  /**
   * Get engine info
   */
  getInfo() {
    return {
      name: 'EdgeEngine',
      initialized: this.initialized,
      platform: this.platform,
      config: this.config,
      modelsLoaded: this.models.size,
      cacheType: this.cache instanceof Map ? 'memory' : 'native',
      hasKV: !!this.kv
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    this.logger.info('Cleaning up Edge Engine');
    
    // Clear cache
    if (this.cache instanceof Map) {
      this.cache.clear();
    }
    
    // Clear models
    this.models.clear();
    
    // Close KV if needed
    if (this.kv && this.platform?.name === 'deno') {
      this.kv.close();
    }
    
    this.initialized = false;
  }
}
export default EdgeEngine;
export { EdgeEngine };
