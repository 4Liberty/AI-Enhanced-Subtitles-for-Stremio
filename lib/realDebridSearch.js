// lib/realDebridSearch.js
// Real-Debrid torrent search and stream integration for hash-based matching

const fetch = require('node-fetch');

// Helper for robust fetch with retries
async function robustFetch(url, options = {}, retries = 2, timeoutMs = 30000) {
    for (let i = 0; i <= retries; i++) {
        let controller;
        let timeout;
        
        try {
            controller = new AbortController();
            timeout = setTimeout(() => {
                console.log(`[RealDebrid] Request timeout after ${timeoutMs}ms for URL: ${url}`);
                controller.abort();
            }, timeoutMs);
            
            const res = await fetch(url, { 
                ...options, 
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    ...options.headers
                }
            });
            
            clearTimeout(timeout);
            
            if (res.ok) {
                console.log(`[RealDebrid] robustFetch success for URL: ${url}`);
                return res;
            } else {
                console.log(`[RealDebrid] robustFetch HTTP error ${res.status} for URL: ${url}`);
                
                // For 403 errors, don't retry as it's likely an auth issue
                if (res.status === 403) {
                    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
                }
                
                throw new Error(`HTTP ${res.status}: ${res.statusText}`);
            }
            
        } catch (e) {
            if (timeout) clearTimeout(timeout);
            
            if (i === retries) {
                console.error('[RealDebrid] robustFetch failed after all retries:', e.message);
                return null;
            }
            
            // Don't retry 403 errors
            if (e.message.includes('403')) {
                console.error('[RealDebrid] 403 error - not retrying:', e.message);
                return null;
            }
            
            console.log(`[RealDebrid] robustFetch attempt ${i + 1} failed (${e.message}), retrying in ${(i + 1) * 1000}ms...`);
            // Wait before retry with exponential backoff
            await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        }
    }
    return null;
}

// Search for cached torrents on Real-Debrid
async function searchRealDebridTorrents(imdbId, query = null) {
    try {
        const realDebridApiKey = process.env.REAL_DEBRID_API_KEY;
        if (!realDebridApiKey) {
            console.log('[RealDebrid] API key not found, skipping Real-Debrid search');
            return [];
        }

        console.log(`[RealDebrid] Searching for cached torrents: ${imdbId}${query ? ` query: ${query}` : ''}`);

        // Step 1: Get movie metadata from TMDB if available
        const movieTitle = await getMovieMetadata(imdbId);
        if (!movieTitle) {
            console.log('[RealDebrid] Could not get movie metadata');
            return [];
        }

        // Step 2: Search all torrent providers (like Torrentio) with scraping support
        console.log('[RealDebrid] Starting comprehensive torrent search with scraping support...');
        const torrents = await searchAllTorrentProviders(imdbId, movieTitle);

        console.log(`[RealDebrid] Found ${torrents.length} potential torrents`);
        
        // Step 3: Filter unique torrents by hash
        const uniqueTorrents = [];
        const seenHashes = new Set();
        
        for (const torrent of torrents) {
            if (torrent.hash && !seenHashes.has(torrent.hash)) {
                seenHashes.add(torrent.hash);
                uniqueTorrents.push(torrent);
            }
        }

        console.log(`[RealDebrid] ${uniqueTorrents.length} unique torrents found`);
        return uniqueTorrents;

    } catch (e) {
        console.error('[RealDebrid] Search error:', e);
        return [];
    }
}

// Get movie metadata from TMDB
async function getMovieMetadata(imdbId) {
    try {
        // Try multiple sources for movie metadata
        const sources = [
            `https://www.omdbapi.com/?i=${imdbId}&apikey=${process.env.OMDB_API_KEY}`,
            `https://api.themoviedb.org/3/movie/${imdbId.replace('tt', '')}?api_key=${process.env.TMDB_API_KEY}`,
            `https://imdb-api.com/en/API/Title/${process.env.IMDB_API_KEY}/${imdbId}`
        ];

        for (const source of sources) {
            try {
                const response = await robustFetch(source);
                if (response) {
                    const data = await response.json();
                    
                    // Normalize different API responses
                    if (data.Title || data.title || data.fullTitle) {
                        return {
                            title: data.Title || data.title || data.fullTitle,
                            year: data.Year || data.release_date?.split('-')[0] || data.year,
                            imdbId: imdbId,
                            plot: data.Plot || data.overview || data.plotLocal,
                            genre: data.Genre || data.genres?.map(g => g.name).join(', ') || data.genreList?.map(g => g.value).join(', '),
                            director: data.Director || data.directors || data.directors?.value,
                            actors: data.Actors || data.actorList?.map(a => a.name).join(', ') || data.stars,
                            runtime: data.Runtime || data.runtime || data.runtimeMins,
                            rating: data.imdbRating || data.vote_average || data.rating
                        };
                    }
                }
            } catch (e) {
                console.error(`[RealDebrid] Error with metadata source ${source}:`, e);
                continue;
            }
        }

        // Fallback: extract from IMDb ID
        return {
            title: `Movie ${imdbId}`,
            year: new Date().getFullYear(),
            imdbId: imdbId
        };
    } catch (e) {
        console.error('[RealDebrid] Error getting movie metadata:', e);
        return {
            title: `Movie ${imdbId}`,
            year: new Date().getFullYear(),
            imdbId: imdbId
        };
    }
}

// Search YTS API for movie torrents
async function searchYTSTorrents(imdbId, movieData) {
    try {
        const imdbCode = imdbId.replace('tt', '');
        const url = `https://yts.mx/api/v2/list_movies.json?imdb_id=${imdbCode}&limit=50`;
        
        const response = await robustFetch(url);
        if (!response) return [];
        
        const data = await response.json();
        const movie = data.data?.movies?.[0];
        
        if (!movie || !movie.torrents) return [];
        
        const torrents = [];
        for (const torrent of movie.torrents) {
            torrents.push({
                title: `${movie.title} (${movie.year}) ${torrent.quality} ${torrent.type}`,
                hash: torrent.hash,
                size: torrent.size_bytes,
                quality: torrent.quality,
                seeds: torrent.seeds,
                peers: torrent.peers,
                url: torrent.url,
                source: 'YTS'
            });
        }
        
        console.log(`[RealDebrid] YTS found ${torrents.length} torrents`);
        return torrents;
    } catch (e) {
        console.error('[RealDebrid] YTS search error:', e);
        return [];
    }
}

