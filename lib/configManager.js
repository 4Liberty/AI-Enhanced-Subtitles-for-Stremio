// lib/configManager.js
// Centralized configuration management with validation and defaults

const fs = require('fs');
const path = require('path');

class ConfigManager {
    constructor() {
        this.config = {};
        this.configPath = path.join(__dirname, '..', 'config.json');
        this.defaultConfig = {
            // API Configuration
            apis: {
                opensubtitles: {
                    apiKey: process.env.OPENSUBTITLES_API_KEY || '',
                    baseUrl: 'https://api.opensubtitles.com/api/v1',
                    timeout: 15000,
                    maxRetries: 3
                },
                subdl: {
                    apiKey: process.env.SUBDL_API_KEY || '',
                    baseUrl: 'https://api.subdl.com/api/v1',
                    timeout: 15000,
                    maxRetries: 3
                },
                podnapisi: {
                    baseUrl: 'https://www.podnapisi.net',
                    timeout: 15000,
                    maxRetries: 3
                },
                tmdb: {
                    apiKey: process.env.TMDB_API_KEY || '',
                    baseUrl: 'https://api.themoviedb.org/3',
                    timeout: 10000,
                    maxRetries: 2
                },
                realDebrid: {
                    token: process.env.REAL_DEBRID_TOKEN || '',
                    baseUrl: 'https://api.real-debrid.com/rest/1.0',
                    timeout: 15000,
                    maxRetries: 2
                },
                allDebrid: {
                    token: process.env.ALL_DEBRID_TOKEN || '',
                    baseUrl: 'https://api.alldebrid.com/v4',
                    timeout: 15000,
                    maxRetries: 2
                }
            },
            
            // AI Enhancement Configuration
            ai: {
                enabled: process.env.AI_ENHANCEMENT_ENABLED !== 'false',
                providers: {
                    openai: {
                        apiKey: process.env.OPENAI_API_KEY || '',
                        model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
                        maxTokens: 4000,
                        temperature: 0.3
                    },
                    anthropic: {
                        apiKey: process.env.ANTHROPIC_API_KEY || '',
                        model: process.env.ANTHROPIC_MODEL || 'claude-3-haiku-20240307',
                        maxTokens: 4000
                    },
                    gemini: {
                        apiKey: process.env.GEMINI_API_KEY || '',
                        model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
                        maxTokens: 4000
                    },
                    ollama: {
                        baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
                        model: process.env.OLLAMA_MODEL || 'llama3.1:8b',
                        enabled: process.env.OLLAMA_ENABLED === 'true'
                    }
                },
                timeout: 30000,
                maxRetries: 2,
                concurrency: 3,
                cacheEnabled: true,
                fallbackToOriginal: true
            },
            
            // Subtitle Processing Configuration
            subtitles: {
                maxConcurrentDownloads: 5,
                downloadTimeout: 20000,
                maxFileSize: 10 * 1024 * 1024, // 10MB
                supportedFormats: ['srt', 'ass', 'ssa', 'vtt', 'sub', 'idx'],
                defaultLanguage: 'tr',
                supportedLanguages: ['tr', 'en', 'es', 'fr', 'de', 'it', 'ru', 'pt', 'ar', 'zh'],
                hashMatchingEnabled: true,
                aiEnhancementEnabled: true,
                progressiveLoading: true,
                maxResultsPerProvider: 10,
                totalMaxResults: 20
            },
            
            // Caching Configuration
            cache: {
                enabled: true,
                type: 'memory', // 'memory' or 'redis'
                redis: {
                    host: process.env.REDIS_HOST || 'localhost',
                    port: process.env.REDIS_PORT || 6379,
                    password: process.env.REDIS_PASSWORD || '',
                    db: process.env.REDIS_DB || 0
                },
                ttl: {
                    subtitles: 3600, // 1 hour
                    tmdbConversion: 86400, // 24 hours
                    aiEnhancement: 7200, // 2 hours
                    instantAvailability: 300, // 5 minutes
                    streamLinks: 1800 // 30 minutes
                },
                maxSize: 1000, // Maximum cache entries
                cleanupInterval: 300000 // 5 minutes
            },
            
            // Server Configuration
            server: {
                port: process.env.PORT || 3000,
                host: process.env.HOST || '0.0.0.0',
                trustProxy: true,
                requestTimeout: 30000,
                maxRequestsPerMinute: 100,
                corsEnabled: true,
                compressionEnabled: true,
                loggingLevel: process.env.LOG_LEVEL || 'info'
            },
            
            // Stream Provider Configuration
            streams: {
                realDebrid: {
                    enabled: process.env.REAL_DEBRID_ENABLED !== 'false',
                    instantAvailabilityCheck: true,
                    maxConcurrentChecks: 10,
                    priorityScore: 100
                },
                allDebrid: {
                    enabled: process.env.ALL_DEBRID_ENABLED !== 'false',
                    instantAvailabilityCheck: true,
                    maxConcurrentChecks: 10,
                    priorityScore: 90
                },
                torrentio: {
                    enabled: process.env.TORRENTIO_ENABLED !== 'false',
                    baseUrl: 'https://torrentio.strem.fun',
                    priorityScore: 80
                }
            },
            
            // Security Configuration
            security: {
                rateLimiting: {
                    enabled: true,
                    windowMs: 60000, // 1 minute
                    maxRequests: 100,
                    skipSuccessfulRequests: false
                },
                corsOptions: {
                    origin: process.env.CORS_ORIGIN || '*',
                    methods: ['GET', 'POST'],
                    allowedHeaders: ['Content-Type', 'Authorization']
                },
                apiKeyValidation: {
                    enabled: false,
                    requiredKeys: []
                }
            },
            
            // Feature Flags
            features: {
                subtitleMatching: true,
                aiEnhancement: true,
                hashMatching: true,
                streamProvision: true,
                mediaFusionIntegration: true,
                progressiveLoading: true,
                backgroundProcessing: true,
                compressionSupport: true,
                multiLanguageSupport: true,
                qualityDetection: true
            }
        };
        
        this.loadConfig();
    }
    
