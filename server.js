// server.js
// --- FINAL STABLE VERSION v2.9.1 ---

const express = require('express');
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const path = require('path');
const { getAICorrectedSubtitle, getSubtitleUrlsForStremio, getCachedSubtitleContent, getProgressiveSubtitleContent, aiEnhancementStatus } = require('./lib/subtitleMatcher');
const { streamEnricher } = require('./lib/streamEnricher');
const { generateRealDebridStreams, generateSampleRealDebridStreams } = require('./lib/realDebridSearch');
const { initializeStreamingProviders } = require('./lib/streamingProviderManager');
const { setupUIRoutes } = require('./ui-api');

console.log("Starting Stremio AI Subtitle Addon v2.9.1 with Beautiful UI...");

// Initialize streaming providers with MediaFusion-inspired architecture
const streamingConfig = {
    realdebrid: {
        apiKey: process.env.REAL_DEBRID_API_KEY,
        userIP: process.env.USER_IP || null
    },
    alldebrid: {
        apiKey: process.env.ALL_DEBRID_API_KEY,
        userIP: process.env.USER_IP || null
    }
};

const streamingManager = initializeStreamingProviders(streamingConfig);
console.log("✅ Streaming providers initialized with MediaFusion architecture");

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
    'ALL_DEBRID_API_KEY',
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
if (!process.env.ALL_DEBRID_API_KEY) {
    console.log("  To get ALL_DEBRID_API_KEY: Visit https://alldebrid.com/api/ and get an API key");
}

console.log("\n🎨 Beautiful UI will be available at: http://localhost:7000/ui");
console.log("📊 Advanced health monitoring and settings included!");

const manifest = {
    id: "com.stremio.ai.subtitle.corrector.tr.final",
    version: "2.9.5",
    name: "AI Subtitle Corrector (TR) + Multi-Debrid Enhanced",
    description: "Provides AI-corrected Turkish subtitles with hash matching, multiple sources, enhanced Real-Debrid & AllDebrid cached streams with MediaFusion architecture, and stream provision for reliable hash access.",
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
        stream: ["movie", "series"] // For reliable hash-based subtitle matching + Enhanced Multi-Debrid cached streams
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
    
    // PRIORITY 1: Enhanced Real-Debrid cached streams with MediaFusion architecture
    if (process.env.REAL_DEBRID_API_KEY && movieId.startsWith('tt')) {
        console.log(`[Handler] Searching Real-Debrid with enhanced MediaFusion architecture...`);
        try {
            // Use enhanced streaming provider manager
            const cachedSearch = await streamingManager.searchCachedContent(movieId, {
                type: 'movie',
                maxResults: 20
            });
            
            if (cachedSearch.success && cachedSearch.totalResults > 0) {
                console.log(`[Handler] Found ${cachedSearch.totalResults} cached results across providers`);
                
                // Convert cached search results to stream format
                for (const providerResult of cachedSearch.providers) {
                    if (providerResult.success && providerResult.results.length > 0) {
                        for (const result of providerResult.results) {
                            // Enrich stream with MediaFusion patterns
                            const enrichedStream = await streamEnricher.enrichStream(result, {
                                preferredProvider: providerResult.provider,
                                includeSubtitles: true
                            });
                            
                            streams.push({
                                title: `🎬 ${enrichedStream.filename || result.filename} [${enrichedStream.quality?.resolution || 'Unknown'}]`,
                                url: enrichedStream.streaming?.streamUrl || `magnet:?xt=urn:btih:${result.hash}`,
                                quality: enrichedStream.quality?.resolution || 'Unknown',
                                seeds: 100,
                                peers: 50,
                                behaviorHints: {
                                    notWebReady: !enrichedStream.streaming?.streamUrl,
                                    realDebrid: true,
                                    cached: enrichedStream.streaming?.cached || false,
                                    provider: enrichedStream.streaming?.provider || 'real-debrid'
                                },
                                infoHash: result.hash || result.id,
                                filesize: enrichedStream.size || result.size,
                                metadata: enrichedStream.metadata
                            });
                        }
                    }
                }
            } else {
                console.log(`[Handler] No cached streams found, using fallback Real-Debrid search`);
                // Fallback to original Real-Debrid search
                const rdStreams = await generateRealDebridStreams(movieId, 'movie');
                if (rdStreams && rdStreams.length > 0) {
                    console.log(`[Handler] Found ${rdStreams.length} Real-Debrid fallback streams`);
                    // Enrich fallback streams
                    const enrichedFallback = await streamEnricher.enrichStreams(rdStreams, {
                        preferredProvider: 'realdebrid'
                    });
                    streams.push(...enrichedFallback);
                } else {
                    console.log(`[Handler] No Real-Debrid streams found, using samples`);
                    // Add sample Real-Debrid streams for demonstration
                    const sampleRdStreams = generateSampleRealDebridStreams(movieId);
                    const enrichedSamples = await streamEnricher.enrichStreams(sampleRdStreams, {
                        preferredProvider: 'realdebrid'
                    });
                    streams.push(...enrichedSamples);
                }
            }
        } catch (e) {
            console.error(`[Handler] Enhanced Real-Debrid search error:`, e);
            
            // Fallback to original implementation
            try {
                const rdStreams = await generateRealDebridStreams(movieId, 'movie');
                if (rdStreams && rdStreams.length > 0) {
                    console.log(`[Handler] Fallback: Found ${rdStreams.length} Real-Debrid streams`);
                    streams.push(...rdStreams);
                }
            } catch (fallbackError) {
                console.error(`[Handler] Fallback Real-Debrid search also failed:`, fallbackError);
            }
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
                realdebrid: !!process.env.REAL_DEBRID_API_KEY
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
    } catch (error) {
        res.status(500).json({
            enabled: false,
            message: error.message
        });
    }
});

app.listen(port, () => {
    console.log(`\n🚀 Stremio AI Subtitle & Enhanced Real-Debrid Addon is running!`);
    console.log(`📍 Main URL: http://0.0.0.0:${port}`);
    console.log(`🎨 Beautiful UI: http://0.0.0.0:${port}/ui`);
    console.log(`📋 Manifest: http://0.0.0.0:${port}/manifest.json`);
    console.log(`💚 Health: http://0.0.0.0:${port}/health`);
    console.log(`⚙️  Configure: http://0.0.0.0:${port}/configure`);
    console.log(`📝 Subtitle .srt: http://0.0.0.0:${port}/subtitles/:videoId/:language.srt`);
    console.log(`\n🔧 Enhanced API Endpoints:`);
    console.log(`   • /api/health - Comprehensive health monitoring`);
    console.log(`   • /api/providers/status - Provider cache statistics`);
    console.log(`   • /api/providers/health - Provider health check`);
    console.log(`   • /api/search/cached - Search cached content`);
    console.log(`   • /api/streams/enrich - Stream enrichment service`);
    console.log(`   • /api/health/alldebrid - AllDebrid health check`);
    console.log(`   • /api/alldebrid/status - AllDebrid status`);
    console.log(`\n✨ Features available:`);
    console.log(`   • AI-powered subtitle correction with Google Gemini`);
    console.log(`   • Enhanced Real-Debrid with MediaFusion architecture`);
    console.log(`   • Advanced stream enrichment and quality detection`);
    console.log(`   • Multi-provider streaming with fallback support`);
    console.log(`   • Comprehensive health monitoring & performance metrics`);
    console.log(`   • Beautiful modern UI with comprehensive settings`);
    console.log(`   • Real-time system status & error tracking`);
    console.log(`\n🔗 Open http://localhost:${port}/ui to access the control panel!`);
});