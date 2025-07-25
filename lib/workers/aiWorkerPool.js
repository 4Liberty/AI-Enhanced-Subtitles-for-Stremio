// lib/workers/aiWorkerPool.js
// Worker Thread Pool for AI Subtitle Processing

const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const path = require('path');
const EventEmitter = require('events');

class AIWorkerPool extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.maxWorkers = options.maxWorkers || Math.min(4, require('os').cpus().length);
        this.workers = [];
        this.queue = [];
        this.activeJobs = new Map();
        this.workerStats = new Map();
        this.isShuttingDown = false;
        
        console.log(`[AIWorkerPool] Initializing with ${this.maxWorkers} workers`);
        this.initializeWorkers();
    }
    
    initializeWorkers() {
        const workerScript = path.join(__dirname, 'aiWorker.js');
        
        for (let i = 0; i < this.maxWorkers; i++) {
            this.createWorker(i, workerScript);
        }
    }
    
    createWorker(id, scriptPath) {
        try {
            const worker = new Worker(scriptPath, {
                workerData: { workerId: id }
            });
            
            const workerInfo = {
                id,
                worker,
                busy: false,
                jobsCompleted: 0,
                totalProcessingTime: 0,
                errors: 0,
                lastUsed: Date.now()
            };
            
            // Handle worker messages
            worker.on('message', (message) => {
                this.handleWorkerMessage(workerInfo, message);
            });
            
            // Handle worker errors
            worker.on('error', (error) => {
                console.error(`[AIWorkerPool] Worker ${id} error:`, error);
                workerInfo.errors++;
                this.handleWorkerError(workerInfo, error);
            });
            
            // Handle worker exit
            worker.on('exit', (code) => {
                console.log(`[AIWorkerPool] Worker ${id} exited with code ${code}`);
                this.handleWorkerExit(workerInfo, code);
            });
            
            this.workers.push(workerInfo);
            this.workerStats.set(id, {
                created: Date.now(),
                jobsCompleted: 0,
                averageProcessingTime: 0,
                errors: 0
            });
            
            console.log(`[AIWorkerPool] Worker ${id} created successfully`);
            
        } catch (error) {
            console.error(`[AIWorkerPool] Failed to create worker ${id}:`, error);
        }
    }
    
    handleWorkerMessage(workerInfo, message) {
        const { type, jobId, result, error, processingTime } = message;
        
        switch (type) {
            case 'job_completed':
                this.handleJobCompleted(workerInfo, jobId, result, processingTime);
                break;
                
            case 'job_error':
                this.handleJobError(workerInfo, jobId, error);
                break;
                
            case 'worker_ready':
                console.log(`[AIWorkerPool] Worker ${workerInfo.id} is ready`);
                break;
                
            default:
                console.warn(`[AIWorkerPool] Unknown message type from worker ${workerInfo.id}:`, type);
        }
    }
    
    handleJobCompleted(workerInfo, jobId, result, processingTime) {
        const job = this.activeJobs.get(jobId);
        if (!job) {
            console.warn(`[AIWorkerPool] Received result for unknown job ${jobId}`);
            return;
        }
        
        // Update worker stats
        workerInfo.busy = false;
        workerInfo.jobsCompleted++;
        workerInfo.totalProcessingTime += processingTime;
        workerInfo.lastUsed = Date.now();
        
        // Update global stats
        const stats = this.workerStats.get(workerInfo.id);
        stats.jobsCompleted++;
        stats.averageProcessingTime = workerInfo.totalProcessingTime / workerInfo.jobsCompleted;
        
        // Resolve the job promise
        job.resolve(result);
        this.activeJobs.delete(jobId);
        
        console.log(`[AIWorkerPool] Job ${jobId} completed by worker ${workerInfo.id} in ${processingTime}ms`);
        
        // Process next job in queue
        this.processQueue();
        
        // Emit completion event
        this.emit('jobCompleted', { jobId, workerId: workerInfo.id, processingTime, result });
    }
    
    handleJobError(workerInfo, jobId, error) {
        const job = this.activeJobs.get(jobId);
        if (!job) {
            console.warn(`[AIWorkerPool] Received error for unknown job ${jobId}`);
            return;
        }
        
        // Update worker stats
        workerInfo.busy = false;
        workerInfo.errors++;
        workerInfo.lastUsed = Date.now();
        
        // Update global stats
        const stats = this.workerStats.get(workerInfo.id);
        stats.errors++;
        
        // Reject the job promise
        job.reject(new Error(error));
        this.activeJobs.delete(jobId);
        
        console.error(`[AIWorkerPool] Job ${jobId} failed on worker ${workerInfo.id}:`, error);
        
        // Process next job in queue
        this.processQueue();
        
        // Emit error event
        this.emit('jobError', { jobId, workerId: workerInfo.id, error });
    }
    
    handleWorkerError(workerInfo, error) {
        // Mark worker as not busy and try to recover
        workerInfo.busy = false;
        
        // If worker is completely broken, restart it
        if (error.code === 'ERR_WORKER_UNSERIALIZABLE_ERROR' || 
            error.code === 'ERR_WORKER_OUT_OF_MEMORY') {
            console.log(`[AIWorkerPool] Restarting worker ${workerInfo.id} due to critical error`);
            this.restartWorker(workerInfo);
        }
    }
    
    handleWorkerExit(workerInfo, code) {
        // Remove worker from active list
        const index = this.workers.indexOf(workerInfo);
        if (index > -1) {
            this.workers.splice(index, 1);
        }
        
        // If not shutting down, restart the worker
        if (!this.isShuttingDown && code !== 0) {
            console.log(`[AIWorkerPool] Restarting worker ${workerInfo.id} after unexpected exit`);
            setTimeout(() => {
                this.createWorker(workerInfo.id, path.join(__dirname, 'aiWorker.js'));
            }, 1000);
        }
    }
    
    restartWorker(workerInfo) {
        try {
            // Terminate the old worker
            workerInfo.worker.terminate();
            
            // Remove from workers array
            const index = this.workers.indexOf(workerInfo);
            if (index > -1) {
                this.workers.splice(index, 1);
            }
            
            // Create new worker
            setTimeout(() => {
                this.createWorker(workerInfo.id, path.join(__dirname, 'aiWorker.js'));
            }, 1000);
            
        } catch (error) {
            console.error(`[AIWorkerPool] Error restarting worker ${workerInfo.id}:`, error);
        }
    }
    
    async processSubtitle(content, options = {}) {
        return new Promise((resolve, reject) => {
            if (this.isShuttingDown) {
                reject(new Error('Worker pool is shutting down'));
                return;
            }
            
            const jobId = this.generateJobId();
            const job = {
                id: jobId,
                content,
                options,
                resolve,
                reject,
                createdAt: Date.now(),
                priority: options.priority || 0
            };
            
            // Add to queue
            this.queue.push(job);
            
            // Sort queue by priority (higher priority first)
            this.queue.sort((a, b) => b.priority - a.priority);
            
            console.log(`[AIWorkerPool] Job ${jobId} queued (queue size: ${this.queue.length})`);
            
            // Try to process immediately
            this.processQueue();
        });
    }
    
    processQueue() {
        if (this.queue.length === 0) {
            return;
        }
        
        // Find available worker
        const availableWorker = this.workers.find(w => !w.busy && w.worker.threadId);
        if (!availableWorker) {
            return; // No workers available
        }
        
        // Get next job from queue
        const job = this.queue.shift();
        if (!job) {
            return;
        }
        
        // Mark worker as busy
        availableWorker.busy = true;
        availableWorker.lastUsed = Date.now();
        
        // Store active job
        this.activeJobs.set(job.id, job);
        
        // Send job to worker
        try {
            availableWorker.worker.postMessage({
                type: 'process_subtitle',
                jobId: job.id,
                content: job.content,
                options: job.options
            });
            
            console.log(`[AIWorkerPool] Job ${job.id} assigned to worker ${availableWorker.id}`);
            
        } catch (error) {
            console.error(`[AIWorkerPool] Error sending job to worker:`, error);
            
            // Clean up
            availableWorker.busy = false;
            this.activeJobs.delete(job.id);
            job.reject(error);
        }
    }
    
    generateJobId() {
        return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    getStats() {
        const totalJobs = Array.from(this.workerStats.values())
            .reduce((sum, stats) => sum + stats.jobsCompleted, 0);
        
        const totalErrors = Array.from(this.workerStats.values())
            .reduce((sum, stats) => sum + stats.errors, 0);
        
        const avgProcessingTime = this.workers.length > 0 
            ? this.workers.reduce((sum, w) => sum + (w.totalProcessingTime / Math.max(w.jobsCompleted, 1)), 0) / this.workers.length
            : 0;
        
        return {
            totalWorkers: this.workers.length,
            activeWorkers: this.workers.filter(w => w.busy).length,
            queueSize: this.queue.length,
            activeJobs: this.activeJobs.size,
            totalJobsCompleted: totalJobs,
            totalErrors: totalErrors,
            averageProcessingTime: Math.round(avgProcessingTime),
            workerStats: Array.from(this.workerStats.entries()).map(([id, stats]) => ({
                workerId: id,
                ...stats,
                averageProcessingTime: Math.round(stats.averageProcessingTime)
            }))
        };
    }
    
    async shutdown() {
        console.log('[AIWorkerPool] Shutting down worker pool...');
        this.isShuttingDown = true;
        
        // Reject all queued jobs
        for (const job of this.queue) {
            job.reject(new Error('Worker pool shutting down'));
        }
        this.queue = [];
        
        // Reject all active jobs
        for (const job of this.activeJobs.values()) {
            job.reject(new Error('Worker pool shutting down'));
        }
        this.activeJobs.clear();
        
        // Terminate all workers
        const terminationPromises = this.workers.map(workerInfo => {
            return workerInfo.worker.terminate();
        });
        
        try {
            await Promise.all(terminationPromises);
            console.log('[AIWorkerPool] All workers terminated successfully');
        } catch (error) {
            console.error('[AIWorkerPool] Error terminating workers:', error);
        }
        
        this.workers = [];
        this.emit('shutdown');
    }
    
    // Health check method
    async healthCheck() {
        const stats = this.getStats();
        const healthyWorkers = this.workers.filter(w => 
            w.worker.threadId && 
            !w.worker.killed && 
            w.errors < 10
        ).length;
        
        return {
            healthy: healthyWorkers >= Math.ceil(this.maxWorkers * 0.5), // At least 50% workers healthy
            totalWorkers: stats.totalWorkers,
            healthyWorkers,
            queueSize: stats.queueSize,
            activeJobs: stats.activeJobs,
            errorRate: stats.totalJobsCompleted > 0 ? stats.totalErrors / stats.totalJobsCompleted : 0
        };
    }
}

module.exports = AIWorkerPool;