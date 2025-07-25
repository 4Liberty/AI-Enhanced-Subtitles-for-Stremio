// services/quality-service/qualityService.js
// Microservice for analyzing subtitle quality

const express = require('express');
const EventBus = require('../../lib/events/eventBus');
const config = require('../../config');

class QualityService {
    constructor(options = {}) {
        this.config = {
            serviceName: 'quality-service',
            serviceId: `quality_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            port: options.port || process.env.QUALITY_SERVICE_PORT || 7004,
            host: options.host || process.env.QUALITY_SERVICE_HOST || '0.0.0.0',
            
            // Event bus configuration
            redis: config.redis
        };
        
        this.app = express();
        this.eventBus = null;
        this.server = null;
        
        console.log(`[${this.config.serviceName}] Initializing quality service...`);
        this.initialize();
    }
    
    async initialize() {
        try {
            this.eventBus = new EventBus({
                serviceName: this.config.serviceName,
                serviceId: this.config.serviceId,
                redis: this.config.redis
            });
            
            this.app.use(express.json());
            this.setupEventHandlers();
            this.setupRoutes();
            
            console.log(`[${this.config.serviceName}] Initialization completed`);
            
        } catch (error) {
            console.error(`[${this.config.serviceName}] Initialization failed:`, error);
            throw error;
        }
    }
    
    setupEventHandlers() {
        if (!this.eventBus) return;
        
        this.eventBus.on('quality:analyze:request', async (data, metadata) => {
            const { subtitle } = data;
            const { correlationId } = metadata;
            
            try {
                console.log(`[${this.config.serviceName}] Received quality analysis request`);
                
                const qualityScore = this.analyzeQuality(subtitle);
                
                await this.eventBus.publish('quality:analyze:response', {
                    success: true,
                    qualityScore
                }, { correlationId });
                
            } catch (error) {
                console.error(`[${this.config.serviceName}] Error processing quality analysis request:`, error);
                
                await this.eventBus.publish('quality:analyze:response', {
                    success: false,
                    error: error.message
                }, { correlationId });
            }
        });
        
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

        this.app.post('/analyze', (req, res) => {
            const { subtitle } = req.body;
            if (!subtitle) {
                return res.status(400).json({ error: 'Subtitle content is required' });
            }
            const qualityScore = this.analyzeQuality(subtitle);
            res.json({ qualityScore });
        });
    }
    
    analyzeQuality(subtitle) {
        let score = 0;
        
        // Timing accuracy
        score += this.analyzeTimingPatterns(subtitle);
        
        // Readability
        score += this.calculateReadability(subtitle);
        
        // Completeness
        score += this.checkCompleteness(subtitle);
        
        // Synchronization
        score += this.analyzeSyncQuality(subtitle);
        
        return Math.min(100, Math.max(0, score));
    }
    
    analyzeTimingPatterns(subtitle) {
        // Placeholder for timing analysis logic
        return 25;
    }
    
    calculateReadability(subtitle) {
        // Placeholder for readability analysis logic
        return 25;
    }
    
    checkCompleteness(subtitle) {
        // Placeholder for completeness analysis logic
        return 25;
    }
    
    analyzeSyncQuality(subtitle) {
        // Placeholder for sync quality analysis logic
        return 25;
    }
    
    async getHealthStatus() {
        const eventBusHealth = await this.eventBus.healthCheck();
        return {
            serviceId: this.config.serviceId,
            serviceName: this.config.serviceName,
            status: eventBusHealth.healthy ? 'healthy' : 'unhealthy',
            timestamp: Date.now(),
            uptime: this.startTime ? Date.now() - this.startTime : 0,
            dependencies: {
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
        
        if (this.server) {
            await new Promise(resolve => this.server.close(resolve));
        }

        if (this.eventBus) {
            await this.eventBus.shutdown();
        }
        
        console.log(`[${this.config.serviceName}] Shutdown completed`);
    }
}

if (require.main === module) {
    const service = new QualityService();
    service.start().catch(error => {
        console.error('Failed to start Quality Service:', error);
        process.exit(1);
    });
    
    process.on('SIGINT', async () => {
        await service.stop();
        process.exit(0);
    });
}

module.exports = QualityService;