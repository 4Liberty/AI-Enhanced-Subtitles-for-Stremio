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
async function robustFetch(url, options = {}, retries = 2, timeoutMs = 15000) {
    for (let i = 0; i <= retries; i++) {
        let controller;
        let timeout;
        
        try {
            controller = new AbortController();
            timeout = setTimeout(() => {
                console.log(`[subtitleMatcher] Request timeout after ${timeoutMs}ms for URL: ${url}`);
                controller.abort();
            }, timeoutMs);
            
            const res = await fetch(url, { 
                ...options, 
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Stremio-AI-Sub-Addon/2.0',
                    ...options.headers
                }
            });
            
            clearTimeout(timeout);
            
            if (res.ok) {
                console.log(`[subtitleMatcher] robustFetch success for URL: ${url}`);
                return res;
            } else {
                console.log(`[subtitleMatcher] robustFetch HTTP error ${res.status} for URL: ${url}`);
                throw new Error(`HTTP ${res.status}: ${res.statusText}`);
            }
            
        } catch (e) {
            if (timeout) clearTimeout(timeout);
            
            if (i === retries) {
                console.error('[subtitleMatcher] robustFetch failed after all retries:', e.message);
                return null;
            }
            
            console.log(`[subtitleMatcher] robustFetch attempt ${i + 1} failed (${e.message}), retrying in ${(i + 1) * 1000}ms...`);
            // Wait before retry with exponential backoff
            await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
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
                const name = (sub.name || '').toLowerCase();
                const filename = (sub.filename || '').toLowerCase();
                const release = (sub.release || '').toLowerCase();
                
                console.log(`[subtitleMatcher] Checking subtitle: lang="${lang}", language="${language}", name="${name}"`);
                
                // Check multiple fields for Turkish indicators
                const isTurkish = lang === 'tr' || lang === 'tur' || lang === 'turkish' || 
                                 language === 'tr' || language === 'tur' || language === 'turkish' ||
                                 name.includes('turkish') || name.includes('türkçe') || name.includes('tr.') ||
                                 filename.includes('turkish') || filename.includes('türkçe') || filename.includes('tr.') ||
                                 release.includes('turkish') || release.includes('türkçe') || release.includes('tr.');
                
                console.log(`[subtitleMatcher] Turkish match result: ${isTurkish}`);
                return isTurkish;
            });
            
            console.log('[subtitleMatcher] Found', turkishSubs.length, 'Turkish subtitles after filtering');
            
            if (turkishSubs.length > 0) {
                // Sort by quality/rating if available
                turkishSubs.sort((a, b) => {
                    const ratingA = parseFloat(a.rating || 0);
                    const ratingB = parseFloat(b.rating || 0);
                    const downloadA = parseInt(a.download_count || 0);
                    const downloadB = parseInt(b.download_count || 0);
                    
                    // Prefer higher rated and more downloaded subtitles
                    if (ratingA !== ratingB) return ratingB - ratingA;
                    return downloadB - downloadA;
                });
                
                const subtitle = turkishSubs[0];
                console.log('[subtitleMatcher] Selected subtitle:', JSON.stringify(subtitle, null, 2));
                
                // Build download URL - SubDL provides the relative URL in 'url' field
                // Full download URL format: https://dl.subdl.com{url}
                const downloadUrl = subtitle.url.startsWith('http') ? subtitle.url : `https://dl.subdl.com${subtitle.url}`;
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

// Helper for Podnapisi API with enhanced Turkish detection and quality scoring
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
        
        // Multiple search strategies for better results
        const searchStrategies = [];
        
        // PRIORITY 1: Hash-based search if infoHash is provided
        if (infoHash) {
            console.log('[subtitleMatcher] Podnapisi: Using hash-based search with infoHash:', infoHash);
            searchStrategies.push({
                name: 'hash-based',
                url: `https://podnapisi.net/subtitles/search/advanced?keywords=${infoHash}&language=sl%2Cen%2Ctr&movie_type=movie%2Ctv-series&seasons=&episodes=&year=&fps=&cd_number=&uploader=&film_id=&sort=download_count&order=desc`
            });
        }
        
        // PRIORITY 2: IMDb ID search with Turkish language preference
        searchStrategies.push({
            name: 'imdb-turkish',
            url: `https://podnapisi.net/subtitles/search/advanced?keywords=${imdbId}&language=tr&movie_type=movie%2Ctv-series&seasons=&episodes=&year=&fps=&cd_number=&uploader=&film_id=&sort=download_count&order=desc`
        });
        
        // PRIORITY 3: IMDb ID search with multiple languages
        searchStrategies.push({
            name: 'imdb-multi',
            url: `https://podnapisi.net/subtitles/search/advanced?keywords=${imdbId}&language=sl%2Cen%2Ctr&movie_type=movie%2Ctv-series&seasons=&episodes=&year=&fps=&cd_number=&uploader=&film_id=&sort=download_count&order=desc`
        });
        
        // PRIORITY 4: General search with title extraction
        const titleKeywords = await extractTitleFromId(imdbId);
        if (titleKeywords) {
            searchStrategies.push({
                name: 'title-based',
                url: `https://podnapisi.net/subtitles/search/advanced?keywords=${encodeURIComponent(titleKeywords)}&language=tr&movie_type=movie%2Ctv-series&seasons=&episodes=&year=&fps=&cd_number=&uploader=&film_id=&sort=download_count&order=desc`
            });
        }
        
        // Try each search strategy
        for (const strategy of searchStrategies) {
            try {
                console.log(`[subtitleMatcher] Podnapisi: Trying ${strategy.name} search`);
                console.log(`[subtitleMatcher] Podnapisi search URL: ${strategy.url}`);
                
                const searchRes = await robustFetch(strategy.url, {
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
                    console.log(`[subtitleMatcher] Podnapisi ${strategy.name} search failed:`, searchRes?.status);
                    continue;
                }
                
                const searchHtml = await searchRes.text();
                console.log(`[subtitleMatcher] Podnapisi ${strategy.name} search response length:`, searchHtml.length);
                
                // Enhanced Turkish subtitle detection with quality scoring
                const turkishDownloadUrls = await extractTurkishSubtitlesFromPodnapisi(searchHtml, strategy.name);
                
                if (turkishDownloadUrls.length > 0) {
                    console.log(`[subtitleMatcher] Found ${turkishDownloadUrls.length} Turkish subtitles via ${strategy.name} search`);
                    
                    // Return the best quality subtitle
                    const bestSubtitle = turkishDownloadUrls[0];
                    const fullDownloadUrl = bestSubtitle.url.startsWith('http') ? bestSubtitle.url : `https://podnapisi.net${bestSubtitle.url}`;
                    
                    console.log(`[subtitleMatcher] Selected best Podnapisi subtitle: ${bestSubtitle.title} (score: ${bestSubtitle.score})`);
                    console.log(`[subtitleMatcher] Podnapisi download URL: ${fullDownloadUrl}`);
                    return fullDownloadUrl;
                }
                
            } catch (strategyError) {
                console.error(`[subtitleMatcher] Podnapisi ${strategy.name} search error:`, strategyError);
                continue;
            }
        }
        
        console.log('[subtitleMatcher] No Turkish subtitles found on Podnapisi with any search strategy');
        return null;
        
    } catch (e) {
        console.error('[subtitleMatcher] fetchPodnapisiSubtitle error:', e);
        return null;
    }
}

