// services/api-gateway/serviceDiscovery.js
// Service Discovery and Registry for Microservices

const EventEmitter = require('events');

class ServiceDiscovery extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.config = {
            eventBus: options.eventBus,
            ttl: options.ttl || 60, // Service registration TTL in seconds
            healthCheckInterval: options.healthCheckInterval || 30000,
            healthCheckTimeout: options.healthCheckTimeout || 5000,
            maxFailedHealthChecks: options.maxFailedHealthChecks || 3
        };
        
        // Service registry
        this.services = new Map();
        this.serviceStats = new Map();
        
        // Health check tracking
        this.healthCheckResults = new Map();
        this.failedHealthChecks = new Map();
        
        console.log('[ServiceDiscovery] Initializing service discovery...');
        this.initialize();
    }
    
    initialize() {
        if (!this.config.eventBus) {
            throw new Error('EventBus is required for ServiceDiscovery');
        }
        
        // Listen for service registration events
        this.config.eventBus.on('service:registered', (data) => {
            this.handleServiceRegistration(data);
        });
        
        // Listen for service shutdown events
        this.config.eventBus.on('service:shutdown', (data) => {
            this.handleServiceShutdown(data);
        });
        
        // Listen for service heartbeats
        this.config.eventBus.on('service:heartbeat', (data) => {
            this.handleServiceHeartbeat(data);
        });
        
        // Listen for health check responses
        this.config.eventBus.on('health:response', (data) => {
            this.handleHealthCheckResponse(data);
        });
        
        // Start periodic health checks
        this.startHealthChecks();
        
        // Start service cleanup
        this.startServiceCleanup();
        
        console.log('[ServiceDiscovery] Service discovery initialized');
    }
    
    handleServiceRegistration(serviceInfo) {
        const serviceKey = `${serviceInfo.name}:${serviceInfo.id}`;
        
        const service = {
            id: serviceInfo.id,
            name: serviceInfo.name,
            status: 'healthy',
            registeredAt: serviceInfo.registeredAt || Date.now(),
            lastHeartbeat: serviceInfo.lastHeartbeat || Date.now(),
            lastHealthCheck: null,
            healthCheckFailures: 0,
            metadata: serviceInfo.metadata || {},
            events: serviceInfo.events || { publishes: [], subscribes: [] },
            endpoints: serviceInfo.endpoints || [],
            version: serviceInfo.version || '1.0.0'
        };
        
        this.services.set(serviceKey, service);
        
        // Initialize stats
        if (!this.serviceStats.has(serviceInfo.name)) {
            this.serviceStats.set(serviceInfo.name, {
                totalInstances: 0,
                healthyInstances: 0,
                unhealthyInstances: 0,
                totalRequests: 0,
                successfulRequests: 0,
                failedRequests: 0,
                averageResponseTime: 0
            });
        }
        
        this.updateServiceStats(serviceInfo.name);
        
        console.log(`[ServiceDiscovery] Service registered: ${serviceInfo.name} (${serviceInfo.id})`);
        this.emit('serviceRegistered', service);
    }
    
    handleServiceShutdown(serviceInfo) {
        const serviceKey = `${serviceInfo.serviceName}:${serviceInfo.serviceId}`;
        
        if (this.services.has(serviceKey)) {
            this.services.delete(serviceKey);
            this.updateServiceStats(serviceInfo.serviceName);
            
            console.log(`[ServiceDiscovery] Service shutdown: ${serviceInfo.serviceName} (${serviceInfo.serviceId})`);
            this.emit('serviceShutdown', serviceInfo);
        }
    }
    
    handleServiceHeartbeat(heartbeatData) {
        const serviceKey = `${heartbeatData.serviceName}:${heartbeatData.serviceId}`;
        const service = this.services.get(serviceKey);
        
        if (service) {
            service.lastHeartbeat = heartbeatData.timestamp;
            service.status = 'healthy';
            service.healthCheckFailures = 0;
            
            // Update metrics if provided
            if (heartbeatData.metrics) {
                service.metrics = heartbeatData.metrics;
            }
            
            this.updateServiceStats(heartbeatData.serviceName);
        }
    }
    
    handleHealthCheckResponse(responseData) {
        const serviceKey = `${responseData.serviceName}:${responseData.serviceId}`;
        const service = this.services.get(serviceKey);
        
        if (service) {
            service.lastHealthCheck = responseData.timestamp;
            
            if (responseData.status === 'healthy') {
                service.status = 'healthy';
                service.healthCheckFailures = 0;
                this.failedHealthChecks.delete(serviceKey);
            } else {
                service.healthCheckFailures++;
                
                if (service.healthCheckFailures >= this.config.maxFailedHealthChecks) {
                    service.status = 'unhealthy';
                }
            }
            
            this.updateServiceStats(responseData.serviceName);
        }
    }
    
    async performHealthChecks() {
        const services = Array.from(this.services.values());
        
        for (const service of services) {
            try {
                await this.performHealthCheck(service);
            } catch (error) {
                console.error(`[ServiceDiscovery] Health check failed for ${service.name}:`, error);
            }
        }
    }
    
    async performHealthCheck(service) {
        const correlationId = `health_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        try {
            // Send health check request
            await this.config.eventBus.publish('health:check', {
                targetService: service.name,
                correlationId,
                timestamp: Date.now()
            });
            
            // Wait for response with timeout
            const response = await this.waitForHealthCheckResponse(correlationId);
            
            if (response) {
                this.handleHealthCheckResponse(response);
            } else {
                // No response received, mark as failed
                this.handleHealthCheckFailure(service);
            }
            
        } catch (error) {
            this.handleHealthCheckFailure(service);
            throw error;
        }
    }
    
    waitForHealthCheckResponse(correlationId) {
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                this.config.eventBus.off('health:response', responseHandler);
                resolve(null);
            }, this.config.healthCheckTimeout);
            
            const responseHandler = (data) => {
                if (data.correlationId === correlationId) {
                    clearTimeout(timeout);
                    this.config.eventBus.off('health:response', responseHandler);
                    resolve(data);
                }
            };
            
            this.config.eventBus.on('health:response', responseHandler);
        });
    }
    
    handleHealthCheckFailure(service) {
        const serviceKey = `${service.name}:${service.id}`;
        service.healthCheckFailures++;
        
        if (service.healthCheckFailures >= this.config.maxFailedHealthChecks) {
            service.status = 'unhealthy';
            console.warn(`[ServiceDiscovery] Service marked as unhealthy: ${service.name} (${service.id})`);
            this.emit('serviceUnhealthy', service);
        }
        
        this.updateServiceStats(service.name);
    }
    
    startHealthChecks() {
        setInterval(async () => {
            try {
                await this.performHealthChecks();
            } catch (error) {
                console.error('[ServiceDiscovery] Health check cycle failed:', error);
            }
        }, this.config.healthCheckInterval);
        
        console.log(`[ServiceDiscovery] Health checks started (interval: ${this.config.healthCheckInterval}ms)`);
    }
    
    startServiceCleanup() {
        setInterval(() => {
            this.cleanupStaleServices();
        }, 60000); // Every minute
        
        console.log('[ServiceDiscovery] Service cleanup started');
    }
    
    cleanupStaleServices() {
        const now = Date.now();
        const ttlMs = this.config.ttl * 1000;
        let cleaned = 0;
        
        for (const [serviceKey, service] of this.services.entries()) {
            // Remove services that haven't sent heartbeat within TTL
            if (now - service.lastHeartbeat > ttlMs * 2) {
                this.services.delete(serviceKey);
                cleaned++;
                
                console.log(`[ServiceDiscovery] Cleaned up stale service: ${service.name} (${service.id})`);
                this.emit('serviceRemoved', service);
            }
        }
        
        if (cleaned > 0) {
            // Update stats for all affected service types
            const serviceNames = new Set();
            for (const service of this.services.values()) {
                serviceNames.add(service.name);
            }
            
            for (const serviceName of serviceNames) {
                this.updateServiceStats(serviceName);
            }
        }
    }
    
    updateServiceStats(serviceName) {
        const services = this.getServicesByName(serviceName);
        const stats = this.serviceStats.get(serviceName);
        
        if (stats) {
            stats.totalInstances = services.length;
            stats.healthyInstances = services.filter(s => s.status === 'healthy').length;
            stats.unhealthyInstances = services.filter(s => s.status === 'unhealthy').length;
        }
    }
    
    // Public API methods
    async getServices() {
        return Array.from(this.services.values());
    }
    
    async getServicesByName(serviceName) {
        return Array.from(this.services.values()).filter(s => s.name === serviceName);
    }
    
    async getHealthyServices(serviceName = null) {
        const services = Array.from(this.services.values()).filter(s => s.status === 'healthy');
        
        if (serviceName) {
            return services.filter(s => s.name === serviceName);
        }
        
        return services;
    }
    
    async getService(serviceName, serviceId) {
        const serviceKey = `${serviceName}:${serviceId}`;
        return this.services.get(serviceKey) || null;
    }
    
    async registerService(serviceInfo) {
        // This method can be used for manual service registration
        this.handleServiceRegistration(serviceInfo);
    }
    
    async unregisterService(serviceName, serviceId) {
        const serviceKey = `${serviceName}:${serviceId}`;
        
        if (this.services.has(serviceKey)) {
            const service = this.services.get(serviceKey);
            this.services.delete(serviceKey);
            this.updateServiceStats(serviceName);
            
            console.log(`[ServiceDiscovery] Service unregistered: ${serviceName} (${serviceId})`);
            this.emit('serviceUnregistered', service);
            
            return true;
        }
        
        return false;
    }
    
    // Statistics and monitoring
    getServiceStats() {
        const stats = {};
        
        for (const [serviceName, serviceStats] of this.serviceStats.entries()) {
            stats[serviceName] = { ...serviceStats };
        }
        
        return stats;
    }
    
    getOverallStats() {
        const services = Array.from(this.services.values());
        
        return {
            totalServices: services.length,
            healthyServices: services.filter(s => s.status === 'healthy').length,
            unhealthyServices: services.filter(s => s.status === 'unhealthy').length,
            serviceTypes: new Set(services.map(s => s.name)).size,
            averageUptime: this.calculateAverageUptime(services),
            lastHealthCheck: Math.max(...services.map(s => s.lastHealthCheck || 0))
        };
    }
    
    calculateAverageUptime(services) {
        if (services.length === 0) return 0;
        
        const now = Date.now();
        const totalUptime = services.reduce((sum, service) => {
            return sum + (now - service.registeredAt);
        }, 0);
        
        return Math.round(totalUptime / services.length);
    }
    
    // Health check
    async healthCheck() {
        const services = Array.from(this.services.values());
        const healthyServices = services.filter(s => s.status === 'healthy');
        
        return {
            healthy: this.config.eventBus && services.length > 0,
            services: {
                total: services.length,
                healthy: healthyServices.length,
                unhealthy: services.length - healthyServices.length
            },
            eventBus: this.config.eventBus ? await this.config.eventBus.healthCheck() : { healthy: false }
        };
    }
    
    // Event handlers for request tracking
    recordRequest(serviceName, success, responseTime) {
        const stats = this.serviceStats.get(serviceName);
        if (stats) {
            stats.totalRequests++;
            
            if (success) {
                stats.successfulRequests++;
            } else {
                stats.failedRequests++;
            }
            
            if (responseTime) {
                stats.averageResponseTime = (stats.averageResponseTime + responseTime) / 2;
            }
        }
    }
    
    // Shutdown
    async shutdown() {
        console.log('[ServiceDiscovery] Shutting down...');
        
        // Clear all intervals and timeouts
        // (In a real implementation, you'd track these and clear them)
        
        // Clear service registry
        this.services.clear();
        this.serviceStats.clear();
        this.healthCheckResults.clear();
        this.failedHealthChecks.clear();
        
        console.log('[ServiceDiscovery] Shutdown completed');
        this.emit('shutdown');
    }
}

module.exports = ServiceDiscovery;