    loadConfig() {
        try {
            // Load from file if exists
            if (fs.existsSync(this.configPath)) {
                const fileConfig = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
                this.config = this.mergeDeep(this.defaultConfig, fileConfig);
            } else {
                this.config = { ...this.defaultConfig };
            }
            
            // Override with environment variables
            this.applyEnvironmentOverrides();
            
            // Validate configuration
            this.validateConfig();
            
            console.log('[ConfigManager] Configuration loaded successfully');
            
        } catch (error) {
            console.error('[ConfigManager] Error loading configuration:', error);
            this.config = { ...this.defaultConfig };
        }
    }
    
    applyEnvironmentOverrides() {
        // Apply environment variable overrides
        const envMappings = {
            'PORT': 'server.port',
            'HOST': 'server.host',
            'LOG_LEVEL': 'server.loggingLevel',
            'AI_ENHANCEMENT_ENABLED': 'ai.enabled',
            'CACHE_ENABLED': 'cache.enabled',
            'REDIS_HOST': 'cache.redis.host',
            'REDIS_PORT': 'cache.redis.port',
            'CORS_ORIGIN': 'security.corsOptions.origin'
        };
        
        for (const [envVar, configPath] of Object.entries(envMappings)) {
            const envValue = process.env[envVar];
            if (envValue !== undefined) {
                this.setNestedValue(this.config, configPath, this.parseEnvValue(envValue));
            }
        }
    }
    
    parseEnvValue(value) {
        // Convert string values to appropriate types
        if (value === 'true') return true;
        if (value === 'false') return false;
        if (!isNaN(value) && !isNaN(parseFloat(value))) return parseFloat(value);
        return value;
    }
    
    setNestedValue(obj, path, value) {
        const keys = path.split('.');
        let current = obj;
        
        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            if (!(key in current)) {
                current[key] = {};
            }
            current = current[key];
        }
        
