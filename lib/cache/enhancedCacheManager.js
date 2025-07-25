// lib/cache/enhancedCacheManager.js
// Enhanced Multi-Layer Caching System with Redis and Memory Cache

const redis = require('redis');
const EventEmitter = require('events');

class EnhancedCacheManager extends EventEmitter {
    constructor(options = {}) {
        super();
        
        // Configuration
        this.config = {
            // Memory cache settings
            maxMemorySize: options.maxMemorySize || 1000,
            memoryTTL: options.memoryTTL || 300, // 5 minutes
            
            // Redis settings
            redisUrl: options.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379',
            redisPrefix: options.redisPrefix || 'vlsub:',
            defaultTTL: options.defaultTTL || 3600, // 1 hour
            
            // Performance settings
            compressionThreshold: options.compressionThreshold || 1024, // 1KB
            enableCompression: options.enableCompression !== false,
            enableMetrics: options.enableMetrics !== false
        };
        
        // L1 Cache (Memory)
        this.memoryCache = new Map();
        this.memoryCacheStats = {
            hits: 0,
            misses: 0,
            sets: 0,
            deletes: 0,
            evictions: 0
        };
        
        // L2 Cache (Redis)
        this.redisClient = null;
        this.redisConnected = false;
        this.redisCacheStats = {
            hits: 0,
            misses: 0,
            sets: 0,
            deletes: 0,
            errors: 0
        };
        
        // Cache metrics
        this.metrics = {
            totalRequests: 0,
            l1HitRate: 0,
            l2HitRate: 0,
            overallHitRate: 0,
            averageResponseTime: 0,
            compressionRatio: 0
        };
        
        // Initialize Redis connection
        this.initializeRedis();
        
        // Start cleanup interval
        this.startCleanupInterval();
        
        console.log('[EnhancedCacheManager] Initialized with L1 (Memory) + L2 (Redis) caching');
    }
    
    async initializeRedis() {
        try {
            // Create Redis client
            this.redisClient = redis.createClient({
                url: this.config.redisUrl,
                retry_strategy: (options) => {
                    if (options.error && options.error.code === 'ECONNREFUSED') {
                        console.warn('[EnhancedCacheManager] Redis connection refused, retrying...');
                        return Math.min(options.attempt * 100, 3000);
                    }
                    if (options.total_retry_time > 1000 * 60 * 60) {
                        console.error('[EnhancedCacheManager] Redis retry time exhausted');
                        return new Error('Retry time exhausted');
                    }
                    if (options.attempt > 10) {
                        console.error('[EnhancedCacheManager] Redis max retry attempts reached');
                        return undefined;
                    }
                    return Math.min(options.attempt * 100, 3000);
                }
            });
            
            // Handle Redis events
            this.redisClient.on('connect', () => {
                console.log('[EnhancedCacheManager] Redis connected');
                this.redisConnected = true;
                this.emit('redis_connected');
            });
            
            this.redisClient.on('error', (error) => {
                console.error('[EnhancedCacheManager] Redis error:', error);
                this.redisConnected = false;
                this.redisCacheStats.errors++;
                this.emit('redis_error', error);
            });
            
            this.redisClient.on('end', () => {
                console.log('[EnhancedCacheManager] Redis connection ended');
                this.redisConnected = false;
                this.emit('redis_disconnected');
            });
            
            // Connect to Redis
            await this.redisClient.connect();
            
        } catch (error) {
            console.error('[EnhancedCacheManager] Failed to initialize Redis:', error);
            this.redisConnected = false;
        }
    }
    
    async get(key, options = {}) {
        const startTime = Date.now();
        this.metrics.totalRequests++;
        
        try {
            const useMemory = options.useMemory !== false;
            const useRedis = options.useRedis !== false && this.redisConnected;
            
            // L1 Cache: Check memory cache first
            if (useMemory) {
                const memoryResult = this.getFromMemory(key);
                if (memoryResult !== null) {
                    this.memoryCacheStats.hits++;
                    this.updateMetrics(startTime, true, false);
                    return memoryResult;
                }
                this.memoryCacheStats.misses++;
            }
            
            // L2 Cache: Check Redis cache
            if (useRedis) {
                const redisResult = await this.getFromRedis(key);
                if (redisResult !== null) {
                    this.redisCacheStats.hits++;
                    
                    // Store in L1 cache for faster future access
                    if (useMemory) {
                        this.setInMemory(key, redisResult, this.config.memoryTTL);
                    }
                    
                    this.updateMetrics(startTime, false, true);
                    return redisResult;
                }
                this.redisCacheStats.misses++;
            }
            
            // Cache miss
            this.updateMetrics(startTime, false, false);
            return null;
            
        } catch (error) {
            console.error('[EnhancedCacheManager] Error getting cache key:', key, error);
            this.updateMetrics(startTime, false, false);
            return null;
        }
    }
    
