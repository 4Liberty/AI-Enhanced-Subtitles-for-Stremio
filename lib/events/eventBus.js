// lib/events/eventBus.js
// Event-Driven Communication System for Microservices Architecture

const EventEmitter = require('events');
const redis = require('redis');

class EventBus extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.config = {
            // Redis configuration for distributed events
            redisUrl: options.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379',
            eventPrefix: options.eventPrefix || 'vlsub:events:',
            
            // Event processing settings
            maxRetries: options.maxRetries || 3,
            retryDelay: options.retryDelay || 1000,
            eventTimeout: options.eventTimeout || 30000,
            
            // Service identification
            serviceId: options.serviceId || `service_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            serviceName: options.serviceName || 'unknown',
            
            // Event persistence
            enablePersistence: options.enablePersistence !== false,
            persistenceTTL: options.persistenceTTL || 24 * 60 * 60, // 24 hours
            
            // Monitoring
            enableMetrics: options.enableMetrics !== false
        };
        
        // Redis clients
        this.publisher = null;
        this.subscriber = null;
        this.isConnected = false;
        
        // Event tracking
        this.eventHandlers = new Map();
        this.pendingEvents = new Map();
        this.eventMetrics = {
            published: 0,
            received: 0,
            processed: 0,
            failed: 0,
            retries: 0
        };
        
        // Service registry
        this.services = new Map();
        this.serviceHeartbeats = new Map();
        
        console.log(`[EventBus] Initializing for service: ${this.config.serviceName} (${this.config.serviceId})`);
        this.initialize();
    }
    
    async initialize() {
        try {
            // Create Redis clients
            this.publisher = redis.createClient({ url: this.config.redisUrl });
            this.subscriber = redis.createClient({ url: this.config.redisUrl });
            
            // Set up error handlers
            this.publisher.on('error', (error) => {
                console.error('[EventBus] Publisher error:', error);
                this.emit('error', { type: 'publisher', error });
            });
            
            this.subscriber.on('error', (error) => {
                console.error('[EventBus] Subscriber error:', error);
                this.emit('error', { type: 'subscriber', error });
            });
            
            // Connect to Redis
            await Promise.all([
                this.publisher.connect(),
                this.subscriber.connect()
            ]);
            
            // Set up event subscriptions
            await this.setupEventSubscriptions();
            
            // Register this service
            await this.registerService();
            
            // Start heartbeat
            this.startHeartbeat();
            
            // Start cleanup tasks
            this.startCleanupTasks();
            
            this.isConnected = true;
            console.log('[EventBus] Successfully connected and initialized');
            this.emit('connected');
            
        } catch (error) {
            console.error('[EventBus] Initialization failed:', error);
            this.emit('error', { type: 'initialization', error });
            throw error;
        }
    }
    
    async setupEventSubscriptions() {
        // Subscribe to all events for this service
        const pattern = `${this.config.eventPrefix}*`;
        await this.subscriber.pSubscribe(pattern, (message, channel) => {
            this.handleIncomingEvent(message, channel);
        });
        
        // Subscribe to service discovery events
        await this.subscriber.subscribe(`${this.config.eventPrefix}service:discovery`, (message) => {
            this.handleServiceDiscovery(message);
        });
        
        // Subscribe to health check requests
        await this.subscriber.subscribe(`${this.config.eventPrefix}health:check`, (message) => {
            this.handleHealthCheck(message);
        });
        
        console.log('[EventBus] Event subscriptions established');
    }
    
    // Event publishing
    async publish(eventType, data, options = {}) {
        if (!this.isConnected) {
            throw new Error('EventBus not connected');
        }
        
        const eventId = this.generateEventId();
        const timestamp = Date.now();
        
        const event = {
            id: eventId,
            type: eventType,
            data,
            metadata: {
                sourceService: this.config.serviceName,
                sourceServiceId: this.config.serviceId,
                timestamp,
                correlationId: options.correlationId || eventId,
                priority: options.priority || 'normal',
                ttl: options.ttl || this.config.eventTimeout,
                retryCount: 0,
                maxRetries: options.maxRetries || this.config.maxRetries
            }
        };
        
        try {
            const channel = `${this.config.eventPrefix}${eventType}`;
            const serializedEvent = JSON.stringify(event);
            
            // Publish the event
            await this.publisher.publish(channel, serializedEvent);
            
            // Store for persistence if enabled
            if (this.config.enablePersistence) {
                await this.persistEvent(event);
            }
            
            // Track metrics
            this.eventMetrics.published++;
            
            console.log(`[EventBus] Published event: ${eventType} (${eventId})`);
            this.emit('eventPublished', { eventType, eventId, data });
            
            return eventId;
            
        } catch (error) {
            this.eventMetrics.failed++;
            console.error(`[EventBus] Failed to publish event ${eventType}:`, error);
            throw error;
        }
    }
    
    // Event subscription
    on(eventType, handler, options = {}) {
        const handlerId = this.generateHandlerId();
        
        const handlerInfo = {
            id: handlerId,
            eventType,
            handler,
            options: {
                priority: options.priority || 'normal',
                timeout: options.timeout || this.config.eventTimeout,
                retryOnError: options.retryOnError !== false,
                maxRetries: options.maxRetries || this.config.maxRetries
            },
            stats: {
                processed: 0,
                errors: 0,
                averageProcessingTime: 0
            }
        };
        
        if (!this.eventHandlers.has(eventType)) {
            this.eventHandlers.set(eventType, []);
        }
        
        this.eventHandlers.get(eventType).push(handlerInfo);
        
        console.log(`[EventBus] Registered handler for event: ${eventType} (${handlerId})`);
        return handlerId;
    }
    
    // Remove event handler
    off(eventType, handlerId) {
        const handlers = this.eventHandlers.get(eventType);
        if (handlers) {
            const index = handlers.findIndex(h => h.id === handlerId);
            if (index > -1) {
                handlers.splice(index, 1);
                console.log(`[EventBus] Removed handler: ${handlerId} for event: ${eventType}`);
                return true;
            }
        }
        return false;
    }
    
    // Handle incoming events
    async handleIncomingEvent(message, channel) {
        try {
            const event = JSON.parse(message);
            const eventType = event.type;
            
            // Skip events from this service to avoid loops
            if (event.metadata.sourceServiceId === this.config.serviceId) {
                return;
            }
            
            // Check if event has expired
            if (this.isEventExpired(event)) {
                console.warn(`[EventBus] Received expired event: ${event.id}`);
                return;
            }
            
            this.eventMetrics.received++;
            
            console.log(`[EventBus] Received event: ${eventType} (${event.id})`);
            
            // Get handlers for this event type
            const handlers = this.eventHandlers.get(eventType) || [];
            
            if (handlers.length === 0) {
                console.log(`[EventBus] No handlers registered for event: ${eventType}`);
                return;
            }
            
            // Process handlers in parallel
            const processingPromises = handlers.map(handlerInfo => 
                this.processEventHandler(event, handlerInfo)
            );
            
            await Promise.allSettled(processingPromises);
            
        } catch (error) {
            this.eventMetrics.failed++;
            console.error('[EventBus] Error handling incoming event:', error);
        }
    }
    
    async processEventHandler(event, handlerInfo) {
        const startTime = Date.now();
        
        try {
            // Create timeout promise
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Handler timeout')), handlerInfo.options.timeout);
            });
            
            // Execute handler with timeout
            const handlerPromise = handlerInfo.handler(event.data, event.metadata);
            
            await Promise.race([handlerPromise, timeoutPromise]);
            
            // Update stats
            const processingTime = Date.now() - startTime;
            handlerInfo.stats.processed++;
            handlerInfo.stats.averageProcessingTime = 
                (handlerInfo.stats.averageProcessingTime + processingTime) / 2;
            
            this.eventMetrics.processed++;
            
            console.log(`[EventBus] Handler ${handlerInfo.id} processed event ${event.id} in ${processingTime}ms`);
            
        } catch (error) {
            const processingTime = Date.now() - startTime;
            handlerInfo.stats.errors++;
            this.eventMetrics.failed++;
            
            console.error(`[EventBus] Handler ${handlerInfo.id} failed for event ${event.id}:`, error);
            
            // Retry if enabled
            if (handlerInfo.options.retryOnError && 
                event.metadata.retryCount < event.metadata.maxRetries) {
                
                await this.retryEvent(event, handlerInfo, error);
            }
        }
    }
    
    async retryEvent(event, handlerInfo, originalError) {
        try {
            event.metadata.retryCount++;
            this.eventMetrics.retries++;
            
            console.log(`[EventBus] Retrying event ${event.id} (attempt ${event.metadata.retryCount})`);
            
            // Wait before retry
            await new Promise(resolve => 
                setTimeout(resolve, this.config.retryDelay * event.metadata.retryCount)
            );
            
            // Retry the handler
            await this.processEventHandler(event, handlerInfo);
            
        } catch (retryError) {
            console.error(`[EventBus] Retry failed for event ${event.id}:`, retryError);
            
            // Emit retry failure event
            this.emit('retryFailed', {
                event,
                handlerInfo,
                originalError,
                retryError
            });
        }
    }
    
    // Service discovery and registration
    async registerService() {
        const serviceInfo = {
            id: this.config.serviceId,
            name: this.config.serviceName,
            registeredAt: Date.now(),
            lastHeartbeat: Date.now(),
            events: {
                publishes: Array.from(this.getPublishedEventTypes()),
                subscribes: Array.from(this.eventHandlers.keys())
            },
            metadata: {
                version: process.env.SERVICE_VERSION || '1.0.0',
                environment: process.env.NODE_ENV || 'development',
                pid: process.pid,
                hostname: require('os').hostname()
            }
        };
        
        // Store service info in Redis
        const serviceKey = `${this.config.eventPrefix}services:${this.config.serviceId}`;
        await this.publisher.setEx(serviceKey, 60, JSON.stringify(serviceInfo)); // 60 second TTL
        
        // Announce service registration
        await this.publish('service:registered', serviceInfo);
        
        console.log(`[EventBus] Service registered: ${this.config.serviceName}`);
    }
    
    async discoverServices() {
        try {
            const pattern = `${this.config.eventPrefix}services:*`;
            const keys = await this.publisher.keys(pattern);
            
            const services = [];
            for (const key of keys) {
                const serviceData = await this.publisher.get(key);
                if (serviceData) {
                    services.push(JSON.parse(serviceData));
                }
            }
            
            return services;
            
        } catch (error) {
            console.error('[EventBus] Service discovery failed:', error);
            return [];
        }
    }
    
    // Health check handling
    async handleHealthCheck(message) {
        try {
            const request = JSON.parse(message);
            
            if (request.targetService === this.config.serviceName || 
                request.targetService === 'all') {
                
                const healthInfo = {
                    serviceId: this.config.serviceId,
                    serviceName: this.config.serviceName,
                    status: 'healthy',
                    timestamp: Date.now(),
                    metrics: this.getHealthMetrics(),
                    uptime: Date.now() - this.startTime
                };
                
                await this.publish('health:response', healthInfo, {
                    correlationId: request.correlationId
                });
            }
            
        } catch (error) {
            console.error('[EventBus] Health check handling failed:', error);
        }
    }
    
    // Heartbeat system
    startHeartbeat() {
        this.startTime = Date.now();
        
        setInterval(async () => {
            try {
                await this.registerService(); // Re-register to update TTL
                
                const heartbeat = {
                    serviceId: this.config.serviceId,
                    serviceName: this.config.serviceName,
                    timestamp: Date.now(),
                    metrics: this.eventMetrics
                };
                
                await this.publish('service:heartbeat', heartbeat);
                
            } catch (error) {
                console.error('[EventBus] Heartbeat failed:', error);
            }
        }, 30000); // Every 30 seconds
    }
    
    // Event persistence
    async persistEvent(event) {
        try {
            const eventKey = `${this.config.eventPrefix}persisted:${event.id}`;
            await this.publisher.setEx(
                eventKey, 
                this.config.persistenceTTL, 
                JSON.stringify(event)
            );
        } catch (error) {
            console.error('[EventBus] Event persistence failed:', error);
        }
    }
    
    async getPersistedEvent(eventId) {
        try {
            const eventKey = `${this.config.eventPrefix}persisted:${eventId}`;
            const eventData = await this.publisher.get(eventKey);
            return eventData ? JSON.parse(eventData) : null;
        } catch (error) {
            console.error('[EventBus] Failed to retrieve persisted event:', error);
            return null;
        }
    }
    
    // Utility methods
    generateEventId() {
        return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    generateHandlerId() {
        return `hdl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    isEventExpired(event) {
        return Date.now() - event.metadata.timestamp > event.metadata.ttl;
    }
    
