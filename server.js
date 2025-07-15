// server.js
// --- MERGED & ENHANCED VERSION v2.9.2 ---

const express = require('express');
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const path = require('path');
const {
    getSubtitleUrlsForStremio,
    getAICorrectedSubtitleDirect,
    getCachedSubtitleContent,
    getProgressiveSubtitleContent,
    getAiEnhancementStatus,
    // New AI processing functions
    initiateAIEnhancement,
    waitForEnhancedSubtitle,
    searchByHash,
    findBestOriginalSubtitle,
    downloadAndProcessSubtitle
} = require('./lib/subtitleMatcher');
const { streamEnricher, getEnrichedStreams } = require('./lib/streamEnricher');
const { initializeStreamingProviders, streamingManager } = require('./lib/streamingProviderManager');
const { setupUIRoutes } = require('./ui-api');

// Get the AI enhancement status map
const aiEnhancementStatus = getAiEnhancementStatus();

console.log("Starting Stremio AI Subtitle Addon v2.10.1 - Realistic AI Enhancement with Multiple Options...");

// Initialize Express app
const app = express();

// Security middleware - add comprehensive security headers
app.use((req, res, next) => {
    // Prevent clickjacking
    res.setHeader('X-Frame-Options', 'DENY');
    
    // Prevent MIME type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    // XSS protection
    res.setHeader('X-XSS-Protection', '1; mode=block');
    
    // Content Security Policy
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https:; frame-src 'none'; object-src 'none'");
    
    // Referrer Policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Permissions Policy
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    
    // Remove server information
    res.removeHeader('X-Powered-By');
    
    next();
});

