import { EdgeEngine } from '../src/engines/EdgeEngine.js';

// Simulate a Cloudflare Workers-like environment
beforeAll(() => {
  globalThis.navigator = { userAgent: 'Cloudflare-Workers' };
  globalThis.Request = class {};
  globalThis.caches = {
    default: new Map(),
    open: async () => new Map()
  };
});

afterAll(() => {
  delete globalThis.navigator;
  delete globalThis.Request;
  delete globalThis.caches;
});

describe('EdgeEngine Cloudflare environment', () => {
  test('detects platform and performs cached inference', async () => {
    const engine = new EdgeEngine();
    expect(await engine.isSupported()).toBe(true);

    await engine.initialize();
    expect(engine.platform.name).toBe('cloudflare');

    const data = { modelId: 'demo', input: [0.1, 0.2, 0.3] };
    const first = await engine.execute('inference', data);
    const second = await engine.execute('inference', data);

    expect(first.platform).toBe('cloudflare');
    expect(first.output).toHaveLength(10);
    expect(second).toEqual(first); // cached result
  });
});