    async set(key, value, ttl = null, options = {}) {
        try {
            const actualTTL = ttl || this.config.defaultTTL;
            const useMemory = options.useMemory !== false;
            const useRedis = options.useRedis !== false && this.redisConnected;
            
            // Serialize value
            const serializedValue = this.serializeValue(value);
            
            // L1 Cache: Store in memory
            if (useMemory) {
                this.setInMemory(key, serializedValue, Math.min(actualTTL, this.config.memoryTTL));
                this.memoryCacheStats.sets++;
            }
            
            // L2 Cache: Store in Redis
            if (useRedis) {
                await this.setInRedis(key, serializedValue, actualTTL);
                this.redisCacheStats.sets++;
            }
            
            return true;
            
        } catch (error) {
            console.error('[EnhancedCacheManager] Error setting cache key:', key, error);
            return false;
        }
    }
    
    async delete(key, options = {}) {
        try {
            const useMemory = options.useMemory !== false;
            const useRedis = options.useRedis !== false && this.redisConnected;
            
            let deleted = false;
            
            // Delete from L1 cache
            if (useMemory && this.memoryCache.has(key)) {
                this.memoryCache.delete(key);
                this.memoryCacheStats.deletes++;
                deleted = true;
            }
            
            // Delete from L2 cache
            if (useRedis) {
                const redisDeleted = await this.deleteFromRedis(key);
                if (redisDeleted) {
                    this.redisCacheStats.deletes++;
                    deleted = true;
                }
            }
            
            return deleted;
            
        } catch (error) {
            console.error('[EnhancedCacheManager] Error deleting cache key:', key, error);
            return false;
        }
    }
    
    async clear(pattern = '*') {
        try {
            let cleared = 0;
            
            // Clear L1 cache
            if (pattern === '*') {
                cleared += this.memoryCache.size;
                this.memoryCache.clear();
            } else {
                // Pattern-based clearing for memory cache
                const regex = new RegExp(pattern.replace(/\*/g, '.*'));
                for (const key of this.memoryCache.keys()) {
                    if (regex.test(key)) {
                        this.memoryCache.delete(key);
                        cleared++;
                    }
                }
            }
            
            // Clear L2 cache
            if (this.redisConnected) {
                const redisPattern = this.config.redisPrefix + pattern;
                const keys = await this.redisClient.keys(redisPattern);
                if (keys.length > 0) {
                    await this.redisClient.del(keys);
                    cleared += keys.length;
                }
            }
            
            console.log(`[EnhancedCacheManager] Cleared ${cleared} cache entries with pattern: ${pattern}`);
            return cleared;
            
        } catch (error) {
            console.error('[EnhancedCacheManager] Error clearing cache:', error);
            return 0;
        }
    }
    
    // L1 Cache (Memory) operations
    getFromMemory(key) {
        const item = this.memoryCache.get(key);
        if (!item) return null;
        
        // Check expiration
        if (item.expires && item.expires < Date.now()) {
            this.memoryCache.delete(key);
            this.memoryCacheStats.evictions++;
            return null;
        }
        
        return this.deserializeValue(item.data);
    }
    
    setInMemory(key, value, ttl) {
        // Evict old entries if cache is full
        if (this.memoryCache.size >= this.config.maxMemorySize) {
            this.evictOldestMemoryEntries();
        }
        
        const expires = ttl > 0 ? Date.now() + (ttl * 1000) : null;
        this.memoryCache.set(key, {
            data: value,
            expires,
            created: Date.now()
        });
    }
    
    evictOldestMemoryEntries() {
        const entriesToEvict = Math.floor(this.config.maxMemorySize * 0.1); // Evict 10%
        const entries = Array.from(this.memoryCache.entries())
            .sort((a, b) => a[1].created - b[1].created);
        
        for (let i = 0; i < entriesToEvict && i < entries.length; i++) {
            this.memoryCache.delete(entries[i][0]);
            this.memoryCacheStats.evictions++;
        }
    }
    
    // L2 Cache (Redis) operations
    async getFromRedis(key) {
        if (!this.redisConnected) return null;
        
        try {
            const redisKey = this.config.redisPrefix + key;
            const value = await this.redisClient.get(redisKey);
            
            if (value === null) return null;
            
            return this.deserializeValue(value);
            
        } catch (error) {
            console.error('[EnhancedCacheManager] Redis get error:', error);
            this.redisCacheStats.errors++;
            return null;
        }
    }
    
    async setInRedis(key, value, ttl) {
        if (!this.redisConnected) return false;
        
        try {
            const redisKey = this.config.redisPrefix + key;
            
            if (ttl > 0) {
                await this.redisClient.setEx(redisKey, ttl, value);
            } else {
                await this.redisClient.set(redisKey, value);
            }
            
            return true;
            
        } catch (error) {
            console.error('[EnhancedCacheManager] Redis set error:', error);
            this.redisCacheStats.errors++;
            return false;
        }
    }
    