    getPublishedEventTypes() {
        // This would be populated by tracking published events
        return new Set();
    }
    
    getHealthMetrics() {
        return {
            events: this.eventMetrics,
            handlers: this.eventHandlers.size,
            pendingEvents: this.pendingEvents.size,
            connected: this.isConnected
        };
    }
    
    // Cleanup tasks
    startCleanupTasks() {
        // Clean up expired events every 5 minutes
        setInterval(async () => {
            await this.cleanupExpiredEvents();
        }, 5 * 60 * 1000);
        
        // Clean up old service registrations every minute
        setInterval(async () => {
            await this.cleanupStaleServices();
        }, 60 * 1000);
    }
    
    async cleanupExpiredEvents() {
        try {
            const pattern = `${this.config.eventPrefix}persisted:*`;
            const keys = await this.publisher.keys(pattern);
            
            let cleaned = 0;
            for (const key of keys) {
                const eventData = await this.publisher.get(key);
                if (eventData) {
                    const event = JSON.parse(eventData);
                    if (this.isEventExpired(event)) {
                        await this.publisher.del(key);
                        cleaned++;
                    }
                }
            }
            
            if (cleaned > 0) {
                console.log(`[EventBus] Cleaned up ${cleaned} expired events`);
            }
            
        } catch (error) {
            console.error('[EventBus] Event cleanup failed:', error);
        }
    }
    
