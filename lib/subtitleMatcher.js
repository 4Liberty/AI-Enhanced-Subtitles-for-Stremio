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
    // Force Turkish only
    preferredLanguages = ['tr'];

// lib/subtitleMatcher.js
// --- VERSION WITH DETAILED LOGGING FOR DEBUGGING ---

const fetch = require('node-fetch');
const config = require('../config');
const cache = new Map();

// This is a placeholder for your real Torrentio provider logic.
// Since you are only making a subtitle addon, this is not used.
const torrentioProvider = {
    getStreams: async (type, id) => {
        return [];
    }
};

async function getEnrichedStreams(type, id, userConfig) {
    // This function is not used since you removed the stream provider parts.
    return [];
}


/**
 * Main function called by Stremio to get subtitles.
 */
async function getSubtitleUrlsForStremio(infoHash, preferredLanguages = ['en']) {
    console.log("--- [START] getSubtitleUrlsForStremio ---");
    // Force Turkish only, as per your requirement
    preferredLanguages = ['tr'];
    console.log(`Forcing preferred language to: ${preferredLanguages.join(', ')}`);

    let imdbId = null;
    let tmdbId = null;

    if (typeof infoHash === 'string' && infoHash.startsWith('tt')) {
        imdbId = infoHash;
    } else if (typeof infoHash === 'string' && infoHash.startsWith('tmdb:')) {
        tmdbId = infoHash.split(':')[1];
        console.log(`Detected TMDb ID: ${tmdbId}`);
        const tmdbApiKey = process.env.TMDB_API_KEY || config.TMDB_API_KEY;

        if (tmdbApiKey) {
            console.log("TMDB API Key is present. Attempting to convert TMDb ID to IMDb ID.");
            try {
                // Try movie endpoint first
                let tmdbRes = await fetch(`https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${tmdbApiKey}`);
                if (tmdbRes.ok) {
                    const tmdbData = await tmdbRes.json();
                    if (tmdbData.imdb_id) {
                        imdbId = tmdbData.imdb_id;
                        console.log(`Successfully converted TMDb ID ${tmdbId} to IMDb ID: ${imdbId}`);
                    }
                }
                
                // If not found, try TV endpoint
                if (!imdbId) {
                    tmdbRes = await fetch(`https://api.themoviedb.org/3/tv/${tmdbId}/external_ids?api_key=${tmdbApiKey}`);
                    if (tmdbRes.ok) {
                        const tmdbData = await tmdbRes.json();
                        if (tmdbData.imdb_id) {
                            imdbId = tmdbData.imdb_id;
                            console.log(`Successfully converted TMDb TV ID ${tmdbId} to IMDb ID: ${imdbId}`);
                        }
                    }
                }

                if (!imdbId) {
                    console.warn(`Could not find an IMDb ID for TMDb ID: ${tmdbId}`);
                }
            } catch (e) {
                console.error('TMDb to IMDb conversion completely failed:', e.message);
            }
        } else {
            console.warn('TMDB_API_KEY is not set. Cannot convert TMDb ID to IMDb ID.');
        }
    }

    // Prepare for the AI subtitle option
    const aiSubtitleUrl = `/ai-corrected-subtitle/${imdbId || `tmdb:${tmdbId}`}/${preferredLanguages[0]}`;
    console.log(`Generated AI Subtitle URL: ${aiSubtitleUrl}`);
    
    let subtitles = [{
        lang: preferredLanguages[0],
        url: aiSubtitleUrl,
        id: `ai-corrected-${preferredLanguages[0]}`,
    }];
    
    console.log(`Returning AI subtitle option to Stremio. Now Stremio will call the AI endpoint.`);
    console.log("--- [END] getSubtitleUrlsForStremio ---");
    return { subtitles };
}


/**
 * Fetches and corrects a subtitle file. This is called by Stremio after the user selects the "AI-corrected" option.
 */
