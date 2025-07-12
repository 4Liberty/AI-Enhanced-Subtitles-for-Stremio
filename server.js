// server.js
// The main server for the self-configuring stream enricher addon.

const express = require('express');
const path = require('path');
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const config = require('./config');
const { getEnrichedStreams } = require('./lib/streamEnricher');
const { getAICorrectedSubtitle } = require('./lib/subtitleMatcher');

console.log("Starting Stremio Stream Enricher Addon...");

// --- ADDON MANIFEST ---
const manifest = {
    "id": "com.stremio.stream.enricher.addon",
    "version": "1.0.0",
    "name": "Subtitle Match Enricher",
    "description": "Enhances your stream list by showing which torrents have perfect subtitle matches in your preferred languages.",
    "resources": ["stream"],
    "types": ["movie", "series"],
    "catalogs": [],
    "idPrefixes": ["tt"],
    "behaviorHints": {
        "configurable": true,
        "configurationRequired": true
    }
};

const builder = new addonBuilder(manifest);

// --- STREAM HANDLER ---
// This is the core function. It gets streams and then enriches them.
builder.defineStreamHandler(async ({ type, id, config: userConfig }) => {
    try {
        console.log(`Stream request for ${type} ${id}`);
        // The user's language configuration is passed to the enricher function.
        const streams = await getEnrichedStreams(type, id, userConfig);
        return { streams };
    } catch (error) {
        console.error("Error in stream handler:", error);
        return { streams: [] };
    }
});

const app = express();

// --- CONFIGURATION PAGE ENDPOINT ---
// Serves the HTML page when the user clicks "Configure".
app.get('/configure', (req, res) => {
    res.sendFile(path.join(__dirname, 'configure.html'));
});


// --- SERVE THE ADDON ---
const addonInterface = builder.getInterface();
// Serve Stremio manifest and stream endpoints using Express
app.get('/manifest.json', (req, res) => addonInterface(req, res));
app.get('/stream/:type/:id', (req, res) => addonInterface(req, res));


// --- AI-CORRECTED SUBTITLE ENDPOINT ---
// Usage: /ai-corrected-subtitle/:infoHash/:lang
app.get('/ai-corrected-subtitle/:infoHash/:lang', async (req, res) => {
    const { infoHash, lang } = req.params;
    try {
        const corrected = await getAICorrectedSubtitle(infoHash, lang);
        if (!corrected) return res.status(404).send('Subtitle not found or correction failed.');
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.send(corrected);
    } catch (e) {
        res.status(500).send('Internal server error.');
    }
});

app.listen(config.PORT, () => {
    console.log(`Stream Enricher Addon is running.`);
    console.log(`Installation URL: ${config.SERVER_URL}/manifest.json`);
    console.log(`Configuration Page: ${config.SERVER_URL}/configure`);
});
