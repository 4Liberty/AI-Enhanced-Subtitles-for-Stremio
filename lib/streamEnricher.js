// lib/streamEnricher.js
// Actively enriches streams with Turkish subtitle match info for Stremio.

const { getSubtitleUrlsForStremio } = require('./subtitleMatcher');
const { streamingManager } = require('./streamingProviderManager');

/**
 * Enriches a list of streams with Turkish subtitle info.
 * @param {string} type - The type of content (movie, series, etc.)
 * @param {string} id - The Stremio ID (tt... or tmdb:...)
 * @param {Array} streams - Array of stream objects to enrich
 * @returns {Promise<Array>} - Streams with .subtitles property (if found)
 */
async function getEnrichedStreams(type, id, streams) {
    try {
        if (!Array.isArray(streams)) return [];
        
        // Get AI and language settings from environment
        const aiEnabled = process.env.AI_ENABLED !== 'false';
        const primaryLanguage = process.env.PRIMARY_LANGUAGE || 'tr';
        
        // Deep clone input to avoid mutation
        const safeStreams = streams.map(s => (typeof s === 'object' && s !== null) ? JSON.parse(JSON.stringify(s)) : {});
        const enriched = await Promise.all(safeStreams.map(async (stream, idx) => {
            try {
                // Validate stream structure
                if (typeof stream !== 'object' || stream === null) {
                    console.error(`[StreamEnricher] Malformed stream at index ${idx}:`, stream);
                    return {
                        subtitles: [{ id: 'fallback-tr', lang: primaryLanguage, url: '', behaviorHints: { notWebReady: true, fallback: true }, name: '[Subtitle unavailable]' }],
                        error: 'Malformed stream object.'
                    };
                }
                
                // Always ensure subtitles property exists and is an array
                stream.subtitles = [];
                let lastError = null;
                
                if (stream.infoHash || stream.url) {
                    for (let attempt = 0; attempt < 3; attempt++) {
                        try {
                            const subResult = await getSubtitleUrlsForStremio(id, stream.infoHash);
                            if (subResult && Array.isArray(subResult.subtitles) && subResult.subtitles.length > 0) {
                                // Sanitize subtitle objects
                                stream.subtitles = subResult.subtitles.map(sub => ({
                                    id: typeof sub.id === 'string' ? sub.id : 'unknown',
                                    lang: sub.lang || primaryLanguage,
                                    url: typeof sub.url === 'string' ? sub.url : '',
                                    behaviorHints: typeof sub.behaviorHints === 'object' && sub.behaviorHints !== null ? sub.behaviorHints : {},
                                    name: typeof sub.name === 'string' ? sub.name : undefined
                                }));
                                break;
                            }
                        } catch (err) {
                            lastError = err;
                            console.error(`[StreamEnricher] Attempt ${attempt + 1} failed:`, err);
                        }
                    }
                    
                    if (!Array.isArray(stream.subtitles) || stream.subtitles.length === 0) {
                        stream.subtitles = [{
                            id: 'fallback-tr',
                            lang: primaryLanguage,
                            url: '',
                            behaviorHints: { notWebReady: true, fallback: true },
                            name: '[Subtitle unavailable]'
                        }];
                        
                        if (lastError) {
                            stream.error = `Subtitle enrichment failed: ${lastError && lastError.message ? lastError.message : lastError}`;
                            console.error(`[StreamEnricher] Subtitle enrichment failed for stream:`, lastError);
                        }
                    }
                } else {
                    // No hash/url available, provide fallback
                    stream.subtitles = [{
                        id: 'fallback-tr',
                        lang: primaryLanguage,
                        url: '',
                        behaviorHints: { notWebReady: true, fallback: true },
                        name: '[No hash available for subtitle matching]'
                    }];
                }
                
                // Final output sanitization
                if (!Array.isArray(stream.subtitles)) stream.subtitles = [];
                return stream;
            } catch (err) {
                console.error(`[StreamEnricher] Unexpected error in stream enrichment at index ${idx}:`, err);
                return {
                    subtitles: [{ id: 'fallback-tr', lang: primaryLanguage, url: '', behaviorHints: { notWebReady: true, fallback: true }, name: '[Subtitle unavailable]' }],
                    error: 'Unexpected error in stream enrichment.'
                };
            }
        }));
        
        // Always return a valid array
        if (!Array.isArray(enriched)) return [];
        return enriched;
    } catch (err) {
        console.error('[StreamEnricher] CRITICAL: getEnrichedStreams failed:', err);
        return [];
    }
}

class StreamEnricher {
  constructor() {
    this.cache = new Map();
    this.cacheExpiry = 30 * 60 * 1000; // 30 minutes cache
    this.maxCacheSize = 1000;
  }

