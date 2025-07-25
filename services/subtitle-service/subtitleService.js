// services/subtitle-service/subtitleService.js
// Microservice for fetching subtitles from various providers

const EventBus = require('../../lib/events/eventBus');
const { getSubtitleUrlsForStremio } = require('../../lib/subtitleMatcher');

class SubtitleService {
    constructor(options = {}) {
        this.config = {
            serviceName: 'subtitle-service',
            serviceId: `subtitle_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            port: options.port || process.env.SUBTITLE_SERVICE_PORT || 7001,
            host: options.host || process.env.SUBTITLE_SERVICE_HOST || '0.0.0.0',
            
            // Event bus configuration
            redisUrl: options.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379',
            
            // Performance settings
            requestTimeout: options.requestTimeout || 30000
        };
        
        this.eventBus = null;
        this.server = null;
        
        console.log(`[${this.config.serviceName}] Initializing subtitle service...`);
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
            
            // Start the service (e.g., an Express server for direct communication if needed)
            // For now, we'll rely on the event bus for communication
            
            console.log(`[${this.config.serviceName}] Initialization completed`);
            
        } catch (error) {
            console.error(`[${this.config.serviceName}] Initialization failed:`, error);
            throw error;
        }
    }
    
    setupEventHandlers() {
        if (!this.eventBus) return;
        
        // Handle subtitle search requests
        this.eventBus.on('subtitle:search:request', async (data, metadata) => {
            const { videoId, type, season, episode, language, infoHash } = data;
            const { correlationId } = metadata;
            
            try {
                console.log(`[${this.config.serviceName}] Received subtitle search request:`, data);
                
                const subtitles = await getSubtitleUrlsForStremio(
                    videoId,
                    type,
                    season,
                    episode,
                    language,
                    infoHash
                );

                // Score subtitles
                const scoredSubtitles = await this.scoreSubtitles(subtitles, correlationId);
                
                // Publish the response
                await this.eventBus.publish('subtitle:search:response', {
                    success: true,
                    subtitles: scoredSubtitles
                }, { correlationId });
                
            } catch (error) {
                console.error(`[${this.config.serviceName}] Error processing subtitle search request:`, error);
                
                // Publish an error response
                await this.eventBus.publish('subtitle:search:response', {
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

    async scoreSubtitles(subtitles, correlationId) {
        const scoredSubtitles = await Promise.all(
            subtitles.map(async (subtitle) => {
                try {
                    const response = await this.eventBus.request('quality:analyze:request', { subtitle }, { correlationId });
                    return {
                        ...subtitle,
                        qualityScore: response.qualityScore
                    };
                } catch (error) {
                    console.error(`[${this.config.serviceName}] Error scoring subtitle:`, error);
                    return {
                        ...subtitle,
                        qualityScore: 50 // Default score on error
                    };
                }
            })
        );

        return scoredSubtitles.sort((a, b) => b.qualityScore - a.qualityScore);
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
        // In a real scenario, you might start an Express server here
        // for direct API access or other purposes.
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
    const service = new SubtitleService();
    service.start().catch(error => {
        console.error('Failed to start Subtitle Service:', error);
        process.exit(1);
    });
    
    process.on('SIGINT', async () => {
        await service.stop();
        process.exit(0);
    });
}

module.exports = SubtitleService;