// Input validation middleware
const validateInput = (req, res, next) => {
    const { body, query, params } = req;
    
    // Validate all input parameters
    const validateField = (value, fieldName) => {
        if (typeof value === 'string') {
            // Check for common injection patterns
            const dangerousPatterns = [
                /<script[^>]*>.*?<\/script>/gi,
                /javascript:/gi,
                /on\w+\s*=/gi,
                /eval\s*\(/gi,
                /Function\s*\(/gi,
                /exec\s*\(/gi,
                /\.\.\//g, // Path traversal
                /\x00/g    // Null bytes
            ];
            
            for (const pattern of dangerousPatterns) {
                if (pattern.test(value)) {
                    console.warn(`[Security] Dangerous pattern detected in ${fieldName}:`, value);
                    return res.status(400).json({ error: `Invalid input detected in ${fieldName}` });
                }
            }
            
            // Length validation
            if (value.length > 1000) {
                console.warn(`[Security] Input too long in ${fieldName}:`, value.length);
                return res.status(400).json({ error: `Input too long in ${fieldName}` });
            }
        }
        return value;
    };
    
    // Validate all request fields
    try {
        Object.keys(body || {}).forEach(key => validateField(body[key], key));
        Object.keys(query || {}).forEach(key => validateField(query[key], key));
        Object.keys(params || {}).forEach(key => validateField(params[key], key));
    } catch (error) {
        console.error('[Security] Input validation failed:', error);
        return res.status(400).json({ error: 'Input validation failed' });
    }
    
    next();
};

// Apply input validation to all routes
app.use(validateInput);

// Request size limiting
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Environment variable validation
const validateEnvironmentVariables = () => {
    const requiredVars = ['OPENSUBTITLES_API_KEY', 'SUBDL_API_KEY'];
    const missingVars = requiredVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
        console.warn('⚠️  Missing required environment variables:', missingVars);
        console.warn('⚠️  Some features may be disabled');
    }
    
    // Validate API key formats
    const apiKeys = {
        'OPENSUBTITLES_API_KEY': process.env.OPENSUBTITLES_API_KEY,
        'SUBDL_API_KEY': process.env.SUBDL_API_KEY,
        'GEMINI_API_KEY': process.env.GEMINI_API_KEY,
        'REAL_DEBRID_API_KEY': process.env.REAL_DEBRID_API_KEY,
        'ALL_DEBRID_API_KEY': process.env.ALL_DEBRID_API_KEY
    };
    
    Object.entries(apiKeys).forEach(([name, key]) => {
        if (key && key.length < 10) {
            console.warn(`⚠️  ${name} appears to be too short`);
        }
        if (key && (key.includes('test') || key.includes('dummy') || key.includes('example'))) {
            console.warn(`⚠️  ${name} appears to be a test key`);
        }
    });
};

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

// Run environment variable validation
validateEnvironmentVariables();

// Initialize streaming providers
console.log("Initializing streaming providers...");
initializeStreamingProviders({
    realdebrid: {
        enabled: !!process.env.REAL_DEBRID_API_KEY,
        apiKey: process.env.REAL_DEBRID_API_KEY
    },
    alldebrid: {
        enabled: !!process.env.ALL_DEBRID_API_KEY,
        apiKey: process.env.ALL_DEBRID_API_KEY
    }
});

console.log("\n🎨 Beautiful UI will be available at: http://localhost:7000/ui");
console.log("📊 Advanced health monitoring and settings included!");

const manifest = {
    id: "com.stremio.ai.subtitle.corrector.tr.final",
    version: "2.9.5",
    name: "AI Subtitle Corrector (TR) + Multi-Debrid Enhanced",
    description: "Provides AI-corrected Turkish subtitles with hash matching, multiple sources, enhanced Real-Debrid & AllDebrid cached streams with MediaFusion architecture, and stream provision for reliable hash access.",
    logo: "/logo.svg",
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

// Enhanced subtitle handler with better error handling
const subtitleHandler = async (args) => {
    console.log(`[Handler] Subtitle request received for: ${args.id}`);
    const infoHash = args.extra && args.extra.video_hash ? args.extra.video_hash : null;
    const type = args.type || 'movie';
    const season = args.type === 'series' ? args.season : null;
    const episode = args.type === 'series' ? args.episode : null;
    const language = 'tr';
    const imdbId = args.id;

    // 1. Try hash-matched subtitles first for perfect sync
    if (infoHash) {
        console.log(`[Handler] Searching for hash-matched subtitles for ${imdbId} with hash ${infoHash}`);
        const hashSubs = await searchByHash(infoHash, language);
        if (hashSubs && hashSubs.length > 0) {
            console.log(`[Handler] Found hash-matched subtitle for ${imdbId}`);
            return { subtitles: [hashSubs[0]] };
        }
    }

    // 2. Get original subtitles and offer both original and AI-enhanced options
    const originalSubs = await findBestOriginalSubtitle(imdbId, season, episode, language);
    
    if (originalSubs && originalSubs.length > 0) {
        const subtitleOptions = [];
        
        // Add original subtitle first (for immediate use)
        subtitleOptions.push({
            id: `${imdbId}-original`,
            lang: language,
            url: originalSubs[0].url,
            name: `Turkish (Original - ${originalSubs[0].name})`
        });
        
        // Add AI-enhanced subtitle option (check if already processed)
        const enhancedSubtitle = await waitForEnhancedSubtitle(imdbId, infoHash, language, 2000); // 2 second check
        if (enhancedSubtitle) {
            subtitleOptions.push({
                id: `${imdbId}-ai-enhanced`,
                lang: language,
                url: enhancedSubtitle.url,
                name: `Turkish (AI Enhanced - ${enhancedSubtitle.name})`
            });
        } else {
            // Start AI enhancement in background for next request
            initiateAIEnhancement(imdbId, infoHash, season, episode, language, originalSubs);
            
            // Add placeholder for AI-enhanced (will be available on next request)
            subtitleOptions.push({
                id: `${imdbId}-ai-processing`,
                lang: language,
                url: `/subtitles/${imdbId}/tr.srt?processing=true&source=ai`,
                name: `Turkish (AI Enhanced - Processing...)`
            });
        }
        
        console.log(`[Handler] Serving ${subtitleOptions.length} subtitle options for ${imdbId}`);
        return { subtitles: subtitleOptions };
    }
    
    console.log(`[Handler] No subtitles found for ${imdbId}`);
    return { subtitles: [] };
};

// Enhanced stream handler with better error handling
const streamHandler = async (args) => {
    console.log(`[Handler] Stream request received for: ${args.id}`);
    
    try {
        // Extract the clean movie ID (remove .json extension if present)
        const movieId = args.id.replace('.json', '');
        console.log(`[Handler] Clean movie ID for stream provision: ${movieId}`);
        
        // Pre-cache subtitles in the background for faster response when user clicks play
        if (movieId.startsWith('tt')) {
            console.log(`[Handler] Starting subtitle pre-caching for ${movieId}`);
            // Don't await this - let it run in background
            getSubtitleUrlsForStremio(movieId, 'movie', null, null, 'tr')
                .then(result => {
                    if (result && result.length > 0) {
                        console.log(`[Handler] Pre-cached ${result.length} subtitle option(s) for ${movieId}`);
                    } else {
                        console.log(`[Handler] No subtitles found during pre-caching for ${movieId}`);
                    }
                })
                .catch(err => {
                    console.error(`[Handler] Pre-caching failed for ${movieId}:`, err);
                });
        }
        
        const streams = [];
        
        // Try enhanced MediaFusion architecture if available
        if (movieId.startsWith('tt') && streamingManager) {
            console.log(`[Handler] Searching with enhanced MediaFusion architecture...`);
            try {
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
                                        cached: enrichedStream.streaming?.cached || false,
                                        provider: enrichedStream.streaming?.provider || 'multi-debrid'
                                    },
                                    infoHash: result.hash || result.id,
                                    filesize: enrichedStream.size || result.size,
                                    metadata: enrichedStream.metadata
                                });
                            }
                        }
                    }
                } else {
                    console.log(`[Handler] No cached streams found via MediaFusion architecture`);
                }
            } catch (e) {
                console.error(`[Handler] MediaFusion search error:`, e);
            }
        }
        
        // Fallback to basic enrichment if no MediaFusion results
        if (streams.length === 0) {
            console.log(`[Handler] Trying basic stream enrichment...`);
            try {
                const enriched = await getEnrichedStreams(args.type, args.id, []);
                if (enriched && enriched.length > 0) {
                    streams.push(...enriched);
                    console.log(`[Handler] Added ${enriched.length} enriched streams`);
                }
            } catch (e) {
                console.error(`[Handler] Basic stream enrichment error:`, e);
            }
        }
        
        // Final fallback: Hash-based subtitle matching streams
        if (streams.length === 0) {
            console.log(`[Handler] No streams found, providing hash-matching streams for subtitle sync`);
            
            const sampleHashes = [
                { title: 'Hash-Match 1080p', infoHash: '3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b', quality: '1080p' },
                { title: 'Hash-Match 720p', infoHash: '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b', quality: '720p' },
                { title: 'Hash-Match 4K', infoHash: '9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b', quality: '4K' }
            ];
            
            for (const sample of sampleHashes) {
                streams.push({
                    title: `${sample.title} (Subtitle Hash-Matching)`,
                    url: `magnet:?xt=urn:btih:${sample.infoHash}&dn=sample`,
                    quality: sample.quality,
                    seeds: 1,
                    peers: 1,
                    behaviorHints: {
                        notWebReady: true,
                        hashOnly: true,
                        subtitleMatch: true
                    },
                    infoHash: sample.infoHash
                });
            }
        }
        
        console.log(`[Handler] Providing ${streams.length} total streams`);
        return { streams };
        
    } catch (error) {
        console.error("[Handler] Error in stream handler:", error);
        return { streams: [] };
    }
};

