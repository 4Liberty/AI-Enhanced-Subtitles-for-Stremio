# Beautiful UI Documentation

## Overview

The VLC Subtitle & Real-Debrid Extension now includes a comprehensive, modern web interface with advanced health monitoring and settings management.

## Features

### 🎨 Modern Design
- **Dark Theme**: Professional dark theme with smooth animations
- **Responsive Layout**: Works perfectly on desktop, tablet, and mobile
- **Accessibility**: Full keyboard navigation and screen reader support
- **Performance**: Optimized for fast loading and smooth interactions

### 📊 Dashboard
- **Real-time Statistics**: Live metrics for processed subtitles, found torrents, and system health
- **System Status**: Monitor subtitle services, Real-Debrid, torrent providers, and API keys
- **Recent Activity**: Live activity feed with timestamped events
- **Performance Metrics**: Response time, memory usage, and success rate monitoring

### 📝 Subtitle Management
- **Source Status**: Monitor OpenSubtitles, SubDL, and AI correction services
- **Language Settings**: Configure primary and fallback languages
- **AI Correction**: Enable/disable and configure AI-powered subtitle enhancement
- **Test Interface**: Built-in subtitle search testing with IMDb ID input

### 🌐 Torrent Provider Management
- **20+ Providers**: Support for YTS, EZTV, RARBG, 1337x, KickassTorrents, and more
- **API & Scraping**: Visual indicators for API-based vs web scraping providers
- **Real-time Status**: Live health monitoring for each provider
- **Test Interface**: Built-in torrent search testing with quality filters

### 💚 Advanced Health Monitoring
- **Health Score**: Overall system health with visual scoring (0-100)
- **Detailed Checks**: Individual status for APIs, services, and providers
- **Performance Charts**: Real-time charts for response time and success rate
- **Error Logging**: Comprehensive error tracking with timestamps and severity levels

### ⚙️ Comprehensive Settings
- **API Key Management**: Secure input for all API keys with visibility toggle
- **Advanced Configuration**: Debug mode, scraping control, concurrency limits
- **Backup & Restore**: Export/import configuration for easy migration
- **Auto-save**: Settings are automatically saved on change

## URL Structure

### Main Interface
- **Control Panel**: `/ui` - Main interface
- **Health Dashboard**: `/ui#health` - Health monitoring tab
- **Settings**: `/ui#settings` - Configuration management

### API Endpoints
- **Stats**: `/api/stats` - Current system statistics
- **Health**: `/api/health/detailed` - Comprehensive health data
- **Providers**: `/api/torrents/providers` - Torrent provider status
- **Real-Debrid**: `/api/realdebrid/status` - Real-Debrid account info
- **Testing**: `/api/subtitles/test` & `/api/torrents/test` - Test endpoints

## Navigation

### Dashboard Tab
- **Quick Stats**: Processed subtitles, found torrents, active providers, uptime
- **System Status**: Real-time health indicators for all services
- **Recent Activity**: Live feed of system activities and events
- **Performance**: Memory usage, response time, and success rate metrics

### Subtitles Tab
- **Sources**: OpenSubtitles, SubDL, AI correction, and local cache status
- **Languages**: Primary and fallback language configuration
- **AI Settings**: Model selection and correction intensity
- **Testing**: Search test interface with IMDb ID input

### Torrents Tab
- **Real-Debrid**: API status, account type, expiration, and traffic
- **Providers**: 20+ torrent providers with API/scraping indicators
- **Testing**: Search test with quality filtering
- **Cache**: Statistics and clearing functionality

### Health Tab
- **Overview**: Health score with detailed breakdown
- **Detailed Checks**: Individual service status monitoring
- **Performance**: Real-time charts and metrics
- **Error Logs**: Comprehensive error tracking with export

### Settings Tab
- **API Keys**: Secure management of all API credentials
- **Advanced**: Debug mode, scraping, caching, and performance settings
- **Backup**: Export and import configuration files

## Health Monitoring

### System Health Score
- **100%**: All services operational, all APIs configured
- **70-99%**: Minor issues or missing optional APIs
- **40-69%**: Significant issues affecting functionality
- **0-39%**: Critical failures requiring immediate attention

### Service Status Indicators
- **🟢 Green**: Service is healthy and operational
- **🟡 Yellow**: Service has warnings or is partially functional
- **🔴 Red**: Service is down or has critical errors
- **⚪ Gray**: Service status unknown or checking

### Real-time Monitoring
- **Auto-refresh**: Dashboard updates every 10 seconds
- **Performance Tracking**: Response time and success rate history
- **Error Tracking**: Automatic error logging with severity levels
- **Activity Feed**: Live activity stream with timestamps

## Provider Management

