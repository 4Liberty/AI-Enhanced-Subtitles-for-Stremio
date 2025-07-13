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
        
        // PRIORITY 1: Hash-based search if infoHash is provided
        if (infoHash) {
            console.log('[subtitleMatcher] SubDL: Using hash-based search with infoHash:', infoHash);
            params.append('hash', infoHash);
        } else {
            console.log('[subtitleMatcher] SubDL: Using ID-based search');
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
            
            // Find Turkish subtitles - SubDL returns various formats
            const turkishSubs = data.subtitles.filter(sub => {
                const lang = (sub.lang || '').toLowerCase();
                const language = (sub.language || '').toLowerCase();
                console.log(`[subtitleMatcher] Checking subtitle: lang="${lang}", language="${language}"`);
                const isMatch = lang === 'tr' || lang === 'turkish' || 
                               language === 'tr' || language === 'turkish';
                console.log(`[subtitleMatcher] Match result: ${isMatch}`);
                return isMatch;
            });
            
            console.log('[subtitleMatcher] Found', turkishSubs.length, 'Turkish subtitles after filtering');
            
            if (turkishSubs.length > 0) {
                const subtitle = turkishSubs[0];
                console.log('[subtitleMatcher] Selected subtitle:', JSON.stringify(subtitle, null, 2));
                
                // Build download URL - SubDL provides the relative URL in 'url' field
                // Full download URL format: https://dl.subdl.com{url}
                const downloadUrl = `https://dl.subdl.com${subtitle.url}`;
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
async function fetchPodnapisiSubtitle(videoId, infoHash) {
    try {
        console.log('[subtitleMatcher] fetchPodnapisiSubtitle called with videoId:', videoId, 'infoHash:', infoHash);
        
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
        
        // PRIORITY 1: Hash-based search if infoHash is provided
        let searchUrl;
        if (infoHash) {
            console.log('[subtitleMatcher] Podnapisi: Using hash-based search with infoHash:', infoHash);
            // Search by hash on Podnapisi - hash search is more specific
            searchUrl = `https://podnapisi.net/subtitles/search/advanced?keywords=${infoHash}&language=sl%2Cen%2Ctr&movie_type=movie%2Ctv-series&seasons=&episodes=&year=&fps=&cd_number=&uploader=&film_id=&sort=date&order=desc`;
        } else {
            console.log('[subtitleMatcher] Podnapisi: Using ID-based search');
            // Search for subtitles on Podnapisi.net by IMDb ID
            searchUrl = `https://podnapisi.net/subtitles/search/advanced?keywords=${imdbId}&language=sl%2Cen%2Ctr&movie_type=movie%2Ctv-series&seasons=&episodes=&year=&fps=&cd_number=&uploader=&film_id=&sort=date&order=desc`;
        }
        
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

// Helper function to decompress ZIP/RAR files from SubDL
async function decompressZipSubtitle(response, originalUrl) {
    try {
        const buffer = await response.buffer();
        
        // Check if it's a ZIP file
        if (originalUrl.endsWith('.zip')) {
            const AdmZip = require('adm-zip');
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
        } 
        // Handle RAR files - try to extract as text directly or look for patterns
        else if (originalUrl.endsWith('.rar')) {
            console.log('[subtitleMatcher] RAR file detected, attempting text extraction...');
            
            // For RAR files, we might need to use a different approach
            // First try to see if it's actually a ZIP file with .rar extension
            try {
                const AdmZip = require('adm-zip');
                const zip = new AdmZip(buffer);
                const zipEntries = zip.getEntries();
                
                for (const entry of zipEntries) {
                    if (entry.entryName.endsWith('.srt')) {
                        console.log('[subtitleMatcher] Found SRT file in RAR (treated as ZIP):', entry.entryName);
                        return entry.getData().toString('utf8');
                    }
                }
            } catch (e) {
                console.log('[subtitleMatcher] RAR file is not a ZIP, trying text extraction...');
            }
            
            // If that fails, try to extract text directly from the buffer
            // Look for SRT patterns in the raw data
            const text = buffer.toString('utf8');
            if (text.includes('-->') && text.match(/^\d+$/m)) {
                console.log('[subtitleMatcher] Found SRT content in RAR buffer');
                return text;
            }
            
            // Try latin1 encoding as fallback
            const latin1Text = buffer.toString('latin1');
            if (latin1Text.includes('-->') && latin1Text.match(/^\d+$/m)) {
                console.log('[subtitleMatcher] Found SRT content in RAR buffer (latin1)');
                return latin1Text;
            }
            
            console.log('[subtitleMatcher] Could not extract subtitle from RAR file');
            return null;
        }
        // Unknown format
        else {
            console.log('[subtitleMatcher] Unknown file format, trying direct text extraction...');
            const text = buffer.toString('utf8');
            if (text.includes('-->') && text.match(/^\d+$/m)) {
                return text;
            }
            return null;
        }
        
    } catch (e) {
        console.error('[subtitleMatcher] Error decompressing subtitle:', e);
        return null;
    }
}

// Helper function to download and process subtitle from URL
async function downloadAndProcessSubtitle(subtitleUrl, videoId, source) {
    try {
        console.log(`[SubtitleMatcher] Downloading ${source} subtitle from: ${subtitleUrl}`);
        const subRes = await robustFetch(subtitleUrl);
        if (!subRes) {
            console.log(`[SubtitleMatcher] ${source} download failed - no response from ${subtitleUrl}`);
            return null;
        }
        
        console.log(`[SubtitleMatcher] ${source} download successful, response status: ${subRes.status}`);
        
        // Handle different file formats
        let originalContent;
        if (subtitleUrl.endsWith('.zip') || subtitleUrl.endsWith('.rar')) {
            console.log(`[SubtitleMatcher] Decompressing ${subtitleUrl.endsWith('.zip') ? 'ZIP' : 'RAR'} file...`);
            originalContent = await decompressZipSubtitle(subRes, subtitleUrl);
        } else {
            console.log(`[SubtitleMatcher] Reading subtitle as plain text...`);
            originalContent = await subRes.text();
        }
        
        if (!originalContent) {
            console.log(`[SubtitleMatcher] Failed to extract content from ${source} file`);
            return null;
        }
        
        console.log(`[SubtitleMatcher] ${source} subtitle content extracted, length: ${originalContent.length}`);
        console.log(`[SubtitleMatcher] First 200 chars: ${originalContent.substring(0, 200)}`);
        
        // Validate subtitle format
        if (!isValidSubtitleContent(originalContent)) {
            console.log(`[SubtitleMatcher] ${source} subtitle content is not valid SRT format`);
            return null;
        }
        
        // Store content in cache
        await serveAiSubtitle(originalContent, videoId, source);
        return originalContent;
        
    } catch (e) {
        console.error(`[SubtitleMatcher] ${source} processing error:`, e);
        return null;
    }
}

// --- CONFIG ---
const SUPPORTED_LANGUAGE = 'tr';
const USER_AGENT = 'Stremio-AI-Sub-Addon/2.0';


// --- MAIN: Stremio Subtitle Handler with Seamless Progressive Enhancement ---
/**
 * Returns subtitle options for Stremio with instant response and background AI enhancement.
 * Strategy: Fast first response (original subtitles) + background AI processing for seamless UX.
 * @param {string} videoId - Stremio video ID (tt... or tmdb:...)
 * @param {string} [infoHash] - Optional torrent hash for hash-matching
 */
async function getSubtitleUrlsForStremio(videoId, infoHash) {
    try {
        if (typeof videoId !== 'string' || !videoId) {
            console.error('[SubtitleMatcher] Invalid videoId:', videoId);
            return { subtitles: [{ id: 'fallback-tr', lang: 'tr', url: `data:text/plain;charset=utf-8,${encodeURIComponent(fallbackSubtitle('Invalid video ID'))}`, behaviorHints: { notWebReady: false, fallback: true }, name: '[Subtitle unavailable]' }] };
        }
        
        console.log(`[SubtitleMatcher] SEAMLESS MODE: Fast subtitle discovery for: ${videoId} (hash: ${infoHash || 'none'})`);
        
        const startTime = Date.now();
        let subtitles = [];
        
        // STEP 1: Quick subtitle discovery (max 7 seconds total)
        console.log(`[SubtitleMatcher] Step 1: Quick discovery (parallel search)`);
        const quickResults = await getSubtitleQuickly(videoId, infoHash);
        
        if (quickResults.length > 0) {
            // STEP 2: Download the best available subtitle immediately
            const bestResult = quickResults[0];
            console.log(`[SubtitleMatcher] Step 2: Downloading best subtitle from ${bestResult.source}`);
            
            const originalContent = await downloadAndProcessSubtitle(bestResult.url, videoId, bestResult.source);
            
            if (originalContent) {
                // STEP 3: Immediately provide original subtitle option
                const originalUrl = await serveAiSubtitle(originalContent, videoId, bestResult.source);
                const hashLabel = infoHash ? ' Hash-Matched' : '';
                
                subtitles.push({
                    id: `${bestResult.source}-original-tr`,
                    lang: SUPPORTED_LANGUAGE,
                    url: originalUrl,
                    behaviorHints: { 
                        notWebReady: false, 
                        [bestResult.source]: true,
                        hashMatched: !!infoHash,
                        original: true
                    },
                    name: `${bestResult.source.charAt(0).toUpperCase() + bestResult.source.slice(1)}${hashLabel} Turkish (Ready)`
                });
                
                // STEP 4: Start background AI enhancement (non-blocking)
                if (process.env.GEMINI_API_KEY) {
                    console.log(`[SubtitleMatcher] Step 4: Starting background AI enhancement for ${bestResult.source}`);
                    enhanceSubtitleInBackground(originalContent, videoId, bestResult.source).catch(e => {
                        console.error('[SubtitleMatcher] Background AI enhancement error:', e);
                    });
                    
                    // Provide AI-enhanced option that will be ready soon
                    subtitles.push({
                        id: `${bestResult.source}-ai-tr`,
                        lang: SUPPORTED_LANGUAGE,
                        url: `/subtitles/${videoId}/tr.srt?source=${bestResult.source}-ai&progressive=true`,
                        behaviorHints: { 
                            notWebReady: false, 
                            [bestResult.source]: true,
                            hashMatched: !!infoHash,
                            aiEnhanced: true,
                            progressive: true
                        },
                        name: `${bestResult.source.charAt(0).toUpperCase() + bestResult.source.slice(1)}${hashLabel} AI-Enhanced Turkish`
                    });
                }
                
                // STEP 5: Also try other sources in background for more options
                for (let i = 1; i < quickResults.length && i < 2; i++) {
                    const altResult = quickResults[i];
                    console.log(`[SubtitleMatcher] Step 5: Background processing alternative source: ${altResult.source}`);
                    
                    // Download and cache alternative sources in background
                    downloadAndProcessSubtitle(altResult.url, videoId, altResult.source)
                        .then(altContent => {
                            if (altContent) {
                                // Start AI enhancement for alternative source too
                                if (process.env.GEMINI_API_KEY) {
                                    enhanceSubtitleInBackground(altContent, videoId, altResult.source).catch(e => {
                                        console.error(`[SubtitleMatcher] Background AI enhancement error for ${altResult.source}:`, e);
                                    });
                                }
                            }
                        })
                        .catch(e => {
                            console.error(`[SubtitleMatcher] Background processing error for ${altResult.source}:`, e);
                        });
                }
            }
        }
        
        // STEP 6: Fallback if no quick results
        if (subtitles.length === 0) {
            console.log(`[SubtitleMatcher] Step 6: No quick results, providing traditional fallback`);
            
            // Traditional fallback with loading message
            subtitles.push({
                id: `traditional-fallback-tr`,
                lang: SUPPORTED_LANGUAGE,
                url: `/subtitles/${videoId}/tr.srt?fallback=traditional`,
                behaviorHints: { 
                    notWebReady: false, 
                    fallback: true,
                    traditional: true
                },
                name: 'Turkish Subtitle (Loading...)'
            });
        }
        
        const discoveryTime = Date.now() - startTime;
        console.log(`[SubtitleMatcher] SEAMLESS DISCOVERY COMPLETED in ${discoveryTime}ms`);
        console.log(`[SubtitleMatcher] Providing ${subtitles.length} subtitle option(s):`);
        subtitles.forEach((sub, index) => {
            console.log(`[SubtitleMatcher] ${index + 1}. ${sub.name} (${sub.url})`);
        });
        
        return { subtitles };
        
    } catch (err) {
        console.error('[SubtitleMatcher] CRITICAL: getSubtitleUrlsForStremio failed:', err);
        return { 
            subtitles: [{ 
                id: 'fallback-tr', 
                lang: 'tr', 
                url: `data:text/plain;charset=utf-8,${encodeURIComponent(fallbackSubtitle('System error'))}`, 
                behaviorHints: { notWebReady: false, fallback: true }, 
                name: '[Subtitle unavailable]' 
            }] 
        };
    }
}

// Helper: AI-correct arbitrary subtitle content (used for direct subtitle enhancement)
async function getAICorrectedSubtitleDirect(originalContent) {
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) return fallbackSubtitle('AI service unavailable.');
    
    const startTime = Date.now();
    console.log('[subtitleMatcher] Starting AI enhancement...');
    
    try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;
        const prompt = `Fix subtitle timing synchronization issues in this Turkish SRT file:

1. FRAME RATE ANALYSIS:
   - Identify the likely frame rate (23.976 fps, 24 fps, 25 fps, 29.97 fps, 30 fps) by analyzing timestamp patterns and drift
   - Calculate the frame rate conversion factor if needed
   - Detect PAL/NTSC conversion artifacts in timing

2. LINEAR TIMING DRIFT DETECTION:
   - Analyze the first 10%, middle 50%, and last 10% of subtitles for timing consistency
   - Detect if the file is consistently too fast or too slow throughout
   - Calculate the drift coefficient (e.g., 1.04166 for 25fps→23.976fps conversion)

3. DIALOGUE CADENCE AND SUBTITLE READING ANALYSIS:
   - Optimize timing for Turkish subtitle reading patterns and comprehension speed
   - Ensure subtitle timing allows adequate reading time for Turkish text
   - Account for Turkish reading rhythm and text processing patterns
   - Adjust for natural reading pauses between subtitle segments

4. SCENE BREAK AND TRANSITION PRESERVATION:
   - Identify scene changes (gaps >3 seconds between subtitles)
   - Preserve natural scene transitions and fade-in/fade-out timing
   - Maintain silence periods for dramatic effect
   - Detect and preserve chapter/act boundaries

5. MATHEMATICAL TIME TRANSFORMATION:
   - If linear drift is detected, apply mathematical correction to ALL timestamps
   - Use precise multiplication factors (e.g., ×0.95904 for 25fps→23.976fps)
   - Ensure start and end times are both adjusted proportionally
   - Maintain subtitle duration ratios

6. SUBTITLE DURATION OPTIMIZATION:
   - Ensure minimum subtitle duration of 0.8 seconds
   - Ensure maximum subtitle duration of 6 seconds for readability
   - Adjust overly short subtitles (<0.5 seconds) to minimum readable duration
   - Split overly long subtitles (>7 seconds) if content allows

7. OVERLAP AND GAP CORRECTION:
   - Eliminate negative gaps (overlapping subtitles)
   - Ensure minimum 0.1 second gap between consecutive subtitles
   - Fix subtitles that start before the previous one ends
   - Maintain natural flow between subtitle transitions

8. READING SPEED OPTIMIZATION:
   - Calculate characters per second (CPS) for each subtitle
   - Ensure CPS stays between 15-20 for optimal Turkish reading speed
   - Adjust timing for longer Turkish text to allow adequate reading time
   - Account for Turkish text complexity and word structure

9. PUNCTUATION AND BREATH TIMING:
   - Add natural pauses after periods (minimum 0.3 seconds)
   - Extend timing for question marks and exclamation marks
   - Account for comma pauses in long sentences
   - Adjust for Turkish-specific punctuation patterns

10. AUDIO-VISUAL SYNC HEURISTICS:
    - Estimate likely dialogue start/end based on subtitle content
    - Adjust timing for action descriptions vs. dialogue
    - Account for off-screen dialogue timing differences
    - Preserve synchronization for sound effects and music cues

11. CONSISTENCY VALIDATION:
    - Ensure all timestamps are in ascending order
    - Validate that no subtitle has negative duration
    - Check for impossible time jumps (>30 seconds between adjacent subtitles)
    - Verify subtitle numbering sequence

12. QUALITY ASSURANCE:
    - Perform final pass to ensure all corrections are applied
    - Verify no subtitle timing conflicts remain
    - Ensure smooth transition flow throughout the entire file
    - Double-check mathematical precision of all time calculations

CRITICAL RULES:
- Do NOT add, remove, or rewrite any dialogue text
- Only adjust timestamps for perfect sync
- Preserve all subtitle numbers and text formatting
- Return only the fully corrected subtitle file in exact SRT format
- Do not add explanations, comments, or extra text
- Ensure every timestamp change improves synchronization

Subtitle file:

${originalContent}`;
        
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
        }, 1, 30000); // Increased timeout to 30 seconds for complex AI processing
        
        if (!aiRes) {
            const duration = Date.now() - startTime;
            console.log(`[subtitleMatcher] AI enhancement failed after ${duration}ms - timeout`);
            return null; // Return null instead of tiny fallback to use original content
        }
        
        const aiData = await aiRes.json();
        const corrected = aiData?.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (corrected && corrected.length > 10) {
            const duration = Date.now() - startTime;
            console.log(`[subtitleMatcher] ✅ AI enhancement successful in ${duration}ms (${originalContent.length} → ${corrected.length} chars)`);
            return corrected;
        }
        
        console.log('[subtitleMatcher] AI enhancement returned empty result');
        return null; // Return null instead of tiny fallback to use original content
        
    } catch (e) {
        const duration = Date.now() - startTime;
        console.error(`[subtitleMatcher] AI enhancement error after ${duration}ms:`, e.message);
        return null; // Return null instead of tiny fallback to use original content
    }
}