// Search EZTV for TV shows and movies
async function searchEZTVTorrents(imdbId, movieData) {
    try {
        const imdbCode = imdbId.replace('tt', '');
        const url = `https://eztv.re/api/get-torrents?imdb_id=${imdbCode}&limit=100`;
        
        const response = await robustFetch(url);
        if (!response) return [];
        
        const data = await response.json();
        const torrents = [];
        
        if (data.torrents) {
            for (const torrent of data.torrents) {
                torrents.push({
                    title: torrent.title,
                    hash: torrent.hash,
                    size: torrent.size_bytes,
                    quality: detectQuality(torrent.title),
                    seeds: torrent.seeds,
                    peers: torrent.peers,
                    url: torrent.magnet_url,
                    source: 'EZTV'
                });
            }
        }
        
        console.log(`[RealDebrid] EZTV found ${torrents.length} torrents`);
        return torrents;
    } catch (e) {
        console.error('[RealDebrid] EZTV search error:', e);
        return [];
    }
}

// Search RARBG (using mirror/proxy sites)
async function searchRARBGTorrents(imdbId, movieData) {
    try {
        // Use RARBG proxy/mirror sites
        const mirrors = [
            'https://rarbgprx.org/api/v2/list',
            'https://rarbgmirror.org/api/v2/list',
            'https://rarbg.to/api/v2/list'
        ];
        
        const imdbCode = imdbId.replace('tt', '');
        
        for (const mirror of mirrors) {
            try {
                const url = `${mirror}?category=movies;tv&search_imdb=${imdbCode}&format=json_extended&limit=100`;
                const response = await robustFetch(url);
                
                if (!response) continue;
                
                const data = await response.json();
                const torrents = [];
                
                if (data.torrent_results) {
                    for (const torrent of data.torrent_results) {
                        torrents.push({
                            title: torrent.title,
                            hash: torrent.download.match(/btih:([a-fA-F0-9]{40})/)?.[1],
                            size: torrent.size,
                            quality: detectQuality(torrent.title),
                            seeds: torrent.seeders,
                            peers: torrent.leechers,
                            url: torrent.download,
                            source: 'RARBG'
                        });
                    }
                }
                
                console.log(`[RealDebrid] RARBG found ${torrents.length} torrents`);
                return torrents;
            } catch (e) {
                continue; // Try next mirror
            }
        }
        
        return [];
    } catch (e) {
        console.error('[RealDebrid] RARBG search error:', e);
        return [];
    }
}

