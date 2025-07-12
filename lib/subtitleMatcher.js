// lib/subtitleMatcher.js
// Upgraded with Caching and Language-Specific Matching.

const fetch = require('node-fetch');
const config = require('../config');

// --- CACHE SETUP ---
const cache = new Map();

/**
 * Checks for perfect subtitle matches for a given hash and preferred languages.
 * @param {string} infoHash The infohash of the torrent stream.
 * @param {string[]} preferredLanguages An array of preferred language codes.
 * @returns {Promise<string[]>} A promise that resolves to an array of matched language codes.
 */
async function getAvailableLanguagesForHash(infoHash, preferredLanguages = ['en']) {
    if (!infoHash) return [];

    const cachedResult = cache.get(infoHash);
    if (cachedResult && cachedResult.expires > Date.now()) {
        return cachedResult.languages.filter(lang => preferredLanguages.includes(lang));
    }

    const searchParams = new URLSearchParams({ moviehash: infoHash });
    const url = `https://api.opensubtitles.com/api/v1/subtitles?${searchParams}`;

    try {
        const response = await fetch(url, {
            headers: { 'Api-Key': config.OPENSUBTITLES_API_KEY, 'User-Agent': 'AIOStreams-Enricher' }
        });

        if (!response.ok) {
            console.error(`Subtitle API failed for hash ${infoHash}: ${response.status}`);
            return [];
        }
        
        const data = await response.json();
        
        const foundLanguages = (!data.data || data.data.length === 0)
            ? []
            : [...new Set(data.data.map(sub => sub.attributes.language))];

        cache.set(infoHash, { languages: foundLanguages, expires: Date.now() + config.CACHE_DURATION_MS });
        console.log(`Cached languages for ${infoHash}: ${foundLanguages.join(', ') || 'None'}`);

        return foundLanguages.filter(lang => preferredLanguages.includes(lang));

    } catch (error) {
        console.error(`Error checking hash ${infoHash}:`, error.message);
        return [];
    }
}


/**
 * Fetches the best subtitle file for a given hash/language, sends it to an AI API for correction, and returns the corrected content.
 * @param {string} infoHash
 * @param {string} language
 * @returns {Promise<string|null>} Corrected subtitle content or null if not found/error.
 */
async function getAICorrectedSubtitle(infoHash, language) {
    if (!infoHash || !language) return null;

    // 1. Search for the best subtitle for this hash/language
    const searchParams = new URLSearchParams({ moviehash: infoHash, languages: language });
    const url = `https://api.opensubtitles.com/api/v1/subtitles?${searchParams}`;
    let subFileUrl = null;
    try {
        const response = await fetch(url, {
            headers: { 'Api-Key': config.OPENSUBTITLES_API_KEY, 'User-Agent': 'AIOStreams-Enricher' }
        });
        if (!response.ok) return null;
        const data = await response.json();
        if (data.data && data.data.length > 0) {
            // Pick the first subtitle file download link
            subFileUrl = data.data[0].attributes.url || data.data[0].attributes.files?.[0]?.file_url;
        }
    } catch (e) {
        console.error('Subtitle search failed:', e.message);
        return null;
    }
    if (!subFileUrl) return null;

    // 2. Download the subtitle file content
    let subtitleContent = null;
    try {
        const subRes = await fetch(subFileUrl);
        if (!subRes.ok) return null;
        subtitleContent = await subRes.text();
    } catch (e) {
        console.error('Subtitle download failed:', e.message);
        return null;
    }
    if (!subtitleContent) return null;

    // 3. Send to AI API for correction (replace with your AI endpoint and key)
    try {
        // Example: POST to a hypothetical AI endpoint
        const aiRes = await fetch('https://your-ai-api-endpoint/correct-subtitle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer YOUR_AI_API_KEY' },
            body: JSON.stringify({
                subtitle: subtitleContent,
                language,
                infoHash
            })
        });
        if (!aiRes.ok) return null;
        const aiData = await aiRes.json();
        return aiData.correctedSubtitle || null;
    } catch (e) {
        console.error('AI correction failed:', e.message);
        return null;
    }
}

module.exports = { getAvailableLanguagesForHash, getAICorrectedSubtitle };
