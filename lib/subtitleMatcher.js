// lib/subtitleMatcher.js
// --- OVERHAULED & ROBUST VERSION v2.0.0 ---

const fetch = require('node-fetch');
const zlib = require('zlib');
const AdmZip = require('adm-zip');

// AI Processing Cache and Background Processing System
const aiProcessingStatus = new Map(); // Stores: 'pending', 'completed', 'failed'
const enhancedSubtitleCache = new Map();
const originalSubtitleCache = new Map(); // Cache original subtitles to avoid re-downloading
const subtitleMetadataCache = new Map(); // Cache subtitle metadata for faster lookup

// Enhanced TMDb to IMDb conversion with caching and error handling
async function tmdbToImdb(tmdbId) {
    try {
        const tmdbApiKey = process.env.TMDB_API_KEY;
        if (!tmdbApiKey) {
            console.log('[subtitleMatcher] TMDB_API_KEY not configured, skipping TMDb to IMDb conversion');
            return null;
        }
        
        // Check cache first
        const cacheKey = `tmdb-to-imdb-${tmdbId}`;
        const cached = await getCache(cacheKey);
        if (cached) {
            console.log(`[subtitleMatcher] Using cached TMDb to IMDb conversion: ${tmdbId} -> ${cached}`);
            return cached;
        }
        
        console.log(`[subtitleMatcher] Converting TMDb ID ${tmdbId} to IMDb ID`);
        
        // Try movie first
        let url = `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${tmdbApiKey}`;
        let res = await robustFetch(url);
        
        if (res && res.ok) {
            const data = await res.json();
            if (data.imdb_id) {
                console.log(`[subtitleMatcher] Found IMDb ID for movie: ${data.imdb_id}`);
                await setCache(cacheKey, data.imdb_id, 24 * 60 * 60); // Cache for 24 hours
                return data.imdb_id;
            }
        }
        
        // Try TV show if movie failed
        url = `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${tmdbApiKey}`;
        res = await robustFetch(url);
        
        if (res && res.ok) {
            const data = await res.json();
            if (data.imdb_id) {
                console.log(`[subtitleMatcher] Found IMDb ID for TV show: ${data.imdb_id}`);
                await setCache(cacheKey, data.imdb_id, 24 * 60 * 60); // Cache for 24 hours
                return data.imdb_id;
            }
        }
        
        // Try external IDs endpoint as fallback
        url = `https://api.themoviedb.org/3/movie/${tmdbId}/external_ids?api_key=${tmdbApiKey}`;
        res = await robustFetch(url);
        
        if (res && res.ok) {
            const data = await res.json();
            if (data.imdb_id) {
                console.log(`[subtitleMatcher] Found IMDb ID from external IDs: ${data.imdb_id}`);
                await setCache(cacheKey, data.imdb_id, 24 * 60 * 60); // Cache for 24 hours
                return data.imdb_id;
            }
        }
        
        console.log(`[subtitleMatcher] No IMDb ID found for TMDb ID: ${tmdbId}`);
        return null;
        
    } catch (e) {
        console.error('[subtitleMatcher] tmdbToImdb error:', e);
        return null;
    }
}

// Enhanced robust fetch with retry logic and better error handling
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
            
            // Execute fetch with timeout
            const response = await Promise.race([
                fetch(url, fetchOptions),
                timeoutPromise
            ]);
            
            // Clear timeout on success
            clearTimeout(timeoutId);
            
            if (response.ok) {
                console.log(`[subtitleMatcher] Fetch successful on attempt ${attempt}`);
                return response;
            } else {
                lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
                console.warn(`[subtitleMatcher] Fetch attempt ${attempt} failed: ${lastError.message}`);
            }
            
        } catch (error) {
            lastError = error;
            console.warn(`[subtitleMatcher] Fetch attempt ${attempt} failed: ${error.message}`);
            
            // Clear timeout on error
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            
            // Don't retry on abort errors caused by timeout
            if (error.name === 'AbortError' && error.message.includes('timeout')) {
                console.error(`[subtitleMatcher] Request timed out after ${timeout}ms`);
                break;
            }
        }
        
        // Wait before retry with exponential backoff
        if (attempt < maxRetries) {
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
            console.log(`[subtitleMatcher] Waiting ${delay}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    
    console.error(`[subtitleMatcher] All fetch attempts failed for ${url}: ${lastError?.message}`);
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
    }
    // Bonus for uncompressed SRT (reliability)
    if (subtitle.format === 'srt' && !subtitle.compressed) {
        score += 5; // Bonus for uncompressed SRT
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

// OpenSubtitles API search function
async function searchOpenSubtitles(imdbId, type, season, episode, language = 'tr') {
    try {
        console.log(`[subtitleMatcher] Searching OpenSubtitles for ${imdbId}`);
        
        const apiKey = process.env.OPENSUBTITLES_API_KEY;
        if (!apiKey) {
            console.warn('[subtitleMatcher] OpenSubtitles API key not configured');
            return [];
        }
        
        // Build query parameters
        const params = new URLSearchParams({
            languages: language,
            type: type === 'movie' ? 'movie' : 'episode'
        });

        if (type === 'series' && season) {
            params.append('season_number', season);
        }
        
        if (type === 'series' && episode) {
            params.append('episode_number', episode);
        }

        // The imdb_id parameter should be the ID of the movie or the parent series.
        // The previous logic had a reference error. For now, we use the provided imdbId.
        params.append('imdb_id', imdbId.replace('tt', ''));
        
        const response = await robustFetch(`https://api.opensubtitles.com/api/v1/subtitles?${params.toString()}`, {
            headers: {
                'Api-Key': apiKey,
                'Content-Type': 'application/json',
                'User-Agent': 'vlsub-opensubtitles-com v1.0'
            }
        });
        
        if (!response || !response.ok) {
            console.warn(`[subtitleMatcher] OpenSubtitles API error: ${response?.status}`);
            return [];
        }
        
        const data = await response.json();
        const subtitles = [];
        
        if (data.data && Array.isArray(data.data)) {
            const promises = data.data.map(async (sub) => {
                if (sub.attributes && sub.attributes.files && sub.attributes.files.length > 0) {
                    const file = sub.attributes.files[0];
                    const fileId = file.file_id;

                    if (!fileId) return null;

                    try {
                        const downloadRes = await robustFetch('https://api.opensubtitles.com/api/v1/download', {
                            method: 'POST',
                            headers: {
                                'Api-Key': apiKey,
                                'Content-Type': 'application/json',
                                'User-Agent': 'vlsub-opensubtitles-com v1.0'
                            },
                            body: JSON.stringify({ file_id: fileId })
                        });

                        if (downloadRes && downloadRes.ok) {
                            const downloadData = await downloadRes.json();
                            if (downloadData.link) {
                                return {
                                    id: sub.id,
                                    url: downloadData.link,
                                    name: `${sub.attributes.release || 'OpenSubtitles'} (${sub.attributes.language})`,
                                    lang: sub.attributes.language,
                                    quality: calculateQuality(sub.attributes),
                                    provider: 'opensubtitles'
                                };
                            }
                        }
                    } catch (e) {
                        console.error(`[subtitleMatcher] Failed to get download link for file_id ${fileId}`, e);
                    }
                }
                return null;
            });

            const resolvedSubtitles = await Promise.all(promises);
            subtitles.push(...resolvedSubtitles.filter(s => s !== null));
        }
        
        console.log(`[subtitleMatcher] Found ${subtitles.length} subtitles from OpenSubtitles`);
        return subtitles;
        
    } catch (e) {
        console.error(`[subtitleMatcher] OpenSubtitles search error:`, e);
        return [];
    }
}

