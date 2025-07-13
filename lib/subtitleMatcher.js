// lib/subtitleMatcher.js
// --- OVERHAULED & ROBUST VERSION v2.0.0 ---

const fetch = require('node-fetch');
const zlib = require('zlib');
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

// Helper for subdl.com API - Fixed to comply with official API documentation
async function fetchSubdlSubtitle(videoId, infoHash) {
    try {
        const subdlApiKey = process.env.SUBDL_API_KEY;
        console.log('[subtitleMatcher] fetchSubdlSubtitle called with videoId:', videoId, 'infoHash:', infoHash);
        console.log('[subtitleMatcher] SUBDL_API_KEY present:', !!subdlApiKey);
        
        if (!subdlApiKey) {
            console.log('[subtitleMatcher] SubDL API key not found, skipping SubDL');
            return null;
        }
        
        // Build URL according to official SubDL API documentation
        const params = new URLSearchParams({
            api_key: subdlApiKey,
            languages: 'tr',
            subs_per_page: '10'
        });
        
        // Add ID parameters based on videoId format
        if (videoId.startsWith('tt')) {
            params.append('imdb_id', videoId);
            params.append('type', 'movie');
        } else if (videoId.startsWith('tmdb:')) {
            const tmdbId = videoId.split(':')[1];
            params.append('tmdb_id', tmdbId);
            params.append('type', 'movie');
            
            // Also try to get IMDb ID for better results
            const imdbId = await tmdbToImdb(tmdbId);
            if (imdbId) {
                params.append('imdb_id', imdbId);
            }
        }
        
        const url = `https://api.subdl.com/api/v1/subtitles?${params.toString()}`;
        console.log('[subtitleMatcher] SubDL API URL:', url);
        
        const res = await robustFetch(url, { 
            headers: { 
                'Accept': 'application/json',
                'User-Agent': 'Stremio-AI-Sub-Addon/2.0'
            } 
        });
        
        if (!res) {
            console.log('[subtitleMatcher] SubDL API request failed - no response');
            return null;
        }
        
        console.log('[subtitleMatcher] SubDL API response status:', res.status);
        if (!res.ok) {
            const errorText = await res.text();
            console.log('[subtitleMatcher] SubDL API response not ok:', res.status, res.statusText, errorText);
            return null;
        }
        
        const data = await res.json();
        console.log('[subtitleMatcher] SubDL API response:', JSON.stringify(data, null, 2));
        
        if (data && data.status === true && data.subtitles && data.subtitles.length > 0) {
            console.log('[subtitleMatcher] SubDL found', data.subtitles.length, 'subtitles');
            
            // Find Turkish subtitles - SubDL returns language as 'tr' or similar
            const turkishSubs = data.subtitles.filter(sub => 
                sub.lang === 'tr' || sub.language === 'tr' || sub.language === 'Turkish'
            );
            
            if (turkishSubs.length > 0) {
                // Build download URL according to SubDL documentation
                const subtitle = turkishSubs[0];
                // SubDL download URL format: https://dl.subdl.com/subtitle/{sd_id}.zip
                const downloadUrl = `https://dl.subdl.com/subtitle/${subtitle.sd_id}.zip`;
                console.log('[subtitleMatcher] SubDL download URL:', downloadUrl);
                return downloadUrl;
            }
        }
        
        console.log('[subtitleMatcher] SubDL returned no Turkish subtitles');
        return null;
    } catch (e) {
        console.error('[subtitleMatcher] fetchSubdlSubtitle error:', e);
        return null;
    }
}