// Helper function to extract Turkish subtitles from Podnapisi HTML with quality scoring
async function extractTurkishSubtitlesFromPodnapisi(html, searchType) {
    const subtitles = [];
    
    try {
        // Multiple parsing approaches for different page layouts
        const parsingApproaches = [
            // Approach 1: Look for Turkish language specifically in table rows
            {
                name: 'table-row-turkish',
                regex: /<tr[^>]*>[\s\S]*?<td[^>]*class="language"[^>]*>[\s\S]*?(?:turkish|türkçe|tr\b)[\s\S]*?<\/td>[\s\S]*?<a[^>]*href="([^"]*\/download\/[^"]*)"[^>]*>[\s\S]*?<\/tr>/gi,
                titleRegex: /<tr[^>]*>[\s\S]*?<td[^>]*class="language"[^>]*>[\s\S]*?(?:turkish|türkçe|tr\b)[\s\S]*?<\/td>[\s\S]*?<a[^>]*href="[^"]*\/download\/[^"]*"[^>]*title="([^"]*)"[^>]*>[\s\S]*?<\/tr>/gi
            },
            // Approach 2: Look for download links with Turkish indicators
            {
                name: 'download-link-turkish',
                regex: /href="([^"]*\/download\/[^"]*)"[^>]*>[^<]*(?:turkish|türkçe|tr\b)[^<]*/gi,
                titleRegex: /title="([^"]*)"[^>]*href="[^"]*\/download\/[^"]*"[^>]*>[^<]*(?:turkish|türkçe|tr\b)[^<]*/gi
            },
            // Approach 3: Look for any download links and filter by surrounding context
            {
                name: 'contextual-turkish',
                regex: /href="([^"]*\/download\/[^"]*)"[^>]*>(?:[^<]*download[^<]*|[^<]*indir[^<]*)/gi,
                titleRegex: /title="([^"]*)"[^>]*href="[^"]*\/download\/[^"]*"[^>]*>(?:[^<]*download[^<]*|[^<]*indir[^<]*)/gi
            }
        ];
        
        for (const approach of parsingApproaches) {
            console.log(`[subtitleMatcher] Trying Podnapisi parsing approach: ${approach.name}`);
            
            const matches = [...html.matchAll(approach.regex)];
            const titleMatches = [...html.matchAll(approach.titleRegex)];
            
            for (let i = 0; i < matches.length; i++) {
                const match = matches[i];
                const downloadUrl = match[1];
                const matchIndex = match.index;
                const surroundingText = html.substring(Math.max(0, matchIndex - 500), matchIndex + 500).toLowerCase();
                
                // Check if this is Turkish content
                const isTurkish = approach.name === 'table-row-turkish' || 
                                approach.name === 'download-link-turkish' ||
                                surroundingText.includes('turkish') || 
                                surroundingText.includes('türkçe') || 
                                surroundingText.includes('tr">') || 
                                surroundingText.includes('tr ') ||
                                surroundingText.includes('lang="tr"') ||
                                surroundingText.includes('language: turkish');
                
                if (isTurkish) {
                    // Calculate quality score based on various factors
                    let score = 0;
                    let title = titleMatches[i] ? titleMatches[i][1] : 'Unknown';
                    
                    // Score based on download count indicators
                    const downloadCountMatch = surroundingText.match(/(\d+)\s*(?:download|indir)/i);
                    if (downloadCountMatch) {
                        score += Math.min(parseInt(downloadCountMatch[1]) * 0.1, 50);
                    }
                    
                    // Score based on rating indicators
                    const ratingMatch = surroundingText.match(/rating[^>]*>[\s\S]*?(\d+(?:\.\d+)?)/i);
                    if (ratingMatch) {
                        score += parseFloat(ratingMatch[1]) * 10;
                    }
                    
                    // Score based on file quality indicators
                    if (surroundingText.includes('bluray') || surroundingText.includes('blu-ray')) score += 20;
                    if (surroundingText.includes('dvdrip') || surroundingText.includes('dvd')) score += 15;
                    if (surroundingText.includes('webrip') || surroundingText.includes('web-dl')) score += 18;
                    if (surroundingText.includes('hdtv')) score += 10;
                    if (surroundingText.includes('cam') || surroundingText.includes('ts')) score -= 10;
                    
                    // Score based on hearing impaired preference
                    if (surroundingText.includes('hearing impaired') || surroundingText.includes('cc')) score -= 5;
                    
                    // Score based on subtitle format
                    if (surroundingText.includes('.srt')) score += 10;
                    if (surroundingText.includes('.ass') || surroundingText.includes('.ssa')) score += 5;
                    
                    // Score based on search type priority
                    if (searchType === 'hash-based') score += 30;
                    if (searchType === 'imdb-turkish') score += 20;
                    if (searchType === 'imdb-multi') score += 10;
                    
                    // Score based on approach effectiveness
                    if (approach.name === 'table-row-turkish') score += 15;
                    if (approach.name === 'download-link-turkish') score += 10;
                    
                    subtitles.push({
                        url: downloadUrl,
                        title: title,
                        score: score,
                        approach: approach.name,
                        searchType: searchType
                    });
                    
                    console.log(`[subtitleMatcher] Found Turkish subtitle: ${title} (score: ${score}, approach: ${approach.name})`);
                }
            }
        }
        
        // Sort by score (highest first) and remove duplicates
        const uniqueSubtitles = [];
        const seenUrls = new Set();
        
        subtitles.sort((a, b) => b.score - a.score);
        
        for (const subtitle of subtitles) {
            if (!seenUrls.has(subtitle.url)) {
                seenUrls.add(subtitle.url);
                uniqueSubtitles.push(subtitle);
            }
        }
        
        console.log(`[subtitleMatcher] Found ${uniqueSubtitles.length} unique Turkish subtitles from Podnapisi`);
        return uniqueSubtitles.slice(0, 3); // Return top 3 subtitles
        
    } catch (e) {
        console.error('[subtitleMatcher] Error extracting Turkish subtitles from Podnapisi:', e);
        return [];
    }
}

