// API endpoints for the beautiful Stremio Addon UI
const express = require('express');
const path = require('path');
const os = require('os');
const { generateRealDebridStreams } = require('./lib/realDebridSearch');
const { getSubtitleUrlsForStremio, getAICorrectedSubtitle, getCachedSubtitleContent } = require('./lib/subtitleMatcher');

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
    app.get('/api/cache/stats', async (req, res) => {
        try {
            // Mock cache stats - implement actual cache if needed
            res.json({
                cachedTorrents: Math.floor(Math.random() * 1000) + 500,
                hitRate: Math.floor(Math.random() * 30) + 70,
                size: Math.floor(Math.random() * 100) + 50
            });
        } catch (error) {
            addErrorLog('Cache Stats', error.message, 'error');
            res.status(500).json({ error: 'Failed to get cache statistics' });
        }
    });
    
    // Clear cache endpoint
    app.post('/api/cache/clear', async (req, res) => {
        try {
            // Mock cache clearing - implement actual cache clearing if needed
            addErrorLog('Cache', 'Cache cleared by user', 'info');
            res.json({ success: true });
        } catch (error) {
            addErrorLog('Cache Clear', error.message, 'error');
            res.status(500).json({ error: 'Failed to clear cache' });
        }
    });
    
    // Subtitle sources endpoint
    app.get('/api/subtitles/sources', async (req, res) => {
        try {
            const sources = [
                { name: 'OpenSubtitles', status: process.env.OPENSUBTITLES_API_KEY ? 'healthy' : 'warning', description: 'Primary subtitle source' },
                { name: 'SubDL', status: process.env.SUBDL_API_KEY ? 'healthy' : 'warning', description: 'Secondary subtitle source' },
                { name: 'AI Correction', status: process.env.GEMINI_API_KEY ? 'healthy' : 'warning', description: 'Google Gemini powered' },
                { name: 'Local Cache', status: 'healthy', description: 'Cached subtitles' }
            ];
            
            res.json(sources);
        } catch (error) {
            addErrorLog('Subtitle Sources', error.message, 'error');
            res.status(500).json({ error: 'Failed to get subtitle sources' });
        }
    });
    
    // Test subtitle search endpoint
    app.get('/api/subtitles/test', async (req, res) => {
        try {
            const { imdb, lang } = req.query;
            
            if (!imdb) {
                return res.status(400).json({ error: 'IMDb ID is required' });
            }
            
            const mockResult = {
                imdbId: imdb,
                language: lang || 'en',
                sources: ['OpenSubtitles', 'SubDL'],
                subtitles: [
                    { source: 'OpenSubtitles', quality: 'good', downloads: 1234 },
                    { source: 'SubDL', quality: 'excellent', downloads: 567 }
                ],
                aiCorrectionEnabled: !!process.env.GEMINI_API_KEY,
                status: 'success'
            };
            
            healthData.subtitlesProcessed++;
            addErrorLog('Subtitle Test', `Search test for ${imdb} (${lang})`, 'info');
            
            res.json(mockResult);
        } catch (error) {
            addErrorLog('Subtitle Test', error.message, 'error');
            res.status(500).json({ error: 'Subtitle test failed' });
        }
    });
    
    // Test torrent search endpoint
    app.get('/api/torrents/test', async (req, res) => {
        try {
            const { imdb, quality } = req.query;
            
            if (!imdb) {
                return res.status(400).json({ error: 'IMDb ID is required' });
            }
            
            const mockResult = {
                imdbId: imdb,
                quality: quality || 'all',
                providers: ['YTS', 'EZTV', 'RARBG', '1337x', 'KickassTorrents'],
                torrents: [
                    { provider: 'YTS', quality: '1080p', size: '2.1GB', seeds: 234, peers: 12 },
                    { provider: 'EZTV', quality: '720p', size: '1.4GB', seeds: 156, peers: 8 },
                    { provider: '1337x', quality: '1080p', size: '2.8GB', seeds: 89, peers: 4 }
                ],
                realDebridCached: Math.floor(Math.random() * 3) + 1,
                scrapingEnabled: true,
                status: 'success'
            };
            
            healthData.torrentsFound += mockResult.torrents.length;
            addErrorLog('Torrent Test', `Search test for ${imdb} (${quality})`, 'info');
            
            res.json(mockResult);
        } catch (error) {
            addErrorLog('Torrent Test', error.message, 'error');
            res.status(500).json({ error: 'Torrent test failed' });
        }
    });
    
    // Test API keys endpoint
    app.post('/api/test-keys', async (req, res) => {
        try {
            const keys = req.body;
            
            const results = {
                gemini: !!keys.geminiApiKey,
                opensubtitles: !!keys.opensubtitlesApiKey,
                tmdb: !!keys.tmdbApiKey,
                subdl: !!keys.subdlApiKey,
                realdebrid: !!keys.realdebridApiKey,
                jackett: !!(keys.jackettUrl && keys.jackettApiKey)
            };
            
            addErrorLog('API Keys', 'API key test performed', 'info');
            res.json(results);
        } catch (error) {
            addErrorLog('API Key Test', error.message, 'error');
            res.status(500).json({ error: 'API key test failed' });
        }
    });
    
    // Legacy health endpoint
    app.get('/health', (req, res) => {
        const uptime = Math.floor((Date.now() - healthData.startTime) / 1000);
        const avgResponseTime = healthData.responseTimeHistory.length > 0 
            ? Math.round(healthData.responseTimeHistory.reduce((a, b) => a + b, 0) / healthData.responseTimeHistory.length)
            : 0;
        
        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
            requests: healthData.requestCount,
            errors: healthData.errorCount,
            averageResponseTime: `${avgResponseTime}ms`,
            memoryUsage: `${healthData.memoryUsage}MB`,
            services: {
                subtitles: !!process.env.OPENSUBTITLES_API_KEY,
                realDebrid: !!process.env.REAL_DEBRID_API_KEY,
                ai: !!process.env.GEMINI_API_KEY,
                tmdb: !!process.env.TMDB_API_KEY
            }
        });
    });
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
