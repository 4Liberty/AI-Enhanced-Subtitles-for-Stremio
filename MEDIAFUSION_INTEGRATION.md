# MediaFusion Integration Enhancement

## Overview

This document describes the integration of MediaFusion addon patterns into our Stremio AI Subtitle Corrector & Real-Debrid addon to improve streaming performance, reliability, and user experience.

## MediaFusion Architecture Analysis

After analyzing the [MediaFusion addon](https://github.com/mhdzumair/MediaFusion), we've identified several key architectural patterns and implemented them in our addon:

### Key MediaFusion Patterns Implemented

1. **Abstract Debrid Client Architecture**
   - Base `DebridClient` class with common functionality
   - Service-specific error handling
   - Proper timeout management (15 seconds like MediaFusion)
   - Token management and authentication

2. **Enhanced Real-Debrid Integration**
   - Improved status polling with `wait_for_status` method
   - Better file selection logic
   - Proper error handling for different torrent states
   - Support for both OAuth and private token authentication

3. **Stream Enrichment System**
   - Quality detection (4K, 1080p, 720p, etc.)
   - Codec information extraction (H.265, H.264, Dolby Atmos, etc.)
   - Source classification (BluRay, WEB-DL, WEBRip, etc.)
   - HDR and Dolby Vision detection

4. **Provider Management**
   - Multi-provider support with fallback
   - Health monitoring and automatic provider disabling
   - Cache statistics and performance tracking
   - Unified API across different streaming services

## New Components

### 1. Enhanced Real-Debrid Client (`lib/realDebridSearch.js`)

```javascript
class RealDebridClient {
  constructor(token, userIP = null) {
    this.token = token;
    this.userIP = userIP;
    this.timeout = 15000; // MediaFusion standard
  }

  async waitForStatus(torrentId, targetStatus, maxRetries = 10, retryInterval = 2) {
    // Enhanced status polling with proper error handling
  }

  async createStreamingURL(infoHash, magnetLink, filename, season, episode) {
    // Comprehensive streaming URL creation with file selection
  }
}
```

### 2. Streaming Provider Manager (`lib/streamingProviderManager.js`)

```javascript
class StreamingProviderManager {
  async searchCachedContent(query, options = {}) {
    // Search across multiple providers with fallback
  }

  async createStreamingURL(infoHash, magnetLink, options = {}) {
    // Create streaming URLs with provider fallback
  }

  async healthCheck() {
    // Monitor provider health and disable problematic ones
  }
}
```

### 3. Stream Enricher (`lib/streamEnricher.js`)

```javascript
class StreamEnricher {
  async enrichStream(stream, options = {}) {
    // Add quality, codec, and availability information
  }

  extractQuality(stream) {
    // Enhanced quality detection with HDR/Dolby Vision
  }

  calculateQualityScore(resolution, source, hdr, dolbyVision) {
    // Quality scoring for stream sorting
  }
}
```

## API Enhancements

### New Endpoints

1. **`/api/health`** - Comprehensive health monitoring
2. **`/api/providers/status`** - Provider cache statistics
3. **`/api/providers/health`** - Provider health check
4. **`/api/search/cached`** - Search cached content
5. **`/api/streams/enrich`** - Stream enrichment service

### Enhanced Stream Handler

The stream handler now:
- Uses MediaFusion-inspired architecture for better performance
- Provides enriched stream information
- Supports quality scoring and sorting
- Includes comprehensive error handling
- Offers fallback mechanisms

## Quality Detection System

### Resolution Detection
- 4K/2160p/UHD
- 1080p/FHD
- 720p/HD
- 480p/SD

### Source Classification
- BluRay (highest quality)
- WEB-DL (direct download)
- WEBRip (web capture)
- HDTV (television broadcast)
- DVDRip (DVD source)
- CAM (camera recording)

### Advanced Features
- HDR/HDR10 detection
- Dolby Vision support
- Codec identification (H.265, H.264, AV1)
- Audio format detection (Dolby Atmos, DTS-HD, etc.)

## Error Handling & Resilience

### MediaFusion-Inspired Error Handling

1. **Service-Specific Errors**
   - Real-Debrid: Permission denied, IP restrictions, rate limiting
   - Proper error codes and user-friendly messages
   - Automatic retry with exponential backoff

2. **Provider Health Monitoring**
   - Automatic provider disabling after multiple failures
   - Health check endpoints for monitoring
   - Graceful degradation with fallback providers

3. **Timeout Management**
   - 15-second timeout for API requests (MediaFusion standard)
   - 60-second timeout for subtitle processing
   - Proper request cancellation

## Caching & Performance

### Enhanced Caching Strategy

1. **Stream Enrichment Cache**
   - 30-minute cache for enriched streams
   - LRU eviction with 1000 item limit
   - Cache key based on stream and options

2. **Provider Cache**
   - Cached search results
   - Provider status caching
   - Performance metrics storage

## Configuration

### Environment Variables

```bash
# Required
REAL_DEBRID_API_KEY=your_api_key_here
SUBDL_API_KEY=your_subdl_key
OPENSUBTITLES_API_KEY=your_opensubtitles_key
GEMINI_API_KEY=your_gemini_key

# Optional
USER_IP=your_ip_address  # For Real-Debrid IP restrictions
TMDB_API_KEY=your_tmdb_key
```

## Benefits of MediaFusion Integration

1. **Better Performance**
   - Faster stream resolution
   - Efficient caching
   - Reduced API calls

2. **Enhanced Reliability**
   - Multiple provider support
   - Automatic fallback
   - Comprehensive error handling

3. **Improved User Experience**
   - Better quality detection
   - Detailed stream information
   - Faster loading times

4. **Developer Experience**
   - Comprehensive monitoring
   - Detailed logging
   - API endpoints for debugging

## Monitoring & Debugging

### Health Monitoring
- Provider status tracking
- Error rate monitoring
- Performance metrics
- Cache statistics

### Debugging Endpoints
- `/api/health` - System health
- `/api/providers/status` - Provider details
- `/api/search/cached` - Cache search testing
- `/api/streams/enrich` - Stream enrichment testing

## Future Enhancements

1. **Additional Providers**
   - Premiumize support
   - AllDebrid integration
   - Debrid-Link support

2. **Advanced Features**
   - User data encryption
   - Watchlist synchronization
   - Advanced stream filtering

3. **Performance Optimizations**
   - Redis caching
   - Database integration
   - Async processing queue

## Usage Examples

### Search Cached Content
```bash
curl "http://localhost:7000/api/search/cached?query=Avatar&type=movie&maxResults=10"
```

### Check Provider Health
```bash
curl "http://localhost:7000/api/providers/health"
```

### Enrich Streams
```bash
curl -X POST "http://localhost:7000/api/streams/enrich" \
  -H "Content-Type: application/json" \
  -d '{"streams": [{"title": "Movie 1080p", "infoHash": "abc123"}]}'
```

## Conclusion

The MediaFusion integration significantly enhances our addon's capabilities by providing:
- Robust streaming provider management
- Enhanced quality detection and stream enrichment
- Comprehensive error handling and monitoring
- Better performance and reliability
- Scalable architecture for future enhancements

This architecture provides a solid foundation for continued development and ensures our addon can compete with modern streaming solutions while maintaining reliability and performance.