        current[keys[keys.length - 1]] = value;
    }
    
    validateConfig() {
        const requiredKeys = [
            'apis.opensubtitles.apiKey',
            'apis.subdl.apiKey'
        ];
        
        const missingKeys = [];
        
        for (const key of requiredKeys) {
            const value = this.get(key);
            if (!value || value === '') {
                missingKeys.push(key);
            }
        }
        
        if (missingKeys.length > 0) {
            console.warn('[ConfigManager] Missing required configuration:', missingKeys);
        }
        
        // Validate numeric values
        const numericValidations = [
            { key: 'server.port', min: 1, max: 65535 },
            { key: 'ai.timeout', min: 1000, max: 120000 },
            { key: 'cache.ttl.subtitles', min: 60, max: 86400 }
        ];
        
        for (const validation of numericValidations) {
            const value = this.get(validation.key);
            if (typeof value === 'number' && (value < validation.min || value > validation.max)) {
                console.warn(`[ConfigManager] Invalid value for ${validation.key}: ${value} (expected ${validation.min}-${validation.max})`);
            }
        }
    }
    
    get(key, defaultValue = null) {
        return this.getNestedValue(this.config, key, defaultValue);
    }
    
    getNestedValue(obj, path, defaultValue = null) {
        const keys = path.split('.');
        let current = obj;
        
        for (const key of keys) {
            if (current === null || current === undefined || !(key in current)) {
                return defaultValue;
            }
            current = current[key];
        }
        
        return current;
    }
    
    set(key, value) {
        this.setNestedValue(this.config, key, value);
    }
    
    save() {
        try {
            fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
            console.log('[ConfigManager] Configuration saved successfully');
        } catch (error) {
            console.error('[ConfigManager] Error saving configuration:', error);
        }
    }
    
    mergeDeep(target, source) {
        const result = { ...target };
        
        for (const key in source) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                result[key] = this.mergeDeep(result[key] || {}, source[key]);
            } else {
                result[key] = source[key];
            }
        }
        
        return result;
    }
    
    getAll() {
        return { ...this.config };
    }
    
    isFeatureEnabled(feature) {
        return this.get(`features.${feature}`, false);
    }
    
    getApiConfig(provider) {
        return this.get(`apis.${provider}`, {});
    }
    
    getCacheConfig() {
        return this.get('cache', {});
    }
    
    getAiConfig() {
        return this.get('ai', {});
    }
    
    getServerConfig() {
        return this.get('server', {});
    }
    
    getStreamConfig() {
        return this.get('streams', {});
    }
    
    getSecurityConfig() {
        return this.get('security', {});
    }
    
    getSubtitleConfig() {
        return this.get('subtitles', {});
    }
    
    // Environment checking methods
    isProduction() {
        return process.env.NODE_ENV === 'production';
    }
    
    isDevelopment() {
        return process.env.NODE_ENV === 'development';
    }
    
    isTest() {
        return process.env.NODE_ENV === 'test';
    }
}

// Export singleton instance
const configManager = new ConfigManager();

module.exports = {
    ConfigManager,
    config: configManager,
    
    // Convenience methods
    get: (key, defaultValue) => configManager.get(key, defaultValue),
    set: (key, value) => configManager.set(key, value),
    isFeatureEnabled: (feature) => configManager.isFeatureEnabled(feature),
    getApiConfig: (provider) => configManager.getApiConfig(provider),
    getCacheConfig: () => configManager.getCacheConfig(),
    getAiConfig: () => configManager.getAiConfig(),
    getServerConfig: () => configManager.getServerConfig(),
    getStreamConfig: () => configManager.getStreamConfig(),
    getSecurityConfig: () => configManager.getSecurityConfig(),
    getSubtitleConfig: () => configManager.getSubtitleConfig(),
    
    // Environment methods
    isProduction: () => configManager.isProduction(),
    isDevelopment: () => configManager.isDevelopment(),
    isTest: () => configManager.isTest()
};
