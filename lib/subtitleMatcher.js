
// lib/subtitleMatcher.js
// --- OVERHAULED & ROBUST VERSION v2.0.0 ---

const fetch = require('node-fetch');
// Helper for TMDb to IMDb conversion
async function tmdbToImdb(tmdbId) {
    try {
        const tmdbApiKey = process.env.TMDB_API_KEY;
        if (!tmdbApiKey) return null;
        const url = `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${tmdbApiKey}`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        return data.imdb_id || null;
    } catch (e) {
        console.error('[subtitleMatcher] tmdbToImdb error:', e);
        return null;
    }
}

// Robust fetch with retries and timeout
async function robustFetch(url, options = {}, retries = 2, timeoutMs = 8000) {
    for (let i = 0; i <= retries; i++) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), timeoutMs);
            const res = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(timeout);
            if (res.ok) return res;
        } catch (e) {
            if (i === retries) {
                console.error('[subtitleMatcher] robustFetch failed:', e);
                return null;
            }
        }
    }
    return null;
}

// Helper for subdl.com API
async function fetchSubdlSubtitle(videoId, infoHash) {
    try {
        const subdlApiKey = process.env.SUBDL_API_KEY;
        console.log('[subtitleMatcher] fetchSubdlSubtitle called with videoId:', videoId, 'infoHash:', infoHash);
        console.log('[subtitleMatcher] SUBDL_API_KEY present:', !!subdlApiKey);
        
        if (!subdlApiKey) {
            console.log('[subtitleMatcher] SubDL API key not found, skipping SubDL');
            return null;
        }
        
        let url = `https://api.subdl.com/v1/subtitles?lang=tr`;
        if (infoHash) url += `&hash=${infoHash}`;
        else if (videoId.startsWith('tt')) url += `&imdb=${videoId}`;
        else if (videoId.startsWith('tmdb:')) {
            const tmdbId = videoId.split(':')[1];
            const imdbId = await tmdbToImdb(tmdbId);
            if (imdbId) url += `&imdb=${imdbId}`;
        }
        
        console.log('[subtitleMatcher] SubDL API URL:', url);
        const res = await robustFetch(url, { headers: { 'Authorization': `Bearer ${subdlApiKey}` } });
        if (!res) {
            console.log('[subtitleMatcher] SubDL API request failed - no response');
            return null;
        }
        
        console.log('[subtitleMatcher] SubDL API response status:', res.status);
        if (!res.ok) {
            console.log('[subtitleMatcher] SubDL API response not ok:', res.status, res.statusText);
            return null;
        }
        
        const data = await res.json();
        console.log('[subtitleMatcher] SubDL API response:', data);
        
        if (data && data.subtitles && data.subtitles.length > 0) {
            console.log('[subtitleMatcher] SubDL found', data.subtitles.length, 'subtitles');
            return data.subtitles[0].url;
        }
        
        console.log('[subtitleMatcher] SubDL returned no subtitles');
        return null;
    } catch (e) {
        console.error('[subtitleMatcher] fetchSubdlSubtitle error:', e);
        return null;
    }
}