// SubDL API search function
async function searchSubDL(imdbId, type, season, episode, language = 'tr') {
    try {
        console.log(`[subtitleMatcher] Searching SubDL for ${imdbId}`);
        
        // Build SubDL search URL
        let searchUrl = `https://subdl.com/subtitle/sd${imdbId}`;
        
        if (type === 'series' && season && episode) {
            searchUrl += `/turkish/${season}/${episode}`;
        } else if (language === 'tr') {
            searchUrl += '/turkish';
        }
        
        const response = await robustFetch(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        if (!response || !response.ok) {
            console.warn(`[subtitleMatcher] SubDL request failed: ${response?.status}`);
            return [];
        }
        
        const html = await response.text();
        const subtitles = [];
        
        // Parse HTML to extract subtitle links
        const linkRegex = /href="([^"]*download[^"]*)"/g;
        let match;
        
        while ((match = linkRegex.exec(html)) !== null) {
            const downloadUrl = match[1];
            if (downloadUrl.includes('download')) {
                subtitles.push({
                    id: `subdl_${Date.now()}_${Math.random()}`,
                    url: downloadUrl.startsWith('http') ? downloadUrl : `https://subdl.com${downloadUrl}`,
                    name: `SubDL (${language})`,
                    lang: language,
                    quality: 80,
                    provider: 'subdl'
                });
            }
        }
        
        console.log(`[subtitleMatcher] Found ${subtitles.length} subtitles from SubDL`);
        return subtitles;
        
    } catch (e) {
        console.error(`[subtitleMatcher] SubDL search error:`, e);
        return [];
    }
}

// Podnapisi search function
async function searchPodnapisi(imdbId, type, season, episode, language = 'tr') {
    try {
        console.log(`[subtitleMatcher] Searching Podnapisi for ${imdbId}`);
        
        // Build Podnapisi search URL
        const searchUrl = `https://www.podnapisi.net/subtitles/search/advanced?keywords=${imdbId}&language=tr`;
        
        const response = await robustFetch(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        if (!response || !response.ok) {
            console.warn(`[subtitleMatcher] Podnapisi request failed: ${response?.status}`);
            return [];
        }
        
        const html = await response.text();
        const subtitles = [];
        
        // Parse HTML to extract subtitle links
        const linkRegex = /href="([^"]*download[^"]*)"/g;
        let match;
        
        while ((match = linkRegex.exec(html)) !== null) {
            const downloadUrl = match[1];
            if (downloadUrl.includes('download')) {
                subtitles.push({
                    id: `podnapisi_${Date.now()}_${Math.random()}`,
                    url: downloadUrl.startsWith('http') ? downloadUrl : `https://www.podnapisi.net${downloadUrl}`,
                    name: `Podnapisi (${language})`,
                    lang: language,
                    quality: 70,
                    provider: 'podnapisi'
                });
            }
        }
        
        console.log(`[subtitleMatcher] Found ${subtitles.length} subtitles from Podnapisi`);
        return subtitles;
        
    } catch (e) {
        console.error(`[subtitleMatcher] Podnapisi search error:`, e);
        return [];
    }
}

// Quality calculation helper
function calculateQuality(attributes) {
    let quality = 50; // Base quality
    
    if (attributes.download_count > 1000) quality += 20;
    if (attributes.download_count > 5000) quality += 10;
    if (attributes.ratings && attributes.ratings > 4) quality += 15;
    if (attributes.hearing_impaired === false) quality += 5;
    
    return Math.min(quality, 100);
}

// Helper for OpenSubtitles API - Enhanced with a4kSubtitles JSON API approach
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
        setCachedSubtitleContent(videoId, source, processedContent);
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
                for (const ext of subtitlePriority) {
                    const file = list.fileHeaders.find(f => f.name.toLowerCase().endsWith(ext));
                    if (file) {
                        console.log(`[SubtitleMatcher] Extracting ${ext.toUpperCase()} file: ${file.name}`);
                        
                        // Extract file data
                        const fileData = extractor.extractFile(file);
                        if (fileData && fileData.length > 0) {
                            const content = new TextDecoder('utf-8').decode(fileData);
                            if (isValidSubtitleContent(content)) {
                                console.log(`[SubtitleMatcher] Successfully extracted ${ext.toUpperCase()} content`);
                                return content;
                            }
                        }
                    }
                }
            }
        } catch (unrarJsError) {
            console.error(`[SubtitleMatcher] unrar-js extraction error:`, unrarJsError);
        }
        
        // If unrar-js fails, try rar-stream as fallback
        console.log(`[SubtitleMatcher] Attempting extraction with rar-stream`);
        try {
            const { Extract } = require('unrar');
            
            // Create extractor
            const extractor = new Extract(buffer);
            
            // Get list of files
            const list = extractor.getFileList();
            
            if (list && list.length > 0) {
                console.log(`[SubtitleMatcher] rar-stream found ${list.length} files`);
                
                // Priority order: SRT > ASS > VTT > SUB
                const subtitlePriority = ['.srt', '.ass', '.ssa', '.vtt', '.sub', '.idx'];
                for (const ext of subtitlePriority) {
                    const file = list.find(f => f.fileName.toLowerCase().endsWith(ext));
                    if (file) {
                        console.log(`[SubtitleMatcher] Extracting ${ext.toUpperCase()} file: ${file.fileName}`);
                        
                        // Extract file data
                        const fileData = await extractor.extractFile(file);
                        if (fileData && fileData.length > 0) {
                            const content = new TextDecoder('utf-8').decode(fileData);
                            if (isValidSubtitleContent(content)) {
                                console.log(`[SubtitleMatcher] Successfully extracted ${ext.toUpperCase()} content`);
                                return content;
                            }
                        }
                    }
                }
            }
        } catch (rarStreamError) {
            console.error(`[SubtitleMatcher] rar-stream extraction error:`, rarStreamError);
        }
        
        console.log(`[SubtitleMatcher] Failed to extract RAR content with node-rar`);
        return null;
        
    } catch (e) {
        console.error(`[SubtitleMatcher] Error in extractRarWithNodeRar:`, e);
        return null;
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
        
        console.log(`[subtitleMatcher] Subtitle validation: isValid=${isValid}`);
        
        return isValid;
        
    } catch (e) {
        console.error('[subtitleMatcher] Error validating subtitle content:', e);
        return false;
    }
}

