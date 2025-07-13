// server.js
// --- FINAL STABLE VERSION v2.9.1 ---

const express = require('express');
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const path = require('path');
const { getAICorrectedSubtitle, getSubtitleUrlsForStremio, getCachedSubtitleContent } = require('./lib/subtitleMatcher');
const { getEnrichedStreams } = require('./lib/streamEnricher');

console.log("Starting Stremio AI Subtitle Addon v2.9.1...");

// Check for required environment variables
const requiredEnvVars = [
    'SUBDL_API_KEY',
    'OPENSUBTITLES_API_KEY',
    'GEMINI_API_KEY'
];

console.log("Environment variable status:");
requiredEnvVars.forEach(varName => {
    const isSet = !!process.env[varName];
    console.log(`  ${varName}: ${isSet ? 'SET' : 'MISSING'}`);
    if (!isSet) {
        console.warn(`  WARNING: ${varName} is not set - related functionality will be disabled`);
    }
});

// Add sample API key setup instructions
if (!process.env.SUBDL_API_KEY) {
    console.log("\n  To get SUBDL_API_KEY: Visit https://subdl.com/api and register");
}
if (!process.env.OPENSUBTITLES_API_KEY) {
    console.log("  To get OPENSUBTITLES_API_KEY: Visit https://opensubtitles.com/api and register");
}
if (!process.env.GEMINI_API_KEY) {
    console.log("  To get GEMINI_API_KEY: Visit https://ai.google.dev/ and get an API key");
}

const manifest = {
    id: "com.stremio.ai.subtitle.corrector.tr.final",
    version: "2.9.2",
    name: "AI Subtitle Corrector (TR)",
    description: "Provides AI-corrected Turkish subtitles with hash matching and multiple sources.",
    logo: "https://your-heroku-app.herokuapp.com/logo.svg",
    resources: ["subtitles", "stream"], // Include stream for pre-caching
    types: ["movie", "series"],
    idPrefixes: ["tt", "tmdb"],
    catalogs: [],
    behaviorHints: {
        configurable: true,
        configurationRequired: false
    },
    // Stremio v4+ subtitle language support
    subtitleLanguages: ["tr"],
    // Explicitly define what we provide
    provides: {
        subtitles: ["movie", "series"],
        stream: ["movie", "series"] // For pre-caching
    }
};

const builder = new addonBuilder(manifest);

// Define the subtitle handler
const subtitleHandler = async (args) => {
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
};

// Define the stream handler for pre-caching
const streamHandler = async (args) => {
    console.log(`[Handler] Stream request received for: ${args.id}`);
    
    // Extract the clean movie ID (remove .json extension if present)
    const movieId = args.id.replace('.json', '');
    console.log(`[Handler] Clean movie ID for pre-caching: ${movieId}`);
    
    // Pre-cache subtitles in the background for faster response when user clicks play
    if (movieId.startsWith('tt')) {
        console.log(`[Handler] Starting subtitle pre-caching for ${movieId}`);
        // Don't await this - let it run in background
        getSubtitleUrlsForStremio(movieId, null)
            .then(result => {
                if (result && result.subtitles && result.subtitles.length > 0) {
                    console.log(`[Handler] Pre-cached ${result.subtitles.length} subtitle option(s) for ${movieId}`);
                } else {
                    console.log(`[Handler] No subtitles found during pre-caching for ${movieId}`);
                }
            })
            .catch(err => {
                console.error(`[Handler] Pre-caching failed for ${movieId}:`, err);
            });
    }
    
    // Return empty streams since we're focused on subtitles
    return { streams: [] };
};

// Define both handlers
builder.defineSubtitlesHandler(subtitleHandler);
builder.defineStreamHandler(streamHandler);

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

// Add request logging middleware to see all incoming requests
app.use((req, res, next) => {
    console.log(`[Request] ${req.method} ${req.path} - Headers: ${JSON.stringify(req.headers)}`);
    next();
});

// Serve static files from project root (for logo.svg, etc.)
app.use(express.static(__dirname));

// Route for the configuration page
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

// Manifest endpoint
app.get('/manifest.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(JSON.stringify(addonInterface.manifest, null, 2));
});

