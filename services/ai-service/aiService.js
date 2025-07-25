// services/ai-service/aiService.js
// Microservice for AI-powered subtitle enhancement

const express = require('express');
const EventBus = require('../../lib/events/eventBus');
const AIWorkerPool = require('../../lib/workers/aiWorkerPool');
const config = require('../../config');

class AIService {
    constructor(options = {}) {
        this.config = {
            serviceName: 'ai-service',
            serviceId: `ai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            port: options.port || process.env.AI_SERVICE_PORT || 7002,
            host: options.host || process.env.AI_SERVICE_HOST || '0.0.0.0',
            
            // Event bus configuration
            redis: config.redis,
            
            // Worker pool settings
            maxWorkers: options.maxWorkers || Math.min(4, require('os').cpus().length)
        };
        
        this.app = express();
        this.eventBus = null;
        this.aiWorkerPool = null;
        this.server = null;
        
        console.log(`[${this.config.serviceName}] Initializing AI service...`);
        this.initialize();
    }
    
    async initialize() {
        try {
            // Initialize event bus
            this.eventBus = new EventBus({
                serviceName: this.config.serviceName,
                serviceId: this.config.serviceId,
                redis: this.config.redis
            });
            
            // Initialize AI worker pool
            this.aiWorkerPool = new AIWorkerPool({
                maxWorkers: this.config.maxWorkers
            });
            
            // Set up middleware
            this.app.use(express.json());

            // Set up event handlers
            this.setupEventHandlers();

            // Set up HTTP routes
            this.setupRoutes();
            
            console.log(`[${this.config.serviceName}] Initialization completed`);
            
        } catch (error) {
            console.error(`[${this.config.serviceName}] Initialization failed:`, error);
            throw error;
        }
    }
    
    setupEventHandlers() {
        if (!this.eventBus) return;
        
        // Handle AI enhancement requests
        this.eventBus.on('ai:enhance:request', async (data, metadata) => {
            const { content, options } = data;
            const { correlationId } = metadata;
            
            try {
                console.log(`[${this.config.serviceName}] Received AI enhancement request`);
                
                const enhancedContent = await this.aiWorkerPool.processSubtitle(content, options);
                
                // Publish the response
                await this.eventBus.publish('ai:enhance:response', {
                    success: true,
                    enhancedContent
                }, { correlationId });
                
            } catch (error) {
                console.error(`[${this.config.serviceName}] Error processing AI enhancement request:`, error);
                
                // Publish an error response
                await this.eventBus.publish('ai:enhance:response', {
                    success: false,
                    error: error.message
                }, { correlationId });
            }
        });

        // Handle AI translation requests
        this.eventBus.on('ai:translate:request', async (data, metadata) => {
            const { content, sourceLang, targetLang, options } = data;
            const { correlationId } = metadata;

            try {
                console.log(`[${this.config.serviceName}] Received AI translation request`);

                const translatedContent = await this.aiWorkerPool.processSubtitle(content, {
                    ...options,
                    task: 'translate',
                    sourceLang,
                    targetLang
                });

                // Publish the response
                await this.eventBus.publish('ai:translate:response', {
                    success: true,
                    translatedContent
                }, { correlationId });

            } catch (error) {
                console.error(`[${this.config.serviceName}] Error processing AI translation request:`, error);

                // Publish an error response
                await this.eventBus.publish('ai:translate:response', {
                    success: false,
                    error: error.message
                }, { correlationId });
            }
        });
        
        // Handle health check requests
        this.eventBus.on('health:check', async (data) => {
            if (data.targetService === this.config.serviceName || data.targetService === 'all') {
                const health = await this.getHealthStatus();
                await this.eventBus.publish('health:response', {
                    ...health,
                    correlationId: data.correlationId
                });
            }
        });
    }

    setupRoutes() {
        this.app.get('/health', async (req, res) => {
            const health = await this.getHealthStatus();
            res.status(health.status === 'healthy' ? 200 : 503).json(health);
        });

        this.app.post('/enhance', async (req, res) => {
            const { content, options } = req.body;
            try {
                const enhancedContent = await this.aiWorkerPool.processSubtitle(content, options);
                res.json({ enhancedContent });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/translate', async (req, res) => {
            const { content, sourceLang, targetLang, options } = req.body;
            try {
                const translatedContent = await this.aiWorkerPool.processSubtitle(content, {
                    ...options,
                    task: 'translate',
                    sourceLang,
                    targetLang
                });
                res.json({ translatedContent });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
    }
    
    async getHealthStatus() {
        const workerHealth = this.aiWorkerPool ? await this.aiWorkerPool.healthCheck() : { healthy: false };
        const eventBusHealth = await this.eventBus.healthCheck();
        
        return {
            serviceId: this.config.serviceId,
            serviceName: this.config.serviceName,
            status: workerHealth.healthy && eventBusHealth.healthy ? 'healthy' : 'unhealthy',
            timestamp: Date.now(),
            uptime: this.startTime ? Date.now() - this.startTime : 0,
            dependencies: {
                workerPool: workerHealth,
                eventBus: eventBusHealth
            }
        };
    }
    
    async start() {
        return new Promise((resolve, reject) => {
            this.server = this.app.listen(this.config.port, this.config.host, (err) => {
                if (err) {
                    return reject(err);
                }
                this.startTime = Date.now();
                console.log(`[${this.config.serviceName}] Service started on ${this.config.host}:${this.config.port}`);
                resolve();
            });
        });
    }
    
    async stop() {
        console.log(`[${this.config.serviceName}] Shutting down...`);
        
        if (this.aiWorkerPool) {
            await this.aiWorkerPool.shutdown();
        }
        
        if (this.server) {
            await new Promise(resolve => this.server.close(resolve));
        }

        if (this.eventBus) {
            await this.eventBus.shutdown();
        }
        
        console.log(`[${this.config.serviceName}] Shutdown completed`);
    }
}

// Start the service if run directly
if (require.main === module) {
    const service = new AIService();
    service.start().catch(error => {
        console.error('Failed to start AI Service:', error);
        process.exit(1);
    });
    
    process.on('SIGINT', async () => {
        await service.stop();
        process.exit(0);
    });
}

module.exports = AIService;