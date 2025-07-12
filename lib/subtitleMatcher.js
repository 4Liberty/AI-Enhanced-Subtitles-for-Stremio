
// lib/subtitleMatcher.js
// --- OVERHAULED & ROBUST VERSION v2.0.0 ---

const fetch = require('node-fetch');

// --- CONFIG ---
const SUPPORTED_LANGUAGE = 'tr';
const USER_AGENT = 'Stremio-AI-Sub-Addon/2.0';

// --- MAIN: Stremio Subtitle Handler ---
async function getSubtitleUrlsForStremio(videoId) {
    console.log(`[SubtitleMatcher] Generating subtitle options for: ${videoId}`);
    // Always Turkish only
    const subtitleUrl = `/subtitles/${videoId}/${SUPPORTED_LANGUAGE}.srt`;
    return {
        subtitles: [{
            id: `ai-corrected-${SUPPORTED_LANGUAGE}`,
            lang: SUPPORTED_LANGUAGE,
            url: subtitleUrl,
            behaviorHints: { notWebReady: true }
        }]
    };
}

// --- MAIN: AI Correction Handler ---
async function getAICorrectedSubtitle(videoId, language) {
    console.log(`[SubtitleMatcher] AI correction requested for: ${videoId}, lang: ${language}`);
    if (language !== SUPPORTED_LANGUAGE) {
        console.warn(`[SubtitleMatcher] Only Turkish ('tr') subtitles are supported.`);
        return null;
    }
    const opensubtitlesApiKey = process.env.OPENSUBTITLES_API_KEY;
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!opensubtitlesApiKey || !geminiApiKey) {
        console.error('[SubtitleMatcher] Missing API key(s).');
        return null;
    }

    // --- Step 1: Find Turkish subtitle on OpenSubtitles ---
    const searchParams = new URLSearchParams({ languages: SUPPORTED_LANGUAGE });
    if (videoId.startsWith('tt')) {
        searchParams.append('imdb_id', videoId);
    } else if (videoId.startsWith('tmdb:')) {
        const tmdbId = videoId.split(':')[1];
        searchParams.append('tmdb_id', tmdbId);
    } else {
        console.error(`[SubtitleMatcher] Invalid videoId: ${videoId}`);
        return null;
    }
    const searchUrl = `https://api.opensubtitles.com/api/v1/subtitles?${searchParams}`;
    let fileId;
    try {
        const searchRes = await fetch(searchUrl, { headers: { 'Api-Key': opensubtitlesApiKey, 'User-Agent': USER_AGENT } });
        if (!searchRes.ok) {
            console.error(`[SubtitleMatcher] OpenSubtitles search failed: ${searchRes.status}`);
            return null;
        }
        const searchData = await searchRes.json();
        if (!searchData.data?.length) {
            console.warn(`[SubtitleMatcher] No Turkish subtitles found for ${videoId}`);
            return null;
        }
        fileId = searchData.data[0]?.attributes?.files?.[0]?.file_id;
        if (!fileId) {
            console.error('[SubtitleMatcher] No file_id found in OpenSubtitles response.');
            return null;
        }
    } catch (err) {
        console.error('[SubtitleMatcher] Error during OpenSubtitles search:', err);
        return null;
    }

    // --- Step 2: Get download link ---
    let downloadLink;
    try {
        const dlRes = await fetch('https://api.opensubtitles.com/api/v1/download', {
            method: 'POST',
            headers: { 'Api-Key': opensubtitlesApiKey, 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
            body: JSON.stringify({ file_id: fileId })
        });
        if (!dlRes.ok) {
            console.error(`[SubtitleMatcher] Download link request failed: ${dlRes.status}`);
            return null;
        }
        const dlData = await dlRes.json();
        downloadLink = dlData.link;
        if (!downloadLink) {
            console.error('[SubtitleMatcher] No download link in OpenSubtitles response.');
            return null;
        }
    } catch (err) {
        console.error('[SubtitleMatcher] Error getting download link:', err);
        return null;
    }

    // --- Step 3: Download subtitle file ---
    let originalContent;
    try {
        const subRes = await fetch(downloadLink);
        if (!subRes.ok) {
            console.error(`[SubtitleMatcher] Subtitle download failed: ${subRes.status}`);
            return null;
        }
        originalContent = await subRes.text();
        if (!originalContent || originalContent.length < 10) {
            console.error('[SubtitleMatcher] Downloaded subtitle is empty or too short.');
            return null;
        }
    } catch (err) {
        console.error('[SubtitleMatcher] Error downloading subtitle:', err);
        return null;
    }

    // --- Step 4: AI Correction (Gemini) ---
    try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${geminiApiKey}`;
        const prompt = `Review the following Turkish subtitle file for any sync issues or timing drift. Return only the corrected subtitle file in the exact same SRT format. Do not add any extra text or comments.\n\n${originalContent}`;
        const aiRes = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        if (!aiRes.ok) {
            const errorText = await aiRes.text();
            console.error(`[SubtitleMatcher] Gemini API failed: ${aiRes.status}. Body: ${errorText}`);
            return originalContent;
        }
        const aiData = await aiRes.json();
        const corrected = aiData?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (corrected && corrected.length > 10) {
            console.log('[SubtitleMatcher] AI correction successful.');
            return corrected;
        } else {
            console.error('[SubtitleMatcher] Gemini response empty or malformed. Returning original.');
            return originalContent;
        }
    } catch (err) {
        console.error('[SubtitleMatcher] Error during AI correction:', err);
        return originalContent;
    }
}

module.exports = { getSubtitleUrlsForStremio, getAICorrectedSubtitle };