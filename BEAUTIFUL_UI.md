# 🎨 Beautiful UI for Stremio AI Subtitle & Real-Debrid Addon

Your Stremio addon now includes a **stunning, modern web interface** with comprehensive health monitoring and advanced settings management!

## 🚀 Quick Start

1. **Start the server**:
   ```bash
   npm start
   ```

2. **Open the beautiful UI**:
   ```
   http://localhost:7000/ui
   ```

3. **Enjoy the modern interface**! 🎉

## ✨ Features

### 🎯 Dashboard
- **Real-time metrics** for processed subtitles and found torrents
- **Live system health** monitoring with color-coded indicators
- **Performance tracking** with response times and success rates
- **Activity feed** showing recent operations and events

### 📝 Subtitle Management
- **Multi-source support**: OpenSubtitles, SubDL, AI correction
- **Language configuration**: Primary and fallback language settings
- **AI-powered enhancement**: Google Gemini integration with intensity control
- **Built-in testing**: Test subtitle search with any IMDb ID

### 🌐 Torrent Providers (20+ Supported!)
- **API Providers**: YTS, EZTV, RARBG, ThePirateBay, TorrentGalaxy, Nyaa.si, AniDex
- **Web Scraping**: 1337x, KickassTorrents, MagnetDL with intelligent parsing
- **Meta-search**: Jackett integration for 100+ additional sites
- **Real-Debrid**: Cached torrent streaming with instant availability

### 💚 Advanced Health Monitoring
- **Health Score**: 0-100% system health with detailed breakdown
- **Service Status**: Individual monitoring for all APIs and providers
- **Error Tracking**: Comprehensive error logs with timestamps
- **Performance Charts**: Real-time visualization of system metrics

### ⚙️ Comprehensive Settings
- **API Key Management**: Secure input for all API credentials
- **Advanced Options**: Debug mode, scraping control, performance tuning
- **Backup & Restore**: Export/import configurations
- **Auto-save**: Settings persist automatically

## 🖥️ Screenshots

### Dashboard
![Dashboard showing real-time metrics and system health](docs/screenshots/dashboard.png)

### Provider Status
![Torrent providers with API and scraping indicators](docs/screenshots/providers.png)

### Health Monitoring
![Advanced health monitoring with detailed checks](docs/screenshots/health.png)

## 🛠️ Setup

### Environment Variables
```bash
# Required for basic functionality
GEMINI_API_KEY=your_gemini_api_key
OPENSUBTITLES_API_KEY=your_opensubtitles_key
TMDB_API_KEY=your_tmdb_key
SUBDL_API_KEY=your_subdl_key

# Optional for enhanced features
REAL_DEBRID_API_KEY=your_realdebrid_key
JACKETT_URL=http://localhost:9117
JACKETT_API_KEY=your_jackett_key
```

