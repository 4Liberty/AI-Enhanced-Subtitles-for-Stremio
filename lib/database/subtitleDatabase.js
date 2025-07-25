// lib/database/subtitleDatabase.js
// SQLite Database for Subtitle Persistence and Analytics using sql.js
const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const EventEmitter = require('events');
const crypto = require('crypto');

class SubtitleDatabase extends EventEmitter {
    constructor(options = {}) {
        super();

        this.config = {
            dbPath: options.dbPath || path.join(process.cwd(), 'data', 'subtitles.db'),
            // WAL is not supported in sql.js
            enableForeignKeys: options.enableForeignKeys !== false,
            cacheSize: options.cacheSize || 2000,
            busyTimeout: options.busyTimeout || 5000, // This is also not directly applicable
            enableBackup: options.enableBackup !== false,
            backupInterval: options.backupInterval || 24 * 60 * 60 * 1000 // 24 hours
        };

        this.db = null;
        this.isInitialized = false;
        this.stats = {
            queries: 0,
            inserts: 0,
            updates: 0,
            deletes: 0,
            errors: 0,
            averageQueryTime: 0
        };

        this.initialize();
    }

    async initialize() {
        try {
            // Ensure data directory exists
            const dataDir = path.dirname(this.config.dbPath);
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }

            const SQL = await initSqlJs({
                // locateFile: file => `https://sql.js.org/dist/${file}`
            });

            let dbBuffer = null;
            if (fs.existsSync(this.config.dbPath)) {
                dbBuffer = fs.readFileSync(this.config.dbPath);
            }

            // Open database connection
            this.db = new SQL.Database(dbBuffer);

            // Configure database
            this.configureDatabase();

            // Create tables
            this.createTables();

            // Create indexes
            this.createIndexes();

            // Start maintenance tasks
            this.startMaintenanceTasks();

            this.isInitialized = true;
            console.log(`[SubtitleDatabase] Initialized database at: ${this.config.dbPath}`);
            this.emit('initialized');

        } catch (error) {
            console.error('[SubtitleDatabase] Initialization failed:', error);
            this.emit('error', error);
            throw error;
        }
    }

    saveDatabase() {
        try {
            const data = this.db.export();
            const buffer = Buffer.from(data);
            fs.writeFileSync(this.config.dbPath, buffer);
            // console.log('[SubtitleDatabase] Database saved to disk.');
        } catch (error) {
            console.error('[SubtitleDatabase] Failed to save database:', error);
        }
    }

    configureDatabase() {
        // journal_mode = WAL is not applicable for sql.js
        // this.db.pragma('journal_mode = WAL');

        // Enable foreign keys
        if (this.config.enableForeignKeys) {
            this.db.exec('PRAGMA foreign_keys = ON;');
        }

        // Set cache size
        this.db.exec(`PRAGMA cache_size = ${this.config.cacheSize};`);

        // Set busy timeout - not directly applicable but we can keep the pragma
        this.db.exec(`PRAGMA busy_timeout = ${this.config.busyTimeout};`);

        // Optimize for performance
        this.db.exec('PRAGMA synchronous = NORMAL;');
        this.db.exec('PRAGMA temp_store = MEMORY;');
        // mmap_size is not applicable
        // this.db.pragma('mmap_size = 268435456'); // 256MB

        console.log('[SubtitleDatabase] Database configured for optimal performance');
    }

    createTables() {
        // Using db.exec to run multiple statements
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS subtitle_cache (
                id TEXT PRIMARY KEY,
                video_id TEXT NOT NULL,
                provider TEXT NOT NULL,
                language TEXT NOT NULL,
                content TEXT NOT NULL,
                content_hash TEXT NOT NULL,
                file_size INTEGER NOT NULL,
                quality_score INTEGER DEFAULT 0,
                ai_enhanced BOOLEAN DEFAULT FALSE,
                metadata TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                expires_at DATETIME,
                access_count INTEGER DEFAULT 0,
                last_accessed DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS user_preferences (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                data_type TEXT DEFAULT 'string',
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS analytics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type TEXT NOT NULL,
                video_id TEXT,
                provider TEXT,
                language TEXT,
                processing_time INTEGER,
                success BOOLEAN,
                error_message TEXT,
                metadata TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS provider_stats (
                provider TEXT PRIMARY KEY,
                total_requests INTEGER DEFAULT 0,
                successful_requests INTEGER DEFAULT 0,
                failed_requests INTEGER DEFAULT 0,
                average_response_time INTEGER DEFAULT 0,
                last_success DATETIME,
                last_failure DATETIME,
                quality_rating REAL DEFAULT 0.0,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS ai_processing_queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                video_id TEXT NOT NULL,
                provider TEXT NOT NULL,
                original_content TEXT NOT NULL,
                priority INTEGER DEFAULT 0,
                status TEXT DEFAULT 'pending',
                attempts INTEGER DEFAULT 0,
                max_attempts INTEGER DEFAULT 3,
                error_message TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                started_at DATETIME,
                completed_at DATETIME
            );
            CREATE TABLE IF NOT EXISTS performance_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                metric_name TEXT NOT NULL,
                metric_value REAL NOT NULL,
                metric_unit TEXT,
                tags TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);
        this.saveDatabase();
        console.log('[SubtitleDatabase] Database tables created successfully');
    }

    createIndexes() {
        this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_subtitle_cache_video_id ON subtitle_cache(video_id);
            CREATE INDEX IF NOT EXISTS idx_subtitle_cache_provider ON subtitle_cache(provider);
            CREATE INDEX IF NOT EXISTS idx_subtitle_cache_language ON subtitle_cache(language);
            CREATE INDEX IF NOT EXISTS idx_subtitle_cache_expires_at ON subtitle_cache(expires_at);
            CREATE INDEX IF NOT EXISTS idx_subtitle_cache_quality_score ON subtitle_cache(quality_score DESC);
            CREATE INDEX IF NOT EXISTS idx_subtitle_cache_ai_enhanced ON subtitle_cache(ai_enhanced);
            CREATE INDEX IF NOT EXISTS idx_analytics_event_type ON analytics(event_type);
            CREATE INDEX IF NOT EXISTS idx_analytics_video_id ON analytics(video_id);
            CREATE INDEX IF NOT EXISTS idx_analytics_created_at ON analytics(created_at);
            CREATE INDEX IF NOT EXISTS idx_analytics_provider ON analytics(provider);
            CREATE INDEX IF NOT EXISTS idx_ai_queue_status ON ai_processing_queue(status);
            CREATE INDEX IF NOT EXISTS idx_ai_queue_priority ON ai_processing_queue(priority DESC);
            CREATE INDEX IF NOT EXISTS idx_ai_queue_created_at ON ai_processing_queue(created_at);
            CREATE INDEX IF NOT EXISTS idx_performance_metrics_name ON performance_metrics(metric_name);
            CREATE INDEX IF NOT EXISTS idx_performance_metrics_created_at ON performance_metrics(created_at);
        `);
        this.saveDatabase();
        console.log('[SubtitleDatabase] Database indexes created successfully');
    }

    // Helper to convert sql.js result to an array of objects
    _resultsToObjects(stmt) {
        const results = [];
        while (stmt.step()) {
            results.push(stmt.getAsObject());
        }
        stmt.free();
        return results;
    }

    // Subtitle cache operations
    async cacheSubtitle(data) {
        const startTime = Date.now();
        try {
            const stmt = this.db.prepare(`
                INSERT OR REPLACE INTO subtitle_cache
                (id, video_id, provider, language, content, content_hash, file_size, quality_score, ai_enhanced, metadata, expires_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            const id = `${data.videoId}-${data.provider}-${data.language}`;
            const contentHash = this.generateHash(data.content);
            const expiresAt = data.ttl ? new Date(Date.now() + data.ttl * 1000).toISOString() : null;

            stmt.run([
                id,
                data.videoId,
                data.provider,
                data.language,
                data.content,
                contentHash,
                data.content.length,
                data.qualityScore || 0,
                data.aiEnhanced || false,
                JSON.stringify(data.metadata || {}),
                expiresAt
            ]);
            stmt.free();

            const changes = this.db.getRowsModified();
            this.saveDatabase();

            this.stats.inserts++;
            this.updateQueryStats(startTime);

            console.log(`[SubtitleDatabase] Cached subtitle: ${id}`);
            return changes > 0;

        } catch (error) {
            this.stats.errors++;
            console.error('[SubtitleDatabase] Error caching subtitle:', error);
            return false;
        }
    }

    async getCachedSubtitle(videoId, provider, language) {
        const startTime = Date.now();
        try {
            const stmt = this.db.prepare(`
                SELECT * FROM subtitle_cache
                WHERE video_id = ? AND provider = ? AND language = ?
                AND (expires_at IS NULL OR expires_at > datetime('now'))
                ORDER BY quality_score DESC, ai_enhanced DESC
                LIMIT 1
            `);

            stmt.bind([videoId, provider, language]);
            const result = stmt.step() ? stmt.getAsObject() : null;
            stmt.free();

            if (result) {
                this.updateSubtitleAccess(result.id);
                result.metadata = JSON.parse(result.metadata || '{}');
                this.updateQueryStats(startTime);
                return result;
            }

            this.updateQueryStats(startTime);
            return null;

        } catch (error) {
            this.stats.errors++;
            console.error('[SubtitleDatabase] Error getting cached subtitle:', error);
            return null;
        }
    }

    async findBestCachedSubtitle(videoId, language) {
        const startTime = Date.now();
        try {
            const stmt = this.db.prepare(`
                SELECT * FROM subtitle_cache
                WHERE video_id = ? AND language = ?
                AND (expires_at IS NULL OR expires_at > datetime('now'))
                ORDER BY ai_enhanced DESC, quality_score DESC, access_count DESC
                LIMIT 1
            `);

            stmt.bind([videoId, language]);
            const result = stmt.step() ? stmt.getAsObject() : null;
            stmt.free();

            if (result) {
                this.updateSubtitleAccess(result.id);
                result.metadata = JSON.parse(result.metadata || '{}');
            }

            this.updateQueryStats(startTime);
            return result;

        } catch (error) {
            this.stats.errors++;
            console.error('[SubtitleDatabase] Error finding best cached subtitle:', error);
            return null;
        }
    }

    updateSubtitleAccess(subtitleId) {
        try {
            this.db.run(`
                UPDATE subtitle_cache
                SET access_count = access_count + 1, last_accessed = datetime('now')
                WHERE id = ?
            `, [subtitleId]);
            this.saveDatabase();
        } catch (error) {
            console.error('[SubtitleDatabase] Error updating subtitle access:', error);
        }
    }

    // User preferences operations
    async setPreference(key, value, dataType = 'string', description = null) {
        try {
            const stmt = this.db.prepare(`
                INSERT OR REPLACE INTO user_preferences (key, value, data_type, description, updated_at)
                VALUES (?, ?, ?, ?, datetime('now'))
            `);

            const serializedValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
            stmt.run([key, serializedValue, dataType, description]);
            stmt.free();
            const changes = this.db.getRowsModified();
            this.saveDatabase();

            this.stats.inserts++;
            return changes > 0;

        } catch (error) {
            this.stats.errors++;
            console.error('[SubtitleDatabase] Error setting preference:', error);
            return false;
        }
    }

    async getPreference(key, defaultValue = null) {
        try {
            const stmt = this.db.prepare('SELECT * FROM user_preferences WHERE key = ?');
            stmt.bind([key]);
            const result = stmt.step() ? stmt.getAsObject() : null;
            stmt.free();

            if (!result) return defaultValue;

            switch (result.data_type) {
                case 'number':
                    return parseFloat(result.value);
                case 'boolean':
                    return result.value === 'true';
                case 'object':
                    return JSON.parse(result.value);
                default:
                    return result.value;
            }

        } catch (error) {
            this.stats.errors++;
            console.error('[SubtitleDatabase] Error getting preference:', error);
            return defaultValue;
        }
    }

    // Analytics operations
    async logEvent(eventType, data = {}) {
        try {
            const stmt = this.db.prepare(`
                INSERT INTO analytics (event_type, video_id, provider, language, processing_time, success, error_message, metadata)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);

            stmt.run([
                eventType,
                data.videoId || null,
                data.provider || null,
                data.language || null,
                data.processingTime || null,
                data.success !== undefined ? (data.success ? 1 : 0) : null,
                data.errorMessage || null,
                JSON.stringify(data.metadata || {})
            ]);
            stmt.free();
            const changes = this.db.getRowsModified();
            this.saveDatabase();

            this.stats.inserts++;
            return changes > 0;

        } catch (error) {
            this.stats.errors++;
            console.error('[SubtitleDatabase] Error logging event:', error);
            return false;
        }
    }

    async getAnalytics(options = {}) {
        try {
            const {
                eventType,
                startDate,
                endDate,
                provider,
                limit = 1000
            } = options;

            let query = 'SELECT * FROM analytics WHERE 1=1';
            const params = [];

            if (eventType) {
                query += ' AND event_type = ?';
                params.push(eventType);
            }
            if (startDate) {
                query += ' AND created_at >= ?';
                params.push(startDate);
            }
            if (endDate) {
                query += ' AND created_at <= ?';
                params.push(endDate);
            }
            if (provider) {
                query += ' AND provider = ?';
                params.push(provider);
            }

            query += ' ORDER BY created_at DESC LIMIT ?';
            params.push(limit);

            const stmt = this.db.prepare(query);
            stmt.bind(params);
            const results = this._resultsToObjects(stmt); // stmt is freed in helper

            results.forEach(result => {
                result.metadata = JSON.parse(result.metadata || '{}');
            });

            this.stats.queries++;
            return results;

        } catch (error) {
            this.stats.errors++;
            console.error('[SubtitleDatabase] Error getting analytics:', error);
            return [];
        }
    }

    // Provider statistics operations
    async updateProviderStats(provider, data) {
        // This is complex to do in a single statement without COALESCE and subqueries in a way that sql.js likes.
        // Let's do it with a read then write.
        try {
            const existingStmt = this.db.prepare('SELECT * FROM provider_stats WHERE provider = ?');
            existingStmt.bind([provider]);
            let stats = existingStmt.step() ? existingStmt.getAsObject() : null;
            existingStmt.free();

            if (!stats) {
                stats = {
                    total_requests: 0,
                    successful_requests: 0,
                    failed_requests: 0,
                    average_response_time: 0,
                    last_success: null,
                    last_failure: null,
                    quality_rating: 0.0
                };
            }

            const totalRequests = stats.total_requests + 1;
            const successfulRequests = stats.successful_requests + (data.success ? 1 : 0);
            const failedRequests = stats.failed_requests + (data.success ? 0 : 1);
            // A more robust average calculation
            const averageResponseTime = ((stats.average_response_time * stats.total_requests) + (data.responseTime || 0)) / totalRequests;

            const updateStmt = this.db.prepare(`
                INSERT OR REPLACE INTO provider_stats
                (provider, total_requests, successful_requests, failed_requests, average_response_time, last_success, last_failure, quality_rating, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            `);

            updateStmt.run([
                provider,
                totalRequests,
                successfulRequests,
                failedRequests,
                averageResponseTime,
                data.success ? new Date().toISOString() : stats.last_success,
                data.success ? stats.last_failure : new Date().toISOString(),
                data.qualityRating || stats.quality_rating
            ]);
            updateStmt.free();
            const changes = this.db.getRowsModified();
            this.saveDatabase();

            this.stats.updates++;
            return changes > 0;

        } catch (error) {
            this.stats.errors++;
            console.error('[SubtitleDatabase] Error updating provider stats:', error);
            return false;
        }
    }

    async getProviderStats(provider = null) {
        try {
            let query = 'SELECT * FROM provider_stats';
            const params = [];

            if (provider) {
                query += ' WHERE provider = ?';
                params.push(provider);
            }

            query += ' ORDER BY quality_rating DESC, successful_requests DESC';

            const stmt = this.db.prepare(query);
            stmt.bind(params);

            const results = provider ? (stmt.step() ? stmt.getAsObject() : null) : this._resultsToObjects(stmt);
            if(provider) stmt.free(); // free if not freed by helper

            this.stats.queries++;
            return results;

        } catch (error) {
            this.stats.errors++;
            console.error('[SubtitleDatabase] Error getting provider stats:', error);
            return provider ? null : [];
        }
    }

    // Utility methods
    generateHash(content) {
        return crypto.createHash('sha256').update(content).digest('hex');
    }

    updateQueryStats(startTime) {
        const queryTime = Date.now() - startTime;
        this.stats.queries++;
        // More stable average calculation
        this.stats.averageQueryTime = this.stats.averageQueryTime + (queryTime - this.stats.averageQueryTime) / this.stats.queries;
    }

    // Maintenance tasks
    startMaintenanceTasks() {
        setInterval(() => {
            this.cleanupExpiredEntries();
        }, 60 * 60 * 1000);

        if (this.config.enableBackup) {
            setInterval(() => {
                this.backupDatabase();
            }, this.config.backupInterval);
        }

        setInterval(() => {
            this.optimizeDatabase();
        }, 7 * 24 * 60 * 60 * 1000);
    }

    cleanupExpiredEntries() {
        try {
            this.db.run(`
                DELETE FROM subtitle_cache
                WHERE expires_at IS NOT NULL AND expires_at < datetime('now')
            `);
            const changes = this.db.getRowsModified();
            this.saveDatabase();

            if (changes > 0) {
                console.log(`[SubtitleDatabase] Cleaned up ${changes} expired cache entries`);
            }
            this.stats.deletes += changes;

        } catch (error) {
            console.error('[SubtitleDatabase] Error cleaning up expired entries:', error);
        }
    }

    backupDatabase() {
        try {
            const backupPath = this.config.dbPath + '.backup.' + Date.now();
            fs.copyFileSync(this.config.dbPath, backupPath);
            console.log(`[SubtitleDatabase] Database backed up to: ${backupPath}`);
        } catch (error) {
            console.error('[SubtitleDatabase] Error backing up database:', error);
        }
    }

    optimizeDatabase() {
        try {
            this.db.run('VACUUM;');
            this.saveDatabase();
            console.log('[SubtitleDatabase] Database optimized');
        } catch (error) {
            console.error('[SubtitleDatabase] Error optimizing database:', error);
        }
    }

    // Statistics and monitoring
    getStats() {
        try {
            const cacheStmt = this.db.prepare(`
                SELECT
                    COUNT(*) as total_entries,
                    SUM(CASE WHEN ai_enhanced = 1 THEN 1 ELSE 0 END) as ai_enhanced_entries,
                    AVG(quality_score) as average_quality,
                    SUM(file_size) as total_size,
                    AVG(access_count) as average_access_count
                FROM subtitle_cache
                WHERE expires_at IS NULL OR expires_at > datetime('now')
            `);
            const cacheStats = cacheStmt.step() ? cacheStmt.getAsObject() : {};
            cacheStmt.free();

            const providerStmt = this.db.prepare(`
                SELECT provider, COUNT(*) as count
                FROM subtitle_cache
                WHERE expires_at IS NULL OR expires_at > datetime('now')
                GROUP BY provider
                ORDER BY count DESC
            `);
            const providerStats = this._resultsToObjects(providerStmt);

            return {
                database: {
                    ...this.stats,
                    averageQueryTime: Math.round(this.stats.averageQueryTime * 100) / 100
                },
                cache: {
                    ...cacheStats,
                    average_quality: Math.round((cacheStats.average_quality || 0) * 100) / 100,
                    average_access_count: Math.round((cacheStats.average_access_count || 0) * 100) / 100
                },
                providers: providerStats
            };

        } catch (error) {
            console.error('[SubtitleDatabase] Error getting stats:', error);
            return { error: error.message };
        }
    }

    // Health check
    async healthCheck() {
        try {
            const testStmt = this.db.prepare('SELECT 1 as test');
            const testQuery = testStmt.step() ? testStmt.getAsObject() : null;
            testStmt.free();
            const isHealthy = testQuery && testQuery.test === 1;

            const stats = this.getStats();

            return {
                healthy: isHealthy && this.isInitialized,
                initialized: this.isInitialized,
                database: {
                    path: this.config.dbPath,
                    size: this.getDatabaseSize(),
                    queries: this.stats.queries,
                    errors: this.stats.errors,
                    errorRate: this.stats.queries > 0 ? (this.stats.errors / this.stats.queries) * 100 : 0
                },
                cache: stats.cache
            };

        } catch (error) {
            return {
                healthy: false,
                error: error.message
            };
        }
    }

    getDatabaseSize() {
        try {
            const stats = fs.statSync(this.config.dbPath);
            return stats.size;
        } catch (error) {
            return 0;
        }
    }

    // Shutdown
    async shutdown() {
        try {
            if (this.db) {
                this.saveDatabase();
                this.db.close();
                console.log('[SubtitleDatabase] Database connection closed');
            }
            this.emit('shutdown');
        } catch (error) {
            console.error('[SubtitleDatabase] Error during shutdown:', error);
        }
    }
}

module.exports = SubtitleDatabase;