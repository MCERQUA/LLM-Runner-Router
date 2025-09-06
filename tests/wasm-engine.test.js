import { WASMEngine } from '../src/engines/WASMEngine.js';

describe('WASMEngine basic inference', () => {
  let engine;
  const model = {
    name: 'wasm-dummy',
    size: 4,
    weights: new Float32Array([0]),
    outputSize: 1
  };

  beforeAll(async () => {
    engine = new WASMEngine();
    await engine.initialize();
    await engine.loadModel(model);
  });

  afterAll(async () => {
    await engine.cleanup();
  });

  test('executes inference', async () => {
    const result = await engine.execute(model, new Float32Array([0]));
    expect(result).toEqual([42]);
  });

  test('streams tokens', async () => {
    const tokens = [];
    for await (const token of engine.stream(model, new Float32Array([0]), { maxTokens: 2 })) {
      tokens.push(token[0]);
    }
    expect(tokens).toEqual([42, 42]);
  });
});
