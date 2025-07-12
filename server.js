// server.js
// --- FINAL STABLE VERSION v2.2.0 ---

const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const { getAICorrectedSubtitle, getSubtitleUrlsForStremio } = require('./lib/subtitleMatcher');

console.log("Starting Stremio AI Subtitle Addon v2.2.0...");

// --- 1. MANIFEST ---
const manifest = {
    "id": "com.stremio.ai.subtitle.corrector.tr.final.v6", // Incremented ID for fresh install
    "version": "2.2.0",
    "name": "AI Subtitle Corrector (TR)",
    "description": "Provides AI-corrected Turkish subtitles from multiple sources with sync correction.",
    "resources": ["subtitles"],
    "types": ["movie", "series"],
    "catalogs": [],
    "idPrefixes": ["tt", "tmdb"]
};

const builder = new addonBuilder(manifest);

// --- 2. SUBTITLE HANDLER ---
builder.defineSubtitlesHandler(async (args) => {
    console.log(`[Handler] Subtitle request received for: ${args.id}`);
    try {
        const result = await getSubtitleUrlsForStremio(args.id);
        if (result && result.subtitles && result.subtitles.length > 0) {
            console.log(`[Handler] Successfully generated ${result.subtitles.length} subtitle option(s).`);
        } else {
            console.warn(`[Handler] No subtitle options were generated for ${args.id}.`);
        }
        return Promise.resolve(result);
    } catch (error) {
        console.error("[Handler] CRITICAL ERROR in subtitle handler:", error);
        return Promise.resolve({ subtitles: [] });
    }
});

// --- 3. SERVER LOGIC ---
const port = process.env.PORT || 7000;

const publicUrl = process.env.HEROKU_APP_NAME
    ? `https://${process.env.HEROKU_APP_NAME}.herokuapp.com`
    : `http://127.0.0.1:${port}`;

// The 'serveHTTP' function can handle custom routes with its 'get' option.
// We will use this to serve the .srt files instead of creating a separate express server.
serveHTTP(builder.getInterface(), {
    port: port,
    // This 'get' function is our router for custom endpoints.
    get: (req, res, next) => {
        // This regex will match requests like "/subtitles/tt12345/tr.srt"
        const match = req.url.match(/^\/subtitles\/(.*)\/(.*)\.srt$/);

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
                        res.writeHead(404, { 'Content-Type': 'text/plain' });
                        res.end('Could not generate corrected subtitle.');
                    }
                })
                .catch(err => {
                    console.error("[Endpoint] CRITICAL ERROR:", err);
                    res.writeHead(500, { 'Content-Type': 'text/plain' });
                    res.end('Internal server error.');
                });
        } else {
            // If the URL doesn't match our custom endpoint, let the SDK handle it.
            next();
        }
    }
}).then(({ url }) => {
    console.log(`Addon running at: ${url}`);
    console.log(`Publicly accessible at: ${publicUrl}/manifest.json`);
}).catch(err => {
    console.error("Failed to start server:", err);
});
