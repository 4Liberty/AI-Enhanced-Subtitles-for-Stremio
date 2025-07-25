// services/api-gateway/requestRouter.js
// Request Router for Microservices

const fetch = require('node-fetch');

class RequestRouter {
    constructor(options = {}) {
        this.config = {
            serviceDiscovery: options.serviceDiscovery,
            loadBalancer: options.loadBalancer,
            eventBus: options.eventBus,
            requestTimeout: options.requestTimeout || 30000
        };
        
        if (!this.config.serviceDiscovery || !this.config.loadBalancer || !this.config.eventBus) {
            throw new Error('ServiceDiscovery, LoadBalancer, and EventBus are required');
        }
        
        console.log('[RequestRouter] Initialized request router');
    }
    
    async route(serviceName, request) {
        const startTime = Date.now();
        
        try {
            // Find a healthy instance of the service
            const instances = await this.config.serviceDiscovery.getHealthyServices(serviceName);
            if (!instances || instances.length === 0) {
                throw new Error(`No healthy instances found for service: ${serviceName}`);
            }
            
            // Select an instance using the load balancer
            const instance = this.config.loadBalancer.selectInstance(instances);
            if (!instance) {
                throw new Error(`Load balancer failed to select an instance for service: ${serviceName}`);
            }
            
            // Construct the target URL
            const targetUrl = this.constructTargetUrl(instance, request);
            
            // Forward the request
            const response = await this.forwardRequest(targetUrl, request);
            
            const responseTime = Date.now() - startTime;
            
            // Record successful request for service discovery
            this.config.serviceDiscovery.recordRequest(serviceName, true, responseTime);
            
            return {
                success: true,
                data: response.data,
                statusCode: response.statusCode,
                headers: response.headers
            };
            
        } catch (error) {
            const responseTime = Date.now() - startTime;
            
            // Record failed request for service discovery
            this.config.serviceDiscovery.recordRequest(serviceName, false, responseTime);
            
            console.error(`[RequestRouter] Error routing to ${serviceName}:`, error);
            throw error;
        }
    }
    
    constructTargetUrl(instance, request) {
        // Assuming services are running on http and have a port defined
        const baseUrl = `http://${instance.metadata.hostname}:${instance.metadata.port}`;
        const path = request.path || '';
        const query = new URLSearchParams(request.query || {}).toString();
        
        return `${baseUrl}${path}${query ? `?${query}` : ''}`;
    }
    
    async forwardRequest(targetUrl, request) {
        const controller = new AbortController();
        const timeout = setTimeout(() => {
            controller.abort();
        }, this.config.requestTimeout);
        
        try {
            const response = await fetch(targetUrl, {
                method: request.method,
                headers: {
                    ...request.headers,
                    'Content-Type': 'application/json'
                },
                body: request.body ? JSON.stringify(request.body) : undefined,
                signal: controller.signal
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                const error = new Error(data.error || `Request failed with status ${response.status}`);
                error.statusCode = response.status;
                throw error;
            }
            
            return {
                data,
                statusCode: response.status,
                headers: response.headers
            };
            
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('Request timed out');
            }
            throw error;
        } finally {
            clearTimeout(timeout);
        }
    }
}

module.exports = RequestRouter;