// Helper for Podnapisi API (real Podnapisi.net integration via web scraping)
async function fetchPodnapisiSubtitle(videoId) {
    try {
        console.log('[subtitleMatcher] fetchPodnapisiSubtitle called with videoId:', videoId);
        
        let imdbId = videoId;
        
        // Convert TMDb to IMDb if needed
        if (videoId.startsWith('tmdb:')) {
            const tmdbIdOnly = videoId.split(':')[1];
            imdbId = await tmdbToImdb(tmdbIdOnly);
            if (!imdbId) {
                console.log('[subtitleMatcher] Failed to convert TMDb to IMDb for Podnapisi');
                return null;
            }
        }
        
        // Podnapisi only works with IMDb IDs
        if (!imdbId || !imdbId.startsWith('tt')) {
            console.log('[subtitleMatcher] Invalid IMDb ID for Podnapisi:', imdbId);
            return null;
        }
        
        // Search for subtitles on Podnapisi.net
        const searchUrl = `https://podnapisi.net/subtitles/search/advanced?keywords=${imdbId}&language=sl%2Cen%2Ctr&movie_type=movie%2Ctv-series&seasons=&episodes=&year=&fps=&cd_number=&uploader=&film_id=&sort=date&order=desc`;
        console.log('[subtitleMatcher] Podnapisi search URL:', searchUrl);
        
        const searchRes = await robustFetch(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'tr,en-US;q=0.7,en;q=0.3',
                'Accept-Encoding': 'gzip, deflate, br',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            }
        });
        
        if (!searchRes || !searchRes.ok) {
            console.log('[subtitleMatcher] Podnapisi search failed:', searchRes?.status);
            return null;
        }
        
        const searchHtml = await searchRes.text();
        console.log('[subtitleMatcher] Podnapisi search response length:', searchHtml.length);
        
        // Parse HTML to find Turkish subtitle links
        // Look for subtitle rows with Turkish language - try multiple approaches
        let downloadUrl = null;
        
        // Approach 1: Look for Turkish language specifically
        const turkishSubRegex = /<tr[^>]*>[\s\S]*?<td[^>]*class="language"[^>]*>[\s\S]*?turkish[\s\S]*?<\/td>[\s\S]*?<a[^>]*href="([^"]*\/download\/[^"]*)"[^>]*>[\s\S]*?<\/tr>/gi;
        const turkishMatches = [...searchHtml.matchAll(turkishSubRegex)];
        
        if (turkishMatches.length > 0) {
            downloadUrl = turkishMatches[0][1];
            console.log('[subtitleMatcher] Found Turkish subtitle via language-specific search');
        }
        
        // Approach 2: Look for any download links with Turkish indicators
        if (!downloadUrl) {
            const turkishIndicatorRegex = /href="([^"]*\/download\/[^"]*)"[^>]*>[^<]*(?:turkish|türkçe|tr\b)[^<]*/gi;
            const indicatorMatches = [...searchHtml.matchAll(turkishIndicatorRegex)];
            if (indicatorMatches.length > 0) {
                downloadUrl = indicatorMatches[0][1];
                console.log('[subtitleMatcher] Found Turkish subtitle via indicator search');
            }
        }
        
        // Approach 3: Look for any download links and filter by context
        if (!downloadUrl) {
            const allDownloadRegex = /href="([^"]*\/download\/[^"]*)"[^>]*>(?:[^<]*download[^<]*|[^<]*indir[^<]*)/gi;
            const allMatches = [...searchHtml.matchAll(allDownloadRegex)];
            
            // Filter for Turkish content by looking at surrounding text
            for (const match of allMatches) {
                const downloadPath = match[1];
                const matchIndex = match.index;
                const surroundingText = searchHtml.substring(Math.max(0, matchIndex - 200), matchIndex + 200).toLowerCase();
                
                if (surroundingText.includes('turkish') || surroundingText.includes('türkçe') || surroundingText.includes('tr">') || surroundingText.includes('tr ')) {
                    downloadUrl = downloadPath;
                    console.log('[subtitleMatcher] Found Turkish subtitle via context search');
                    break;
                }
            }
        }
        
        // Approach 4: Fallback to first available download link
        if (!downloadUrl) {
            const fallbackRegex = /href="([^"]*\/download\/[^"]*)"[^>]*>/gi;
            const fallbackMatches = [...searchHtml.matchAll(fallbackRegex)];
            
            if (fallbackMatches.length > 0) {
                downloadUrl = fallbackMatches[0][1];
                console.log('[subtitleMatcher] Using first available Podnapisi download as fallback');
            }
        }
        
        if (!downloadUrl) {
            console.log('[subtitleMatcher] No download links found on Podnapisi');
            return null;
        }
        
        // Ensure the URL is absolute
        const fullDownloadUrl = downloadUrl.startsWith('http') ? downloadUrl : `https://podnapisi.net${downloadUrl}`;
        
        console.log('[subtitleMatcher] Found Podnapisi subtitle download URL:', fullDownloadUrl);
        return fullDownloadUrl;
        
    } catch (e) {
        console.error('[subtitleMatcher] fetchPodnapisiSubtitle error:', e);
        return null;
    }
}

