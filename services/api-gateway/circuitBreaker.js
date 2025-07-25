// services/api-gateway/circuitBreaker.js
// Circuit Breaker for Microservices

const EventEmitter = require('events');

class CircuitBreaker extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.config = {
            threshold: options.threshold || 5, // Number of failures to open the circuit
            timeout: options.timeout || 60000, // Time in ms to wait before trying again
            onOpen: options.onOpen || (() => {}),
            onClose: options.onClose || (() => {}),
            onHalfOpen: options.onHalfOpen || (() => {})
        };
        
        this.state = 'CLOSED'; // Can be CLOSED, OPEN, or HALF_OPEN
        this.failureCount = 0;
        this.lastFailureTime = null;
        this.resetTimer = null;
        
        console.log('[CircuitBreaker] Initialized with threshold:', this.config.threshold, 'and timeout:', this.config.timeout);
    }
    
    recordFailure() {
        this.failureCount++;
        this.lastFailureTime = Date.now();
        
        if (this.state === 'HALF_OPEN') {
            this.open();
        } else if (this.failureCount >= this.config.threshold) {
            this.open();
        }
    }
    
    recordSuccess() {
        if (this.state === 'HALF_OPEN') {
            this.close();
        }
        
        this.reset();
    }
    
    open() {
        if (this.state === 'OPEN') {
            return;
        }
        
        this.state = 'OPEN';
        this.emit('open');
        this.config.onOpen();
        
        // Set a timer to move to HALF_OPEN state
        this.resetTimer = setTimeout(() => {
            this.halfOpen();
        }, this.config.timeout);
        
        console.log(`[CircuitBreaker] Circuit opened. Will try again in ${this.config.timeout}ms`);
    }
    
    close() {
        if (this.state === 'CLOSED') {
            return;
        }
        
        this.state = 'CLOSED';
        this.emit('close');
        this.config.onClose();
        
        this.reset();
        
        console.log('[CircuitBreaker] Circuit closed. Operations resumed.');
    }
    
    halfOpen() {
        if (this.state === 'HALF_OPEN') {
            return;
        }
        
        this.state = 'HALF_OPEN';
        this.emit('halfOpen');
        this.config.onHalfOpen();
        
        console.log('[CircuitBreaker] Circuit is half-open. Allowing one test request.');
    }
    
    reset() {
        this.failureCount = 0;
        this.lastFailureTime = null;
        
        if (this.resetTimer) {
            clearTimeout(this.resetTimer);
            this.resetTimer = null;
        }
    }
    
    isOpen() {
        return this.state === 'OPEN';
    }
    
    isClosed() {
        return this.state === 'CLOSED';
    }
    
    isHalfOpen() {
        return this.state === 'HALF_OPEN';
    }
    
    getState() {
        return this.state;
    }
    
    getFailureCount() {
        return this.failureCount;
    }
    
    getLastFailureTime() {
        return this.lastFailureTime;
    }
}

module.exports = CircuitBreaker;