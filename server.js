// server.js
// --- FINAL CORRECTED VERSION v1.7.0 ---

const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const { getAICorrectedSubtitle, getSubtitleUrlsForStremio } = require('./lib/subtitleMatcher');

console.log("Starting Final Addon Server v1.7.0...");

const manifest = {
    "id": "com.stremio.ai.subtitle.corrector.tr.v3", // Final new ID
    "version": "1.7.0",
    "name": "AI Subtitle Corrector (TR)",
    "description": "Provides AI-corrected Turkish subtitles.",
    "resources": ["subtitles"],
    "types": ["movie", "series"],
    "catalogs": [],
    "idPrefixes": ["tt", "tmdb"]
};

const builder = new addonBuilder(manifest);

builder.defineSubtitlesHandler(async (args) => {
    console.log(`[Handler] Subtitle request for ID: ${args.id}`);
    try {
        const result = await getSubtitleUrlsForStremio(args.id);
        return result;
    } catch (error) {
        console.error("[Handler] Error in subtitle handler:", error);
        return { subtitles: [] };
    }
});

const addonInterface = builder.getInterface();

// This is the correct way to start the server and handle custom routes.
serveHTTP(addonInterface, {
    port: process.env.PORT || 7000,
    // Define a custom route for our AI subtitle files.
    get: (req, res, next) => {
        const match = req.path.match(/^\/subtitles\/([^\/]+)\/([^\/]+?)\.srt$/);
        if (match) {
            const videoId = match[1];
            const language = match[2];
            console.log(`[Endpoint] AI Subtitle request hit. Video ID: ${videoId}`);
            getAICorrectedSubtitle(videoId, language).then(corrected => {
                if (corrected) {
                    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
                    res.end(corrected);
                } else {
                    res.statusCode = 404;
                    res.end('Subtitle could not be generated.');
                }
            }).catch(err => {
                console.error("[Endpoint] CRITICAL ERROR:", err);
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
