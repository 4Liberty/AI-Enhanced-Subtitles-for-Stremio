// services/api-gateway/loadBalancer.js
// Load Balancer for Microservices

class LoadBalancer {
    constructor(options = {}) {
        this.config = {
            strategy: options.strategy || 'round-robin',
            healthCheckInterval: options.healthCheckInterval || 30000
        };
        
        // State for different strategies
        this.roundRobinIndex = 0;
        this.leastConnections = new Map();
        
        console.log(`[LoadBalancer] Initialized with strategy: ${this.config.strategy}`);
    }
    
    selectInstance(instances, ip = null) {
        if (!instances || instances.length === 0) {
            return null;
        }
        
        // Filter for healthy instances
        const healthyInstances = instances.filter(instance =>
            instance.status === 'healthy'
        );
        
        if (healthyInstances.length === 0) {
            return null; // No healthy instances available
        }
        
        switch (this.config.strategy) {
            case 'round-robin':
                return this.roundRobin(healthyInstances);
            case 'least-connections':
                return this.leastConnectionsStrategy(healthyInstances);
            case 'random':
                return this.random(healthyInstances);
            case 'ip-hash':
                return this.ipHash(healthyInstances, ip);
            default:
                return this.roundRobin(healthyInstances);
        }
    }
    
    // Round Robin strategy
    roundRobin(instances) {
        if (this.roundRobinIndex >= instances.length) {
            this.roundRobinIndex = 0;
        }
        
        const instance = instances[this.roundRobinIndex];
        this.roundRobinIndex++;
        
        return instance;
    }
    
    // Least Connections strategy
    leastConnectionsStrategy(instances) {
        let selectedInstance = null;
        let minConnections = Infinity;
        
        for (const instance of instances) {
            const connections = this.leastConnections.get(instance.id) || 0;
            
            if (connections < minConnections) {
                minConnections = connections;
                selectedInstance = instance;
            }
        }
        
        return selectedInstance;
    }
    
    // Random strategy
    random(instances) {
        const index = Math.floor(Math.random() * instances.length);
        return instances[index];
    }
    
    // IP Hash strategy
    ipHash(instances, ip) {
        if (!ip) {
            return this.random(instances); // Fallback if no IP
        }
        
        // Simple hash function
        const hash = ip.split('.').reduce((acc, octet) => acc + parseInt(octet, 10), 0);
        const index = hash % instances.length;
        
        return instances[index];
    }
    
    // Connection tracking for least connections strategy
    incrementConnection(instanceId) {
        const connections = (this.leastConnections.get(instanceId) || 0) + 1;
        this.leastConnections.set(instanceId, connections);
    }
    
    decrementConnection(instanceId) {
        const connections = (this.leastConnections.get(instanceId) || 1) - 1;
        this.leastConnections.set(instanceId, Math.max(0, connections));
    }
    
    // Health check integration
    updateInstanceStatus(instanceId, status) {
        // This would be used by the service discovery to update instance health
    }
    
    // Get stats
    getStats() {
        return {
            strategy: this.config.strategy,
            roundRobinIndex: this.roundRobinIndex,
            leastConnections: Object.fromEntries(this.leastConnections)
        };
    }
}

module.exports = LoadBalancer;