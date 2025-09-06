# 🛡️ LLM-Runner-Router Error Codes Reference

*Your comprehensive guide to understanding, diagnosing, and resolving every error in the system*

## 📖 Table of Contents

- [Error Code Structure](#error-code-structure)
- [Severity Levels](#severity-levels)
- [Core System Errors](#core-system-errors)
- [Model Loading Errors](#model-loading-errors)
- [Runtime Errors](#runtime-errors)
- [Network & Connection Errors](#network--connection-errors)
- [Memory & Resource Errors](#memory--resource-errors)
- [Authentication & Security Errors](#authentication--security-errors)
- [Configuration Errors](#configuration-errors)
- [Engine-Specific Errors](#engine-specific-errors)
- [Loader-Specific Errors](#loader-specific-errors)
- [Recovery Strategies](#recovery-strategies)
- [Error Handling Best Practices](#error-handling-best-practices)
- [Debugging Tools](#debugging-tools)

## 🏗️ Error Code Structure

LLM-Runner-Router uses a structured error code system for precise error identification and automated recovery.

### Format: `LLM_[CATEGORY]_[CODE]_[SEVERITY]`

```
LLM_CORE_001_E    # Core system error, Error level
LLM_MODEL_004_W   # Model loading warning, Warning level
LLM_NET_012_C     # Network critical error, Critical level
```

### Severity Levels

| Level | Code | Description | Auto-Recovery |
|-------|------|-------------|---------------|
| **Info** | `I` | Informational messages | N/A |
| **Warning** | `W` | Potential issues | Monitoring |
| **Error** | `E` | Recoverable errors | Automatic |
| **Critical** | `C` | System-threatening | Manual |
| **Fatal** | `F` | Unrecoverable | Shutdown |

## 🔧 Core System Errors

### LLM_CORE_001_E - Router Initialization Failed
**Cause**: Router failed to initialize properly
**Common Triggers**:
- Invalid configuration
- Missing dependencies
- Conflicting model registry

**Solution**:
```javascript
// Check configuration
const config = await LLMRouter.validateConfig();
if (!config.valid) {
  console.log('Config errors:', config.errors);
}

// Reinitialize with default config
const router = new LLMRouter({
  fallbackToDefaults: true,
  autoHeal: true
});
```

### LLM_CORE_002_E - Registry Corruption
**Cause**: Model registry file is corrupted or inaccessible
**Recovery**: Automatic registry rebuild

```javascript
// Manual registry recovery
const registry = router.getRegistry();
await registry.rebuild();
await registry.validateIntegrity();
```

### LLM_CORE_003_C - Pipeline Deadlock
**Cause**: Processing pipeline has entered a deadlock state
**Recovery**: Pipeline restart required

```javascript
// Force pipeline restart
await router.pipeline.emergency_restart();
await router.pipeline.clearQueue();
```

### LLM_CORE_004_W - High Memory Usage
**Cause**: System memory usage exceeds 80% threshold
**Recovery**: Automatic cache clearing

```javascript
// Manual memory optimization
await router.memoryManager.forceGC();
await router.cache.evictLRU(0.3); // Evict 30% of cache
```

### LLM_CORE_005_E - Self-Healing Failure
**Cause**: Auto-recovery system has failed
**Recovery**: Manual intervention required

```javascript
// Disable auto-healing and diagnose
router.selfHealing.disable();
const diagnostics = await router.selfHealing.getDiagnostics();
console.log('Self-healing status:', diagnostics);
```

## 🤖 Model Loading Errors

### LLM_MODEL_001_E - Model Not Found
**Cause**: Specified model cannot be located
**Common Sources**:
- Incorrect model path
- Network connectivity issues
- Insufficient permissions

**Solution**:
```javascript
// Verify model exists
const exists = await router.modelExists('model-name');
if (!exists) {
  // Try alternative sources
  const alternatives = await router.findAlternativeModels('model-name');
  console.log('Available alternatives:', alternatives);
}

// Use fallback model
const model = await router.load('model-name', {
  fallback: ['gpt-3.5-turbo', 'llama-2-7b']
});
```

### LLM_MODEL_002_E - Format Not Supported
**Cause**: Model format is not supported by available loaders
**Solution**:
```javascript
// Check supported formats
const formats = router.getSupportedFormats();
console.log('Supported formats:', formats);

// Auto-convert if possible
const converted = await router.convertModel('model.bin', 'gguf');
```

### LLM_MODEL_003_C - Model Corrupted
**Cause**: Model file is corrupted or incomplete
**Recovery**: Re-download required

```javascript
// Verify model integrity
const integrity = await router.verifyModel('model-name');
if (!integrity.valid) {
  console.log('Corruption detected:', integrity.errors);
  // Force re-download
  await router.downloadModel('model-name', { force: true });
}
```

### LLM_MODEL_004_W - Model Size Warning
**Cause**: Model size exceeds recommended limits for current environment
**Solution**:
```javascript
// Use quantized version
const quantizedModel = await router.load('model-name', {
  quantization: 'int8',
  optimization: 'memory'
});

// Or use model sharding
const shardedModel = await router.loadSharded('model-name', {
  shards: 4,
  distributed: true
});
```

### LLM_MODEL_005_E - Quantization Failed
**Cause**: Model quantization process failed
**Solution**:
```javascript
// Retry with different quantization method
const methods = ['int8', 'int4', 'float16'];
for (const method of methods) {
  try {
    await router.quantizeModel('model-name', method);
    break;
  } catch (error) {
    console.log(`${method} quantization failed:`, error);
  }
}
```

## ⚡ Runtime Errors

### LLM_RUNTIME_001_E - Inference Timeout
**Cause**: Model inference exceeded timeout limit
**Solution**:
```javascript
// Increase timeout
const result = await model.generate(prompt, {
  timeout: 60000, // 60 seconds
  streaming: true  // Use streaming for long responses
});

// Or use async inference
const inferenceId = await model.generateAsync(prompt);
const result = await model.getResult(inferenceId);
```

### LLM_RUNTIME_002_C - Memory Exhaustion
**Cause**: System has run out of available memory
**Recovery**: Immediate cleanup required

```javascript
// Emergency memory cleanup
await router.emergencyCleanup();
await router.unloadUnusedModels();

// Reduce batch size
const result = await model.generate(prompt, {
  batchSize: 1,
  maxTokens: 100
});
```

### LLM_RUNTIME_003_E - Context Length Exceeded
**Cause**: Input prompt exceeds model's context window
**Solution**:
```javascript
// Truncate input
const truncated = await router.truncateToContext(prompt, modelName);

// Or use sliding window
const result = await model.generateWithSlidingWindow(prompt, {
  windowSize: 2048,
  overlap: 256
});
```

### LLM_RUNTIME_004_W - Token Limit Warning
**Cause**: Generation approaching token limit
**Solution**:
```javascript
// Monitor token usage
model.on('tokenLimitWarning', (usage) => {
  console.log(`Token usage: ${usage.used}/${usage.limit}`);
  // Implement early stopping
  if (usage.used > usage.limit * 0.9) {
    model.stopGeneration();
  }
});
```

## 🌐 Network & Connection Errors

### LLM_NET_001_E - Connection Failed
**Cause**: Unable to establish network connection
**Recovery**: Automatic retry with exponential backoff

```javascript
// Configure retry policy
const router = new LLMRouter({
  network: {
    retries: 5,
    backoff: 'exponential',
    timeout: 30000
  }
});

// Manual retry
await router.retryConnection({
  maxAttempts: 3,
  delay: 2000
});
```

### LLM_NET_002_E - Download Failed
**Cause**: Model download was interrupted or failed
**Solution**:
```javascript
// Resume interrupted download
await router.resumeDownload('model-name');

// Download with progress tracking
await router.downloadModel('model-name', {
  onProgress: (progress) => {
    console.log(`Download: ${progress.percent}%`);
  },
  retries: 3
});
```

### LLM_NET_003_W - Slow Connection
**Cause**: Network connection is slower than expected
**Solution**:
```javascript
// Enable connection optimization
router.enableNetworkOptimization({
  compression: true,
  chunked: true,
  parallel: 4
});

// Use local cache
router.setCacheMode('aggressive');
```

### LLM_NET_004_C - DNS Resolution Failed
**Cause**: Cannot resolve model repository hostname
**Solution**:
```javascript
// Use alternative DNS
router.setDNSServers(['8.8.8.8', '1.1.1.1']);

// Use IP address directly
await router.setModelRepository('https://192.168.1.100/models/');
```

## 💾 Memory & Resource Errors

### LLM_MEM_001_C - Out of Memory
**Cause**: System has exhausted available memory
**Recovery**: Immediate cleanup and possible restart

```javascript
// Emergency memory management
const memManager = router.getMemoryManager();
await memManager.emergencyCleanup();

// Monitor memory usage
memManager.on('memoryPressure', async (level) => {
  if (level > 0.9) {
    await memManager.unloadLeastUsedModels(3);
  }
});
```

### LLM_MEM_002_E - Cache Overflow
**Cause**: Cache has exceeded maximum size
**Solution**:
```javascript
// Configure cache limits
router.configureCache({
  maxSize: '2GB',
  evictionPolicy: 'LRU',
  compression: true
});

// Manual cache management
await router.cache.prune();
await router.cache.optimize();
```

### LLM_MEM_003_W - Memory Fragmentation
**Cause**: Memory is fragmented, affecting performance
**Solution**:
```javascript
// Defragment memory
await router.memoryManager.defragment();

// Use memory pools
router.enableMemoryPools({
  poolSize: '512MB',
  prealloc: true
});
```

### LLM_MEM_004_E - Swap Space Full
**Cause**: Virtual memory swap space is full
**Solution**:
```javascript
// Disable swap usage for critical models
await router.loadModel('critical-model', {
  noSwap: true,
  pinMemory: true
});

// Monitor swap usage
const swapUsage = await router.getSwapUsage();
if (swapUsage > 0.8) {
  console.warn('High swap usage detected');
}
```

## 🔐 Authentication & Security Errors

### LLM_AUTH_001_E - Authentication Failed
**Cause**: Invalid credentials or expired tokens
**Solution**:
```javascript
// Refresh authentication
await router.auth.refresh();

// Use API key authentication
router.authenticate({
  apiKey: process.env.LLM_API_KEY,
  provider: 'huggingface'
});
```

### LLM_AUTH_002_C - Security Violation
**Cause**: Potential security threat detected
**Recovery**: System lockdown

```javascript
// Check security status
const security = await router.getSecurityStatus();
if (security.threatLevel > 3) {
  await router.enableSecurityMode();
}

// Audit authentication
const auditLog = await router.getAuthAudit();
console.log('Recent auth events:', auditLog);
```

### LLM_AUTH_003_E - Rate Limit Exceeded
**Cause**: API rate limit has been exceeded
**Solution**:
```javascript
// Implement rate limiting
router.enableRateLimit({
  requests: 100,
  window: '1h',
  strategy: 'sliding'
});

// Queue requests
await router.queueRequest(request, {
  priority: 'high',
  delay: 5000
});
```

## ⚙️ Configuration Errors

### LLM_CONFIG_001_E - Invalid Configuration
**Cause**: Configuration file contains invalid parameters
**Solution**:
```javascript
// Validate configuration
const validation = await router.validateConfig();
if (!validation.valid) {
  console.log('Config errors:', validation.errors);
  
  // Use default configuration
  await router.resetToDefaults();
}

// Merge with defaults
const config = router.mergeWithDefaults(userConfig);
```

### LLM_CONFIG_002_W - Deprecated Settings
**Cause**: Configuration uses deprecated settings
**Solution**:
```javascript
// Check for deprecated settings
const deprecated = router.findDeprecatedSettings();
console.log('Deprecated settings:', deprecated);

// Auto-migrate configuration
const migrated = await router.migrateConfig();
console.log('Migration successful:', migrated);
```

### LLM_CONFIG_003_E - Environment Mismatch
**Cause**: Configuration doesn't match current environment
**Solution**:
```javascript
// Detect environment
const env = router.detectEnvironment();
console.log('Detected environment:', env);

// Load environment-specific config
await router.loadConfigForEnvironment(env);
```

## 🎯 Engine-Specific Errors

### WebGPU Engine Errors

#### LLM_WEBGPU_001_E - WebGPU Not Available
**Cause**: WebGPU is not supported in current environment
**Solution**:
```javascript
// Check WebGPU support
const webgpuSupported = await router.checkWebGPUSupport();
if (!webgpuSupported) {
  // Fallback to WASM
  router.setEngine('wasm');
}

// Force WebGPU polyfill
await router.loadWebGPUPolyfill();
```

#### LLM_WEBGPU_002_E - GPU Memory Full
**Cause**: GPU memory has been exhausted
**Solution**:
```javascript
// Monitor GPU memory
const gpuMemory = await router.getGPUMemoryUsage();
console.log('GPU memory usage:', gpuMemory);

// Reduce batch size
await model.configure({
  batchSize: 1,
  precision: 'float16'
});
```

### WASM Engine Errors

#### LLM_WASM_001_E - WASM Module Load Failed
**Cause**: WebAssembly module failed to load
**Solution**:
```javascript
// Verify WASM support
const wasmSupported = await router.checkWASMSupport();
if (!wasmSupported) {
  console.error('WASM not supported in this environment');
}

// Preload WASM modules
await router.preloadWASMModules();
```

### Node Engine Errors

#### LLM_NODE_001_E - Native Binding Failed
**Cause**: Native Node.js bindings failed to load
**Solution**:
```javascript
// Check native dependencies
const nativeStatus = await router.checkNativeDependencies();
console.log('Native dependencies:', nativeStatus);

// Rebuild native modules
await router.rebuildNativeModules();
```

## 📦 Loader-Specific Errors

### GGUF Loader Errors

#### LLM_GGUF_001_E - Invalid GGUF Format
**Cause**: File is not a valid GGUF format
**Solution**:
```javascript
// Validate GGUF file
const isValid = await router.validateGGUF('model.gguf');
if (!isValid) {
  // Try format conversion
  await router.convertToGGUF('model.bin');
}
```

#### LLM_GGUF_002_E - Unsupported GGUF Version
**Cause**: GGUF version is not supported
**Solution**:
```javascript
// Check GGUF version
const version = await router.getGGUFVersion('model.gguf');
console.log('GGUF version:', version);

// Update GGUF loader
await router.updateGGUFLoader();
```

### ONNX Loader Errors

#### LLM_ONNX_001_E - ONNX Runtime Missing
**Cause**: ONNX Runtime is not installed
**Solution**:
```javascript
// Install ONNX Runtime
await router.installONNXRuntime();

// Verify installation
const onnxAvailable = await router.checkONNXRuntime();
console.log('ONNX Runtime available:', onnxAvailable);
```

### HuggingFace Loader Errors

#### LLM_HF_001_E - Model Not Found on Hub
**Cause**: Model doesn't exist on HuggingFace Hub
**Solution**:
```javascript
// Search for similar models
const similar = await router.searchHuggingFace('model-name');
console.log('Similar models:', similar);

// Check model status
const status = await router.getHFModelStatus('model-name');
console.log('Model status:', status);
```

#### LLM_HF_002_E - Authentication Required
**Cause**: Model requires authentication
**Solution**:
```javascript
// Set HuggingFace token
router.setHuggingFaceToken(process.env.HF_TOKEN);

// Login interactively
await router.huggingFaceLogin();
```

## 🔄 Recovery Strategies

### Automatic Recovery Patterns

The system implements several automatic recovery strategies:

#### 1. Exponential Backoff
```javascript
class ExponentialBackoff {
  async execute(operation, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        if (attempt === maxRetries) throw error;
        
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
}
```

#### 2. Circuit Breaker
```javascript
class CircuitBreaker {
  constructor(failureThreshold = 5, timeout = 60000) {
    this.failureCount = 0;
    this.failureThreshold = failureThreshold;
    this.timeout = timeout;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
  }
  
  async execute(operation) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }
    
    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
}
```

#### 3. Graceful Degradation
```javascript
async function gracefulInference(prompt, options = {}) {
  const strategies = [
    () => router.generate(prompt, { model: 'gpt-4', ...options }),
    () => router.generate(prompt, { model: 'gpt-3.5', ...options }),
    () => router.generate(prompt, { model: 'llama-2', ...options }),
    () => router.generateLocal(prompt, options)
  ];
  
  for (const strategy of strategies) {
    try {
      return await strategy();
    } catch (error) {
      console.warn('Strategy failed, trying next:', error.message);
    }
  }
  
  throw new Error('All strategies failed');
}
```

### Manual Recovery Procedures

#### System Health Check
```javascript
async function performHealthCheck() {
  const health = {
    timestamp: new Date().toISOString(),
    system: await router.getSystemHealth(),
    models: await router.getModelHealth(),
    engines: await router.getEngineHealth(),
    memory: await router.getMemoryStatus(),
    network: await router.getNetworkStatus()
  };
  
  // Identify issues
  const issues = [];
  if (health.memory.usage > 0.9) {
    issues.push('HIGH_MEMORY_USAGE');
  }
  if (health.network.latency > 5000) {
    issues.push('HIGH_NETWORK_LATENCY');
  }
  
  return { health, issues };
}
```

#### Emergency Procedures
```javascript
async function emergencyRecovery() {
  console.log('🚨 Initiating emergency recovery');
  
  // Stop all non-critical operations
  await router.stopNonCriticalOperations();
  
  // Clear all caches
  await router.clearAllCaches();
  
  // Unload non-essential models
  await router.unloadNonEssentialModels();
  
  // Force garbage collection
  if (global.gc) {
    global.gc();
  }
  
  // Restart core services
  await router.restartCoreServices();
  
  console.log('✅ Emergency recovery complete');
}
```

## 🏅 Error Handling Best Practices

### 1. Structured Error Handling
```javascript
try {
  const result = await router.generate(prompt);
} catch (error) {
  // Check if it's a known error type
  if (error.code?.startsWith('LLM_')) {
    const recovery = ERROR_RECOVERY_MAP[error.code];
    if (recovery) {
      return await recovery(error, { prompt, router });
    }
  }
  
  // Log unknown errors
  logger.error('Unknown error:', error);
  throw error;
}
```

### 2. Error Context Preservation
```javascript
class LLMError extends Error {
  constructor(message, code, context = {}) {
    super(message);
    this.name = 'LLMError';
    this.code = code;
    this.context = context;
    this.timestamp = new Date().toISOString();
  }
  
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      timestamp: this.timestamp,
      stack: this.stack
    };
  }
}
```

### 3. Error Monitoring and Alerting
```javascript
class ErrorMonitor {
  constructor() {
    this.errorCounts = new Map();
    this.alertThresholds = {
      'LLM_CORE_*': 5,    // 5 core errors in 10 minutes
      'LLM_MODEL_*': 10,  // 10 model errors in 10 minutes
      'LLM_MEM_*': 3      // 3 memory errors in 5 minutes
    };
  }
  
  recordError(error) {
    const key = this.getErrorPattern(error.code);
    const count = this.errorCounts.get(key) || 0;
    this.errorCounts.set(key, count + 1);
    
    // Check thresholds
    this.checkAlertThresholds(key, count + 1);
  }
  
  checkAlertThresholds(pattern, count) {
    const threshold = this.alertThresholds[pattern];
    if (threshold && count >= threshold) {
      this.sendAlert(pattern, count);
    }
  }
}
```

## 🔍 Debugging Tools

### Error Diagnostic Tools

#### 1. Error Trace Analyzer
```javascript
const diagnostics = await router.getDiagnostics();
console.log('System Diagnostics:', {
  errors: diagnostics.recentErrors,
  recovery: diagnostics.recoveryAttempts,
  performance: diagnostics.performanceMetrics,
  resources: diagnostics.resourceUsage
});
```

#### 2. Model Health Inspector
```javascript
const modelHealth = await router.inspectModelHealth('model-name');
console.log('Model Health:', {
  loaded: modelHealth.loaded,
  memory: modelHealth.memoryUsage,
  performance: modelHealth.inferenceTime,
  errors: modelHealth.recentErrors
});
```

#### 3. System Resource Monitor
```javascript
const resources = await router.getResourceMonitor();
resources.on('memoryPressure', (level) => {
  console.warn(`Memory pressure: ${level * 100}%`);
});

resources.on('cpuThrottle', (usage) => {
  console.warn(`CPU throttling detected: ${usage}%`);
});
```

### Debug Mode Configuration
```javascript
// Enable comprehensive debugging
const router = new LLMRouter({
  debug: {
    enabled: true,
    level: 'verbose',
    logErrors: true,
    traceRequests: true,
    profilePerformance: true
  }
});

// Debug specific components
router.enableDebug('loader', 'engine', 'memory');
```

### Log Analysis Tools
```javascript
// Analyze error patterns
const errorAnalysis = await router.analyzeErrorLogs({
  timeframe: '24h',
  groupBy: 'error_code',
  includeContext: true
});

console.log('Error Analysis:', {
  mostCommon: errorAnalysis.mostCommon,
  trends: errorAnalysis.trends,
  correlations: errorAnalysis.correlations
});
```

## 📊 Error Metrics and Reporting

### Key Metrics to Monitor

1. **Error Rate**: Errors per hour/day
2. **Recovery Success Rate**: Successful automated recoveries
3. **Mean Time to Recovery (MTTR)**: Average recovery time
4. **Error Distribution**: Error types and frequencies
5. **System Availability**: Uptime percentage

### Metrics Collection
```javascript
class ErrorMetrics {
  constructor() {
    this.metrics = {
      errorRate: new Counter('llm_errors_total'),
      recoverySuccess: new Counter('llm_recovery_success_total'),
      recoveryTime: new Histogram('llm_recovery_duration_seconds'),
      systemAvailability: new Gauge('llm_system_availability')
    };
  }
  
  recordError(error) {
    this.metrics.errorRate.inc({
      code: error.code,
      severity: error.severity
    });
  }
  
  recordRecovery(success, duration) {
    this.metrics.recoverySuccess.inc({ success });
    this.metrics.recoveryTime.observe(duration);
  }
}
```

## 🆘 Emergency Contacts and Escalation

### Escalation Matrix

| Severity | Response Time | Contact | Action |
|----------|---------------|---------|--------|
| **Fatal** | Immediate | On-call engineer | Emergency response |
| **Critical** | 15 minutes | Team lead | Immediate investigation |
| **Error** | 1 hour | Developer | Standard resolution |
| **Warning** | 4 hours | Monitoring team | Investigation |

### Emergency Procedures
```javascript
async function handleEmergency(error) {
  // Immediate notification
  await notifyOnCall(error);
  
  // Create incident
  const incident = await createIncident({
    severity: error.severity,
    description: error.message,
    context: error.context
  });
  
  // Start emergency response
  await initiateEmergencyResponse(incident);
  
  return incident;
}
```

---

## 📚 Additional Resources

- **[Architecture Guide](./ARCHITECTURE.md)** - System architecture overview
- **[Troubleshooting Guide](./TROUBLESHOOTING.md)** - General troubleshooting
- **[Performance Guide](./PERFORMANCE.md)** - Performance optimization
- **[Security Guide](./SECURITY.md)** - Security best practices
- **[API Reference](./API_REFERENCE.md)** - Complete API documentation

## 🤝 Contributing to Error Documentation

Found a new error? Want to improve recovery procedures?

1. Document the error code and context
2. Provide reproduction steps
3. Include recovery solution
4. Test the solution
5. Submit a pull request

---

*Remember: Good error handling is not about preventing all errors, but about gracefully recovering from them and learning for the future.*

**Built with 💙 by Echo AI Systems**