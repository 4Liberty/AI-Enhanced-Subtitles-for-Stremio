// server.js
// --- FINAL CORRECTED VERSION v2.6.0 ---

const express = require('express');
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const path = require('path');
const { getAICorrectedSubtitle, getSubtitleUrlsForStremio } = require('./lib/subtitleMatcher');

console.log("Starting Stremio AI Subtitle Addon v2.6.0...");

const manifest = {
    "id": "com.stremio.ai.subtitle.corrector.tr.final",
    "version": "2.6.0",
    "name": "AI Subtitle Corrector (TR)",
    "description": "Provides AI-corrected Turkish subtitles with a full customization UI and hash-matching.",
    "resources": ["subtitles"],
    "types": ["movie", "series"],
    "idPrefixes": ["tt", "tmdb"],
    "catalogs": [],
    "behaviorHints": {
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
const app = express();
const port = process.env.PORT || 7000;

// This is the Stremio addon handler.
const addonHandler = serveHTTP(addonInterface);

// Serve the configuration page at the root URL.
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'configure.html'));
});

// Custom route for serving the actual .srt files.
app.get('/subtitles/:videoId/:language.srt', (req, res) => {
    const { videoId, language } = req.params;
    console.log(`[Endpoint] AI Subtitle file request hit. Video ID: ${videoId}, Lang: ${language}`);

    getAICorrectedSubtitle(videoId, language)
        .then(correctedContent => {
            if (correctedContent) {
                res.setHeader('Content-Type', 'text/plain; charset=utf-8');
                res.send(correctedContent);
            } else {
                console.error(`[Endpoint] Subtitle generation failed for ${videoId}`);
                res.status(404).send('Subtitle could not be generated.');
            }
        })
        .catch(err => {
            console.error("[Endpoint] CRITICAL ERROR while getting AI subtitle:", err);
            res.status(500).send('Internal server error.');
        });
});

// All other requests are handled by the Stremio addon SDK.
// This will handle /manifest.json and subtitle list requests.
app.use((req, res, next) => {
    // We only want the addonHandler to process requests that are not for our custom routes.
    if (req.path.startsWith('/subtitles/') || req.path === '/') {
        return next(); // Pass to the next middleware (which doesn't exist, effectively stopping here for these paths)
    }
    addonHandler(req, res, next);
});


app.listen(port, () => {
    console.log(`Addon running at: http://127.0.0.1:${port}`);
    console.log(`Visit the root URL to configure and install.`);
});