// Add zlib for decompressing Podnapisi subtitle files
// Helper function to decompress subtitle content if needed
async function decompressSubtitleContent(responseOrBuffer) {
    try {
        let buffer;
        let contentEncoding = null;
        let contentType = null;
        
        // Handle both response objects and raw buffers
        if (responseOrBuffer.headers) {
            // It's a response object
            contentEncoding = responseOrBuffer.headers.get('content-encoding');
            contentType = responseOrBuffer.headers.get('content-type') || '';
            buffer = await responseOrBuffer.buffer();
        } else {
            // It's already a buffer
            buffer = responseOrBuffer;
        }
        
        // Try to decompress if it looks like compressed content
        if (contentEncoding === 'gzip' || contentType.includes('application/gzip') || contentType.includes('application/x-gzip')) {
            console.log('[subtitleMatcher] Decompressing gzipped subtitle content');
            return zlib.gunzipSync(buffer).toString('utf-8');
        } else if (contentEncoding === 'deflate') {
            console.log('[subtitleMatcher] Decompressing deflated subtitle content');
            return zlib.inflateSync(buffer).toString('utf-8');
        } else {
            // Try to detect compression by checking the first few bytes
            const firstBytes = buffer.slice(0, 3);
            if (firstBytes[0] === 0x1f && firstBytes[1] === 0x8b) {
                // GZIP magic number
                console.log('[subtitleMatcher] Detected GZIP format, decompressing...');
                return zlib.gunzipSync(buffer).toString('utf-8');
            } else if (firstBytes[0] === 0x78 && (firstBytes[1] === 0x9c || firstBytes[1] === 0x01 || firstBytes[1] === 0xda)) {
                // DEFLATE magic number
                console.log('[subtitleMatcher] Detected DEFLATE format, decompressing...');
                return zlib.inflateSync(buffer).toString('utf-8');
            } else {
                // Regular text content
                return buffer.toString('utf-8');
            }
        }
    } catch (e) {
        console.error('[subtitleMatcher] Error decompressing subtitle content:', e);
        // Fallback to regular text
        try {
            if (responseOrBuffer.text) {
                return await responseOrBuffer.text();
            } else {
                return responseOrBuffer.toString('utf-8');
            }
        } catch (fallbackError) {
            console.error('[subtitleMatcher] Fallback text extraction also failed:', fallbackError);
            return null;
        }
    }
}