### API-Based Providers
- **YTS**: High-quality movies with direct API access
- **EZTV**: TV shows and movies via API
- **RARBG**: Movies and TV using mirror sites
- **ThePirateBay**: General torrents via API
- **TorrentGalaxy**: Movies and TV content
- **Nyaa.si**: Anime and Asian content
- **AniDex**: Anime torrents
- **Jackett**: Meta-search across 100+ sites (optional)

### Web Scraping Providers
- **1337x**: General torrents via HTML parsing
- **KickassTorrents**: General torrents with mirror support
- **MagnetDL**: Magnet links extraction
- **Regional Providers**: Framework ready for Rutor, Torrent9, etc.

### Provider Status
- **Healthy**: Provider is operational and returning results
- **Warning**: Provider has issues or requires configuration
- **Error**: Provider is down or unreachable
- **Framework Ready**: Provider support implemented but not enabled

## Configuration Management

### API Key Setup
1. **Google Gemini**: Visit https://ai.google.dev/ for AI correction
2. **OpenSubtitles**: Visit https://opensubtitles.com/api for subtitles
3. **TMDB**: Visit https://themoviedb.org/settings/api for movie data
4. **SubDL**: Visit https://subdl.com/api for subtitle backup
5. **Real-Debrid**: Visit https://real-debrid.com/api for torrent streaming
6. **Jackett**: Local installation for meta-search (optional)

### Settings Persistence
- **Local Storage**: Settings saved in browser localStorage
- **Auto-save**: Changes saved automatically on input
- **Export/Import**: JSON configuration files for backup/migration
- **Environment Variables**: Server-side environment variable support

## Testing Features

### Subtitle Testing
- **IMDb ID Input**: Test with specific movie/show identifiers
- **Language Selection**: Test different subtitle languages
- **Source Testing**: Verify OpenSubtitles and SubDL connectivity
- **AI Testing**: Test AI correction functionality

### Torrent Testing
- **IMDb ID Input**: Test with specific movie/show identifiers
- **Quality Filtering**: Test specific quality requirements
- **Provider Testing**: Verify individual provider functionality
- **Real-Debrid Testing**: Test cached torrent availability

## Performance Optimization

### Caching
- **Subtitle Caching**: Cached subtitles for faster access
- **Provider Caching**: Cached provider responses
- **Health Caching**: Cached health check results
- **Settings Caching**: Cached configuration data

### Resource Management
- **Memory Monitoring**: Real-time memory usage tracking
- **Request Limiting**: Configurable concurrent request limits
- **Timeout Management**: Configurable request timeouts
- **Error Recovery**: Automatic retry and fallback mechanisms

## Troubleshooting

### Common Issues

#### API Keys Not Working
1. Verify API key format and validity
2. Check service-specific documentation
3. Test individual API endpoints
4. Review error logs for authentication issues

#### Providers Not Responding
1. Check internet connectivity
2. Verify provider website accessibility
3. Review scraping provider status
4. Check timeout settings

#### Health Score Low
1. Review individual service status
2. Check API key configuration
3. Verify provider connectivity
4. Review error logs for issues

#### Performance Issues
1. Check memory usage metrics
2. Review concurrent request limits
3. Verify timeout settings
4. Clear cache if needed

### Support Resources
- **Error Logs**: Comprehensive error tracking in Health tab
- **Export Logs**: Download error logs for analysis
- **Configuration Export**: Backup settings for support
- **Test Endpoints**: Built-in testing for all functionality

## Development

### File Structure
```
ui/
├── index.html          # Main UI interface
├── styles.css          # Modern dark theme styles
├── script.js           # Frontend JavaScript logic
└── README.md          # This documentation

ui-api.js              # Backend API endpoints
server.js              # Main server with UI integration
test-ui.js             # UI testing script
```

### API Integration
The beautiful UI integrates seamlessly with the existing VLC extension through RESTful API endpoints that provide real-time data and configuration management.

### Customization
The UI supports easy customization through CSS variables and modular JavaScript components, allowing for theme modifications and feature extensions.

## Security

### API Key Protection
- **Password Fields**: API keys hidden by default
- **Visibility Toggle**: Show/hide API keys securely
- **Local Storage**: Settings stored locally in browser
- **No Server Storage**: API keys not stored on server

### HTTPS Support
- **SSL Ready**: Designed for HTTPS deployment
- **Secure Headers**: Proper security headers included
- **CORS Support**: Configurable cross-origin settings

## Future Enhancements

### Planned Features
- **User Authentication**: Multi-user support with login
- **Advanced Analytics**: Detailed usage statistics
- **Custom Themes**: Multiple theme options
- **Mobile App**: Native mobile application
- **Notifications**: Real-time alerts and notifications

### Community Contributions
The beautiful UI is designed to be extensible and welcomes community contributions for new features, themes, and improvements.

---

**Note**: This beautiful UI enhances the VLC Subtitle & Real-Debrid Extension with a modern, comprehensive interface while maintaining full backward compatibility with existing functionality.
