/**
 * Examples Test Suite
 * Validates example scripts export reusable functions
 */

import { describe, test, expect } from '@jest/globals';

describe('Examples', () => {
  test('advanced-api-server exports factory', async () => {
    const module = await import('../examples/advanced-api-server.js');
    expect(typeof module.createAdvancedAPIServer).toBe('function');
  });

  test('advanced-utils-demo exports utilities', async () => {
    const module = await import('../examples/advanced-utils-demo.js');
    expect(typeof module.demoUniversalTokenizer).toBe('function');
    expect(typeof module.demoFormatConverter).toBe('function');
  });
});