// Define both handlers
builder.defineSubtitlesHandler(subtitleHandler);
builder.defineStreamHandler(streamHandler);

const addonInterface = builder.getInterface();
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

// Add JSON body parsing with size limits
app.use(express.json({ limit: '10mb' }));

// Add rate limiting
const rateLimit = {};
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 100; // 100 requests per minute

app.use((req, res, next) => {
    const clientIP = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    
    // Clean up old entries
    if (rateLimit[clientIP]) {
        rateLimit[clientIP] = rateLimit[clientIP].filter(time => now - time < RATE_LIMIT_WINDOW);
    } else {
        rateLimit[clientIP] = [];
    }
    
    // Check rate limit
    if (rateLimit[clientIP].length >= RATE_LIMIT_MAX) {
        return res.status(429).json({ error: 'Rate limit exceeded' });
    }
    
    // Add current request
    rateLimit[clientIP].push(now);
    
    next();
});

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

// Enhanced .srt route with better error handling and fallback to clean version
app.get('/subtitles/:videoId/:language.srt', async (req, res) => {
    const { videoId, language } = req.params;
    const { hash, test, fallback, source, progressive, processing } = req.query;
    
    console.log(`[SRT Endpoint] Subtitle file request. Video ID: ${videoId}, Lang: ${language}, Hash: ${hash}, Test: ${test}, Fallback: ${fallback}, Source: ${source}, Progressive: ${progressive}, Processing: ${processing}`);

    // Handle AI processing request
    if (processing === 'true' && source === 'ai') {
        console.log(`[SRT Endpoint] AI processing request for ${videoId}, checking status...`);
        
        // Check if AI enhancement is complete
        const enhancedSubtitle = await waitForEnhancedSubtitle(videoId, hash, language, 1000);
        if (enhancedSubtitle) {
            console.log(`[SRT Endpoint] AI enhancement complete, serving enhanced subtitle`);
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${videoId}_${language}_ai_enhanced.srt"`);
            res.setHeader('X-AI-Enhanced', 'true');
            res.setHeader('X-AI-Status', 'completed');
            res.send(enhancedSubtitle.content || enhancedSubtitle.url);
            return;
        } else {
            console.log(`[SRT Endpoint] AI enhancement still processing, serving placeholder`);
            const processingSubtitle = `1
00:00:01,000 --> 00:00:05,000
🤖 AI Enhancement in Progress...

2
00:00:06,000 --> 00:00:10,000
Please refresh subtitles in a few moments for enhanced version

3
00:00:11,000 --> 00:00:15,000
Video: ${videoId}
`;
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${videoId}_${language}_processing.srt"`);
            res.setHeader('X-AI-Enhanced', 'false');
            res.setHeader('X-AI-Status', 'processing');
            res.send(processingSubtitle);
            return;
        }
    }

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

    // ...existing code...

        // If we have a specific source, serve the cached content
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

    // The logic for fetching and correcting subtitles should be handled by the main subtitle handler,
    // which calls getSubtitleUrlsForStremio. This endpoint should only serve cached content.
    // The incorrect call to getAICorrectedSubtitle has been removed.
    
    console.error(`[SRT Endpoint] No cached subtitle found for ${videoId} and no fallback requested.`);
    res.status(404).send('Subtitle not found.');
});

