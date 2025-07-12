// server.js
// --- FINAL CORRECTED VERSION v1.5.0 ---

const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const { getAICorrectedSubtitle, getSubtitleUrlsForStremio } = require('./lib/subtitleMatcher');

console.log("Starting Final Corrected Addon Server...");

// --- MANIFEST ---
// This defines what your addon does.
const manifest = {
    "id": "com.stremio.ai.subtitle.corrector.tr.final.v2", // New ID to guarantee no caching issues
    "version": "1.5.0",
    "name": "AI Subtitle Corrector (TR)",
    "description": "Provides AI-corrected Turkish subtitles.",
    "resources": ["subtitles"],
    "types": ["movie", "series"],
    "catalogs": [],
    "idPrefixes": ["tt", "tmdb"],
    "behaviorHints": {
        "configurable": false,
        "configurationRequired": false
    }
};

const builder = new addonBuilder(manifest);

// --- HANDLERS ---
// This is the only handler that Stremio will call.
builder.defineSubtitlesHandler(async (args) => {
    console.log(`[Handler] Subtitle request received for ID: ${args.id}`);
    try {
        const result = await getSubtitleUrlsForStremio(args.id);
        console.log(`[Handler] Generated ${result.subtitles.length} subtitle option(s).`);
        return result;
    } catch (error) {
        console.error("[Handler] CRITICAL ERROR in subtitle handler:", error);
        return { subtitles: [] };
    }
});

// --- SERVER START ---
// This is the standard way to run a Stremio addon server.
const port = process.env.PORT || 7000;

serveHTTP(builder.getInterface(), {
    port: port,
    // We add a custom endpoint for our AI subtitle files.
    get: (req, res, next) => {
        if (req.path.startsWith('/subtitles/')) {
            const parts = req.path.split('/');
            const videoId = parts[2];
            const language = parts[3].replace('.srt', '');

            console.log(`[Endpoint] AI Subtitle request hit. Video ID: ${videoId}`);
            getAICorrectedSubtitle(videoId, language).then(corrected => {
                if (corrected) {
                    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
                    res.end(corrected);
                } else {
                    res.statusCode = 404;
                    res.end('Could not generate corrected subtitle.');
                }
            }).catch(err => {
                console.error("[Endpoint] CRITICAL ERROR in AI endpoint:", err);
                res.statusCode = 500;
                res.end('Internal server error.');
            });
        } else {
            // Let the SDK handle other requests (like /manifest.json)
            next();
        }
    }
}).then(({ url }) => {
    console.log(`Addon is running at: ${url}`);
});
