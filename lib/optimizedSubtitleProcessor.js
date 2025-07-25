// lib/optimizedSubtitleProcessor.js
// Optimized Subtitle Processing Pipeline with Performance Enhancements

const AIWorkerPool = require('./workers/aiWorkerPool');
const EnhancedCacheManager = require('./cache/enhancedCacheManager');
const SubtitleDatabase = require('./database/subtitleDatabase');
const PerformanceMonitor = require('./monitoring/performanceMonitor');
const EventEmitter = require('events');

class OptimizedSubtitleProcessor extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.config = {
            // Worker pool settings
            maxWorkers: options.maxWorkers || Math.min(4, require('os').cpus().length),
            workerTimeout: options.workerTimeout || 30000,
            
            // Cache settings
            enableL1Cache: options.enableL1Cache !== false,
            enableL2Cache: options.enableL2Cache !== false,
            cachePrefix: options.cachePrefix || 'vlsub:optimized:',
            
            // Database settings
            enableDatabase: options.enableDatabase !== false,
            dbPath: options.dbPath,
            
            // Performance settings
            enableMonitoring: options.enableMonitoring !== false,
            batchSize: options.batchSize || 5,
            maxConcurrentRequests: options.maxConcurrentRequests || 10,
            
            // Processing settings
            enableAIEnhancement: options.enableAIEnhancement !== false,
            aiPriority: options.aiPriority || 5,
            fallbackTimeout: options.fallbackTimeout || 15000,
            