    async cleanupStaleServices() {
        try {
            const pattern = `${this.config.eventPrefix}services:*`;
            const keys = await this.publisher.keys(pattern);
            
            let cleaned = 0;
            for (const key of keys) {
                const ttl = await this.publisher.ttl(key);
                if (ttl === -1) { // No TTL set, service might be stale
                    await this.publisher.del(key);
                    cleaned++;
                }
            }
            
            if (cleaned > 0) {
                console.log(`[EventBus] Cleaned up ${cleaned} stale service registrations`);
            }
            
        } catch (error) {
            console.error('[EventBus] Service cleanup failed:', error);
        }
    }
    
    // Statistics and monitoring
    getStats() {
        return {
            service: {
                id: this.config.serviceId,
                name: this.config.serviceName,
                connected: this.isConnected,
                uptime: this.startTime ? Date.now() - this.startTime : 0
            },
            events: {
                ...this.eventMetrics,
                handlers: this.eventHandlers.size,
                pendingEvents: this.pendingEvents.size
            },
            handlers: Array.from(this.eventHandlers.entries()).map(([eventType, handlers]) => ({
                eventType,
                handlerCount: handlers.length,
                totalProcessed: handlers.reduce((sum, h) => sum + h.stats.processed, 0),
                totalErrors: handlers.reduce((sum, h) => sum + h.stats.errors, 0)
            }))
        };
    }
    
