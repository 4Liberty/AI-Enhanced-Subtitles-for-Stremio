// lib/monitoring/performanceMonitor.js
// Performance Monitoring and Metrics Collection System

const EventEmitter = require('events');
const os = require('os');

class PerformanceMonitor extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.config = {
            collectInterval: options.collectInterval || 30000, // 30 seconds
            retentionPeriod: options.retentionPeriod || 24 * 60 * 60 * 1000, // 24 hours
            enableSystemMetrics: options.enableSystemMetrics !== false,
            enableCustomMetrics: options.enableCustomMetrics !== false,
            alertThresholds: {
                cpuUsage: options.cpuThreshold || 80,
                memoryUsage: options.memoryThreshold || 85,
                responseTime: options.responseTimeThreshold || 5000,
                errorRate: options.errorRateThreshold || 5,
                ...options.alertThresholds
            }
        };
        
        // Metrics storage
        this.metrics = {
            system: [],
            subtitle: [],
            ai: [],
            cache: [],
            database: [],
            custom: []
        };
        
        // Performance counters
        this.counters = {
            subtitleRequests: 0,
            subtitleSuccess: 0,
            subtitleErrors: 0,
            aiProcessingJobs: 0,
            aiProcessingSuccess: 0,
            aiProcessingErrors: 0,
            cacheHits: 0,
            cacheMisses: 0,
            databaseQueries: 0,
            databaseErrors: 0
        };
        
        // Timing data
        this.timings = {
            subtitleProcessing: [],
            aiProcessing: [],
            cacheOperations: [],
            databaseOperations: []
        };
        
        // System monitoring
        this.systemStats = {
            startTime: Date.now(),
            lastCpuUsage: process.cpuUsage(),
            lastMemoryUsage: process.memoryUsage()
        };
        
        // Alert state
        this.alerts = {
            active: new Map(),
            history: []
        };
        
        this.isRunning = false;
        this.intervalId = null;
        
        console.log('[PerformanceMonitor] Initialized with monitoring interval:', this.config.collectInterval);
    }
    
    start() {
        if (this.isRunning) {
            console.warn('[PerformanceMonitor] Already running');
            return;
        }
        
        this.isRunning = true;
        
        // Start metrics collection
        this.intervalId = setInterval(() => {
            this.collectMetrics();
        }, this.config.collectInterval);
        
        // Start cleanup task
        setInterval(() => {
            this.cleanupOldMetrics();
        }, 60 * 60 * 1000); // Every hour
        
        console.log('[PerformanceMonitor] Started monitoring');
        this.emit('started');
    }
    
    stop() {
        if (!this.isRunning) {
            return;
        }
        
        this.isRunning = false;
        
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        
        console.log('[PerformanceMonitor] Stopped monitoring');
        this.emit('stopped');
    }
    
    // Metrics collection
    async collectMetrics() {
        const timestamp = Date.now();
        
        try {
            // Collect system metrics
            if (this.config.enableSystemMetrics) {
                await this.collectSystemMetrics(timestamp);
            }
            
            // Collect application metrics
            this.collectApplicationMetrics(timestamp);
            
            // Check for alerts
            this.checkAlerts(timestamp);
            
            // Emit metrics collected event
            this.emit('metricsCollected', {
                timestamp,
                system: this.getLatestSystemMetrics(),
                application: this.getLatestApplicationMetrics()
            });
            
        } catch (error) {
            console.error('[PerformanceMonitor] Error collecting metrics:', error);
        }
    }
    
    async collectSystemMetrics(timestamp) {
        try {
            // CPU usage
            const currentCpuUsage = process.cpuUsage(this.systemStats.lastCpuUsage);
            const cpuPercent = (currentCpuUsage.user + currentCpuUsage.system) / 1000000 * 100;
            this.systemStats.lastCpuUsage = process.cpuUsage();
            
            // Memory usage
            const memoryUsage = process.memoryUsage();
            const systemMemory = {
                total: os.totalmem(),
                free: os.freemem(),
                used: os.totalmem() - os.freemem()
            };
            const memoryPercent = (systemMemory.used / systemMemory.total) * 100;
            
            // System load
            const loadAverage = os.loadavg();
            
            // Event loop lag
            const eventLoopLag = await this.measureEventLoopLag();
            
            const systemMetrics = {
                timestamp,
                cpu: {
                    usage: Math.round(cpuPercent * 100) / 100,
                    loadAverage: loadAverage.map(load => Math.round(load * 100) / 100)
                },
                memory: {
                    process: {
                        rss: memoryUsage.rss,
                        heapTotal: memoryUsage.heapTotal,
                        heapUsed: memoryUsage.heapUsed,
                        external: memoryUsage.external,
                        arrayBuffers: memoryUsage.arrayBuffers
                    },
                    system: {
                        total: systemMemory.total,
                        free: systemMemory.free,
                        used: systemMemory.used,
                        usagePercent: Math.round(memoryPercent * 100) / 100
                    }
                },
                eventLoop: {
                    lag: eventLoopLag
                },
                uptime: Date.now() - this.systemStats.startTime
            };
            
            this.metrics.system.push(systemMetrics);
            
        } catch (error) {
            console.error('[PerformanceMonitor] Error collecting system metrics:', error);
        }
    }
    
    collectApplicationMetrics(timestamp) {
        // Calculate rates and averages
        const subtitleSuccessRate = this.counters.subtitleRequests > 0 
            ? (this.counters.subtitleSuccess / this.counters.subtitleRequests) * 100 
            : 0;
        
        const aiSuccessRate = this.counters.aiProcessingJobs > 0 
            ? (this.counters.aiProcessingSuccess / this.counters.aiProcessingJobs) * 100 
            : 0;
        
        const cacheHitRate = (this.counters.cacheHits + this.counters.cacheMisses) > 0 
            ? (this.counters.cacheHits / (this.counters.cacheHits + this.counters.cacheMisses)) * 100 
            : 0;
        
        const avgSubtitleProcessingTime = this.calculateAverageTime(this.timings.subtitleProcessing);
        const avgAiProcessingTime = this.calculateAverageTime(this.timings.aiProcessing);
        const avgCacheOperationTime = this.calculateAverageTime(this.timings.cacheOperations);
        const avgDatabaseOperationTime = this.calculateAverageTime(this.timings.databaseOperations);
        
        const applicationMetrics = {
            timestamp,
            subtitle: {
                requests: this.counters.subtitleRequests,
                success: this.counters.subtitleSuccess,
                errors: this.counters.subtitleErrors,
                successRate: Math.round(subtitleSuccessRate * 100) / 100,
                averageProcessingTime: avgSubtitleProcessingTime
            },
            ai: {
                jobs: this.counters.aiProcessingJobs,
                success: this.counters.aiProcessingSuccess,
                errors: this.counters.aiProcessingErrors,
                successRate: Math.round(aiSuccessRate * 100) / 100,
                averageProcessingTime: avgAiProcessingTime
            },
            cache: {
                hits: this.counters.cacheHits,
                misses: this.counters.cacheMisses,
                hitRate: Math.round(cacheHitRate * 100) / 100,
                averageOperationTime: avgCacheOperationTime
            },
            database: {
                queries: this.counters.databaseQueries,
                errors: this.counters.databaseErrors,
                errorRate: this.counters.databaseQueries > 0 
                    ? (this.counters.databaseErrors / this.counters.databaseQueries) * 100 
                    : 0,
                averageOperationTime: avgDatabaseOperationTime
            }
        };
        
        this.metrics.subtitle.push(applicationMetrics);
    }
    
    measureEventLoopLag() {
        return new Promise((resolve) => {
            const start = process.hrtime.bigint();
            setImmediate(() => {
                const lag = Number(process.hrtime.bigint() - start) / 1000000; // Convert to milliseconds
                resolve(Math.round(lag * 100) / 100);
            });
        });
    }
    
    calculateAverageTime(timings) {
        if (timings.length === 0) return 0;
        
        const sum = timings.reduce((acc, time) => acc + time, 0);
        return Math.round((sum / timings.length) * 100) / 100;
    }
    
    // Metric recording methods
    recordSubtitleRequest(success, processingTime, metadata = {}) {
        this.counters.subtitleRequests++;
        
        if (success) {
            this.counters.subtitleSuccess++;
        } else {
            this.counters.subtitleErrors++;
        }
        
        if (processingTime) {
            this.timings.subtitleProcessing.push(processingTime);
            this.trimTimings(this.timings.subtitleProcessing);
        }
        
        this.emit('subtitleRequest', { success, processingTime, metadata });
    }
    
    recordAiProcessing(success, processingTime, metadata = {}) {
        this.counters.aiProcessingJobs++;
        
        if (success) {
            this.counters.aiProcessingSuccess++;
        } else {
            this.counters.aiProcessingErrors++;
        }
        
        if (processingTime) {
            this.timings.aiProcessing.push(processingTime);
            this.trimTimings(this.timings.aiProcessing);
        }
        
        this.emit('aiProcessing', { success, processingTime, metadata });
    }
    
    recordCacheOperation(hit, operationTime, metadata = {}) {
        if (hit) {
            this.counters.cacheHits++;
        } else {
            this.counters.cacheMisses++;
        }
        
        if (operationTime) {
            this.timings.cacheOperations.push(operationTime);
            this.trimTimings(this.timings.cacheOperations);
        }
        
        this.emit('cacheOperation', { hit, operationTime, metadata });
    }
    
    recordDatabaseOperation(success, operationTime, metadata = {}) {
        this.counters.databaseQueries++;
        
        if (!success) {
            this.counters.databaseErrors++;
        }
        
        if (operationTime) {
            this.timings.databaseOperations.push(operationTime);
            this.trimTimings(this.timings.databaseOperations);
        }
        
        this.emit('databaseOperation', { success, operationTime, metadata });
    }
    
    recordCustomMetric(name, value, unit = '', tags = {}) {
        if (!this.config.enableCustomMetrics) return;
        
        const metric = {
            timestamp: Date.now(),
            name,
            value,
            unit,
            tags
        };
        
        this.metrics.custom.push(metric);
        this.trimMetrics(this.metrics.custom);
        
        this.emit('customMetric', metric);
    }
    
    // Utility methods
    trimTimings(timings, maxSize = 1000) {
        if (timings.length > maxSize) {
            timings.splice(0, timings.length - maxSize);
        }
    }
    
    trimMetrics(metrics, maxSize = 1000) {
        if (metrics.length > maxSize) {
            metrics.splice(0, metrics.length - maxSize);
        }
    }
    
    // Alert system
    checkAlerts(timestamp) {
        const latest = this.getLatestMetrics();
        
        // CPU usage alert
        if (latest.system?.cpu?.usage > this.config.alertThresholds.cpuUsage) {
            this.triggerAlert('high_cpu_usage', {
                current: latest.system.cpu.usage,
                threshold: this.config.alertThresholds.cpuUsage
            }, timestamp);
        } else {
            this.clearAlert('high_cpu_usage', timestamp);
        }
        
        // Memory usage alert
        if (latest.system?.memory?.system?.usagePercent > this.config.alertThresholds.memoryUsage) {
            this.triggerAlert('high_memory_usage', {
                current: latest.system.memory.system.usagePercent,
                threshold: this.config.alertThresholds.memoryUsage
            }, timestamp);
        } else {
            this.clearAlert('high_memory_usage', timestamp);
        }
        
        // Response time alert
        if (latest.application?.subtitle?.averageProcessingTime > this.config.alertThresholds.responseTime) {
            this.triggerAlert('high_response_time', {
                current: latest.application.subtitle.averageProcessingTime,
                threshold: this.config.alertThresholds.responseTime
            }, timestamp);
        } else {
            this.clearAlert('high_response_time', timestamp);
        }
        
        // Error rate alert
        if (latest.application?.subtitle?.successRate < (100 - this.config.alertThresholds.errorRate)) {
            this.triggerAlert('high_error_rate', {
                current: 100 - latest.application.subtitle.successRate,
                threshold: this.config.alertThresholds.errorRate
            }, timestamp);
        } else {
            this.clearAlert('high_error_rate', timestamp);
        }
    }
    
    triggerAlert(alertType, data, timestamp) {
        if (this.alerts.active.has(alertType)) {
            return; // Alert already active
        }
        
        const alert = {
            type: alertType,
            data,
            triggeredAt: timestamp,
            status: 'active'
        };
        
        this.alerts.active.set(alertType, alert);
        this.alerts.history.push({ ...alert });
        
        console.warn(`[PerformanceMonitor] ALERT: ${alertType}`, data);
        this.emit('alert', alert);
    }
    
    clearAlert(alertType, timestamp) {
        const activeAlert = this.alerts.active.get(alertType);
        if (!activeAlert) {
            return; // No active alert
        }
        
        activeAlert.status = 'resolved';
        activeAlert.resolvedAt = timestamp;
        
        this.alerts.active.delete(alertType);
        this.alerts.history.push({ ...activeAlert });
        
        console.log(`[PerformanceMonitor] Alert resolved: ${alertType}`);
        this.emit('alertResolved', activeAlert);
    }
    
    // Data retrieval methods
    getLatestMetrics() {
        return {
            system: this.getLatestSystemMetrics(),
            application: this.getLatestApplicationMetrics()
        };
    }
    
    getLatestSystemMetrics() {
        return this.metrics.system.length > 0 
            ? this.metrics.system[this.metrics.system.length - 1] 
            : null;
    }
    
    getLatestApplicationMetrics() {
        return this.metrics.subtitle.length > 0 
            ? this.metrics.subtitle[this.metrics.subtitle.length - 1] 
            : null;
    }
    
    getMetricsHistory(type, limit = 100) {
        const metrics = this.metrics[type] || [];
        return metrics.slice(-limit);
    }
    
    getStats() {
        const latest = this.getLatestMetrics();
        
        return {
            monitoring: {
                isRunning: this.isRunning,
                collectInterval: this.config.collectInterval,
                uptime: Date.now() - this.systemStats.startTime
            },
            counters: { ...this.counters },
            latest,
            alerts: {
                active: Array.from(this.alerts.active.values()),
                history: this.alerts.history.slice(-10) // Last 10 alerts
            },
            metrics: {
                system: this.metrics.system.length,
                subtitle: this.metrics.subtitle.length,
                ai: this.metrics.ai.length,
                cache: this.metrics.cache.length,
                database: this.metrics.database.length,
                custom: this.metrics.custom.length
            }
        };
    }
    
    // Cleanup
    cleanupOldMetrics() {
        const cutoffTime = Date.now() - this.config.retentionPeriod;
        
        Object.keys(this.metrics).forEach(type => {
            const originalLength = this.metrics[type].length;
            this.metrics[type] = this.metrics[type].filter(metric => 
                metric.timestamp > cutoffTime
            );
            
            const removed = originalLength - this.metrics[type].length;
            if (removed > 0) {
                console.log(`[PerformanceMonitor] Cleaned up ${removed} old ${type} metrics`);
            }
        });
        
        // Cleanup alert history
        this.alerts.history = this.alerts.history.filter(alert => 
            alert.triggeredAt > cutoffTime
        );
    }
    
    // Health check
    healthCheck() {
        const latest = this.getLatestMetrics();
        const activeAlerts = Array.from(this.alerts.active.values());
        
        return {
            healthy: this.isRunning && activeAlerts.length === 0,
            monitoring: this.isRunning,
            activeAlerts: activeAlerts.length,
            system: latest.system ? {
                cpuUsage: latest.system.cpu.usage,
                memoryUsage: latest.system.memory.system.usagePercent,
                eventLoopLag: latest.system.eventLoop.lag
            } : null,
            application: latest.application ? {
                subtitleSuccessRate: latest.application.subtitle.successRate,
                aiSuccessRate: latest.application.ai.successRate,
                cacheHitRate: latest.application.cache.hitRate
            } : null
        };
    }
    
    // Export data
    exportMetrics(type = 'all', format = 'json') {
        const data = type === 'all' ? this.metrics : { [type]: this.metrics[type] };
        
        switch (format) {
            case 'csv':
                return this.convertToCSV(data);
            case 'json':
            default:
                return JSON.stringify(data, null, 2);
        }
    }
    
    convertToCSV(data) {
        // Simple CSV conversion - can be enhanced based on needs
        const lines = [];
        
        Object.keys(data).forEach(type => {
            data[type].forEach(metric => {
                lines.push(`${type},${metric.timestamp},${JSON.stringify(metric)}`);
            });
        });
        
        return lines.join('\n');
    }
}

module.exports = PerformanceMonitor;