// Helper function to extract title from IMDb ID for better search
async function extractTitleFromId(imdbId) {
    try {
        const tmdbApiKey = process.env.TMDB_API_KEY;
        if (!tmdbApiKey) {
            console.log('[subtitleMatcher] TMDB_API_KEY not configured, skipping title extraction');
            return null;
        }
        
        // Use TMDb to get movie title from IMDb ID
        const findUrl = `https://api.themoviedb.org/3/find/${imdbId}?api_key=${tmdbApiKey}&external_source=imdb_id`;
        const findRes = await robustFetch(findUrl);
        
        if (!findRes || !findRes.ok) {
            console.log(`[subtitleMatcher] TMDb API request failed: ${findRes?.status}`);
            return null;
        }
        
        const findData = await findRes.json();
        const movie = findData.movie_results?.[0];
        const tvShow = findData.tv_results?.[0];
        
        if (movie) {
            console.log(`[subtitleMatcher] Found movie title: ${movie.title}`);
            return movie.title;
        } else if (tvShow) {
            console.log(`[subtitleMatcher] Found TV show title: ${tvShow.name}`);
            return tvShow.name;
        }
        
        console.log(`[subtitleMatcher] No title found for IMDb ID: ${imdbId}`);
        return null;
        
    } catch (e) {
        console.error('[subtitleMatcher] Error extracting title from IMDb ID:', e);
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

// Helper for OpenSubtitles API with hash-matching support and enhanced Turkish detection
async function fetchOpenSubtitlesSubtitle(videoId, infoHash) {
    try {
        const opensubtitlesApiKey = process.env.OPENSUBTITLES_API_KEY;
        console.log('[subtitleMatcher] fetchOpenSubtitlesSubtitle called with videoId:', videoId, 'infoHash:', infoHash);
        console.log('[subtitleMatcher] OPENSUBTITLES_API_KEY present:', !!opensubtitlesApiKey);
        
        if (!opensubtitlesApiKey) {
            console.log('[subtitleMatcher] OpenSubtitles API key not found, skipping OpenSubtitles');
            return null;
        }
        
        // Build search parameters with comprehensive language support
        const searchParams = new URLSearchParams({
            languages: 'tr,tur,turkish', // Multiple Turkish language codes
            order_by: 'download_count', // Prefer popular subtitles
            order_direction: 'desc',
            per_page: '50' // Get more results for better filtering
        });
        
        // PRIORITY 1: Hash-based search if infoHash is provided
        if (infoHash) {
            console.log('[subtitleMatcher] OpenSubtitles: Using hash-based search with infoHash:', infoHash);
            searchParams.append('moviehash', infoHash);
        } else {
            console.log('[subtitleMatcher] OpenSubtitles: Using ID-based search');
            // Add ID parameters based on videoId format
            if (videoId.startsWith('tt')) {
                searchParams.append('imdb_id', videoId);
            } else if (videoId.startsWith('tmdb:')) {
                const tmdbId = videoId.split(':')[1];
                searchParams.append('tmdb_id', tmdbId);
                
                // Also try to get IMDb ID for better results
                const imdbId = await tmdbToImdb(tmdbId);
                if (imdbId) {
                    searchParams.append('imdb_id', imdbId);
                }
            }
        }
        
        const searchUrl = `https://api.opensubtitles.com/api/v1/subtitles?${searchParams.toString()}`;
        console.log('[subtitleMatcher] OpenSubtitles API URL:', searchUrl);
        
        const searchRes = await robustFetch(searchUrl, {
            headers: {
                'Api-Key': opensubtitlesApiKey,
                'User-Agent': 'Stremio-AI-Sub-Addon/2.0',
                'Accept': 'application/json'
            }
        });
        
        if (!searchRes) {
            console.log('[subtitleMatcher] OpenSubtitles API request failed - no response');
            return null;
        }
        
        console.log('[subtitleMatcher] OpenSubtitles API response status:', searchRes.status);
        if (!searchRes.ok) {
            const errorText = await searchRes.text();
            console.log('[subtitleMatcher] OpenSubtitles API response not ok:', searchRes.status, searchRes.statusText, errorText);
            return null;
        }
        
        const searchData = await searchRes.json();
        console.log('[subtitleMatcher] OpenSubtitles API response data count:', searchData.data?.length || 0);
        
        if (!searchData.data || searchData.data.length === 0) {
            console.log('[subtitleMatcher] OpenSubtitles returned no subtitles');
            return null;
        }
        
        // Enhanced Turkish subtitle filtering and quality scoring
        const turkishSubtitles = searchData.data.filter(subtitle => {
            const attrs = subtitle.attributes;
            const lang = (attrs.language || '').toLowerCase();
            const featureId = attrs.feature_details?.feature_id;
            const fileName = (attrs.files?.[0]?.file_name || '').toLowerCase();
            const releaseTitle = (attrs.release || '').toLowerCase();
            const uploaderName = (attrs.uploader?.name || '').toLowerCase();
            
            console.log(`[subtitleMatcher] Checking OpenSubtitles subtitle: lang="${lang}", fileName="${fileName}", release="${releaseTitle}"`);
            
            // Check multiple fields for Turkish indicators
            const isTurkish = lang === 'tr' || lang === 'tur' || lang === 'turkish' || 
                             fileName.includes('turkish') || fileName.includes('türkçe') || fileName.includes('tr.') ||
                             releaseTitle.includes('turkish') || releaseTitle.includes('türkçe') || releaseTitle.includes('tr.') ||
                             uploaderName.includes('turkish') || uploaderName.includes('türkçe');
            
            console.log(`[subtitleMatcher] Turkish match result: ${isTurkish}`);
            return isTurkish;
        });
        
        console.log('[subtitleMatcher] Found', turkishSubtitles.length, 'Turkish subtitles after filtering');
        
        if (turkishSubtitles.length === 0) {
            console.log('[subtitleMatcher] No Turkish subtitles found in OpenSubtitles');
            return null;
        }
        
        // Sort by quality score (download count, rating, hearing impaired preference)
        turkishSubtitles.sort((a, b) => {
            const aAttrs = a.attributes;
            const bAttrs = b.attributes;
            
            // Quality scoring factors
            const aDownloads = parseInt(aAttrs.download_count || 0);
            const bDownloads = parseInt(bAttrs.download_count || 0);
            const aRating = parseFloat(aAttrs.ratings || 0);
            const bRating = parseFloat(bAttrs.ratings || 0);
            const aHearingImpaired = aAttrs.hearing_impaired || false;
            const bHearingImpaired = bAttrs.hearing_impaired || false;
            
            // Prefer non-hearing impaired for general use
            if (aHearingImpaired !== bHearingImpaired) {
                return aHearingImpaired ? 1 : -1;
            }
            
            // Prefer higher download count
            if (aDownloads !== bDownloads) {
                return bDownloads - aDownloads;
            }
            
            // Prefer higher rating
            return bRating - aRating;
        });
        
        const bestSubtitle = turkishSubtitles[0];
        const fileId = bestSubtitle?.attributes?.files?.[0]?.file_id;
        
        if (!fileId) {
            console.log('[subtitleMatcher] OpenSubtitles returned no file_id for best subtitle');
            return null;
        }
        
        console.log('[subtitleMatcher] OpenSubtitles selected best subtitle with file_id:', fileId);
        console.log('[subtitleMatcher] Subtitle details:', JSON.stringify(bestSubtitle.attributes, null, 2));
        
        // Get download link with retry mechanism
        let downloadAttempts = 0;
        const maxDownloadAttempts = 3;
        
        while (downloadAttempts < maxDownloadAttempts) {
            try {
                const downloadRes = await robustFetch('https://api.opensubtitles.com/api/v1/download', {
                    method: 'POST',
                    headers: {
                        'Api-Key': opensubtitlesApiKey,
                        'Content-Type': 'application/json',
                        'User-Agent': 'Stremio-AI-Sub-Addon/2.0'
                    },
                    body: JSON.stringify({ file_id: fileId })
                });
                
                if (!downloadRes || !downloadRes.ok) {
                    console.log(`[subtitleMatcher] OpenSubtitles download link request failed (attempt ${downloadAttempts + 1}):`, downloadRes?.status);
                    downloadAttempts++;
                    if (downloadAttempts < maxDownloadAttempts) {
                        await new Promise(resolve => setTimeout(resolve, 1000 * downloadAttempts));
                        continue;
                    }
                    return null;
                }
                
                const downloadData = await downloadRes.json();
                const downloadUrl = downloadData.link;
                
                if (!downloadUrl) {
                    console.log(`[subtitleMatcher] OpenSubtitles returned no download link (attempt ${downloadAttempts + 1})`);
                    downloadAttempts++;
                    if (downloadAttempts < maxDownloadAttempts) {
                        await new Promise(resolve => setTimeout(resolve, 1000 * downloadAttempts));
                        continue;
                    }
                    return null;
                }
                
                console.log('[subtitleMatcher] OpenSubtitles download URL:', downloadUrl);
                return downloadUrl;
                
            } catch (e) {
                console.error(`[subtitleMatcher] OpenSubtitles download attempt ${downloadAttempts + 1} error:`, e);
                downloadAttempts++;
                if (downloadAttempts < maxDownloadAttempts) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * downloadAttempts));
                } else {
                    return null;
                }
            }
        }
        
        return null;
        
    } catch (e) {
        console.error('[subtitleMatcher] fetchOpenSubtitlesSubtitle error:', e);
        return null;
    }
}