    async deleteFromRedis(key) {
        if (!this.redisConnected) return false;
        
        try {
            const redisKey = this.config.redisPrefix + key;
            const result = await this.redisClient.del(redisKey);
            return result > 0;
            
        } catch (error) {
            console.error('[EnhancedCacheManager] Redis delete error:', error);
            this.redisCacheStats.errors++;
            return false;
        }
    }
    
    // Serialization with optional compression
    serializeValue(value) {
        try {
            const jsonString = JSON.stringify(value);
            
            if (this.config.enableCompression && jsonString.length > this.config.compressionThreshold) {
                const zlib = require('zlib');
                const compressed = zlib.gzipSync(jsonString);
                return JSON.stringify({
                    compressed: true,
                    data: compressed.toString('base64')
                });
            }
            
            return jsonString;
            
        } catch (error) {
            console.error('[EnhancedCacheManager] Serialization error:', error);
            return JSON.stringify(null);
        }
    }
    
    deserializeValue(serializedValue) {
        try {
            const parsed = JSON.parse(serializedValue);
            
            if (parsed && parsed.compressed) {
                const zlib = require('zlib');
                const compressed = Buffer.from(parsed.data, 'base64');
                const decompressed = zlib.gunzipSync(compressed);
                return JSON.parse(decompressed.toString());
            }
            
            return parsed;
            
        } catch (error) {
            console.error('[EnhancedCacheManager] Deserialization error:', error);
            return null;
        }
    }
    
    // Metrics and monitoring
    updateMetrics(startTime, l1Hit, l2Hit) {
        const responseTime = Date.now() - startTime;
        
        // Update hit rates
        const totalHits = this.memoryCacheStats.hits + this.redisCacheStats.hits;
        const totalRequests = this.metrics.totalRequests;
        
        this.metrics.l1HitRate = totalRequests > 0 ? (this.memoryCacheStats.hits / totalRequests) * 100 : 0;
        this.metrics.l2HitRate = totalRequests > 0 ? (this.redisCacheStats.hits / totalRequests) * 100 : 0;
        this.metrics.overallHitRate = totalRequests > 0 ? (totalHits / totalRequests) * 100 : 0;
        
        // Update average response time
        this.metrics.averageResponseTime = (this.metrics.averageResponseTime + responseTime) / 2;
    }
    
    getStats() {
        return {
            memory: {
                size: this.memoryCache.size,
                maxSize: this.config.maxMemorySize,
                ...this.memoryCacheStats
            },
            redis: {
                connected: this.redisConnected,
                ...this.redisCacheStats
            },
            metrics: {
                ...this.metrics,
                l1HitRate: Math.round(this.metrics.l1HitRate * 100) / 100,
                l2HitRate: Math.round(this.metrics.l2HitRate * 100) / 100,
                overallHitRate: Math.round(this.metrics.overallHitRate * 100) / 100,
                averageResponseTime: Math.round(this.metrics.averageResponseTime * 100) / 100
            }
        };
    }
    
    // Cleanup and maintenance
    startCleanupInterval() {
        // Clean up expired memory cache entries every 5 minutes
        setInterval(() => {
            this.cleanupMemoryCache();
        }, 5 * 60 * 1000);
    }
    
    cleanupMemoryCache() {
        const now = Date.now();
        let cleaned = 0;
        
        for (const [key, item] of this.memoryCache.entries()) {
            if (item.expires && item.expires < now) {
                this.memoryCache.delete(key);
                cleaned++;
            }
        }
        
        if (cleaned > 0) {
            console.log(`[EnhancedCacheManager] Cleaned up ${cleaned} expired memory cache entries`);
            this.memoryCacheStats.evictions += cleaned;
        }
    }
    
    // Health check
    async healthCheck() {
        const memoryHealthy = this.memoryCache.size < this.config.maxMemorySize;
        const redisHealthy = this.redisConnected;
        
        return {
            healthy: memoryHealthy && (redisHealthy || !this.config.redisUrl),
            memory: {
                healthy: memoryHealthy,
                usage: `${this.memoryCache.size}/${this.config.maxMemorySize}`,
                usagePercent: (this.memoryCache.size / this.config.maxMemorySize) * 100
            },
            redis: {
                healthy: redisHealthy,
                connected: this.redisConnected,
                errors: this.redisCacheStats.errors
            },
            performance: {
                hitRate: this.metrics.overallHitRate,
                averageResponseTime: this.metrics.averageResponseTime
            }
        };
    }
    
    // Shutdown
    async shutdown() {
        console.log('[EnhancedCacheManager] Shutting down...');
        
        // Clear memory cache
        this.memoryCache.clear();
        
        // Close Redis connection
        if (this.redisClient && this.redisConnected) {
            try {
                await this.redisClient.quit();
                console.log('[EnhancedCacheManager] Redis connection closed');
            } catch (error) {
                console.error('[EnhancedCacheManager] Error closing Redis connection:', error);
            }
        }
        
        this.emit('shutdown');
    }
}

module.exports = EnhancedCacheManager;