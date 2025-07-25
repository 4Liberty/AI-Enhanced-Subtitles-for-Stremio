// services/api-gateway/gateway.js
// API Gateway for Microservices Architecture

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const EventBus = require('../../lib/events/eventBus');
const AdvancedRateLimiter = require('../../lib/security/rateLimiter');
const ServiceDiscovery = require('./serviceDiscovery');
const LoadBalancer = require('./loadBalancer');
const RequestRouter = require('./requestRouter');
const CircuitBreaker = require('./circuitBreaker');
const { validate, subtitleRequestSchema, subtitleQuerySchema } = require('./validationSchemas');

class APIGateway {
    constructor(options = {}) {
        this.config = {
            port: options.port || process.env.GATEWAY_PORT || 7000,
            host: options.host || process.env.GATEWAY_HOST || '0.0.0.0',
            
            // Service discovery
            enableServiceDiscovery: options.enableServiceDiscovery !== false,
            serviceRegistryTTL: options.serviceRegistryTTL || 60,
            
            // Load balancing
            loadBalancingStrategy: options.loadBalancingStrategy || 'round-robin',
            healthCheckInterval: options.healthCheckInterval || 30000,
            
            // Circuit breaker
            circuitBreakerThreshold: options.circuitBreakerThreshold || 5,
            circuitBreakerTimeout: options.circuitBreakerTimeout || 60000,
            
            // Rate limiting
            rateLimitWindow: options.rateLimitWindow || 15 * 60 * 1000, // 15 minutes
            rateLimitMax: options.rateLimitMax || 100,
            
            // Request timeout
            requestTimeout: options.requestTimeout || 30000,
            
            // Retry configuration
            maxRetries: options.maxRetries || 3,
            retryDelay: options.retryDelay || 1000,
            
            // Monitoring
            enableMetrics: options.enableMetrics !== false,
            enableTracing: options.enableTracing !== false
        };
        
        // Initialize Express app
        this.app = express();
        this.server = null;
        
        // Initialize components
        this.eventBus = null;
        this.serviceDiscovery = null;
        this.loadBalancer = null;
        this.requestRouter = null;
        this.circuitBreakers = new Map();
        
        // Metrics and monitoring
        this.metrics = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            averageResponseTime: 0,
            activeConnections: 0,
            serviceErrors: new Map(),
            circuitBreakerTrips: 0
        };
        
        // Request tracking
        this.activeRequests = new Map();
        this.requestHistory = [];
        