// HTML parsing helper (using cheerio-like approach)
function parseHTML(html) {
    // Simple HTML parser for basic scraping
    // In production, use cheerio or jsdom
    const results = [];
    
    // Extract magnet links
    const magnetRegex = /magnet:\?[^"'>\s]+/g;
    const magnets = html.match(magnetRegex) || [];
    
    // Extract torrent names from common patterns
    const nameRegex = /<[^>]*title[^>]*>([^<]+)<\/[^>]*>/gi;
    const names = [];
    let match;
    while ((match = nameRegex.exec(html)) !== null) {
        names.push(match[1]);
    }
    
    // Extract seeds/peers from common patterns
    const seedRegex = /(\d+)\s*seed/gi;
    const peerRegex = /(\d+)\s*peer/gi;
    const seeds = [];
    const peers = [];
    
    while ((match = seedRegex.exec(html)) !== null) {
        seeds.push(parseInt(match[1]));
    }
    
    while ((match = peerRegex.exec(html)) !== null) {
        peers.push(parseInt(match[1]));
    }
    
    return { magnets, names, seeds, peers };
}

// Extract torrent hash from magnet link
function extractHashFromMagnet(magnetUrl) {
    const match = magnetUrl.match(/btih:([a-fA-F0-9]{40})/);
    return match ? match[1] : null;
}

// Search 1337x with scraping (simplified)
async function search1337xTorrents(imdbId, movieData) {
    try {
        const searchQuery = encodeURIComponent(movieData.title || movieData);
        const url = 'https://1337x.to/search/' + searchQuery + '/1/';
        
        console.log('[RealDebrid] Scraping 1337x for: ' + searchQuery);
        
        const response = await robustFetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        
        if (!response) return [];
        
        const html = await response.text();
        const torrents = [];
        
        // Simple magnet link extraction
        const magnetRegex = /magnet:\?[^"'\s<>]+/g;
        const magnets = html.match(magnetRegex) || [];
        
        for (let i = 0; i < Math.min(magnets.length, 10); i++) {
            const magnetUrl = magnets[i];
            const hash = extractHashFromMagnet(magnetUrl);
            
            if (hash) {
                torrents.push({
                    title: 'Movie from 1337x (hash: ' + hash.substring(0, 8) + '...)',
                    hash: hash,
                    size: 'Unknown',
                    quality: detectQuality(movieData.title || ''),
                    seeds: 1,
                    peers: 1,
                    url: magnetUrl,
                    source: '1337x'
                });
            }
        }
        
        console.log('[RealDebrid] 1337x scraping found ' + torrents.length + ' torrents');
        return torrents;
    } catch (e) {
        console.error('[RealDebrid] 1337x scraping error:', e);
        return [];
    }
}

// Search KickassTorrents with scraping
async function searchKickassTorrents(imdbId, movieData) {
    try {
        const searchQuery = encodeURIComponent(movieData.title || movieData);
        const mirrors = [
            'https://kickasstorrents.to',
            'https://katcr.to',
            'https://kickass.cm'
        ];
        
        for (const mirror of mirrors) {
            try {
                const url = `${mirror}/usearch/${searchQuery}/`;
                
                console.log(`[RealDebrid] Scraping KickassTorrents (${mirror}) for: ${searchQuery}`);
                
                const response = await robustFetch(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                });
                
                if (!response) continue;
                
                const html = await response.text();
                const torrents = [];
                
                // Parse KAT HTML structure
                const rows = html.split('<tr>');
                
                for (const row of rows) {
                    if (row.includes('magnet:') || row.includes('.torrent')) {
                        const nameMatch = row.match(/<a[^>]*class="[^"]*cellMainLink[^"]*"[^>]*>([^<]+)<\/a>/);
                        const magnetMatch = row.match(/magnet:\?[^"'>\s]+/);
                        const seedMatch = row.match(/<td[^>]*class="[^"]*green[^"]*"[^>]*>(\d+)<\/td>/);
                        const peerMatch = row.match(/<td[^>]*class="[^"]*red[^"]*"[^>]*>(\d+)<\/td>/);
                        const sizeMatch = row.match(/<td[^>]*class="[^"]*nobr[^"]*"[^>]*>([^<]+)<\/td>/);
                        
                        if (nameMatch && magnetMatch) {
                            const title = nameMatch[1].trim();
                            const magnetUrl = magnetMatch[0];
                            const hash = extractHashFromMagnet(magnetUrl);
                            const seeds = seedMatch ? parseInt(seedMatch[1]) : 0;
                            const peers = peerMatch ? parseInt(peerMatch[1]) : 0;
                            const size = sizeMatch ? sizeMatch[1].trim() : 'Unknown';
                            
                            if (hash) {
                                torrents.push({
                                    title: title,
                                    hash: hash,
                                    size: size,
                                    quality: detectQuality(title),
                                    seeds: seeds,
                                    peers: peers,
                                    url: magnetUrl,
                                    source: 'KickassTorrents'
                                });
                            }
                        }
                    }
                }
                
                console.log(`[RealDebrid] KickassTorrents scraping found ${torrents.length} torrents`);
                return torrents.slice(0, 10); // Limit results
            } catch (e) {
                console.error(`[RealDebrid] KickassTorrents mirror ${mirror} error:`, e);
                continue;
            }
        }
        
        return [];
    } catch (e) {
        console.error('[RealDebrid] KickassTorrents scraping error:', e);
        return [];
    }
}

// Search MagnetDL with scraping (simplified)
async function searchMagnetDLTorrents(imdbId, movieData) {
    try {
        const searchQuery = encodeURIComponent(movieData.title || movieData);
        const url = 'https://www.magnetdl.com/search/?q=' + searchQuery;
        
        console.log('[RealDebrid] Scraping MagnetDL for: ' + searchQuery);
        
        const response = await robustFetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        if (!response) return [];
        
        const html = await response.text();
        const torrents = [];
        
        // Simple magnet link extraction
        const magnetRegex = /magnet:\?[^"'\s<>]+/g;
        const magnets = html.match(magnetRegex) || [];
        
        for (let i = 0; i < Math.min(magnets.length, 10); i++) {
            const magnetUrl = magnets[i];
            const hash = extractHashFromMagnet(magnetUrl);
            
            if (hash) {
                torrents.push({
                    title: 'Movie from MagnetDL (hash: ' + hash.substring(0, 8) + '...)',
                    hash: hash,
                    size: 'Unknown',
                    quality: detectQuality(movieData.title || ''),
                    seeds: 1,
                    peers: 1,
                    url: magnetUrl,
                    source: 'MagnetDL'
                });
            }
        }
        
        console.log('[RealDebrid] MagnetDL scraping found ' + torrents.length + ' torrents');
        return torrents;
    } catch (e) {
        console.error('[RealDebrid] MagnetDL scraping error:', e);
        return [];
    }
}

// Search HorribleSubs (for anime)
async function searchHorribleSubsTorrents(imdbId, movieData) {
    try {
        // HorribleSubs is mainly for anime, might not be relevant for movies
        console.log(`[RealDebrid] HorribleSubs search not implemented (anime-focused)`);
        return [];
    } catch (e) {
        console.error('[RealDebrid] HorribleSubs search error:', e);
        return [];
    }
}

// Search Nyaa.si (for anime)
async function searchNyaaSiTorrents(imdbId, movieData) {
    try {
        const searchQuery = encodeURIComponent(movieData.title || movieData);
        const url = `https://nyaa.si/api/search?q=${searchQuery}&c=1_0&f=0&limit=100`;
        
        const response = await robustFetch(url);
        if (!response) return [];
        
        const data = await response.json();
        const torrents = [];
        
        if (data.results) {
            for (const torrent of data.results) {
                torrents.push({
                    title: torrent.name,
                    hash: torrent.info_hash,
                    size: torrent.filesize,
                    quality: detectQuality(torrent.name),
                    seeds: torrent.seeds,
                    peers: torrent.leechers,
                    url: `magnet:?xt=urn:btih:${torrent.info_hash}&dn=${encodeURIComponent(torrent.name)}`,
                    source: 'NyaaSi'
                });
            }
        }
        
        console.log(`[RealDebrid] Nyaa.si found ${torrents.length} torrents`);
        return torrents;
    } catch (e) {
        console.error('[RealDebrid] Nyaa.si search error:', e);
        return [];
    }
}

// Search TokyoTosho
async function searchTokyoToshoTorrents(imdbId, movieData) {
    try {
        const searchQuery = encodeURIComponent(movieData.title || movieData);
        const url = `https://www.tokyotosho.info/search.php?terms=${searchQuery}&type=1`;
        
        // Note: TokyoTosho requires scraping
        console.log(`[RealDebrid] TokyoTosho search not implemented (requires scraping)`);
        return [];
    } catch (e) {
        console.error('[RealDebrid] TokyoTosho search error:', e);
        return [];
    }
}

// Search AniDex
async function searchAniDexTorrents(imdbId, movieData) {
    try {
        const searchQuery = encodeURIComponent(movieData.title || movieData);
        const url = `https://anidex.info/api/search?q=${searchQuery}&limit=100`;
        
        const response = await robustFetch(url);
        if (!response) return [];
        
        const data = await response.json();
        const torrents = [];
        
        if (data.torrents) {
            for (const torrent of data.torrents) {
                torrents.push({
                    title: torrent.filename,
                    hash: torrent.info_hash,
                    size: torrent.filesize,
                    quality: detectQuality(torrent.filename),
                    seeds: torrent.seeds,
                    peers: torrent.leechers,
                    url: `magnet:?xt=urn:btih:${torrent.info_hash}&dn=${encodeURIComponent(torrent.filename)}`,
                    source: 'AniDex'
                });
            }
        }
        
        console.log(`[RealDebrid] AniDex found ${torrents.length} torrents`);
        return torrents;
    } catch (e) {
        console.error('[RealDebrid] AniDex search error:', e);
        return [];
    }
}

// Search Rutor (Russian)
async function searchRutorTorrents(imdbId, movieData) {
    try {
        const searchQuery = encodeURIComponent(movieData.title || movieData);
        const url = `http://rutor.info/search/${searchQuery}`;
        
        console.log(`[RealDebrid] Scraping Rutor for: ${searchQuery}`);
        
        const response = await robustFetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        if (!response) return [];
        
        const html = await response.text();
        const torrents = [];
        
        // Parse Rutor HTML structure
        const rows = html.split('<tr>');
        
        for (const row of rows) {
            if (row.includes('magnet:') || row.includes('.torrent')) {
                const nameMatch = row.match(/<a[^>]*href="[^"]*"[^>]*>([^<]+)<\/a>/);
                const magnetMatch = row.match(/magnet:\?[^"'>\s]+/);
                const sizeMatch = row.match(/<td[^>]*align="right"[^>]*>([^<]*(?:MB|GB|TB)[^<]*)<\/td>/);
                const seedMatch = row.match(/<span[^>]*class="[^"]*green[^"]*"[^>]*>(\d+)<\/span>/);
                const peerMatch = row.match(/<span[^>]*class="[^"]*red[^"]*"[^>]*>(\d+)<\/span>/);
                
                if (nameMatch && magnetMatch) {
                    const title = nameMatch[1].trim();
                    const magnetUrl = magnetMatch[0];
                    const hash = extractHashFromMagnet(magnetUrl);
                    const seeds = seedMatch ? parseInt(seedMatch[1]) : 0;
                    const peers = peerMatch ? parseInt(peerMatch[1]) : 0;
                    const size = sizeMatch ? sizeMatch[1].trim() : 'Unknown';
                    
                    if (hash) {
                        torrents.push({
                            title: title,
                            hash: hash,
                            size: size,
                            quality: detectQuality(title),
                            seeds: seeds,
                            peers: peers,
                            url: magnetUrl,
                            source: 'Rutor'
                        });
                    }
                }
            }
        }
        
        console.log(`[RealDebrid] Rutor scraping found ${torrents.length} torrents`);
        return torrents.slice(0, 10); // Limit results
    } catch (e) {
        console.error('[RealDebrid] Rutor scraping error:', e);
        return [];
    }
}

// Direct Real-Debrid cached content search - prioritizes cached streams over P2P
async function searchRealDebridCachedContent(imdbId, movieData) {
    try {
        const realDebridApiKey = process.env.REAL_DEBRID_API_KEY;
        if (!realDebridApiKey) {
            console.log('[RealDebrid] API key not configured, cannot search cached content');
            return [];
        }

        console.log(`[RealDebrid] Searching cached content for: ${imdbId}`);
        
        const cachedStreams = [];
        
        // STEP 1: Search Real-Debrid's cache using movie title
        if (movieData && movieData.title) {
            console.log(`[RealDebrid] Searching RD cache for title: ${movieData.title}`);
            
            // Use Real-Debrid's torrent search endpoint
            const searchQueries = [
                movieData.title,
                `${movieData.title} ${movieData.year}`,
                `${movieData.title} ${movieData.year} 1080p`,
                `${movieData.title} ${movieData.year} 720p`,
                `${movieData.title} BluRay`,
                `${movieData.title} WEB-DL`
            ];
            
            for (const query of searchQueries) {
                try {
                    const searchUrl = `https://api.real-debrid.com/rest/1.0/torrents/search?q=${encodeURIComponent(query)}&limit=50`;
                    
                    const response = await robustFetch(searchUrl, {
                        headers: {
                            'Authorization': `Bearer ${realDebridApiKey}`,
                            'Content-Type': 'application/json'
                        }
                    });
                    
                    if (!response) continue;
                    
                    const searchResults = await response.json();
                    console.log(`[RealDebrid] Search "${query}" returned ${searchResults.length} results`);
                    
                    // Filter for cached torrents
                    for (const torrent of searchResults) {
                        if (torrent.cached === 1) {
                            cachedStreams.push({
                                title: torrent.filename,
                                hash: torrent.hash,
                                size: torrent.bytes,
                                quality: detectQuality(torrent.filename),
                                cached: true,
                                url: `realdebrid:${torrent.hash}:1`,
                                source: 'Real-Debrid Cache',
                                infoHash: torrent.hash
                            });
                        }
                    }
                } catch (searchError) {
                    console.error(`[RealDebrid] Search error for "${query}":`, searchError);
                    continue;
                }
            }
        }
        
        // STEP 2: Search Real-Debrid's popular/trending cached content
        try {
            console.log(`[RealDebrid] Searching popular cached content`);
            
            const popularUrl = `https://api.real-debrid.com/rest/1.0/torrents/popular`;
            const response = await robustFetch(popularUrl, {
                headers: {
                    'Authorization': `Bearer ${realDebridApiKey}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response) {
                const popularTorrents = await response.json();
                
                // Filter popular torrents by movie title/year
                for (const torrent of popularTorrents) {
                    if (movieData && movieData.title) {
                        const titleMatch = torrent.filename.toLowerCase().includes(movieData.title.toLowerCase());
                        const yearMatch = movieData.year ? torrent.filename.includes(movieData.year.toString()) : true;
                        
                        if (titleMatch && yearMatch) {
                            cachedStreams.push({
                                title: torrent.filename,
                                hash: torrent.hash,
                                size: torrent.bytes,
                                quality: detectQuality(torrent.filename),
                                cached: true,
                                url: `realdebrid:${torrent.hash}:1`,
                                source: 'Real-Debrid Popular',
                                infoHash: torrent.hash
                            });
                        }
                    }
                }
            }
        } catch (popularError) {
            console.error(`[RealDebrid] Popular content search error:`, popularError);
        }
        
        // STEP 3: Use IMDb ID to search for specific movie torrents
        if (imdbId) {
            try {
                const imdbSearchUrl = `https://api.real-debrid.com/rest/1.0/torrents/search?q=${imdbId}&limit=50`;
                
                const response = await robustFetch(imdbSearchUrl, {
                    headers: {
                        'Authorization': `Bearer ${realDebridApiKey}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                if (response) {
                    const imdbResults = await response.json();
                    console.log(`[RealDebrid] IMDb search returned ${imdbResults.length} results`);
                    
                    for (const torrent of imdbResults) {
                        if (torrent.cached === 1) {
                            cachedStreams.push({
                                title: torrent.filename,
                                hash: torrent.hash,
                                size: torrent.bytes,
                                quality: detectQuality(torrent.filename),
                                cached: true,
                                url: `realdebrid:${torrent.hash}:1`,
                                source: 'Real-Debrid IMDb',
                                infoHash: torrent.hash
                            });
                        }
                    }
                }
            } catch (imdbError) {
                console.error(`[RealDebrid] IMDb search error:`, imdbError);
            }
        }
        
        // Remove duplicates and sort by quality
        const uniqueStreams = [];
        const seenHashes = new Set();
        
        for (const stream of cachedStreams) {
            if (!seenHashes.has(stream.hash)) {
                seenHashes.add(stream.hash);
                uniqueStreams.push(stream);
            }
        }
        
        // Sort by quality (4K > 1080p > 720p > 480p)
        uniqueStreams.sort((a, b) => {
            const qualityOrder = { '4K': 4, '1080p': 3, '720p': 2, '480p': 1 };
            return (qualityOrder[b.quality] || 0) - (qualityOrder[a.quality] || 0);
        });
        
        console.log(`[RealDebrid] Found ${uniqueStreams.length} unique cached streams`);
        return uniqueStreams.slice(0, 20); // Limit to top 20 results
        
    } catch (e) {
        console.error('[RealDebrid] Cached content search error:', e);
        return [];
    }
}

// Get Real-Debrid user's cached torrents
async function getRealDebridUserTorrents(imdbId, movieData) {
    try {
        const realDebridApiKey = process.env.REAL_DEBRID_API_KEY;
        if (!realDebridApiKey) {
            console.log('[RealDebrid] API key not configured, cannot get user torrents');
            return [];
        }

        console.log(`[RealDebrid] Getting user's cached torrents`);
        
        const response = await robustFetch('https://api.real-debrid.com/rest/1.0/torrents', {
            headers: {
                'Authorization': `Bearer ${realDebridApiKey}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response) return [];
        
        const userTorrents = await response.json();
        const cachedStreams = [];
        
        for (const torrent of userTorrents) {
            // Only include finished torrents that match our movie
            if (torrent.status === 'downloaded' && movieData && movieData.title) {
                const titleMatch = torrent.filename.toLowerCase().includes(movieData.title.toLowerCase());
                const yearMatch = movieData.year ? torrent.filename.includes(movieData.year.toString()) : true;
                
                if (titleMatch && yearMatch) {
                    cachedStreams.push({
                        title: torrent.filename,
                        hash: torrent.hash,
                        size: torrent.bytes,
                        quality: detectQuality(torrent.filename),
                        cached: true,
                        url: `realdebrid:${torrent.hash}:1`,
                        source: 'Real-Debrid User',
                        infoHash: torrent.hash
                    });
                }
            }
        }
        
        console.log(`[RealDebrid] Found ${cachedStreams.length} user cached streams`);
        return cachedStreams;
        
    } catch (e) {
        console.error('[RealDebrid] User torrents error:', e);
        return [];
    }
}

// Enhanced Real-Debrid instant availability check with better error handling
async function checkRealDebridInstantAvailabilityEnhanced(hashes) {
    try {
        const realDebridApiKey = process.env.REAL_DEBRID_API_KEY;
        if (!realDebridApiKey) {
            console.log('[RealDebrid] API key not configured, skipping instant availability check');
            return {};
        }
        
        if (!hashes || hashes.length === 0) {
            console.log('[RealDebrid] No hashes provided for instant availability check');
            return {};
        }

        console.log(`[RealDebrid] Checking instant availability for ${hashes.length} hashes`);

        // Split hashes into chunks to avoid URL length limits
        const chunkSize = 50;
        const chunks = [];
        for (let i = 0; i < hashes.length; i += chunkSize) {
            chunks.push(hashes.slice(i, i + chunkSize));
        }
        
        const allResults = {};
        
        for (const chunk of chunks) {
            try {
                const hashString = chunk.join('/');
                const url = `https://api.real-debrid.com/rest/1.0/torrents/instantAvailability/${hashString}`;

                const response = await robustFetch(url, {
                    headers: {
                        'Authorization': `Bearer ${realDebridApiKey}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (!response) {
                    console.log('[RealDebrid] Instant availability check failed - no response');
                    continue;
                }

                const data = await response.json();
                Object.assign(allResults, data);
                
            } catch (chunkError) {
                console.error(`[RealDebrid] Instant availability chunk error:`, chunkError);
                continue;
            }
        }
        
        console.log(`[RealDebrid] Instant availability results: ${Object.keys(allResults).length} available`);
        return allResults;

    } catch (e) {
        console.error('[RealDebrid] Instant availability check error:', e);
        if (e.message.includes('403')) {
            console.error('[RealDebrid] API key may be invalid or expired. Please check your REAL_DEBRID_API_KEY environment variable.');
        }
        return {};
    }
}

// Generate streaming links for Real-Debrid cached torrents - PRIORITIZING CACHED CONTENT
async function generateRealDebridStreams(imdbId, videoType = 'movie') {
    try {
        const realDebridApiKey = process.env.REAL_DEBRID_API_KEY;
        if (!realDebridApiKey) {
            console.log('[RealDebrid] No API key, returning sample streams');
            return generateSampleRealDebridStreams(imdbId);
        }

        console.log(`[RealDebrid] Generating streams for ${imdbId} (${videoType}) - PRIORITIZING CACHED CONTENT`);

        let streams = [];

        // PRIORITY 1: Search Real-Debrid cached content directly (like Unchained app)
        console.log('[RealDebrid] STEP 1: Searching Real-Debrid cached content directly');
        try {
            // Get movie metadata for better search
            const movieData = await getMovieMetadata(imdbId);
            console.log(`[RealDebrid] Movie metadata: ${movieData.title} (${movieData.year})`);
            
            const cachedStreams = await searchRealDebridCachedContent(imdbId, movieData);
            if (cachedStreams && cachedStreams.length > 0) {
                console.log(`[RealDebrid] Found ${cachedStreams.length} cached streams directly from Real-Debrid`);
                
                // Convert cached streams to proper format
                for (const cached of cachedStreams) {
                    streams.push({
                        title: `RD 🎬 ${cached.title.substring(0, 60)}... (${formatFileSize(cached.size)})`,
                        url: cached.url,
                        quality: cached.quality,
                        size: cached.size,
                        seeds: 999, // Cached content
                        peers: 0,
                        behaviorHints: {
                            notWebReady: false,
                            realDebrid: true,
                            cached: true,
                            instantAvailable: true,
                            directCache: true
                        },
                        infoHash: cached.hash,
                        source: cached.source
                    });
                }
            } else {
                console.log('[RealDebrid] No direct cached content found');
            }
        } catch (e) {
            console.error('[RealDebrid] Error searching cached content:', e);
        }

        // PRIORITY 2: Check user's existing Real-Debrid torrents
        console.log('[RealDebrid] STEP 2: Checking user\'s existing Real-Debrid torrents');
        try {
            const userTorrents = await getRealDebridUserTorrents(imdbId);
            if (userTorrents && userTorrents.length > 0) {
                console.log(`[RealDebrid] Found ${userTorrents.length} user torrents matching ${imdbId}`);
                
                // Convert user torrents to streams
                for (const torrent of userTorrents) {
                    if (torrent.status === 'downloaded' && torrent.files) {
                        for (const file of torrent.files) {
                            if (isVideoFile(file.path)) {
                                streams.push({
                                    title: `RD 👤 ${torrent.filename} (${formatFileSize(file.bytes)})`,
                                    url: file.link || `realdebrid:${torrent.id}:${file.id}`,
                                    quality: detectQuality(torrent.filename),
                                    size: file.bytes,
                                    seeds: 999, // User's own content
                                    peers: 0,
                                    behaviorHints: {
                                        notWebReady: false,
                                        realDebrid: true,
                                        cached: true,
                                        instantAvailable: true,
                                        userOwned: true
                                    },
                                    infoHash: torrent.hash
                                });
                            }
                        }
                    }
                }
            } else {
                console.log('[RealDebrid] No user torrents found');
            }
        } catch (e) {
            console.error('[RealDebrid] Error checking user torrents:', e);
        }

        // PRIORITY 3: Enhanced instant availability check with batch processing
        console.log('[RealDebrid] STEP 3: Enhanced instant availability check');
        try {
            const enhancedAvailability = await checkRealDebridInstantAvailabilityEnhanced(imdbId, videoType);
            if (enhancedAvailability && enhancedAvailability.length > 0) {
                console.log(`[RealDebrid] Found ${enhancedAvailability.length} instantly available torrents`);
                
                for (const availItem of enhancedAvailability) {
                    streams.push({
                        title: `RD ⚡ ${availItem.title} (${formatFileSize(availItem.filesize)})`,
                        url: await generateRealDebridStreamUrl(availItem.hash, availItem.fileId, realDebridApiKey),
                        quality: detectQuality(availItem.title),
                        size: availItem.filesize,
                        seeds: availItem.seeds || 0,
                        peers: availItem.peers || 0,
                        behaviorHints: {
                            notWebReady: false,
                            realDebrid: true,
                            cached: true,
                            instantAvailable: true,
                            enhancedCheck: true
                        },
                        infoHash: availItem.hash
                    });
                }
            } else {
                console.log('[RealDebrid] No enhanced instant availability found');
            }
        } catch (e) {
            console.error('[RealDebrid] Error in enhanced availability check:', e);
        }

        // FALLBACK: Traditional P2P torrent scraping (only if no cached content found)
        if (streams.length === 0) {
            console.log('[RealDebrid] FALLBACK: No cached content found, falling back to P2P scraping');
            try {
                const torrents = await searchRealDebridTorrents(imdbId, videoType);
                
                if (torrents.length > 0) {
                    const hashes = torrents.map(t => t.hash).filter(Boolean);
                    console.log(`[RealDebrid] Checking availability for ${hashes.length} P2P hashes`);
                    
                    const availability = await checkRealDebridInstantAvailability(hashes);
                    
                    for (const torrent of torrents) {
                        if (availability[torrent.hash]) {
                            const availableFiles = availability[torrent.hash];
                            
                            for (const fileId in availableFiles) {
                                const files = availableFiles[fileId];
                                
                                for (const file of files) {
                                    if (isVideoFile(file.filename)) {
                                        streams.push({
                                            title: `RD 📦 ${torrent.title} (${formatFileSize(file.filesize)})`,
                                            url: await generateRealDebridStreamUrl(torrent.hash, file.id, realDebridApiKey),
                                            quality: detectQuality(torrent.title),
                                            size: file.filesize,
                                            seeds: torrent.seeds || 0,
                                            peers: torrent.peers || 0,
                                            behaviorHints: {
                                                notWebReady: false,
                                                realDebrid: true,
                                                cached: true,
                                                instantAvailable: true,
                                                p2pFallback: true
                                            },
                                            infoHash: torrent.hash
                                        });
                                    }
                                }
                            }
                        }
                    }
                } else {
                    console.log('[RealDebrid] No P2P torrents found either');
                }
            } catch (e) {
                console.error('[RealDebrid] Error in P2P fallback:', e);
            }
        }

        // Sort streams by priority: direct cache > user owned > cached > enhanced > p2p fallback
        streams.sort((a, b) => {
            // Priority order: direct cache > user owned > enhanced > cached > p2p fallback
            const getPriority = (stream) => {
                if (stream.behaviorHints.directCache) return 5;
                if (stream.behaviorHints.userOwned) return 4;
                if (stream.behaviorHints.enhancedCheck) return 3;
                if (stream.behaviorHints.p2pFallback) return 1;
                return 2; // regular cached content
            };

            const aPriority = getPriority(a);
            const bPriority = getPriority(b);
            
            if (aPriority !== bPriority) {
                return bPriority - aPriority;
            }
            
            // Same priority, sort by quality
            const qualityOrder = { '4K': 4, '2160p': 4, '1080p': 3, '720p': 2, '480p': 1 };
            const aQuality = qualityOrder[a.quality] || 0;
            const bQuality = qualityOrder[b.quality] || 0;
            
            if (aQuality !== bQuality) {
                return bQuality - aQuality;
            }
            
            return (b.size || 0) - (a.size || 0);
        });

        console.log(`[RealDebrid] Generated ${streams.length} Real-Debrid streams (prioritizing cached content)`);
        
        if (streams.length === 0) {
            console.log('[RealDebrid] No streams found, returning samples');
            return generateSampleRealDebridStreams(imdbId);
        }
        
        return streams;

    } catch (e) {
        console.error('[RealDebrid] Stream generation error:', e);
        return generateSampleRealDebridStreams(imdbId);
    }
}

// Generate Real-Debrid stream URL
async function generateRealDebridStreamUrl(torrentHash, fileId, apiKey) {
    try {
        // Step 1: Add magnet to Real-Debrid
        const magnetUrl = `magnet:?xt=urn:btih:${torrentHash}`;
        
        const addResponse = await robustFetch('https://api.real-debrid.com/rest/1.0/torrents/addMagnet', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: `magnet=${encodeURIComponent(magnetUrl)}`
        });
        
        if (!addResponse) return `realdebrid:${torrentHash}:${fileId}`;
        
        const addData = await addResponse.json();
        const torrentId = addData.id;
        
        // Step 2: Select files
        const selectResponse = await robustFetch(`https://api.real-debrid.com/rest/1.0/torrents/selectFiles/${torrentId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: `files=${fileId}`
        });
        
        if (!selectResponse) return `realdebrid:${torrentHash}:${fileId}`;
        
        // Step 3: Get torrent info and download link
        const infoResponse = await robustFetch(`https://api.real-debrid.com/rest/1.0/torrents/info/${torrentId}`, {
            headers: {
                'Authorization': `Bearer ${apiKey}`
            }
        });
        
        if (!infoResponse) return `realdebrid:${torrentHash}:${fileId}`;
        
        const infoData = await infoResponse.json();
        const file = infoData.files.find(f => f.id.toString() === fileId.toString());
        
        if (file && file.link) {
            // Step 4: Unrestrict the link
            const unrestrictResponse = await robustFetch('https://api.real-debrid.com/rest/1.0/unrestrict/link', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: `link=${encodeURIComponent(file.link)}`
            });
            
            if (unrestrictResponse) {
                const unrestrictData = await unrestrictResponse.json();
                return unrestrictData.download;
            }
        }
        
        return `realdebrid:${torrentHash}:${fileId}`;
        
    } catch (e) {
        console.error('[RealDebrid] Stream URL generation error:', e);
        return `realdebrid:${torrentHash}:${fileId}`;
    }
}

// Check if file is a video file
function isVideoFile(filename) {
    const videoExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.3gp'];
    const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
    return videoExtensions.includes(ext);
}

// Format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Generate sample Real-Debrid streams for testing
function generateSampleRealDebridStreams(imdbId) {
    // These are sample streams that simulate Real-Debrid cached content
    // In production, replace with actual Real-Debrid API results
    
    const movieTitle = getMovieTitleFromImdb(imdbId);
    
    return [
        {
            title: `RD 💾 ${movieTitle} 2160p 4K HDR REMUX`,
            url: `realdebrid:${generateSampleHash()}:1`,
            quality: '4K',
            size: 85000000000, // 85GB
            behaviorHints: {
                notWebReady: false,
                realDebrid: true,
                cached: true
            },
            infoHash: generateSampleHash()
        },
        {
            title: `RD 💾 ${movieTitle} 1080p BluRay x264`,
            url: `realdebrid:${generateSampleHash()}:1`,
            quality: '1080p',
            size: 8500000000, // 8.5GB
            behaviorHints: {
                notWebReady: false,
                realDebrid: true,
                cached: true
            },
            infoHash: generateSampleHash()
        },
        {
            title: `RD 💾 ${movieTitle} 720p BluRay x264`,
            url: `realdebrid:${generateSampleHash()}:1`,
            quality: '720p',
            size: 4500000000, // 4.5GB
            behaviorHints: {
                notWebReady: false,
                realDebrid: true,
                cached: true
            },
            infoHash: generateSampleHash()
        }
    ];
}

// Helper to detect quality from torrent name
function detectQuality(name) {
    const title = name.toLowerCase();
    
    if (title.includes('2160p') || title.includes('4k') || title.includes('uhd')) {
        return '4K';
    } else if (title.includes('1080p') || title.includes('fhd')) {
        return '1080p';
    } else if (title.includes('720p') || title.includes('hd')) {
        return '720p';
    } else if (title.includes('480p')) {
        return '480p';
    }
    
    return 'Unknown';
}

// Helper to get movie title from IMDb ID (simplified)
function getMovieTitleFromImdb(imdbId) {
    // This is a simplified version - in production you'd query TMDB/IMDb API
    const titleMap = {
        'tt0468569': 'The Dark Knight',
        'tt2911666': 'John Wick',
        // Add more as needed
    };
    
    return titleMap[imdbId] || 'Movie';
}

// Generate sample hash for testing
function generateSampleHash() {
    const chars = '0123456789abcdef';
    let hash = '';
    for (let i = 0; i < 40; i++) {
        hash += chars[Math.floor(Math.random() * chars.length)];
    }
    return hash;
}

// Search via Jackett API (if configured)
async function searchJackettTorrents(imdbId, movieData) {
    try {
        const jackettUrl = process.env.JACKETT_URL; // e.g., http://localhost:9117
        const jackettApiKey = process.env.JACKETT_API_KEY;
        
        if (!jackettUrl || !jackettApiKey) {
            console.log('[RealDebrid] Jackett not configured, skipping');
            return [];
        }
        
        const searchQuery = encodeURIComponent(movieData.title || movieData);
        const url = `${jackettUrl}/api/v2.0/indexers/all/results?apikey=${jackettApiKey}&Query=${searchQuery}&Category=2000,5000&Tracker[]=all`;
        
        const response = await robustFetch(url);
        if (!response) return [];
        
        const data = await response.json();
        const torrents = [];
        
        if (data.Results) {
            for (const torrent of data.Results) {
                const hash = torrent.MagnetUri?.match(/btih:([a-fA-F0-9]{40})/)?.[1];
                if (hash) {
                    torrents.push({
                        title: torrent.Title,
                        hash: hash,
                        size: torrent.Size,
                        quality: detectQuality(torrent.Title),
                        seeds: torrent.Seeders,
                        peers: torrent.Peers,
                        url: torrent.MagnetUri,
                        source: `Jackett-${torrent.Tracker}`
                    });
                }
            }
        }
        
        console.log(`[RealDebrid] Jackett found ${torrents.length} torrents from multiple indexers`);
        return torrents;
    } catch (e) {
        console.error('[RealDebrid] Jackett search error:', e);
        return [];
    }
}

// Search all available providers with enhanced error handling
async function searchAllTorrentProviders(imdbId, movieData) {
    const providers = [
        { name: 'YTS', fn: searchYTSTorrents, priority: 1 },
        { name: 'EZTV', fn: searchEZTVTorrents, priority: 2 },
        { name: 'RARBG', fn: searchRARBGTorrents, priority: 3 },
        { name: 'ThePirateBay', fn: searchThePirateBayTorrents, priority: 4 },
        { name: 'TorrentGalaxy', fn: searchTorrentGalaxy, priority: 5 },
        { name: 'NyaaSi', fn: searchNyaaSiTorrents, priority: 6 },
        { name: 'AniDex', fn: searchAniDexTorrents, priority: 7 },
        { name: 'Jackett', fn: searchJackettTorrents, priority: 8 },
        // Scraping-based providers (now enabled with simplified scraping)
        { name: '1337x', fn: search1337xTorrents, priority: 9, enabled: true },
        { name: 'KickassTorrents', fn: searchKickassTorrents, priority: 10, enabled: true },
        { name: 'MagnetDL', fn: searchMagnetDLTorrents, priority: 11, enabled: true },
        { name: 'HorribleSubs', fn: searchHorribleSubsTorrents, priority: 12, enabled: false },
        { name: 'TokyoTosho', fn: searchTokyoToshoTorrents, priority: 13, enabled: false },
        { name: 'Rutor', fn: searchRutorTorrents, priority: 14, enabled: false },
        { name: 'Rutracker', fn: searchRutrackerTorrents, priority: 15, enabled: false },
        { name: 'Comando', fn: searchComandoTorrents, priority: 16, enabled: false },
        { name: 'BluDV', fn: searchBluDVTorrents, priority: 17, enabled: false },
        { name: 'Torrent9', fn: searchTorrent9Torrents, priority: 18, enabled: false },
        { name: 'ilCorsaRoNeRo', fn: searchilCorsaRoNeRoTorrents, priority: 19, enabled: false },
        { name: 'MejorTorrent', fn: searchMejorTorrentTorrents, priority: 20, enabled: false },
        { name: 'Wolfmax4k', fn: searchWolfmax4kTorrents, priority: 21, enabled: false },
        { name: 'Cinecalidad', fn: searchCinecalidadTorrents, priority: 22, enabled: false },
        { name: 'BestTorrents', fn: searchBestTorrentsTorrents, priority: 23, enabled: false }
    ];
    
    // Filter enabled providers
    const enabledProviders = providers.filter(p => p.enabled !== false);
    
    console.log(`[RealDebrid] Searching ${enabledProviders.length} torrent providers (Torrentio-style)...`);
    
    // Execute searches in parallel with timeout
    const searchPromises = enabledProviders.map(provider => 
        Promise.race([
            provider.fn(imdbId, movieData),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error(`${provider.name} timeout`)), 10000)
            )
        ]).catch(err => {
            console.log(`[RealDebrid] ${provider.name} failed:`, err.message);
            return [];
        })
    );
    
    const results = await Promise.allSettled(searchPromises);
    const torrents = [];
    
    results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
            const providerResults = result.value;
            console.log(`[RealDebrid] ${enabledProviders[index].name}: ${providerResults.length} torrents`);
            torrents.push(...providerResults);
        }
    });
    
    return torrents;
}

// Search ThePirateBay API
async function searchThePirateBayTorrents(imdbId, movieData) {
    try {
        const searchQuery = encodeURIComponent(movieData.title || movieData);
        const mirrors = [
            'https://apibay.org/q.php',
            'https://tpb.party/api/search',
            'https://thepiratebay.org/api/search'
        ];
        
        for (const mirror of mirrors) {
            try {
                const url = `${mirror}?q=${searchQuery}&category=200,500`;
                
                const response = await robustFetch(url);
                if (!response) continue;
                
                const data = await response.json();
                const torrents = [];
                
                if (Array.isArray(data)) {
                    for (const torrent of data) {
                        if (torrent.info_hash) {
                            torrents.push({
                                title: torrent.name,
                                hash: torrent.info_hash,
                                size: torrent.size,
                                quality: detectQuality(torrent.name),
                                seeds: parseInt(torrent.seeders) || 0,
                                peers: parseInt(torrent.leechers) || 0,
                                url: `magnet:?xt=urn:btih:${torrent.info_hash}&dn=${encodeURIComponent(torrent.name)}`,
                                source: 'ThePirateBay'
                            });
                        }
                    }
                }
                
                console.log(`[RealDebrid] ThePirateBay found ${torrents.length} torrents`);
                return torrents.slice(0, 10);
            } catch (e) {
                console.error(`[RealDebrid] ThePirateBay mirror ${mirror} error:`, e);
                continue;
            }
        }
        
        return [];
    } catch (e) {
        console.error('[RealDebrid] ThePirateBay search error:', e);
        return [];
    }
}

// Search TorrentGalaxy
async function searchTorrentGalaxy(imdbId, movieData) {
    try {
        const searchQuery = encodeURIComponent(movieData.title || movieData);
        const url = `https://torrentgalaxy.to/torrents.php?search=${searchQuery}&sort=seeders&order=desc&page=0`;
        
        console.log(`[RealDebrid] Searching TorrentGalaxy for: ${searchQuery}`);
        
        const response = await robustFetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        if (!response) return [];
        
        const html = await response.text();
        const torrents = [];
        
        // Parse TorrentGalaxy HTML structure
        const rows = html.split('<tr>');
        
        for (const row of rows) {
            if (row.includes('magnet:') || row.includes('torrent')) {
                const nameMatch = row.match(/<a[^>]*href="[^"]*torrent[^"]*"[^>]*>([^<]+)<\/a>/);
                const magnetMatch = row.match(/magnet:\?[^"'>\s]+/);
                const sizeMatch = row.match(/<span[^>]*class="[^"]*size[^"]*"[^>]*>([^<]+)<\/span>/);
                const seedMatch = row.match(/<span[^>]*class="[^"]*text-green[^"]*"[^>]*>(\d+)<\/span>/);
                const peerMatch = row.match(/<span[^>]*class="[^"]*text-red[^"]*"[^>]*>(\d+)<\/span>/);
                
                if (nameMatch && magnetMatch) {
                    const title = nameMatch[1].trim();
                    const magnetUrl = magnetMatch[0];
                    const hash = extractHashFromMagnet(magnetUrl);
                    const seeds = seedMatch ? parseInt(seedMatch[1]) : 0;
                    const peers = peerMatch ? parseInt(peerMatch[1]) : 0;
                    const size = sizeMatch ? sizeMatch[1].trim() : 'Unknown';
                    
                    if (hash) {
                        torrents.push({
                            title: title,
                            hash: hash,
                            size: size,
                            quality: detectQuality(title),
                            seeds: seeds,
                            peers: peers,
                            url: magnetUrl,
                            source: 'TorrentGalaxy'
                        });
                    }
                }
            }
        }
        
        console.log(`[RealDebrid] TorrentGalaxy found ${torrents.length} torrents`);
        return torrents.slice(0, 10);
    } catch (e) {
        console.error('[RealDebrid] TorrentGalaxy search error:', e);
        return [];
    }
}

// Placeholder functions for remaining providers
async function searchRutrackerTorrents(imdbId, movieData) {
    console.log(`[RealDebrid] Rutracker search not implemented (requires Russian support)`);
    return [];
}

async function searchComandoTorrents(imdbId, movieData) {
    console.log(`[RealDebrid] Comando search not implemented (requires Portuguese support)`);
    return [];
}

async function searchBluDVTorrents(imdbId, movieData) {
    console.log(`[RealDebrid] BluDV search not implemented (requires Italian support)`);
    return [];
}

async function searchTorrent9Torrents(imdbId, movieData) {
    console.log(`[RealDebrid] Torrent9 search not implemented (requires French support)`);
    return [];
}

async function searchilCorsaRoNeRoTorrents(imdbId, movieData) {
    console.log(`[RealDebrid] ilCorsaRoNeRo search not implemented (requires Italian support)`);
    return [];
}

async function searchMejorTorrentTorrents(imdbId, movieData) {
    console.log(`[RealDebrid] MejorTorrent search not implemented (requires Spanish support)`);
    return [];
}

async function searchWolfmax4kTorrents(imdbId, movieData) {
    console.log(`[RealDebrid] Wolfmax4k search not implemented (requires German support)`);
    return [];
}

async function searchCinecalidadTorrents(imdbId, movieData) {
    console.log(`[RealDebrid] Cinecalidad search not implemented (requires Spanish support)`);
    return [];
}

async function searchBestTorrentsTorrents(imdbId, movieData) {
    console.log(`[RealDebrid] BestTorrents search not implemented (requires scraping framework)`);
    return [];
}

// ...existing code...
module.exports = {
    searchRealDebridTorrents,
    checkRealDebridInstantAvailability,
    generateRealDebridStreams,
    generateSampleRealDebridStreams,
    getMovieMetadata,
    searchRealDebridCachedContent,
    getRealDebridUserTorrents,
    checkRealDebridInstantAvailabilityEnhanced,
    searchYTSTorrents,
    searchEZTVTorrents,
    searchRARBGTorrents,
    search1337xTorrents,
    searchThePirateBayTorrents,
    searchKickassTorrents,
    searchTorrentGalaxy,
    searchMagnetDLTorrents,
    searchHorribleSubsTorrents,
    searchNyaaSiTorrents,
    searchTokyoToshoTorrents,
    searchAniDexTorrents,
    searchRutorTorrents,
    searchRutrackerTorrents,
    searchComandoTorrents,
    searchBluDVTorrents,
    searchTorrent9Torrents,
    searchilCorsaRoNeRoTorrents,
    searchMejorTorrentTorrents,
    searchWolfmax4kTorrents,
    searchCinecalidadTorrents,
    searchBestTorrentsTorrents,
    searchJackettTorrents,
    searchAllTorrentProviders,
    generateRealDebridStreamUrl,
    isVideoFile,
    formatFileSize
};
