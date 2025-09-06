/**
 * Simple test to verify basic functionality
 */

import { describe, it, expect, jest } from '@jest/globals';

describe('Simple Tests', () => {
  it('initializes Router with mock engine', async () => {
    const { Router } = await import('../src/core/Router.js');
    const mockRegistry = { getAll: jest.fn().mockResolvedValue([]) };
    const router = new Router(mockRegistry);
    const computeSpy = jest.spyOn(router, 'computeModelScores').mockResolvedValue();
    const monitorSpy = jest.spyOn(router, 'startMonitoring').mockImplementation(() => {});
    await router.initialize({ name: 'test-engine' });
    expect(router.engine.name).toBe('test-engine');
    expect(computeSpy).toHaveBeenCalled();
    expect(monitorSpy).toHaveBeenCalled();
    router.stopMonitoring();
  });

  it('should import LLMRouter', async () => {
    const { LLMRouter } = await import('../src/index.js');
    expect(LLMRouter).toBeDefined();
  });
});