        console.log('[APIGateway] Initializing API Gateway...');
        this.initialize();
    }
    
    async initialize() {
        try {
            // Initialize event bus
            this.eventBus = new EventBus({
                serviceName: 'api-gateway',
                serviceId: `gateway_${Date.now()}`
            });
            
            // Initialize service discovery
            if (this.config.enableServiceDiscovery) {
                this.serviceDiscovery = new ServiceDiscovery({
                    eventBus: this.eventBus,
                    ttl: this.config.serviceRegistryTTL
                });
            }
            
            // Initialize load balancer
            this.loadBalancer = new LoadBalancer({
                strategy: this.config.loadBalancingStrategy,
                healthCheckInterval: this.config.healthCheckInterval
            });
            
            // Initialize request router
            this.requestRouter = new RequestRouter({
                serviceDiscovery: this.serviceDiscovery,
                loadBalancer: this.loadBalancer,
                eventBus: this.eventBus
            });
            
            // Set up middleware
            this.setupMiddleware();
            
            // Set up routes
            this.setupRoutes();
            
            // Set up event handlers
            this.setupEventHandlers();
            
            // Start health monitoring
            this.startHealthMonitoring();
            
            console.log('[APIGateway] Initialization completed');
            
        } catch (error) {
            console.error('[APIGateway] Initialization failed:', error);
            throw error;
        }
    }
    
    setupMiddleware() {
        // Security middleware
        this.app.use(helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    scriptSrc: ["'self'"],
                    imgSrc: ["'self'", "data:", "https:"]
                }
            }
        }));
        
        // CORS
        this.app.use(cors({
            origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
        }));
        
        // Compression
        this.app.use(compression());
        
        // Body parsing
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
        
        // Rate limiting
        const rateLimiter = new AdvancedRateLimiter({
            redisHost: this.config.redis.host,
            redisPort: this.config.redis.port,
            redisPassword: this.config.redis.password,
            points: this.config.rateLimitMax,
            duration: this.config.rateLimitWindow / 1000
        });
        this.app.use(rateLimiter.getMiddleware());
        
        // Request tracking middleware
        this.app.use((req, res, next) => {
            const requestId = this.generateRequestId();
            const startTime = Date.now();
            
            req.requestId = requestId;
            req.startTime = startTime;
            
            // Track active request
            this.activeRequests.set(requestId, {
                method: req.method,
                url: req.url,
                startTime,
                ip: req.ip
            });
            
            this.metrics.totalRequests++;
            this.metrics.activeConnections++;
            
            // Clean up on response
            res.on('finish', () => {
                const responseTime = Date.now() - startTime;
                
                // Update metrics
                if (res.statusCode < 400) {
                    this.metrics.successfulRequests++;
                } else {
                    this.metrics.failedRequests++;
                }
                
                this.updateAverageResponseTime(responseTime);
                this.metrics.activeConnections--;
                
                // Remove from active requests
                this.activeRequests.delete(requestId);
                
                // Add to history
                this.addToRequestHistory({
                    requestId,
                    method: req.method,
                    url: req.url,
                    statusCode: res.statusCode,
                    responseTime,
                    timestamp: startTime
                });
                
                // Emit metrics event
                if (this.eventBus) {
                    this.eventBus.publish('gateway:request:completed', {
                        requestId,
                        method: req.method,
                        url: req.url,
                        statusCode: res.statusCode,
                        responseTime
                    });
                }
            });
            
            next();
        });
        
        // Request timeout middleware
        this.app.use((req, res, next) => {
            const timeout = setTimeout(() => {
                if (!res.headersSent) {
                    res.status(408).json({
                        error: 'Request timeout',
                        requestId: req.requestId
                    });
                }
            }, this.config.requestTimeout);
            
            res.on('finish', () => clearTimeout(timeout));
            next();
        });
    }
    
    setupRoutes() {
        // Serve the PWA
        this.app.use(express.static('public'));

        // Health check endpoint
        this.app.get('/health', async (req, res) => {
            try {
                const health = await this.getHealthStatus();
                res.status(health.healthy ? 200 : 503).json(health);
            } catch (error) {
                res.status(500).json({
                    healthy: false,
                    error: error.message
                });
            }
        });
        
        // Metrics endpoint
        this.app.get('/metrics', (req, res) => {
            res.json(this.getMetrics());
        });
        
        // Service discovery endpoint
        this.app.get('/services', async (req, res) => {
            try {
                const services = await this.serviceDiscovery.getServices();
                res.json(services);
            } catch (error) {
                res.status(500).json({
                    error: 'Failed to retrieve services',
                    details: error.message
                });
            }
        });
        
        // Main routing - Subtitle API
        this.app.get(
            '/subtitles/:type/:id.json',
            validate(subtitleRequestSchema, 'params'),
            validate(subtitleQuerySchema, 'query'),
            async (req, res) => {
                await this.routeSubtitleRequest(req, res);
            }
        );
        
        this.app.get(
            '/subtitles/:type/:id/:season/:episode.json',
            validate(subtitleRequestSchema, 'params'),
            validate(subtitleQuerySchema, 'query'),
            async (req, res) => {
                await this.routeSubtitleRequest(req, res);
            }
        );
        
        // Stremio manifest
        this.app.get('/manifest.json', async (req, res) => {
            await this.routeManifestRequest(req, res);
        });
        
        // Admin endpoints
        this.app.post('/admin/circuit-breaker/:service/reset', (req, res) => {
            const service = req.params.service;
            const circuitBreaker = this.circuitBreakers.get(service);
            
            if (circuitBreaker) {
                circuitBreaker.reset();
                res.json({ message: `Circuit breaker reset for service: ${service}` });
            } else {
                res.status(404).json({ error: 'Service not found' });
            }
        });
        
        this.app.post('/admin/cache/clear', async (req, res) => {
            try {
                await this.eventBus.publish('cache:clear', {
                    requestedBy: 'api-gateway',
                    timestamp: Date.now()
                });
                
                res.json({ message: 'Cache clear request sent to all services' });
            } catch (error) {
                res.status(500).json({
                    error: 'Failed to send cache clear request',
                    details: error.message
                });
            }
        });
        
        // Catch-all route
        this.app.use('*', (req, res) => {
            res.status(404).json({
                error: 'Route not found',
                path: req.originalUrl,
                method: req.method
            });
        });
        
        // Error handling middleware
        this.app.use((error, req, res, next) => {
            console.error('[APIGateway] Unhandled error:', error);
            
            if (!res.headersSent) {
                res.status(500).json({
                    error: 'Internal server error',
                    requestId: req.requestId,
                    message: process.env.NODE_ENV === 'development' ? error.message : undefined
                });
            }
        });
    }
    
    async routeSubtitleRequest(req, res) {
        const requestId = req.requestId;
        
        try {
            console.log(`[APIGateway] Routing subtitle request ${requestId}: ${req.path}`);
            
            // Extract parameters
            const { type, id, season, episode } = req.params;
            const { infoHash, language = 'tr' } = req.query;
            
            // Parameters are already validated by the middleware
            
            // Find subtitle service
            const subtitleService = await this.findHealthyService('subtitle-service');
            if (!subtitleService) {
                return res.status(503).json({
                    error: 'Subtitle service unavailable',
                    requestId
                });
            }
            
            // Check circuit breaker
            const circuitBreaker = this.getCircuitBreaker('subtitle-service');
            if (circuitBreaker.isOpen()) {
                return res.status(503).json({
                    error: 'Subtitle service circuit breaker open',
                    requestId
                });
            }
            
            // Route request with retry logic
            const result = await this.routeWithRetry('subtitle-service', {
                method: 'GET',
                path: req.path,
                query: req.query,
                headers: {
                    'X-Request-ID': requestId,
                    'X-Forwarded-For': req.ip
                }
            });
            
            if (result.success) {
                res.status(result.statusCode || 200).json(result.data);
            } else {
                res.status(result.statusCode || 500).json({
                    error: result.error,
                    requestId
                });
            }
            
        } catch (error) {
            console.error(`[APIGateway] Subtitle request routing failed ${requestId}:`, error);
            res.status(500).json({
                error: 'Request routing failed',
                requestId,
                details: error.message
            });
        }
    }
    
    async routeManifestRequest(req, res) {
        try {
            // Return static manifest for now
            const manifest = {
                id: 'com.vlsub.opensubtitles',
                version: '2.0.0',
                name: 'VLSub OpenSubtitles (AI Enhanced)',
                description: 'AI-powered Turkish subtitles with performance optimizations',
                logo: 'https://via.placeholder.com/256x256/000000/FFFFFF?text=VLSub',
                background: 'https://via.placeholder.com/1920x1080/1a1a1a/FFFFFF?text=VLSub+Background',
                types: ['movie', 'series'],
                catalogs: [],
                resources: [
                    {
                        name: 'subtitles',
                        types: ['movie', 'series'],
                        idPrefixes: ['tt', 'tmdb:']
                    }
                ],
                behaviorHints: {
                    configurable: true,
                    configurationRequired: false
                }
            };
            
            res.json(manifest);
            
        } catch (error) {
            console.error('[APIGateway] Manifest request failed:', error);
            res.status(500).json({
                error: 'Failed to generate manifest',
                details: error.message
            });
        }
    }
    
    async findHealthyService(serviceName) {
        if (!this.serviceDiscovery) {
            return null;
        }
        
        const services = await this.serviceDiscovery.getServices();
        const serviceInstances = services.filter(s => 
            s.name === serviceName && 
            s.status === 'healthy'
        );
        
        if (serviceInstances.length === 0) {
            return null;
        }
        
        // Use load balancer to select instance
        return this.loadBalancer.selectInstance(serviceInstances);
    }
    
    getCircuitBreaker(serviceName) {
        if (!this.circuitBreakers.has(serviceName)) {
            this.circuitBreakers.set(serviceName, new CircuitBreaker({
                threshold: this.config.circuitBreakerThreshold,
                timeout: this.config.circuitBreakerTimeout,
                onOpen: () => {
                    console.warn(`[APIGateway] Circuit breaker opened for service: ${serviceName}`);
                    this.metrics.circuitBreakerTrips++;
                },
                onClose: () => {
                    console.log(`[APIGateway] Circuit breaker closed for service: ${serviceName}`);
                }
            }));
        }
        
        return this.circuitBreakers.get(serviceName);
    }
    
    async routeWithRetry(serviceName, request) {
        let lastError = null;
        
        for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
            try {
                const result = await this.requestRouter.route(serviceName, request);
                
                // Record success in circuit breaker
                const circuitBreaker = this.getCircuitBreaker(serviceName);
                circuitBreaker.recordSuccess();
                
                return result;
                
            } catch (error) {
                lastError = error;
                
                // Record failure in circuit breaker
                const circuitBreaker = this.getCircuitBreaker(serviceName);
                circuitBreaker.recordFailure();
                
                // Update service error metrics
                const errorCount = this.metrics.serviceErrors.get(serviceName) || 0;
                this.metrics.serviceErrors.set(serviceName, errorCount + 1);
                
                console.warn(`[APIGateway] Request attempt ${attempt} failed for ${serviceName}:`, error.message);
                
                // Don't retry on client errors (4xx)
                if (error.statusCode >= 400 && error.statusCode < 500) {
                    break;
                }
                
                // Wait before retry
                if (attempt < this.config.maxRetries) {
                    await new Promise(resolve => 
                        setTimeout(resolve, this.config.retryDelay * attempt)
                    );
                }
            }
        }
        
        return {
            success: false,
            error: lastError?.message || 'Request failed after retries',
            statusCode: lastError?.statusCode || 500
        };
    }
    
    setupEventHandlers() {
        if (!this.eventBus) return;
        
        // Handle service registration events
        this.eventBus.on('service:registered', (data) => {
            console.log(`[APIGateway] Service registered: ${data.name} (${data.id})`);
        });
        
        // Handle service shutdown events
        this.eventBus.on('service:shutdown', (data) => {
            console.log(`[APIGateway] Service shutdown: ${data.serviceName} (${data.serviceId})`);
        });
        
        // Handle health check requests
        this.eventBus.on('health:check', async (data) => {
            if (data.targetService === 'api-gateway' || data.targetService === 'all') {
                const health = await this.getHealthStatus();
                await this.eventBus.publish('health:response', {
                    ...health,
                    correlationId: data.correlationId
                });
            }
        });
    }
    
    startHealthMonitoring() {
        setInterval(async () => {
            try {
                // Check service health
                if (this.serviceDiscovery) {
                    await this.serviceDiscovery.performHealthChecks();
                }
                
                // Emit gateway health status
                const health = await this.getHealthStatus();
                if (this.eventBus) {
                    await this.eventBus.publish('gateway:health:status', health);
                }
                
            } catch (error) {
                console.error('[APIGateway] Health monitoring error:', error);
            }
        }, this.config.healthCheckInterval);
    }
    
    // Utility methods
    generateRequestId() {
        return `gw_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    updateAverageResponseTime(responseTime) {
        const totalRequests = this.metrics.successfulRequests + this.metrics.failedRequests;
        this.metrics.averageResponseTime =
            ((this.metrics.averageResponseTime * (totalRequests - 1)) + responseTime) / totalRequests;
    }
    
    addToRequestHistory(request) {
        this.requestHistory.push(request);
        
        // Keep only last 1000 requests
        if (this.requestHistory.length > 1000) {
            this.requestHistory.shift();
        }
    }
    
    // Monitoring and statistics
    getMetrics() {
        return {
            gateway: {
                ...this.metrics,
                averageResponseTime: Math.round(this.metrics.averageResponseTime),
                uptime: Date.now() - (this.startTime || Date.now())
            },
            services: this.serviceDiscovery ? this.serviceDiscovery.getServiceStats() : {},
            circuitBreakers: Array.from(this.circuitBreakers.entries()).map(([service, cb]) => ({
                service,
                state: cb.getState(),
                failures: cb.getFailureCount(),
                lastFailure: cb.getLastFailureTime()
            })),
            activeRequests: this.activeRequests.size,
            recentRequests: this.requestHistory.slice(-10)
        };
    }
    
    async getHealthStatus() {
        const services = this.serviceDiscovery ? await this.serviceDiscovery.getServices() : [];
        const healthyServices = services.filter(s => s.status === 'healthy');
        
        const eventBusHealth = this.eventBus ? await this.eventBus.healthCheck() : { healthy: false };
        
        return {
            healthy: eventBusHealth.healthy && healthyServices.length > 0,
            timestamp: Date.now(),
            services: {
                total: services.length,
                healthy: healthyServices.length,
                unhealthy: services.length - healthyServices.length
            },
            eventBus: eventBusHealth,
            metrics: this.metrics,
            circuitBreakers: {
                total: this.circuitBreakers.size,
                open: Array.from(this.circuitBreakers.values()).filter(cb => cb.isOpen()).length
            }
        };
    }
    
    // Server lifecycle
    async start() {
        return new Promise((resolve, reject) => {
            this.server = this.app.listen(this.config.port, this.config.host, (error) => {
                if (error) {
                    reject(error);
                } else {
                    this.startTime = Date.now();
                    console.log(`[APIGateway] Server started on ${this.config.host}:${this.config.port}`);
                    resolve();
                }
            });
        });
    }
    
    async stop() {
        console.log('[APIGateway] Shutting down...');
        
        if (this.server) {
            await new Promise((resolve) => {
                this.server.close(resolve);
            });
        }
        
        if (this.eventBus) {
            await this.eventBus.shutdown();
        }
        
        console.log('[APIGateway] Shutdown completed');
    }
}

module.exports = APIGateway;