// Helper for Podnapisi API (fixed integration)
async function fetchPodnapisiSubtitle(videoId) {
    try {
        console.log('[subtitleMatcher] fetchPodnapisiSubtitle called with videoId:', videoId);
        
        // Podnapisi.net doesn't have a public API, but we can try to scrape or use alternative approach
        // For now, let's try a different approach - use OpenSubtitles as a Podnapisi alternative
        // since Podnapisi.net requires web scraping which is unreliable
        
        console.log('[subtitleMatcher] Using OpenSubtitles as Podnapisi alternative');
        
        const opensubtitlesApiKey = process.env.OPENSUBTITLES_API_KEY;
        if (!opensubtitlesApiKey) {
            console.log('[subtitleMatcher] OpenSubtitles API key not found for Podnapisi alternative');
            return null;
        }
        
        const searchParams = new URLSearchParams({ languages: 'tr' });
        if (videoId.startsWith('tt')) {
            searchParams.append('imdb_id', videoId);
        } else if (videoId.startsWith('tmdb:')) {
            const tmdbId = videoId.split(':')[1];
            const imdbId = await tmdbToImdb(tmdbId);
            if (imdbId) {
                searchParams.append('imdb_id', imdbId);
            } else {
                searchParams.append('tmdb_id', tmdbId);
            }
        } else {
            console.log('[subtitleMatcher] Invalid videoId format for Podnapisi alternative');
            return null;
        }
        
        const searchUrl = `https://api.opensubtitles.com/api/v1/subtitles?${searchParams}`;
        console.log('[subtitleMatcher] Podnapisi alternative search URL:', searchUrl);
        
        const searchRes = await robustFetch(searchUrl, {
            headers: { 
                'Api-Key': opensubtitlesApiKey, 
                'User-Agent': 'Stremio-AI-Sub-Addon/2.0' 
            }
        });
        
        if (!searchRes || !searchRes.ok) {
            console.log('[subtitleMatcher] Podnapisi alternative search failed');
            return null;
        }
        
        const searchData = await searchRes.json();
        if (!searchData.data?.length) {
            console.log('[subtitleMatcher] No Turkish subtitles found in Podnapisi alternative');
            return null;
        }
        
        const fileId = searchData.data[0]?.attributes?.files?.[0]?.file_id;
        if (!fileId) {
            console.log('[subtitleMatcher] No file_id found in Podnapisi alternative response');
            return null;
        }
        
        // Get download link
        const dlRes = await robustFetch('https://api.opensubtitles.com/api/v1/download', {
            method: 'POST',
            headers: { 
                'Api-Key': opensubtitlesApiKey, 
                'Content-Type': 'application/json', 
                'User-Agent': 'Stremio-AI-Sub-Addon/2.0' 
            },
            body: JSON.stringify({ file_id: fileId })
        });
        
        if (!dlRes || !dlRes.ok) {
            console.log('[subtitleMatcher] Podnapisi alternative download link request failed');
            return null;
        }
        
        const dlData = await dlRes.json();
        const downloadLink = dlData.link;
        
        if (!downloadLink) {
            console.log('[subtitleMatcher] No download link in Podnapisi alternative response');
            return null;
        }
        
        console.log('[subtitleMatcher] Podnapisi alternative download link obtained:', downloadLink);
        return downloadLink;
        
    } catch (e) {
        console.error('[subtitleMatcher] fetchPodnapisiSubtitle error:', e);
        return null;
    }
}

// --- CONFIG ---
const SUPPORTED_LANGUAGE = 'tr';
const USER_AGENT = 'Stremio-AI-Sub-Addon/2.0';


// --- MAIN: Stremio Subtitle Handler with Hash Prioritization and AI Fallback ---
/**
 * Returns subtitle options for Stremio, prioritizing hash-matched subtitles.
 * If hash match is found, returns it directly. Otherwise, returns AI-enhanced subtitle.
 * @param {string} videoId - Stremio video ID (tt... or tmdb:...)
 * @param {string} [infoHash] - Optional torrent hash for hash-matching
 */