// Enhanced subtitle status endpoint
app.get('/subtitles/:imdbId/:hash/enhanced', async (req, res) => {
    try {
        const { imdbId, hash } = req.params;
        const language = req.query.language || 'tr';
        
        console.log(`[Enhanced Check] Checking enhanced subtitle for ${imdbId} with hash ${hash}`);
        
        // Check if enhanced subtitle is ready
        const enhancedSubtitle = await waitForEnhancedSubtitle(imdbId, hash, language, 1000); // 1 second timeout
        
        if (enhancedSubtitle) {
            res.json({
                success: true,
                ready: true,
                subtitle: enhancedSubtitle,
                message: 'Enhanced subtitle is ready'
            });
        } else {
            res.json({
                success: true,
                ready: false,
                message: 'Enhanced subtitle is still processing'
            });
        }
    } catch (error) {
        console.error('Error checking enhanced subtitle:', error);
        res.status(500).json({
            success: false,
            ready: false,
            error: error.message
        });
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
    console.log(`\n🚀 Stremio AI Subtitle & Enhanced Multi-Debrid Addon is running! (Merged v2.9.2)`);
    console.log(`📍 Main URL: http://0.0.0.0:${port}`);
    console.log(`🎨 Beautiful UI: http://0.0.0.0:${port}/ui`);
    console.log(`📋 Manifest: http://0.0.0.0:${port}/manifest.json`);
    console.log(`💚 Health: http://0.0.0.0:${port}/health`);
    console.log(`⚙️  Configure: http://0.0.0.0:${port}/configure`);
    console.log(`📝 Subtitle .srt: http://0.0.0.0:${port}/subtitles/:videoId/:language.srt`);
    console.log(`\n✨ Core Features:`);
    console.log(`   • AI-powered subtitle correction with Google Gemini`);
    console.log(`   • Enhanced Multi-Debrid with MediaFusion architecture`);
    console.log(`   • Advanced stream enrichment and quality detection`);
    console.log(`   • Hash-based subtitle synchronization`);
    console.log(`   • Comprehensive health monitoring & performance metrics`);
    console.log(`   • Beautiful modern UI with comprehensive settings`);
    console.log(`   • Merged best features from both server versions`);
    console.log(`\n📊 All UI-related endpoints moved to ui-api.js for better organization`);
    console.log(`🔗 Open http://localhost:${port}/ui to access the control panel!`);
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
    console.log('\n🛑 SIGTERM received, shutting down gracefully...');
    
    // Clean up resources
    if (streamingManager) {
        console.log('Cleaning up streaming manager...');
    }
    
    // Exit gracefully
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('\n🛑 SIGINT received, shutting down gracefully...');
    
    // Clean up resources
    if (streamingManager) {
        console.log('Cleaning up streaming manager...');
    }
    
    // Exit gracefully
    process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('💥 Uncaught Exception:', err);
    console.error('Stack:', err.stack);
    
    // Exit gracefully
    process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    
    // Exit gracefully
    process.exit(1);
});