// server.js
// --- FINAL STABLE VERSION v2.9.1 ---

const express = require('express');
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const path = require('path');
const { getAICorrectedSubtitle, getSubtitleUrlsForStremio, getCachedSubtitleContent, getProgressiveSubtitleContent, aiEnhancementStatus } = require('./lib/subtitleMatcher');
const { getEnrichedStreams } = require('./lib/streamEnricher');
const { generateRealDebridStreams, generateSampleRealDebridStreams } = require('./lib/realDebridSearch');
const { setupUIRoutes } = require('./ui-api');

console.log("Starting Stremio AI Subtitle Addon v2.9.1 with Beautiful UI...");

console.log(`
██╗  ██╗██████╗ ██╗     ███████╗██╗     ██╗██╗  ██╗██╗   ██╗██╗     ██╗██╗  ██╗
██║  ██║██╔══██╗██║     ██╔════╝██║     ██║██║  ██║██║   ██║██║     ██║██║  ██║
███████║██████╔╝██║     █████╗  ██║     ██║███████║██║   ██║██║     ██║███████║
██╔══██║██╔═══╝ ██║     ██╔══╝  ██║     ██║██╔══██║██║   ██║██║     ██║██╔══██║
██║  ██║██║     ██║     ███████╗███████╗██║██║  ██║╚██████╔╝███████╗██║██║  ██║
╚═╝  ╚═╝╚═╝     ╚═╝     ╚══════╝╚══════╝╚═╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝╚═╝  ╚═╝
`);

// Check for required environment variables
const requiredEnvVars = [
    'SUBDL_API_KEY',
    'OPENSUBTITLES_API_KEY',
    'GEMINI_API_KEY'
];

const optionalEnvVars = [
    'REAL_DEBRID_API_KEY',
    'TMDB_API_KEY'
];

console.log("Environment variable status:");
requiredEnvVars.forEach(varName => {
    const isSet = !!process.env[varName];
    console.log(`  ${varName}: ${isSet ? 'SET' : 'MISSING'}`);
    if (!isSet) {
        console.warn(`  WARNING: ${varName} is not set - related functionality will be disabled`);
    }
});