// Helper: Get progressive subtitle content (checks for AI-enhanced version first)
function getProgressiveSubtitleContent(videoId, source) {
    // First check if AI-enhanced version is ready
    const aiEnhancementKey = `${videoId}-${source}-ai`;
    const aiStatus = aiEnhancementStatus.get(aiEnhancementKey);
    
    if (aiStatus === 'completed') {
        console.log(`[subtitleMatcher] Serving AI-enhanced version for ${source}`);
        return getCachedSubtitleContent(videoId, `${source}-ai`);
    }
    
    // Fallback to original version
    console.log(`[subtitleMatcher] AI enhancement not ready (${aiStatus}), serving original for ${source}`);
    return getCachedSubtitleContent(videoId, source);
}

function fallbackSubtitle(reason) {
    return `1\n00:00:01,000 --> 00:00:05,000\n[Subtitle unavailable: ${reason}]`;
}

// In-memory cache for external subtitle content
const externalSubtitleCache = new Map();

// Background processing queue for AI enhancement
const aiEnhancementQueue = new Map();
const aiEnhancementStatus = new Map(); // 'pending', 'processing', 'completed', 'failed'

// Helper: Store external subtitle content and return proper endpoint URL
async function serveAiSubtitle(content, videoId, source) {
    // Generate a unique cache key
    const cacheKey = `${videoId}-${source}`;
    
    // Store the content in cache
    externalSubtitleCache.set(cacheKey, content);
    
    // Return the proper endpoint URL instead of data URL
    return `/subtitles/${videoId}/tr.srt?source=${source}`;
}

