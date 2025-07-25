// lib/security/rateLimiter.js
// Advanced Rate Limiting with Redis

const { RateLimiterRedis } = require('rate-limiter-flexible');
const redis = require('redis');

class AdvancedRateLimiter {
    constructor(options = {}) {
        this.config = {
            redisUrl: options.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379',
            points: options.points || 100, // Number of points
            duration: options.duration || 15 * 60, // Per 15 minutes
            blockDuration: options.blockDuration || 15 * 60, // Block for 15 minutes
            keyPrefix: options.keyPrefix || 'rate-limit'
        };
        
        this.redisClient = null;
        this.rateLimiter = null;
        
        this.initialize();
    }
    
    initialize() {
        try {
            this.redisClient = redis.createClient({ url: this.config.redisUrl });
            this.redisClient.connect().catch(console.error);
            
            this.rateLimiter = new RateLimiterRedis({
                storeClient: this.redisClient,
                keyPrefix: this.config.keyPrefix,
                points: this.config.points,
                duration: this.config.duration,
                blockDuration: this.config.blockDuration
            });
            
            console.log('[AdvancedRateLimiter] Initialized with Redis backend');
            
        } catch (error) {
            console.error('[AdvancedRateLimiter] Initialization failed:', error);
            // Fallback to in-memory limiter
            const { RateLimiterMemory } = require('rate-limiter-flexible');
            this.rateLimiter = new RateLimiterMemory({
                keyPrefix: this.config.keyPrefix,
                points: this.config.points,
                duration: this.config.duration,
                blockDuration: this.config.blockDuration
            });
            console.warn('[AdvancedRateLimiter] Fallback to in-memory rate limiter');
        }
    }
    
    getMiddleware() {
        return (req, res, next) => {
            this.rateLimiter.consume(req.ip)
                .then(() => {
                    next();
                })
                .catch(rateLimiterRes => {
                    res.status(429).json({
                        error: 'Too many requests',
                        retryAfter: Math.ceil(rateLimiterRes.msBeforeNext / 1000)
                    });
                });
        };
    }
    
    async shutdown() {
        if (this.redisClient) {
            await this.redisClient.quit();
        }
    }
}

module.exports = AdvancedRateLimiter;