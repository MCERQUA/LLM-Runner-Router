import { describe, test, expect, jest } from '@jest/globals';

describe('LLM Runner Router', () => {
  test('environment check', () => {
    expect(process.env.NODE_ENV || 'test').toBeTruthy();
  });

  test('selects Node engine when available', async () => {
    const originalEnv = process.env.NODE_ENV;
    let EngineSelector;
    try {
      process.env.NODE_ENV = 'production';
      jest.resetModules();
      ({ EngineSelector } = await import('../src/engines/EngineSelector.js'));
      EngineSelector.engines.clear();
      EngineSelector.initialized = false;
      const engine = await EngineSelector.getBest();
      expect(engine.constructor.name).toBe('NodeEngine');
      await engine.cleanup?.();
    } finally {
      EngineSelector?.engines.clear();
      if (EngineSelector) EngineSelector.initialized = false;
      process.env.NODE_ENV = originalEnv;
    }
  });

  test('router selects model matching capability', async () => {
    const { Router } = await import('../src/core/Router.js');
    const mockRegistry = {
      getAvailable: jest.fn().mockResolvedValue([
        {
          id: 'text',
          name: 'TextModel',
          format: 'mock',
          parameters: { size: 1 },
          supports: (cap) => cap === 'textGeneration'
        },
        {
          id: 'embed',
          name: 'EmbedModel',
          format: 'mock',
          parameters: { size: 1 },
          supports: (cap) => cap === 'embedding'
        }
      ])
    };
    const router = new Router(mockRegistry, { strategy: 'capability-match' });
    const model = await router.selectModel('hi', {
      capabilities: { embedding: true }
    });
    expect(model.id).toBe('embed');
  });
});