// Helper: Get cached external subtitle content
function getCachedSubtitleContent(videoId, source) {
    const cacheKey = `${videoId}-${source}`;
    return externalSubtitleCache.get(cacheKey);
}

// Background AI Enhancement Function
async function enhanceSubtitleInBackground(originalContent, videoId, source) {
    const enhancementKey = `${videoId}-${source}-ai`;
    
    // Skip if already processing or completed
    if (aiEnhancementStatus.get(enhancementKey) === 'processing' || 
        aiEnhancementStatus.get(enhancementKey) === 'completed') {
        return;
    }
    
    console.log(`[subtitleMatcher] Starting background AI enhancement for ${source}`);
    aiEnhancementStatus.set(enhancementKey, 'processing');
    
    try {
        const aiContent = await getAICorrectedSubtitleDirect(originalContent);
        if (aiContent && aiContent.length > originalContent.length * 0.8) {
            // Store AI-enhanced version in cache
            externalSubtitleCache.set(`${videoId}-${source}-ai`, aiContent);
            aiEnhancementStatus.set(enhancementKey, 'completed');
            console.log(`[subtitleMatcher] Background AI enhancement completed for ${source}`);
        } else {
            aiEnhancementStatus.set(enhancementKey, 'failed');
            console.log(`[subtitleMatcher] Background AI enhancement failed for ${source}`);
        }
    } catch (e) {
        aiEnhancementStatus.set(enhancementKey, 'failed');
        console.error(`[subtitleMatcher] Background AI enhancement error for ${source}:`, e);
    }
}

