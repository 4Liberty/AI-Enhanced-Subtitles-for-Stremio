// server.js
// --- FINAL STABLE VERSION v2.0.0 ---

const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const { getAICorrectedSubtitle, getSubtitleUrlsForStremio } = require('./lib/subtitleMatcher');

console.log("Starting Stremio AI Subtitle Addon v2.0.0...");

// --- 1. MANIFEST ---
// Defines the addon's capabilities for Stremio.
const manifest = {
    "id": "com.stremio.ai.subtitle.corrector.tr.final.v4", // A new ID to guarantee a fresh install
    "version": "2.0.0",
    "name": "AI Subtitle Corrector (TR)",
    "description": "Provides AI-corrected Turkish subtitles.",
    "resources": ["subtitles"], // We ONLY provide subtitles
    "types": ["movie", "series"],
    "catalogs": [],
    "idPrefixes": ["tt", "tmdb"] // We can handle both IMDb and TMDb IDs
};

const builder = new addonBuilder(manifest);

// --- 2. SUBTITLE HANDLER ---
// This is the only handler Stremio will call for your addon.
builder.defineSubtitlesHandler(async (args) => {
    console.log(`[Handler] Subtitle request received for ID: ${args.id}`);
    try {
        const result = await getSubtitleUrlsForStremio(args.id);
        if (result && result.subtitles && result.subtitles.length > 0) {
            console.log(`[Handler] Successfully generated ${result.subtitles.length} subtitle option(s).`);
        } else {
            console.warn(`[Handler] No subtitle options were generated for ${args.id}.`);
        }
        return result;
    } catch (error) {
        console.error("[Handler] CRITICAL ERROR in subtitle handler:", error);
        return { subtitles: [] }; // Always return a valid object
    }
});

// --- 3. SERVER LOGIC ---
// This is the standard, Heroku-compatible way to run a Stremio addon.
const port = process.env.PORT || 7000;

serveHTTP(builder.getInterface(), {
    port: port,
    // We add a custom endpoint to serve our dynamically generated .srt files.
    get: (req, res, next) => {
        // This regex will match requests like "/subtitles/tt12345/tr.srt"
        const match = req.path.match(/^\/subtitles\/(.*)\/(.*)\.srt$/);
        if (match) {
            const videoId = match[1];
            const language = match[2];

            console.log(`[Endpoint] Request to serve corrected subtitle for ID: ${videoId}`);
            
            getAICorrectedSubtitle(videoId, language)
                .then(correctedContent => {
                    if (correctedContent) {
                        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
                        res.end(correctedContent);
                    } else {
                        res.statusCode = 404;
                        res.end('Could not generate corrected subtitle.');
                    }
                })
                .catch(err => {
                    console.error("[Endpoint] CRITICAL ERROR:", err);
                    res.statusCode = 500;
                    res.end('Internal server error.');
                });
        } else {
            // If the URL doesn't match our custom endpoint, let the SDK handle it.
            next();
        }
    }
}).then(({ url }) => {
    console.log(`Addon is running and accessible at: ${url}`);
});
