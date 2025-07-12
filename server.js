// server.js
// --- FINAL CORRECTED VERSION v2.3.0 ---

const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const path = require('path');
const { getAICorrectedSubtitle, getSubtitleUrlsForStremio } = require('./lib/subtitleMatcher');

console.log("Starting Stremio AI Subtitle Addon v2.3.0...");

const manifest = {
    "id": "com.stremio.ai.subtitle.corrector.tr.final",
    "version": "2.3.0",
    "name": "AI Subtitle Corrector (TR)",
    "description": "Provides AI-corrected Turkish subtitles with a full customization UI and hash-matching.",
    "resources": ["subtitles"],
    "types": ["movie", "series"],
    "idPrefixes": ["tt", "tmdb"],
    // Add a configuration link to the manifest
    "behaviorHints": {
        "configurable": true
    }
};

const builder = new addonBuilder(manifest);

// This handler provides the list of available subtitles to Stremio
builder.defineSubtitlesHandler(async (args) => {
    console.log(`[Handler] Subtitle request received for: ${args.id}`);
    try {
        // Pass the infoHash from the arguments if it exists
        const infoHash = args.extra && args.extra.video_hash ? args.extra.video_hash : null;
        const result = await getSubtitleUrlsForStremio(args.id, infoHash);
        
        if (result && result.subtitles && result.subtitles.length > 0) {
            console.log(`[Handler] Successfully generated ${result.subtitles.length} subtitle option(s).`);
        }
        return Promise.resolve(result);
    } catch (error) {
        console.error("[Handler] Error in subtitle handler:", error);
        return Promise.resolve({ subtitles: [] });
    }
});

const addonInterface = builder.getInterface();

// Use serveHTTP with custom route handling for serving the actual subtitle files
serveHTTP(addonInterface, {
    port: process.env.PORT || 7000,
    // Serve the 'configure.html' page from the root directory
    static: [path.join(__dirname, '/')], 
    
    // Custom route to handle the delivery of AI-corrected .srt files
    get: (req, res, next) => {
        // This regex will match requests like /subtitles/tt12345/tr.srt
        const match = req.path.match(/^\/subtitles\/([^\/]+)\/([^\/]+?)\.srt$/);

        if (match) {
            const videoId = match[1];
            const language = match[2];
            console.log(`[Endpoint] AI Subtitle file request hit. Video ID: ${videoId}, Lang: ${language}`);

            getAICorrectedSubtitle(videoId, language)
                .then(correctedContent => {
                    if (correctedContent) {
                        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
                        res.end(correctedContent);
                    } else {
                        console.error(`[Endpoint] Subtitle generation failed for ${videoId}`);
                        res.statusCode = 404;
                        res.end('Subtitle could not be generated.');
                    }
                })
                .catch(err => {
                    console.error("[Endpoint] CRITICAL ERROR while getting AI subtitle:", err);
                    res.statusCode = 500;
                    res.end('Internal server error.');
                });
        } else {
            // If the path doesn't match, let the SDK handle it (for /manifest.json etc.)
            next();
        }
    }

}).then(({ url }) => {
    console.log(`Addon running at: ${url}`);
    // The configuration page is now at the root URL
    console.log(`Configuration page available at the root URL or by clicking 'Configure' in Stremio.`);
});
