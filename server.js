// server.js
// --- FINAL STABLE VERSION v2.1.0 ---

const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const { getAICorrectedSubtitle, getSubtitleUrlsForStremio } = require('./lib/subtitleMatcher');

console.log("Starting Stremio AI Subtitle Addon v2.1.0...");

// --- 1. MANIFEST ---
const manifest = {
    "id": "com.stremio.ai.subtitle.corrector.tr.final.v5", // Incremented ID for fresh install
    "version": "2.1.0",
    "name": "AI Subtitle Corrector (TR)",
    "description": "Provides AI-corrected Turkish subtitles from multiple sources with sync correction.",
    "resources": ["subtitles"],
    "types": ["movie", "series"],
    "catalogs": [],
    "idPrefixes": ["tt", "tmdb"]
};

const builder = new addonBuilder(manifest);

// --- 2. SUBTITLE HANDLER ---
builder.defineSubtitlesHandler(async (args) => {
    console.log(`[Handler] Subtitle request received for: ${args.id}`);
    try {
        const result = await getSubtitleUrlsForStremio(args.id);
        if (result && result.subtitles && result.subtitles.length > 0) {
            console.log(`[Handler] Successfully generated ${result.subtitles.length} subtitle option(s).`);
        } else {
            console.warn(`[Handler] No subtitle options were generated for ${args.id}.`);
        }
        return Promise.resolve(result); // Use Promise.resolve for clarity
    } catch (error) {
        console.error("[Handler] CRITICAL ERROR in subtitle handler:", error);
        return Promise.resolve({ subtitles: [] }); // Always return a valid promise
    }
});

// --- 3. SERVER LOGIC ---
const port = process.env.PORT || 7000;

// Use the Heroku-provided app name to construct the public URL, otherwise default to localhost
const publicUrl = process.env.HEROKU_APP_NAME
    ? `https://${process.env.HEROKU_APP_NAME}.herokuapp.com`
    : `http://127.0.0.1:${port}`;

serveHTTP(builder.getInterface(), { port: port })
    .then(({ url }) => {
        // This log now uses the correctly scoped 'url' from the promise and the 'publicUrl'
        console.log(`Addon running at: ${url}`);
        console.log(`Publicly accessible at: ${publicUrl}/manifest.json`);
    })
    .catch(err => {
        console.error("Failed to start server:", err);
    });

// --- Custom Endpoint for serving subtitles ---
// This part seems to be missing from your server.js but is crucial for subtitles to work.
// I've re-added it from your previous files.
const express = require('express');
const app = express();

app.get('/subtitles/:videoId/:language.srt', (req, res) => {
    const { videoId, language } = req.params;
    console.log(`[Endpoint] Request to serve corrected subtitle for ID: ${videoId}`);
    
    getAICorrectedSubtitle(videoId, language)
        .then(correctedContent => {
            if (correctedContent) {
                res.setHeader('Content-Type', 'text/plain; charset=utf-8');
                res.send(correctedContent); // Use res.send for express
            } else {
                res.status(404).send('Could not generate corrected subtitle.');
            }
        })
        .catch(err => {
            console.error("[Endpoint] CRITICAL ERROR:", err);
            res.status(500).send('Internal server error.');
        });
});

// The SDK's serveHTTP handles the addon routes, but we need a listener for our custom srt endpoint.
// This is a simplified way to combine them.
const server = app.listen(port, () => {
    console.log(`Express server for subtitles listening on port ${port}`);
});
