/**
 * 🔬 Performance Profiler - Deep System Analysis Engine
 * CPU, memory profiling, heap snapshots, and performance bottleneck detection
 * Echo AI Systems - Optimizing at the molecular level
 */

import { performance, PerformanceObserver } from 'perf_hooks';
import inspector from 'inspector';
import { promises as fs } from 'fs';
import path from 'path';
import EventEmitter from 'events';
import Logger from '../utils/Logger.js';

class PerformanceProfiler extends EventEmitter {
  constructor(config = {}) {
    super();
    this.logger = new Logger('Profiler');
    this.config = {
      outputDir: config.outputDir || './profiles',
      autoProfile: config.autoProfile ?? false,
      profileDuration: config.profileDuration || 30000, // 30 seconds
      heapSnapshotInterval: config.heapSnapshotInterval || 300000, // 5 minutes
      performanceThresholds: {
        cpuUsage: config.performanceThresholds?.cpuUsage || 80, // 80%
        memoryUsage: config.performanceThresholds?.memoryUsage || 512 * 1024 * 1024, // 512MB
        gcFrequency: config.performanceThresholds?.gcFrequency || 10, // per minute
        ...config.performanceThresholds,
      },
      ...config,
    };

    this.isRunning = false;
    this.profiles = new Map();
    this.performanceMarks = new Map();
    this.metrics = {
      cpu: [],
      memory: [],
      gc: [],
      operations: new Map(),
    };
    
    this.session = null;
    this.performanceObserver = null;
    
    this._setupPerformanceObserver();
    this._ensureOutputDirectory();
  }