async function getAICorrectedSubtitle(videoId, language) {
    console.log("\n--- [START] getAICorrectedSubtitle ---");
    console.log(`Attempting to find and correct subtitle for Video ID: ${videoId}, Language: ${language}`);
    
    // Force Turkish only
    language = 'tr';

    let imdbId = null;
    let tmdbId = null;

    if (videoId.startsWith('tt')) {
        imdbId = videoId;
    } else if (videoId.startsWith('tmdb:')) {
        tmdbId = videoId.split(':')[1];
    }
    
    // --- Step 1: Find a subtitle file to download ---
    let downloadLink = null;
    const opensubtitlesApiKey = process.env.OPENSUBTITLES_API_KEY || config.OPENSUBTITLES_API_KEY;
    
    if (!opensubtitlesApiKey) {
        console.error("CRITICAL: OPENSUBTITLES_API_KEY is not set.");
        return null;
    }

    const searchParams = new URLSearchParams({ languages: language });
    if (imdbId) {
        searchParams.append('imdb_id', imdbId);
        console.log(`Searching OpenSubtitles with IMDb ID: ${imdbId}`);
    } else if (tmdbId) {
        searchParams.append('tmdb_id', tmdbId);
        console.log(`Searching OpenSubtitles with TMDb ID: ${tmdbId}`);
    } else {
        console.error("No valid ID (IMDb or TMDb) to search for subtitles.");
        return null;
    }

    const searchUrl = `https://api.opensubtitles.com/api/v1/subtitles?${searchParams}`;
    
    try {
        const response = await fetch(searchUrl, {
            headers: { 'Api-Key': opensubtitlesApiKey, 'User-Agent': 'StremioSubtitlesFast/1.0' }
        });
        
        console.log(`OpenSubtitles search response status: ${response.status}`);
        if (!response.ok) {
            console.error(`OpenSubtitles search failed. Status: ${response.status}`);
            return null;
        }

        const data = await response.json();
        if (data.data && data.data.length > 0) {
            const firstSub = data.data[0];
            const fileId = firstSub.attributes.files[0].file_id;
            console.log(`Found subtitle on OpenSubtitles. File ID: ${fileId}. Requesting download link.`);

            // We need to make a second request to get the actual download link
            const downloadRequestUrl = 'https://api.opensubtitles.com/api/v1/download';
            const downloadResponse = await fetch(downloadRequestUrl, {
                method: 'POST',
                headers: {
                    'Api-Key': opensubtitlesApiKey,
                    'Content-Type': 'application/json',
                    'User-Agent': 'StremioSubtitlesFast/1.0'
                },
                body: JSON.stringify({ file_id: fileId })
            });

            console.log(`OpenSubtitles download request status: ${downloadResponse.status}`);
            if (downloadResponse.ok) {
                const downloadData = await downloadResponse.json();
                downloadLink = downloadData.link;
                console.log(`Successfully retrieved download link: ${downloadLink}`);
            } else {
                console.error(`Failed to get download link from OpenSubtitles. Status: ${downloadResponse.status}`);
            }
        } else {
            console.warn("No subtitles found on OpenSubtitles for this ID.");
        }
    } catch (e) {
        console.error('Error during OpenSubtitles search:', e.message);
        return null;
    }

    if (!downloadLink) {
        console.error("Could not obtain a subtitle download link. Cannot proceed.");
        return null;
    }

    // --- Step 2: Download the subtitle file content ---
    let subtitleContent = null;
    try {
        console.log("Downloading original subtitle content...");
        const subRes = await fetch(downloadLink);
        if (subRes.ok) {
            subtitleContent = await subRes.text();
            console.log(`Successfully downloaded subtitle content (${subtitleContent.length} characters).`);
        } else {
            console.error(`Failed to download subtitle file. Status: ${subRes.status}`);
            return null;
        }
    } catch (e) {
        console.error('Subtitle download failed:', e.message);
        return null;
    }
    
    if (!subtitleContent) {
        console.error("Subtitle content is empty. Cannot proceed.");
        return null;
    }

    // --- Step 3: Send to Gemini API for correction ---
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
        console.error("CRITICAL: GEMINI_API_KEY is not set. Cannot perform AI correction.");
        return subtitleContent; // Return the original subtitle if no AI key
    }
    
    try {
        console.log("Sending subtitle content to Gemini AI for correction...");
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${geminiApiKey}`;
        const prompt = `You are an expert subtitle editor. The following is a Turkish subtitle file. Review it for any sync issues, timing drift (like PAL/NTSC mismatches), or linear offsets. Return only the corrected subtitle file in the exact same SRT format. Do not add any extra text, explanations, or comments. The output must be a valid SRT file. \n\n${subtitleContent}`;
        
        const aiRes = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    // Using a smaller token limit to be safe
                    maxOutputTokens: 8000
                }
            })
        });

        console.log(`Gemini API response status: ${aiRes.status}`);
        if (!aiRes.ok) {
            const errorBody = await aiRes.text();
            console.error(`Gemini AI correction failed. Status: ${aiRes.status}, Body: ${errorBody}`);
            return subtitleContent; // Return original on failure
        }
        
        const aiData = await aiRes.json();
        const corrected = aiData?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (corrected) {
            console.log("Successfully received corrected subtitle from Gemini AI.");
            console.log("--- [END] getAICorrectedSubtitle ---");
            return corrected;
        } else {
            console.error("Gemini AI response was empty or malformed.");
            return subtitleContent; // Return original on failure
        }
    } catch (e) {
        console.error('Gemini AI correction completely failed:', e.message);
        return subtitleContent; // Return original on failure
    }
}

module.exports = { getEnrichedStreams, getAICorrectedSubtitle, getSubtitleUrlsForStremio };
                }],
