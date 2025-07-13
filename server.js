// --- ENVIRONMENT CHECKS ---
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
checkEnvVars();
// Health check endpoint for diagnostics
app.get('/health', async (req, res) => {
    const checks = {};
    // Check Gemini
    checks.gemini = !!process.env.GEMINI_API_KEY;
    // Check OpenSubtitles
    checks.opensubtitles = !!process.env.OPENSUBTITLES_API_KEY;
    // Check TMDb
    checks.tmdb = !!process.env.TMDB_API_KEY;
    // Check SubDL
    checks.subdl = !!process.env.SUBDL_API_KEY;
    // Try a simple fetch to TMDb if key present
    if (checks.tmdb) {
        try {
            const tmdbRes = await fetch(`https://api.themoviedb.org/3/configuration?api_key=${process.env.TMDB_API_KEY}`);
            checks.tmdb_online = tmdbRes.ok;
        } catch { checks.tmdb_online = false; }
    }
    res.json(checks);
});
// server.js
// --- FINAL STABLE VERSION v2.9.0 ---

const express = require('express');
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const path = require('path');
const { getAICorrectedSubtitle, getSubtitleUrlsForStremio } = require('./lib/subtitleMatcher');
const fetch = require('node-fetch');
const { getEnrichedStreams } = require('./lib/streamEnricher');

console.log("Starting Stremio AI Subtitle Addon v2.9.0...");

const manifest = {
    "id": "com.stremio.ai.subtitle.corrector.tr.final",
    "version": "2.9.0",
    "name": "AI Subtitle Corrector (TR)",
    "description": "Provides AI-corrected Turkish subtitles with a full customization UI and hash-matching.",
    "resources": ["subtitles", "stream"],
    "types": ["movie", "series"],
    "idPrefixes": ["tt", "tmdb"],
    "catalogs": [],
    "behaviorHints": {
        "configurable": true
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
        console.error("[Handler] Error in subtitle handler:", error);
        return { subtitles: [] };
    }
});

builder.defineStreamHandler(async (args) => {
    console.log(`[Handler] Stream request received for: ${args.id}`);
    // You would fetch streams from your provider here. For demo, use an empty array.
    const streams = []; // Replace with actual stream fetching logic if needed.
    try {
        const enriched = await getEnrichedStreams(args.type, args.id, streams);
        return { streams: enriched };
    } catch (error) {
        console.error("[Handler] Error in stream handler:", error);
        return { streams: [] };
    }
});

const addonInterface = builder.getInterface();
const app = express();
const port = process.env.PORT || 7000;

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

// Route for serving the actual .srt files.
app.get('/subtitles/:videoId/:language.srt', async (req, res) => {
    const { videoId, language } = req.params;
    console.log(`[Endpoint] AI Subtitle file request hit. Video ID: ${videoId}, Lang: ${language}`);
    try {
        // Patch global fetch for robust external calls in subtitleMatcher
        global.fetch = robustFetch;
        const correctedContent = await getAICorrectedSubtitle(videoId, language);
        if (correctedContent) {
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.send(correctedContent);
        } else {
            console.error(`[Endpoint] Subtitle generation failed for ${videoId}`);
            res.status(404).send('Subtitle could not be generated.');
        }
    } catch (err) {
        console.error("[Endpoint] CRITICAL ERROR while getting AI subtitle:", err);
        res.status(500).send('Internal server error.');
    }
});


// All other requests are handled by the Stremio addon SDK.
// This will handle /manifest.json, /subtitles, and /stream requests.
app.use((req, res, next) => {
    try {
        serveHTTP(addonInterface)(req, res, next);
    } catch (e) {
        console.error('[Stremio SDK] Handler error:', e);
        res.status(500).send('Stremio handler error.');
    }
});

app.listen(port, () => {
    console.log(`Addon running at: http://127.0.0.1:${port}`);
    console.log(`Configuration page available at the root URL or by clicking 'Configure' in Stremio.`);
});