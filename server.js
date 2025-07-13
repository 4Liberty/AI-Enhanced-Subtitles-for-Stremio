// --- ENVIRONMENT CHECKS ---

const express = require('express');
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const path = require('path');
const { getAICorrectedSubtitle, getSubtitleUrlsForStremio } = require('./lib/subtitleMatcher');
const fetch = require('node-fetch');
const { getEnrichedStreams } = require('./lib/streamEnricher');

function checkEnvVars() {
    const missing = [];
    if (!process.env.GEMINI_API_KEY) missing.push('GEMINI_API_KEY');
    if (!process.env.OPENSUBTITLES_API_KEY) missing.push('OPENSUBTITLES_API_KEY');
    if (!process.env.TMDB_API_KEY) missing.push('TMDB_API_KEY');
    if (!process.env.SUBDL_API_KEY) missing.push('SUBDL_API_KEY');
    if (missing.length) {
        console.warn('[Startup] WARNING: Missing environment variables:', missing.join(', '));
    } else {
        console.log('[Startup] All required API keys are set.');
    }
}

console.log("Starting Stremio AI Subtitle Addon v2.9.0...");

const manifest = {
    id: 'com.stremio.ai.subtitle.corrector.tr.final',
    version: '2.9.0',
    name: 'AI Subtitle Corrector (TR)',
    description: 'Provides AI-corrected Turkish subtitles with a full customization UI and hash-matching.',
    resources: ['subtitles', 'stream'],
    types: ['movie', 'series'],
    idPrefixes: ['tt', 'tmdb'],
    catalogs: [],
    behaviorHints: {
        configurable: true
    }
};

const builder = new addonBuilder(manifest);

builder.defineSubtitlesHandler(async (args) => {
    console.log(`[Handler] Subtitle request received for: ${args.id}`);
    try {
        const infoHash = args.extra && args.extra.video_hash ? args.extra.video_hash : null;
        const result = await getSubtitleUrlsForStremio(args.id, infoHash);
        if (result && result.subtitles && result.subtitles.length > 0) {
            console.log(`[Handler] Successfully generated ${result.subtitles.length} subtitle option(s).`);
        }
        return result;
    } catch (error) {
        console.error('[Handler] Error in subtitle handler:', error);
        return { subtitles: [] };
    }
});

builder.defineStreamHandler(async (args) => {
    console.log(`[Handler] Stream request received for: ${args.id}`);
    const streams = [];
    try {
        const enriched = await getEnrichedStreams(args.type, args.id, streams);
        return { streams: enriched };
    } catch (error) {
        console.error('[Handler] Error in stream handler:', error);
        return { streams: [] };
    }
});


const addonInterface = builder.getInterface();

// --- Stremio Addon SDK HTTP server (for Stremio endpoints only) ---
serveHTTP(addonInterface, { port: process.env.PORT || 7000 });

// --- Express server for custom endpoints (health, config, .srt, etc.) ---
const app = express();
const mgmtPort = process.env.MGMT_PORT || 7001;


checkEnvVars();

// Health check endpoint for diagnostics
app.get('/health', async (req, res) => {
    const checks = {};
    checks.gemini = !!process.env.GEMINI_API_KEY;
    checks.opensubtitles = !!process.env.OPENSUBTITLES_API_KEY;
    checks.tmdb = !!process.env.TMDB_API_KEY;
    checks.subdl = !!process.env.SUBDL_API_KEY;
    if (checks.tmdb) {
        try {
            const tmdbRes = await fetch(`https://api.themoviedb.org/3/configuration?api_key=${process.env.TMDB_API_KEY}`);
            checks.tmdb_online = tmdbRes.ok;
        } catch { checks.tmdb_online = false; }
    }
    res.json(checks);
});

// Route for the configuration page.
const configureRoute = (req, res) => {
    res.sendFile(path.join(__dirname, 'configure.html'));
};
app.get('/', configureRoute);
app.get('/configure', configureRoute);

// Helper: robust fetch with retries and timeout
async function robustFetch(url, options = {}, retries = 2, timeoutMs = 8000) {
    for (let i = 0; i <= retries; i++) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), timeoutMs);
            const res = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(timeout);
            if (res.ok) return res;
        } catch (e) {
            if (i === retries) return null;
        }
    }
    return null;
}

// Async route wrapper to catch errors and pass to Express error handler
function asyncRoute(handler) {
    return (req, res, next) => {
        Promise.resolve(handler(req, res, next)).catch(next);
    };
}

// Route for serving the actual .srt files.
app.get('/subtitles/:videoId/:language.srt', asyncRoute(async (req, res) => {
    const { videoId, language } = req.params;
    console.log(`[Endpoint] AI Subtitle file request hit. Video ID: ${videoId}, Lang: ${language}`);
    const correctedContent = await getAICorrectedSubtitle(videoId, language);
    if (correctedContent) {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.send(correctedContent);
    } else {
        console.error(`[Endpoint] Subtitle generation failed for ${videoId}`);
        res.status(404).send('Subtitle could not be generated.');
    }
}));


// Explicit manifest route for extra robustness
app.get('/manifest.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(addonInterface.manifest));
});



// Global error handler for uncaught errors in async routes
app.use((err, req, res, next) => {
    console.error('[Global Error Handler]', err);
    if (!res.headersSent) {
        res.status(500).send('Internal server error.');
    }
});

app.listen(mgmtPort, () => {
    console.log(`Express management endpoints running at: http://127.0.0.1:${mgmtPort}`);
    console.log(`Health check: http://127.0.0.1:${mgmtPort}/health`);
    console.log(`Configuration page: http://127.0.0.1:${mgmtPort}/ or /configure`);
    console.log(`Subtitle .srt endpoint: http://127.0.0.1:${mgmtPort}/subtitles/:videoId/:language.srt`);
});