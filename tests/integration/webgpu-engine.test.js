import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

const skipIfNoWebGPU = () => {
  if (typeof navigator === 'undefined' || !navigator.gpu) {
    console.warn('WebGPU not available; skipping WebGPU engine tests');
    return true;
  }
  return false;
};

describe('WebGPU Engine Integration', () => {
  let originalEnv;

  beforeEach(async () => {
    // Ensure production mode so EngineSelector loads full engines
    originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const { EngineSelector } = await import('../../src/engines/EngineSelector.js');
    EngineSelector.engines.clear();
    EngineSelector.initialized = false;
  });

  afterEach(async () => {
    const { EngineSelector } = await import('../../src/engines/EngineSelector.js');
    EngineSelector.engines.clear();
    EngineSelector.initialized = false;
    process.env.NODE_ENV = originalEnv;
  });

  it('selects WebGPU engine when available', async () => {
    if (skipIfNoWebGPU()) return;
    const { EngineSelector } = await import('../../src/engines/EngineSelector.js');
    const engine = await EngineSelector.getBest();
    expect(engine.name).toBe('WebGPU');
    await engine.cleanup();
  });

  it('runs a simple compute shader', async () => {
    if (skipIfNoWebGPU()) return;
    const { WebGPUEngine } = await import('../../src/engines/WebGPUEngine.js');
    const engine = new WebGPUEngine();
    const data = new Float32Array([1, 2, 3, 4]);
    const result = await engine.execute({ outputSize: data.byteLength }, data);
    expect(Array.from(result)).toEqual([2, 4, 6, 8]);
    await engine.cleanup();
  });
});

