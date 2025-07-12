// server.js
// The main server for the self-configuring stream enricher addon.



// --- UNIFIED SERVER FOR HEROKU COMPATIBILITY ---
// Serves both Stremio SDK endpoints and custom endpoints on the same port ($PORT)

const path = require('path');
const { addonBuilder } = require('stremio-addon-sdk');
const config = require('./config');
const { getEnrichedStreams } = require('./lib/streamEnricher');
const { getAICorrectedSubtitle } = require('./lib/subtitleMatcher');
const express = require('express');
const app = express();

console.log("Starting Stremio Stream Enricher Addon (Heroku-compatible mode)...");

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
        "configurationRequired": false
    }
};

const builder = new addonBuilder(manifest);
builder.defineStreamHandler(async ({ type, id, config: userConfig }) => {
    try {
        console.log(`Stream request for ${type} ${id}`);
        const streams = await getEnrichedStreams(type, id, userConfig);
        return { streams };
    } catch (error) {
        console.error("Error in stream handler:", error);
        return { streams: [] };
    }
});

// --- CORS HEADERS (required for Stremio) ---
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    next();
});
app.use(express.json());

// --- ROOT ENDPOINT ---
app.get('/', (req, res) => {
    res.send('Stremio Subtitle Addon is running.<br>Try <a href="/manifest.json">/manifest.json</a> or <a href="/configure">/configure</a>.');
});

// --- CONFIGURATION PAGE ENDPOINT ---
app.get(/^(.+)?\/configure$/, (req, res) => {
    res.sendFile(path.join(__dirname, 'configure.html'));
});

// --- AI-CORRECTED SUBTITLE ENDPOINT ---
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

// --- SERVE THE ADDON ---
const addonInterface = builder.getInterface();
if (addonInterface.getRouter) {
    app.use('/', addonInterface.getRouter());
} else if (addonInterface.requestHandler) {
    app.get(/^(.+)?\/manifest.json$/, (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        addonInterface.requestHandler(req, res);
    });
    app.get(/^(.+)?\/stream\/([^/]+)\/([^/]+)$/, (req, res) => addonInterface.requestHandler(req, res));
}

const port = process.env.PORT || 7000;
app.listen(port, () => {
    console.log(`Stream Enricher Addon is running on port ${port}.`);
    if (config.SERVER_URL) {
        console.log(`Installation URL: ${config.SERVER_URL.replace(/:\d+$/, ':' + port)}/manifest.json`);
        console.log(`Configuration Page: ${config.SERVER_URL.replace(/:\d+$/, ':' + port)}/configure`);
    }
});
