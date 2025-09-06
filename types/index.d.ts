/**
 * TypeScript definitions for LLM Runner Router
 * Universal LLM Model Orchestration System
 */

declare module 'llm-runner-router' {
  import { EventEmitter } from 'events';
  import { Readable } from 'stream';
  
  // Main LLMRouter class
  export class LLMRouter extends EventEmitter {
    constructor(config?: LLMRouterConfig);
    
    // Core methods
    initialize(): Promise<boolean>;
    load(options: LoadOptions): Promise<Model>;
    unload(modelId: string): Promise<boolean>;
    quick(prompt: string, options?: InferenceOptions): Promise<InferenceResult>;
    inference(input: InferenceInput, options?: InferenceOptions): Promise<InferenceResult>;
    stream(prompt: string, options?: StreamOptions): AsyncGenerator<string>;
    chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
    
    // Management methods
    getStatus(): RouterStatus;
    cleanup(): Promise<void>;
    
    // Properties
    registry: Registry;
    router: Router;
    pipeline: Pipeline;
    cache?: CacheManager;
    memory?: MemoryManager;
    ensemble?: ModelEnsemble;
    threadPool?: ThreadPool;
  }
  
  // Configuration interfaces
  export interface LLMRouterConfig {
    autoInit?: boolean;
    strategy?: RoutingStrategy;
    cacheEnabled?: boolean;
    memoryManagement?: boolean;
    maxModels?: number;
    maxMemory?: number;
    engines?: EngineConfig[];
    loaders?: LoaderConfig[];
    logLevel?: 'debug' | 'info' | 'warn' | 'error';
  }
  
  export interface LoadOptions {
    source: string;
    format?: ModelFormat;
    id?: string;
    name?: string;
    metadata?: Record<string, any>;
    parameters?: ModelParameters;
    lazy?: boolean;
  }
  
  export interface InferenceOptions {
    modelId?: string;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    topK?: number;
    repetitionPenalty?: number;
    stopSequences?: string[];
    stream?: boolean;
  }
  
  export interface StreamOptions extends InferenceOptions {
    stream: true;
    bufferSize?: number;
    backpressure?: boolean;
  }
  
  export interface ChatOptions extends InferenceOptions {
    systemPrompt?: string;
    context?: string;
    memory?: boolean;
  }
  
  // Model types
  export interface Model {
    id: string;
    name: string;
    format: ModelFormat;
    source: string;
    loaded: boolean;
    metadata?: ModelMetadata;
    parameters?: ModelParameters;
    instance?: any;
    score?: number;
  }
  
  export interface ModelMetadata {
    size?: number;
    quantization?: string;
    architecture?: string;
    license?: string;
    tags?: string[];
    capabilities?: string[];
    [key: string]: any;
  }
  
  export interface ModelParameters {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    topK?: number;
    repetitionPenalty?: number;
    contextLength?: number;
    vocabSize?: number;
    hiddenSize?: number;
    numLayers?: number;
    numHeads?: number;
  }
  
  export type ModelFormat = 
    | 'gguf' 
    | 'onnx' 
    | 'safetensors' 
    | 'huggingface' 
    | 'tfjs' 
    | 'pytorch' 
    | 'binary'
    | 'simple'
    | 'custom';
  
  // Routing types
  export interface Router {
    config: RouterConfig;
    selectModel(input: string, requirements?: Requirements): Promise<Model | null>;
    route(input: string, options?: RouteOptions): Promise<RouteResult>;
    calculateScores(models: Model[], input: string): Map<string, number>;
  }
  
  export interface RouterConfig {
    strategy: RoutingStrategy;
    fallbacks?: string[];
    requirements?: Requirements;
    maxRetries?: number;
    timeout?: number;
    cacheRoutes?: boolean;
    cacheTTL?: number;
  }
  
  export type RoutingStrategy = 
    | 'quality-first'
    | 'cost-optimized'
    | 'speed-priority'
    | 'balanced'
    | 'random'
    | 'round-robin'
    | 'least-loaded'
    | 'custom';
  
