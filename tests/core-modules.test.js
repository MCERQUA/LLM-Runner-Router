/**
 * Core Modules Test Suite
 * Verifies core exports without relying on version numbers or paths
 */

import { describe, test, expect } from '@jest/globals';

describe('Core Modules', () => {
  test('Core components export expected interfaces', async () => {
    const { Router } = await import('../src/core/Router.js');
    const { Registry } = await import('../src/core/Registry.js');
    const { Pipeline } = await import('../src/core/Pipeline.js');
    const { ModelInterface } = await import('../src/core/ModelInterface.js');
    const { ErrorHandler } = await import('../src/core/ErrorHandler.js');
    const { SelfHealingMonitor } = await import('../src/core/SelfHealingMonitor.js');
    const { LoadBalancer } = await import('../src/core/LoadBalancer.js');
    const { CostOptimizer } = await import('../src/core/CostOptimizer.js');
    const { QualityScorer } = await import('../src/core/QualityScorer.js');
    const { ModelEnsemble } = await import('../src/core/ModelEnsemble.js');

    expect(Router).toBeDefined();
    expect(Registry).toBeDefined();
    expect(Pipeline).toBeDefined();
    expect(ModelInterface).toBeDefined();
    expect(ErrorHandler).toBeDefined();
    expect(SelfHealingMonitor).toBeDefined();
    expect(LoadBalancer).toBeDefined();
    expect(CostOptimizer).toBeDefined();
    expect(QualityScorer).toBeDefined();
    expect(ModelEnsemble).toBeDefined();
  });

  test('Model loaders can be imported', async () => {
    const loaders = [
      'GGUFLoader',
      'ONNXLoader',
      'SafetensorsLoader',
      'HFLoader',
      'TFJSLoader',
      'PyTorchLoader',
      'BinaryLoader',
      'BitNetLoader',
      'SimpleLoader',
      'MockLoader'
    ];

    for (const loaderName of loaders) {
      const module = await import(`../src/loaders/${loaderName}.js`);
      expect(module.default).toBeDefined();
      const LoaderClass = module.default;
      const instance = new LoaderClass();
      expect(instance.load).toBeDefined();
    }
  });

  test('Engine modules export', async () => {
    const engines = [
      'WebGPUEngine',
      'WASMEngine',
      'NodeEngine',
      'WorkerEngine',
      'EdgeEngine',
      'EngineSelector'
    ];

    for (const engineName of engines) {
      const module = await import(`../src/engines/${engineName}.js`);
      expect(module.default || module[engineName]).toBeDefined();
    }
  });

  test('Runtime components export', async () => {
    const { MemoryManager } = await import('../src/runtime/MemoryManager.js');
    const { CacheManager } = await import('../src/runtime/CacheManager.js');
    const { StreamProcessor } = await import('../src/runtime/StreamProcessor.js');
    const { ThreadPool } = await import('../src/runtime/ThreadPool.js');

    expect(MemoryManager).toBeDefined();
    expect(CacheManager).toBeDefined();
    expect(StreamProcessor).toBeDefined();
    expect(ThreadPool).toBeDefined();
  });

  test('API layer exports', async () => {
    const apis = [
      'WebSocket',
      'GraphQL',
      'gRPC',
      'Auth',
      'RateLimiter',
      'OpenAPI',
      'Gateway'
    ];

    for (const apiName of apis) {
      const module = await import(`../src/api/${apiName}.js`);
      expect(module.default || module[apiName]).toBeDefined();
    }
  });

  test('Enterprise features export', async () => {
    const { MultiTenancyManager } = await import('../src/enterprise/MultiTenancy.js');
    const { ABTestingManager } = await import('../src/enterprise/ABTesting.js');
    const { AuditLogger } = await import('../src/enterprise/AuditLogger.js');
    const { SLAMonitor } = await import('../src/enterprise/SLAMonitor.js');
    const { EnterpriseAuthManager } = await import('../src/enterprise/EnterpriseAuth.js');
    const { EnterpriseManager } = await import('../src/enterprise/EnterpriseManager.js');

    expect(MultiTenancyManager).toBeDefined();
    expect(ABTestingManager).toBeDefined();
    expect(AuditLogger).toBeDefined();
    expect(SLAMonitor).toBeDefined();
    expect(EnterpriseAuthManager).toBeDefined();
    expect(EnterpriseManager).toBeDefined();
  });

  test('Utility tools export', async () => {
    const { UniversalTokenizer } = await import('../src/utils/UniversalTokenizer.js');
    const { ModelQuantizer } = await import('../src/utils/ModelQuantizer.js');
    const { FormatConverter } = await import('../src/utils/FormatConverter.js');
    const { ValidationSuite } = await import('../src/utils/ValidationSuite.js');

    expect(UniversalTokenizer).toBeDefined();
    expect(ModelQuantizer).toBeDefined();
    expect(FormatConverter).toBeDefined();
    expect(ValidationSuite).toBeDefined();
  });

  test('Monitoring components export', async () => {
    const { OpenTelemetry } = await import('../src/monitoring/OpenTelemetry.js');
    const { PrometheusMetrics } = await import('../src/monitoring/Prometheus.js');
    const { HealthMonitor } = await import('../src/monitoring/HealthMonitor.js');
    const { Profiler } = await import('../src/monitoring/Profiler.js');
    const { AlertingSystem } = await import('../src/monitoring/Alerting.js');

    expect(OpenTelemetry).toBeDefined();
    expect(PrometheusMetrics).toBeDefined();
    expect(HealthMonitor).toBeDefined();
    expect(Profiler).toBeDefined();
    expect(AlertingSystem).toBeDefined();
  });
});

