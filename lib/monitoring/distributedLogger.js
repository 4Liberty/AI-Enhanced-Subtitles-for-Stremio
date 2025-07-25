// lib/monitoring/distributedLogger.js
// Distributed Logging System for Microservices

const winston = require('winston');
const { createClient } = require('redis');

class DistributedLogger {
    constructor(options = {}) {
        this.config = {
            serviceName: options.serviceName || 'unknown-service',
            serviceId: options.serviceId || 'unknown-id',
            logLevel: options.logLevel || process.env.LOG_LEVEL || 'info',
            redisUrl: options.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379',
            logChannel: options.logChannel || 'vlsub:logs',
            enableConsole: options.enableConsole !== false,
            enableRedis: options.enableRedis !== false,
            enableFile: options.enableFile !== false,
            logFilePath: options.logFilePath || `logs/${options.serviceName}.log`
        };
        
        this.redisClient = null;
        this.logger = null;
        
        this.initialize();
    }
    
    initialize() {
        const transports = [];
        
        // Console transport
        if (this.config.enableConsole) {
            transports.push(new winston.transports.Console({
                format: winston.format.combine(
                    winston.format.colorize(),
                    winston.format.simple()
                )
            }));
        }
        
        // File transport
        if (this.config.enableFile) {
            transports.push(new winston.transports.File({
                filename: this.config.logFilePath,
                format: winston.format.json()
            }));
        }
        
        // Redis transport
        if (this.config.enableRedis) {
            try {
                this.redisClient = createClient({ url: this.config.redisUrl });
                this.redisClient.connect().catch(console.error);
                
                const redisTransport = new (require('winston-redis'))({
                    redis: this.redisClient,
                    channel: this.config.logChannel,
                    level: this.config.logLevel
                });
                
                transports.push(redisTransport);
                
            } catch (error) {
                console.error('[DistributedLogger] Failed to initialize Redis transport:', error);
            }
        }
        
        this.logger = winston.createLogger({
            level: this.config.logLevel,
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.errors({ stack: true }),
                winston.format.json(),
                winston.format.metadata({
                    fillExcept: ['message', 'level', 'timestamp', 'label']
                })
            ),
            defaultMeta: {
                service: this.config.serviceName,
                serviceId: this.config.serviceId
            },
            transports
        });
        
        console.log(`[DistributedLogger] Logger initialized for service: ${this.config.serviceName}`);
    }
    
    log(level, message, metadata = {}) {
        this.logger.log(level, message, metadata);
    }
    
    info(message, metadata = {}) {
        this.log('info', message, metadata);
    }
    
    warn(message, metadata = {}) {
        this.log('warn', message, metadata);
    }
    
    error(message, metadata = {}) {
        this.log('error', message, metadata);
    }
    
    debug(message, metadata = {}) {
        this.log('debug', message, metadata);
    }
    
    // Middleware for Express
    getExpressMiddleware() {
        return (req, res, next) => {
            const start = Date.now();
            
            res.on('finish', () => {
                const duration = Date.now() - start;
                
                this.info('HTTP Request', {
                    http: {
                        method: req.method,
                        url: req.originalUrl,
                        statusCode: res.statusCode,
                        ip: req.ip,
                        userAgent: req.get('user-agent'),
                        duration
                    },
                    requestId: req.requestId
                });
            });
            
            next();
        };
    }
    
    async shutdown() {
        if (this.redisClient) {
            await this.redisClient.quit();
        }
        
        this.logger.end();
    }
}

module.exports = DistributedLogger;