  export interface Requirements {
    minQuality?: number;
    maxLatency?: number;
    maxCost?: number;
    requiredCapabilities?: string[];
    preferredFormats?: ModelFormat[];
    excludeModels?: string[];
  }
  
  export interface RouteOptions {
    requirements?: Requirements;
    timeout?: number;
    retries?: number;
  }
  
  export interface RouteResult {
    modelId: string;
    score: number;
    reasoning?: string;
    fallback?: boolean;
  }
  
  // Registry types
  export interface Registry {
    register(model: Model): void;
    unregister(modelId: string): boolean;
    get(modelId: string): Model | null;
    getAll(): Model[];
    getByFormat(format: ModelFormat): Model[];
    getLoaded(): Model[];
    update(modelId: string, updates: Partial<Model>): boolean;
    clear(): void;
  }
  
  // Pipeline types
  export interface Pipeline {
    config: PipelineConfig;
    process(input: any, options?: ProcessOptions): Promise<any>;
    addStage(stage: PipelineStage): void;
    removeStage(name: string): boolean;
    getStages(): PipelineStage[];
  }
  
  export interface PipelineConfig {
    stages?: PipelineStage[];
    parallel?: boolean;
    timeout?: number;
    errorHandling?: 'stop' | 'continue' | 'fallback';
  }
  
  export interface PipelineStage {
    name: string;
    type: 'preprocess' | 'process' | 'postprocess' | 'transform' | 'validate';
    handler: StageHandler;
    config?: Record<string, any>;
    optional?: boolean;
  }
  
  export type StageHandler = (input: any, context?: StageContext) => Promise<any>;
  
  export interface StageContext {
    stage: string;
    pipeline: string;
    metadata?: Record<string, any>;
  }
  
  export interface ProcessOptions {
    skipStages?: string[];
    metadata?: Record<string, any>;
    timeout?: number;
  }
  
  // Loader types
  export interface Loader {
    name: string;
    format: ModelFormat;
    initialize(): Promise<boolean>;
    load(source: string, options?: LoaderOptions): Promise<any>;
    unload(model: any): Promise<boolean>;
    verify(source: string): Promise<boolean>;
    getMetadata(source: string): Promise<ModelMetadata>;
  }
  
  export interface LoaderOptions {
    lazy?: boolean;
    cache?: boolean;
    quantization?: string;
    device?: 'cpu' | 'gpu' | 'auto';
    [key: string]: any;
  }
  
  export interface LoaderConfig {
    format: ModelFormat;
    enabled?: boolean;
    options?: LoaderOptions;
  }
  
  // Engine types
  export interface Engine {
    name: string;
    type: EngineType;
    initialize(): Promise<boolean>;
    execute(model: any, input: any, options?: EngineOptions): Promise<any>;
    isSupported(): boolean;
    getCapabilities(): EngineCapabilities;
    cleanup(): Promise<void>;
  }
  
  export type EngineType = 
    | 'webgpu' 
    | 'wasm' 
    | 'node' 
    | 'worker' 
    | 'edge' 
    | 'browser'
    | 'custom';
  
  export interface EngineOptions {
    device?: 'cpu' | 'gpu' | 'auto';
    precision?: 'float32' | 'float16' | 'int8';
    batchSize?: number;
    timeout?: number;
    [key: string]: any;
  }
  
  export interface EngineConfig {
    type: EngineType;
    enabled?: boolean;
    priority?: number;
    options?: EngineOptions;
  }
  
  export interface EngineCapabilities {
    formats: ModelFormat[];
    maxMemory?: number;
    supportsStreaming?: boolean;
    supportsBatching?: boolean;
    supportsQuantization?: string[];
  }
  
  // Memory Manager types
  export interface MemoryManager {
    config: MemoryConfig;
    allocate(size: number, priority?: number): Promise<MemoryAllocation>;
    free(allocation: MemoryAllocation): Promise<void>;
    getUsage(): MemoryUsage;
    optimize(): Promise<void>;
    enableSwapping(path: string): void;
    cleanup(): Promise<void>;
  }
  
