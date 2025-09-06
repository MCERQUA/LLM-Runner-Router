/**
 * 🧪 Monitoring System Tests
 * Comprehensive tests for all monitoring components
 * Echo AI Systems - Ensuring reliability through testing
 */

import { jest } from '@jest/globals';
import monitoringSystem, { 
  otelManager, 
  prometheusManager, 
  healthMonitor, 
  profiler, 
  alertingSystem 
} from '../../src/monitoring/index.js';
import middleware from '../../src/monitoring/middleware.js';

describe('Monitoring System', () => {
  let originalEnv;

  beforeEach(async () => {
    originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    // Reset monitoring system state
    if (monitoringSystem.isRunning) {
      await monitoringSystem.stop();
    }
  });

  afterEach(async () => {
    // Clean up after each test
    if (monitoringSystem.isRunning) {
      await monitoringSystem.stop();
    }
    process.env.NODE_ENV = originalEnv;
  });

  describe('MonitoringSystem Core', () => {
    test('should initialize with default configuration', () => {
      expect(monitoringSystem).toBeDefined();
      expect(monitoringSystem.config).toBeDefined();
      expect(monitoringSystem.components).toBeDefined();
    });

    test('should start all enabled components', async () => {
      const config = {
        enabled: true,
        autoStart: false,
        components: {
          opentelemetry: false, // Disable for testing to avoid external dependencies
          prometheus: true,
          health: true,
          profiler: false,
          alerting: true,
        },
      };

      monitoringSystem.config = { ...monitoringSystem.config, ...config };
      
      await monitoringSystem.start();
      expect(monitoringSystem.isRunning).toBe(true);
    });

    test('should stop all components gracefully', async () => {
      await monitoringSystem.start();
      await monitoringSystem.stop();
      expect(monitoringSystem.isRunning).toBe(false);
    });

    test('should get system status', () => {
      const status = monitoringSystem.getSystemStatus();
      expect(status).toBeDefined();
      expect(status.monitoring).toBeDefined();
      expect(status.monitoring.isRunning).toBeDefined();
    });

    test('should record HTTP requests', () => {
      const mockReq = {
        method: 'GET',
        path: '/test',
        route: { path: '/test' },
      };
      const mockRes = {
        statusCode: 200,
        get: jest.fn(() => '100'),
      };

      // Should not throw
      expect(() => {
        monitoringSystem.recordHttpRequest(mockReq, mockRes, 150);
      }).not.toThrow();
    });

    test('should record model inference', () => {
      const modelId = 'test-model';
      const modelType = 'transformer';
      const engine = 'node';
      const duration = 1.5;
      const tokenCount = 100;

      // Should not throw
      expect(() => {
        monitoringSystem.recordModelInference(modelId, modelType, engine, duration, tokenCount);
      }).not.toThrow();
    });

    test('should create spans for tracing', () => {
      const span = monitoringSystem.createSpan('test-operation', { 'test.key': 'value' });
      expect(span).toBeDefined();
      expect(typeof span.end).toBe('function');
      expect(typeof span.setAttributes).toBe('function');
    });

    test('should execute functions within traced spans', async () => {
      const testFunction = jest.fn().mockResolvedValue('test-result');
      
      const result = await monitoringSystem.withSpan('test-span', testFunction, { 'test.attr': 'value' });
      
      expect(testFunction).toHaveBeenCalled();
      expect(result).toBe('test-result');
    });
  });

  describe('PrometheusManager', () => {
    test('should initialize with custom metrics', () => {
      expect(prometheusManager).toBeDefined();
      expect(prometheusManager.metrics.size).toBeGreaterThan(0);
    });

    test('should increment counters', () => {
      expect(() => {
        prometheusManager.incrementCounter('http_requests_total', {
          method: 'GET',
          route: '/test',
          status_code: '200',
        });
      }).not.toThrow();
    });

    test('should observe histograms', () => {
      expect(() => {
        prometheusManager.observeHistogram('http_request_duration_seconds', 0.15, {
          method: 'GET',
          route: '/test',
          status_code: '200',
        });
      }).not.toThrow();
    });

    test('should set gauges', () => {
      expect(() => {
        prometheusManager.setGauge('active_connections', 5, { connection_type: 'http' });
      }).not.toThrow();
    });

    test('should record model performance', () => {
      expect(() => {
        prometheusManager.recordModelInference('test-model', 'transformer', 'node', 1.5, 100, 'success');
      }).not.toThrow();
    });

    test('should record HTTP requests', () => {
      expect(() => {
        prometheusManager.recordHttpRequest('GET', '/test', 200, 0.15, 1000, 2000);
      }).not.toThrow();
    });

    test('should start metrics server', async () => {
      await prometheusManager.start();
      expect(prometheusManager.isRunning).toBe(true);
      await prometheusManager.stop();
    });

    test('should get metrics summary', () => {
      const summary = prometheusManager.getMetricsSummary();
      expect(summary).toBeDefined();
      expect(summary.total_metrics).toBeGreaterThan(0);
      expect(Array.isArray(summary.metrics)).toBe(true);
    });
  });

  describe('HealthMonitor', () => {
    test('should initialize with default checks', () => {
      expect(healthMonitor).toBeDefined();
      expect(healthMonitor.checks.size).toBeGreaterThan(0);
    });

    test('should register custom health checks', () => {
      const checkFunction = jest.fn().mockResolvedValue({
        status: 'healthy',
        message: 'Test check passed',
      });

      healthMonitor.registerCheck('test_check', checkFunction);
      expect(healthMonitor.checks.has('test_check')).toBe(true);
    });

    test('should register dependencies', () => {
      const dependencyCheck = jest.fn().mockResolvedValue({
        status: 'healthy',
        message: 'Dependency is available',
      });

      healthMonitor.registerDependency('test_dependency', dependencyCheck, { critical: true });
      expect(healthMonitor.dependencies.has('test_dependency')).toBe(true);
    });

    test('should run health checks', async () => {
      const healthStatus = await healthMonitor.runChecks();
      expect(healthStatus).toBeDefined();
      expect(healthStatus.status).toBeDefined();
      expect(healthStatus.checks).toBeDefined();
    });

    test('should record errors', () => {
      expect(() => {
        healthMonitor.recordError('test_error');
      }).not.toThrow();
    });

    test('should record response times', () => {
      expect(() => {
        healthMonitor.recordResponseTime(150);
      }).not.toThrow();
    });

    test('should get health summary', () => {
      const summary = healthMonitor.getHealthSummary();
      expect(summary).toBeDefined();
      expect(summary.status).toBeDefined();
      expect(summary.summary).toBeDefined();
    });
  });

  describe('AlertingSystem', () => {
    test('should initialize with default rules', () => {
      expect(alertingSystem).toBeDefined();
      expect(alertingSystem.rules.size).toBeGreaterThan(0);
    });

    test('should add custom alert rules', () => {
      const rule = {
        name: 'Test Rule',
        description: 'Test alert rule',
        severity: 'warning',
        condition: (metrics) => metrics.testValue > 100,
        channels: ['console'],
      };

      alertingSystem.addRule('test_rule', rule);
      expect(alertingSystem.rules.has('test_rule')).toBe(true);
    });

    test('should evaluate metrics against rules', () => {
      const testMetrics = {
        errorRate: 0.1, // 10% - should trigger default high_error_rate rule
        memoryUsage: 0.9, // 90% - should trigger default high_memory_usage rule
      };

      expect(() => {
        alertingSystem.evaluateMetrics(testMetrics);
      }).not.toThrow();
    });

    test('should trigger alerts', async () => {
      const rule = {
        name: 'Test Alert',
        description: 'Test alert for unit testing',
        severity: 'warning',
        channels: ['console'],
      };

      alertingSystem.addRule('test_alert', rule);
      
      await alertingSystem.triggerAlert('test_alert', {
        message: 'Test alert triggered',
        severity: 'warning',
      });

      expect(alertingSystem.alerts.size).toBeGreaterThan(0);
    });

    test('should get alert statistics', () => {
      const stats = alertingSystem.getAlertStats();
      expect(stats).toBeDefined();
      expect(typeof stats.active).toBe('number');
      expect(typeof stats.totalHistory).toBe('number');
    });

    test('should toggle rules', () => {
      alertingSystem.addRule('toggleable_rule', {
        name: 'Toggleable Rule',
        condition: () => false,
      });

      expect(alertingSystem.toggleRule('toggleable_rule', false)).toBe(true);
      expect(alertingSystem.rules.get('toggleable_rule').enabled).toBe(false);
      
      expect(alertingSystem.toggleRule('toggleable_rule', true)).toBe(true);
      expect(alertingSystem.rules.get('toggleable_rule').enabled).toBe(true);
    });
  });

  describe('Profiler', () => {
    test('should initialize with configuration', () => {
      expect(profiler).toBeDefined();
      expect(profiler.config).toBeDefined();
    });

    test('should get profiler status', () => {
      const status = profiler.getStatus();
      expect(status).toBeDefined();
      expect(typeof status.isRunning).toBe('boolean');
    });

    test('should mark performance points', () => {
      expect(() => {
        profiler.mark('test_mark');
      }).not.toThrow();
    });

    test('should measure performance between marks', () => {
      profiler.mark('test_start');
      profiler.mark('test_end');
      
      expect(() => {
        profiler.measure('test_measure', 'test_start', 'test_end');
      }).not.toThrow();
    });

    test('should time function execution', async () => {
      const testFunction = jest.fn().mockResolvedValue('result');
      
      const result = await profiler.timeFunction('test_function', testFunction);
      
      expect(testFunction).toHaveBeenCalled();
      expect(result).toBe('result');
    });

    test('should detect performance bottlenecks', () => {
      const bottlenecks = profiler.detectBottlenecks();
      expect(Array.isArray(bottlenecks)).toBe(true);
    });
  });

  describe('Middleware', () => {
    test('should create HTTP monitoring middleware', () => {
      const httpMiddleware = middleware.httpMonitoringMiddleware();
      expect(typeof httpMiddleware).toBe('function');
    });

    test('should create error monitoring middleware', () => {
      const errorMiddleware = middleware.errorMonitoringMiddleware();
      expect(typeof errorMiddleware).toBe('function');
    });

    test('should wrap model functions with monitoring', async () => {
      const mockModelFunction = jest.fn().mockResolvedValue({
        result: 'test output',
        tokenCount: 50,
      });

      const monitoredFunction = middleware.withModelMonitoring(
        'test-model',
        'transformer',
        'node',
        mockModelFunction
      );

      const result = await monitoredFunction('test input');
      
      expect(mockModelFunction).toHaveBeenCalledWith('test input');
      expect(result.result).toBe('test output');
    });

    test('should wrap database functions with monitoring', async () => {
      const mockDbFunction = jest.fn().mockResolvedValue([{ id: 1, name: 'test' }]);

      const monitoredFunction = middleware.withDatabaseMonitoring(
        'SELECT',
        'users',
        mockDbFunction
      );

      const result = await monitoredFunction('SELECT * FROM users');
      
      expect(mockDbFunction).toHaveBeenCalledWith('SELECT * FROM users');
      expect(result).toEqual([{ id: 1, name: 'test' }]);
    });

    test('should wrap cache functions with monitoring', async () => {
      const mockCacheFunction = jest.fn().mockResolvedValue('cached_value');

      const monitoredFunction = middleware.withCacheMonitoring(
        'get',
        'redis',
        mockCacheFunction
      );

      const result = await monitoredFunction('test_key');
      
      expect(mockCacheFunction).toHaveBeenCalledWith('test_key');
      expect(result).toBe('cached_value');
    });

    test('should record custom metrics', () => {
      expect(() => {
        middleware.recordCustomMetric('test_counter', 1, { label: 'test' }, 'counter');
        middleware.recordCustomMetric('test_histogram', 0.5, { label: 'test' }, 'histogram');
        middleware.recordCustomMetric('test_gauge', 10, { label: 'test' }, 'gauge');
      }).not.toThrow();
    });

    test('should register health checks', () => {
      const checkFunction = jest.fn().mockResolvedValue({ status: 'healthy' });
      
      expect(() => {
        middleware.registerHealthCheck('middleware_test_check', checkFunction);
      }).not.toThrow();
    });

    test('should register dependencies', () => {
      const depFunction = jest.fn().mockResolvedValue({ status: 'healthy' });
      
      expect(() => {
        middleware.registerDependency('middleware_test_dep', depFunction);
      }).not.toThrow();
    });

    test('should register alert rules', () => {
      const rule = {
        name: 'Middleware Test Rule',
        condition: () => false,
      };
      
      expect(() => {
        middleware.registerAlertRule('middleware_test_rule', rule);
      }).not.toThrow();
    });

    test('should check monitoring status', () => {
      const status = middleware.getMonitoringStatus();
      expect(status).toBeDefined();
      
      const isEnabled = middleware.isMonitoringEnabled();
      expect(typeof isEnabled).toBe('boolean');
    });
  });

  describe('Integration Tests', () => {
    test('should integrate with Express app', () => {
      const mockApp = {
        use: jest.fn(),
        get: jest.fn(),
      };

      expect(() => {
        middleware.setupMonitoring(mockApp, {
          httpMonitoring: true,
          errorMonitoring: true,
          healthEndpoint: '/health',
          metricsEndpoint: '/metrics',
          statusEndpoint: '/status',
        });
      }).not.toThrow();

      expect(mockApp.use).toHaveBeenCalled();
      expect(mockApp.get).toHaveBeenCalled();
    });

    test('should handle monitoring system lifecycle', async () => {
      // Start monitoring
      await monitoringSystem.start();
      expect(monitoringSystem.isRunning).toBe(true);

      // Record some metrics
      monitoringSystem.recordHttpRequest(
        { method: 'GET', path: '/test', route: { path: '/test' } },
        { statusCode: 200, get: () => '100' },
        150
      );

      monitoringSystem.recordModelInference('test-model', 'transformer', 'node', 1.5, 100);

      // Get status
      const status = monitoringSystem.getSystemStatus();
      expect(status.monitoring.isRunning).toBe(true);

      // Get dashboard data
      const dashboardData = await monitoringSystem.getDashboardData();
      expect(dashboardData).toBeDefined();
      expect(dashboardData.timestamp).toBeDefined();

      // Stop monitoring
      await monitoringSystem.stop();
      expect(monitoringSystem.isRunning).toBe(false);
    });

    test('should handle errors gracefully', async () => {
      const errorFunction = async () => {
        throw new Error('Test error');
      };

      const monitoredFunction = middleware.withModelMonitoring(
        'error-model',
        'transformer',
        'node',
        errorFunction
      );

      await expect(monitoredFunction()).rejects.toThrow('Test error');
    });

    test('should export metrics in different formats', async () => {
      await monitoringSystem.start();

      // Test JSON export
      const jsonMetrics = await monitoringSystem.exportMetrics('json');
      expect(Array.isArray(jsonMetrics)).toBe(true);

      // Test OpenTelemetry export
      const otelMetrics = await monitoringSystem.exportMetrics('opentelemetry');
      expect(otelMetrics).toBeDefined();

      await monitoringSystem.stop();
    });
  });

  describe('Error Handling', () => {
    test('should handle component initialization failures gracefully', async () => {
      // Mock a component that fails to start
      const originalStart = prometheusManager.start;
      prometheusManager.start = jest.fn().mockRejectedValue(new Error('Start failed'));

      // Should not throw, but should log error and continue
      await expect(monitoringSystem.start()).resolves.not.toThrow();

      // Restore original method
      prometheusManager.start = originalStart;
    });

    test('should handle missing components gracefully', () => {
      const originalComponent = monitoringSystem.components.prometheus;
      monitoringSystem.components.prometheus = null;

      // Should not throw
      expect(() => {
        monitoringSystem.recordHttpRequest(
          { method: 'GET', path: '/test' },
          { statusCode: 200, get: () => '100' },
          150
        );
      }).not.toThrow();

      // Restore original component
      monitoringSystem.components.prometheus = originalComponent;
    });
  });
});