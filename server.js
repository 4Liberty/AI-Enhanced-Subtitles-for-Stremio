// --- ENVIRONMENT CHECKS ---
const express = require('express');
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const path = require('path');
const { getAICorrectedSubtitle, getSubtitleUrlsForStremio } = require('./lib/subtitleMatcher');
const fetch = require('node-fetch');
const { getEnrichedStreams } = require('./lib/streamEnricher');

function checkEnvVars() {
    const missing = [];
    if (!process.env.GEMINI_API_KEY) missing.push('GEMINI_API_KEY');
    if (!process.env.OPENSUBTITLES_API_KEY) missing.push('OPENSUBTITLES_API_KEY');
    if (!process.env.TMDB_API_KEY) missing.push('TMDB_API_KEY');
    if (!process.env.SUBDL_API_KEY) missing.push('SUBDL_API_KEY');
    if (missing.length) {
        console.warn('[Startup] WARNING: Missing environment variables:', missing.join(', '));
    } else {
        console.log('[Startup] All required API keys are set.');
    }
}

console.log("Starting Stremio AI Subtitle Addon v2.9.0...");

const manifest = {
    id: 'com.stremio.ai.subtitle.corrector.tr.final',
    version: '2.9.0',
    name: 'AI Subtitle Corrector (TR)',
    description: 'Provides AI-corrected Turkish subtitles with a full customization UI and hash-matching.',
    resources: ['subtitles', 'stream'],
    types: ['movie', 'series'],
    idPrefixes: ['tt', 'tmdb'],
    catalogs: [],
    behaviorHints: {
        configurable: true
    }
};

const builder = new addonBuilder(manifest);

builder.defineSubtitlesHandler(async (args) => {
    console.log(`[Handler] Subtitle request received for: ${args.id}`);
    try {
        const infoHash = args.extra && args.extra.video_hash ? args.extra.video_hash : null;
        const result = await getSubtitleUrlsForStremio(args.id, infoHash);
app.listen(port, () => {
    console.log(`Addon running at: http://127.0.0.1:${port}`);
    console.log(`Configuration page available at the root URL or by clicking 'Configure' in Stremio.`);
});