// IMPORTANT: .srt route MUST come before other subtitle routes to prevent conflicts
app.get('/subtitles/:videoId/:language.srt', async (req, res) => {
    const { videoId, language } = req.params;
    const { hash, test, fallback, source } = req.query;
    
    console.log(`[SRT Endpoint] Subtitle file request. Video ID: ${videoId}, Lang: ${language}, Hash: ${hash}, Test: ${test}, Fallback: ${fallback}, Source: ${source}`);

    // If we have a specific source (subdl, podnapisi, opensubtitles), serve the cached content
    if (source && (source === 'subdl' || source === 'podnapisi' || source === 'opensubtitles' || 
                   source === 'subdl-original' || source === 'podnapisi-original' || source === 'opensubtitles-original' || 
                   source === 'subdl-error' || source === 'subdl-hash' || source === 'subdl-ai' || 
                   source === 'podnapisi-ai' || source === 'podnapisi-hash' || 
                   source === 'opensubtitles-ai' || source === 'opensubtitles-hash')) {
        const cachedContent = getCachedSubtitleContent(videoId, source);
        if (cachedContent) {
            console.log(`[SRT Endpoint] Serving cached ${source} subtitle for ${videoId}`);
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${videoId}_${language}_${source}.srt"`);
            res.send(cachedContent);
            return;
        } else {
            console.log(`[SRT Endpoint] No cached content found for ${videoId} from ${source}`);
        }
    }

    // If in test mode (no API keys), return a sample subtitle
    if (test === 'true') {
        const testSubtitle = `1
00:00:01,000 --> 00:00:05,000
Test Turkish subtitle for debugging

2
00:00:06,000 --> 00:00:10,000
API Keys not configured - this is a test subtitle

3
00:00:11,000 --> 00:00:15,000
VideoId: ${videoId}
`;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${videoId}_${language}.srt"`);
        res.send(testSubtitle);
        return;
    }

    // If fallback mode, provide a basic subtitle
    if (fallback === 'true') {
        const fallbackSubtitle = `1
00:00:01,000 --> 00:00:05,000
Basic Turkish subtitle

2
00:00:06,000 --> 00:00:10,000
Subtitle for ${videoId}

3
00:00:11,000 --> 00:00:15,000
No external subtitle sources available
`;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${videoId}_${language}.srt"`);
        res.send(fallbackSubtitle);
        return;
    }

    try {
        const aiSubtitle = await getAICorrectedSubtitle(videoId, language);
        if (aiSubtitle) {
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${videoId}_${language}.srt"`);
            res.send(aiSubtitle);
        } else {
            console.error(`[SRT Endpoint] Subtitle generation failed for ${videoId}, providing fallback`);
            // Provide a fallback subtitle instead of 404
            const fallbackSubtitle = `1
00:00:01,000 --> 00:00:05,000
Turkish subtitle

2
00:00:06,000 --> 00:00:10,000
Subtitle for ${videoId}

3
00:00:11,000 --> 00:00:15,000
Could not generate AI subtitle
`;
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${videoId}_${language}.srt"`);
            res.send(fallbackSubtitle);
        }
    } catch (err) {
        console.error("[SRT Endpoint] CRITICAL ERROR while getting AI subtitle:", err);
        // Provide a fallback subtitle instead of 500 error
        const errorSubtitle = `1
00:00:01,000 --> 00:00:05,000
Turkish subtitle

2
00:00:06,000 --> 00:00:10,000
Error occurred while generating subtitle

3
00:00:11,000 --> 00:00:15,000
VideoId: ${videoId}
`;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${videoId}_${language}.srt"`);
        res.send(errorSubtitle);
    }
});

// Subtitles resource endpoints that Stremio expects
app.post('/subtitles/:type/:id', async (req, res) => {
    const { type, id } = req.params;
    console.log(`[Express] POST /subtitles/${type}/${id} - Body:`, JSON.stringify(req.body, null, 2));
    try {
        const args = { type, id, extra: req.body?.extra || {} };
        const result = await subtitleHandler(args);
        result.subtitles = absolutizeSubtitleUrls(result, req).subtitles;
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
        const result = await subtitleHandler(args);
        result.subtitles = absolutizeSubtitleUrls(result, req).subtitles;
        console.log(`[Express] GET result:`, JSON.stringify(result, null, 2));
        res.json(result);
    } catch (err) {
        console.error('[Express] Error in subtitles GET endpoint:', err);
        res.status(500).json({ subtitles: [] });
    }
});