// Helper function to decompress ZIP files from SubDL
async function decompressZipSubtitle(response) {
    try {
        const AdmZip = require('adm-zip');
        const buffer = await response.buffer();
        const zip = new AdmZip(buffer);
        const zipEntries = zip.getEntries();
        
        // Find the first .srt file in the ZIP
        for (const entry of zipEntries) {
            if (entry.entryName.endsWith('.srt')) {
                console.log('[subtitleMatcher] Found SRT file in ZIP:', entry.entryName);
                return entry.getData().toString('utf8');
            }
        }
        
        console.log('[subtitleMatcher] No SRT file found in ZIP, available files:', zipEntries.map(e => e.entryName));
        return null;
    } catch (e) {
        console.error('[subtitleMatcher] Error decompressing ZIP subtitle:', e);
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
            return { subtitles: [{ id: 'fallback-tr', lang: 'tr', url: `data:text/plain;charset=utf-8,${encodeURIComponent(fallbackSubtitle('Invalid video ID'))}`, behaviorHints: { notWebReady: false, fallback: true }, name: '[Subtitle unavailable]' }] };
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
                // Download subtitle content from SubDL (ZIP format)
                const subRes = await robustFetch(subdlUrl);
                if (subRes) {
                    // SubDL returns ZIP files, decompress them
                    let originalContent;
                    if (subdlUrl.endsWith('.zip')) {
                        originalContent = await decompressZipSubtitle(subRes);
                    } else {
                        originalContent = await subRes.text();
                    }
                    
                    if (originalContent) {
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
                            // Store original content as data URL since ZIP files can't be directly linked
                            const originalDataUrl = `data:text/plain;charset=utf-8,${encodeURIComponent(originalContent)}`;
                            subtitles.push({
                                id: `subdl-original-tr`,
                                lang: SUPPORTED_LANGUAGE,
                                url: originalDataUrl,
                                behaviorHints: { notWebReady: false, subdl: true },
                                name: 'SubDL Turkish (Original)'
                            });
                        }
                    } else {
                        console.log(`[SubtitleMatcher] Failed to decompress SubDL ZIP file`);
                    }
                }
            } catch (e) { 
                console.error('[SubtitleMatcher] SubDL processing error:', e);
                // Fallback to data URL if AI processing fails
                if (subdlUrl) {
                    const fallbackDataUrl = `data:text/plain;charset=utf-8,${encodeURIComponent(fallbackSubtitle('SubDL processing error'))}`;
                    subtitles.push({
                        id: `subdl-fallback-tr`,
                        lang: SUPPORTED_LANGUAGE,
                        url: fallbackDataUrl,
                        behaviorHints: { notWebReady: false, subdl: true },
                        name: 'SubDL Turkish (Fallback)'
                    });
                }
            }
        }
        
        // 2. Try Podnapisi (id only) with AI enhancement
        console.log(`[SubtitleMatcher] Attempting Podnapisi...`);
        let podnapisiUrl = await fetchPodnapisiSubtitle(videoId);
        if (podnapisiUrl) {
            console.log(`[SubtitleMatcher] Podnapisi found subtitle URL: ${podnapisiUrl}`);
            try {
                // Download subtitle content from Podnapisi with enhanced processing
                const searchUrl = `https://podnapisi.net/subtitles/search/advanced?keywords=${encodeURIComponent(videoId)}&language=tr&movie_type=movie%2Ctv-series&sort=date&order=desc`;
                const originalContent = await downloadPodnapisiSubtitle(podnapisiUrl, searchUrl);
                
                if (originalContent) {
                    console.log(`[SubtitleMatcher] Podnapisi subtitle downloaded, length: ${originalContent.length}`);
                    
                    // Validate that we got actual subtitle content
                    if (isValidSubtitleContent(originalContent)) {
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
                            // Store original content as data URL since it's not a direct download link
                            const originalDataUrl = `data:text/plain;charset=utf-8,${encodeURIComponent(originalContent)}`;
                            subtitles.push({
                                id: `podnapisi-original-tr`,
                                lang: SUPPORTED_LANGUAGE,
                                url: originalDataUrl,
                                behaviorHints: { notWebReady: false, podnapisi: true },
                                name: 'Podnapisi Turkish (Original)'
                            });
                        }
                    } else {
                        console.log(`[SubtitleMatcher] Podnapisi response doesn't look like subtitle content, got:`, originalContent.substring(0, 200));
                    }
                } else {
                    console.log(`[SubtitleMatcher] Failed to download content from Podnapisi`);
                }
            } catch (e) { 
                console.error('[SubtitleMatcher] Podnapisi processing error:', e);
                // Don't add fallback for Podnapisi since the URL might not be valid
                console.log(`[SubtitleMatcher] Skipping Podnapisi fallback due to processing error`);
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
        return { subtitles: [{ id: 'fallback-tr', lang: 'tr', url: `data:text/plain;charset=utf-8,${encodeURIComponent(fallbackSubtitle('System error'))}`, behaviorHints: { notWebReady: false, fallback: true }, name: '[Subtitle unavailable]' }] };
    }
}

