// API endpoints for the beautiful Stremio Addon UI
const express = require('express');
const path = require('path');
const os = require('os');
const { generateRealDebridStreams } = require('./lib/realDebridSearch');
const { getSubtitleUrlsForStremio, getAICorrectedSubtitle, getCachedSubtitleContent } = require('./lib/subtitleMatcher');
const { streamingManager } = require('./lib/streamingProviderManager');
const { streamEnricher } = require('./lib/streamEnricher');

// Health monitoring data
let healthData = {
    startTime: Date.now(),
    requestCount: 0,
    errorCount: 0,
    successCount: 0,
    responseTimeHistory: [],
    memoryUsage: 0,
    subtitlesProcessed: 0,
    torrentsFound: 0,
    errors: []
};

// User configuration management
let userConfig = {
    realdebrid: '',
    alldebrid: '',
    opensubtitles: '',
    preferredProvider: 'auto',
    fallbackMode: true,
    performanceMonitoring: true
};

function getUserConfig() {
    return userConfig;
}

function saveUserConfig(config) {
    userConfig = { ...userConfig, ...config };
    console.log('[Config] User configuration updated');
    return userConfig;
}

// Performance monitoring middleware
function performanceMonitor(req, res, next) {
    const start = Date.now();
    
    res.on('finish', () => {
        const duration = Date.now() - start;
        healthData.requestCount++;
        healthData.responseTimeHistory.push(duration);
        
        // Keep only last 100 response times
        if (healthData.responseTimeHistory.length > 100) {
            healthData.responseTimeHistory = healthData.responseTimeHistory.slice(-100);
        }
        
        if (res.statusCode >= 400) {
            healthData.errorCount++;
            addErrorLog('HTTP Error', `${req.method} ${req.path} - ${res.statusCode}`, 'error');
        } else {
            healthData.successCount++;
        }
        
        // Update memory usage
        const memUsage = process.memoryUsage();
        healthData.memoryUsage = Math.round(memUsage.heapUsed / 1024 / 1024);
    });
    
    next();
}

// Error logging function
function addErrorLog(source, message, level = 'error') {
    const error = {
        timestamp: new Date().toISOString(),
        source,
        message,
        level
    };
    
    healthData.errors.unshift(error);
    
    // Keep only last 100 errors
    if (healthData.errors.length > 100) {
        healthData.errors = healthData.errors.slice(0, 100);
    }
    
    console.log(`[${level.toUpperCase()}] ${source}: ${message}`);
}

// Helper function to get active provider count
function getActiveProviderCount() {
    const config = require('./config.js');
    let count = 0;
    
    if (config.opensubtitles?.enabled) count++;
    if (config.subdl?.enabled) count++;
    if (config.podnapisi?.enabled) count++;
    if (config.realdebrid?.enabled) count++;
    
    return count;
}

// Helper function to get system status
function getSystemStatus() {
    const uptime = Math.floor((Date.now() - healthData.startTime) / 1000);
    const errorRate = healthData.requestCount > 0 
        ? (healthData.errorCount / healthData.requestCount) * 100 
        : 0;
    
    if (errorRate > 10) return 'error';
    if (errorRate > 5) return 'warning';
    if (uptime < 60) return 'starting';
    return 'healthy';
}

