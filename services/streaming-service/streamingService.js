// services/streaming-service/streamingService.js
// Microservice for handling Real-Debrid and other streaming providers

const EventBus = require('../../lib/events/eventBus');
const { searchRealDebrid } = require('../../lib/realDebridSearch');
const { enrichStreams } = require('../../lib/streamEnricher');

class StreamingService {
    constructor(options = {}) {
        this.config = {
            serviceName: 'streaming-service',
            serviceId: `streaming_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            port: options.port || process.env.STREAMING_SERVICE_PORT || 7003,
            host: options.host || process.env.STREAMING_SERVICE_HOST || '0.0.0.0',
            
            // Event bus configuration
            redisUrl: options.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379'
        };
        
        this.eventBus = null;
        this.server = null;
        
        console.log(`[${this.config.serviceName}] Initializing streaming service...`);
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
        
        // Handle Real-Debrid search requests
        this.eventBus.on('streaming:realdebrid:search', async (data, metadata) => {
            const { imdbId, type, season, episode } = data;
            const { correlationId } = metadata;
            
            try {
                console.log(`[${this.config.serviceName}] Received Real-Debrid search request:`, data);
                
                const streams = await searchRealDebrid({
                    imdb_id: imdbId,
                    type,
                    season,
                    episode
                });
                
                // Publish the response
                await this.eventBus.publish('streaming:realdebrid:response', {
                    success: true,
                    streams
                }, { correlationId });
                
            } catch (error) {
                console.error(`[${this.config.serviceName}] Error processing Real-Debrid search request:`, error);
                
                await this.eventBus.publish('streaming:realdebrid:response', {
                    success: false,
                    error: error.message
                }, { correlationId });
            }
        });
        
        // Handle stream enrichment requests
        this.eventBus.on('streaming:enrich', async (data, metadata) => {
            const { streams } = data;
            const { correlationId } = metadata;
            
            try {
                console.log(`[${this.config.serviceName}] Received stream enrichment request`);
                
                const enrichedStreams = await enrichStreams(streams);
                
                await this.eventBus.publish('streaming:enrich:response', {
                    success: true,
                    enrichedStreams
                }, { correlationId });
                
            } catch (error) {
                console.error(`[${this.config.serviceName}] Error processing stream enrichment request:`, error);
                
                await this.eventBus.publish('streaming:enrich:response', {
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
        return {
            serviceId: this.config.serviceId,
            serviceName: this.config.serviceName,
            status: 'healthy',
            timestamp: Date.now(),
            uptime: this.startTime ? Date.now() - this.startTime : 0
        };
    }
    
    async start() {
        this.startTime = Date.now();
        console.log(`[${this.config.serviceName}] Service started`);
    }
    
    async stop() {
        console.log(`[${this.config.serviceName}] Shutting down...`);
        
        if (this.eventBus) {
            await this.eventBus.shutdown();
        }
        
        console.log(`[${this.config.serviceName}] Shutdown completed`);
    }
}

// Start the service if run directly
if (require.main === module) {
    const service = new StreamingService();
    service.start().catch(error => {
        console.error('Failed to start Streaming Service:', error);
        process.exit(1);
    });
    
    process.on('SIGINT', async () => {
        await service.stop();
        process.exit(0);
    });
}

module.exports = StreamingService;