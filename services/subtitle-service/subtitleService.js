// services/subtitle-service/subtitleService.js
// Microservice for fetching subtitles from various providers

const express = require('express');
const EventBus = require('../../lib/events/eventBus');
const { getSubtitleUrlsForStremio } = require('../../lib/subtitleMatcher');
const config = require('../../config');

class SubtitleService {
    constructor(options = {}) {
        this.config = {
            serviceName: 'subtitle-service',
            serviceId: `subtitle_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            port: options.port || process.env.SUBTITLE_SERVICE_PORT || 7001,
            host: options.host || process.env.SUBTITLE_SERVICE_HOST || '0.0.0.0',
            
            // Event bus configuration
            redis: config.redis,
            
            // Performance settings
            requestTimeout: options.requestTimeout || 30000
        };
        
        this.app = express();
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
                redis: this.config.redis
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

    setupRoutes() {
        this.app.get('/health', async (req, res) => {
            const health = await this.getHealthStatus();
            res.status(health.status === 'healthy' ? 200 : 503).json(health);
        });

        this.app.get('/subtitles/:type/:id', async (req, res) => {
            const { type, id } = req.params;
            const { language, infoHash } = req.query;
            
            try {
                const subtitles = await getSubtitleUrlsForStremio(id, type, null, null, language, infoHash);
                const scoredSubtitles = await this.scoreSubtitles(subtitles, `http_${Date.now()}`);
                res.json({ subtitles: scoredSubtitles });
            } catch (error) {
                res.status(500).json({ error: error.message });
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