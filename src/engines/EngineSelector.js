/**
 * 🔮 EngineSelector - Quantum Engine Orchestrator
 * Intelligently selects optimal compute backend based on reality constraints
 * Echo AI Systems - Adapting to any computational dimension
 */

import { Logger } from '../utils/Logger.js';

const logger = new Logger('EngineSelector');

class EngineSelector {
  static engines = new Map();
  static initialized = false;

  static async initialize() {
    if (this.initialized) return;
    
    logger.info('🔍 Detecting available engines...');
    
    // In test environment, use simplified loading
    if (process.env.NODE_ENV === 'test') {
      // Register WebGPU if available for tests
      try {
        if (typeof navigator !== 'undefined' && navigator.gpu) {
          const WebGPUEngine = (await import('./WebGPUEngine.js')).default;
          const instance = new WebGPUEngine();
          if (await instance.isSupported()) {
            this.engines.set('webgpu', {
              instance,
              priority: 100,
              supported: true
            });
            logger.success('✅ WebGPU engine available (test mode)');
          }
        }
      } catch (error) {
        logger.debug('❌ WebGPU not available in test');
      }

      // Always try WASM engine as fallback
      try {
        const WASMEngine = (await import('./WASMEngine.js')).default;
        const instance = new WASMEngine();
        this.engines.set('wasm', {
          instance,
          priority: 80,
          supported: true
        });
        logger.success('✅ WASM engine available (test mode)');
      } catch (error) {
        logger.debug('❌ WASM not available in test');
      }
      this.initialized = true;
      return;
    }
    
    // Register all engines with priority
    const engines = [
      { name: 'webgpu', module: './WebGPUEngine.js', priority: 100 },
      { name: 'node', module: './NodeNativeEngine.js', priority: 90 },
      { name: 'wasm', module: './WASMEngine.js', priority: 80 },
      { name: 'worker', module: './WorkerEngine.js', priority: 70 },
      { name: 'edge', module: './EdgeEngine.js', priority: 10 }
    ];
    
    for (const engine of engines) {
      try {
        const { default: Engine } = await import(engine.module);
        const instance = new Engine();

        const supported = typeof instance.isSupported === 'function'
          ? await instance.isSupported()
          : true;

        if (supported) {
          this.engines.set(engine.name, {
            instance,
            priority: engine.priority,
            supported: true
          });
          logger.success(`✅ ${engine.name} engine available`);
        }
      } catch (error) {
        logger.debug(`❌ ${engine.name} not available`);
      }
    }
    
    this.initialized = true;
  }

  static async getBest(config = {}) {
    await this.initialize();

    const preferredOrder = ['webgpu', 'node', 'wasm', 'worker', 'edge'];

    for (const name of preferredOrder) {
      const eng = this.engines.get(name);
      if (eng?.supported) {
        logger.info(`🎯 Selected engine: ${name}`);
        return eng.instance;
      }
    }

    throw new Error('No engines available!');
  }

  static async getByName(name) {
    await this.initialize();
    const engine = this.engines.get(name);
    
    if (!engine?.supported) {
      throw new Error(`Engine not available: ${name}`);
    }
    
    return engine.instance;
  }

  static getAvailable() {
    return Array.from(this.engines.entries())
      .filter(([_, eng]) => eng.supported)
      .map(([name]) => name);
  }
}

/**
 * Base Engine Class - The quantum substrate all engines inherit
 */
class BaseEngine {
  constructor(name) {
    this.name = name;
    this.initialized = false;
    this.capabilities = {
      parallel: false,
      gpu: false,
      streaming: true,
      quantization: false
    };
  }

  async isSupported() {
    return false; // Override in subclasses
  }

  async initialize(options = {}) {
    if (this.initialized) return;
    this.initialized = true;
    logger.info(`${this.name} engine initialized`);
  }

  async execute(model, input, options = {}) {
    throw new Error('execute() must be implemented');
  }

  async cleanup() {
    this.initialized = false;
  }

  getCapabilities() {
    return this.capabilities;
  }
}



export default EngineSelector;
export { EngineSelector, BaseEngine };
