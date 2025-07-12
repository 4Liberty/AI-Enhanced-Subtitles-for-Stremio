// server.js
// --- FINAL CORRECTED VERSION v1.7.0 ---

const express = require('express');
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const { getAICorrectedSubtitle, getSubtitleUrlsForStremio } = require('./lib/subtitleMatcher');
const path = require('path');

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
const app = express();

// Serve the configuration page at the root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'configure.html'));
});

// Stremio addon handler
app.use((req, res, next) => {
    // Check if the request is for the manifest
    if (req.path.endsWith('/manifest.json')) {
        // Let the SDK handle the manifest request
        serveHTTP(addonInterface, { port: process.env.PORT || 7000 })(req, res);
    } else {
        // Let the SDK handle other requests
        serveHTTP(addonInterface, { port: process.env.PORT || 7000 })(req, res);
    }
});

const port = process.env.PORT || 7000;
app.listen(port, () => {
    console.log(`Addon is running at: http://127.0.0.1:${port}`);
});
