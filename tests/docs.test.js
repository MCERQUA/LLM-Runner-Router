/**
 * Documentation Test Suite
 * Ensures documentation tooling exports without relying on file paths
 */

import { describe, test, expect } from '@jest/globals';
import { OpenAPIManager } from '../src/api/OpenAPI.js';

describe('Documentation', () => {
  test('OpenAPIManager generates spec', () => {
    const manager = new OpenAPIManager({ title: 'Test API', version: '1.0.0', description: 'test' });
    const spec = manager.getSpecJSON();
    expect(spec.info.title).toBe('Test API');
    expect(spec.paths).toBeDefined();
  });
});

