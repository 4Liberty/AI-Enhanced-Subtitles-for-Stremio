// server.js
// --- FINAL CORRECTED VERSION v2.7.0 ---

const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const path = require('path');
const fs = require('fs');
const { getAICorrectedSubtitle, getSubtitleUrlsForStremio } = require('./lib/subtitleMatcher');

console.log("Starting Stremio AI Subtitle Addon v2.7.0...");

const manifest = {
    "id": "com.stremio.ai.subtitle.corrector.tr.final",
    "version": "2.7.0",
    "name": "AI Subtitle Corrector (TR)",
    "description": "Provides AI-corrected Turkish subtitles with a full customization UI and hash-matching.",
    "resources": ["subtitles"],
    "types": ["movie", "series"],
    "idPrefixes": ["tt", "tmdb"],
    "catalogs": [],
    "behaviorHints": {
        // This tells Stremio that the addon has a configuration page.
        "configurable": true 
    }
};

const builder = new addonBuilder(manifest);

builder.defineSubtitlesHandler(async (args) => {
    console.log(`[Handler] Subtitle request received for: ${args.id}`);
    try {
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

// Use serveHTTP with custom route handling
serveHTTP(addonInterface, {
    port: process.env.PORT || 7000,
    
    // This 'get' function allows us to define custom routes.
    get: (req, res, next) => {
        // Route for the configuration page
        if (req.path === '/configure' || req.path === '/') {
            res.setHeader('Content-Type', 'text/html');
            fs.createReadStream(path.join(__dirname, 'configure.html')).pipe(res);
            return;
        }

        // Route for serving the actual .srt subtitle files
        const srtMatch = req.path.match(/^\/subtitles\/([^\/]+)\/([^\/]+?)\.srt$/);
        if (srtMatch) {
            const videoId = srtMatch[1];
            const language = srtMatch[2];
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
            return;
        }

        // If no custom route matches, pass the request to the SDK's default handler.
        // This is crucial for serving the /manifest.json file.
        next();
    }
}).then(({ url }) => {
    console.log(`Addon running at: ${url}`);
    // The manifest will now correctly point Stremio to the /configure path.
    console.log(`Configuration page available at: ${url}/configure`);
});