// Enhanced subtitle format validation and conversion
async function processSubtitleContent(content, format, source) {
    try {
        if (!content || content.length === 0) {
            return null;
        }
        
        console.log(`[subtitleMatcher] Processing ${format} subtitle content from ${source}`);
        
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
            console.log(`[subtitleMatcher] Final validation failed for ${source} subtitle`);
            return null;
        }
        
        console.log(`[subtitleMatcher] Successfully processed ${source} subtitle content`);
        return processedContent;
        
    } catch (e) {
        console.error(`[subtitleMatcher] Error processing subtitle content:`, e);
        return null;
    }
}

// Helper function to convert ASS/SSA to SRT
async function convertAssToSrt(assContent) {
    try {
        console.log(`[subtitleMatcher] Converting ASS/SSA to SRT`);
        
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
        console.log(`[subtitleMatcher] Converted ASS to SRT, ${subtitleIndex - 1} subtitles`);
        return srtContent;
        
    } catch (e) {
        console.error(`[subtitleMatcher] Error converting ASS to SRT:`, e);
        return assContent; // Return original if conversion fails
    }
}

// Helper function to convert VTT to SRT
async function convertVttToSrt(vttContent) {
    try {
        console.log(`[subtitleMatcher] Converting VTT to SRT`);
        
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
        console.log(`[subtitleMatcher] Converted VTT to SRT, ${subtitleIndex - 1} subtitles`);
        return srtContent;
        
    } catch (e) {
        console.error(`[subtitleMatcher] Error converting VTT to SRT:`, e);
        return vttContent; // Return original if conversion fails
    }
}

// Helper function to convert ASS time format to SRT time format
function convertAssTimeToSrt(assTime) {
    try {
        // ASS format: H:MM:SS.CC (centiseconds)
        // SRT format: HH:MM:SS,mmm (milliseconds)
        
        const parts = assTime.split(':');
        if (parts.length !== 3) return null; return null;
        
        const hours = parts[0].padStart(2, '0');
        const minutes = parts[1];
        const secondsParts = parts[2].split('.');
        const seconds = secondsParts[0];
        const centiseconds = secondsParts[1] || '00';
        
        const milliseconds = (parseInt(centiseconds) * 10).toString().padStart(3, '0');
        
        return `${hours}:${minutes}:${seconds},${milliseconds}`;
        
    } catch (e) {
        console.error(`[subtitleMatcher] Error converting ASS time:`, e);
        return null;
    }
}

// Helper function to validate and fix SRT format
async function validateAndFixSrtFormat(srtContent) {
    try {
        console.log(`[subtitleMatcher] Validating and fixing SRT format`);
        
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
        console.log(`[subtitleMatcher] SRT format validation complete`);
        return fixedContent;
        
    } catch (e) {
        console.error(`[subtitleMatcher] Error validating SRT format:`, e);
        return srtContent; // Return original if validation fails
    }
}