// Enhanced helper function to download and process subtitle from URL with comprehensive format support
async function downloadAndProcessSubtitle(subtitleUrl, videoId, source) {
    try {
        console.log(`[SubtitleMatcher] Downloading ${source} subtitle from: ${subtitleUrl}`);
        
        // Validate URL
        if (!subtitleUrl || typeof subtitleUrl !== 'string') {
            console.error(`[SubtitleMatcher] Invalid subtitle URL for ${source}`);
            return null;
        }
        
        // Enhanced download with retry mechanism
        let downloadAttempts = 0;
        const maxDownloadAttempts = 3;
        let subRes = null;
        
        while (downloadAttempts < maxDownloadAttempts) {
            try {
                subRes = await robustFetch(subtitleUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                        'Accept-Language': 'tr,en-US;q=0.7,en;q=0.3',
                        'Accept-Encoding': 'gzip, deflate, br',
                        'Referer': getRefererForSource(source),
                        'DNT': '1',
                        'Connection': 'keep-alive'
                    }
                });
                
                if (subRes && subRes.ok) {
                    break;
                }
                
                console.log(`[SubtitleMatcher] ${source} download attempt ${downloadAttempts + 1} failed with status: ${subRes?.status}`);
                downloadAttempts++;
                
                if (downloadAttempts < maxDownloadAttempts) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * downloadAttempts));
                }
                
            } catch (downloadError) {
                console.error(`[SubtitleMatcher] ${source} download attempt ${downloadAttempts + 1} error:`, downloadError);
                downloadAttempts++;
                
                if (downloadAttempts < maxDownloadAttempts) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * downloadAttempts));
                }
            }
        }
        
        if (!subRes || !subRes.ok) {
            console.log(`[SubtitleMatcher] ${source} download failed after ${maxDownloadAttempts} attempts`);
            return null;
        }
        
        console.log(`[SubtitleMatcher] ${source} download successful, response status: ${subRes.status}`);
        
        // Enhanced content type detection
        const contentType = subRes.headers.get('content-type') || '';
        const contentDisposition = subRes.headers.get('content-disposition') || '';
        const contentLength = subRes.headers.get('content-length') || '0';
        
        console.log(`[SubtitleMatcher] Content-Type: ${contentType}`);
        console.log(`[SubtitleMatcher] Content-Disposition: ${contentDisposition}`);
        console.log(`[SubtitleMatcher] Content-Length: ${contentLength}`);
        
        // Determine file format from multiple sources
        let fileFormat = 'unknown';
        let fileName = '';
        
        // Extract filename from content-disposition header
        const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (filenameMatch) {
            fileName = filenameMatch[1].replace(/['"]/g, '');
            console.log(`[SubtitleMatcher] Extracted filename: ${fileName}`);
        }
        
        // Determine format from URL, filename, or content type
        if (subtitleUrl.includes('.zip') || fileName.includes('.zip') || contentType.includes('zip')) {
            fileFormat = 'zip';
        } else if (subtitleUrl.includes('.rar') || fileName.includes('.rar') || contentType.includes('rar')) {
            fileFormat = 'rar';
        } else if (subtitleUrl.includes('.gz') || fileName.includes('.gz') || contentType.includes('gzip')) {
            fileFormat = 'gzip';
        } else if (subtitleUrl.includes('.srt') || fileName.includes('.srt') || contentType.includes('text/plain')) {
            fileFormat = 'srt';
        } else if (subtitleUrl.includes('.ass') || fileName.includes('.ass')) {
            fileFormat = 'ass';
        } else if (subtitleUrl.includes('.vtt') || fileName.includes('.vtt')) {
            fileFormat = 'vtt';
        } else if (contentType.includes('application/octet-stream') || contentType.includes('application/x-subrip')) {
            fileFormat = 'compressed';
        }
        
        console.log(`[SubtitleMatcher] Detected file format: ${fileFormat}`);
        
        // Process content based on format
        let originalContent = null;
        
        try {
            switch (fileFormat) {
                case 'zip':
                    originalContent = await decompressZipSubtitle(subRes, subtitleUrl);
                    break;
                case 'rar':
                    originalContent = await decompressRarSubtitle(subRes, subtitleUrl);
                    break;
                case 'gzip':
                    originalContent = await decompressGzipSubtitle(subRes);
                    break;
                case 'compressed':
                    // Try multiple decompression methods
                    originalContent = await decompressUnknownFormat(subRes, subtitleUrl);
                    break;
                case 'srt':
                case 'ass':
                case 'vtt':
                default:
                    // Try as plain text first
                    originalContent = await subRes.text();
                    
                    // If it looks like binary data, try decompression
                    if (originalContent && originalContent.length > 0) {
                        const firstChars = originalContent.substring(0, 100);
                        if (firstChars.includes('\x00') || firstChars.includes('\ufffd') || !/^[\x09\x0A\x0D\x20-\x7E\x80-\xFF]*$/.test(firstChars)) {
                            console.log(`[SubtitleMatcher] Content appears to be binary, trying decompression...`);
                            originalContent = await decompressUnknownFormat(subRes, subtitleUrl);
                        }
                    }
                    break;
            }
            
        } catch (formatError) {
            console.error(`[SubtitleMatcher] Error processing ${fileFormat} format:`, formatError);
            
            // Fallback: try all decompression methods
            console.log(`[SubtitleMatcher] Trying fallback decompression methods...`);
            originalContent = await decompressUnknownFormat(subRes, subtitleUrl);
        }
        
        if (!originalContent) {
            console.log(`[SubtitleMatcher] Failed to extract content from ${source} file`);
            return null;
        }
        
        console.log(`[SubtitleMatcher] ${source} subtitle content extracted, length: ${originalContent.length}`);
        console.log(`[SubtitleMatcher] First 200 chars: ${originalContent.substring(0, 200)}`);
        
        // Enhanced subtitle format validation and conversion
        const processedContent = await processSubtitleContent(originalContent, fileFormat, source);
        
        if (!processedContent) {
            console.log(`[SubtitleMatcher] ${source} subtitle content processing failed`);
            return null;
        }
        
        // Store content in cache
        await serveAiSubtitle(processedContent, videoId, source);
        console.log(`[SubtitleMatcher] ${source} subtitle successfully cached`);
        return processedContent;
        
    } catch (e) {
        console.error(`[SubtitleMatcher] ${source} processing error:`, e);
        return null;
    }
}

// Helper function to get appropriate referer for different sources
function getRefererForSource(source) {
    switch (source) {
        case 'subdl':
            return 'https://subdl.com/';
        case 'podnapisi':
            return 'https://podnapisi.net/';
        case 'opensubtitles':
            return 'https://opensubtitles.com/';
        default:
            return 'https://stremio.com/';
    }
}

// Enhanced decompression function for unknown formats
async function decompressUnknownFormat(response, originalUrl) {
    try {
        const buffer = await response.buffer();
        console.log(`[SubtitleMatcher] Trying to decompress unknown format, buffer size: ${buffer.length}`);
        
        // Try different decompression methods in order of likelihood
        const decompressionMethods = [
            () => decompressZipSubtitle({ buffer: () => Promise.resolve(buffer) }, originalUrl),
            () => decompressGzipSubtitle({ buffer: () => Promise.resolve(buffer) }),
            () => decompressSubtitleContent(buffer),
            () => buffer.toString('utf-8'),
            () => buffer.toString('latin1'),
            () => buffer.toString('ascii')
        ];
        
        for (const method of decompressionMethods) {
            try {
                const result = await method();
                if (result && result.length > 10 && isValidSubtitleContent(result)) {
                    console.log(`[SubtitleMatcher] Successfully decompressed using method`);
                    return result;
                }
            } catch (methodError) {
                console.log(`[SubtitleMatcher] Decompression method failed, trying next...`);
            }
        }
        
        console.log(`[SubtitleMatcher] All decompression methods failed`);
        return null;
        
    } catch (e) {
        console.error(`[SubtitleMatcher] Error in decompressUnknownFormat:`, e);
        return null;
    }
}

// Enhanced RAR decompression function
async function decompressRarSubtitle(response, originalUrl) {
    try {
        const buffer = await response.buffer();
        console.log(`[SubtitleMatcher] Processing RAR file, size: ${buffer.length}`);
        
        // Check RAR signature
        const rarSignature = buffer.slice(0, 4);
        if (rarSignature[0] === 0x52 && rarSignature[1] === 0x61 && rarSignature[2] === 0x72 && rarSignature[3] === 0x21) {
            console.log(`[SubtitleMatcher] Confirmed RAR format`);
            
            // Try to use node-rar if available
            try {
                const rar = require('node-rar');
                // This is a placeholder - RAR extraction requires external tools
                console.log(`[SubtitleMatcher] RAR extraction not implemented, trying as text...`);
            } catch (rarError) {
                console.log(`[SubtitleMatcher] RAR library not available`);
            }
        }
        
        // Fallback: try as ZIP (some RAR files are actually ZIP)
        try {
            return await decompressZipSubtitle({ buffer: () => Promise.resolve(buffer) }, originalUrl);
        } catch (zipError) {
            console.log(`[SubtitleMatcher] RAR file is not a ZIP, trying text extraction...`);
        }
        
        // Last resort: try to extract text directly
        const attempts = [
            () => buffer.toString('utf-8'),
            () => buffer.toString('latin1'),
            () => buffer.toString('ascii')
        ];
        
        for (const attempt of attempts) {
            try {
                const text = attempt();
                if (text && text.includes('-->') && text.match(/^\d+$/m)) {
                    console.log(`[SubtitleMatcher] Found SRT content in RAR buffer`);
                    return text;
                }
            } catch (e) {
                continue;
            }
        }
        
        console.log(`[SubtitleMatcher] Could not extract subtitle from RAR file`);
        return null;
        
    } catch (e) {
        console.error(`[SubtitleMatcher] Error decompressing RAR:`, e);
        return null;
    }
}

// Enhanced GZIP decompression function
async function decompressGzipSubtitle(response) {
    try {
        const buffer = await response.buffer();
        console.log(`[SubtitleMatcher] Processing GZIP file, size: ${buffer.length}`);
        
        // Check GZIP signature
        if (buffer[0] === 0x1f && buffer[1] === 0x8b) {
            console.log(`[SubtitleMatcher] Confirmed GZIP format`);
            const decompressed = zlib.gunzipSync(buffer);
            return decompressed.toString('utf-8');
        }
        
        // Try deflate if not gzip
        if (buffer[0] === 0x78 && (buffer[1] === 0x9c || buffer[1] === 0x01 || buffer[1] === 0xda)) {
            console.log(`[SubtitleMatcher] Trying DEFLATE decompression`);
            const decompressed = zlib.inflateSync(buffer);
            return decompressed.toString('utf-8');
        }
        
        // Not compressed, try as text
        return buffer.toString('utf-8');
        
    } catch (e) {
        console.error(`[SubtitleMatcher] Error decompressing GZIP:`, e);
        return null;
    }
}

