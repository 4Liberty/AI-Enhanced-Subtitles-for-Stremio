const express = require('express');
const path = require('path');
const app = express();

// Serve static UI files
app.use('/ui', express.static(path.join(__dirname, 'ui')));

// Serve logo.svg from root directory to UI path
app.get('/ui/logo.svg', (req, res) => {
    res.sendFile(path.join(__dirname, 'logo.svg'));
});

// Mock API endpoints for testing
app.get('/api/dashboard', (req, res) => {
    res.json({
        uptime: 3600,
        subtitlesProcessed: 1250,
        torrentsFound: 450,
        activeProviders: 4,
        averageResponseTime: 250,
        memoryUsage: 128,
        systemMemory: 8192,
        freeMemory: 2048,
        usedMemory: 6144,
        successRate: 95,
        requestCount: 1500,
        errorCount: 75,
        recentErrors: [
            { timestamp: Date.now() - 60000, source: 'SubDL', message: 'Rate limit exceeded', level: 'warning' },
            { timestamp: Date.now() - 120000, source: 'OpenSubtitles', message: 'API timeout', level: 'error' }
        ],
        status: 'healthy'
    });
});

app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        subtitle_sources: { subdl: 'ok', opensubtitles: 'ok', podnapisi: 'ok' },
        realdebrid: 'ok',
        providers: { count: 4, active: 4 },
        keys: { openai: 'ok', gemini: 'ok', claude: 'ok' }
    });
});

app.get('/api/stats', (req, res) => {
    res.json({
        uptime: 3600,
        subtitlesProcessed: 1250,
        torrentsFound: 450,
        activeProviders: 4,
        averageResponseTime: 250,
        memoryUsage: 128,
        successRate: 95,
        requestCount: 1500,
        errorCount: 75
    });
});

app.get('/manifest.json', (req, res) => {
    res.json({
        id: 'vlsub.opensubtitles.com',
        version: '1.0.0',
        name: 'VLSub OpenSubtitles',
        description: 'Advanced subtitle addon with AI enhancement',
        logo: 'https://your-domain.com/logo.png',
        resources: ['subtitles', 'stream'],
        types: ['movie', 'series'],
        catalogs: [],
        idPrefixes: ['tt'],
        behaviorHints: {
            configurable: true,
            configurationRequired: false
        }
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Test UI server running on http://localhost:${PORT}`);
    console.log(`UI available at: http://localhost:${PORT}/ui/`);
});