// --- Advanced AI Enhancement Logic (from subtitleMatcher_new.js) ---
async function getAICorrectedSubtitleDirect(originalContent, options = {}) {
    const startTime = Date.now();
    console.log('[subtitleMatcher] Starting AI enhancement with 12-step analysis...');
    
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
    
    // Build the comprehensive 12-step prompt
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
// --- End Advanced AI Enhancement Logic ---

// Main function to get subtitle URLs for Stremio with proper priority system
async function getSubtitleUrlsForStremio(imdbId, type, season, episode, language = 'tr', infoHash = null) {
    const requestId = Math.random().toString(36).substring(2, 15);
    const startTime = Date.now();
    
    try {
        console.log(`[${requestId}] Starting subtitle search for ${imdbId} (${type}) with hash: ${infoHash ? 'YES' : 'NO'}`);
        
        // Input validation
        if (!imdbId || typeof imdbId !== 'string') {
            throw new Error('Invalid IMDb ID provided');
        }
        
        if (!['movie', 'series'].includes(type)) {
            throw new Error('Invalid type provided. Must be "movie" or "series"');
        }
        
        if (type === 'series' && (!season || !episode)) {
            throw new Error('Season and episode are required for series type');
        }
        
        const subtitles = [];
        
        // ========================================
        // PHASE 1: HASH-MATCHED SUBTITLES (PRIORITY 1)
        // ========================================
        if (infoHash) {
            console.log(`[${requestId}] PHASE 1: Searching for hash-matched subtitles with infoHash: ${infoHash}`);
            
            // Try hash-based search on all providers with Promise.allSettled for better error handling
            const hashProviders = [
                { name: 'SubDL', fn: () => fetchSubdlSubtitle(imdbId, infoHash) },
                { name: 'Podnapisi', fn: () => fetchPodnapisiSubtitle(imdbId, infoHash) },
                { name: 'OpenSubtitles', fn: () => fetchOpenSubtitlesSubtitle(imdbId, infoHash) }
            ];
            
            const hashMatchedResults = await Promise.allSettled(
                hashProviders.map(provider => provider.fn())
            );
            
            // Process hash-matched results with detailed logging and error isolation
            for (let i = 0; i < hashMatchedResults.length; i++) {
                const result = hashMatchedResults[i];
                const provider = hashProviders[i];
                
                try {
                    if (result.status === 'fulfilled' && result.value) {
                        try {
                            console.log(`[${requestId}] Processing hash-matched result from ${provider.name}`);
                            const content = await downloadAndProcessSubtitle(result.value, imdbId, provider.name.toLowerCase());
                            
                            if (content && isValidSubtitleContent(content)) {
                                console.log(`[${requestId}] ✅ HASH-MATCHED subtitle found from ${provider.name}`);
                                subtitles.push({
                                    id: `hash-${provider.name.toLowerCase()}-${imdbId}`,
                                    url: `data:text/plain;charset=utf-8,${encodeURIComponent(content)}`,
                                    name: `🎯 ${provider.name} (Hash-Matched)`,
                                    lang: language,
                                    quality: 1000, // Highest priority
                                    behaviorHints: {
                                        notWebReady: true,
                                        hashMatched: true,
                                        priority: 1
                                    }
                                });
                            } else {
                                console.warn(`[${requestId}] Invalid subtitle content from ${provider.name} hash match`);
                            }
                        } catch (processingError) {
                            console.error(`[${requestId}] Hash-matched processing failed for ${provider.name}:`, processingError.message);
                            // Continue with other providers even if one fails
                        }
                    } else if (result.status === 'rejected') {
                        console.warn(`[${requestId}] Hash-matched search failed for ${provider.name}:`, result.reason?.message || 'Unknown error');
                    }
                } catch (outerError) {
                    console.error(`[${requestId}] Critical error processing hash-matched result for ${provider.name}:`, outerError.message);
                    // Continue with other providers even if there's a critical error
                }
            }
            
            // If we found hash-matched subtitles, return them immediately
            if (subtitles.length > 0) {
                const processingTime = Date.now() - startTime;
                console.log(`[${requestId}] ✅ Found ${subtitles.length} hash-matched subtitles in ${processingTime}ms, returning immediately`);
                return subtitles;
            }
        }
        
        // ========================================
        // PHASE 2: AI-ENHANCED SUBTITLES (PRIORITY 2)
        // ========================================
        console.log(`[${requestId}] PHASE 2: Searching for AI-enhanced subtitles`);
        
        // Search all providers for regular subtitles with Promise.allSettled
        const regularProviders = [
            { name: 'SubDL', fn: () => searchSubDL(imdbId, type, season, episode, language) },
            { name: 'Podnapisi', fn: () => searchPodnapisi(imdbId, type, season, episode, language) },
            { name: 'OpenSubtitles', fn: () => searchOpenSubtitles(imdbId, type, season, episode, language) }
        ];
        
        const regularResults = await Promise.allSettled(
            regularProviders.map(provider => provider.fn())
        );
        
        // Process regular subtitle results with error isolation
        const allSubtitleUrls = [];
        for (let i = 0; i < regularResults.length; i++) {
            const result = regularResults[i];
            const provider = regularProviders[i];
            
            try {
                if (result.status === 'fulfilled' && result.value && Array.isArray(result.value)) {
                    console.log(`[${requestId}] Found ${result.value.length} subtitles from ${provider.name}`);
                    // Validate and sanitize subtitle URLs
                    const validUrls = result.value.filter(url => {
                        try {
                            return url && typeof url === 'string' && url.trim().length > 0;
                        } catch (filterError) {
                            console.warn(`[${requestId}] Invalid subtitle URL from ${provider.name}:`, filterError.message);
                            return false;
                        }
                    });
                    
                    allSubtitleUrls.push(...validUrls.map(url => ({ url, provider: provider.name })));
                } else if (result.status === 'rejected') {
                    console.warn(`[${requestId}] Regular search failed for ${provider.name}:`, result.reason?.message || 'Unknown error');
                }
            } catch (processingError) {
                console.error(`[${requestId}] Critical error processing regular search result for ${provider.name}:`, processingError.message);
                // Continue with other providers even if there's a critical error
            }
        }
        
        if (allSubtitleUrls.length === 0) {
            console.log(`[${requestId}] No subtitles found from any provider`);
            return [];
        }
        
        console.log(`[${requestId}] Found ${allSubtitleUrls.length} total subtitle URLs across all providers`);
        
        // ========================================
        // PHASE 3: PARALLEL PROCESSING WITH RACE CONDITION PREVENTION
        // ========================================
        console.log(`[${requestId}] PHASE 3: Processing subtitles with AI enhancement`);
        
        // Limit concurrent processing to prevent overwhelming the system
        const maxConcurrent = 5;
        const processingBatches = [];
        
        for (let i = 0; i < allSubtitleUrls.length; i += maxConcurrent) {
            const batch = allSubtitleUrls.slice(i, i + maxConcurrent);
            processingBatches.push(batch);
        }
        
        // Process batches sequentially to prevent race conditions
        const processedSubtitles = [];
        let batchIndex = 0;
        
        for (const batch of processingBatches) {
            batchIndex++;
            console.log(`[${requestId}] Processing batch ${batchIndex}/${processingBatches.length} (${batch.length} subtitles)`);
            
            const batchPromises = batch.map(async (subtitleInfo, index) => {
                const subtitleId = `${requestId}-${batchIndex}-${index}`;
                
                try {
                    // Validate subtitle info before processing
                    if (!subtitleInfo || !subtitleInfo.url || !subtitleInfo.provider) {
                        console.warn(`[${subtitleId}] Invalid subtitle info provided`);
                        return null;
                    }
                    
                    console.log(`[${subtitleId}] Processing subtitle from ${subtitleInfo.provider}`);
                    const content = await downloadAndProcessSubtitle(subtitleInfo.url, imdbId, subtitleInfo.provider.toLowerCase());
                    
                    if (content && isValidSubtitleContent(content)) {
                        // Check if AI enhancement is available and enabled
                        const aiEnhancementEnabled = process.env.AI_ENHANCEMENT_ENABLED !== 'false';
                        
                        if (aiEnhancementEnabled) {
                            try {
                                // Try AI enhancement with fallback to original
                                const aiProcessingPromise = processSubtitleWithAI(content, imdbId, subtitleInfo.provider.toLowerCase());
                                
                                // Set timeout for AI processing to prevent hanging
                                const aiTimeoutPromise = new Promise((resolve) => {
                                    setTimeout(() => resolve(null), 10000); // 10 second timeout
                                });
                                
                                const aiContent = await Promise.race([aiProcessingPromise, aiTimeoutPromise]);
                                
                                if (aiContent && isValidSubtitleContent(aiContent)) {
                                    console.log(`[${subtitleId}] ✅ AI-enhanced subtitle created`);
                                    return {
                                        id: `ai-${subtitleInfo.provider.toLowerCase()}-${subtitleId}`,
                                        url: `data:text/plain;charset=utf-8,${encodeURIComponent(aiContent)}`,
                                        name: `🤖 ${subtitleInfo.provider} (AI Enhanced)`,
                                        lang: language,
                                        quality: 800,
                                        behaviorHints: {
                                            notWebReady: true,
                                            aiEnhanced: true,
                                            priority: 2
                                        }
                                    };
                                } else {
                                    console.log(`[${subtitleId}] AI enhancement failed/timed out, using original`);
                                }
                            } catch (aiError) {
                                console.warn(`[${subtitleId}] AI enhancement error:`, aiError.message);
                                // Continue to return original subtitle
                            }
                        }
                        
                        // Return original subtitle if AI enhancement is disabled or failed
                        console.log(`[${subtitleId}] ✅ Original subtitle processed successfully`);
                        return {
                            id: `original-${subtitleInfo.provider.toLowerCase()}-${subtitleId}`,
                            url: `data:text/plain;charset=utf-8,${encodeURIComponent(content)}`,
                            name: `📄 ${subtitleInfo.provider} (Original)`,
                            lang: language,
                            quality: 600,
                            behaviorHints: {
                                notWebReady: true,
                                priority: 3
                            }
                        };
                    } else {
                        console.warn(`[${subtitleId}] Invalid subtitle content received`);
                        return null;
                    }
                    
                } catch (error) {
                    console.error(`[${subtitleId}] Critical error processing subtitle:`, error.message);
                    // Return null to indicate failure, but don't throw to prevent stopping other subtitles
                    return null;
                }
            });
            
            // Wait for batch to complete with error handling
            const batchResults = await Promise.allSettled(batchPromises);
            
            // Collect successful results
            for (const result of batchResults) {
                if (result.status === 'fulfilled' && result.value) {
                    processedSubtitles.push(result.value);
                }
            }
            
            // Add small delay between batches to prevent overwhelming the system
            if (batchIndex < processingBatches.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        
        // ========================================
        // PHASE 4: FINAL PROCESSING AND SORTING
        // ========================================
        console.log(`[${requestId}] PHASE 4: Final processing and sorting`);
        
        // Combine all subtitles
        subtitles.push(...processedSubtitles);
        
        // Sort by priority (quality desc, then priority asc)
        subtitles.sort((a, b) => {
            const priorityDiff = (a.behaviorHints?.priority || 999) - (b.behaviorHints?.priority || 999);
            if (priorityDiff !== 0) return priorityDiff;
            return (b.quality || 0) - (a.quality || 0);
        });
        
        // Limit results to prevent overwhelming Stremio
        const maxResults = 20;
        const finalSubtitles = subtitles.slice(0, maxResults);
        
        const processingTime = Date.now() - startTime;
        console.log(`[${requestId}] ✅ Subtitle search completed in ${processingTime}ms, returning ${finalSubtitles.length} subtitles`);
        
        return finalSubtitles;
        
    } catch (error) {
        const processingTime = Date.now() - startTime;
        console.error(`[${requestId}] Subtitle search failed after ${processingTime}ms:`, error);
        throw error;
    }
}

// Cache management functions
        
        // Collect results from all providers
        results.forEach((result, index) => {
            try {
                const providerName = ['SubDL', 'Podnapisi', 'OpenSubtitles'][index];
                if (result.status === 'fulfilled' && result.value) {
                    allSubtitles.push(...result.value.map(sub => ({ ...sub, provider: providerName })));
                } else {
                    console.warn(`[subtitleMatcher] Provider ${providerName} failed: ${result.reason}`);
                }
            } catch (error) {
                console.error(`[subtitleMatcher] Error processing result for provider at index ${index}:`, error);
            }
        });
        
        // Sort by quality score for AI processing
        allSubtitles.sort((a, b) => (b.quality || 0) - (a.quality || 0));
        
        // Try AI enhancement on the top subtitle only
        const aiEnabled = process.env.AI_ENABLED === 'true' && (process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY);
        
        if (aiEnabled && allSubtitles.length > 0) {
            console.log(`[subtitleMatcher] Attempting AI enhancement on the best subtitle only`);
            
            // Only process the top 1 subtitle (highest quality) to save time
            const sub = allSubtitles[0];
            try {
            try {
                console.log(`[subtitleMatcher] Downloading subtitle from ${sub.provider} for AI enhancement`);
                const originalContent = await downloadAndProcessSubtitle(sub.url, imdbId, sub.provider.toLowerCase());
                
                if (originalContent && isValidSubtitleContent(originalContent)) {
                    console.log(`[subtitleMatcher] Applying AI enhancement to ${sub.provider} subtitle`);
                    
                    // Extract movie metadata for AI context
                    const movieData = await getMovieMetadata(imdbId);
                    
                    // Apply AI enhancement with timeout
                    const enhancedContent = await Promise.race([
                        getAICorrectedSubtitleDirect(originalContent, {
                            aiProvider: process.env.AI_PROVIDER || 'gemini',
                            aiModel: process.env.AI_MODEL || 'gemini-2.5-flash-lite-preview-06-17',
                            correctionIntensity: process.env.CORRECTION_INTENSITY || '7',
                            aiTemperature: process.env.AI_TEMPERATURE || '0.3',
                            primaryLanguage: process.env.PRIMARY_LANGUAGE || 'tr'
                        }),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('AI timeout')), 30000))
                    ]);
                    
                    if (enhancedContent && isValidSubtitleContent(enhancedContent)) {
                        console.log(`[subtitleMatcher] ✅ AI-ENHANCED subtitle created from ${sub.provider}`);
                        
                        // Add both AI-enhanced and original versions
                        subtitles.push({
                            id: `ai-${sub.provider.toLowerCase()}-${imdbId}`,
                            url: `data:text/plain;charset=utf-8,${encodeURIComponent(enhancedContent)}`,
                            name: `🧠 ${sub.provider} (AI-Enhanced)`,
                            lang: language,
                            quality: 900, // Highest priority
                            behaviorHints: {
                                notWebReady: true,
                                aiEnhanced: true,
                                priority: 2
                            }
                        });
                        
                        // Add original as fallback
                        subtitles.push({
                            id: `original-${sub.provider.toLowerCase()}-${imdbId}`,
                            url: `data:text/plain;charset=utf-8,${encodeURIComponent(originalContent)}`,
                            name: `📄 ${sub.provider} (Original)`,
                            lang: language,
                            quality: 500, // Lower priority
                            behaviorHints: {
                                notWebReady: true,
                                original: true,
                                priority: 3
                            }
                        });
                    } else {
                        console.warn(`[subtitleMatcher] AI enhancement failed for ${sub.provider}, using original`);
                        
                        // AI failed, use original
                        subtitles.push({
                            id: `original-${sub.provider.toLowerCase()}-${imdbId}`,
                            url: `data:text/plain;charset=utf-8,${encodeURIComponent(originalContent)}`,
                            name: `📄 ${sub.provider} (Original)`,
                            lang: language,
                            quality: 500,
                            behaviorHints: {
                                notWebReady: true,
                                original: true,
                                priority: 3
                            }
                        });
                    }
                }
            } catch (e) {
                console.warn(`[subtitleMatcher] AI enhancement attempt failed for ${sub.provider}:`, e);
            }
        }
        
        // ========================================
        // PHASE 3: ORIGINAL SUBTITLES (PRIORITY 3)
        // ========================================
        if (subtitles.length === 0) {
            console.log(`[subtitleMatcher] PHASE 3: Fallback to original subtitles`);
            
            // If no AI-enhanced subtitles, add original subtitles
            for (let i = 0; i < Math.min(5, allSubtitles.length); i++) {
                const sub = allSubtitles[i];
                try {
                    const content = await downloadAndProcessSubtitle(sub.url, imdbId, sub.provider.toLowerCase());
                    if (content && isValidSubtitleContent(content)) {
                        subtitles.push({
                            id: `fallback-${sub.provider.toLowerCase()}-${imdbId}`,
                            url: `data:text/plain;charset=utf-8,${encodeURIComponent(content)}`,
                            name: `📄 ${sub.provider} (Original)`,
                            lang: language,
                            quality: 400 + i,
                            behaviorHints: {
                                notWebReady: true,
                                original: true,
                                priority: 3
                            }
                        });
                    }
                } catch (e) {
                    console.warn(`[subtitleMatcher] Original subtitle processing failed for ${sub.provider}:`, e);
                }
            }
        }
        
        // Sort final results by quality (highest first)
        subtitles.sort((a, b) => (b.quality || 0) - (a.quality || 0));
        
        console.log(`[subtitleMatcher] ✅ Final result: ${subtitles.length} subtitles found for ${imdbId}`);
        subtitles.forEach(sub => {
            console.log(`[subtitleMatcher] - ${sub.name} (Quality: ${sub.quality})`);
        });
        
        return subtitles;
        
    } catch (e) {
        console.error(`[subtitleMatcher] Error getting subtitles:`, e);
        return [];
    }
}

