// lib/subtitleMatcher.js
// --- FINAL CORRECTED VERSION v1.3.0 ---

const fetch = require('node-fetch');

/**
 * This function is called first by Stremio. Its only job is to provide
 * the URL for the AI-corrected subtitle option.
 */
async function getSubtitleUrlsForStremio(videoId) {
    console.log(`[Handler] Request to generate subtitle options for ID: ${videoId}`);
    const language = 'tr'; // Hardcoded as per your requirement

    // The URL must point to our custom endpoint, which will do the actual work.
    // The .srt extension is important for some Stremio clients.
    const subtitleUrl = `/subtitles/${videoId}/${language}.srt`;
    
    const subtitles = [{
        id: `ai-corrected-${language}`,
        lang: language,
        url: subtitleUrl,
        // behaviorHints tell Stremio how to handle this URL
        behaviorHints: {
            notWebReady: true // Important for server-side addons
        }
    }];

    console.log(`[Handler] Successfully created subtitle option. URL: ${subtitleUrl}`);
    return { subtitles: subtitles };
}

/**
 * This function is called when the user selects the subtitle option in Stremio.
 * It performs all the heavy lifting: finding, downloading, and correcting the subtitle.
 */
async function getAICorrectedSubtitle(videoId, language) {
    console.log(`[AI Logic] Starting main process for Video ID: ${videoId}`);
    
    // --- Step 0: Check for API Keys ---
    const opensubtitlesApiKey = process.env.OPENSUBTITLES_API_KEY;
    const geminiApiKey = process.env.GEMINI_API_KEY;

    if (!opensubtitlesApiKey || !geminiApiKey) {
        console.error("[AI Logic] CRITICAL: Missing API key(s). Check OPENSUBTITLES_API_KEY and GEMINI_API_KEY environment variables.");
        return null; // Cannot proceed without keys
    }

    // --- Step 1: Find an original subtitle on OpenSubtitles ---
    const searchParams = new URLSearchParams({ languages: language });
    
    // **THIS IS THE CRITICAL FIX**: Properly handle both IMDb and TMDb IDs.
    if (videoId && videoId.startsWith('tt')) {
        searchParams.append('imdb_id', videoId);
        console.log(`[AI Logic] Searching OpenSubtitles with IMDb ID: ${videoId}`);
    } else if (videoId && videoId.startsWith('tmdb:')) {
        const tmdbId = videoId.split(':')[1];
        searchParams.append('tmdb_id', tmdbId);
        console.log(`[AI Logic] Searching OpenSubtitles with TMDb ID: ${tmdbId}`);
    } else {
        console.error(`[AI Logic] Invalid video ID format: ${videoId}. Cannot search for subtitles.`);
        return null;
    }
    
    const searchUrl = `https://api.opensubtitles.com/api/v1/subtitles?${searchParams}`;
    console.log(`[AI Logic] Searching for original subtitle at: ${searchUrl}`);

    try {
        const searchResponse = await fetch(searchUrl, { headers: { 'Api-Key': opensubtitlesApiKey, 'User-Agent': 'Stremio-AI-Sub-Addon/1.3' }});
        
        if (!searchResponse.ok) {
            console.error(`[AI Logic] OpenSubtitles search failed. Status: ${searchResponse.status}`);
            return null;
        }

        const searchData = await searchResponse.json();
        if (!searchData.data || searchData.data.length === 0) {
            console.warn(`[AI Logic] No Turkish subtitles found on OpenSubtitles for ${videoId}.`);
            return null;
        }

        const fileId = searchData.data[0].attributes.files[0].file_id;
        console.log(`[AI Logic] Found subtitle file ID: ${fileId}. Requesting download link.`);

        // --- Step 2: Get the download link from OpenSubtitles ---
        const downloadRequest = await fetch('https://api.opensubtitles.com/api/v1/download', {
            method: 'POST',
            headers: { 'Api-Key': opensubtitlesApiKey, 'Content-Type': 'application/json', 'User-Agent': 'Stremio-AI-Sub-Addon/1.3' },
            body: JSON.stringify({ file_id: fileId })
        });

        if (!downloadRequest.ok) {
            console.error(`[AI Logic] Failed to get download link. Status: ${downloadRequest.status}`);
            return null;
        }

        const downloadData = await downloadRequest.json();
        const downloadLink = downloadData.link;
        if (!downloadLink) {
            console.error("[AI Logic] Download link was not provided by OpenSubtitles.");
            return null;
        }
        console.log(`[AI Logic] Got download link. Downloading original content...`);
        
        // --- Step 3: Download the actual subtitle file ---
        const subtitleResponse = await fetch(downloadLink);
        const originalContent = await subtitleResponse.text();
        console.log(`[AI Logic] Downloaded original subtitle content (${originalContent.length} chars).`);

        // --- Step 4: Send the content to Gemini for correction ---
        console.log("[AI Logic] Sending to Gemini for correction...");
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${geminiApiKey}`;
        const prompt = `Review the following Turkish subtitle file for any sync issues or timing drift. Return only the corrected subtitle file in the exact same SRT format. Do not add any extra text or comments.\n\n${originalContent}`;
        
        const aiRes = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

        if (!aiRes.ok) {
            const errorText = await aiRes.text();
            console.error(`[AI Logic] Gemini API failed. Status: ${aiRes.status}. Body: ${errorText}`);
            return originalContent; // On failure, return the original subtitle
        }

        const aiData = await aiRes.json();
        const corrected = aiData?.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (corrected) {
            console.log("[AI Logic] Successfully received corrected subtitle from Gemini.");
            return corrected;
        } else {
            console.error("[AI Logic] Gemini response was empty or malformed.");
            return originalContent; // On failure, return the original
        }

    } catch (error) {
        console.error("[AI Logic] A critical error occurred during the subtitle process:", error);
        return null;
    }
}

module.exports = { getSubtitleUrlsForStremio, getAICorrectedSubtitle };