// Enhanced subtitle content processing and validation
async function processSubtitleContent(content, format, source) {
    try {
        if (!content || content.length === 0) {
            return null;
        }
        
        console.log(`[SubtitleMatcher] Processing ${format} subtitle content from ${source}`);
        
        // Clean and normalize content
        let processedContent = content;
        
        // Remove BOM if present
        if (processedContent.charCodeAt(0) === 0xFEFF) {
            processedContent = processedContent.slice(1);
        }
        
        // Normalize line endings
        processedContent = processedContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        
        // Handle different subtitle formats
        switch (format) {
            case 'ass':
                processedContent = await convertAssToSrt(processedContent);
                break;
            case 'vtt':
                processedContent = await convertVttToSrt(processedContent);
                break;
            case 'srt':
            default:
                // Validate and fix SRT format
                processedContent = await validateAndFixSrtFormat(processedContent);
                break;
        }
        
        // Final validation
        if (!isValidSubtitleContent(processedContent)) {
            console.log(`[SubtitleMatcher] Final validation failed for ${source} subtitle`);
            return null;
        }
        
        console.log(`[SubtitleMatcher] Successfully processed ${source} subtitle content`);
        return processedContent;
        
    } catch (e) {
        console.error(`[SubtitleMatcher] Error processing subtitle content:`, e);
        return null;
    }
}

// Helper function to convert ASS/SSA to SRT
async function convertAssToSrt(assContent) {
    try {
        console.log(`[SubtitleMatcher] Converting ASS/SSA to SRT`);
        
        const lines = assContent.split('\n');
        const srtLines = [];
        let subtitleIndex = 1;
        
        for (const line of lines) {
            // Look for dialogue lines in ASS format
            if (line.startsWith('Dialogue:')) {
                const parts = line.split(',');
                if (parts.length >= 10) {
                    const startTime = parts[1].trim();
                    const endTime = parts[2].trim();
                    const text = parts.slice(9).join(',').trim();
                    
                    // Convert ASS time format to SRT time format
                    const srtStartTime = convertAssTimeToSrt(startTime);
                    const srtEndTime = convertAssTimeToSrt(endTime);
                    
                    if (srtStartTime && srtEndTime && text) {
                        srtLines.push(`${subtitleIndex}`);
                        srtLines.push(`${srtStartTime} --> ${srtEndTime}`);
                        srtLines.push(text.replace(/\\N/g, '\n')); // Replace ASS line breaks
                        srtLines.push('');
                        subtitleIndex++;
                    }
                }
            }
        }
        
        const srtContent = srtLines.join('\n');
        console.log(`[SubtitleMatcher] Converted ASS to SRT, ${subtitleIndex - 1} subtitles`);
        return srtContent;
        
    } catch (e) {
        console.error(`[SubtitleMatcher] Error converting ASS to SRT:`, e);
        return assContent; // Return original if conversion fails
    }
}

// Helper function to convert VTT to SRT
async function convertVttToSrt(vttContent) {
    try {
        console.log(`[SubtitleMatcher] Converting VTT to SRT`);
        
        const lines = vttContent.split('\n');
        const srtLines = [];
        let subtitleIndex = 1;
        let i = 0;
        
        // Skip VTT header
        while (i < lines.length && !lines[i].includes('-->')) {
            i++;
        }
        
        while (i < lines.length) {
            const line = lines[i].trim();
            
            if (line.includes('-->')) {
                // Convert VTT time format to SRT time format
                const srtTimeline = line.replace(/\./g, ','); // VTT uses dots, SRT uses commas
                
                srtLines.push(`${subtitleIndex}`);
                srtLines.push(srtTimeline);
                
                // Get subtitle text
                i++;
                const textLines = [];
                while (i < lines.length && lines[i].trim() !== '') {
                    textLines.push(lines[i].trim());
                    i++;
                }
                
                srtLines.push(textLines.join('\n'));
                srtLines.push('');
                subtitleIndex++;
            }
            i++;
        }
        
        const srtContent = srtLines.join('\n');
        console.log(`[SubtitleMatcher] Converted VTT to SRT, ${subtitleIndex - 1} subtitles`);
        return srtContent;
        
    } catch (e) {
        console.error(`[SubtitleMatcher] Error converting VTT to SRT:`, e);
        return vttContent; // Return original if conversion fails
    }
}

// Helper function to convert ASS time format to SRT time format
function convertAssTimeToSrt(assTime) {
    try {
        // ASS format: H:MM:SS.CC (centiseconds)
        // SRT format: HH:MM:SS,mmm (milliseconds)
        
        const parts = assTime.split(':');
        if (parts.length !== 3) return null;
        
        const hours = parts[0].padStart(2, '0');
        const minutes = parts[1];
        const secondsParts = parts[2].split('.');
        const seconds = secondsParts[0];
        const centiseconds = secondsParts[1] || '00';
        
        const milliseconds = (parseInt(centiseconds) * 10).toString().padStart(3, '0');
        
        return `${hours}:${minutes}:${seconds},${milliseconds}`;
        
    } catch (e) {
        console.error(`[SubtitleMatcher] Error converting ASS time:`, e);
        return null;
    }
}

// Helper function to validate and fix SRT format
async function validateAndFixSrtFormat(srtContent) {
    try {
        console.log(`[SubtitleMatcher] Validating and fixing SRT format`);
        
        const lines = srtContent.split('\n');
        const fixedLines = [];
        let currentSubtitleIndex = 1;
        let i = 0;
        
        while (i < lines.length) {
            const line = lines[i].trim();
            
            // Skip empty lines
            if (line === '') {
                i++;
                continue;
            }
            
            // Look for timing lines
            if (line.includes('-->')) {
                // Add subtitle index if missing
                if (fixedLines.length === 0 || !fixedLines[fixedLines.length - 1].match(/^\d+$/)) {
                    fixedLines.push(`${currentSubtitleIndex}`);
                    currentSubtitleIndex++;
                }
                
                // Fix timing format
                const fixedTimeline = line.replace(/\./g, ',').replace(/(\d{2}:\d{2}:\d{2}),(\d{1,2})\s*-->\s*(\d{2}:\d{2}:\d{2}),(\d{1,2})/, 
                    (match, start, startMs, end, endMs) => {
                        const fixedStartMs = startMs.padEnd(3, '0');
                        const fixedEndMs = endMs.padEnd(3, '0');
                        return `${start},${fixedStartMs} --> ${end},${fixedEndMs}`;
                    });
                
                fixedLines.push(fixedTimeline);
                
                // Get subtitle text
                i++;
                const textLines = [];
                while (i < lines.length && lines[i].trim() !== '' && !lines[i].includes('-->')) {
                    textLines.push(lines[i].trim());
                    i++;
                }
                
                if (textLines.length > 0) {
                    fixedLines.push(textLines.join('\n'));
                    fixedLines.push('');
                }
                
                continue;
            }
            
            // Handle subtitle index
            if (line.match(/^\d+$/)) {
                fixedLines.push(line);
            }
            
            i++;
        }
        
        const fixedContent = fixedLines.join('\n');
        console.log(`[SubtitleMatcher] SRT format validation complete`);
        return fixedContent;
        
    } catch (e) {
        console.error(`[SubtitleMatcher] Error validating SRT format:`, e);
        return srtContent; // Return original if validation fails
    }
}

// Enhanced subtitle content validation with comprehensive format checking
function isValidSubtitleContent(content) {
    try {
        if (!content || typeof content !== 'string' || content.length < 10) {
            return false;
        }
        
        // Remove BOM and normalize
        const cleanContent = content.replace(/^\uFEFF/, '').trim();
        
        // Check for common subtitle patterns
        const hasTimeStamps = cleanContent.includes('-->');
        const hasNumbers = /^\d+$/m.test(cleanContent);
        const hasTimeFormat = /\d{2}:\d{2}:\d{2}[,\.]\d{3}/.test(cleanContent);
        
        // Check for SRT format
        const srtPattern = /^\d+\s*\n\d{2}:\d{2}:\d{2}[,\.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,\.]\d{3}/m;
        const isSrt = srtPattern.test(cleanContent);
        
        // Check for VTT format
        const vttPattern = /WEBVTT|^\d{2}:\d{2}:\d{2}\.\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}\.\d{3}/m;
        const isVtt = vttPattern.test(cleanContent);
        
        // Check for ASS format
        const assPattern = /\[Script Info\]|\[V4\+ Styles\]|Dialogue:/i;
        const isAss = assPattern.test(cleanContent);
        
        // Check for minimum content requirements
        const lines = cleanContent.split('\n').filter(line => line.trim().length > 0);
        const hasMinimumLines = lines.length >= 3;
        
        // Check for actual subtitle text (not just metadata)
        const hasSubtitleText = lines.some(line => 
            line.length > 5 && 
            !line.match(/^\d+$/) && 
            !line.includes('-->') && 
            !line.match(/^\d{2}:\d{2}:\d{2}/) &&
            !line.startsWith('[') &&
            !line.startsWith('Dialogue:')
        );
        
        const isValid = (hasTimeStamps && hasNumbers && hasTimeFormat && hasMinimumLines && hasSubtitleText) || 
                       isSrt || isVtt || isAss;
        
        console.log(`[SubtitleMatcher] Subtitle validation: isValid=${isValid}`);
        
        return isValid;
        
    } catch (e) {
        console.error('[subtitleMatcher] Error validating subtitle content:', e);
        return false;
    }
}