// Cache management functions
const cache = new Map();

async function getCache(key) {
    const item = cache.get(key);
    if (item && item.expires > Date.now()) {
        return item.data;
    }
    cache.delete(key);
    return null;
}

async function setCache(key, data, ttlSeconds = 3600) {
    cache.set(key, {
        data: data,
        expires: Date.now() + (ttlSeconds * 1000)
    });
}

// Function to get cached subtitle content
function getCachedSubtitleContent(videoId, source) {
    const cacheKey = `${videoId}-${source}`;
    return subtitleCache.get(cacheKey) || null;
}

// Function to set cached subtitle content
function setCachedSubtitleContent(videoId, source, content) {
    const cacheKey = `${videoId}-${source}`;
    subtitleCache.set(cacheKey, content);
}

// Function to get progressive subtitle content
function getProgressiveSubtitleContent(videoId, source) {
    const cacheKey = `${videoId}-${source}`;
    return progressiveSubtitleCache.get(cacheKey) || null;
}

// Function to set progressive subtitle content
function setProgressiveSubtitleContent(videoId, source, content) {
    const cacheKey = `${videoId}-${source}`;
    progressiveSubtitleCache.set(cacheKey, content);
}

// Function to initiate AI processing in the background (early start)
async function initiateAIEnhancement(videoId) {
    if (aiProcessingStatus.has(videoId)) {
        console.log(`[AI Background] AI processing for ${videoId} already initiated.`);
        return;
    }

    console.log(`[AI Background] Starting AI enhancement for ${videoId}`);
    aiProcessingStatus.set(videoId, 'pending');

    try {
        // Find the best original subtitle to enhance
        const originalSub = await findBestOriginalSubtitle(videoId);
        if (!originalSub || !originalSub.content) {
            throw new Error('Could not find suitable original subtitle to enhance.');
        }

        // Cache the original content for fallback
        originalSubtitleCache.set(videoId, originalSub.content);

        // Call the AI for correction
        const correctedContent = await getAICorrectedSubtitleDirect(originalSub.content, { 
            primaryLanguage: 'tr',
            videoId: videoId 
        });
        
        if (correctedContent && correctedContent.length > 10) {
            console.log(`[AI Background] Caching completed AI subtitle for ${videoId}.`);
            enhancedSubtitleCache.set(videoId, correctedContent);
            aiProcessingStatus.set(videoId, 'completed');
        } else {
            throw new Error('AI processing returned no content.');
        }
    } catch (error) {
        console.error(`[AI Background] Error during AI enhancement for ${videoId}:`, error.message);
        aiProcessingStatus.set(videoId, 'failed');
    }
}