console.log("Optional environment variables:");
optionalEnvVars.forEach(varName => {
    const isSet = !!process.env[varName];
    console.log(`  ${varName}: ${isSet ? 'SET' : 'NOT SET'}`);
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
if (!process.env.REAL_DEBRID_API_KEY) {
    console.log("  To get REAL_DEBRID_API_KEY: Visit https://real-debrid.com/api and get an API key");
}

console.log("\n🎨 Beautiful UI will be available at: http://localhost:7000/ui");
console.log("📊 Advanced health monitoring and settings included!");

const manifest = {
    id: "com.stremio.ai.subtitle.corrector.tr.final",
    version: "2.9.3",
    name: "AI Subtitle Corrector (TR) + Real-Debrid",
    description: "Provides AI-corrected Turkish subtitles with hash matching, multiple sources, Real-Debrid cached streams, and stream provision for reliable hash access.",
    logo: "https://your-heroku-app.herokuapp.com/logo.svg",
    resources: ["subtitles", "stream"], // Include stream for reliable hash provision
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
        stream: ["movie", "series"] // For reliable hash-based subtitle matching + Real-Debrid cached streams
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

// Define the stream handler for Real-Debrid and hash-based matching
const streamHandler = async (args) => {
    console.log(`[Handler] Stream request received for: ${args.id}`);
    
    // Extract the clean movie ID (remove .json extension if present)
    const movieId = args.id.replace('.json', '');
    console.log(`[Handler] Clean movie ID for stream provision: ${movieId}`);
    
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
    
    const streams = [];
    
    // PRIORITY 1: Real-Debrid cached streams (appear at TOP of list)
    if (process.env.REAL_DEBRID_API_KEY && movieId.startsWith('tt')) {
        console.log(`[Handler] Searching Real-Debrid for cached streams...`);
        try {
            const rdStreams = await generateRealDebridStreams(movieId, 'movie');
            if (rdStreams && rdStreams.length > 0) {
                console.log(`[Handler] Found ${rdStreams.length} Real-Debrid cached streams`);
                streams.push(...rdStreams);
            } else {
                console.log(`[Handler] No Real-Debrid cached streams found, using samples`);
                // Add sample Real-Debrid streams for demonstration
                const sampleRdStreams = generateSampleRealDebridStreams(movieId);
                streams.push(...sampleRdStreams);
            }
        } catch (e) {
            console.error(`[Handler] Real-Debrid search error:`, e);
        }
    }
    
    // PRIORITY 2: Hash-based subtitle matching streams (for non-Real-Debrid users)
    const sampleHashes = [
        { title: 'Hash-Match 1080p', infoHash: '3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b', quality: '1080p' },
        { title: 'Hash-Match 720p', infoHash: '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b', quality: '720p' },
        { title: 'Hash-Match 4K', infoHash: '9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b', quality: '4K' }
    ];
    
    // Add hash-matching streams only if no Real-Debrid streams
    if (streams.length === 0) {
        console.log(`[Handler] No Real-Debrid streams, providing hash-matching streams for subtitle sync`);
        
        for (const sample of sampleHashes) {
            streams.push({
                title: `${sample.title} (Subtitle Hash-Matching)`,
                url: `magnet:?xt=urn:btih:${sample.infoHash}&dn=sample`,
                quality: sample.quality,
                seeds: 1,
                peers: 1,
                behaviorHints: {
                    notWebReady: true,
                    hashOnly: true, // These are only for hash-based subtitle matching
                    subtitleMatch: true
                },
                infoHash: sample.infoHash
            });
        }
    }
    
    console.log(`[Handler] Providing ${streams.length} total streams (${streams.filter(s => s.behaviorHints?.realDebrid).length} Real-Debrid cached)`);
    
    return { streams };
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

// Add server timeout configuration for longer subtitle processing
app.use((req, res, next) => {
    // Set timeout to 60 seconds for subtitle processing
    req.setTimeout(60000, () => {
        console.log(`[Timeout] Request timeout for ${req.method} ${req.path}`);
        if (!res.headersSent) {
            res.status(408).json({ error: 'Request timeout' });
        }
    });
    
    res.setTimeout(60000, () => {
        console.log(`[Timeout] Response timeout for ${req.method} ${req.path}`);
        if (!res.headersSent) {
            res.status(408).json({ error: 'Response timeout' });
        }
    });
    
    next();
});

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
app.get('/configure', configureRoute);

// Setup UI routes (includes root redirect to /ui)
setupUIRoutes(app);

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
    const { hash, test, fallback, source, progressive } = req.query;
    
    console.log(`[SRT Endpoint] Subtitle file request. Video ID: ${videoId}, Lang: ${language}, Hash: ${hash}, Test: ${test}, Fallback: ${fallback}, Source: ${source}, Progressive: ${progressive}`);

    // Handle progressive AI-enhanced subtitles
    if (progressive === 'true' && source) {
        const baseSource = source.replace('-ai', ''); // Remove -ai suffix to get base source
        console.log(`[SRT Endpoint] Progressive request for ${baseSource}, checking AI enhancement status...`);
        
        const progressiveContent = getProgressiveSubtitleContent(videoId, baseSource);
        if (progressiveContent) {
            const enhancementKey = `${videoId}-${baseSource}-ai`;
            const aiStatus = aiEnhancementStatus.get(enhancementKey);
            const isAiEnhanced = aiStatus === 'completed';
            
            console.log(`[SRT Endpoint] Serving ${isAiEnhanced ? 'AI-enhanced' : 'original'} progressive subtitle for ${baseSource} (AI status: ${aiStatus})`);
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${videoId}_${language}_${isAiEnhanced ? 'ai' : 'original'}.srt"`);
            res.setHeader('X-AI-Enhanced', isAiEnhanced ? 'true' : 'false');
            res.setHeader('X-AI-Status', aiStatus || 'unknown');
            res.send(progressiveContent);
            return;
        } else {
            console.log(`[SRT Endpoint] No progressive content found for ${baseSource}, falling back to traditional method`);
        }
    }

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
    if (fallback === 'true' || fallback === 'traditional') {
        const fallbackSubtitle = `1
00:00:01,000 --> 00:00:05,000
Turkish subtitle loading...

2
00:00:06,000 --> 00:00:10,000
Subtitle for ${videoId}

3
00:00:11,000 --> 00:00:15,000
Searching external subtitle sources...

4
00:00:16,000 --> 00:00:20,000
Please wait while we find subtitles
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

// Legacy health check endpoint (maintained for compatibility)
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
    console.log(`\n🚀 Stremio AI Subtitle & Real-Debrid Addon is running!`);
    console.log(`📍 Main URL: http://0.0.0.0:${port}`);
    console.log(`🎨 Beautiful UI: http://0.0.0.0:${port}/ui`);
    console.log(`📋 Manifest: http://0.0.0.0:${port}/manifest.json`);
    console.log(`💚 Health: http://0.0.0.0:${port}/health`);
    console.log(`⚙️  Configure: http://0.0.0.0:${port}/configure`);
    console.log(`📝 Subtitle .srt: http://0.0.0.0:${port}/subtitles/:videoId/:language.srt`);
    console.log(`\n✨ Features available:`);
    console.log(`   • AI-powered subtitle correction with Google Gemini`);
    console.log(`   • Real-Debrid torrent streaming with 20+ providers`);
    console.log(`   • Web scraping support for 1337x, KAT, MagnetDL`);
    console.log(`   • Advanced health monitoring & performance metrics`);
    console.log(`   • Beautiful modern UI with comprehensive settings`);
    console.log(`   • Real-time system status & error tracking`);
    console.log(`\n🔗 Open http://localhost:${port}/ui to access the control panel!`);
});