  // Enhanced stream enrichment with MediaFusion patterns
  async enrichStream(stream, options = {}) {
    const {
      preferredProvider = null,
      enableFallback = true,
      includeSubtitles = true,
      userIP = null
    } = options;

    try {
      // Check cache first
      const cacheKey = this.getCacheKey(stream, options);
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        return cached;
      }

      const enrichedStream = { ...stream };

      // Add streaming provider information
      if (stream.infoHash || stream.magnetLink) {
        const streamingInfo = await this.getStreamingInfo(stream, options);
        enrichedStream.streaming = streamingInfo;
      }

      // Add quality information
      enrichedStream.quality = this.extractQuality(stream);

      // Add codec information
      enrichedStream.codec = this.extractCodec(stream);

      // Add size information
      enrichedStream.size = this.formatSize(stream.size);

      // Add availability status
      enrichedStream.availability = await this.checkAvailability(stream, options);

      // Add subtitle information if enabled
      if (includeSubtitles) {
        enrichedStream.subtitles = await this.getSubtitleInfo(stream, options);
      }

      // Add metadata
      enrichedStream.metadata = {
        enriched: true,
        enrichedAt: new Date().toISOString(),
        provider: streamingInfo?.provider || 'unknown',
        cached: streamingInfo?.cached || false
      };

      // Cache the result
      this.saveToCache(cacheKey, enrichedStream);

      return enrichedStream;

    } catch (error) {
      console.error('Stream enrichment error:', error);
      
      // Return original stream with error info
      return {
        ...stream,
        error: error.message,
        metadata: {
          enriched: false,
          enrichedAt: new Date().toISOString(),
          error: error.message
        }
      };
    }
  }

  // Get streaming information from providers
  async getStreamingInfo(stream, options = {}) {
    if (!stream.infoHash && !stream.magnetLink) {
      return null;
    }

    try {
      // Search for cached content first
      const cachedSearch = await streamingManager.searchCachedContent(
        stream.title || stream.name || '',
        {
          type: stream.type || 'movie',
          maxResults: 10
        }
      );

      let cached = false;
      let provider = null;

      // Check if stream is cached
      if (cachedSearch.success) {
        for (const providerResult of cachedSearch.providers) {
          if (providerResult.success && providerResult.results.length > 0) {
            const match = providerResult.results.find(result => 
              result.hash === stream.infoHash || 
              result.filename.includes(stream.title || '')
            );
            if (match) {
              cached = true;
              provider = providerResult.provider;
              break;
            }
          }
        }
      }

      // Try to create streaming URL if we have required info
      let streamUrl = null;
      if (stream.infoHash && stream.magnetLink) {
        const streamResult = await streamingManager.createStreamingURL(
          stream.infoHash,
          stream.magnetLink,
          {
            filename: stream.filename || null,
            season: stream.season || null,
            episode: stream.episode || null,
            preferredProvider: options.preferredProvider
          }
        );

        if (streamResult.success) {
          streamUrl = streamResult.streamUrl;
          provider = streamResult.provider;
        }
      }

      return {
        cached,
        provider,
        streamUrl,
        available: !!streamUrl,
        searchResults: cachedSearch.totalResults
      };

    } catch (error) {
      console.error('Error getting streaming info:', error);
      return {
        cached: false,
        provider: null,
        streamUrl: null,
        available: false,
        error: error.message
      };
    }
  }

  // Enhanced quality extraction
  extractQuality(stream) {
    const title = (stream.title || stream.name || '').toLowerCase();
    const filename = (stream.filename || '').toLowerCase();
    const text = `${title} ${filename}`;

    // HDR/Dolby Vision detection
    const hdr = /\b(hdr|hdr10|dolby.vision|dv)\b/i.test(text);
    const dolbyVision = /\b(dolby.vision|dv)\b/i.test(text);

    // Resolution detection with enhanced patterns
    let resolution = 'Unknown';
    if (/\b(4k|2160p|uhd)\b/i.test(text)) {
      resolution = '4K';
    } else if (/\b(1080p|fhd)\b/i.test(text)) {
      resolution = '1080p';
    } else if (/\b(720p|hd)\b/i.test(text)) {
      resolution = '720p';
    } else if (/\b(480p|sd)\b/i.test(text)) {
      resolution = '480p';
    }

    // Source detection
    let source = 'Unknown';
    if (/\b(bluray|blu-ray|bd)\b/i.test(text)) {
      source = 'BluRay';
    } else if (/\b(webrip|web-rip)\b/i.test(text)) {
      source = 'WEBRip';
    } else if (/\b(webdl|web-dl)\b/i.test(text)) {
      source = 'WEB-DL';
    } else if (/\b(hdtv)\b/i.test(text)) {
      source = 'HDTV';
    } else if (/\b(dvdrip|dvd)\b/i.test(text)) {
      source = 'DVDRip';
    } else if (/\b(cam|ts|tc)\b/i.test(text)) {
      source = 'CAM';
    }

    return {
      resolution,
      source,
      hdr,
      dolbyVision,
      score: this.calculateQualityScore(resolution, source, hdr, dolbyVision)
    };
  }

  // Calculate quality score for sorting
  calculateQualityScore(resolution, source, hdr, dolbyVision) {
    let score = 0;

    // Resolution scores
    switch (resolution) {
      case '4K': score += 100; break;
      case '1080p': score += 80; break;
      case '720p': score += 60; break;
      case '480p': score += 40; break;
    }

    // Source scores
    switch (source) {
      case 'BluRay': score += 20; break;
      case 'WEB-DL': score += 18; break;
      case 'WEBRip': score += 16; break;
      case 'HDTV': score += 14; break;
      case 'DVDRip': score += 12; break;
      case 'CAM': score += 5; break;
    }

    // HDR bonus
    if (hdr) score += 10;
    if (dolbyVision) score += 15;

    return score;
  }

  // Enhanced codec extraction
  extractCodec(stream) {
    const title = (stream.title || stream.name || '').toLowerCase();
    const filename = (stream.filename || '').toLowerCase();
    const text = `${title} ${filename}`;

    // Video codec detection
    let video = 'Unknown';
    if (/\b(h265|hevc|x265)\b/i.test(text)) {
      video = 'H.265/HEVC';
    } else if (/\b(h264|avc|x264)\b/i.test(text)) {
      video = 'H.264/AVC';
    } else if (/\b(av1)\b/i.test(text)) {
      video = 'AV1';
    } else if (/\b(vp9)\b/i.test(text)) {
      video = 'VP9';
    }

    // Audio codec detection
    let audio = 'Unknown';
    if (/\b(atmos|dolby.atmos)\b/i.test(text)) {
      audio = 'Dolby Atmos';
    } else if (/\b(truehd|dolby.truehd)\b/i.test(text)) {
      audio = 'Dolby TrueHD';
    } else if (/\b(dts-hd|dts.hd)\b/i.test(text)) {
      audio = 'DTS-HD';
    } else if (/\b(dts-x|dtsx)\b/i.test(text)) {
      audio = 'DTS:X';
    } else if (/\b(ac3|dolby.digital)\b/i.test(text)) {
      audio = 'Dolby Digital';
    } else if (/\b(aac)\b/i.test(text)) {
      audio = 'AAC';
    }

    return { video, audio };
  }

  // Format file size
  formatSize(bytes) {
    if (!bytes) return 'Unknown';
    
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 B';
    
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const size = (bytes / Math.pow(1024, i)).toFixed(2);
    
    return `${size} ${sizes[i]}`;
  }

  // Check stream availability
  async checkAvailability(stream, options = {}) {
    try {
      if (!stream.infoHash && !stream.magnetLink) {
        return { available: false, reason: 'No hash or magnet link' };
      }

      // Check with streaming providers
      const healthCheck = await streamingManager.healthCheck();
      const availableProviders = Object.keys(healthCheck).filter(
        provider => healthCheck[provider].healthy
      );

      if (availableProviders.length === 0) {
        return { available: false, reason: 'No healthy providers' };
      }

      // Quick availability check
      const cachedSearch = await streamingManager.searchCachedContent(
        stream.title || stream.name || '',
        { type: stream.type || 'movie', maxResults: 5 }
      );

      const cached = cachedSearch.success && cachedSearch.totalResults > 0;

      return {
        available: true,
        cached,
        providers: availableProviders,
        searchResults: cachedSearch.totalResults
      };

    } catch (error) {
      return {
        available: false,
        reason: error.message
      };
    }
  }

  // Get subtitle information
  async getSubtitleInfo(stream, options = {}) {
    // This would integrate with subtitle services
    // For now, return basic info
    return {
      available: false,
      languages: [],
      sources: []
    };
  }

  // Cache management
  getCacheKey(stream, options) {
    return `${stream.infoHash || stream.magnetLink || stream.title}_${JSON.stringify(options)}`;
  }

  getFromCache(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      return cached.data;
    }
    this.cache.delete(key);
    return null;
  }

  saveToCache(key, data) {
    // Clean old entries if cache is full
    if (this.cache.size >= this.maxCacheSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  // Enrich multiple streams
  async enrichStreams(streams, options = {}) {
    const enrichedStreams = [];
    
    // Process in batches to avoid overwhelming the providers
    const batchSize = 10;
    for (let i = 0; i < streams.length; i += batchSize) {
      const batch = streams.slice(i, i + batchSize);
      const enrichedBatch = await Promise.all(
        batch.map(stream => this.enrichStream(stream, options))
      );
      enrichedStreams.push(...enrichedBatch);
    }

    // Sort by quality score
    return enrichedStreams.sort((a, b) => {
      const scoreA = a.quality?.score || 0;
      const scoreB = b.quality?.score || 0;
      return scoreB - scoreA;
    });
  }
}

// Create singleton instance
const streamEnricher = new StreamEnricher();

module.exports = {
  StreamEnricher,
  streamEnricher,
  getEnrichedStreams
};