// Helper: AI-correct arbitrary subtitle content (used for direct subtitle enhancement)
async function getAICorrectedSubtitleDirect(originalContent) {
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) return fallbackSubtitle('AI service unavailable.');
    
    const startTime = Date.now();
    console.log('[subtitleMatcher] Starting AI enhancement...');
    
    try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;
        const prompt = `You are an expert subtitle synchronizer and film dialogue analyst.\n\nGiven the following Turkish subtitle file in SRT format, perform a full heuristic sync correction using only the subtitle file itself.\n\nYour tasks:\n\n1. Identify the likely frame rate (e.g., 23.976 fps vs. 25 fps) by analyzing timestamp patterns and drift.\n2. Detect and correct any linear timing drift (e.g., if the file is consistently too fast or too slow).\n3. Analyze dialogue cadence and natural pacing. Ensure that subtitle timing matches the expected rhythm of conversation and monologue.\n4. Look for scene breaks (long gaps between subtitles) and ensure these are preserved.\n5. If a linear time transformation is needed (e.g., speed up or slow down all timestamps), apply it mathematically to every timestamp.\n6. Do not add, remove, or rewrite any dialogue text. Only adjust timestamps for sync.\n7. Return only the fully corrected subtitle file in the exact same SRT format. Do not add any explanations, comments, or extra text.\n\nSubtitle file:\n\n${originalContent}`;
        
        const aiRes = await robustFetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    maxOutputTokens: 80000,
                    temperature: 0.1
                }
            })
        }, 1, 8000); // Reduced timeout to 8 seconds and only 1 retry
        
        if (!aiRes) {
            const duration = Date.now() - startTime;
            console.log(`[subtitleMatcher] AI enhancement failed after ${duration}ms - timeout`);
            return fallbackSubtitle('AI service timeout.');
        }
        
        const aiData = await aiRes.json();
        const corrected = aiData?.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (corrected && corrected.length > 10) {
            const duration = Date.now() - startTime;
            console.log(`[subtitleMatcher] AI enhancement successful in ${duration}ms`);
            return corrected;
        }
        
        console.log('[subtitleMatcher] AI enhancement returned empty result');
        return fallbackSubtitle('AI service returned no result.');
        
    } catch (e) {
        const duration = Date.now() - startTime;
        console.error(`[subtitleMatcher] AI enhancement error after ${duration}ms:`, e.message);
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

// Helper function to validate subtitle content
function isValidSubtitleContent(content) {
    if (!content || typeof content !== 'string') {
        return false;
    }
    
    // Check for common subtitle formats
    const hasTimeCode = content.includes('-->') || content.includes('WEBVTT') || content.match(/^\d+$/m);
    const hasRealContent = content.trim().length > 50; // At least some meaningful content
    const notErrorPage = !content.toLowerCase().includes('<html>') && !content.toLowerCase().includes('<body>');
    
    return hasTimeCode && hasRealContent && notErrorPage;
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

// Function to download and process Podnapisi subtitle content
async function downloadPodnapisiSubtitle(downloadUrl, searchUrl) {
    try {
        console.log('[subtitleMatcher] Downloading subtitle from:', downloadUrl);
        
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                console.log(`[subtitleMatcher] Podnapisi download attempt ${attempt}/3`);
                
                const subtitleResponse = await fetch(downloadUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.5',
                        'Accept-Encoding': 'gzip, deflate, br',
                        'Connection': 'keep-alive',
                        'Upgrade-Insecure-Requests': '1',
                        'Sec-Fetch-Dest': 'document',
                        'Sec-Fetch-Mode': 'navigate',
                        'Sec-Fetch-Site': 'same-origin',
                        'Referer': searchUrl
                    },
                    timeout: 15000
                });
                
                if (!subtitleResponse.ok) {
                    console.log(`[subtitleMatcher] Podnapisi download attempt ${attempt} failed:`, subtitleResponse.status);
                    if (attempt === 3) {
                        console.log('[subtitleMatcher] All Podnapisi download attempts failed');
                        return null;
                    }
                    continue;
                }
                
                // Get the raw content (might be compressed)
                const rawContent = await subtitleResponse.buffer();
                
                // Decompress if needed
                let subtitleContent = await decompressSubtitleContent(rawContent);
                
                if (!subtitleContent) {
                    console.log(`[subtitleMatcher] Failed to decompress Podnapisi subtitle on attempt ${attempt}`);
                    if (attempt === 3) {
                        console.log('[subtitleMatcher] All Podnapisi decompression attempts failed');
                        return null;
                    }
                    continue;
                }
                
                // Validate subtitle content
                if (!isValidSubtitleContent(subtitleContent)) {
                    console.log(`[subtitleMatcher] Invalid subtitle content from Podnapisi on attempt ${attempt}`);
                    if (attempt === 3) {
                        console.log('[subtitleMatcher] All Podnapisi validation attempts failed');
                        return null;
                    }
                    continue;
                }
                
                console.log('[subtitleMatcher] Successfully downloaded Podnapisi subtitle, length:', subtitleContent.length);
                return subtitleContent;
                
            } catch (error) {
                console.log(`[subtitleMatcher] Podnapisi download attempt ${attempt} error:`, error.message);
                if (attempt === 3) {
                    console.log('[subtitleMatcher] All Podnapisi download attempts failed with errors');
                    return null;
                }
                // Wait before retry
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            }
        }
        
        return null;
        
    } catch (e) {
        console.error('[subtitleMatcher] downloadPodnapisiSubtitle error:', e);
        return null;
    }
}

module.exports = { getSubtitleUrlsForStremio, getAICorrectedSubtitle };