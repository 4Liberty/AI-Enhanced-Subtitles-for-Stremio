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

    // Usage tracking and switching logic
    const now = Date.now();
    if (now - config.opensubtitlesUsage.lastReset > 24 * 60 * 60 * 1000) {
        config.opensubtitlesUsage.count = 0;
        config.opensubtitlesUsage.lastReset = now;
    }

    let usePodnapisi = false;
    if (config.opensubtitlesUsage.count >= 5) {
        usePodnapisi = true;
    }

    if (!usePodnapisi) {
        // Try OpenSubtitles hash search first
        let hashToUse = infoHash;
        let title = '', year = '', imdbId = '';
        if (typeof infoHash === 'object' && infoHash !== null) {
            hashToUse = infoHash.infoHash || infoHash.hash || '';
            title = infoHash.title || '';
            year = infoHash.year || '';
            imdbId = infoHash.imdb_id || infoHash.imdbId || '';
        }
        // 1. Try hash search
        if (hashToUse) {
            const cachedResult = cache.get(hashToUse);
            if (cachedResult && cachedResult.expires > Date.now()) {
                return cachedResult.languages.filter(lang => preferredLanguages.includes(lang));
            }
            const searchParams = new URLSearchParams({ moviehash: hashToUse });
            const url = `https://api.opensubtitles.com/api/v1/subtitles?${searchParams}`;
            try {
                const response = await fetch(url, {
                    headers: { 'Api-Key': config.OPENSUBTITLES_API_KEY, 'User-Agent': 'AIOStreams-Enricher' }
                });
                if (!response.ok) {
                    console.error(`Subtitle API failed for hash ${hashToUse}: ${response.status}`);
                    return [];
                }
                config.opensubtitlesUsage.count++;
                const data = await response.json();
                const foundLanguages = (!data.data || data.data.length === 0)
                    ? []
                    : [...new Set(data.data.map(sub => sub.attributes.language))];
                // If hash match found, return immediately
                if (foundLanguages.length > 0) {
                    cache.set(hashToUse, { languages: foundLanguages, expires: Date.now() + config.CACHE_DURATION_MS });
                    console.log(`Cached languages for ${hashToUse}: ${foundLanguages.join(', ') || 'None'}`);
                    return foundLanguages.filter(lang => preferredLanguages.includes(lang));
                }
            } catch (error) {
                console.error(`Error checking hash ${hashToUse}:`, error.message);
                // continue to fallback
            }
        }
        // 2. Fallback to metadata search (imdb_id, title, year)
        const searchParams = new URLSearchParams();
        if (imdbId) searchParams.append('imdb_id', imdbId);
        if (title) searchParams.append('query', title);
        if (year) searchParams.append('year', year);
        if (preferredLanguages && preferredLanguages.length > 0) searchParams.append('languages', preferredLanguages.join(','));
        const url = `https://api.opensubtitles.com/api/v1/subtitles?${searchParams}`;
        try {
            const response = await fetch(url, {
                headers: { 'Api-Key': config.OPENSUBTITLES_API_KEY, 'User-Agent': 'AIOStreams-Enricher' }
            });
            if (!response.ok) {
                console.error(`Subtitle API failed for metadata search: ${response.status}`);
                return [];
            }
            config.opensubtitlesUsage.count++;
            const data = await response.json();
            const foundLanguages = (!data.data || data.data.length === 0)
                ? []
                : [...new Set(data.data.map(sub => sub.attributes.language))];
            cache.set(`${title}_${year}_${imdbId}`, { languages: foundLanguages, expires: Date.now() + config.CACHE_DURATION_MS });
            console.log(`Cached languages for ${title}_${year}_${imdbId}: ${foundLanguages.join(', ') || 'None'}`);
            return foundLanguages.filter(lang => preferredLanguages.includes(lang));
        } catch (error) {
            console.error(`Error checking OpenSubtitles metadata:`, error.message);
            return [];
        }
    } else {
        // Use Podnapisi unofficial JSON API as fallback
        try {
            // Helper to extract metadata
            function extractMeta(obj) {
                if (typeof obj === 'object' && obj !== null) {
                    return {
                        keywords: obj.title || obj.keywords || obj.infoHash || '',
                        year: obj.year || '',
                        imdbId: obj.imdb_id || obj.imdbId || ''
                    };
                }
                return { keywords: obj, year: '', imdbId: '' };
            }
            const { keywords, year, imdbId } = extractMeta(infoHash);
            let podUrl = `${config.PODNAPISI_API_URL}?keywords=${encodeURIComponent(keywords)}`;
            if (year) podUrl += `&year=${encodeURIComponent(year)}`;
            if (imdbId) podUrl += `&imdb_id=${encodeURIComponent(imdbId)}`;
            const response = await fetch(podUrl, {
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': config.PODNAPISI_USER_AGENT
                }
            });
            if (!response.ok) {
                console.error(`Podnapisi API failed for keywords '${keywords}': ${response.status}`);
                return [];
            }
            const data = await response.json();
            // Podnapisi JSON structure: data.subtitles is an array
            const foundLanguages = Array.isArray(data.subtitles) && data.subtitles.length > 0
                ? [...new Set(data.subtitles.map(sub => sub.language))]
                : [];
            if (foundLanguages.length === 0) {
                console.log(`No Podnapisi languages found for '${keywords}' (${year}, ${imdbId})`);
            }
            // No cache for Podnapisi fallback
            return foundLanguages.filter(lang => preferredLanguages.includes(lang));
        } catch (error) {
            console.error(`Error checking Podnapisi fallback:`, error && error.message ? error.message : error);
            return [];
        }
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


    // Usage tracking and switching logic (reuse from getAvailableLanguagesForHash)
    const now = Date.now();
    if (now - config.opensubtitlesUsage.lastReset > 24 * 60 * 60 * 1000) {
        config.opensubtitlesUsage.count = 0;
        config.opensubtitlesUsage.lastReset = now;
    }
    let usePodnapisi = false;
    if (config.opensubtitlesUsage.count >= 5) {
        usePodnapisi = true;
    }

    let subFileUrl = null;
    if (!usePodnapisi) {
        // Try OpenSubtitles
        const searchParams = new URLSearchParams({ moviehash: infoHash, languages: language });
        const url = `https://api.opensubtitles.com/api/v1/subtitles?${searchParams}`;
        try {
            const response = await fetch(url, {
                headers: { 'Api-Key': config.OPENSUBTITLES_API_KEY, 'User-Agent': 'AIOStreams-Enricher' }
            });
            if (!response.ok) return null;
            config.opensubtitlesUsage.count++;
            const data = await response.json();
            if (data.data && data.data.length > 0) {
                subFileUrl = data.data[0].attributes.url || data.data[0].attributes.files?.[0]?.file_url;
            }
        } catch (e) {
            console.error('Subtitle search failed:', e.message);
            return null;
        }
    } else {
        // Use Podnapisi unofficial JSON API as fallback
        try {
            // Try to get title, year, imdbId from arguments if available (assume infoHash is an object for this logic)
            let keywords = infoHash;
            let year = '';
            let imdbId = '';
            if (typeof infoHash === 'object' && infoHash !== null) {
                keywords = infoHash.title || infoHash.keywords || infoHash.infoHash || '';
                year = infoHash.year || '';
                imdbId = infoHash.imdb_id || infoHash.imdbId || '';
            }
            let podUrl = `${config.PODNAPISI_API_URL}?keywords=${encodeURIComponent(keywords)}`;
            if (year) podUrl += `&year=${encodeURIComponent(year)}`;
            if (imdbId) podUrl += `&imdb_id=${encodeURIComponent(imdbId)}`;
            const response = await fetch(podUrl, {
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': config.PODNAPISI_USER_AGENT
                }
            });
            if (!response.ok) return null;
            const data = await response.json();
            if (data.subtitles && data.subtitles.length > 0) {
                // Try to get the download link (adjust if Podnapisi API differs)
                subFileUrl = data.subtitles[0].url || data.subtitles[0].file_url;
            }
        } catch (e) {
            console.error('Podnapisi subtitle search failed:', e.message);
            return null;
        }
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

    // 3. Send to Gemini API for correction
    try {
        const geminiApiKey = process.env.GEMINI_API_KEY;
        if (!geminiApiKey) {
            console.error('Gemini API key not set in environment variable GEMINI_API_KEY');
            return null;
        }
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${geminiApiKey}`;
        const prompt = `You are an expert subtitle synchronizer. Analyze the following subtitle file and correct any timing drift (such as PAL/NTSC mismatches or linear offset). Return only the corrected subtitle file in the same format.\n\n${subtitleContent}`;
        const aiRes = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: prompt }]
                }],
                generationConfig: {
                    maxOutputTokens: 100000
                }
            })
        });
        if (!aiRes.ok) return null;
        const aiData = await aiRes.json();
        // Gemini's response: aiData.candidates[0].content.parts[0].text
        const corrected = aiData?.candidates?.[0]?.content?.parts?.[0]?.text;
        return corrected || null;
    } catch (e) {
        console.error('Gemini AI correction failed:', e.message);
        return null;
    }
}

/**
 * Fetches available subtitle download URLs for a given video (hash or metadata), for Stremio.
 * Returns array of { lang, url, id } objects for use in stream.subtitles.
 * @param {object|string} infoHash - Infohash or metadata object (may include title, year, imdb_id)
 * @param {string[]} preferredLanguages - Array of language codes to filter (optional)
 * @returns {Promise<Array<{lang: string, url: string, id: string}>>}
 */
async function getSubtitleUrlsForStremio(infoHash, preferredLanguages = ['en']) {
    // Usage tracking and switching logic
    const now = Date.now();
    if (now - config.opensubtitlesUsage.lastReset > 24 * 60 * 60 * 1000) {
        config.opensubtitlesUsage.count = 0;
        config.opensubtitlesUsage.lastReset = now;
    }
    let usePodnapisi = false;
    if (config.opensubtitlesUsage.count >= 5) {
        usePodnapisi = true;
    }

    let hashToUse = infoHash;
    let title = '', year = '', imdbId = '';
    if (typeof infoHash === 'object' && infoHash !== null) {
        hashToUse = infoHash.infoHash || infoHash.hash || '';
        title = infoHash.title || '';
        year = infoHash.year || '';
        imdbId = infoHash.imdb_id || infoHash.imdbId || '';
    }

    let results = [];
    if (!usePodnapisi) {
        // 1. Try OpenSubtitles hash search
        let searchParams;
        if (hashToUse) {
            searchParams = new URLSearchParams({ moviehash: hashToUse });
        } else {
            searchParams = new URLSearchParams();
        }
        if (imdbId) searchParams.append('imdb_id', imdbId);
        if (title) searchParams.append('query', title);
        if (year) searchParams.append('year', year);
        if (preferredLanguages && preferredLanguages.length > 0) searchParams.append('languages', preferredLanguages.join(','));
        const url = `https://api.opensubtitles.com/api/v1/subtitles?${searchParams}`;
        try {
            const response = await fetch(url, {
                headers: { 'Api-Key': config.OPENSUBTITLES_API_KEY, 'User-Agent': 'AIOStreams-Enricher' }
            });
            if (!response.ok) {
                console.error(`Subtitle API failed for Stremio subtitle fetch: ${response.status}`);
                // fallback to Podnapisi
            } else {
                config.opensubtitlesUsage.count++;
                const data = await response.json();
                if (data.data && data.data.length > 0) {
                    // Map to { lang, url, id }
                    results = data.data
                        .filter(sub => !preferredLanguages.length || preferredLanguages.includes(sub.attributes.language))
                        .map(sub => {
                            let fileUrl = sub.attributes.url || (sub.attributes.files && sub.attributes.files[0] && sub.attributes.files[0].file_url);
                            return fileUrl ? {
                                lang: sub.attributes.language,
                                url: fileUrl,
                                id: `opensubtitles-${sub.attributes.language}`
                            } : null;
                        })
                        .filter(Boolean);
                }
            }
        } catch (e) {
            console.error('OpenSubtitles fetch for Stremio failed:', e.message);
        }
    }
    // Fallback to Podnapisi if no results or usage exceeded
    if (results.length === 0) {
        try {
            let keywords = infoHash;
            let year = '';
            let imdbId = '';
            if (typeof infoHash === 'object' && infoHash !== null) {
                keywords = infoHash.title || infoHash.keywords || infoHash.infoHash || '';
                year = infoHash.year || '';
                imdbId = infoHash.imdb_id || infoHash.imdbId || '';
            }
            let podUrl = `${config.PODNAPISI_API_URL}?keywords=${encodeURIComponent(keywords)}`;
            if (year) podUrl += `&year=${encodeURIComponent(year)}`;
            if (imdbId) podUrl += `&imdb_id=${encodeURIComponent(imdbId)}`;
            const response = await fetch(podUrl, {
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': config.PODNAPISI_USER_AGENT
                }
            });
            if (!response.ok) {
                console.error(`Podnapisi API failed for Stremio: ${response.status}`);
            } else {
                const data = await response.json();
                if (data.subtitles && data.subtitles.length > 0) {
                    results = data.subtitles
                        .filter(sub => !preferredLanguages.length || preferredLanguages.includes(sub.language))
                        .map(sub => {
                            let fileUrl = sub.url || sub.file_url;
                            return fileUrl ? {
                                lang: sub.language,
                                url: fileUrl,
                                id: `podnapisi-${sub.language}`
                            } : null;
                        })
                        .filter(Boolean);
                }
            }
        } catch (e) {
            console.error('Podnapisi fetch for Stremio failed:', e.message);
        }
    }
    return results;
}

module.exports = { getAvailableLanguagesForHash, getAICorrectedSubtitle, getSubtitleUrlsForStremio };
