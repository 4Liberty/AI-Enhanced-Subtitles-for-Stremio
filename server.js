// server.js
// --- FINAL CORRECTED VERSION v1.4.0 ---

const path = require('path');
const express = require('express');
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const { getAICorrectedSubtitle, getSubtitleUrlsForStremio } = require('./lib/subtitleMatcher');

console.log("Starting Final Corrected Version of AI Subtitle Addon...");

const app = express();

// --- MANIFEST ---
// This defines what your addon does.
const manifest = {
    "id": "com.stremio.ai.subtitle.corrector.tr.final", // A new ID to guarantee no caching issues
    "version": "1.4.0",
    "name": "AI Subtitle Corrector (TR)",
    "description": "Provides AI-corrected Turkish subtitles.",
    "resources": ["subtitles"], // We ONLY provide subtitles
    "types": ["movie", "series"],
    "catalogs": [],
    "idPrefixes": ["tt", "tmdb"], // We can handle both IMDb and TMDb IDs
    "behaviorHints": {
        "configurable": false,
        "configurationRequired": false
    }
};

const builder = new addonBuilder(manifest);

// --- HANDLERS ---
// This handler is called by Stremio when it needs subtitles.
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

// --- SERVER SETUP ---
// This is the correct way to integrate the addon with an Express server.
const addonInterface = builder.getInterface();

// This endpoint serves the corrected subtitle file itself.
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

// This serves the manifest.json and responds to Stremio's requests.
// It must be the last middleware used.
app.use((req, res, next) => {
    serveHTTP(addonInterface, {
        req,
        res,
        next
    });
});


// --- START THE SERVER ---
const port = process.env.PORT || 7000;
app.listen(port, () => {
    console.log(`Addon is running on port ${port}.`);
    console.log(`To install, use the manifest URL: /manifest.json`);
});