  export interface MemoryConfig {
    maxMemory?: number;
    swapEnabled?: boolean;
    swapPath?: string;
    compressionEnabled?: boolean;
    gcInterval?: number;
    pooling?: boolean;
  }
  
  export interface MemoryAllocation {
    id: string;
    size: number;
    priority: number;
    compressed?: boolean;
    swapped?: boolean;
  }
  
  export interface MemoryUsage {
    used: number;
    total: number;
    available: number;
    percentage: number;
    allocations: number;
    pools?: MemoryPoolInfo[];
  }
  
  export interface MemoryPoolInfo {
    size: number;
    used: number;
    free: number;
    allocations: number;
  }
  
  // Cache Manager types
  export interface CacheManager {
    config: CacheConfig;
    get(key: string): Promise<any>;
    set(key: string, value: any, ttl?: number): Promise<void>;
    has(key: string): Promise<boolean>;
    delete(key: string): Promise<boolean>;
    clear(): Promise<void>;
    getStats(): CacheStats;
  }
  
  export interface CacheConfig {
    maxSize?: number;
    ttl?: number;
    strategy?: 'lru' | 'lfu' | 'fifo' | 'ttl';
    levels?: CacheLevel[];
    compression?: boolean;
    persistence?: boolean;
  }
  
  export interface CacheLevel {
    name: string;
    type: 'memory' | 'disk' | 'distributed';
    maxSize: number;
    ttl?: number;
  }
  
  export interface CacheStats {
    hits: number;
    misses: number;
    hitRate: number;
    size: number;
    entries: number;
    evictions: number;
  }
  
  // Stream Processor types
  export interface StreamProcessor {
    config: StreamConfig;
    createStream(generator: AsyncGenerator<any>): Readable;
    transform(stream: Readable, transformer: Transformer): Readable;
    merge(streams: Readable[]): Readable;
    split(stream: Readable, splitter: Splitter): Readable[];
    monitor(stream: Readable): StreamMonitor;
  }
  
  export interface StreamConfig {
    bufferSize?: number;
    highWaterMark?: number;
    backpressure?: boolean;
    encoding?: string;
    objectMode?: boolean;
  }
  
  export type Transformer = (chunk: any) => any | Promise<any>;
  export type Splitter = (chunk: any) => number;
  
  export interface StreamMonitor {
    bytesRead: number;
    bytesWritten: number;
    chunks: number;
    errors: number;
    startTime: number;
    endTime?: number;
  }
  
  // Model Ensemble types
  export interface ModelEnsemble extends EventEmitter {
    config: EnsembleConfig;
    addModel(modelId: string, model: any, weight?: number): void;
    removeModel(modelId: string): boolean;
    inference(input: any, options?: EnsembleOptions): Promise<any>;
    getStatistics(): EnsembleStats;
    cleanup(): Promise<void>;
  }
  
  export interface EnsembleConfig {
    strategy: EnsembleStrategy;
    weights?: number[];
    threshold?: number;
    maxModels?: number;
    timeout?: number;
    parallelExecution?: boolean;
    consensusRequired?: number;
  }
  
  export type EnsembleStrategy = 
    | 'weighted-average'
    | 'voting'
    | 'stacking'
    | 'boosting'
    | 'mixture-of-experts';
  
  export interface EnsembleOptions {
    timeout?: number;
    parallel?: boolean;
  }
  
  export interface EnsembleStats {
    modelCount: number;
    strategy: EnsembleStrategy;
    weights: Record<string, number>;
    performance: Record<string, ModelPerformance>;
  }
  
  export interface ModelPerformance {
    successRate: number;
    averageLatency: number;
    totalRequests: number;
  }
  
  // Thread Pool types
  export interface ThreadPool extends EventEmitter {
    config: ThreadPoolConfig;
    execute(type: string, data: any): Promise<any>;
    getStatistics(): ThreadPoolStats;
    cleanup(): Promise<void>;
  }
  
