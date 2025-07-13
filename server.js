// server.js
// --- FINAL STABLE VERSION v2.9.0 ---

const express = require('express');
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const path = require('path');
const { getAICorrectedSubtitle, getSubtitleUrlsForStremio } = require('./lib/subtitleMatcher');
const { getEnrichedStreams } = require('./lib/streamEnricher');

console.log("Starting Stremio AI Subtitle Addon v2.9.0...");

const manifest = {
    "id": "com.stremio.ai.subtitle.corrector.tr.final",
    "version": "2.9.0",
    "name": "AI Subtitle Corrector (TR)",
    "description": "Provides AI-corrected Turkish subtitles with a full customization UI and hash-matching.",
    "resources": ["subtitles", "stream"],
    "types": ["movie", "series"],
    "idPrefixes": ["tt", "tmdb"],
    "catalogs": [],
    "behaviorHints": {
        "configurable": true
    }
};

builder.defineSubtitlesHandler(async (args) => {

const builder = new addonBuilder(manifest);

builder.defineSubtitlesHandler(async (args) => {
    console.log(`[Handler] Subtitle request received for: ${args.id}`);
    try {
        const infoHash = args.extra && args.extra.video_hash ? args.extra.video_hash : null;
        const result = await getSubtitleUrlsForStremio(args.id, infoHash);
        if (result && result.subtitles && result.subtitles.length > 0) {
            console.log(`[Handler] Successfully generated ${result.subtitles.length} subtitle option(s).`);
        }
        return result;
    } catch (error) {
        console.error("[Handler] Error in subtitle handler:", error);
        return { subtitles: [] };
    }
});

builder.defineStreamHandler(async (args) => {
    console.log(`[Handler] Stream request received for: ${args.id}`);
    // You would fetch streams from your provider here. For demo, use an empty array.
    const streams = []; // Replace with actual stream fetching logic if needed.
    try {
        const enriched = await getEnrichedStreams(args.type, args.id, streams);
        return { streams: enriched };
    } catch (error) {
        console.error("[Handler] Error in stream handler:", error);
        return { streams: [] };
    }
});

const addonInterface = builder.getInterface();
const app = express();
const port = process.env.PORT || 7000;

// Route for the configuration page.
const configureRoute = (req, res) => {
    res.sendFile(path.join(__dirname, 'configure.html'));
};
app.get('/', configureRoute);
app.get('/configure', configureRoute);

// Route for serving the actual .srt files.
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
// This will handle /manifest.json, /subtitles, and /stream requests.
app.use(serveHTTP(addonInterface));

app.listen(port, () => {
    console.log(`Addon running at: http://127.0.0.1:${port}`);
    console.log(`Configuration page available at the root URL or by clicking 'Configure' in Stremio.`);
});