// Enhanced Gemini model validation with real-time availability checking
async function validateGeminiModel(model) {
    try {
        const supportedModels = [
            'gemini-2.5-flash-lite-preview-06-17',
            'gemini-2.5-flash-preview-06-17',
            'gemini-2.5-pro-preview-06-17',
            'gemini-2.0-flash-exp',
            'gemini-1.5-flash',
            'gemini-1.5-pro',
            'gemini-pro'
        ];
        
        if (!supportedModels.includes(model)) {
            console.warn(`[SubtitleMatcher] Warning: Model ${model} not in supported list, but attempting to use it anyway`);
        }
        
        // Test model availability with a simple request
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.error('[SubtitleMatcher] Gemini API key not configured');
            return false;
        }
        
        const testUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        
        try {
            const testResponse = await robustFetch(testUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: 'Test'
                        }]
                    }],
                    generationConfig: {
                        maxOutputTokens: 10
                    }
                })
            });
            
            if (testResponse && testResponse.ok) {
                console.log(`[SubtitleMatcher] Model ${model} is available and working`);
                return true;
            } else {
                console.warn(`[SubtitleMatcher] Model ${model} test failed with status: ${testResponse?.status}`);
                return false;
            }
            
        } catch (testError) {
            console.warn(`[SubtitleMatcher] Model ${model} availability test failed:`, testError.message);
            return false;
        }
        
    } catch (e) {
        console.error('[subtitleMatcher] Error validating Gemini model:', e);
        return false;
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
        // Enhanced video ID validation
        if (typeof videoId !== 'string' || !videoId) {
            console.error('[SubtitleMatcher] Invalid videoId:', videoId);
            return { subtitles: [{ id: 'fallback-tr', lang: 'tr', url: `data:text/plain;charset=utf-8,${encodeURIComponent(fallbackSubtitle('Invalid video ID'))}`, behaviorHints: { notWebReady: false, fallback: true }, name: '[Subtitle unavailable]' }] };
        }
        
        // Validate video ID format
        const isValidImdb = videoId.startsWith('tt') && videoId.length >= 9;
        const isValidTmdb = videoId.startsWith('tmdb:') && videoId.split(':')[1];
        
        if (!isValidImdb && !isValidTmdb) {
            console.error('[SubtitleMatcher] Invalid video ID format:', videoId);
            return { subtitles: [{ id: 'fallback-tr', lang: 'tr', url: `data:text/plain;charset=utf-8,${encodeURIComponent(fallbackSubtitle('Invalid video ID format'))}`, behaviorHints: { notWebReady: false, fallback: true }, name: '[Subtitle unavailable]' }] };
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
            
            // Try traditional OpenSubtitles approach as ultimate fallback
            try {
                const traditionalContent = await getOpenSubtitlesContent(videoId);
                if (traditionalContent) {
                    console.log(`[SubtitleMatcher] Traditional OpenSubtitles fallback successful`);
                    const fallbackUrl = await serveAiSubtitle(traditionalContent, videoId, 'opensubtitles-fallback');
                    subtitles.push({
                        id: `opensubtitles-fallback-tr`,
                        lang: SUPPORTED_LANGUAGE,
                        url: fallbackUrl,
                        behaviorHints: { 
                            notWebReady: false, 
                            fallback: true,
                            opensubtitles: true
                        },
                        name: 'Turkish Subtitle (OpenSubtitles)'
                    });
                }
            } catch (e) {
                console.error('[SubtitleMatcher] Traditional fallback failed:', e);
            }
            
            // If still no results, provide informative fallback
            if (subtitles.length === 0) {
                console.log(`[SubtitleMatcher] No subtitles found from any source, providing informative fallback for ${videoId}`);
                
                // Create a helpful fallback subtitle
                const fallbackContent = `1
00:00:01,000 --> 00:00:05,000
Turkish subtitles are not available

2
00:00:06,000 --> 00:00:10,000
for this content (${videoId})

3
00:00:11,000 --> 00:00:15,000
Please try a different source or check again later

4
00:00:16,000 --> 00:00:20,000
External subtitle sources may be temporarily unavailable
`;
                
                const fallbackUrl = await serveAiSubtitle(fallbackContent, videoId, 'no-subtitles-available');
                subtitles.push({
                    id: `no-subtitles-available-tr`,
                    lang: SUPPORTED_LANGUAGE,
                    url: fallbackUrl,
                    behaviorHints: { 
                        notWebReady: false, 
                        fallback: true,
                        unavailable: true
                    },
                    name: 'Turkish Subtitle (Not Available)'
                });
            }
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
        
        // Provide emergency fallback even when everything fails
        const emergencyFallback = `1
00:00:01,000 --> 00:00:05,000
System error occurred

2
00:00:06,000 --> 00:00:10,000
Unable to load subtitles for ${videoId}

3
00:00:11,000 --> 00:00:15,000
Please try again later
`;
        
        return { 
            subtitles: [{ 
                id: 'emergency-fallback-tr', 
                lang: 'tr', 
                url: `data:text/plain;charset=utf-8,${encodeURIComponent(emergencyFallback)}`, 
                behaviorHints: { notWebReady: false, fallback: true, emergency: true }, 
                name: '[System Error]' 
            }] 
        };
    }
}

// Helper function to get OpenSubtitles content
async function getOpenSubtitlesContent(videoId) {
    try {
        const opensubtitlesApiKey = process.env.OPENSUBTITLES_API_KEY;
        
        if (!opensubtitlesApiKey) {
            console.log('[subtitleMatcher] OpenSubtitles API key not found');
            return null;
        }

        // Build search parameters for Turkish subtitles
        const searchParams = new URLSearchParams({ languages: SUPPORTED_LANGUAGE });
        
        if (videoId.startsWith('tt')) {
            searchParams.append('imdb_id', videoId);
        } else if (videoId.startsWith('tmdb:')) {
            const tmdbId = videoId.split(':')[1];
            searchParams.append('tmdb_id', tmdbId);
            
            // Also try to get IMDb ID for better results
            const imdbId = await tmdbToImdb(tmdbId);
            if (imdbId) {
                searchParams.append('imdb_id', imdbId);
            }
        } else {
            console.log('[subtitleMatcher] Invalid video ID format for OpenSubtitles:', videoId);
            return null;
        }

        // Step 1: Search for subtitles
        const searchUrl = `https://api.opensubtitles.com/api/v1/subtitles?${searchParams}`;
        const searchRes = await robustFetch(searchUrl, { 
            headers: { 
                'Api-Key': opensubtitlesApiKey, 
                'User-Agent': USER_AGENT,
                'Accept': 'application/json'
            } 
        });

        if (!searchRes || !searchRes.ok) {
            console.log('[subtitleMatcher] OpenSubtitles search failed:', searchRes?.status);
            return null;
        }

        const searchData = await searchRes.json();
        if (!searchData.data?.length) {
            console.log('[subtitleMatcher] No subtitles found on OpenSubtitles');
            return null;
        }

        // Get file ID from first result
        const fileId = searchData.data[0]?.attributes?.files?.[0]?.file_id;
        if (!fileId) {
            console.log('[subtitleMatcher] No file ID found in OpenSubtitles response');
            return null;
        }

        // Step 2: Get download link
        const dlRes = await robustFetch('https://api.opensubtitles.com/api/v1/download', {
            method: 'POST',
            headers: { 
                'Api-Key': opensubtitlesApiKey, 
                'Content-Type': 'application/json', 
                'User-Agent': USER_AGENT 
            },
            body: JSON.stringify({ file_id: fileId })
        });

        if (!dlRes || !dlRes.ok) {
            console.log('[subtitleMatcher] OpenSubtitles download link request failed:', dlRes?.status);
            return null;
        }

        const dlData = await dlRes.json();
        const downloadLink = dlData.link;
        if (!downloadLink) {
            console.log('[subtitleMatcher] No download link returned from OpenSubtitles');
            return null;
        }

        // Step 3: Download subtitle content
        const subRes = await robustFetch(downloadLink);
        if (!subRes || !subRes.ok) {
            console.log('[subtitleMatcher] Failed to download subtitle from OpenSubtitles');
            return null;
        }

        const content = await subRes.text();
        console.log('[subtitleMatcher] Successfully downloaded subtitle from OpenSubtitles');
        return content;

    } catch (error) {
        console.error('[subtitleMatcher] Error in getOpenSubtitlesContent:', error);
        return null;
    }
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
    try {
        if (!content || typeof content !== 'string') {
            console.error('[subtitleMatcher] Invalid content for serveAiSubtitle');
            return null;
        }

        const cacheKey = `${videoId}-${source}`;
        externalSubtitleCache.set(cacheKey, content);
        
        console.log(`[subtitleMatcher] Cached subtitle content for ${cacheKey}, length: ${content.length}`);
        
        // Return URL that will serve the cached content
        return `/subtitles/${videoId}/tr.srt?source=${source}`;
        
    } catch (e) {
        console.error('[subtitleMatcher] Error in serveAiSubtitle:', e);
        return null;
    }
}