// Support for .json extension
app.get('/subtitles/:type/:id.json', async (req, res) => {
    const { type, id } = req.params;
    console.log(`[Express] GET /subtitles/${type}/${id}.json - Query:`, JSON.stringify(req.query, null, 2));
    try {
        const args = { type, id, extra: req.query || {} };
        const result = await subtitleHandler(args);
        result.subtitles = absolutizeSubtitleUrls(result, req).subtitles;
        console.log(`[Express] .json result:`, JSON.stringify(result, null, 2));
        res.json(result);
    } catch (err) {
        console.error('[Express] Error in subtitles .json endpoint:', err);
        res.status(500).json({ subtitles: [] });
    }
});

// Support for subtitles with filename parameter (from Stremio logs)
app.get('/subtitles/:type/:id/:filename', async (req, res) => {
    const { type, id, filename } = req.params;
    console.log(`[Express] GET /subtitles/${type}/${id}/${filename} - Query:`, JSON.stringify(req.query, null, 2));
    try {
        const args = { type, id, extra: req.query || {} };
        const result = await subtitleHandler(args);
        result.subtitles = absolutizeSubtitleUrls(result, req).subtitles;
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
        const result = await subtitleHandler(args);
        result.subtitles = absolutizeSubtitleUrls(result, req).subtitles;
        console.log(`[Express] Filename.json result:`, JSON.stringify(result, null, 2));
        res.json(result);
    } catch (err) {
        console.error('[Express] Error in subtitles filename.json endpoint:', err);
        res.status(500).json({ subtitles: [] });
    }
});

// Stream resource endpoints (POST and GET for compatibility)
app.post('/stream/:type/:id', async (req, res) => {
    const { type, id } = req.params;
    console.log(`[Express] POST /stream/${type}/${id} - Body:`, JSON.stringify(req.body, null, 2));
    try {
        const args = { type, id, extra: req.body?.extra || {} };
        const result = await streamHandler(args);
        console.log(`[Express] POST stream result:`, JSON.stringify(result, null, 2));
        res.json(result);
    } catch (err) {
        console.error('[Express] Error in stream POST endpoint:', err);
        res.status(500).json({ streams: [] });
    }
});

app.get('/stream/:type/:id', async (req, res) => {
    const { type, id } = req.params;
    console.log(`[Express] GET /stream/${type}/${id} - Query:`, JSON.stringify(req.query, null, 2));
    try {
        const args = { type, id, extra: req.query || {} };
        const result = await streamHandler(args);
        console.log(`[Express] GET stream result:`, JSON.stringify(result, null, 2));
        res.json(result);
    } catch (err) {
        console.error('[Express] Error in stream GET endpoint:', err);
        res.status(500).json({ streams: [] });
    }
});

// Support for .json extension on stream endpoints
app.get('/stream/:type/:id.json', async (req, res) => {
    const { type, id } = req.params;
    console.log(`[Express] GET /stream/${type}/${id}.json - Query:`, JSON.stringify(req.query, null, 2));
    try {
        const args = { type, id, extra: req.query || {} };
        const result = await streamHandler(args);
        console.log(`[Express] .json stream result:`, JSON.stringify(result, null, 2));
        res.json(result);
    } catch (err) {
        console.error('[Express] Error in stream .json endpoint:', err);
        res.status(500).json({ streams: [] });
    }
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

app.listen(port, () => {
    console.log(`Addon running at: http://0.0.0.0:${port}`);
    console.log(`Manifest: http://0.0.0.0:${port}/manifest.json`);
    console.log(`Health: http://0.0.0.0:${port}/health`);
    console.log(`Configure: http://0.0.0.0:${port}/configure`);
    console.log(`Subtitle .srt: http://0.0.0.0:${port}/subtitles/:videoId/:language.srt`);
});