  /**
   * Setup performance observer for monitoring
   */
  _setupPerformanceObserver() {
    this.performanceObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        this._handlePerformanceEntry(entry);
      }
    });

    // Observe all performance entry types
    this.performanceObserver.observe({ 
      entryTypes: ['measure', 'mark', 'function', 'gc'] 
    });
  }

  /**
   * Handle performance entries
   */
  _handlePerformanceEntry(entry) {
    switch (entry.entryType) {
      case 'gc':
        this._handleGCEntry(entry);
        break;
      case 'measure':
        this._handleMeasureEntry(entry);
        break;
      case 'mark':
        this._handleMarkEntry(entry);
        break;
      case 'function':
        this._handleFunctionEntry(entry);
        break;
    }
  }

  /**
   * Handle garbage collection entries
   */
  _handleGCEntry(entry) {
    this.metrics.gc.push({
      timestamp: Date.now(),
      duration: entry.duration,
      type: entry.detail?.type || 'unknown',
      flags: entry.detail?.flags || 0,
    });

    // Keep only recent GC data
    const oneHourAgo = Date.now() - 3600000;
    this.metrics.gc = this.metrics.gc.filter(gc => gc.timestamp > oneHourAgo);

    // Check GC frequency
    const recentGCs = this.metrics.gc.filter(gc => gc.timestamp > Date.now() - 60000);
    if (recentGCs.length > this.config.performanceThresholds.gcFrequency) {
      this.emit('high-gc-frequency', {
        count: recentGCs.length,
        threshold: this.config.performanceThresholds.gcFrequency,
      });
    }
  }

  /**
   * Handle measure entries
   */
  _handleMeasureEntry(entry) {
    const operation = entry.name;
    if (!this.metrics.operations.has(operation)) {
      this.metrics.operations.set(operation, []);
    }
    
    this.metrics.operations.get(operation).push({
      timestamp: Date.now(),
      duration: entry.duration,
      startTime: entry.startTime,
    });

    // Emit slow operation events
    if (entry.duration > 1000) { // More than 1 second
      this.emit('slow-operation', {
        operation,
        duration: entry.duration,
        threshold: 1000,
      });
    }
  }

  /**
   * Handle mark entries
   */
  _handleMarkEntry(entry) {
    this.performanceMarks.set(entry.name, {
      timestamp: Date.now(),
      startTime: entry.startTime,
    });
  }

  /**
   * Handle function entries
   */
  _handleFunctionEntry(entry) {
    // Log function performance data
    this.logger.debug(`Function ${entry.name}: ${entry.duration}ms`);
  }

  /**
   * Ensure output directory exists
   */
  async _ensureOutputDirectory() {
    try {
      await fs.mkdir(this.config.outputDir, { recursive: true });
    } catch (error) {
      this.logger.error('Failed to create profiles directory:', error);
    }
  }

  /**
   * Start profiling session
   */
  async start() {
    if (this.isRunning) {
      this.logger.warn('Profiler already running');
      return;
    }

    this.isRunning = true;
    this.logger.info('Starting performance profiler');

    // Start CPU profiling if inspector is available
    if (inspector.url()) {
      this.logger.warn('Inspector already connected, skipping session creation');
    } else {
      inspector.open();
    }

    this.session = new inspector.Session();
    this.session.connect();

    // Start performance monitoring
    this._startPerformanceMonitoring();

    // Auto-profile if configured
    if (this.config.autoProfile) {
      this._startAutoProfile();
    }

    this.emit('started');
  }

  /**
   * Stop profiling session
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    this.logger.info('Stopping performance profiler');

    if (this.session) {
      this.session.disconnect();
      this.session = null;
    }

    this.emit('stopped');
  }

  /**
   * Start performance monitoring
   */
  _startPerformanceMonitoring() {
    const monitorInterval = setInterval(() => {
      if (!this.isRunning) {
        clearInterval(monitorInterval);
        return;
      }

      this._collectSystemMetrics();
    }, 5000); // Every 5 seconds
  }

  /**
   * Collect system metrics
   */
  _collectSystemMetrics() {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    this.metrics.memory.push({
      timestamp: Date.now(),
      ...memUsage,
    });

    this.metrics.cpu.push({
      timestamp: Date.now(),
      ...cpuUsage,
    });

    // Keep only recent data (last hour)
    const oneHourAgo = Date.now() - 3600000;
    this.metrics.memory = this.metrics.memory.filter(m => m.timestamp > oneHourAgo);
    this.metrics.cpu = this.metrics.cpu.filter(c => c.timestamp > oneHourAgo);

    // Check thresholds
    if (memUsage.heapUsed > this.config.performanceThresholds.memoryUsage) {
      this.emit('high-memory-usage', {
        current: memUsage.heapUsed,
        threshold: this.config.performanceThresholds.memoryUsage,
      });
    }
  }

  /**
   * Start auto-profiling
   */
  _startAutoProfile() {
    const profileInterval = setInterval(async () => {
      if (!this.isRunning) {
        clearInterval(profileInterval);
        return;
      }

      try {
        await this.profileCPU(this.config.profileDuration);
        await this.takeHeapSnapshot();
      } catch (error) {
        this.logger.error('Auto-profile failed:', error);
      }
    }, this.config.heapSnapshotInterval);
  }

  /**
   * Profile CPU usage
   */
  async profileCPU(duration = 30000) {
    if (!this.session) {
      throw new Error('Profiler session not active');
    }

    const profileId = `cpu_${Date.now()}`;
    this.logger.info(`Starting CPU profile: ${profileId} (${duration}ms)`);

    return new Promise((resolve, reject) => {
      this.session.post('Profiler.enable', () => {
        this.session.post('Profiler.start', () => {
          setTimeout(() => {
            this.session.post('Profiler.stop', async (err, { profile }) => {
              if (err) {
                reject(err);
                return;
              }

              try {
                const filename = `${profileId}.cpuprofile`;
                const filepath = path.join(this.config.outputDir, filename);
                
                await fs.writeFile(filepath, JSON.stringify(profile, null, 2));
                
                this.profiles.set(profileId, {
                  type: 'cpu',
                  filename,
                  filepath,
                  timestamp: new Date(),
                  duration,
                  size: Buffer.byteLength(JSON.stringify(profile)),
                });

                this.logger.success(`CPU profile saved: ${filename}`);
                this.emit('profile-complete', {
                  type: 'cpu',
                  profileId,
                  filepath,
                });

                resolve(filepath);
              } catch (error) {
                reject(error);
              }
            });
          }, duration);
        });
      });
    });
  }

  /**
   * Take heap snapshot
   */
  async takeHeapSnapshot() {
    if (!this.session) {
      throw new Error('Profiler session not active');
    }

    const snapshotId = `heap_${Date.now()}`;
    this.logger.info(`Taking heap snapshot: ${snapshotId}`);

    return new Promise((resolve, reject) => {
      const filename = `${snapshotId}.heapsnapshot`;
      const filepath = path.join(this.config.outputDir, filename);
      
      const writeStream = require('fs').createWriteStream(filepath);
      let size = 0;

      this.session.on('HeapProfiler.addHeapSnapshotChunk', (m) => {
        size += Buffer.byteLength(m.params.chunk);
        writeStream.write(m.params.chunk);
      });

      this.session.post('HeapProfiler.takeHeapSnapshot', null, (err) => {
        if (err) {
          reject(err);
          return;
        }

        writeStream.end(() => {
          this.profiles.set(snapshotId, {
            type: 'heap',
            filename,
            filepath,
            timestamp: new Date(),
            size,
          });

          this.logger.success(`Heap snapshot saved: ${filename} (${(size / 1024 / 1024).toFixed(2)}MB)`);
          this.emit('profile-complete', {
            type: 'heap',
            profileId: snapshotId,
            filepath,
          });

          resolve(filepath);
        });
      });
    });
  }

  /**
   * Profile memory usage
   */
  async profileMemory(duration = 30000) {
    const profileId = `memory_${Date.now()}`;
    this.logger.info(`Starting memory profile: ${profileId} (${duration}ms)`);

    const samples = [];
    const interval = 100; // Sample every 100ms
    const totalSamples = duration / interval;

    return new Promise((resolve) => {
      let sampleCount = 0;
      
      const sampleInterval = setInterval(() => {
        const memUsage = process.memoryUsage();
        samples.push({
          timestamp: Date.now(),
          ...memUsage,
        });

        sampleCount++;
        if (sampleCount >= totalSamples) {
          clearInterval(sampleInterval);
          
          const filename = `${profileId}.json`;
          const filepath = path.join(this.config.outputDir, filename);
          
          const profileData = {
            profileId,
            type: 'memory',
            duration,
            samples,
            summary: this._analyzeMemoryProfile(samples),
          };

          fs.writeFile(filepath, JSON.stringify(profileData, null, 2))
            .then(() => {
              this.profiles.set(profileId, {
                type: 'memory',
                filename,
                filepath,
                timestamp: new Date(),
                duration,
                samples: samples.length,
              });

              this.logger.success(`Memory profile saved: ${filename}`);
              resolve(filepath);
            })
            .catch((error) => {
              this.logger.error('Failed to save memory profile:', error);
              resolve(null);
            });
        }
      }, interval);
    });
  }

  /**
   * Analyze memory profile data
   */
  _analyzeMemoryProfile(samples) {
    if (samples.length === 0) return {};

    const heapUsed = samples.map(s => s.heapUsed);
    const heapTotal = samples.map(s => s.heapTotal);
    const external = samples.map(s => s.external);

    return {
      heapUsed: {
        min: Math.min(...heapUsed),
        max: Math.max(...heapUsed),
        avg: heapUsed.reduce((sum, val) => sum + val, 0) / heapUsed.length,
      },
      heapTotal: {
        min: Math.min(...heapTotal),
        max: Math.max(...heapTotal),
        avg: heapTotal.reduce((sum, val) => sum + val, 0) / heapTotal.length,
      },
      external: {
        min: Math.min(...external),
        max: Math.max(...external),
        avg: external.reduce((sum, val) => sum + val, 0) / external.length,
      },
      growthRate: this._calculateGrowthRate(heapUsed),
    };
  }

  /**
   * Calculate memory growth rate
   */
  _calculateGrowthRate(values) {
    if (values.length < 2) return 0;
    
    const start = values[0];
    const end = values[values.length - 1];
    const duration = values.length;
    
    return (end - start) / duration;
  }

  /**
   * Mark performance point
   */
  mark(name) {
    performance.mark(name);
    this.logger.debug(`Performance mark: ${name}`);
  }

  /**
   * Measure performance between marks
   */
  measure(name, startMark, endMark) {
    try {
      performance.measure(name, startMark, endMark);
      this.logger.debug(`Performance measure: ${name}`);
    } catch (error) {
      this.logger.error(`Failed to measure ${name}:`, error);
    }
  }

  /**
   * Time a function execution
   */
  async timeFunction(name, fn) {
    const startMark = `${name}_start`;
    const endMark = `${name}_end`;
    
    this.mark(startMark);
    
    try {
      const result = await fn();
      this.mark(endMark);
      this.measure(name, startMark, endMark);
      return result;
    } catch (error) {
      this.mark(endMark);
      this.measure(name, startMark, endMark);
      throw error;
    }
  }

  /**
   * Generate flame graph data
   */
  async generateFlameGraph(profilePath) {
    try {
      const profileData = await fs.readFile(profilePath, 'utf8');
      const profile = JSON.parse(profileData);
      
      // Generate flame graph data structure
      const flameGraph = this._convertToFlameGraph(profile);
      
      const flameGraphPath = profilePath.replace(/\.(cpuprofile|json)$/, '.flamegraph.json');
      await fs.writeFile(flameGraphPath, JSON.stringify(flameGraph, null, 2));
      
      this.logger.success(`Flame graph generated: ${flameGraphPath}`);
      return flameGraphPath;
    } catch (error) {
      this.logger.error('Failed to generate flame graph:', error);
      throw error;
    }
  }

  /**
   * Convert profile to flame graph format
   */
  _convertToFlameGraph(profile) {
    // Simplified flame graph conversion
    // In production, use proper flame graph libraries
    return {
      name: 'root',
      value: profile.endTime - profile.startTime,
      children: this._processProfileNodes(profile.nodes, profile.samples, profile.timeDeltas),
    };
  }

  /**
   * Process profile nodes for flame graph
   */
  _processProfileNodes(nodes, samples, timeDeltas) {
    const nodeMap = new Map();
    
    // Build node map
    nodes.forEach((node, index) => {
      nodeMap.set(node.id, {
        ...node,
        index,
        children: [],
        selfTime: 0,
        totalTime: 0,
      });
    });
    
    // Calculate timing information
    samples.forEach((sample, index) => {
      const timeDelta = timeDeltas[index] || 1;
      const node = nodeMap.get(sample);
      if (node) {
        node.selfTime += timeDelta;
        node.totalTime += timeDelta;
      }
    });
    
    return Array.from(nodeMap.values()).map(node => ({
      name: node.callFrame.functionName || '(anonymous)',
      value: node.totalTime,
      url: node.callFrame.url,
      line: node.callFrame.lineNumber,
      column: node.callFrame.columnNumber,
    }));
  }

  /**
   * Detect performance bottlenecks
   */
  detectBottlenecks() {
    const bottlenecks = [];
    
    // Analyze GC frequency
    const recentGCs = this.metrics.gc.filter(gc => gc.timestamp > Date.now() - 60000);
    if (recentGCs.length > this.config.performanceThresholds.gcFrequency) {
      bottlenecks.push({
        type: 'high_gc_frequency',
        severity: 'warning',
        message: `High GC frequency: ${recentGCs.length} collections in the last minute`,
        data: { count: recentGCs.length, threshold: this.config.performanceThresholds.gcFrequency },
      });
    }
    
    // Analyze memory growth
    const recentMemory = this.metrics.memory.slice(-10);
    if (recentMemory.length >= 2) {
      const growthRate = this._calculateGrowthRate(recentMemory.map(m => m.heapUsed));
      if (growthRate > 1024 * 1024) { // 1MB/sample growth
        bottlenecks.push({
          type: 'memory_leak',
          severity: 'critical',
          message: `Potential memory leak detected: ${(growthRate / 1024 / 1024).toFixed(2)}MB/sample growth`,
          data: { growthRate },
        });
      }
    }
    
    // Analyze slow operations
    for (const [operation, measurements] of this.metrics.operations) {
      const recent = measurements.filter(m => m.timestamp > Date.now() - 300000); // Last 5 minutes
      const avgDuration = recent.reduce((sum, m) => sum + m.duration, 0) / recent.length;
      
      if (avgDuration > 1000 && recent.length > 5) { // Slow and frequent
        bottlenecks.push({
          type: 'slow_operation',
          severity: 'warning',
          message: `Slow operation detected: ${operation} (avg: ${avgDuration.toFixed(1)}ms)`,
          data: { operation, avgDuration, count: recent.length },
        });
      }
    }
    
    return bottlenecks;
  }

  /**
   * Generate performance report
   */
  async generateReport() {
    const report = {
      timestamp: new Date(),
      uptime: process.uptime(),
      profiles: Object.fromEntries(this.profiles),
      metrics: {
        memory: this.metrics.memory.slice(-100), // Last 100 samples
        cpu: this.metrics.cpu.slice(-100),
        gc: this.metrics.gc.slice(-50),
        operations: Object.fromEntries(
          Array.from(this.metrics.operations.entries()).map(([key, values]) => [
            key,
            values.slice(-10) // Last 10 measurements per operation
          ])
        ),
      },
      bottlenecks: this.detectBottlenecks(),
      summary: {
        totalProfiles: this.profiles.size,
        memoryTrend: this._analyzeMemoryTrend(),
        gcSummary: this._analyzeGCSummary(),
      },
    };
    
    const reportPath = path.join(this.config.outputDir, `report_${Date.now()}.json`);
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    
    this.logger.success(`Performance report generated: ${reportPath}`);
    return reportPath;
  }

  /**
   * Analyze memory trend
   */
  _analyzeMemoryTrend() {
    const recent = this.metrics.memory.slice(-20);
    if (recent.length < 2) return 'insufficient_data';
    
    const trend = this._calculateGrowthRate(recent.map(m => m.heapUsed));
    
    if (trend > 1024 * 1024) return 'increasing';
    if (trend < -1024 * 1024) return 'decreasing';
    return 'stable';
  }

  /**
   * Analyze GC summary
   */
  _analyzeGCSummary() {
    const recent = this.metrics.gc.filter(gc => gc.timestamp > Date.now() - 300000); // Last 5 minutes
    
    return {
      count: recent.length,
      avgDuration: recent.length > 0 ? recent.reduce((sum, gc) => sum + gc.duration, 0) / recent.length : 0,
      totalTime: recent.reduce((sum, gc) => sum + gc.duration, 0),
    };
  }

  /**
   * Clean up old profiles
   */
  async cleanupProfiles(maxAge = 24 * 60 * 60 * 1000) { // 24 hours
    const cutoff = Date.now() - maxAge;
    const toDelete = [];
    
    for (const [profileId, profile] of this.profiles) {
      if (profile.timestamp.getTime() < cutoff) {
        toDelete.push(profileId);
        
        try {
          await fs.unlink(profile.filepath);
          this.logger.info(`Deleted old profile: ${profile.filename}`);
        } catch (error) {
          this.logger.error(`Failed to delete profile ${profile.filename}:`, error);
        }
      }
    }
    
    toDelete.forEach(profileId => this.profiles.delete(profileId));
    this.logger.info(`Cleaned up ${toDelete.length} old profiles`);
  }

  /**
   * Get profiler status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      profilesCount: this.profiles.size,
      outputDir: this.config.outputDir,
      autoProfile: this.config.autoProfile,
      recentBottlenecks: this.detectBottlenecks(),
      memoryTrend: this._analyzeMemoryTrend(),
    };
  }
}

// Export singleton instance
const profiler = new PerformanceProfiler();

export default profiler;
export { PerformanceProfiler };