    // Health check
    async healthCheck() {
        try {
            // Test Redis connection
            await this.publisher.ping();
            await this.subscriber.ping();
            
            return {
                healthy: this.isConnected,
                service: this.config.serviceName,
                serviceId: this.config.serviceId,
                connected: this.isConnected,
                metrics: this.eventMetrics,
                uptime: this.startTime ? Date.now() - this.startTime : 0
            };
            
        } catch (error) {
            return {
                healthy: false,
                error: error.message
            };
        }
    }
    
    // Shutdown
    async shutdown() {
        console.log('[EventBus] Shutting down...');
        
        try {
            // Unregister service
            const serviceKey = `${this.config.eventPrefix}services:${this.config.serviceId}`;
            await this.publisher.del(serviceKey);
            
            // Announce service shutdown
            await this.publish('service:shutdown', {
                serviceId: this.config.serviceId,
                serviceName: this.config.serviceName,
                timestamp: Date.now()
            });
            
            // Close Redis connections
            await Promise.all([
                this.publisher.quit(),
                this.subscriber.quit()
            ]);
            
            this.isConnected = false;
            console.log('[EventBus] Shutdown completed');
            this.emit('shutdown');
            
        } catch (error) {
            console.error('[EventBus] Shutdown error:', error);
        }
    }
}

module.exports = EventBus;