### API Key Setup
1. **Google Gemini**: Visit [Google AI Studio](https://ai.google.dev/)
2. **OpenSubtitles**: Register at [OpenSubtitles API](https://opensubtitles.com/api)
3. **TMDB**: Get key from [TheMovieDB](https://themoviedb.org/settings/api)
4. **SubDL**: Register at [SubDL API](https://subdl.com/api)
5. **Real-Debrid**: Get key from [Real-Debrid API](https://real-debrid.com/api)

## 🎨 UI Components

### Navigation Tabs
- **Dashboard**: System overview and real-time metrics
- **Subtitles**: Language settings and AI configuration
- **Torrents**: Provider management and Real-Debrid status
- **Health**: Advanced monitoring and error tracking
- **Settings**: API keys and system configuration

### Status Indicators
- 🟢 **Green**: Service is healthy and operational
- 🟡 **Yellow**: Service has warnings or partial functionality
- 🔴 **Red**: Service is down or has critical errors
- ⚪ **Gray**: Service status unknown or checking

### Real-time Updates
- **Auto-refresh**: Dashboard updates every 10 seconds
- **Live metrics**: Response times, memory usage, success rates
- **Activity feed**: Live stream of system operations
- **Error tracking**: Immediate error detection and logging

## 🔧 Technical Details

### Architecture
- **Frontend**: Modern HTML5, CSS3, JavaScript ES6+
- **Backend**: Express.js with RESTful API endpoints
- **Real-time**: WebSocket-like updates via polling
- **Storage**: Browser localStorage for settings persistence

### Performance
- **Optimized**: Efficient DOM updates and smooth animations
- **Responsive**: Mobile-friendly design with touch support
- **Accessible**: Full keyboard navigation and screen reader support
- **Fast**: Minimal resource usage with intelligent caching

### Security
- **API Protection**: Secure API key management
- **Input Validation**: Comprehensive input sanitization
- **Error Handling**: Graceful error recovery
- **HTTPS Ready**: SSL/TLS support for production

## 🌟 Provider Support

### API-Based Providers ✅
- **YTS**: High-quality movies with metadata
- **EZTV**: TV shows and episode tracking
- **RARBG**: Movies and TV via mirror sites
- **ThePirateBay**: General torrents with API access
- **TorrentGalaxy**: Movies and TV content
- **Nyaa.si**: Anime and Asian content
- **AniDex**: Anime torrent specialized
- **Jackett**: Meta-search across 100+ sites

### Web Scraping Providers 🌐
- **1337x**: General torrents with HTML parsing
- **KickassTorrents**: Multi-mirror support
- **MagnetDL**: Magnet link extraction
- **Regional Providers**: Framework for local sites

### Real-Debrid Integration 💾
- **Instant Check**: Cached torrent availability
- **Stream Generation**: Direct streaming links
- **Account Status**: Expiration and traffic monitoring
- **Quality Filtering**: Automatic quality detection

## 🧪 Testing

### Built-in Testing
- **Subtitle Search**: Test with any IMDb ID
- **Torrent Search**: Test providers with quality filters
- **API Keys**: Validate all API credentials
- **Health Checks**: Comprehensive system testing

### Test Commands
```bash
# Test the beautiful UI
node test-ui.js

# Test Real-Debrid integration
node test-realdebrid.js

# Test subtitle sources
node test-subtitle-sources.js
```

## 📊 Monitoring

### Health Metrics
- **Overall Score**: 0-100% system health
- **API Status**: Individual API connectivity
- **Provider Health**: Torrent provider availability
- **Resource Usage**: Memory and performance tracking

### Error Tracking
- **Comprehensive Logs**: All errors with timestamps
- **Severity Levels**: Info, Warning, Error classification
- **Export Function**: Download logs for analysis
- **Auto-cleanup**: Automatic old log removal

### Performance Monitoring
- **Response Times**: Average and recent response times
- **Success Rates**: Request success/failure ratios
- **Memory Usage**: Real-time memory consumption
- **Uptime Tracking**: System availability metrics

## 🔄 Updates

### Auto-refresh Features
- **Dashboard**: Live metrics every 10 seconds
- **Provider Status**: Real-time provider health
- **Error Logs**: Immediate error detection
- **Performance**: Continuous metric updates

### Manual Refresh
- **Cache Clearing**: Manual cache management
- **Provider Testing**: On-demand provider checks
- **Health Checks**: Immediate system validation
- **Settings Sync**: Real-time configuration updates

## 🎯 Advanced Features

### Backup & Restore
- **Configuration Export**: JSON format for easy backup
- **Settings Import**: Restore from exported configuration
- **Migration Support**: Transfer settings between instances
- **Version Control**: Configuration versioning

### Debug Mode
- **Detailed Logging**: Enhanced error information
- **Performance Metrics**: Extended performance data
- **Provider Details**: Detailed provider responses
- **System Information**: Comprehensive system stats

### Customization
- **Theme Support**: Dark theme with customization options
- **Layout Options**: Responsive grid layouts
- **Accessibility**: High contrast and screen reader support
- **Internationalization**: Ready for multiple languages

## 🚀 Production Deployment

### Environment Setup
1. Set all required environment variables
2. Configure SSL/TLS for HTTPS
3. Set up domain pointing to your server
4. Configure firewall for port 7000

### Performance Optimization
- **Caching**: Enable all caching options
- **Compression**: Enable gzip compression
- **CDN**: Use CDN for static assets
- **Monitoring**: Set up external monitoring

### Security Considerations
- **API Keys**: Never expose API keys in client-side code
- **HTTPS**: Always use HTTPS in production
- **Rate Limiting**: Implement rate limiting for API endpoints
- **Input Validation**: Validate all user inputs

## 🤝 Contributing

### Development Setup
1. Fork the repository
2. Install dependencies: `npm install`
3. Start development server: `npm start`
4. Open UI: `http://localhost:7000/ui`

### Code Style
- **ES6+**: Modern JavaScript features
- **Responsive**: Mobile-first design
- **Accessible**: WCAG 2.1 compliance
- **Performance**: Optimized for speed

### Testing
- **UI Testing**: Test all interface components
- **API Testing**: Validate all API endpoints
- **Cross-browser**: Test on multiple browsers
- **Mobile**: Test on various mobile devices

## 📚 Documentation

### API Reference
- **Complete API docs**: Available in `/ui/README.md`
- **Endpoint documentation**: Detailed API specifications
- **Response examples**: Sample API responses
- **Error codes**: Complete error code reference

### User Guide
- **Setup Instructions**: Step-by-step setup guide
- **Feature Overview**: Comprehensive feature documentation
- **Troubleshooting**: Common issues and solutions
- **Best Practices**: Optimization recommendations

## 🎉 What's New

### v2.9.3 Features
- ✅ **Beautiful Modern UI** with dark theme
- ✅ **Advanced Health Monitoring** with real-time metrics
- ✅ **20+ Torrent Providers** including web scraping
- ✅ **Real-Debrid Integration** with cached streaming
- ✅ **Comprehensive Settings** with backup/restore
- ✅ **Built-in Testing** for all functionality
- ✅ **Performance Optimization** with caching
- ✅ **Mobile-Friendly** responsive design

### Coming Soon
- 🔄 **WebSocket Support** for real-time updates
- 🔄 **Custom Themes** with multiple color schemes
- 🔄 **Advanced Analytics** with detailed statistics
- 🔄 **Mobile App** for iOS and Android
- 🔄 **Multi-language Support** for international users

---

**🎨 Experience the power of beautiful, modern UI design combined with comprehensive functionality!**

Open `http://localhost:7000/ui` and enjoy your new control panel! 🚀