            // Quality settings
            minQualityScore: options.minQualityScore || 50,
            preferAIEnhanced: options.preferAIEnhanced !== false
        };
        
        // Initialize components
        this.aiWorkerPool = null;
        this.cacheManager = null;
        this.database = null;
        this.performanceMonitor = null;
        
        // Processing state
        this.isInitialized = false;
        this.activeRequests = new Map();
        this.requestQueue = [];
        this.processingStats = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            cacheHits: 0,
            aiEnhancements: 0,
            averageProcessingTime: 0
        };
        
        console.log('[OptimizedSubtitleProcessor] Initializing with enhanced performance features');
        this.initialize();
    }
    
    async initialize() {
        try {
            console.log('[OptimizedSubtitleProcessor] Starting initialization...');
            
            // Initialize performance monitoring first
            if (this.config.enableMonitoring) {
                this.performanceMonitor = new PerformanceMonitor({
                    collectInterval: 30000,
                    enableSystemMetrics: true,
                    enableCustomMetrics: true
                });
                this.performanceMonitor.start();
                console.log('[OptimizedSubtitleProcessor] Performance monitoring started');
            }
            
            // Initialize AI worker pool
            this.aiWorkerPool = new AIWorkerPool({
                maxWorkers: this.config.maxWorkers
            });
            
            // Set up worker pool event handlers
            this.aiWorkerPool.on('jobCompleted', (data) => {
                this.handleWorkerJobCompleted(data);
            });
            
            this.aiWorkerPool.on('jobError', (data) => {
                this.handleWorkerJobError(data);
            });
            
            console.log('[OptimizedSubtitleProcessor] AI worker pool initialized');
            
            // Initialize cache manager
            this.cacheManager = new EnhancedCacheManager({
                maxMemorySize: 2000,
                enableCompression: true,
                redisPrefix: this.config.cachePrefix
            });
            
            // Set up cache event handlers
            this.cacheManager.on('redis_connected', () => {
                console.log('[OptimizedSubtitleProcessor] Redis cache connected');
            });
            
            this.cacheManager.on('redis_error', (error) => {
                console.warn('[OptimizedSubtitleProcessor] Redis cache error:', error.message);
            });
            
            console.log('[OptimizedSubtitleProcessor] Enhanced cache manager initialized');
            
            // Initialize database
            if (this.config.enableDatabase) {
                this.database = new SubtitleDatabase({
                    dbPath: this.config.dbPath,
                    enableWAL: true,
                    enableBackup: true
                });
                
                // Set up database event handlers
                this.database.on('initialized', () => {
                    console.log('[OptimizedSubtitleProcessor] Database initialized');
                });
                
                this.database.on('error', (error) => {
                    console.error('[OptimizedSubtitleProcessor] Database error:', error);
                });
            }
            
            // Start request processing
            this.startRequestProcessor();
            
            this.isInitialized = true;
            console.log('[OptimizedSubtitleProcessor] Initialization completed successfully');
            this.emit('initialized');
            
        } catch (error) {
            console.error('[OptimizedSubtitleProcessor] Initialization failed:', error);
            this.emit('error', error);
            throw error;
        }
    }
    
    // Main processing method
    async processSubtitle(request) {
        const requestId = this.generateRequestId();
        const startTime = Date.now();
        
        try {
            console.log(`[OptimizedSubtitleProcessor] Processing request ${requestId}:`, {
                videoId: request.videoId,
                provider: request.provider,
                language: request.language,
                enableAI: request.enableAI !== false
            });
            
            // Validate request
            this.validateRequest(request);
            
            // Update stats
            this.processingStats.totalRequests++;
            
            // Record performance metrics
            if (this.performanceMonitor) {
                this.performanceMonitor.recordCustomMetric('subtitle_request_started', 1, 'count', {
                    videoId: request.videoId,
                    provider: request.provider
                });
            }
            
            // Phase 1: Check cache first
            const cachedResult = await this.checkCache(request, requestId);
            if (cachedResult) {
                const processingTime = Date.now() - startTime;
                this.processingStats.cacheHits++;
                this.processingStats.successfulRequests++;
                this.updateAverageProcessingTime(processingTime);
                
                if (this.performanceMonitor) {
                    this.performanceMonitor.recordSubtitleRequest(true, processingTime, { source: 'cache' });
                    this.performanceMonitor.recordCacheOperation(true, processingTime);
                }
                
                console.log(`[OptimizedSubtitleProcessor] Cache hit for request ${requestId} in ${processingTime}ms`);
                return cachedResult;
            }
            
            // Phase 2: Process with original subtitle matcher
            const originalResult = await this.processWithOriginalMatcher(request, requestId);
            if (!originalResult) {
                throw new Error('Failed to get subtitle from providers');
            }
            
            // Phase 3: AI enhancement (if enabled and content is suitable)
            let finalResult = originalResult;
            if (request.enableAI !== false && this.config.enableAIEnhancement && this.shouldEnhanceWithAI(originalResult)) {
                try {
                    const aiResult = await this.enhanceWithAI(originalResult, request, requestId);
                    if (aiResult && this.isValidSubtitleContent(aiResult)) {
                        finalResult = {
                            ...originalResult,
                            content: aiResult,
                            aiEnhanced: true,
                            qualityScore: (originalResult.qualityScore || 0) + 100
                        };
                        this.processingStats.aiEnhancements++;
                        
                        console.log(`[OptimizedSubtitleProcessor] AI enhancement completed for request ${requestId}`);
                    }
                } catch (aiError) {
                    console.warn(`[OptimizedSubtitleProcessor] AI enhancement failed for request ${requestId}:`, aiError.message);
                    // Continue with original result
                }
            }
            
            // Phase 4: Cache the result
            await this.cacheResult(request, finalResult, requestId);
            
            // Phase 5: Store in database
            if (this.database) {
                await this.storeInDatabase(request, finalResult, requestId);
            }
            
            // Update stats and metrics
            const processingTime = Date.now() - startTime;
            this.processingStats.successfulRequests++;
            this.updateAverageProcessingTime(processingTime);
            
            if (this.performanceMonitor) {
                this.performanceMonitor.recordSubtitleRequest(true, processingTime, {
                    source: 'processed',
                    aiEnhanced: finalResult.aiEnhanced || false
                });
            }
            
            console.log(`[OptimizedSubtitleProcessor] Request ${requestId} completed successfully in ${processingTime}ms`);
            this.emit('requestCompleted', { requestId, processingTime, result: finalResult });
            
            return finalResult;
            
        } catch (error) {
            const processingTime = Date.now() - startTime;
            this.processingStats.failedRequests++;
            
            if (this.performanceMonitor) {
                this.performanceMonitor.recordSubtitleRequest(false, processingTime, {
                    error: error.message
                });
            }
            
            console.error(`[OptimizedSubtitleProcessor] Request ${requestId} failed after ${processingTime}ms:`, error);
            this.emit('requestFailed', { requestId, processingTime, error });
            
            throw error;
        }
    }
    
    // Cache operations
    async checkCache(request, requestId) {
        const startTime = Date.now();
        
        try {
            // Generate cache key
            const cacheKey = this.generateCacheKey(request);
            
            // Check enhanced cache manager
            const cachedData = await this.cacheManager.get(cacheKey);
            if (cachedData) {
                console.log(`[OptimizedSubtitleProcessor] Cache hit for ${requestId}: ${cacheKey}`);
                return cachedData;
            }
            
            // Check database cache if available
            if (this.database) {
                const dbCached = await this.database.getCachedSubtitle(
                    request.videoId,
                    request.provider,
                    request.language
                );
                
                if (dbCached && this.isValidCachedSubtitle(dbCached)) {
                    // Store in memory cache for faster future access
                    await this.cacheManager.set(cacheKey, {
                        content: dbCached.content,
                        qualityScore: dbCached.quality_score,
                        aiEnhanced: dbCached.ai_enhanced,
                        source: 'database',
                        metadata: dbCached.metadata
                    }, 3600); // 1 hour TTL
                    
                    console.log(`[OptimizedSubtitleProcessor] Database cache hit for ${requestId}`);
                    return {
                        content: dbCached.content,
                        qualityScore: dbCached.quality_score,
                        aiEnhanced: dbCached.ai_enhanced,
                        source: 'database',
                        metadata: dbCached.metadata
                    };
                }
            }
            
            return null;
            
        } catch (error) {
            console.error(`[OptimizedSubtitleProcessor] Cache check error for ${requestId}:`, error);
            return null;
        } finally {
            const operationTime = Date.now() - startTime;
            if (this.performanceMonitor) {
                this.performanceMonitor.recordCacheOperation(false, operationTime);
            }
        }
    }
    
    async cacheResult(request, result, requestId) {
        try {
            const cacheKey = this.generateCacheKey(request);
            const ttl = this.calculateCacheTTL(result);
            
            // Cache in enhanced cache manager
            await this.cacheManager.set(cacheKey, result, ttl);
            
            console.log(`[OptimizedSubtitleProcessor] Cached result for ${requestId} with TTL ${ttl}s`);
            
        } catch (error) {
            console.error(`[OptimizedSubtitleProcessor] Cache storage error for ${requestId}:`, error);
        }
    }
    
    // AI enhancement
    async enhanceWithAI(originalResult, request, requestId) {
        const startTime = Date.now();
        
        try {
            console.log(`[OptimizedSubtitleProcessor] Starting AI enhancement for ${requestId}`);
            
            const aiOptions = {
                aiProvider: request.aiProvider || process.env.AI_PROVIDER || 'gemini',
                aiModel: request.aiModel || process.env.AI_MODEL,
                correctionIntensity: request.correctionIntensity || 7,
                primaryLanguage: request.language || 'tr',
                priority: this.config.aiPriority
            };
            
            // Process with AI worker pool
            const enhancedContent = await this.aiWorkerPool.processSubtitle(
                originalResult.content,
                aiOptions
            );
            
            const processingTime = Date.now() - startTime;
            
            if (this.performanceMonitor) {
                this.performanceMonitor.recordAiProcessing(true, processingTime, {
                    provider: aiOptions.aiProvider,
                    model: aiOptions.aiModel
                });
            }
            
            return enhancedContent;
            
        } catch (error) {
            const processingTime = Date.now() - startTime;
            
            if (this.performanceMonitor) {
                this.performanceMonitor.recordAiProcessing(false, processingTime, {
                    error: error.message
                });
            }
            
            throw error;
        }
    }
    
    // Database operations
    async storeInDatabase(request, result, requestId) {
        if (!this.database) return;
        
        const startTime = Date.now();
        
        try {
            await this.database.cacheSubtitle({
                videoId: request.videoId,
                provider: request.provider,
                language: request.language,
                content: result.content,
                qualityScore: result.qualityScore || 0,
                aiEnhanced: result.aiEnhanced || false,
                metadata: result.metadata || {},
                ttl: this.calculateCacheTTL(result)
            });
            
            // Log analytics event
            await this.database.logEvent('subtitle_processed', {
                videoId: request.videoId,
                provider: request.provider,
                language: request.language,
                processingTime: Date.now() - startTime,
                success: true,
                metadata: {
                    aiEnhanced: result.aiEnhanced,
                    qualityScore: result.qualityScore
                }
            });
            
            const operationTime = Date.now() - startTime;
            if (this.performanceMonitor) {
                this.performanceMonitor.recordDatabaseOperation(true, operationTime);
            }
            
        } catch (error) {
            const operationTime = Date.now() - startTime;
            
            if (this.performanceMonitor) {
                this.performanceMonitor.recordDatabaseOperation(false, operationTime);
            }
            
            console.error(`[OptimizedSubtitleProcessor] Database storage error for ${requestId}:`, error);
        }
    }
    
    // Original subtitle matcher integration
    async processWithOriginalMatcher(request, requestId) {
        try {
            // Import the original subtitle matcher
            const { getSubtitleUrlsForStremio } = require('./subtitleMatcher');
            
            console.log(`[OptimizedSubtitleProcessor] Processing with original matcher for ${requestId}`);
            
            const results = await getSubtitleUrlsForStremio(
                request.videoId,
                request.type || 'movie',
                request.season,
                request.episode,
                request.language || 'tr',
                request.infoHash
            );
            
            if (results && results.length > 0) {
                const bestResult = results[0]; // Already sorted by quality
                
                // Extract content from data URL if needed
                let content = bestResult.url;
                if (content.startsWith('data:text/plain;charset=utf-8,')) {
                    content = decodeURIComponent(content.replace('data:text/plain;charset=utf-8,', ''));
                }
                
                return {
                    content,
                    qualityScore: bestResult.quality || 0,
                    source: bestResult.name || 'unknown',
                    provider: request.provider,
                    language: request.language,
                    metadata: {
                        originalResult: bestResult,
                        behaviorHints: bestResult.behaviorHints
                    }
                };
            }
            
            return null;
            
        } catch (error) {
            console.error(`[OptimizedSubtitleProcessor] Original matcher error for ${requestId}:`, error);
            throw error;
        }
    }
    
    // Utility methods
    validateRequest(request) {
        if (!request.videoId) {
            throw new Error('videoId is required');
        }
        
        if (!request.language) {
            request.language = 'tr'; // Default to Turkish
        }
        
        if (!request.provider) {
            request.provider = 'auto'; // Auto-detect provider
        }
    }
    
    generateRequestId() {
        return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    generateCacheKey(request) {
        const parts = [
            request.videoId,
            request.provider,
            request.language,
            request.season || '',
            request.episode || '',
            request.infoHash || ''
        ];
        
        return parts.join(':');
    }
    
    calculateCacheTTL(result) {
        // AI-enhanced subtitles get longer TTL
        if (result.aiEnhanced) {
            return 7 * 24 * 3600; // 7 days
        }
        
        // High-quality subtitles get longer TTL
        if (result.qualityScore > 800) {
            return 3 * 24 * 3600; // 3 days
        }
        
        // Default TTL
        return 24 * 3600; // 1 day
    }
    
    shouldEnhanceWithAI(result) {
        // Don't enhance if already AI-enhanced
        if (result.aiEnhanced) {
            return false;
        }
        
        // Don't enhance very short content
        if (!result.content || result.content.length < 100) {
            return false;
        }
        
        // Don't enhance if quality is already very high
        if (result.qualityScore > 900) {
            return false;
        }
        
        return true;
    }
    
    isValidSubtitleContent(content) {
        if (!content || typeof content !== 'string') {
            return false;
        }
        
        // Check for basic subtitle patterns
        const hasTimeStamps = /\d{2}:\d{2}:\d{2}[,\.]\d{3}/.test(content);
        const hasArrowNotation = /-->/.test(content);
        
        return hasTimeStamps && hasArrowNotation && content.length > 50;
    }
    
    isValidCachedSubtitle(cached) {
        return cached && 
               cached.content && 
               this.isValidSubtitleContent(cached.content) &&
               (!cached.expires_at || new Date(cached.expires_at) > new Date());
    }
    
    updateAverageProcessingTime(processingTime) {
        this.processingStats.averageProcessingTime = 
            (this.processingStats.averageProcessingTime + processingTime) / 2;
    }
    
    // Request queue processing
    startRequestProcessor() {
        setInterval(() => {
            this.processRequestQueue();
        }, 100); // Process queue every 100ms
    }
    
    processRequestQueue() {
        if (this.requestQueue.length === 0) {
            return;
        }
        
        const activeCount = this.activeRequests.size;
        if (activeCount >= this.config.maxConcurrentRequests) {
            return; // Too many active requests
        }
        
        const batchSize = Math.min(
            this.config.batchSize,
            this.config.maxConcurrentRequests - activeCount,
            this.requestQueue.length
        );
        
        for (let i = 0; i < batchSize; i++) {
            const queuedRequest = this.requestQueue.shift();
            if (queuedRequest) {
                this.processQueuedRequest(queuedRequest);
            }
        }
    }
    
    async processQueuedRequest(queuedRequest) {
        const { request, resolve, reject, requestId } = queuedRequest;
        
        this.activeRequests.set(requestId, queuedRequest);
        
        try {
            const result = await this.processSubtitle(request);
            resolve(result);
        } catch (error) {
            reject(error);
        } finally {
            this.activeRequests.delete(requestId);
        }
    }
    
    // Event handlers
    handleWorkerJobCompleted(data) {
        console.log(`[OptimizedSubtitleProcessor] Worker job completed: ${data.jobId} in ${data.processingTime}ms`);
    }
    
    handleWorkerJobError(data) {
        console.error(`[OptimizedSubtitleProcessor] Worker job failed: ${data.jobId} - ${data.error}`);
    }
    
    // Statistics and monitoring
    getStats() {
        const workerStats = this.aiWorkerPool ? this.aiWorkerPool.getStats() : null;
        const cacheStats = this.cacheManager ? this.cacheManager.getStats() : null;
        const dbStats = this.database ? this.database.getStats() : null;
        const monitorStats = this.performanceMonitor ? this.performanceMonitor.getStats() : null;
        
        return {
            processor: {
                initialized: this.isInitialized,
                activeRequests: this.activeRequests.size,
                queuedRequests: this.requestQueue.length,
                ...this.processingStats,
                averageProcessingTime: Math.round(this.processingStats.averageProcessingTime)
            },
            workers: workerStats,
            cache: cacheStats,
            database: dbStats,
            monitoring: monitorStats
        };
    }
    
    async healthCheck() {
        const workerHealth = this.aiWorkerPool ? await this.aiWorkerPool.healthCheck() : { healthy: false };
        const cacheHealth = this.cacheManager ? await this.cacheManager.healthCheck() : { healthy: false };
        const dbHealth = this.database ? await this.database.healthCheck() : { healthy: false };
        const monitorHealth = this.performanceMonitor ? this.performanceMonitor.healthCheck() : { healthy: false };
        
        const overallHealth = this.isInitialized && 
                             workerHealth.healthy && 
                             cacheHealth.healthy && 
                             (dbHealth.healthy || !this.config.enableDatabase) &&
                             (monitorHealth.healthy || !this.config.enableMonitoring);
        
        return {
            healthy: overallHealth,
            components: {
                processor: this.isInitialized,
                workers: workerHealth,
                cache: cacheHealth,
                database: dbHealth,
                monitoring: monitorHealth
            }
        };
    }
    
    // Shutdown
    async shutdown() {
        console.log('[OptimizedSubtitleProcessor] Shutting down...');
        
        try {
            // Stop accepting new requests
            this.isInitialized = false;
            
            // Wait for active requests to complete
            const activeRequestIds = Array.from(this.activeRequests.keys());
            if (activeRequestIds.length > 0) {
                console.log(`[OptimizedSubtitleProcessor] Waiting for ${activeRequestIds.length} active requests to complete...`);
                
                // Wait up to 30 seconds for requests to complete
                const timeout = setTimeout(() => {
                    console.warn('[OptimizedSubtitleProcessor] Shutdown timeout reached, forcing shutdown');
                }, 30000);
                
                while (this.activeRequests.size > 0) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
                
                clearTimeout(timeout);
            }
            
            // Shutdown components
            if (this.aiWorkerPool) {
                await this.aiWorkerPool.shutdown();
            }
            
            if (this.cacheManager) {
                await this.cacheManager.shutdown();
            }
            
            if (this.database) {
                await this.database.shutdown();
            }
            
            if (this.performanceMonitor) {
                this.performanceMonitor.stop();
            }
            
            console.log('[OptimizedSubtitleProcessor] Shutdown completed');
            this.emit('shutdown');
            
        } catch (error) {
            console.error('[OptimizedSubtitleProcessor] Error during shutdown:', error);
        }
    }
}

module.exports = OptimizedSubtitleProcessor;