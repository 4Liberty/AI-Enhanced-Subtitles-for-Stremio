# Stremio Subtitle Addon Debug Status

## Current Issues Identified

### 1. Missing API Keys
- `SUBDL_API_KEY` - **REQUIRED** for SubDL subtitle source
- `OPENSUBTITLES_API_KEY` - **REQUIRED** for OpenSubtitles fallback
- `GEMINI_API_KEY` - **REQUIRED** for AI subtitle correction

### 2. Subtitle Sources Status
- **SubDL**: Not working (missing API key)
- **Podnapisi**: Disabled (returning HTML instead of JSON)
- **OpenSubtitles**: Not working (missing API key)
- **Test Mode**: Added for debugging when API keys are missing

### 3. Stremio Integration Status
- ✅ Addon installation works
- ✅ Stream requests work (pre-caching)
- ✅ Subtitle endpoints added
- ❌ Subtitles don't appear in Stremio UI

## Changes Made

### Server.js
- Added comprehensive API key checking and warnings
- Added missing subtitle endpoints: `/subtitles/:type/:id` and `/subtitles/:type/:id.json`
- Enhanced logging for all requests
- Added test subtitle support for debugging

### lib/subtitleMatcher.js
- Added detailed logging for all subtitle sources
- Temporarily disabled Podnapisi (API issues)
- Added comprehensive error handling
- Added test subtitle mode when no API keys are available

## How to Test

1. **Set up API keys** (required for production):
   ```bash
   export SUBDL_API_KEY="your_subdl_api_key"
   export OPENSUBTITLES_API_KEY="your_opensubtitles_api_key"
   export GEMINI_API_KEY="your_gemini_api_key"
   ```

2. **Test without API keys** (debugging mode):
   ```bash
   node server.js
   node test-endpoints.js
   ```

3. **Install in Stremio**:
   - Go to http://localhost:7000/configure
   - Copy the install URL
   - Install in Stremio
   - Test with a movie

## Next Steps

1. **Get API keys** for all services
2. **Test subtitle sources** individually
3. **Debug why Stremio doesn't show subtitles** even with test mode
4. **Fix Podnapisi API integration** (currently disabled)
5. **Optimize AI subtitle correction** performance

## API Key Sources

- **SubDL**: https://subdl.com/api
- **OpenSubtitles**: https://opensubtitles.com/api
- **Gemini**: https://ai.google.dev/