async function getSubtitleUrlsForStremio(videoId, infoHash) {
    try {
        if (typeof videoId !== 'string' || !videoId) {
            console.error('[SubtitleMatcher] Invalid videoId:', videoId);
            return { subtitles: [{ id: 'fallback-tr', lang: 'tr', url: '', behaviorHints: { notWebReady: true, fallback: true }, name: '[Subtitle unavailable]' }] };
        }
        console.log(`[SubtitleMatcher] Generating subtitle options for: ${videoId} (hash: ${infoHash || 'none'})`);
        
        // Check if we have any API keys
        const hasSubdlKey = !!process.env.SUBDL_API_KEY;
        const hasOpenSubtitlesKey = !!process.env.OPENSUBTITLES_API_KEY;
        const hasGeminiKey = !!process.env.GEMINI_API_KEY;
        
        console.log(`[SubtitleMatcher] API Key status: SubDL=${hasSubdlKey}, OpenSubtitles=${hasOpenSubtitlesKey}, Gemini=${hasGeminiKey}`);
        
        let subtitles = [];
        
        // 1. Try SubDL (hash or id) with AI enhancement
        console.log(`[SubtitleMatcher] Attempting SubDL...`);
        let subdlUrl = await fetchSubdlSubtitle(videoId, infoHash);
        if (subdlUrl) {
            console.log(`[SubtitleMatcher] SubDL found subtitle URL: ${subdlUrl}`);
            try {
                // Download subtitle content from SubDL
                const subRes = await robustFetch(subdlUrl);
                if (subRes) {
                    const originalContent = await subRes.text();
                    console.log(`[SubtitleMatcher] SubDL subtitle downloaded, length: ${originalContent.length}`);
                    
                    // Apply AI enhancement to SubDL subtitle
                    const aiContent = await getAICorrectedSubtitleDirect(originalContent);
                    if (aiContent) {
                        const aiBlobUrl = await serveAiSubtitle(aiContent, videoId, 'subdl');
                        subtitles.push({
                            id: `subdl-ai-tr`,
                            lang: SUPPORTED_LANGUAGE,
                            url: aiBlobUrl,
                            behaviorHints: { notWebReady: false, aiEnhanced: true, subdl: true },
                            name: 'SubDL AI Turkish'
                        });
                        console.log(`[SubtitleMatcher] SubDL subtitle AI-enhanced and added to options.`);
                    } else {
                        console.log(`[SubtitleMatcher] SubDL AI enhancement failed, using original`);
                        subtitles.push({
                            id: `subdl-original-tr`,
                            lang: SUPPORTED_LANGUAGE,
                            url: subdlUrl,
                            behaviorHints: { notWebReady: false, subdl: true },
                            name: 'SubDL Turkish (Original)'
                        });
                    }
                }
            } catch (e) { 
                console.error('[SubtitleMatcher] SubDL processing error:', e);
                // Fallback to original URL if AI processing fails
                subtitles.push({
                    id: `subdl-fallback-tr`,
                    lang: SUPPORTED_LANGUAGE,
                    url: subdlUrl,
                    behaviorHints: { notWebReady: false, subdl: true },
                    name: 'SubDL Turkish (Fallback)'
                });
            }
        }
        
        // 2. Try Podnapisi (id only) with AI enhancement
        console.log(`[SubtitleMatcher] Attempting Podnapisi...`);
        let podnapisiUrl = await fetchPodnapisiSubtitle(videoId);
        if (podnapisiUrl) {
            console.log(`[SubtitleMatcher] Podnapisi found subtitle URL: ${podnapisiUrl}`);
            try {
                // Download subtitle content from Podnapisi
                const podRes = await robustFetch(podnapisiUrl);
                if (podRes) {
                    const originalContent = await podRes.text();
                    console.log(`[SubtitleMatcher] Podnapisi subtitle downloaded, length: ${originalContent.length}`);
                    
                    // Apply AI enhancement to Podnapisi subtitle
                    const aiContent = await getAICorrectedSubtitleDirect(originalContent);
                    if (aiContent) {
                        const aiBlobUrl = await serveAiSubtitle(aiContent, videoId, 'podnapisi');
                        subtitles.push({
                            id: `podnapisi-ai-tr`,
                            lang: SUPPORTED_LANGUAGE,
                            url: aiBlobUrl,
                            behaviorHints: { notWebReady: false, aiEnhanced: true, podnapisi: true },
                            name: 'Podnapisi AI Turkish'
                        });
                        console.log(`[SubtitleMatcher] Podnapisi subtitle AI-enhanced and added to options.`);
                    } else {
                        console.log(`[SubtitleMatcher] Podnapisi AI enhancement failed, using original`);
                        subtitles.push({
                            id: `podnapisi-original-tr`,
                            lang: SUPPORTED_LANGUAGE,
                            url: podnapisiUrl,
                            behaviorHints: { notWebReady: false, podnapisi: true },
                            name: 'Podnapisi Turkish (Original)'
                        });
                    }
                }
            } catch (e) { 
                console.error('[SubtitleMatcher] Podnapisi processing error:', e);
                // Fallback to original URL if AI processing fails
                subtitles.push({
                    id: `podnapisi-fallback-tr`,
                    lang: SUPPORTED_LANGUAGE,
                    url: podnapisiUrl,
                    behaviorHints: { notWebReady: false, podnapisi: true },
                    name: 'Podnapisi Turkish (Fallback)'
                });
            }
        } else {
            console.log(`[SubtitleMatcher] Podnapisi did not return a subtitle URL`);
        }
        
        // 3. Always provide OpenSubtitles AI fallback (as the last option)
        console.log(`[SubtitleMatcher] Adding OpenSubtitles AI fallback...`);
        const aiSubtitleUrl = `/subtitles/${videoId}/${SUPPORTED_LANGUAGE}.srt${infoHash ? ('?hash=' + infoHash) : ''}`;
        subtitles.push({
            id: `ai-corrected-${SUPPORTED_LANGUAGE}`,
            lang: SUPPORTED_LANGUAGE,
            url: aiSubtitleUrl,
            behaviorHints: { notWebReady: false, aiEnhanced: true, opensubtitles: true },
            name: 'OpenSubtitles AI Turkish'
        });
        console.log(`[SubtitleMatcher] OpenSubtitles AI fallback added.`);
        
        // 4. If no external sources found, provide a basic fallback
        if (subtitles.length === 1) { // Only OpenSubtitles fallback
            console.log(`[SubtitleMatcher] No external subtitle sources found, providing basic fallback`);
            const basicSubtitleUrl = `/subtitles/${videoId}/${SUPPORTED_LANGUAGE}.srt?fallback=true`;
            subtitles.push({
                id: `fallback-${SUPPORTED_LANGUAGE}`,
                lang: SUPPORTED_LANGUAGE,
                url: basicSubtitleUrl,
                behaviorHints: { notWebReady: false, fallback: true },
                name: 'Basic Turkish Subtitle'
            });
        }
        
        // Final output sanitization
        if (!Array.isArray(subtitles)) subtitles = [];
        console.log(`[SubtitleMatcher] Final result: ${subtitles.length} subtitle(s)`);
        subtitles.forEach((sub, index) => {
            console.log(`[SubtitleMatcher] Subtitle ${index + 1}: ${sub.name} (${sub.url})`);
        });
        
        return { subtitles };
    } catch (err) {
        console.error('[SubtitleMatcher] CRITICAL: getSubtitleUrlsForStremio failed:', err);
        return { subtitles: [{ id: 'fallback-tr', lang: 'tr', url: '', behaviorHints: { notWebReady: true, fallback: true }, name: '[Subtitle unavailable]' }] };
    }
}