// Helper: Get cached external subtitle content
function getCachedSubtitleContent(videoId, source) {
    const cacheKey = `${videoId}-${source}`;
    return externalSubtitleCache.get(cacheKey);
}

// Helper: Get progressive subtitle content for AI-enhanced subtitles
function getProgressiveSubtitleContent(videoId, baseSource) {
    // Check if AI-enhanced version is available
    const aiCacheKey = `${videoId}-${baseSource}-ai`;
    const aiContent = externalSubtitleCache.get(aiCacheKey);
    
    if (aiContent) {
        console.log(`[subtitleMatcher] Serving AI-enhanced subtitle for ${videoId}`);
        return aiContent;
    }
    
    // Check enhancement status
    const status = aiEnhancementStatus.get(aiCacheKey);
    if (status === 'processing') {
        // Return original content with note that AI enhancement is in progress
        const originalKey = `${videoId}-${baseSource}`;
        const originalContent = externalSubtitleCache.get(originalKey);
        if (originalContent) {
            return originalContent + '\n\n// AI enhancement in progress...';
        }
    }
    
    // Fallback to original content
    const originalKey = `${videoId}-${baseSource}`;
    const originalContent = externalSubtitleCache.get(originalKey);
    return originalContent || fallbackSubtitle('Content not found');
}

// Background AI Enhancement Function
async function enhanceSubtitleInBackground(originalContent, videoId, source) {
    const aiCacheKey = `${videoId}-${source}-ai`;
    
    try {
        console.log(`[subtitleMatcher] Starting background AI enhancement for ${videoId} from ${source}`);
        
        // Mark as processing
        aiEnhancementStatus.set(aiCacheKey, 'processing');
        
        // Perform AI enhancement
        const enhancedContent = await getAICorrectedSubtitleDirect(originalContent);
        
        if (enhancedContent && enhancedContent !== originalContent) {
            // Cache the enhanced content
            externalSubtitleCache.set(aiCacheKey, enhancedContent);
            aiEnhancementStatus.set(aiCacheKey, 'completed');
            
            console.log(`[subtitleMatcher] AI enhancement completed for ${videoId} from ${source}`);
        } else {
            // AI enhancement failed, mark as failed but cache original
            externalSubtitleCache.set(aiCacheKey, originalContent);
            aiEnhancementStatus.set(aiCacheKey, 'failed');
            
            console.log(`[subtitleMatcher] AI enhancement failed for ${videoId} from ${source}, using original`);
        }
        
    } catch (error) {
        console.error(`[subtitleMatcher] Error in background AI enhancement for ${videoId}:`, error);
        
        // Cache original content as fallback
        externalSubtitleCache.set(aiCacheKey, originalContent);
        aiEnhancementStatus.set(aiCacheKey, 'failed');
    }
}

