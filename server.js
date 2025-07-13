// server.js
// --- FINAL STABLE VERSION v2.9.0 ---

const express = require('express');
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const path = require('path');
const { getAICorrectedSubtitle, getSubtitleUrlsForStremio } = require('./lib/subtitleMatcher');
const { getEnrichedStreams } = require('./lib/streamEnricher');

console.log("Starting Stremio AI Subtitle Addon v2.9.0...");


const manifest = {
    id: "com.stremio.ai.subtitle.corrector.tr.final",
    version: "2.9.0",
    name: "AI Subtitle Corrector (TR)",
    description: "Provides AI-corrected Turkish subtitles with a full customization UI and hash-matching.",
    resources: ["subtitles", "stream"],
    types: ["movie", "series"],
    idPrefixes: ["tt", "tmdb"],
    catalogs: [],
    behaviorHints: {
        configurable: true
    }
};

const builder = new addonBuilder(manifest);

builder.defineSubtitlesHandler(async (args) => {
    console.log(`[Handler] Subtitle request received for: ${args.id}`);
    console.log(`[Handler] Full args:`, JSON.stringify(args, null, 2));
    try {
        const infoHash = args.extra && args.extra.video_hash ? args.extra.video_hash : null;
        const result = await getSubtitleUrlsForStremio(args.id, infoHash);
        if (result && result.subtitles && result.subtitles.length > 0) {
            console.log(`[Handler] Successfully generated ${result.subtitles.length} subtitle option(s).`);
            console.log(`[Handler] Subtitle options:`, JSON.stringify(result.subtitles, null, 2));
        } else {
            console.log(`[Handler] No subtitles found for ${args.id}`);
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

// Add CORS headers for all responses (MUST BE FIRST for Stremio addon installation)
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Add JSON body parsing
app.use(express.json());

// Serve static files from project root (for logo.svg, etc.)
app.use(express.static(__dirname));

// Route for the configuration page.
const configureRoute = (req, res) => {
    res.sendFile(path.join(__dirname, 'configure.html'));
};
app.get('/', configureRoute);
app.get('/configure', configureRoute);

// Helper to ensure absolute URLs in subtitle options
function absolutizeSubtitleUrls(result, req) {
    if (!result || !result.subtitles) return result;
    const base = req.protocol + '://' + req.get('host');
    result.subtitles = result.subtitles.map(sub => {
        if (sub.url && sub.url.startsWith('/')) {
            return { ...sub, url: base + sub.url };
        }
        return sub;
    });
    return result;
}

// Stremio subtitles resource endpoint (Stremio expects this for subtitle options)
app.get('/subtitles/:type/:id.json', async (req, res) => {
    const { type, id } = req.params;
    console.log(`[Express] GET /subtitles/${type}/${id}.json - Query:`, JSON.stringify(req.query, null, 2));
    const infoHash = req.query.hash || null;
    let result = await getSubtitleUrlsForStremio(id, infoHash);
    result = absolutizeSubtitleUrls(result, req);
    console.log(`[Express] .json result:`, JSON.stringify(result, null, 2));
    res.json(result);
});

// Manifest endpoint
app.get('/manifest.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(JSON.stringify(addonInterface.manifest, null, 2));
});

// Subtitles resource endpoints that Stremio expects (using SDK handlers)
app.post('/subtitles/:type/:id', async (req, res) => {
    const { type, id } = req.params;
    console.log(`[Express] POST /subtitles/${type}/${id} - Body:`, JSON.stringify(req.body, null, 2));
    try {
        const args = { type, id, extra: req.body?.extra || {} };
        const result = await addonInterface.handlers.subtitles(args);
        console.log(`[Express] POST result:`, JSON.stringify(result, null, 2));
        res.json(result);
    } catch (err) {
        console.error('[Express] Error in subtitles POST endpoint:', err);
        res.status(500).json({ subtitles: [] });
    }
});

app.get('/subtitles/:type/:id', async (req, res) => {
    const { type, id } = req.params;
    console.log(`[Express] GET /subtitles/${type}/${id} - Query:`, JSON.stringify(req.query, null, 2));
    try {
        const args = { type, id, extra: req.query || {} };
        const result = await addonInterface.handlers.subtitles(args);
        console.log(`[Express] GET result:`, JSON.stringify(result, null, 2));
        res.json(result);
    } catch (err) {
        console.error('[Express] Error in subtitles GET endpoint:', err);
        res.status(500).json({ subtitles: [] });
    }
});

// Route for serving the actual .srt files.
app.get('/subtitles/:videoId/:language.srt', (req, res) => {
    const { videoId, language } = req.params;
    console.log(`[Endpoint] AI Subtitle file request hit. Video ID: ${videoId}, Lang: ${language}`);

    getAICorrectedSubtitle(videoId, language)
        .then(correctedContent => {
            if (correctedContent) {
                res.setHeader('Content-Type', 'text/plain; charset=utf-8');
                res.send(correctedContent);
            } else {
                console.error(`[Endpoint] Subtitle generation failed for ${videoId}`);
                res.status(404).send('Subtitle could not be generated.');
            }
        })
        .catch(err => {
            console.error("[Endpoint] CRITICAL ERROR while getting AI subtitle:", err);
            res.status(500).send('Internal server error.');
        });
});

// Health check endpoint
app.get('/health', async (req, res) => {
    const checks = {};
    checks.gemini = !!process.env.GEMINI_API_KEY;
    checks.opensubtitles = !!process.env.OPENSUBTITLES_API_KEY;
    checks.tmdb = !!process.env.TMDB_API_KEY;
    checks.subdl = !!process.env.SUBDL_API_KEY;
    if (checks.tmdb) {
        try {
            const fetch = require('node-fetch');
            const tmdbRes = await fetch(`https://api.themoviedb.org/3/configuration?api_key=${process.env.TMDB_API_KEY}`);
            checks.tmdb_online = tmdbRes.ok;
        } catch { checks.tmdb_online = false; }
    }
    res.json(checks);
});

// Stream resource endpoints (POST and GET for compatibility)
app.post('/stream/:type/:id', async (req, res) => {
    const { type, id } = req.params;
    try {
        const args = { type, id, extra: req.body?.extra || {} };
        if (addonInterface.handlers.stream) {
            const result = await addonInterface.handlers.stream(args);
            res.json(result);
        } else {
            res.json({ streams: [] });
        }
    } catch (err) {
        console.error('[Express] Error in stream POST endpoint:', err);
        res.status(500).json({ streams: [] });
    }
});

app.get('/stream/:type/:id', async (req, res) => {
    const { type, id } = req.params;
    try {
        const args = { type, id, extra: req.query || {} };
        if (addonInterface.handlers.stream) {
            const result = await addonInterface.handlers.stream(args);
            res.json(result);
        } else {
            res.json({ streams: [] });
        }
    } catch (err) {
        console.error('[Express] Error in stream GET endpoint:', err);
        res.status(500).json({ streams: [] });
    }
});

// Support for .json extension on stream endpoints
app.get('/stream/:type/:id.json', async (req, res) => {
    const { type, id } = req.params;
    try {
        const args = { type, id, extra: req.query || {} };
        if (addonInterface.handlers.stream) {
            const result = await addonInterface.handlers.stream(args);
            res.json(result);
        } else {
            res.json({ streams: [] });
        }
    } catch (err) {
        console.error('[Express] Error in stream .json endpoint:', err);
        res.status(500).json({ streams: [] });
    }
});

// Support for subtitles with filename parameter (from Stremio logs)
app.get('/subtitles/:type/:id/:filename', async (req, res) => {
    const { type, id, filename } = req.params;
    console.log(`[Express] GET /subtitles/${type}/${id}/${filename} - Query:`, JSON.stringify(req.query, null, 2));
    try {
        const args = { type, id, extra: req.query || {} };
        const result = await addonInterface.handlers.subtitles(args);
        console.log(`[Express] Filename result:`, JSON.stringify(result, null, 2));
        res.json(result);
    } catch (err) {
        console.error('[Express] Error in subtitles filename endpoint:', err);
        res.status(500).json({ subtitles: [] });
    }
});

// Support for subtitles with filename parameter and .json extension
app.get('/subtitles/:type/:id/:filename.json', async (req, res) => {
    const { type, id, filename } = req.params;
    console.log(`[Express] GET /subtitles/${type}/${id}/${filename}.json - Query:`, JSON.stringify(req.query, null, 2));
    try {
        const args = { type, id, extra: req.query || {} };
        const result = await addonInterface.handlers.subtitles(args);
        console.log(`[Express] Filename.json result:`, JSON.stringify(result, null, 2));
        res.json(result);
    } catch (err) {
        console.error('[Express] Error in subtitles filename.json endpoint:', err);
        res.status(500).json({ subtitles: [] });
    }
});

app.listen(port, () => {
    console.log(`Addon running at: http://0.0.0.0:${port}`);
    console.log(`Manifest: http://0.0.0.0:${port}/manifest.json`);
    console.log(`Health: http://0.0.0.0:${port}/health`);
    console.log(`Configure: http://0.0.0.0:${port}/configure`);
    console.log(`Subtitle .srt: http://0.0.0.0:${port}/subtitles/:videoId/:language.srt`);
}); 