  export interface ThreadPoolConfig {
    minThreads?: number;
    maxThreads?: number;
    idleTimeout?: number;
    taskTimeout?: number;
    maxQueueSize?: number;
    workerScript?: string;
    resourceLimits?: WorkerResourceLimits;
    autoScale?: boolean;
  }
  
  export interface WorkerResourceLimits {
    maxOldGenerationSizeMb?: number;
    maxYoungGenerationSizeMb?: number;
    codeRangeSizeMb?: number;
  }
  
  export interface ThreadPoolStats {
    tasksCompleted: number;
    tasksFailed: number;
    averageExecutionTime: number;
    currentThreads: number;
    activeWorkers: number;
    idleWorkers: number;
    queueSize: number;
  }
  
  // API types
  export interface WebSocketAPI {
    config: WebSocketConfig;
    initialize(server: any): Promise<void>;
    broadcast(message: any): void;
    sendTo(clientId: string, message: any): void;
    getClients(): Map<string, WebSocketClient>;
    cleanup(): Promise<void>;
  }
  
  export interface WebSocketConfig {
    port?: number;
    path?: string;
    maxClients?: number;
    pingInterval?: number;
    messageLimit?: number;
    compression?: boolean;
  }
  
  export interface WebSocketClient {
    id: string;
    connected: Date;
    lastPing?: Date;
    messageCount: number;
  }
  
  export interface GraphQLAPI {
    config: GraphQLConfig;
    initialize(server: any, router: LLMRouter): Promise<void>;
    getMiddleware(app: any): Promise<any>;
    cleanup(): Promise<void>;
  }
  
  export interface GraphQLConfig {
    path?: string;
    playground?: boolean;
    introspection?: boolean;
    subscriptions?: boolean;
    maxComplexity?: number;
    depthLimit?: number;
  }
  
  // Result types
  export interface InferenceResult {
    text?: string;
    tokens?: number[];
    embeddings?: number[][];
    metadata?: ResultMetadata;
    model?: string;
    duration?: number;
  }
  
  export interface ResultMetadata {
    modelId: string;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    finishReason?: 'stop' | 'length' | 'error';
    usage?: TokenUsage;
  }
  
  export interface TokenUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  }
  
  export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
    metadata?: Record<string, any>;
  }
  
  export interface ChatResponse {
    message: ChatMessage;
    usage?: TokenUsage;
    model?: string;
    duration?: number;
  }
  
  export interface InferenceInput {
    prompt?: string;
    messages?: ChatMessage[];
    context?: string;
    embeddings?: number[];
    [key: string]: any;
  }
  
  // Status types
  export interface RouterStatus {
    initialized: boolean;
    modelsLoaded: number;
    engine: string;
    memory?: MemoryUsage;
    cache?: CacheStats;
    uptime?: number;
  }
  
  // Error types
  export class LLMRouterError extends Error {
    code: string;
    details?: any;
  }
  
  export class ModelLoadError extends LLMRouterError {
    modelId: string;
    format: ModelFormat;
  }
  
  export class InferenceError extends LLMRouterError {
    modelId: string;
    input: any;
  }
  
  export class EngineError extends LLMRouterError {
    engine: string;
    operation: string;
  }
  
  // Utility types
  export interface Logger {
    debug(message: string, ...args: any[]): void;
    info(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
    error(message: string, ...args: any[]): void;
  }
  
  // Default export
  const defaultRouter: LLMRouter;
  export default defaultRouter;
  
  // Named exports for convenience functions
  export function quick(prompt: string, options?: InferenceOptions): Promise<InferenceResult>;
  export function chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
  export function stream(prompt: string, options?: StreamOptions): AsyncGenerator<string>;
  export function load(options: LoadOptions): Promise<Model>;
  export function unload(modelId: string): Promise<boolean>;
  export function initialize(): Promise<boolean>;
}