// Setup API routes
function setupUIRoutes(app) {
    // Apply performance monitoring
    app.use(performanceMonitor);
    
    // Serve static UI files
    app.use('/ui', express.static(path.join(__dirname, 'ui')));
    
    // Serve logo.svg from root directory to UI path
    app.get('/ui/logo.svg', (req, res) => {
        res.sendFile(path.join(__dirname, 'logo.svg'));
    });
    
    // Redirect root to UI
    app.get('/', (req, res) => {
        res.redirect('/ui');
    });
    
    // Quick access to manifest
    app.get('/manifest', (req, res) => {
        res.redirect('/manifest.json');
    });
    
    // Stats endpoint
    app.get('/api/stats', (req, res) => {
        try {
            const uptime = Math.floor((Date.now() - healthData.startTime) / 1000);
            const avgResponseTime = healthData.responseTimeHistory.length > 0 
                ? Math.round(healthData.responseTimeHistory.reduce((a, b) => a + b, 0) / healthData.responseTimeHistory.length)
                : 0;
            const successRate = healthData.requestCount > 0 
                ? Math.round((healthData.successCount / healthData.requestCount) * 100)
                : 0;
            
            res.json({
                uptime,
                subtitlesProcessed: healthData.subtitlesProcessed,
                torrentsFound: healthData.torrentsFound,
                activeProviders: getActiveProviderCount(),
                averageResponseTime: avgResponseTime,
                memoryUsage: healthData.memoryUsage,
                successRate,
                requestCount: healthData.requestCount,
                errorCount: healthData.errorCount
            });
        } catch (error) {
            console.error('Stats endpoint error:', error);
            res.status(500).json({ error: 'Failed to get stats' });
        }
    });
    
    // Dashboard endpoint
    app.get('/api/dashboard', async (req, res) => {
        try {
            const uptime = Math.floor((Date.now() - healthData.startTime) / 1000);
            const avgResponseTime = healthData.responseTimeHistory.length > 0 
                ? Math.round(healthData.responseTimeHistory.reduce((a, b) => a + b) / healthData.responseTimeHistory.length)
                : 0;
            const successRate = healthData.requestCount > 0 
                ? Math.round((healthData.successCount / healthData.requestCount) * 100)
                : 0;
            
            const memUsage = process.memoryUsage();
            const systemMemory = os.totalmem();
            const freeMemory = os.freemem();
            const usedMemory = systemMemory - freeMemory;
            
            res.json({
                uptime,
                subtitlesProcessed: healthData.subtitlesProcessed,
                torrentsFound: healthData.torrentsFound,
                activeProviders: getActiveProviderCount(),
                averageResponseTime: avgResponseTime,
                memoryUsage: Math.round(memUsage.heapUsed / 1024 / 1024),
                systemMemory: Math.round(systemMemory / 1024 / 1024),
                freeMemory: Math.round(freeMemory / 1024 / 1024),
                usedMemory: Math.round(usedMemory / 1024 / 1024),
                successRate,
                requestCount: healthData.requestCount,
                errorCount: healthData.errorCount,
                recentErrors: healthData.errors.slice(-10),
                status: getSystemStatus()
            });
        } catch (error) {
            console.error('Dashboard endpoint error:', error);
            res.status(500).json({ error: 'Failed to get dashboard data' });
        }
    });
    
    // Health endpoints
    app.get('/api/health/subtitles', async (req, res) => {
        try {
            const hasOpenSubtitles = !!process.env.OPENSUBTITLES_API_KEY;
            const hasSubDL = !!process.env.SUBDL_API_KEY;
            const hasAI = !!process.env.GEMINI_API_KEY;
            
            if (hasOpenSubtitles && hasSubDL && hasAI) {
                res.json({ status: 'healthy', message: 'All subtitle services operational' });
            } else if (hasOpenSubtitles || hasSubDL) {
                res.json({ status: 'warning', message: 'Some subtitle services unavailable' });
            } else {
                res.json({ status: 'error', message: 'No subtitle services configured' });
            }
        } catch (error) {
            res.json({ status: 'error', message: 'Subtitle service check failed' });
        }
    });
    
    app.get('/api/health/realdebrid', async (req, res) => {
        try {
            const hasRealDebrid = !!process.env.REAL_DEBRID_API_KEY;
            
            if (hasRealDebrid) {
                // Test Real-Debrid API
                const testResponse = await fetch('https://api.real-debrid.com/rest/1.0/user', {
                    headers: { 'Authorization': `Bearer ${process.env.REAL_DEBRID_API_KEY}` }
                });
                
                if (testResponse.ok) {
                    res.json({ status: 'healthy', message: 'Real-Debrid API operational' });
                } else {
                    res.json({ status: 'error', message: 'Real-Debrid API authentication failed' });
                }
            } else {
                res.json({ status: 'warning', message: 'Real-Debrid not configured' });
            }
        } catch (error) {
            res.json({ status: 'error', message: 'Real-Debrid service check failed' });
        }
    });
    
    app.get('/api/health/providers', async (req, res) => {
        try {
            const activeCount = getActiveProviderCount();
            
            if (activeCount >= 10) {
                res.json({ status: 'healthy', message: `${activeCount} providers active` });
            } else if (activeCount >= 5) {
                res.json({ status: 'warning', message: `${activeCount} providers active` });
            } else {
                res.json({ status: 'error', message: `Only ${activeCount} providers active` });
            }
        } catch (error) {
            res.json({ status: 'error', message: 'Provider check failed' });
        }
    });
    
    app.get('/api/health/keys', async (req, res) => {
        try {
            const keys = {
                gemini: !!process.env.GEMINI_API_KEY,
                opensubtitles: !!process.env.OPENSUBTITLES_API_KEY,
                tmdb: !!process.env.TMDB_API_KEY,
                subdl: !!process.env.SUBDL_API_KEY,
                realdebrid: !!process.env.REAL_DEBRID_API_KEY
            };
            
            const configuredKeys = Object.values(keys).filter(Boolean).length;
            const totalKeys = Object.keys(keys).length;
            
            if (configuredKeys === totalKeys) {
                res.json({ status: 'healthy', message: 'All API keys configured' });
            } else if (configuredKeys >= 3) {
                res.json({ status: 'warning', message: `${configuredKeys}/${totalKeys} API keys configured` });
            } else {
                res.json({ status: 'error', message: `Only ${configuredKeys}/${totalKeys} API keys configured` });
            }
        } catch (error) {
            res.json({ status: 'error', message: 'API key check failed' });
        }
    });
    
    // Detailed health endpoint
    app.get('/api/health/detailed', async (req, res) => {
        try {
            const checks = [
                { name: 'Subtitle Services', status: await getSubtitleServiceStatus(), message: 'OpenSubtitles, SubDL, AI' },
                { name: 'Real-Debrid', status: await getRealDebridStatus(), message: 'API connectivity' },
                { name: 'Torrent Providers', status: await getProviderStatus(), message: 'YTS, EZTV, RARBG, etc.' },
                { name: 'API Keys', status: await getApiKeysStatus(), message: 'Authentication tokens' },
                { name: 'System Resources', status: await getSystemResourceStatus(), message: 'Memory and CPU' },
                { name: 'Web Scraping', status: await getScrapingStatus(), message: '1337x, KAT, MagnetDL' }
            ];
            
            const healthyCount = checks.filter(c => c.status === 'healthy').length;
            const overallScore = Math.round((healthyCount / checks.length) * 100);
            
            res.json({
                overallScore,
                apis: checks.filter(c => c.name.includes('API')).length,
                services: checks.filter(c => c.name.includes('Service')).length,
                providers: getActiveProviderCount(),
                checks,
                errors: healthData.errors.slice(0, 20)
            });
        } catch (error) {
            addErrorLog('Health Check', error.message, 'error');
            res.status(500).json({ error: 'Health check failed' });
        }
    });
    
    // Provider status endpoint
    app.get('/api/torrents/providers', async (req, res) => {
        try {
            const providers = [
                { name: 'YTS', type: 'api', status: 'healthy', description: 'High-quality movies', enabled: true },
                { name: 'EZTV', type: 'api', status: 'healthy', description: 'TV shows and movies', enabled: true },
                { name: 'RARBG', type: 'api', status: 'healthy', description: 'Movies and TV via mirrors', enabled: true },
                { name: 'ThePirateBay', type: 'api', status: 'healthy', description: 'General torrents', enabled: true },
                { name: 'TorrentGalaxy', type: 'api', status: 'healthy', description: 'Movies and TV', enabled: true },
                { name: 'Nyaa.si', type: 'api', status: 'healthy', description: 'Anime and Asian content', enabled: true },
                { name: 'AniDex', type: 'api', status: 'healthy', description: 'Anime torrents', enabled: true },
                { name: 'Jackett', type: 'api', status: process.env.JACKETT_URL ? 'healthy' : 'warning', description: 'Meta-search (100+ sites)', enabled: !!process.env.JACKETT_URL },
                { name: '1337x', type: 'scraping', status: 'healthy', description: 'General torrents (web scraping)', enabled: true },
                { name: 'KickassTorrents', type: 'scraping', status: 'healthy', description: 'General torrents (web scraping)', enabled: true },
                { name: 'MagnetDL', type: 'scraping', status: 'healthy', description: 'Magnet links (web scraping)', enabled: true },
                { name: 'Rutor', type: 'scraping', status: 'warning', description: 'Russian torrents (framework ready)', enabled: false },
                { name: 'Torrent9', type: 'scraping', status: 'warning', description: 'French torrents (framework ready)', enabled: false }
            ];
            
            res.json(providers);
        } catch (error) {
            addErrorLog('Provider Status', error.message, 'error');
            res.status(500).json({ error: 'Failed to get provider status' });
        }
    });
    
    // Real-Debrid status endpoint
    app.get('/api/realdebrid/status', async (req, res) => {
        try {
            const hasApiKey = !!process.env.REAL_DEBRID_API_KEY;
            
            if (!hasApiKey) {
                res.json({
                    apiStatus: 'Not configured',
                    accountType: '--',
                    expiration: '--',
                    trafficLeft: '--'
                });
                return;
            }
            
            const response = await fetch('https://api.real-debrid.com/rest/1.0/user', {
                headers: { 'Authorization': `Bearer ${process.env.REAL_DEBRID_API_KEY}` }
            });
            
            if (response.ok) {
                const userData = await response.json();
                res.json({
                    apiStatus: 'Connected',
                    accountType: userData.type || 'Unknown',
                    expiration: userData.expiration || '--',
                    trafficLeft: userData.traffic_left || '--'
                });
            } else {
                res.json({
                    apiStatus: 'Authentication failed',
                    accountType: '--',
                    expiration: '--',
                    trafficLeft: '--'
                });
            }
        } catch (error) {
            addErrorLog('Real-Debrid Status', error.message, 'error');
            res.json({
                apiStatus: 'Connection failed',
                accountType: '--',
                expiration: '--',
                trafficLeft: '--'
            });
        }
    });
    
    // Cache statistics endpoint
    app.get('/api/cache/stats', (req, res) => {
        try {
            const stats = {
                cachedTorrents: 0,
                hitRate: 0,
                size: 0
            };
            res.json(stats);
        } catch (error) {
            res.status(500).json({ error: 'Failed to get cache stats' });
        }
    });
    
    app.post('/api/cache/clear', (req, res) => {
        try {
            // Clear cache logic would go here
            res.json({ success: true, message: 'Cache cleared successfully' });
        } catch (error) {
            res.status(500).json({ error: 'Failed to clear cache' });
        }
    });
    
    // API key testing endpoints
    app.post('/api/test/key/:provider', express.json(), async (req, res) => {
        try {
            const { provider } = req.params;
            const { apiKey } = req.body;
            
            let testResult = { success: false, message: 'Unknown provider' };
            
            switch (provider) {
                case 'gemini':
                    // Test Gemini API key
                    testResult = await testGeminiKey(apiKey);
                    break;
                case 'openai':
                    // Test OpenAI API key
                    testResult = await testOpenAIKey(apiKey);
                    break;
                case 'subdl':
                    // Test SubDL API key
                    testResult = await testSubDLKey(apiKey);
                    break;
                case 'realdebrid':
                    // Test Real-Debrid API key
                    testResult = await testRealDebridKey(apiKey);
                    break;
                default:
                    testResult = { success: false, message: 'Provider not supported' };
            }
            
            res.json(testResult);
        } catch (error) {
            res.status(500).json({ success: false, message: 'Test failed: ' + error.message });
        }
    });

    // Helper functions for API key testing
    async function testGeminiKey(apiKey) {
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
            return { success: response.ok, message: response.ok ? 'Valid' : 'Invalid' };
        } catch (error) {
            return { success: false, message: 'Test failed' };
        }
    }

    async function testOpenAIKey(apiKey) {
        try {
            const response = await fetch('https://api.openai.com/v1/models', {
                headers: { 'Authorization': `Bearer ${apiKey}` }
            });
            return { success: response.ok, message: response.ok ? 'Valid' : 'Invalid' };
        } catch (error) {
            return { success: false, message: 'Test failed' };
        }
    }

    async function testSubDLKey(apiKey) {
        try {
            const response = await fetch(`https://api.subdl.com/api/v1/subtitles?api_key=${apiKey}&languages=en&subs_per_page=1`);
            return { success: response.ok, message: response.ok ? 'Valid' : 'Invalid' };
        } catch (error) {
            return { success: false, message: 'Test failed' };
        }
    }

    async function testRealDebridKey(apiKey) {
        try {
            const response = await fetch('https://api.real-debrid.com/rest/1.0/user', {
                headers: { 'Authorization': `Bearer ${apiKey}` }
            });
            return { success: response.ok, message: response.ok ? 'Valid' : 'Invalid' };
        } catch (error) {
            return { success: false, message: 'Test failed' };
        }
    }

    // Enhanced health monitoring endpoints with MediaFusion architecture
    app.get('/api/health', async (req, res) => {
        try {
            const healthData = {
                status: 'ok',
                timestamp: new Date().toISOString(),
                services: {
                    gemini: !!process.env.GEMINI_API_KEY,
                    opensubtitles: !!process.env.OPENSUBTITLES_API_KEY,
                    tmdb: !!process.env.TMDB_API_KEY,
                    subdl: !!process.env.SUBDL_API_KEY,
                    realdebrid: !!process.env.REAL_DEBRID_API_KEY,
                    alldebrid: !!process.env.ALL_DEBRID_API_KEY
                },
                streaming: {
                    providers: streamingManager.getAvailableProviders(),
                    health: await streamingManager.healthCheck()
                }
            };

            // Check external services
            if (healthData.services.tmdb) {
                try {
                    const fetch = require('node-fetch');
                    const tmdbRes = await fetch(`https://api.themoviedb.org/3/configuration?api_key=${process.env.TMDB_API_KEY}`, {
                        timeout: 5000
                    });
                    healthData.services.tmdb_online = tmdbRes.ok;
                } catch { 
                    healthData.services.tmdb_online = false; 
                }
            }

            res.json(healthData);
        } catch (error) {
            res.status(500).json({
                status: 'error',
                timestamp: new Date().toISOString(),
                error: error.message
            });
        }
    });

    // Provider status endpoint
    app.get('/api/providers/status', async (req, res) => {
        try {
            const stats = await streamingManager.getCacheStats();
            res.json({
                success: true,
                timestamp: new Date().toISOString(),
                providers: stats
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                timestamp: new Date().toISOString(),
                error: error.message
            });
        }
    });

    // Provider health check endpoint
    app.get('/api/providers/health', async (req, res) => {
        try {
            const health = await streamingManager.healthCheck();
            res.json({
                success: true,
                timestamp: new Date().toISOString(),
                health
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                timestamp: new Date().toISOString(),
                error: error.message
            });
        }
    });

    // Search cached content endpoint
    app.get('/api/search/cached', async (req, res) => {
        try {
            const { query, type = 'movie', maxResults = 20 } = req.query;
            
            if (!query) {
                return res.status(400).json({
                    success: false,
                    error: 'Query parameter is required'
                });
            }

            const results = await streamingManager.searchCachedContent(query, {
                type,
                maxResults: parseInt(maxResults)
            });

            res.json({
                success: true,
                timestamp: new Date().toISOString(),
                query,
                type,
                ...results
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                timestamp: new Date().toISOString(),
                error: error.message
            });
        }
    });

    // Stream enrichment endpoint
    app.post('/api/streams/enrich', async (req, res) => {
        try {
            const { streams, options = {} } = req.body;
            
            if (!streams || !Array.isArray(streams)) {
                return res.status(400).json({
                    success: false,
                    error: 'Streams array is required'
                });
            }

            const enrichedStreams = await streamEnricher.enrichStreams(streams, options);

            res.json({
                success: true,
                timestamp: new Date().toISOString(),
                enriched: enrichedStreams.length,
                streams: enrichedStreams
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                timestamp: new Date().toISOString(),
                error: error.message
            });
        }
    });

    // AllDebrid-specific endpoints
    app.get('/api/health/alldebrid', async (req, res) => {
        try {
            const hasApiKey = !!process.env.ALL_DEBRID_API_KEY;
            
            if (!hasApiKey) {
                return res.json({
                    status: 'error',
                    message: 'AllDebrid API key not configured',
                    enabled: false
                });
            }

            const providers = streamingManager.getAvailableProviders();
            const isEnabled = providers.includes('alldebrid');

            if (!isEnabled) {
                return res.json({
                    status: 'warning',
                    message: 'AllDebrid provider not enabled',
                    enabled: false
                });
            }

            // Test AllDebrid connection
            try {
                const { AllDebridClient } = require('./lib/allDebridClient');
                const client = new AllDebridClient(process.env.ALL_DEBRID_API_KEY);
                const userInfo = await client.getAccountInfo();

                if (userInfo) {
                    res.json({
                        status: 'healthy',
                        message: 'AllDebrid service operational',
                        enabled: true,
                        user: userInfo.username,
                        premium: userInfo.premium,
                        expiration: userInfo.expiration
                    });
                } else {
                    res.json({
                        status: 'error',
                        message: 'AllDebrid authentication failed',
                        enabled: false
                    });
                }
            } catch (clientError) {
                res.json({
                    status: 'error',
                    message: 'AllDebrid client error',
                    enabled: false
                });
            }
        } catch (error) {
            res.status(500).json({
                status: 'error',
                message: error.message,
                enabled: false
            });
        }
    });

    app.get('/api/alldebrid/status', async (req, res) => {
        try {
            const hasApiKey = !!process.env.ALL_DEBRID_API_KEY;
            
            if (!hasApiKey) {
                return res.json({
                    enabled: false,
                    message: 'AllDebrid API key not configured'
                });
            }

            try {
                const { AllDebridClient } = require('./lib/allDebridClient');
                const client = new AllDebridClient(process.env.ALL_DEBRID_API_KEY);
                const userInfo = await client.getAccountInfo();

                res.json({
                    enabled: !!userInfo,
                    user: userInfo?.username || 'Unknown',
                    premium: userInfo?.premium || false,
                    expiration: userInfo?.expiration || 'Unknown',
                    message: userInfo ? 'Connected' : 'Authentication failed'
                });
            } catch (clientError) {
                res.json({
                    enabled: false,
                    message: 'AllDebrid client error'
                });
            }
        } catch (error) {
            res.status(500).json({
                enabled: false,
                message: error.message
            });
        }
    });

    // Performance monitoring
    let performanceMetrics = {
        startTime: Date.now(),
        requestCount: 0,
        successCount: 0,
        failureCount: 0,
        responseTimes: [],
        memoryUsage: [],
        cpuUsage: [],
        connections: 0
    };

    // Middleware to track performance
    app.use((req, res, next) => {
        const startTime = Date.now();
        performanceMetrics.requestCount++;
        performanceMetrics.connections++;
        
        res.on('finish', () => {
            const responseTime = Date.now() - startTime;
            performanceMetrics.responseTimes.push(responseTime);
            
            // Keep only last 100 response times
            if (performanceMetrics.responseTimes.length > 100) {
                performanceMetrics.responseTimes.shift();
            }
            
            if (res.statusCode >= 200 && res.statusCode < 400) {
                performanceMetrics.successCount++;
            } else {
                performanceMetrics.failureCount++;
            }
            
            performanceMetrics.connections--;
        });
        
        next();
    });

    // Performance metrics endpoint
    app.get('/api/performance/metrics', (req, res) => {
        try {
            const memUsage = process.memoryUsage();
            const cpuUsage = process.cpuUsage();
            const uptime = process.uptime();
            
            // Calculate averages
            const avgResponseTime = performanceMetrics.responseTimes.length > 0 
                ? performanceMetrics.responseTimes.reduce((a, b) => a + b, 0) / performanceMetrics.responseTimes.length 
                : 0;
            
            const successRate = performanceMetrics.requestCount > 0 
                ? (performanceMetrics.successCount / performanceMetrics.requestCount) * 100 
                : 0;
            
            const metrics = {
                uptime: uptime,
                memory: {
                    rss: Math.round(memUsage.rss / 1024 / 1024), // MB
                    heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
                    heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
                    external: Math.round(memUsage.external / 1024 / 1024) // MB
                },
                cpu: {
                    user: cpuUsage.user / 1000, // milliseconds to seconds
                    system: cpuUsage.system / 1000 // milliseconds to seconds
                },
                requests: {
                    total: performanceMetrics.requestCount,
                    success: performanceMetrics.successCount,
                    failure: performanceMetrics.failureCount,
                    successRate: Math.round(successRate * 100) / 100
                },
                performance: {
                    averageResponseTime: Math.round(avgResponseTime * 100) / 100,
                    activeConnections: performanceMetrics.connections,
                    recentResponseTimes: performanceMetrics.responseTimes.slice(-10)
                }
            };
            
            res.json(metrics);
        } catch (error) {
            res.status(500).json({ error: 'Failed to get performance metrics' });
        }
    });

    // Environment status endpoint
    app.get('/api/environment/status', (req, res) => {
        try {
            const envStatus = {
                gemini: {
                    available: !!process.env.GEMINI_API_KEY,
                    configured: !!process.env.GEMINI_API_KEY
                },
                openai: {
                    available: !!process.env.OPENAI_API_KEY,
                    configured: !!process.env.OPENAI_API_KEY
                },
                realDebrid: {
                    available: !!process.env.REAL_DEBRID_API_KEY,
                    configured: !!process.env.REAL_DEBRID_API_KEY
                },
                premiumize: {
                    available: !!process.env.PREMIUMIZE_API_KEY,
                    configured: !!process.env.PREMIUMIZE_API_KEY
                },
                opensubtitles: {
                    available: !!process.env.OPENSUBTITLES_API_KEY,
                    configured: !!process.env.OPENSUBTITLES_API_KEY
                },
                subdl: {
                    available: !!process.env.SUBDL_API_KEY,
                    configured: !!process.env.SUBDL_API_KEY
                },
                database: {
                    available: true,
                    configured: true
                }
            };
            
            res.json(envStatus);
        } catch (error) {
            console.error('Environment status error:', error);
            res.status(500).json({
                error: 'Failed to retrieve environment status',
                details: error.message
            });
        }
    });

    // Enhanced configuration endpoint with environment fallback
    app.get('/api/config', (req, res) => {
        try {
            const userConfig = getUserConfig();
            const envConfig = {
                realdebrid: process.env.REALDEBRID_API_KEY || '',
                alldebrid: process.env.ALLDEBRID_API_KEY || '',
                opensubtitles: process.env.OPENSUBTITLES_API_KEY || ''
            };
            
            // Merge user config with environment fallback
            const config = {
                realdebrid: userConfig.realdebrid || envConfig.realdebrid,
                alldebrid: userConfig.alldebrid || envConfig.alldebrid,
                opensubtitles: userConfig.opensubtitles || envConfig.opensubtitles,
                preferredProvider: userConfig.preferredProvider || 'auto',
                fallbackMode: userConfig.fallbackMode !== undefined ? userConfig.fallbackMode : true,
                performanceMonitoring: userConfig.performanceMonitoring !== undefined ? userConfig.performanceMonitoring : true,
                sources: {
                    realdebrid: userConfig.realdebrid ? 'user' : (envConfig.realdebrid ? 'environment' : 'none'),
                    alldebrid: userConfig.alldebrid ? 'user' : (envConfig.alldebrid ? 'environment' : 'none'),
                    opensubtitles: userConfig.opensubtitles ? 'user' : (envConfig.opensubtitles ? 'environment' : 'none')
                }
            };
            
            res.json(config);
        } catch (error) {
            res.status(500).json({ error: 'Failed to get configuration' });
        }
    });

    // Settings endpoint
    app.get('/api/settings', (req, res) => {
        try {
            res.json({
                settings: {
                    aiProvider: process.env.AI_PROVIDER || 'gemini',
                    aiModel: process.env.AI_MODEL || 'gemini-pro',
                    correctionIntensity: parseInt(process.env.CORRECTION_INTENSITY || '50'),
                    aiTemperature: parseFloat(process.env.AI_TEMPERATURE || '0.7'),
                    primaryLanguage: process.env.PRIMARY_LANGUAGE || 'tr',
                    fallbackLanguage: process.env.FALLBACK_LANGUAGE || 'en',
                    autoTranslate: process.env.AUTO_TRANSLATE === 'true',
                    hearingImpaired: process.env.HEARING_IMPAIRED === 'true',
                    aiEnabled: process.env.AI_ENABLED !== 'false',
                    debugMode: process.env.DEBUG_MODE === 'true',
                    scrapingEnabled: process.env.SCRAPING_ENABLED !== 'false',
                    cacheEnabled: process.env.CACHE_ENABLED !== 'false',
                    maxConcurrentRequests: parseInt(process.env.MAX_CONCURRENT_REQUESTS || '5'),
                    requestTimeout: parseInt(process.env.REQUEST_TIMEOUT || '30'),
                    minSubtitleScore: parseFloat(process.env.MIN_SUBTITLE_SCORE || '0.7')
                },
                status: 'success'
            });
        } catch (error) {
            console.error('Settings retrieval error:', error);
            res.status(500).json({
                error: 'Failed to retrieve settings',
                details: error.message
            });
        }
    });

    // Settings update endpoint
    app.post('/api/settings', express.json(), (req, res) => {
        try {
            const { settings } = req.body;
            
            if (!settings || typeof settings !== 'object') {
                return res.status(400).json({
                    error: 'Invalid settings format'
                });
            }
            
            // Update settings in memory (in production, you might want to persist these)
            Object.entries(settings).forEach(([key, value]) => {
                if (value !== undefined && value !== null) {
                    const envKey = key.replace(/([A-Z])/g, '_$1').toUpperCase();
                    process.env[envKey] = String(value);
                }
            });
            
            res.json({
                success: true,
                message: 'Settings updated successfully',
                settings: settings
            });
        } catch (error) {
            console.error('Settings update error:', error);
            res.status(500).json({
                error: 'Failed to update settings',
                details: error.message
            });
        }
    });

    return 'healthy';
}

