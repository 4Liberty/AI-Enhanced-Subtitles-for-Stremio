// services/ai-service/aiService.js
// Microservice for AI-powered subtitle enhancement

const EventBus = require('../../lib/events/eventBus');
const AIWorkerPool = require('../../lib/workers/aiWorkerPool');

class AIService {
    constructor(options = {}) {
        this.config = {
            serviceName: 'ai-service',
            serviceId: `ai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            port: options.port || process.env.AI_SERVICE_PORT || 7002,
            host: options.host || process.env.AI_SERVICE_HOST || '0.0.0.0',
            
            // Event bus configuration
            redisUrl: options.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379',
            
            // Worker pool settings
            maxWorkers: options.maxWorkers || Math.min(4, require('os').cpus().length)
        };
        
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
                redisUrl: this.config.redisUrl
            });
            
            // Initialize AI worker pool
            this.aiWorkerPool = new AIWorkerPool({
                maxWorkers: this.config.maxWorkers
            });
            
            // Set up event handlers
            this.setupEventHandlers();
            
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
    
    async getHealthStatus() {
        const workerHealth = this.aiWorkerPool ? await this.aiWorkerPool.healthCheck() : { healthy: false };
        
        return {
            serviceId: this.config.serviceId,
            serviceName: this.config.serviceName,
            status: workerHealth.healthy ? 'healthy' : 'unhealthy',
            timestamp: Date.now(),
            uptime: this.startTime ? Date.now() - this.startTime : 0,
            components: {
                workerPool: workerHealth
            }
        };
    }
    
    async start() {
        this.startTime = Date.now();
        console.log(`[${this.config.serviceName}] Service started`);
    }
    
    async stop() {
        console.log(`[${this.config.serviceName}] Shutting down...`);
        
        if (this.aiWorkerPool) {
            await this.aiWorkerPool.shutdown();
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