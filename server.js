// --- ENVIRONMENT CHECKS ---

const express = require('express');
const { addonBuilder } = require('stremio-addon-sdk');
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

// --- Stremio Addon SDK HTTP server (for Stremio endpoints and .srt endpoint) ---
const fs = require('fs');
// 'express' and 'app' are already declared above, do not redeclare.
const port = process.env.PORT || 7000;

// Stremio Addon manifest endpoint
app.get('/manifest.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(addonInterface.manifest));
});

// Stremio subtitles resource endpoint (.srt)
app.get('/subtitles/:videoId/:language.srt', async (req, res) => {
    const { videoId, language } = req.params;
    console.log(`[Express] AI Subtitle file request hit. Video ID: ${videoId}, Lang: ${language}`);
    try {
        const correctedContent = await getAICorrectedSubtitle(videoId, language);
        if (correctedContent) {
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.end(correctedContent);
        } else {
            console.error(`[Express] Subtitle generation failed for ${videoId}`);
            res.status(404).end('Subtitle could not be generated.');
        }
    } catch (err) {
        console.error('[Express] Error in .srt handler:', err);
        res.status(500).end('Internal server error.');
    }
});

// Stremio subtitles/stream resource endpoints (POST)
app.post('/:resource/:type/:id', express.json(), async (req, res) => {
    const { resource, type, id } = req.params;
    if (resource === 'subtitles') {
        const infoHash = req.body?.extra?.video_hash || null;
        const result = await getSubtitleUrlsForStremio(id, infoHash);
        res.json(result);
    } else if (resource === 'stream') {
        const streams = await getEnrichedStreams(type, id, []);
        res.json({ streams });
    } else {
        res.status(404).json({ error: 'Unknown resource' });
    }
});

// Configuration page
app.get(['/', '/configure', '/configure/'], (req, res) => {
    const filePath = path.join(__dirname, 'configure.html');
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.status(500).end('Could not load configure.html');
        } else {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(data);
        }
    });
});

// Health check endpoint
app.get(['/health', '/health/'], async (req, res) => {
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

// Global error handler
app.use((err, req, res, next) => {
    console.error('[Global Error Handler]', err);
    if (!res.headersSent) {
        res.status(500).send('Internal server error.');
    }
});

app.listen(port, () => {
    console.log(`Stremio Addon & all endpoints running at: http://0.0.0.0:${port}`);
    console.log(`Manifest: http://0.0.0.0:${port}/manifest.json`);
    console.log(`Health: http://0.0.0.0:${port}/health`);
    console.log(`Configure: http://0.0.0.0:${port}/configure`);
    console.log(`Subtitle .srt: http://0.0.0.0:${port}/subtitles/:videoId/:language.srt`);
});


// --- Express server for management endpoints (health, config, etc.) ---
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