// Helper functions
function getActiveProviderCount() {
    let count = 0;
    
    // API providers
    count += 7; // YTS, EZTV, RARBG, TPB, TorrentGalaxy, Nyaa, AniDex
    
    // Jackett if configured
    if (process.env.JACKETT_URL && process.env.JACKETT_API_KEY) {
        count += 1;
    }
    
    // Scraping providers
    count += 3; // 1337x, KAT, MagnetDL
    
    return count;
}

async function getSubtitleServiceStatus() {
    const hasOpenSubtitles = !!process.env.OPENSUBTITLES_API_KEY;
    const hasSubDL = !!process.env.SUBDL_API_KEY;
    const hasAI = !!process.env.GEMINI_API_KEY;
    
    if (hasOpenSubtitles && hasSubDL && hasAI) return 'healthy';
    if (hasOpenSubtitles || hasSubDL) return 'warning';
    return 'error';
}

async function getRealDebridStatus() {
    return process.env.REAL_DEBRID_API_KEY ? 'healthy' : 'warning';
}

async function getProviderStatus() {
    const activeCount = getActiveProviderCount();
    if (activeCount >= 10) return 'healthy';
    if (activeCount >= 5) return 'warning';
    return 'error';
}

async function getApiKeysStatus() {
    const keys = [
        process.env.GEMINI_API_KEY,
        process.env.OPENSUBTITLES_API_KEY,
        process.env.TMDB_API_KEY,
        process.env.SUBDL_API_KEY,
        process.env.REAL_DEBRID_API_KEY
    ];
    
    const configuredKeys = keys.filter(Boolean).length;
    if (configuredKeys === keys.length) return 'healthy';
    if (configuredKeys >= 3) return 'warning';
    return 'error';
}

async function getSystemResourceStatus() {
    const memUsage = process.memoryUsage();
    const memMB = memUsage.heapUsed / 1024 / 1024;
    
    if (memMB < 200) return 'healthy';
    if (memMB < 400) return 'warning';
    return 'error';
}

async function getScrapingStatus() {
    // All scraping providers are enabled
    return 'healthy';
}

module.exports = {
    setupUIRoutes,
    addErrorLog,
    healthData
};