// Function to wait for the enhanced subtitle with timeout
async function waitForEnhancedSubtitle(videoId, timeoutMs = 15000) {
    const startTime = Date.now();
    const pollInterval = 1000; // Check every 1 second

    while (Date.now() - startTime < timeoutMs) {
        const status = aiProcessingStatus.get(videoId);

        if (status === 'completed') {
            const content = enhancedSubtitleCache.get(videoId);
            if (content) {
                return {
                    id: `ai-enhanced-${videoId}`,
                    lang: 'tr',
                    url: `data:text/plain;charset=utf-8,${encodeURIComponent(content)}`,
                    name: 'Turkish (AI Enhanced)'
                };
            }
        }

        if (status === 'failed') {
            console.log(`[Wait] AI processing failed for ${videoId}. Stopping wait.`);
            return null;
        }

        // Wait for the next poll
        await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    console.log(`[Wait] Timed out after ${timeoutMs}ms waiting for AI subtitle for ${videoId}.`);
    return null;
}

// Function to search for hash-matched subtitles
async function searchByHash(infoHash) {
    if (!infoHash) return [];
    
    console.log(`[Hash Search] Searching for hash-matched subtitles: ${infoHash}`);
    
    try {
        // Search across all providers for hash matches
        const hashResults = [];
        
        // Try SubDL with hash
        const subdlResult = await fetchSubdlSubtitle(null, infoHash);
        if (subdlResult) {
            hashResults.push({
                id: `subdl-hash-${infoHash}`,
                lang: 'tr',
                url: subdlResult,
                name: 'Turkish (Hash Matched - SubDL)',
                score: 1000 // High score for hash match
            });
        }
        
        // Try OpenSubtitles with hash
        const opensubtitlesResult = await fetchOpenSubtitlesSubtitle(null, infoHash);
        if (opensubtitlesResult) {
            hashResults.push({
                id: `opensubtitles-hash-${infoHash}`,
                lang: 'tr',
                url: opensubtitlesResult,
                name: 'Turkish (Hash Matched - OpenSubtitles)',
                score: 1000 // High score for hash match
            });
        }
        
        // Sort by score and return the best match
        hashResults.sort((a, b) => b.score - a.score);
        return hashResults;
        
    } catch (error) {
        console.error(`[Hash Search] Error searching by hash:`, error);
        return [];
    }
}

// Function to find the best original subtitle for a video
async function findBestOriginalSubtitle(videoId) {
    console.log(`[Best Original] Finding best original subtitle for ${videoId}`);
    
    try {
        // Use the existing comprehensive search
        const results = await getSubtitleUrlsForStremio(videoId, 'movie', null, null, 'tr');
        
        if (results && results.length > 0) {
            const bestResult = results[0]; // Already sorted by quality
            
            // Download the content
            const content = await downloadAndProcessSubtitle(bestResult.url, videoId, bestResult.name);
            
            if (content) {
                return {
                    content: content,
                    source: bestResult.name,
                    url: bestResult.url,
                    id: bestResult.id
                };
            }
        }
        
        return null;
        
    } catch (error) {
        console.error(`[Best Original] Error finding best original subtitle:`, error);
        return null;
    }
}

// Enhanced AI processing function with race condition prevention
async function processSubtitleWithAI(content, imdbId, provider) {
    if (!content || typeof content !== 'string') {
        return null;
    }
    
    const processingKey = `ai-processing-${imdbId}-${provider}`;
    
    try {
        // Check if AI processing is already in progress for this subtitle
        if (aiProcessingStatus.has(processingKey)) {
            const status = aiProcessingStatus.get(processingKey);
            if (status === 'pending') {
                console.log(`[AI] AI processing already in progress for ${processingKey}, waiting...`);
                return await waitForAIProcessing(processingKey);
            } else if (status === 'completed') {
                const cached = enhancedSubtitleCache.get(processingKey);
                if (cached) {
                    console.log(`[AI] Using cached AI-enhanced subtitle for ${processingKey}`);
                    return cached;
                }
            }
        }
        
        // Mark as pending
        aiProcessingStatus.set(processingKey, 'pending');
        
        // Try AI enhancement
        const aiContent = await getAICorrectedSubtitleDirect(content, imdbId, provider);
        
        if (aiContent && isValidSubtitleContent(aiContent)) {
            // Cache the result and mark as completed
            enhancedSubtitleCache.set(processingKey, aiContent);
            aiProcessingStatus.set(processingKey, 'completed');
            
            console.log(`[AI] AI enhancement completed for ${processingKey}`);
            return aiContent;
        } else {
            console.log(`[AI] AI enhancement failed for ${processingKey}, using original`);
            aiProcessingStatus.set(processingKey, 'failed');
            return null;
        }
        
    } catch (error) {
        console.error(`[AI] AI processing error for ${processingKey}:`, error.message);
        aiProcessingStatus.set(processingKey, 'failed');
        return null;
    }
}

// Wait for AI processing to complete
async function waitForAIProcessing(processingKey, timeout = 15000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
        const status = aiProcessingStatus.get(processingKey);
        
        if (status === 'completed') {
            return enhancedSubtitleCache.get(processingKey);
        } else if (status === 'failed') {
            return null;
        }
        
        // Wait 100ms before checking again
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.warn(`[AI] AI processing timeout for ${processingKey}`);
    return null;
}

// Enhanced subtitle content validation
function isValidSubtitleContent(content) {
    if (!content || typeof content !== 'string') {
        return false;
    }
    
    // Check minimum length
    if (content.trim().length < 10) {
        return false;
    }
    
    // Check for common subtitle patterns
    const hasTimeStamps = /\d{2}:\d{2}:\d{2}[,\.]\d{3}/.test(content);
    const hasSequenceNumbers = /^\d+$/m.test(content);
    const hasArrowNotation = /-->/.test(content);
    
    // Must have at least timestamps and arrow notation for SRT format
    if (hasTimeStamps && hasArrowNotation) {
        return true;
    }
    
    // Check for ASS/SSA format
    const hasAssFormat = /\[Script Info\]/.test(content) || /\[V4\+ Styles\]/.test(content);
    if (hasAssFormat) {
        return true;
    }
    
    // Check for WebVTT format
    const hasWebVTT = /^WEBVTT$/m.test(content);
    if (hasWebVTT) {
        return true;
    }
    
    // If content has reasonable length and some dialogue-like patterns
    const hasDialogue = /[a-zA-Z]{3,}/.test(content);
    const hasLines = content.split('\n').length > 5;
    
    return hasDialogue && hasLines;
}

// Export the enhancement status map
const getAiEnhancementStatus = () => aiProcessingStatus;

// Export all functions
module.exports = {
    getSubtitleUrlsForStremio,
    getAICorrectedSubtitleDirect,
    tmdbToImdb,
    robustFetch,
    searchOpenSubtitles,
    searchSubDL,
    searchPodnapisi,
    validateAndFixSrtFormat,
    getCache,
    setCache,
    getCachedSubtitleContent,
    setCachedSubtitleContent,
    getProgressiveSubtitleContent,
    setProgressiveSubtitleContent,
    getAiEnhancementStatus,
    // Enhanced AI processing functions
    processSubtitleWithAI,
    waitForAIProcessing,
    isValidSubtitleContent,
    // New AI processing functions
    initiateAIEnhancement,
    waitForEnhancedSubtitle,
    getAIEnhancementProgress,
    findBestOriginalSubtitle,
    downloadAndProcessSubtitle
};
    waitForEnhancedSubtitle,
    searchByHash,
    findBestOriginalSubtitle,
    downloadAndProcessSubtitle
};