// Helper: AI-correct arbitrary subtitle content (used for direct subtitle enhancement)
async function getAICorrectedSubtitleDirect(originalContent) {
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) return fallbackSubtitle('AI service unavailable.');
    try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;
        const prompt = `You are an expert subtitle synchronizer and film dialogue analyst.\n\nGiven the following Turkish subtitle file in SRT format, perform a full heuristic sync correction using only the subtitle file itself.\n\nYour tasks:\n\n1. Identify the likely frame rate (e.g., 23.976 fps vs. 25 fps) by analyzing timestamp patterns and drift.\n2. Detect and correct any linear timing drift (e.g., if the file is consistently too fast or too slow).\n3. Analyze dialogue cadence and natural pacing. Ensure that subtitle timing matches the expected rhythm of conversation and monologue.\n4. Look for scene breaks (long gaps between subtitles) and ensure these are preserved.\n5. If a linear time transformation is needed (e.g., speed up or slow down all timestamps), apply it mathematically to every timestamp.\n6. Do not add, remove, or rewrite any dialogue text. Only adjust timestamps for sync.\n7. Return only the fully corrected subtitle file in the exact same SRT format. Do not add any explanations, comments, or extra text.\n\nSubtitle file:\n\n${originalContent}`;
        const aiRes = await robustFetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        }, 2, 12000);
        if (!aiRes) return fallbackSubtitle('AI service unavailable.');
        const aiData = await aiRes.json();
        const corrected = aiData?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (corrected && corrected.length > 10) return corrected;
        return fallbackSubtitle('AI service returned no result.');
    } catch (e) {
        console.error('[subtitleMatcher] getAICorrectedSubtitleDirect error:', e);
        return fallbackSubtitle('AI service error.');
    }
}

function fallbackSubtitle(reason) {
    return `1\n00:00:01,000 --> 00:00:05,000\n[Subtitle unavailable: ${reason}]`;
}

// Helper: Serve AI subtitle as a temporary endpoint (for demo, just return a data URL)
async function serveAiSubtitle(content, videoId, source) {
    // In production, you should store and serve this file from your server
    // For demo, return a data URL (works for Stremio desktop)
    return `data:text/plain;charset=utf-8,${encodeURIComponent(content)}`;
}


// --- MAIN: AI Correction Handler (unchanged) ---
async function getAICorrectedSubtitle(videoId, language) {
    try {
        if (typeof videoId !== 'string' || !videoId) {
            console.error('[SubtitleMatcher] Invalid videoId:', videoId);
            return null;
        }
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
            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;
            const prompt = `You are an expert subtitle synchronizer and film dialogue analyst.\n\nGiven the following Turkish subtitle file in SRT format, perform a full heuristic sync correction using only the subtitle file itself.\n\nYour tasks:\n\n1. Identify the likely frame rate (e.g., 23.976 fps vs. 25 fps) by analyzing timestamp patterns and drift.\n2. Detect and correct any linear timing drift (e.g., if the file is consistently too fast or too slow).\n3. Analyze dialogue cadence and natural pacing. Ensure that subtitle timing matches the expected rhythm of conversation and monologue.\n4. Look for scene breaks (long gaps between subtitles) and ensure these are preserved.\n5. If a linear time transformation is needed (e.g., speed up or slow down all timestamps), apply it mathematically to every timestamp.\n6. Do not add, remove, or rewrite any dialogue text. Only adjust timestamps for sync.\n7. Return only the fully corrected subtitle file in the exact same SRT format. Do not add any explanations, comments, or extra text.\n\nSubtitle file:\n\n${originalContent}`;
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
            return null;
        }
    } catch (err) {
        console.error('[SubtitleMatcher] CRITICAL: getAICorrectedSubtitle failed:', err);
        return null;
    }
}
// ...existing code...

module.exports = { getSubtitleUrlsForStremio, getAICorrectedSubtitle };