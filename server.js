// server.js
// --- FINAL, SIMPLIFIED VERSION ---

const path = require('path');
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const { getSubtitleUrlsForStremio, getAICorrectedSubtitle } = require('./lib/subtitleMatcher');
const express = require('express');
const app = express();

console.log("Starting Final Version of AI Subtitle Corrector Addon...");

const manifest = {
    "id": "com.stremio.ai.subtitle.corrector.tr.v2", // A new ID to bust cache
    "version": "1.2.0",
    "name": "AI Subtitle Corrector (TR)",
    "description": "Provides AI-corrected Turkish subtitles.",
    "resources": ["subtitles"],
    "types": ["movie", "series"],
    "catalogs": [],
    "idPrefixes": ["tt", "tmdb"],
    "behaviorHints": {
        "configurable": false, // Simplified for now
        "configurationRequired": false
    }
};

const builder = new addonBuilder(manifest);

// The only handler that should be called by Stremio now
builder.defineSubtitlesHandler(async (args) => {
    console.log(`[Handler] Subtitle request received for ID: ${args.id}`);
    try {
        const result = await getSubtitleUrlsForStremio(args.id);
        console.log(`[Handler] Successfully generated ${result.subtitles.length} subtitle option(s).`);
        return result;
    } catch (error) {
        console.error("[Handler] CRITICAL ERROR in subtitle handler:", error);
        return { subtitles: [] };
    }
});

// --- SERVER SETUP ---
const addonInterface = builder.getInterface();
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    next();
});
app.use(addonInterface);

// This endpoint serves the corrected subtitle file
app.get('/subtitles/:videoId/:language.srt', async (req, res) => {
    console.log(`[Endpoint] AI Subtitle request hit. Video ID: ${req.params.videoId}`);
    try {
        const corrected = await getAICorrectedSubtitle(req.params.videoId, req.params.language);
        if (corrected) {
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.send(corrected);
        } else {
            console.error('[Endpoint] Failed to generate corrected subtitle.');
            res.status(404).send('Could not generate corrected subtitle.');
        }
    } catch (e) {
        console.error("[Endpoint] CRITICAL ERROR in AI endpoint:", e);
        res.status(500).send('Internal server error.');
    }
});

const port = process.env.PORT || 7000;
app.listen(port, () => {
    console.log(`Addon is running on port ${port}.`);
});