// Fast subtitle discovery function - only finds original subtitles quickly
async function getSubtitleQuickly(videoId, infoHash) {
    const results = [];
    
    // Try all sources in parallel for speed (max 5 seconds each)
    const promises = [];
    
    // Priority order: SubDL, Podnapisi, OpenSubtitles
    if (process.env.SUBDL_API_KEY) {
        promises.push(
            Promise.race([
                fetchSubdlSubtitle(videoId, infoHash),
                new Promise(resolve => setTimeout(() => resolve(null), 5000))
            ]).then(url => url ? { source: 'subdl', url, priority: 1 } : null)
        );
    }
    
    promises.push(
        Promise.race([
            fetchPodnapisiSubtitle(videoId, infoHash),
            new Promise(resolve => setTimeout(() => resolve(null), 5000))
        ]).then(url => url ? { source: 'podnapisi', url, priority: 2 } : null)
    );
    
    if (process.env.OPENSUBTITLES_API_KEY) {
        promises.push(
            Promise.race([
                fetchOpenSubtitlesSubtitle(videoId, infoHash),
                new Promise(resolve => setTimeout(() => resolve(null), 5000))
            ]).then(url => url ? { source: 'opensubtitles', url, priority: 3 } : null)
        );
    }
    
    // Wait for all promises to complete (but with timeout)
    const allResults = await Promise.allSettled(promises);
    
    // Extract successful results and sort by priority
    for (const result of allResults) {
        if (result.status === 'fulfilled' && result.value) {
            results.push(result.value);
        }
    }
    
    return results.sort((a, b) => a.priority - b.priority);
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
            return fallbackSubtitle('Missing API keys');
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
            return fallbackSubtitle('Invalid video ID');
        }
        const searchUrl = `https://api.opensubtitles.com/api/v1/subtitles?${searchParams}`;
        let fileId;
        try {
            const searchRes = await robustFetch(searchUrl, { headers: { 'Api-Key': opensubtitlesApiKey, 'User-Agent': USER_AGENT } });
            if (!searchRes || !searchRes.ok) {
                console.error(`[SubtitleMatcher] OpenSubtitles search failed: ${searchRes?.status}`);
                return fallbackSubtitle('OpenSubtitles search failed');
            }
            const searchData = await searchRes.json();
            if (!searchData.data?.length) {
                console.warn(`[SubtitleMatcher] No Turkish subtitles found for ${videoId}`);
                return fallbackSubtitle('No Turkish subtitles found');
            }
            fileId = searchData.data[0]?.attributes?.files?.[0]?.file_id;
            if (!fileId) {
                console.error('[SubtitleMatcher] No file_id found in OpenSubtitles response.');
                return fallbackSubtitle('No file ID found');
            }
        } catch (err) {
            console.error('[SubtitleMatcher] Error during OpenSubtitles search:', err);
            return fallbackSubtitle('Search error');
        }

        // --- Step 2: Get download link ---
        let downloadLink;
        try {
            const dlRes = await robustFetch('https://api.opensubtitles.com/api/v1/download', {
                method: 'POST',
                headers: { 'Api-Key': opensubtitlesApiKey, 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
                body: JSON.stringify({ file_id: fileId })
            });
            if (!dlRes || !dlRes.ok) {
                console.error(`[SubtitleMatcher] Download link request failed: ${dlRes?.status}`);
                return fallbackSubtitle('Download link failed');
            }
            const dlData = await dlRes.json();
            downloadLink = dlData.link;
            if (!downloadLink) {
                console.error('[SubtitleMatcher] No download link in OpenSubtitles response.');
                return fallbackSubtitle('No download link');
            }
        } catch (err) {
            console.error('[SubtitleMatcher] Error getting download link:', err);
            return fallbackSubtitle('Download link error');
        }

        // --- Step 3: Download subtitle file ---
        let originalContent;
        try {
            const subRes = await robustFetch(downloadLink);
            if (!subRes || !subRes.ok) {
                console.error(`[SubtitleMatcher] Subtitle download failed: ${subRes?.status}`);
                return fallbackSubtitle('Download failed');
            }
            originalContent = await subRes.text();
            if (!originalContent || originalContent.length < 10) {
                console.error('[SubtitleMatcher] Downloaded subtitle is empty or too short.');
                return fallbackSubtitle('Empty subtitle');
            }
        } catch (err) {
            console.error('[SubtitleMatcher] Error downloading subtitle:', err);
            return fallbackSubtitle('Download error');
        }

        // --- Step 4: AI Correction (Gemini) - with timeout protection ---
        try {
            const correctedContent = await getAICorrectedSubtitleDirect(originalContent);
            if (correctedContent && correctedContent.length > 10) {
                console.log('[SubtitleMatcher] AI correction successful.');
                return correctedContent;
            } else {
                console.log('[SubtitleMatcher] AI correction failed, returning original.');
                return originalContent;
            }
        } catch (err) {
            console.error('[SubtitleMatcher] Error during AI correction:', err);
            return originalContent; // Fallback to original content instead of tiny fallback
        }
    } catch (err) {
        console.error('[SubtitleMatcher] CRITICAL: getAICorrectedSubtitle failed:', err);
        return fallbackSubtitle('System error');
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

module.exports = { 
    getSubtitleUrlsForStremio, 
    getAICorrectedSubtitle, 
    getCachedSubtitleContent,
    getProgressiveSubtitleContent,
    aiEnhancementStatus
};