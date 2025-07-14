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

// Enhanced robust fetch with retry logic inspired by a4kSubtitles
async function robustFetch(url, options = {}, maxRetries = 3, timeout = 15000) {
    let controller;
    let timeoutId;
    
    const fetchOptions = {
        ...options,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            ...options.headers
        }
    };
    
    let lastError = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        controller = new AbortController();
        fetchOptions.signal = controller.signal;
        
        try {
            console.log(`[subtitleMatcher] Fetch attempt ${attempt}/${maxRetries}: ${url}`);
            
            // Set up timeout with proper cleanup
            const timeoutPromise = new Promise((_, reject) => {
                timeoutId = setTimeout(() => {
                    controller.abort();
                    reject(new Error(`Request timeout after ${timeout}ms`));
                }, timeout);
            });
            
            const fetchPromise = fetch(url, fetchOptions);
            const response = await Promise.race([fetchPromise, timeoutPromise]);
            
            // Clear timeout on success
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
            
            if (response.ok) {
                return response;
            }
            
            // Handle specific HTTP errors
            if (response.status === 429) {
                // Rate limited, wait longer
                const waitTime = Math.min(1000 * Math.pow(2, attempt), 10000);
                console.log(`[subtitleMatcher] Rate limited, waiting ${waitTime}ms before retry`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue;
            }
            
            if (response.status >= 500) {
                // Server error, retry with exponential backoff
                const waitTime = Math.min(500 * Math.pow(2, attempt), 5000);
                console.log(`[subtitleMatcher] Server error ${response.status}, waiting ${waitTime}ms before retry`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue;
            }
            
            // Client error, don't retry
            console.log(`[subtitleMatcher] Client error ${response.status}, not retrying`);
            return response;
            
        } catch (error) {
            lastError = error;
            console.log(`[subtitleMatcher] Fetch error (attempt ${attempt}): ${error.message}`);
            
            // Clean up timeout and controller
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
            
            if (attempt === maxRetries) {
                break;
            }
            
            // Wait before retry with jitter
            const baseDelay = 1000 * attempt;
            const jitter = Math.random() * 1000;
            const waitTime = Math.min(baseDelay + jitter, 5000);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
    }
    
    // Final cleanup
    if (timeoutId) {
        clearTimeout(timeoutId);
    }
    if (controller) {
        controller.abort();
    }
    
    console.error(`[subtitleMatcher] All fetch attempts failed for ${url}:`, lastError);
    return null;
}

// Helper for subdl.com API - Enhanced with a4kSubtitles approach
async function fetchSubdlSubtitle(videoId, infoHash) {
    try {
        const subdlApiKey = process.env.SUBDL_API_KEY;
        console.log('[subtitleMatcher] fetchSubdlSubtitle called with videoId:', videoId, 'infoHash:', infoHash);
        console.log('[subtitleMatcher] SUBDL_API_KEY present:', !!subdlApiKey);
        // Mask API key in logs for security
        if (subdlApiKey) {
            console.log('[subtitleMatcher] SUBDL_API_KEY masked:', subdlApiKey.substring(0, 4) + '***' + subdlApiKey.substring(subdlApiKey.length - 4));
        }
        
        if (!subdlApiKey) {
            console.log('[subtitleMatcher] SubDL API key not found, skipping SubDL');
            return null;
        }
        
        // Extract metadata for better search
        let imdbId = videoId;
        let tmdbId = null;
        
        if (videoId.startsWith('tmdb:')) {
            tmdbId = videoId.split(':')[1];
            imdbId = await tmdbToImdb(tmdbId);
            if (!imdbId) {
                console.log('[subtitleMatcher] Failed to convert TMDb to IMDb for SubDL');
                return null;
            }
        }
        
        // Enhanced search request building inspired by a4kSubtitles
        const searchRequests = buildSubdlSearchRequests(imdbId, infoHash);
        
        for (const request of searchRequests) {
            console.log('[subtitleMatcher] SubDL: Trying request:', request.method, request.url);
            
            const response = await robustFetch(request.url, { 
                headers: { 
                    'Accept': 'application/json',
                    'User-Agent': 'Stremio-AI-Sub-Addon/2.0'
                } 
            });
            
            if (!response?.ok) {
                console.log('[subtitleMatcher] SubDL request failed:', response?.status);
                continue;
            }
            
            const data = await response.json();
            
            if (!data.status || !data.subtitles?.length) {
                console.log('[subtitleMatcher] SubDL no results for request:', request.method);
                continue;
            }
            
            // Parse and filter results
            const subtitles = parseSubdlSearchResponse(data, videoId, infoHash);
            
            if (subtitles.length > 0) {
                // Return best match
                const bestSubtitle = subtitles[0];
                console.log('[subtitleMatcher] SubDL found subtitle:', bestSubtitle.title);
                return bestSubtitle.url;
            }
        }
        
        console.log('[subtitleMatcher] SubDL exhausted all search methods');
        return null;
        
    } catch (e) {
        console.error('[subtitleMatcher] fetchSubdlSubtitle error:', e);
        return null;
    }
}

// Build multiple search requests for SubDL (inspired by a4kSubtitles)
function buildSubdlSearchRequests(imdbId, infoHash) {
    const subdlApiKey = process.env.SUBDL_API_KEY;
    const requests = [];
    
    const baseParams = {
        api_key: subdlApiKey,
        languages: 'tr',
        type: 'movie',
        subs_per_page: 50
    };
    
    // Priority 1: Hash-based search
    if (infoHash) {
        requests.push({
            method: 'hash',
            url: `https://api.subdl.com/api/v1/subtitles?${new URLSearchParams({
                ...baseParams,
                hash: infoHash
            })}`
        });
    }
    
    // Priority 2: IMDb ID with year
    if (imdbId?.startsWith('tt')) {
        requests.push({
            method: 'imdb_with_year',
            url: `https://api.subdl.com/api/v1/subtitles?${new URLSearchParams({
                ...baseParams,
                imdb_id: imdbId,
                year: new Date().getFullYear().toString() // Current year as fallback
            })}`
        });
        
        // Priority 3: IMDb ID only
        requests.push({
            method: 'imdb_only',
            url: `https://api.subdl.com/api/v1/subtitles?${new URLSearchParams({
                ...baseParams,
                imdb_id: imdbId
            })}`
        });
    }
    
    return requests;
}

// Parse SubDL search response (inspired by a4kSubtitles) with enhanced format support
function parseSubdlSearchResponse(data, videoId, infoHash) {
    const subtitles = [];
    
    if (!data.subtitles?.length) return subtitles;
    
    for (const item of data.subtitles) {
        // Language filtering
        const language = (item.language || '').toLowerCase();
        const releaseName = (item.release_name || '').toLowerCase();
        
        const isTurkish = language === 'tr' || language === 'turkish' ||
                         releaseName.includes('turkish') || releaseName.includes('türkçe') || 
                         releaseName.includes('tr.') || releaseName.includes('.tr.');
        
        if (!isTurkish) continue;
        
        // Enhanced URL handling for different file formats
        let subtitleUrl = item.url;
        if (!subtitleUrl?.startsWith('http')) {
            subtitleUrl = `https://dl.subdl.com${item.url}`;
        }
        
        // Build subtitle object with format detection
        const subtitle = {
            title: item.release_name || item.title || 'Unknown',
            url: subtitleUrl,
            language: 'tr',
            source: 'subdl',
            hi: item.hi || false,
            downloads: parseInt(item.download_count || 0),
            rating: parseFloat(item.rating || 0),
            uploader: item.uploader || 'Unknown',
            format: detectSubtitleFormat(item.format || item.url || 'srt'),
            compressed: isCompressedFormat(item.format || item.url || ''),
            fileSize: parseInt(item.file_size || 0)
        };
        
        // Enhanced scoring with format considerations
        subtitle.score = calculateEnhancedSubtitleScore(subtitle, videoId, infoHash);
        
        subtitles.push(subtitle);
    }
    
    // Sort by score (highest first)
    subtitles.sort((a, b) => b.score - a.score);
    
    console.log(`[subtitleMatcher] SubDL parsed ${subtitles.length} Turkish subtitles with format support`);
    
    return subtitles;
}

// Detect subtitle format from file extension or URL
function detectSubtitleFormat(formatOrUrl) {
    const input = (formatOrUrl || '').toLowerCase();
    
    if (input.includes('.srt') || input === 'srt') return 'srt';
    if (input.includes('.ass') || input === 'ass') return 'ass';
    if (input.includes('.ssa') || input === 'ssa') return 'ssa';
    if (input.includes('.vtt') || input === 'vtt') return 'vtt';
    if (input.includes('.sub') || input === 'sub') return 'sub';
    if (input.includes('.idx') || input === 'idx') return 'idx';
    
    return 'srt'; // Default
}

// Check if format is compressed
function isCompressedFormat(formatOrUrl) {
    const input = (formatOrUrl || '').toLowerCase();
    
    return input.includes('.zip') || 
           input.includes('.rar') || 
           input.includes('.gz') || 
           input.includes('.7z') ||
           input.includes('compressed');
}

// Enhanced subtitle scoring with format and compression considerations
function calculateEnhancedSubtitleScore(subtitle, videoId, infoHash) {
    let score = 0;
    
    // Base score
    score += 100;
    
    // Downloads factor (more weight for popular subtitles)
    score += Math.min(subtitle.downloads * 3, 300);
    
    // Rating factor
    score += subtitle.rating * 25;
    
    // Hearing impaired penalty
    if (subtitle.hi) score -= 50;
    
    // Format bonuses
    switch (subtitle.format) {
        case 'srt':
            score += 30; // SRT is most compatible
            break;
        case 'ass':
        case 'ssa':
            score += 20; // ASS/SSA has formatting but can be converted
            break;
        case 'vtt':
            score += 15; // VTT is web-friendly
            break;
        default:
            score += 5; // Other formats
    }
    
    // Compression considerations
    if (subtitle.compressed) {
        score += 10; // Compressed files often have better quality
        
        // But prefer non-compressed for reliability
        if (subtitle.format === 'srt' && !subtitle.compressed) {
            score += 5; // Bonus for uncompressed SRT
        }
    }
    
    // File size considerations (larger files often have better quality)
    if (subtitle.fileSize > 0) {
        if (subtitle.fileSize > 50000) score += 15; // Large files (>50KB)
        else if (subtitle.fileSize > 20000) score += 10; // Medium files (>20KB)
        else if (subtitle.fileSize > 5000) score += 5; // Small files (>5KB)
    }
    
    // Hash matching bonus (very high priority)
    if (infoHash && subtitle.title?.toLowerCase().includes(infoHash.substring(0, 8))) {
        score += 400; // Increased bonus for hash match
    }
    
    // IMDb ID matching bonus
    if (videoId?.startsWith('tt') && subtitle.title?.includes(videoId.replace('tt', ''))) {
        score += 250; // Increased bonus for IMDb match
    }
    
    // Quality indicators with more comprehensive list
    const qualityKeywords = [
        'bluray', 'blu-ray', 'bdrip', 'brrip',
        'web-dl', 'webdl', 'webrip', 'web-rip',
        'dvdrip', 'dvd-rip', 'dvdscr',
        '2160p', '4k', '1080p', '720p', '480p',
        'x264', 'x265', 'h264', 'h265', 'hevc',
        'aac', 'ac3', 'dts', 'truehd',
        'hdr', 'dolby', 'atmos'
    ];
    
    for (const keyword of qualityKeywords) {
        if (subtitle.title?.toLowerCase().includes(keyword)) {
            score += 8; // Reduced individual bonus but more keywords
        }
    }
    
    // Release group bonus
    const releaseGroups = [
        'yts', 'rarbg', 'sparks', 'geckos', 'cmrg', 'ntg', 'megusta', 
        'xvid', 'amiable', 'rovers', 'psychd', 'deflate', 'crimson'
    ];
    
    for (const group of releaseGroups) {
        if (subtitle.title?.toLowerCase().includes(group)) {
            score += 12; // Release group bonus
        }
    }
    
    // Turkish-specific bonuses
    const turkishIndicators = ['tr', 'turkish', 'türkçe', 'turkce'];
    for (const indicator of turkishIndicators) {
        if (subtitle.title?.toLowerCase().includes(indicator)) {
            score += 20; // Language match bonus
        }
    }
    
    return Math.max(0, score);
}

// Calculate subtitle score based on various factors (enhanced version)
function calculateSubtitleScore(subtitle, videoId, infoHash) {
    // Use the enhanced scoring if available, fallback to basic scoring
    if (typeof calculateEnhancedSubtitleScore === 'function') {
        return calculateEnhancedSubtitleScore(subtitle, videoId, infoHash);
    }
    
    let score = 0;
    
    // Base score
    score += 100;
    
    // Downloads factor
    score += Math.min(subtitle.downloads * 2, 200);
    
    // Rating factor
    score += subtitle.rating * 20;
    
    // Hearing impaired penalty
    if (subtitle.hi) score -= 50;
    
    // Format bonus
    if (subtitle.format === 'srt') score += 20;
    
    // Hash matching bonus
    if (infoHash && subtitle.title?.toLowerCase().includes(infoHash.substring(0, 8))) {
        score += 300;
    }
    
    // IMDb ID matching bonus
    if (videoId?.startsWith('tt') && subtitle.title?.includes(videoId.replace('tt', ''))) {
        score += 200;
    }
    
    // Quality indicators
    const qualityKeywords = ['bluray', 'web-dl', 'webrip', '1080p', '720p', 'x264', 'x265'];
    for (const keyword of qualityKeywords) {
        if (subtitle.title?.toLowerCase().includes(keyword)) {
            score += 10;
        }
    }
    
    return Math.max(0, score);
}

// Helper to get movie metadata for better search
async function getMovieMetadata(imdbId) {
    try {
        const sources = [
            { url: `https://www.omdbapi.com/?i=${imdbId}&apikey=${process.env.OMDB_API_KEY}`, name: 'OMDb' },
            { url: `https://api.themoviedb.org/3/find/${imdbId}?api_key=${process.env.TMDB_API_KEY}&external_source=imdb_id`, name: 'TMDb' }
        ];

        for (const source of sources) {
            if (!source.url.includes('undefined')) {
                try {
                    const response = await robustFetch(source.url);
                    if (response && response.ok) {
                        const data = await response.json();
                        
                        if (source.name === 'OMDb' && data.Response === 'True') {
                            return {
                                title: data.Title,
                                year: data.Year,
                                plot: data.Plot,
                                genre: data.Genre,
                                director: data.Director,
                                actors: data.Actors,
                                runtime: data.Runtime,
                                rating: data.imdbRating
                            };
                        } else if (source.name === 'TMDb' && data.movie_results && data.movie_results.length > 0) {
                            const movie = data.movie_results[0];
                            return {
                                title: movie.title,
                                year: movie.release_date ? movie.release_date.split('-')[0] : null,
                                plot: movie.overview,
                                genre: movie.genre_ids ? movie.genre_ids.join(', ') : null,
                                rating: movie.vote_average
                            };
                        }
                    }
                } catch (e) {
                    console.error(`[subtitleMatcher] Error with ${source.name}:`, e);
                    continue;
                }
            }
        }

        // Fallback
        return {
            title: `Movie ${imdbId}`,
            year: new Date().getFullYear().toString()
        };
    } catch (e) {
        console.error('[subtitleMatcher] Error getting movie metadata:', e);
        return {
            title: `Movie ${imdbId}`,
            year: new Date().getFullYear().toString()
        };
    }
}

// Helper for Podnapisi API - Enhanced with a4kSubtitles JSON API approach
async function fetchPodnapisiSubtitle(videoId, infoHash) {
    try {
        console.log('[subtitleMatcher] fetchPodnapisiSubtitle called with videoId:', videoId, 'infoHash:', infoHash);
        
        let imdbId = videoId;
        let movieData = null;
        
        // Convert TMDb to IMDb if needed
        if (videoId.startsWith('tmdb:')) {
            const tmdbIdOnly = videoId.split(':')[1];
            imdbId = await tmdbToImdb(tmdbIdOnly);
            if (!imdbId) {
                console.log('[subtitleMatcher] Failed to convert TMDb to IMDb for Podnapisi');
                return null;
            }
        }
        
        // Podnapisi works better with IMDb IDs
        if (!imdbId || !imdbId.startsWith('tt')) {
            console.log('[subtitleMatcher] Invalid IMDb ID for Podnapisi:', imdbId);
            return null;
        }
        
        // Get movie metadata for better search
        try {
            movieData = await getMovieMetadata(imdbId);
            console.log('[subtitleMatcher] Podnapisi movie metadata:', movieData);
        } catch (e) {
            console.log('[subtitleMatcher] Failed to get movie metadata for Podnapisi:', e);
        }
        
        // Build multiple search requests (a4kSubtitles approach)
        const searchRequests = buildPodnapisiSearchRequests(imdbId, movieData, infoHash);
        
        for (const request of searchRequests) {
            console.log('[subtitleMatcher] Podnapisi: Trying request:', request.method);
            
            const searchRes = await robustFetch(request.url, {
                headers: {
                    'Accept': request.headers.Accept,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Accept-Language': 'tr,en-US;q=0.7,en;q=0.3',
                    'Accept-Encoding': 'gzip, deflate, br'
                }
            });
            
            if (!searchRes?.ok) {
                console.log('[subtitleMatcher] Podnapisi request failed:', searchRes?.status);
                continue;
            }
            
            const contentType = searchRes.headers.get('content-type');
            let subtitles = [];
            
            if (contentType?.includes('application/json')) {
                // JSON API response (preferred method)
                const searchData = await searchRes.json();
                subtitles = parsePodnapisiJsonResponse(searchData, videoId, infoHash);
            } else {
                // HTML response (fallback)
                const html = await searchRes.text();
                subtitles = parsePodnapisiHtmlResponse(html, videoId, infoHash);
            }
            
            if (subtitles.length > 0) {
                const bestSubtitle = subtitles[0];
                console.log('[subtitleMatcher] Podnapisi found subtitle:', bestSubtitle.title);
                return bestSubtitle.url;
            }
        }
        
        console.log('[subtitleMatcher] Podnapisi exhausted all search methods');
        return null;
        
    } catch (e) {
        console.error('[subtitleMatcher] fetchPodnapisiSubtitle error:', e);
        return null;
    }
}

// Build multiple search requests for Podnapisi (inspired by a4kSubtitles)
function buildPodnapisiSearchRequests(imdbId, movieData, infoHash) {
    const requests = [];
    
    // Priority 1: JSON API with movie title and year
    if (movieData?.title && movieData?.year) {
        const params = new URLSearchParams({
            keywords: movieData.title,
            language: 'tr',
            movie_type: 'movie',
            year: movieData.year
        });
        
        requests.push({
            method: 'json_title_year',
            url: `https://www.podnapisi.net/subtitles/search/advanced?${params}`,
            headers: { Accept: 'application/json' }
        });
    }
    
    // Priority 2: JSON API with movie title only
    if (movieData?.title) {
        const params = new URLSearchParams({
            keywords: movieData.title,
            language: 'tr',
            movie_type: 'movie'
        });
        
        requests.push({
            method: 'json_title_only',
            url: `https://www.podnapisi.net/subtitles/search/advanced?${params}`,
            headers: { Accept: 'application/json' }
        });
    }
    
    // Priority 3: JSON API with IMDb ID
    const params = new URLSearchParams({
        keywords: imdbId,
        language: 'tr',
        movie_type: 'movie'
    });
    
    requests.push({
        method: 'json_imdb_id',
        url: `https://www.podnapisi.net/subtitles/search/advanced?${params}`,
        headers: { Accept: 'application/json' }
    });
    
    // Priority 4: HTML fallback
    requests.push({
        method: 'html_fallback',
        url: `https://www.podnapisi.net/subtitles/search/advanced?${params}`,
        headers: { Accept: 'text/html' }
    });
    
    return requests;
}

// Parse Podnapisi JSON response
function parsePodnapisiJsonResponse(data, videoId, infoHash) {
    const subtitles = [];
    
    if (!data?.data?.length) return subtitles;
    
    for (const item of data.data) {
        // Language filtering
        const langCode = item.language;
        const isTurkish = langCode === 'tr' || langCode === 'turkish';
        
        if (!isTurkish) continue;
        
        // Build subtitle object
        const subtitle = {
            title: item.title || item.name || 'Unknown',
            url: item.download?.startsWith('http') ? item.download : `https://www.podnapisi.net${item.download}`,
            language: 'tr',
            source: 'podnapisi',
            rating: parseFloat(item.rating || 0),
            downloads: parseInt(item.downloads || 0),
            uploader: item.uploader || 'Unknown',
            format: 'srt'
        };
        
        // Calculate score
        subtitle.score = calculateSubtitleScore(subtitle, videoId, infoHash);
        
        subtitles.push(subtitle);
    }
    
    // Sort by score
    subtitles.sort((a, b) => b.score - a.score);
    
    console.log(`[subtitleMatcher] Podnapisi JSON parsed ${subtitles.length} Turkish subtitles`);
    
    return subtitles;
}

// Parse Podnapisi HTML response (fallback)
function parsePodnapisiHtmlResponse(html, videoId, infoHash) {
    const subtitles = [];
    
    // Extract Turkish subtitles from HTML
    const turkishSubs = extractTurkishSubtitlesFromPodnapisi(html, 'html-fallback');
    
    for (const sub of turkishSubs) {
        const subtitle = {
            title: sub.title || 'Unknown',
            url: sub.url?.startsWith('http') ? sub.url : `https://www.podnapisi.net${sub.url}`,
            language: 'tr',
            source: 'podnapisi',
            rating: 0,
            downloads: 0,
            uploader: 'Unknown',
            format: 'srt'
        };
        
        // Calculate score
        subtitle.score = calculateSubtitleScore(subtitle, videoId, infoHash);
        
        subtitles.push(subtitle);
    }
    
    // Sort by score
    subtitles.sort((a, b) => b.score - a.score);
    
    console.log(`[subtitleMatcher] Podnapisi HTML parsed ${subtitles.length} Turkish subtitles`);
    
    return subtitles;
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

// Helper function to decompress subtitle content if needed with async operations
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
        
        // Use async decompression methods instead of sync
        const zlib = require('zlib');
        const { promisify } = require('util');
        const gunzip = promisify(zlib.gunzip);
        const inflate = promisify(zlib.inflate);
        
        // Try to decompress if it looks like compressed content
        if (contentEncoding === 'gzip' || contentType.includes('application/gzip') || contentType.includes('application/x-gzip')) {
            console.log('[subtitleMatcher] Decompressing gzipped subtitle content (async)');
            try {
                const decompressed = await gunzip(buffer);
                return decompressed.toString('utf-8');
            } catch (e) {
                console.error('[subtitleMatcher] GZIP decompression failed:', e);
                return buffer.toString('utf-8');
            }
        } else if (contentEncoding === 'deflate') {
            console.log('[subtitleMatcher] Decompressing deflated subtitle content (async)');
            try {
                const decompressed = await inflate(buffer);
                return decompressed.toString('utf-8');
            } catch (e) {
                console.error('[subtitleMatcher] DEFLATE decompression failed:', e);
                return buffer.toString('utf-8');
            }
        } else {
            // Try to detect compression by checking the first few bytes
            const firstBytes = buffer.slice(0, 3);
            if (firstBytes[0] === 0x1f && firstBytes[1] === 0x8b) {
                // GZIP magic number
                console.log('[subtitleMatcher] Detected GZIP format, decompressing (async)...');
                try {
                    const decompressed = await gunzip(buffer);
                    return decompressed.toString('utf-8');
                } catch (e) {
                    console.error('[subtitleMatcher] GZIP magic detection failed:', e);
                    return buffer.toString('utf-8');
                }
            } else if (firstBytes[0] === 0x78 && (firstBytes[1] === 0x9c || firstBytes[1] === 0x01 || firstBytes[1] === 0xda)) {
                // DEFLATE magic number
                console.log('[subtitleMatcher] Detected DEFLATE format, decompressing (async)...');
                try {
                    const decompressed = await inflate(buffer);
                    return decompressed.toString('utf-8');
                } catch (e) {
                    console.error('[subtitleMatcher] DEFLATE magic detection failed:', e);
                    return buffer.toString('utf-8');
                }
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

// Enhanced helper function to decompress ZIP/RAR files from SubDL with comprehensive support
async function decompressZipSubtitle(response, originalUrl) {
    try {
        const buffer = await response.buffer();
        console.log(`[SubtitleMatcher] Processing archive file, size: ${buffer.length}, URL: ${originalUrl}`);
        
        // Enhanced ZIP file processing
        if (originalUrl.endsWith('.zip') || originalUrl.includes('zip')) {
            console.log(`[SubtitleMatcher] Processing ZIP file`);
            
            try {
                const AdmZip = require('adm-zip');
                const zip = new AdmZip(buffer);
                const zipEntries = zip.getEntries();
                
                console.log(`[SubtitleMatcher] ZIP contains ${zipEntries.length} files:`, zipEntries.map(e => e.entryName));
                
                // Prioritize subtitle files
                const subtitleExtensions = ['.srt', '.ass', '.ssa', '.vtt', '.sub', '.idx'];
                const subtitleFiles = zipEntries.filter(entry => 
                    subtitleExtensions.some(ext => entry.entryName.toLowerCase().endsWith(ext))
                );
                
                if (subtitleFiles.length > 0) {
                    // Prioritize SRT files first
                    const srtFiles = subtitleFiles.filter(f => f.entryName.toLowerCase().endsWith('.srt'));
                    const targetFile = srtFiles.length > 0 ? srtFiles[0] : subtitleFiles[0];
                    
                    console.log(`[SubtitleMatcher] Extracting subtitle file: ${targetFile.entryName}`);
                    
                    const fileData = zip.readFile(targetFile);
                    if (fileData) {
                        // Try different encodings
                        const encodings = ['utf8', 'latin1', 'ascii', 'utf16le'];
                        
                        for (const encoding of encodings) {
                            try {
                                const content = fileData.toString(encoding);
                                if (isValidSubtitleContent(content)) {
                                    console.log(`[SubtitleMatcher] Successfully extracted ZIP subtitle with ${encoding} encoding`);
                                    return content;
                                }
                            } catch (encodingError) {
                                continue;
                            }
                        }
                    }
                } else {
                    console.log(`[SubtitleMatcher] No subtitle files found in ZIP. Available files:`, zipEntries.map(e => e.entryName));
                    
                    // Try to extract any text file that might be a subtitle
                    const textFiles = zipEntries.filter(entry => {
                        const name = entry.entryName.toLowerCase();
                        return name.endsWith('.txt') || !name.includes('.') || name.length < 50;
                    });
                    
                    for (const textFile of textFiles) {
                        try {
                            const fileData = zip.readFile(textFile);
                            if (fileData) {
                                const content = fileData.toString('utf8');
                                if (isValidSubtitleContent(content)) {
                                    console.log(`[SubtitleMatcher] Found subtitle content in text file: ${textFile.entryName}`);
                                    return content;
                                }
                            }
                        } catch (textError) {
                            continue;
                        }
                    }
                }
                
                console.log(`[SubtitleMatcher] No valid subtitle content found in ZIP`);
                return null;
                
            } catch (zipError) {
                console.error(`[SubtitleMatcher] ZIP processing error:`, zipError);
                
                // Fallback: try to extract as text
                return await extractArchiveAsText(buffer, 'ZIP');
            }
        }
        
        // Enhanced RAR file processing (fallback)
        else if (originalUrl.endsWith('.rar') || originalUrl.includes('rar')) {
            console.log(`[SubtitleMatcher] Processing RAR file (fallback to ZIP)`);
            
            // Try as ZIP first (some RAR files are actually ZIP)
            try {
                const AdmZip = require('adm-zip');
                const zip = new AdmZip(buffer);
                const zipEntries = zip.getEntries();
                
                for (const entry of zipEntries) {
                    if (entry.entryName.toLowerCase().endsWith('.srt') || 
                        entry.entryName.toLowerCase().endsWith('.ass') || 
                        entry.entryName.toLowerCase().endsWith('.vtt')) {
                        console.log(`[SubtitleMatcher] Found subtitle in RAR-as-ZIP: ${entry.entryName}`);
                        const content = entry.getData().toString('utf8');
                        if (isValidSubtitleContent(content)) {
                            return content;
                        }
                    }
                }
                
                console.log(`[SubtitleMatcher] RAR-as-ZIP processing failed, trying text extraction`);
            } catch (rarAsZipError) {
                console.log(`[SubtitleMatcher] RAR is not a ZIP file`);
            }
            
            // Call the enhanced RAR function
            return await decompressRarSubtitle({ buffer: () => Promise.resolve(buffer) }, originalUrl);
        }
        
        // Unknown archive format - try generic extraction
        else {
            console.log(`[SubtitleMatcher] Unknown archive format, attempting generic extraction`);
            return await extractArchiveAsText(buffer, 'Unknown');
        }
        
    } catch (e) {
        console.error(`[SubtitleMatcher] Error decompressing archive:`, e);
        return null;
    }
}

// Generic archive text extraction
async function extractArchiveAsText(buffer, archiveType) {
    try {
        console.log(`[SubtitleMatcher] Attempting text extraction from ${archiveType} archive`);
        
        const encodings = ['utf8', 'latin1', 'ascii', 'utf16le'];
        
        for (const encoding of encodings) {
            try {
                const text = buffer.toString(encoding);
                
                // Look for subtitle patterns
                if (text.includes('-->') && text.match(/^\d+$/m)) {
                    console.log(`[SubtitleMatcher] Found subtitle patterns in ${archiveType} (${encoding})`);
                    
                    // Extract and clean subtitle content
                    const lines = text.split('\n');
                    const cleanLines = [];
                    let lastWasEmpty = false;
                    
                    for (const line of lines) {
                        const trimmed = line.trim();
                        
                        // Skip binary data indicators
                        if (trimmed.includes('\x00') || trimmed.includes('\ufffd')) {
                            continue;
                        }
                        
                        // Include subtitle-related lines
                        if (/^\d+$/.test(trimmed) || 
                            trimmed.includes('-->') || 
                            (trimmed.length > 0 && !trimmed.match(/^[^\w\s]+$/))) {
                            cleanLines.push(trimmed);
                            lastWasEmpty = false;
                        } else if (trimmed.length === 0 && !lastWasEmpty) {
                            cleanLines.push('');
                            lastWasEmpty = true;
                        }
                    }
                    
                    const extractedContent = cleanLines.join('\n').trim();
                    if (isValidSubtitleContent(extractedContent)) {
                        console.log(`[SubtitleMatcher] Successfully extracted ${archiveType} content`);
                        return extractedContent;
                    }
                }
            } catch (encodingError) {
                continue;
            }
        }
        
        console.log(`[SubtitleMatcher] ${archiveType} text extraction failed`);
        return null;
        
    } catch (e) {
        console.error(`[SubtitleMatcher] Error in ${archiveType} text extraction:`, e);
        return null;
    }
}

// Helper for OpenSubtitles API with hash-matching support and enhanced Turkish detection
async function fetchOpenSubtitlesSubtitle(videoId, infoHash) {
    try {
        const opensubtitlesApiKey = process.env.OPENSUBTITLES_API_KEY;
        console.log('[subtitleMatcher] fetchOpenSubtitlesSubtitle called with videoId:', videoId, 'infoHash:', infoHash);
        console.log('[subtitleMatcher] OPENSUBTITLES_API_KEY present:', !!opensubtitlesApiKey);
        // Mask API key in logs for security
        if (opensubtitlesApiKey) {
            console.log('[subtitleMatcher] OPENSUBTITLES_API_KEY masked:', opensubtitlesApiKey.substring(0, 4) + '***' + opensubtitlesApiKey.substring(opensubtitlesApiKey.length - 4));
        }
        
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
                    originalContent = await decompressSubtitleContent(subRes);
                    break;
                
                case 'srt':
                case 'ass':
                case 'vtt':
                default:
                    // Try as plain text first
                    originalContent = await subRes.text();
                    
                    // If it looks like binary data, try decompression
                    if (originalContent && originalContent.length > 0) {
                        // Check if it's actually valid subtitle content
                        if (!isValidSubtitleContent(originalContent)) {
                            console.log(`[SubtitleMatcher] Plain text doesn't look like subtitle content, trying decompression...`);
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

// Enhanced decompression function for unknown formats with memory limits
async function decompressUnknownFormat(response, originalUrl) {
    const MAX_BUFFER_SIZE = 50 * 1024 * 1024; // 50MB limit
    
    try {
        const buffer = await response.buffer();
        
        // Check buffer size to prevent memory exhaustion
        if (buffer.length > MAX_BUFFER_SIZE) {
            console.log(`[SubtitleMatcher] Buffer too large: ${buffer.length} bytes, skipping`);
            return null;
        }
        
        console.log(`[SubtitleMatcher] Trying to decompress unknown format, buffer size: ${buffer.length}`);
        console.log(`[SubtitleMatcher] Original URL: ${originalUrl}`);
        console.log(`[SubtitleMatcher] Buffer first 20 bytes: ${buffer.slice(0, 20).toString('hex')}`);
        
        // Check if it's actually plain text first
        try {
            const plainText = buffer.toString('utf-8');
            if (isValidSubtitleContent(plainText)) {
                console.log(`[SubtitleMatcher] Content is valid plain text`);
                return plainText;
            }
        } catch (e) {
            console.log(`[SubtitleMatcher] Content is not plain text, trying decompression...`);
        }
        
        // Try different decompression methods in order of likelihood
        const decompressionMethods = [
            {
                name: 'ZIP',
                method: () => decompressZipSubtitle({ buffer: () => Promise.resolve(buffer) }, originalUrl)
            },
            {
                name: 'GZIP',
                method: () => decompressGzipSubtitle({ buffer: () => Promise.resolve(buffer) })
            },
            {
                name: 'Generic',
                method: () => decompressSubtitleContent(buffer)
            },
            {
                name: 'UTF-8',
                method: () => buffer.toString('utf-8')
            },
            {
                name: 'Latin1',
                method: () => buffer.toString('latin1')
            },
            {
                name: 'ASCII',
                method: () => buffer.toString('ascii')
            }
        ];
        
        for (const { name, method } of decompressionMethods) {
            try {
                console.log(`[SubtitleMatcher] Trying ${name} decompression...`);
                const result = await method();
                
                if (result && isValidSubtitleContent(result)) {
                    console.log(`[SubtitleMatcher] ${name} decompression successful`);
                    return result;
                }
            } catch (methodError) {
                console.log(`[SubtitleMatcher] ${name} decompression failed:`, methodError.message);
            }
        }
        
        console.log(`[SubtitleMatcher] All decompression methods failed`);
        return null;
        
    } catch (e) {
        console.error(`[SubtitleMatcher] Error in decompressUnknownFormat:`, e);
        return null;
    }
}

// Enhanced RAR decompression function with comprehensive support
async function decompressRarSubtitle(response, originalUrl) {
    try {
        const buffer = await response.buffer();
        console.log(`[SubtitleMatcher] Processing RAR file, size: ${buffer.length}`);
        console.log(`[SubtitleMatcher] RAR URL: ${originalUrl}`);
        
        // Check RAR signature patterns
        const rarSignatures = [
            // RAR 5.0 signature
            { bytes: [0x52, 0x61, 0x72, 0x21, 0x1A, 0x07, 0x01, 0x00], name: 'RAR 5.0' },
            // RAR 4.x signature
            { bytes: [0x52, 0x61, 0x72, 0x21, 0x1A, 0x07, 0x00], name: 'RAR 4.x' },
            // Generic RAR signature
            { bytes: [0x52, 0x61, 0x72, 0x21], name: 'RAR Generic' }
        ];
        
        let isValidRar = false;
        let rarVersion = 'Unknown';
        
        for (const signature of rarSignatures) {
            const match = signature.bytes.every((byte, index) => buffer[index] === byte);
            if (match) {
                isValidRar = true;
                rarVersion = signature.name;
                console.log(`[SubtitleMatcher] Detected ${rarVersion} file`);
                break;
            }
        }
        
        if (isValidRar) {
            console.log(`[SubtitleMatcher] Valid RAR file detected: ${rarVersion}`);
            
            // Try multiple RAR extraction methods
            const extractionMethods = [
                () => extractRarWithJavaScriptLibs(buffer),
                () => extractRarWithUnrar(buffer),
                () => extractRarWithNodeRar(buffer),
                () => extractRarAsZip(buffer, originalUrl),
                () => extractRarWithCustomParser(buffer),
                () => extractRarAsPlainText(buffer)
            ];
            
            for (const method of extractionMethods) {
                try {
                    const result = await method();
                    if (result && isValidSubtitleContent(result)) {
                        console.log(`[SubtitleMatcher] RAR extraction successful`);
                        return result;
                    }
                } catch (methodError) {
                    console.log(`[SubtitleMatcher] RAR extraction method failed:`, methodError.message);
                    continue;
                }
            }
        }
        
        // Fallback: try as ZIP (some RAR files are actually ZIP with .rar extension)
        try {
            const zipResult = await decompressZipSubtitle({ buffer: () => Promise.resolve(buffer) }, originalUrl);
            if (zipResult) {
                console.log(`[SubtitleMatcher] RAR file successfully processed as ZIP`);
                return zipResult;
            }
        } catch (zipError) {
            console.log(`[SubtitleMatcher] RAR file is not a ZIP file`);
        }
        
        // Last resort: brute force text extraction
        const textExtractionResult = await bruteForceTextExtraction(buffer);
        if (textExtractionResult) {
            console.log(`[SubtitleMatcher] RAR content extracted via brute force`);
            return textExtractionResult;
        }
        
        console.log(`[SubtitleMatcher] Failed to process RAR file`);
        return null;
        
    } catch (e) {
        console.error(`[SubtitleMatcher] Error processing RAR subtitle:`, e);
        return null;
    }
}

// Extract RAR using rar-stream and unrar-js libraries
async function extractRarWithNodeRar(buffer) {
    try {
        // Try unrar-js first (Web Assembly based)
        console.log(`[SubtitleMatcher] Attempting extraction with unrar-js`);
        
        try {
            const { createExtractorFromData } = require('unrar-js');
            
            // Convert buffer to Uint8Array
            const uint8Array = new Uint8Array(buffer);
            
            // Create extractor
            const extractor = await createExtractorFromData({ data: uint8Array });
            
            // Get list of files
            const list = extractor.getFileList();
            
            if (list && list.fileHeaders && list.fileHeaders.length > 0) {
                console.log(`[SubtitleMatcher] unrar-js found ${list.fileHeaders.length} files`);
                
                // Priority order: SRT > ASS > VTT > SUB
                const subtitlePriority = ['.srt', '.ass', '.ssa', '.vtt', '.sub', '.idx'];
                
                for (const extension of subtitlePriority) {
                    const targetFile = list.fileHeaders.find(file => 
                        file.name.toLowerCase().endsWith(extension)
                    );
                    
                    if (targetFile) {
                        console.log(`[SubtitleMatcher] unrar-js extracting: ${targetFile.name}`);
                        
                        try {
                            // Extract the file
                            const extracted = extractor.extract({ files: [targetFile.name] });
                            
                            if (extracted && extracted.files && extracted.files.length > 0) {
                                const file = extracted.files[0];
                                
                                // Try multiple encodings
                                const encodings = ['utf-8', 'latin1', 'ascii', 'utf-16le'];
                                
                                for (const encoding of encodings) {
                                    try {
                                        const content = new TextDecoder(encoding).decode(file.extraction);
                                        
                                        if (isValidSubtitleContent(content)) {
                                            console.log(`[SubtitleMatcher] unrar-js success with ${encoding} encoding`);
                                            return content;
                                        }
                                    } catch (decodingError) {
                                        continue;
                                    }
                                }
                            }
                        } catch (extractError) {
                            console.log(`[SubtitleMatcher] unrar-js extraction error:`, extractError.message);
                            continue;
                        }
                    }
                }
            }
            
            console.log(`[SubtitleMatcher] unrar-js found no valid subtitle files`);
            
        } catch (unrarJsError) {
            console.log(`[SubtitleMatcher] unrar-js failed:`, unrarJsError.message);
        }
        
        // Try rar-stream as fallback
        console.log(`[SubtitleMatcher] Attempting extraction with rar-stream`);
        
        try {
            const RarStream = require('rar-stream');
            
            return new Promise((resolve) => {
                const fs = require('fs');
                const path = require('path');
                const os = require('os');
                
                // Create temporary RAR file
                const tempRarPath = path.join(os.tmpdir(), `temp_${Date.now()}.rar`);
                let tempFileCreated = false;
                
                try {
                    fs.writeFileSync(tempRarPath, buffer);
                    tempFileCreated = true;
                    
                    const rarStream = new RarStream(tempRarPath);
                    const extractedFiles = [];
                    let processingComplete = false;
                    
                    // Set timeout for stream processing
                    const timeout = setTimeout(() => {
                        if (!processingComplete) {
                            console.log(`[SubtitleMatcher] rar-stream timeout`);
                            cleanup();
                            resolve(null);
                        }
                    }, 30000); // 30 second timeout
                    
                    const cleanup = () => {
                        clearTimeout(timeout);
                        try {
                            if (tempFileCreated && fs.existsSync(tempRarPath)) {
                                fs.unlinkSync(tempRarPath);
                            }
                        } catch (cleanupError) {
                            console.log(`[SubtitleMatcher] rar-stream cleanup error:`, cleanupError.message);
                        }
                    };
                    
                    rarStream.on('entry', (entry) => {
                        const fileName = entry.name || '';
                        
                        if (fileName.endsWith('.srt') || fileName.endsWith('.ass') || fileName.endsWith('.vtt') || fileName.endsWith('.sub')) {
                            console.log(`[SubtitleMatcher] rar-stream found subtitle: ${fileName}`);
                            
                            let content = '';
                            
                            entry.on('data', (chunk) => {
                                content += chunk.toString('utf8');
                            });
                            
                            entry.on('end', () => {
                                if (isValidSubtitleContent(content)) {
                                    extractedFiles.push({
                                        name: fileName,
                                        content: content
                                    });
                                }
                            });
                        }
                    });
                    
                    rarStream.on('end', () => {
                        processingComplete = true;
                        cleanup();
                        
                        if (extractedFiles.length > 0) {
                            // Prioritize SRT files
                            const srtFile = extractedFiles.find(f => f.name.endsWith('.srt'));
                            const targetFile = srtFile || extractedFiles[0];
                            
                            console.log(`[SubtitleMatcher] rar-stream extracted: ${targetFile.name}`);
                            resolve(targetFile.content);
                        } else {
                            resolve(null);
                        }
                    });
                    
                    rarStream.on('error', (error) => {
                        processingComplete = true;
                        console.log(`[SubtitleMatcher] rar-stream error:`, error.message);
                        cleanup();
                        resolve(null);
                    });
                    
                } catch (tempFileError) {
                    console.log(`[SubtitleMatcher] rar-stream temp file error:`, tempFileError.message);
                    resolve(null);
                }
            });
            
        } catch (rarStreamError) {
            console.log(`[SubtitleMatcher] rar-stream failed:`, rarStreamError.message);
        }
        
        console.log(`[SubtitleMatcher] All JavaScript RAR libraries failed`);
        return null;
        
    } catch (e) {
        console.error(`[SubtitleMatcher] Error in JavaScript RAR extraction:`, e);
        return null;
    }
}

// Helper function to validate Gemini model
async function validateGeminiModel(model) {
    try {
        const validModels = [
            'gemini-2.5-flash-lite-preview-06-17',
            'gemini-1.5-flash',
            'gemini-1.5-pro',
            'gemini-pro',
            'gemini-pro-vision'
        ];
        
        if (!validModels.includes(model)) {
            console.warn(`[SubtitleMatcher] Unknown Gemini model: ${model}, using default`);
            return 'gemini-2.5-flash-lite-preview-06-17';
        }
        
        return model;
    } catch (e) {
        console.error('[subtitleMatcher] Error validating Gemini model:', e);
        return 'gemini-2.5-flash-lite-preview-06-17';
    }
}

// Helper function to validate subtitle content
function isValidSubtitleContent(content) {
    try {
        if (!content || typeof content !== 'string') {
            return false;
        }
        
        const cleanContent = content.trim();
        if (cleanContent.length < 10) {
            return false;
        }
        
        // Check for SRT format indicators
        const srtPattern = /^\d+\s*\n\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}/m;
        const hasSrtFormat = srtPattern.test(cleanContent);
        
        // Check for VTT format indicators
        const vttPattern = /WEBVTT|^\d{2}:\d{2}:\d{2}\.\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}\.\d{3}/m;
        const hasVttFormat = vttPattern.test(cleanContent);
        
        // Check for ASS format indicators
        const assPattern = /\[Script Info\]|\[V4\+ Styles\]|Dialogue:/i;
        const hasAssFormat = assPattern.test(cleanContent);
        
        // Check for minimum content requirements
        const contentLines = cleanContent.split('\n').filter(line => line.trim().length > 0);
        const hasMinimumLines = contentLines.length >= 3;
        
        // Check for actual subtitle text (not just metadata)
        const hasSubtitleText = contentLines.some(line => 
            line.length > 5 && 
            !line.match(/^\d+$/) && 
            !line.includes('-->') && 
            !line.match(/^\d{2}:\d{2}:\d{2}/) &&
            !line.startsWith('[') &&
            !line.startsWith('Dialogue:')
        );
        
        const isValid = (hasSrtFormat || hasVttFormat || hasAssFormat) && hasMinimumLines && hasSubtitleText;
        
        if (!isValid) {
            console.log(`[SubtitleMatcher] Content validation failed: srt=${hasSrtFormat}, vtt=${hasVttFormat}, ass=${hasAssFormat}, lines=${hasMinimumLines}, text=${hasSubtitleText}`);
        }
        
        return isValid;
        
    } catch (e) {
        console.error(`[SubtitleMatcher] Error validating subtitle content:`, e);
        return false;
    }
}