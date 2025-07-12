// lib/subtitleMatcher.js
// --- FINAL CORRECTED VERSION v1.7.0 ---

const fetch = require('node-fetch');

async function findBestSubtitleLink(videoId, language) {
    const opensubtitlesApiKey = process.env.OPENSUBTITLES_API_KEY;

    if (!opensubtitlesApiKey) {
        console.error("[Logic] CRITICAL: OPENSUBTITLES_API_KEY is not set.");
        return null;
    }

    console.log(`[Logic] Trying OpenSubtitles for ID: ${videoId}`);
    const searchParams = new URLSearchParams({ languages: language });
    if (videoId.startsWith('tt')) {
        searchParams.append('imdb_id', videoId);
    } else if (videoId.startsWith('tmdb:')) {
        searchParams.append('tmdb_id', videoId.split(':')[1]);
    }

    try {
        const searchUrl = `https://api.opensubtitles.com/api/v1/subtitles?${searchParams}`;
        const searchResponse = await fetch(searchUrl, { headers: { 'Api-Key': opensubtitlesApiKey, 'User-Agent': 'Stremio-AI-Sub-Addon/1.7' } });
        if (!searchResponse.ok) {
            console.error(`[Logic] OpenSubtitles search failed. Status: ${searchResponse.status}`);
            return null;
        }

        const searchData = await searchResponse.json();
        if (searchData.data && searchData.data.length > 0) {
            const fileId = searchData.data[0].attributes.files[0].file_id;
            const downloadRequest = await fetch('https://api.opensubtitles.com/api/v1/download', {
                method: 'POST',
                headers: { 'Api-Key': opensubtitlesApiKey, 'Content-Type': 'application/json', 'User-Agent': 'Stremio-AI-Sub-Addon/1.7' },
                body: JSON.stringify({ file_id: fileId })
            });
            if (downloadRequest.ok) {
                const downloadData = await downloadRequest.json();
                if (downloadData.link) {
                    console.log('[Logic] Success! Found link on OpenSubtitles.');
                    return downloadData.link;
                }
            }
        }
    } catch (e) {
        console.error('[Logic] OpenSubtitles search failed:', e.message);
    }
    
    console.warn('[Logic] No subtitles found on OpenSubtitles.');
    return null;
}

async function getSubtitleUrlsForStremio(videoId) {
    const language = 'tr';
    const subtitleUrl = `/subtitles/${videoId}/${language}.srt`;
    return { subtitles: [{ id: `ai-corrected-${language}`, lang: language, url: subtitleUrl }] };
}

async function getAICorrectedSubtitle(videoId, language) {
    console.log(`[AI Logic] Starting process for Video ID: ${videoId}`);
    const geminiApiKey = process.env.GEMINI_API_KEY;

    const downloadLink = await findBestSubtitleLink(videoId, language);

    if (!downloadLink) {
        console.error(`[AI Logic] Could not find any subtitle for ${videoId}.`);
        return null;
    }

    try {
        const subtitleResponse = await fetch(downloadLink);
        const originalContent = await subtitleResponse.text();
        console.log(`[AI Logic] Downloaded original content (${originalContent.length} chars).`);

        if (!geminiApiKey) {
            console.warn("[AI Logic] GEMINI_API_KEY not set. Returning original, uncorrected subtitle.");
            return originalContent;
        }

        console.log("[AI Logic] Sending to Gemini for correction...");
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${geminiApiKey}`;
        const prompt = `Review the following Turkish subtitle file for sync issues. Return only the corrected SRT file, with no extra text or comments.\n\n${originalContent}`;
        
        const aiRes = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

        if (!aiRes.ok) {
            console.error(`[AI Logic] Gemini API failed. Status: ${aiRes.status}`);
            return originalContent; // Return original on failure
        }

        const aiData = await aiRes.json();
        const corrected = aiData?.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (corrected) {
            console.log("[AI Logic] Success! Received corrected subtitle from Gemini.");
            return corrected;
        } else {
            console.error("[AI Logic] Gemini response was empty.");
            return originalContent;
        }

    } catch (error) {
        console.error("[AI Logic] A critical error occurred:", error);
        return null;
    }
}

module.exports = { getSubtitleUrlsForStremio, getAICorrectedSubtitle };
