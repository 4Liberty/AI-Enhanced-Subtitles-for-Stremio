// server.js
// The main server for the self-configuring stream enricher addon.


// --- SPLIT SERVER SETUP ---
// 1. Stremio endpoints (manifest, stream, etc.) via SDK's serveHTTP
// 2. Custom endpoints (configure UI, AI, etc.) via Express

const path = require('path');
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const config = require('./config');
const { getEnrichedStreams } = require('./lib/streamEnricher');
const { getAICorrectedSubtitle } = require('./lib/subtitleMatcher');

console.log("Starting Stremio Stream Enricher Addon (split-server mode)...");

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

// --- 1. Stremio Addon Server ---
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

const stremioPort = process.env.STREMIO_PORT || 7000;
serveHTTP(builder.getInterface(), { port: stremioPort });
console.log(`Stremio Addon endpoints listening on port ${stremioPort}`);

// --- 2. Custom Express Server ---
const express = require('express');
const app = express();
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    next();
});
app.use(express.json());

// --- ROOT ENDPOINT (for custom server) ---
app.get('/', (req, res) => {
    res.send('Stremio Subtitle Addon (custom endpoints) is running.<br>Try <a href="/configure">/configure</a>.');
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

const customPort = process.env.CUSTOM_PORT || 7001;
app.listen(customPort, () => {
    console.log(`Custom endpoints (UI, AI) listening on port ${customPort}`);
    if (config.SERVER_URL) {
        console.log(`Configuration Page: ${config.SERVER_URL.replace(/:\d+$/, ':' + customPort)}/configure`);
    }
});