// Helper: AI-correct arbitrary subtitle content with multi-provider support
async function getAICorrectedSubtitleDirect(originalContent, options = {}) {
    const startTime = Date.now();
    console.log('[subtitleMatcher] Starting AI enhancement...');
    
    // Get settings from environment variables or options
    const aiProvider = options.aiProvider || process.env.AI_PROVIDER || 'gemini';
    const aiModel = options.aiModel || process.env.AI_MODEL || 'gemini-2.5-flash-lite-preview-06-17';
    const correctionIntensity = parseInt(options.correctionIntensity || process.env.CORRECTION_INTENSITY || '7');
    const aiTemperature = parseFloat(options.aiTemperature || process.env.AI_TEMPERATURE || '0.3');
    const primaryLanguage = options.primaryLanguage || process.env.PRIMARY_LANGUAGE || 'tr';
    
    // Generate intensity-based prompt with comprehensive analysis
    const intensityPrompts = {
        1: 'MINIMAL CORRECTIONS: Apply only critical fixes (overlaps, negative durations)',
        2: 'LIGHT CORRECTIONS: Fix basic timing issues and major sync problems',  
        3: 'BASIC CORRECTIONS: Adjust obvious timing problems and reading speed issues',
        4: 'STANDARD CORRECTIONS: Fix timing, reading speed, and scene transitions',
        5: 'MODERATE CORRECTIONS: Comprehensive timing fixes with dialogue optimization',
        6: 'ENHANCED CORRECTIONS: Full timing optimization with frame rate detection',
        7: 'COMPREHENSIVE CORRECTIONS: Advanced timing analysis with linguistic optimization',
        8: 'INTENSIVE CORRECTIONS: Deep analysis with cultural and linguistic adaptation',
        9: 'MAXIMUM CORRECTIONS: Full AI-powered optimization with advanced heuristics',
        10: 'AGGRESSIVE CORRECTIONS: Complete timing reconstruction with predictive analysis'
    };
    
    // Build the comprehensive prompt
    const basePrompt = `${intensityPrompts[correctionIntensity]}

Fix subtitle timing synchronization issues in this ${getLanguageName(primaryLanguage)} SRT file using professional subtitle timing analysis:

1. FRAME RATE ANALYSIS:
   - Identify the likely frame rate (23.976 fps, 24 fps, 25 fps, 29.97 fps, 30 fps) by analyzing timestamp patterns and drift
   - Calculate the frame rate conversion factor if needed
   - Detect PAL/NTSC conversion artifacts in timing

2. LINEAR TIMING DRIFT DETECTION:
   - Analyze the first 10%, middle 50%, and last 10% of subtitles for timing consistency
   - Detect if the file is consistently too fast or too slow throughout
   - Calculate the drift coefficient (e.g., 1.04166 for 25fps→23.976fps conversion)

3. DIALOGUE CADENCE AND SUBTITLE READING ANALYSIS:
   - Optimize timing for ${getLanguageName(primaryLanguage)} subtitle reading patterns and comprehension speed
   - Ensure subtitle timing allows adequate reading time for ${getLanguageName(primaryLanguage)} text
   - Account for ${getLanguageName(primaryLanguage)} reading rhythm and text processing patterns
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
   - Ensure CPS stays between 15-20 for optimal ${getLanguageName(primaryLanguage)} reading speed
   - Adjust timing for longer ${getLanguageName(primaryLanguage)} text to allow adequate reading time
   - Account for ${getLanguageName(primaryLanguage)} text complexity and word structure

9. PUNCTUATION AND BREATH TIMING:
   - Add natural pauses after periods (minimum 0.3 seconds)
   - Extend timing for question marks and exclamation marks
   - Account for comma pauses in long sentences
   - Adjust for ${getLanguageName(primaryLanguage)}-specific punctuation patterns

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

    try {
        let aiResponse;
        
        // Try providers in order with fallback
        switch (aiProvider) {
            case 'openai':
                aiResponse = await callOpenAI(basePrompt, aiModel, aiTemperature);
                if (!aiResponse && process.env.CLAUDE_API_KEY) {
                    console.log('[subtitleMatcher] OpenAI failed, trying Claude fallback...');
                    aiResponse = await callClaude(basePrompt, 'claude-3-5-haiku-20241022', aiTemperature);
                }
                if (!aiResponse && process.env.GEMINI_API_KEY) {
                    console.log('[subtitleMatcher] OpenAI and Claude failed, trying Gemini fallback...');
                    aiResponse = await callGemini(basePrompt, 'gemini-2.0-flash-exp', aiTemperature);
                }
                break;
            case 'claude':
                aiResponse = await callClaude(basePrompt, aiModel, aiTemperature);
                if (!aiResponse && process.env.OPENAI_API_KEY) {
                    console.log('[subtitleMatcher] Claude failed, trying OpenAI fallback...');
                    aiResponse = await callOpenAI(basePrompt, 'gpt-4o-mini', aiTemperature);
                }
                if (!aiResponse && process.env.GEMINI_API_KEY) {
                    console.log('[subtitleMatcher] Claude and OpenAI failed, trying Gemini fallback...');
                    aiResponse = await callGemini(basePrompt, 'gemini-2.0-flash-exp', aiTemperature);
                }
                break;
            case 'gemini':
            default:
                aiResponse = await callGemini(basePrompt, aiModel, aiTemperature);
                if (!aiResponse && process.env.OPENAI_API_KEY) {
                    console.log('[subtitleMatcher] Gemini failed, trying OpenAI fallback...');
                    aiResponse = await callOpenAI(basePrompt, 'gpt-4o-mini', aiTemperature);
                }
                if (!aiResponse && process.env.CLAUDE_API_KEY) {
                    console.log('[subtitleMatcher] Gemini and OpenAI failed, trying Claude fallback...');
                    aiResponse = await callClaude(basePrompt, 'claude-3-5-haiku-20241022', aiTemperature);
                }
                break;
        }
        
        if (aiResponse && aiResponse.length > 10) {
            const duration = Date.now() - startTime;
            console.log(`[subtitleMatcher] AI enhancement completed with ${aiProvider} in ${duration}ms`);
            return aiResponse;
        } else {
            console.log('[subtitleMatcher] All AI providers failed, returning original content');
            return originalContent;
        }
        
    } catch (err) {
        console.error(`[subtitleMatcher] Error during ${aiProvider} AI correction:`, err);
        return originalContent;
    }
}

// OpenAI API implementation
async function callOpenAI(prompt, model = 'gpt-4o-mini', temperature = 0.3) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.log('[subtitleMatcher] OpenAI API key not configured');
        return null;
    }
    
    const maxTokens = parseInt(process.env.AI_MAX_TOKENS || '80000');
    
    try {
        const response = await robustFetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    {
                        role: 'system',
                        content: 'You are a professional subtitle timing expert. Fix subtitle synchronization issues while preserving all dialogue text exactly as provided.'
                    },
                    {
                        role: 'user', 
                        content: prompt
                    }
                ],
                temperature: temperature,
                max_tokens: maxTokens,
                top_p: 0.9
            })
        }, 3, 30000); // 30 second timeout for AI API calls
        
        if (!response || !response.ok) {
            console.error(`[subtitleMatcher] OpenAI API error: ${response?.status}`);
            return null;
        }
        
        const data = await response.json();
        return data.choices?.[0]?.message?.content?.trim() || null;
        
    } catch (error) {
        console.error('[subtitleMatcher] OpenAI API call failed:', error);
        return null;
    }
}

// Claude API implementation
async function callClaude(prompt, model = 'claude-3-5-haiku-20241022', temperature = 0.3) {
    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) {
        console.log('[subtitleMatcher] Claude API key not configured');
        return null;
    }
    
    const maxTokens = parseInt(process.env.AI_MAX_TOKENS || '80000');
    
    try {
        const response = await robustFetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                'Content-Type': 'application/json',
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: temperature,
                max_tokens: maxTokens,
                top_p: 0.9
            })
        }, 3, 30000); // 30 second timeout for AI API calls
        
        if (!response || !response.ok) {
            console.error(`[subtitleMatcher] Claude API error: ${response?.status}`);
            return null;
        }
        
        const data = await response.json();
        return data.content?.[0]?.text?.trim() || null;
        
    } catch (error) {
        console.error('[subtitleMatcher] Claude API call failed:', error);
        return null;
    }
}

// Gemini API implementation (existing but enhanced)
async function callGemini(prompt, model = 'gemini-2.5-flash-lite-preview-06-17', temperature = 0.3) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.log('[subtitleMatcher] Gemini API key not configured');
        return null;
    }
    
    // Validate model compatibility
    await validateGeminiModel(model);
    
    try {
        console.log(`[subtitleMatcher] Using Gemini model: ${model} with temperature: ${temperature}`);
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        
        const response = await robustFetch(geminiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }],
                generationConfig: {
                    temperature: temperature,
                    topP: 0.9,
                    maxOutputTokens: parseInt(process.env.AI_MAX_TOKENS || '80000')
                }
            })
        }, 3, 30000); // 30 second timeout for AI API calls
        
        if (!response || !response.ok) {
            console.error(`[subtitleMatcher] Gemini API error: ${response?.status}`);
            return null;
        }
        
        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
        
    } catch (error) {
        console.error('[subtitleMatcher] Gemini API call failed:', error);
        return null;
    }
}

// Helper function to get language name
function getLanguageName(langCode) {
    const languages = {
        'tr': 'Turkish',
        'en': 'English', 
        'es': 'Spanish',
        'fr': 'French',
        'de': 'German',
        'it': 'Italian',
        'pt': 'Portuguese',
        'ru': 'Russian',
        'zh': 'Chinese',
        'ja': 'Japanese',
        'ko': 'Korean',
        'ar': 'Arabic',
        'nl': 'Dutch',
        'sv': 'Swedish',
        'no': 'Norwegian',
        'da': 'Danish',
        'fi': 'Finnish',
        'pl': 'Polish',
        'cs': 'Czech',
        'hu': 'Hungarian'
    };
    return languages[langCode] || 'Turkish';
}

// Helper function for quick subtitle discovery with parallel processing
async function getSubtitleQuickly(videoId, infoHash) {
    console.log(`[subtitleMatcher] Quick subtitle discovery for ${videoId}`);
    
    const discoveryPromises = [];
    
    // Priority 1: Hash-based OpenSubtitles (if infoHash provided)
    if (infoHash) {
        discoveryPromises.push(
            fetchOpenSubtitlesSubtitle(videoId, infoHash)
                .then(url => url ? { url, source: 'opensubtitles-hash', priority: 1 } : null)
                .catch(e => {
                    console.error('[subtitleMatcher] OpenSubtitles hash search failed:', e);
                    return null;
                })
        );
    }
    
    // Priority 2: SubDL search
    discoveryPromises.push(
        fetchSubdlSubtitle(videoId, infoHash)
            .then(url => url ? { url, source: 'subdl', priority: 2 } : null)
            .catch(e => {
                console.error('[subtitleMatcher] SubDL search failed:', e);
                return null;
            })
    );
    
    // Priority 3: Standard OpenSubtitles search
    discoveryPromises.push(
        fetchOpenSubtitlesSubtitle(videoId, null)
            .then(url => url ? { url, source: 'opensubtitles', priority: 3 } : null)
            .catch(e => {
                console.error('[subtitleMatcher] OpenSubtitles search failed:', e);
                return null;
            })
    );
    
    // Priority 4: Podnapisi search
    discoveryPromises.push(
        fetchPodnapisiSubtitle(videoId, infoHash)
            .then(url => url ? { url, source: 'podnapisi', priority: 4 } : null)
            .catch(e => {
                console.error('[subtitleMatcher] Podnapisi search failed:', e);
                return null;
            })
    );
    
    try {
        // Wait for all promises with timeout
        const results = await Promise.allSettled(discoveryPromises);
        
        // Filter successful results and sort by priority
        const successfulResults = results
            .filter(result => result.status === 'fulfilled' && result.value)
            .map(result => result.value)
            .sort((a, b) => a.priority - b.priority);
        
        console.log(`[subtitleMatcher] Quick discovery found ${successfulResults.length} sources`);
        return successfulResults;
        
    } catch (error) {
        console.error('[subtitleMatcher] Error in quick subtitle discovery:', error);
        return [];
    }
}

// Enhanced getAICorrectedSubtitle function that accepts options
async function getAICorrectedSubtitle(videoId, language, options = {}) {
    try {
        // Get subtitle content from OpenSubtitles first
        const originalContent = await getOpenSubtitlesContent(videoId);
        if (!originalContent) {
            return fallbackSubtitle('No subtitle content found');
        }
        
        // Apply AI correction with options
        return await getAICorrectedSubtitleDirect(originalContent, options);
        
    } catch (error) {
        console.error('[subtitleMatcher] Error in getAICorrectedSubtitle:', error);
        return fallbackSubtitle('AI correction failed');
    }
}

// Module exports
module.exports = {
    getAICorrectedSubtitle,
    getSubtitleUrlsForStremio,
    getCachedSubtitleContent,
    getProgressiveSubtitleContent,
    aiEnhancementStatus,
    aiEnhancementQueue,
    serveAiSubtitle,
    getSubtitleQuickly,
    downloadAndProcessSubtitle,
    enhanceSubtitleInBackground,
    fetchSubdlSubtitle,
    fetchOpenSubtitlesSubtitle,
    fetchPodnapisiSubtitle,
    getAICorrectedSubtitleDirect,
    isValidSubtitleContent,
    validateGeminiModel,
    externalSubtitleCache,
    fallbackSubtitle
};