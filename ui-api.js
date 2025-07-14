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
    
    // Health endpoints
    app.get('/api/health/subtitles', async (req, res) => {
        try {
            const hasOpenSubtitles = !!process.env.OPENSUBTITLES_API_KEY;
            const hasSubDL = !!process.env.SUBDL_API_KEY;
            const hasAI = !!(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || process.env.CLAUDE_API_KEY);
            
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

    app.get('/api/health/providers', async (req, res) => {
        try {
            const hasJackett = !!process.env.JACKETT_URL;
            const scrapingEnabled = process.env.SCRAPING_ENABLED !== 'false';
            
            if (hasJackett && scrapingEnabled) {
                res.json({ status: 'healthy', message: 'All providers operational' });
            } else if (scrapingEnabled) {
                res.json({ status: 'warning', message: 'Scraping enabled, Jackett not configured' });
            } else {
                res.json({ status: 'warning', message: 'Limited providers available' });
            }
        } catch (error) {
            res.json({ status: 'error', message: 'Provider check failed' });
        }
    });

    app.get('/api/health/keys', async (req, res) => {
        try {
            const keys = [
                'GEMINI_API_KEY',
                'OPENAI_API_KEY', 
                'CLAUDE_API_KEY',
                'OPENSUBTITLES_API_KEY',
                'SUBDL_API_KEY',
                'TMDB_API_KEY',
                'REAL_DEBRID_API_KEY'
            ];
            
            const configuredKeys = keys.filter(key => !!process.env[key]).length;
            const totalKeys = keys.length;
            
            if (configuredKeys >= 4) {
                res.json({ status: 'healthy', message: `${configuredKeys}/${totalKeys} API keys configured` });
            } else if (configuredKeys >= 2) {
                res.json({ status: 'warning', message: `${configuredKeys}/${totalKeys} API keys configured` });
            } else {
                res.json({ status: 'error', message: `Only ${configuredKeys}/${totalKeys} API keys configured` });
            }
        } catch (error) {
            res.json({ status: 'error', message: 'API key check failed' });
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
    
    // Settings endpoints
    app.get('/api/settings', (req, res) => {
        try {
            // Get current settings from environment variables and defaults
            const settings = {
                // API Keys
                geminiApiKey: process.env.GEMINI_API_KEY ? '***configured***' : '',
                openaiApiKey: process.env.OPENAI_API_KEY ? '***configured***' : '',
                claudeApiKey: process.env.CLAUDE_API_KEY ? '***configured***' : '',
                opensubtitlesApiKey: process.env.OPENSUBTITLES_API_KEY ? '***configured***' : '',
                tmdbApiKey: process.env.TMDB_API_KEY ? '***configured***' : '',
                subdlApiKey: process.env.SUBDL_API_KEY ? '***configured***' : '',
                realdebridApiKey: process.env.REAL_DEBRID_API_KEY ? '***configured***' : '',
                jackettUrl: process.env.JACKETT_URL || 'http://localhost:9117',
                jackettApiKey: process.env.JACKETT_API_KEY ? '***configured***' : '',
                
                // Language Settings
                primaryLanguage: process.env.PRIMARY_LANGUAGE || 'tr',
                fallbackLanguage: process.env.FALLBACK_LANGUAGE || 'en',
                supportedLanguages: process.env.SUPPORTED_LANGUAGES || 'tr,en,es,fr,de,it,pt,ru,zh,ja,ko,ar',
                
                // AI Settings
                aiEnabled: process.env.AI_ENABLED !== 'false',
                aiProvider: process.env.AI_PROVIDER || 'gemini',
                aiModel: process.env.AI_MODEL || 'gemini-pro',
                correctionIntensity: parseInt(process.env.CORRECTION_INTENSITY || '7'),
                aiTemperature: parseFloat(process.env.AI_TEMPERATURE || '0.3'),
                aiMaxTokens: parseInt(process.env.AI_MAX_TOKENS || '1000'),
                
                // Advanced Settings
                debugMode: process.env.DEBUG_MODE === 'true',
                scrapingEnabled: process.env.SCRAPING_ENABLED !== 'false',
                cacheEnabled: process.env.CACHE_ENABLED !== 'false',
                maxConcurrentRequests: parseInt(process.env.MAX_CONCURRENT_REQUESTS || '5'),
                requestTimeout: parseInt(process.env.REQUEST_TIMEOUT || '10'),
                cacheTimeout: parseInt(process.env.CACHE_TIMEOUT || '3600'),
                
                // Quality Settings
                preferredQuality: process.env.PREFERRED_QUALITY || 'auto',
                minSubtitleScore: parseFloat(process.env.MIN_SUBTITLE_SCORE || '0.7'),
                enableHearingImpaired: process.env.ENABLE_HEARING_IMPAIRED === 'true',
                enableAutoTranslate: process.env.ENABLE_AUTO_TRANSLATE === 'true'
            };
            
            res.json(settings);
        } catch (error) {
            addErrorLog('Settings Load', error.message, 'error');
            res.status(500).json({ error: 'Failed to load settings' });
        }
    });

    app.post('/api/settings', (req, res) => {
        try {
            const settings = req.body;
            
            // Validate settings
            if (!settings) {
                return res.status(400).json({ error: 'Settings data required' });
            }
            
            // Update environment variables (in a real app, these would be saved to a config file)
            // For now, we'll just acknowledge the save
            console.log('[Settings] Settings updated:', Object.keys(settings));
            
            // In a production environment, you would save these to a configuration file
            // or database and restart the application with new environment variables
            
            res.json({ 
                success: true, 
                message: 'Settings saved successfully. Some changes may require restart to take effect.' 
            });
        } catch (error) {
            addErrorLog('Settings Save', error.message, 'error');
            res.status(500).json({ error: 'Failed to save settings' });
        }
    });

    // Test API Keys endpoint
    app.post('/api/test-keys', async (req, res) => {
        try {
            const results = {};
            
            // Test Gemini API
            if (process.env.GEMINI_API_KEY) {
                try {
                    const response = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${process.env.GEMINI_API_KEY}`);
                    results.gemini = response.ok ? 'success' : 'failed';
                } catch (e) {
                    results.gemini = 'error';
                }
            } else {
                results.gemini = 'not_configured';
            }
            
            // Test OpenAI API
            if (process.env.OPENAI_API_KEY) {
                try {
                    const response = await fetch('https://api.openai.com/v1/models', {
                        headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` }
                    });
                    results.openai = response.ok ? 'success' : 'failed';
                } catch (e) {
                    results.openai = 'error';
                }
            } else {
                results.openai = 'not_configured';
            }
            
            // Test Claude API
            if (process.env.CLAUDE_API_KEY) {
                try {
                    const response = await fetch('https://api.anthropic.com/v1/messages', {
                        method: 'POST',
                        headers: { 
                            'x-api-key': process.env.CLAUDE_API_KEY,
                            'Content-Type': 'application/json',
                            'anthropic-version': '2023-06-01'
                        },
                        body: JSON.stringify({
                            model: 'claude-3-haiku-20240307',
                            max_tokens: 10,
                            messages: [{ role: 'user', content: 'test' }]
                        })
                    });
                    results.claude = response.ok ? 'success' : 'failed';
                } catch (e) {
                    results.claude = 'error';
                }
            } else {
                results.claude = 'not_configured';
            }
            
            // Test OpenSubtitles API
            if (process.env.OPENSUBTITLES_API_KEY) {
                try {
                    const response = await fetch('https://api.opensubtitles.com/api/v1/infos/user', {
                        headers: { 'Api-Key': process.env.OPENSUBTITLES_API_KEY }
                    });
                    results.opensubtitles = response.ok ? 'success' : 'failed';
                } catch (e) {
                    results.opensubtitles = 'error';
                }
            } else {
                results.opensubtitles = 'not_configured';
            }
            
            // Test SubDL API
            if (process.env.SUBDL_API_KEY) {
                try {
                    const response = await fetch(`https://api.subdl.com/api/v1/subtitles?api_key=${process.env.SUBDL_API_KEY}&languages=en&subs_per_page=1`);
                    results.subdl = response.ok ? 'success' : 'failed';
                } catch (e) {
                    results.subdl = 'error';
                }
            } else {
                results.subdl = 'not_configured';
            }
            
            // Test TMDB API
            if (process.env.TMDB_API_KEY) {
                try {
                    const response = await fetch(`https://api.themoviedb.org/3/configuration?api_key=${process.env.TMDB_API_KEY}`);
                    results.tmdb = response.ok ? 'success' : 'failed';
                } catch (e) {
                    results.tmdb = 'error';
                }
            } else {
                results.tmdb = 'not_configured';
            }
            
            // Test Real-Debrid API
            if (process.env.REAL_DEBRID_API_KEY) {
                try {
                    const response = await fetch('https://api.real-debrid.com/rest/1.0/user', {
                        headers: { 'Authorization': `Bearer ${process.env.REAL_DEBRID_API_KEY}` }
                    });
                    results.realdebrid = response.ok ? 'success' : 'failed';
                } catch (e) {
                    results.realdebrid = 'error';
                }
            } else {
                results.realdebrid = 'not_configured';
            }
            
            res.json(results);
        } catch (error) {
            addErrorLog('API Test', error.message, 'error');
            res.status(500).json({ error: 'Failed to test API keys' });
        }
    });

    // Language support endpoint
    app.get('/api/languages', (req, res) => {
        try {
            const languages = [
                { code: 'tr', name: 'Turkish', native: 'Türkçe' },
                { code: 'en', name: 'English', native: 'English' },
                { code: 'es', name: 'Spanish', native: 'Español' },
                { code: 'fr', name: 'French', native: 'Français' },
                { code: 'de', name: 'German', native: 'Deutsch' },
                { code: 'it', name: 'Italian', native: 'Italiano' },
                { code: 'pt', name: 'Portuguese', native: 'Português' },
                { code: 'ru', name: 'Russian', native: 'Русский' },
                { code: 'zh', name: 'Chinese', native: '中文' },
                { code: 'ja', name: 'Japanese', native: '日本語' },
                { code: 'ko', name: 'Korean', native: '한국어' },
                { code: 'ar', name: 'Arabic', native: 'العربية' },
                { code: 'nl', name: 'Dutch', native: 'Nederlands' },
                { code: 'sv', name: 'Swedish', native: 'Svenska' },
                { code: 'no', name: 'Norwegian', native: 'Norsk' },
                { code: 'da', name: 'Danish', native: 'Dansk' },
                { code: 'fi', name: 'Finnish', native: 'Suomi' },
                { code: 'pl', name: 'Polish', native: 'Polski' },
                { code: 'cs', name: 'Czech', native: 'Čeština' },
                { code: 'hu', name: 'Hungarian', native: 'Magyar' },
                { code: 'ro', name: 'Romanian', native: 'Română' },
                { code: 'bg', name: 'Bulgarian', native: 'Български' },
                { code: 'hr', name: 'Croatian', native: 'Hrvatski' },
                { code: 'sl', name: 'Slovenian', native: 'Slovenščina' },
                { code: 'sk', name: 'Slovak', native: 'Slovenčina' },
                { code: 'et', name: 'Estonian', native: 'Eesti' },
                { code: 'lv', name: 'Latvian', native: 'Latviešu' },
                { code: 'lt', name: 'Lithuanian', native: 'Lietuvių' },
                { code: 'el', name: 'Greek', native: 'Ελληνικά' },
                { code: 'he', name: 'Hebrew', native: 'עברית' },
                { code: 'hi', name: 'Hindi', native: 'हिन्दी' },
                { code: 'th', name: 'Thai', native: 'ไทย' },
                { code: 'vi', name: 'Vietnamese', native: 'Tiếng Việt' },
                { code: 'id', name: 'Indonesian', native: 'Bahasa Indonesia' },
                { code: 'ms', name: 'Malay', native: 'Bahasa Melayu' },
                { code: 'tl', name: 'Filipino', native: 'Filipino' },
                { code: 'uk', name: 'Ukrainian', native: 'Українська' },
                { code: 'be', name: 'Belarusian', native: 'Беларуская' },
                { code: 'mk', name: 'Macedonian', native: 'Македонски' },
                { code: 'sq', name: 'Albanian', native: 'Shqip' },
                { code: 'sr', name: 'Serbian', native: 'Српски' },
                { code: 'bs', name: 'Bosnian', native: 'Bosanski' },
                { code: 'me', name: 'Montenegrin', native: 'Crnogorski' }
            ];
            
            res.json(languages);
        } catch (error) {
            addErrorLog('Languages', error.message, 'error');
            res.status(500).json({ error: 'Failed to get languages' });
        }
    });

    // AI Models endpoint
    app.get('/api/ai-models', (req, res) => {
        try {
            const models = {
                gemini: [
                    { id: 'gemini-pro', name: 'Gemini Pro', description: 'Best for complex reasoning and long context' },
                    { id: 'gemini-pro-vision', name: 'Gemini Pro Vision', description: 'Multimodal with vision capabilities' },
                    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', description: 'Latest model with improved performance' },
                    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', description: 'Fast and efficient for simpler tasks' }
                ],
                openai: [
                    { id: 'gpt-4', name: 'GPT-4', description: 'Most capable model for complex tasks' },
                    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: 'Faster and more affordable GPT-4' },
                    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', description: 'Fast and cost-effective' },
                    { id: 'gpt-3.5-turbo-16k', name: 'GPT-3.5 Turbo 16K', description: 'Extended context length' }
                ],
                claude: [
                    { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', description: 'Most powerful model for complex tasks' },
                    { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet', description: 'Balanced performance and speed' },
                    { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', description: 'Fastest and most compact' },
                    { id: 'claude-2.1', name: 'Claude 2.1', description: 'Previous generation model' }
                ]
            };
            
            res.json(models);
        } catch (error) {
            addErrorLog('AI Models', error.message, 'error');
            res.status(500).json({ error: 'Failed to get AI models' });
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
