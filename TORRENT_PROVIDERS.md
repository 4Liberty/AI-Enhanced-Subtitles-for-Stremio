# Torrent Provider Configuration Guide

## 🎯 **Torrentio-Style Multi-Provider Search**

Your Real-Debrid addon now supports **all the same torrent providers as Torrentio**! Here's how to configure and use them:

## 📋 **Supported Providers**

### ✅ **API-Based Providers (Fully Implemented)**
- **YTS** - High-quality movies, legal torrents
- **EZTV** - TV shows and movies
- **RARBG** - Movies and TV (via mirrors)
- **ThePirateBay** - General torrents (via API)
- **TorrentGalaxy** - Movies and TV
- **Nyaa.si** - Anime and Asian content
- **AniDex** - Anime torrents

### 🔧 **Jackett Integration (Optional)**
- **Jackett** - Meta-search across 100+ torrent sites
- Requires local Jackett server installation
- Provides access to private trackers

### ⚠️ **Scraping-Based Providers (Framework Ready)**
- **1337x** - General torrents
- **KickassTorrents** - General torrents
- **MagnetDL** - Magnet links
- **HorribleSubs** - Anime
- **TokyoTosho** - Asian content
- **Rutor** - Russian torrents
- **Rutracker** - Russian private tracker
- **Comando** - Portuguese torrents
- **BluDV** - Portuguese torrents
- **Torrent9** - French torrents
- **ilCorsaRoNeRo** - Italian torrents
- **MejorTorrent** - Spanish torrents
- **Wolfmax4k** - Spanish 4K content
- **Cinecalidad** - Spanish movies
- **BestTorrents** - Polish torrents

## 🔑 **Configuration**

### **Basic Setup**
```bash
# Required for Real-Debrid functionality
export REAL_DEBRID_API_KEY="your_api_key_here"

# Optional for better movie metadata
export TMDB_API_KEY="your_tmdb_key_here"
```

### **Advanced Jackett Setup**
```bash
# Optional: Enable Jackett meta-search
export JACKETT_URL="http://localhost:9117"
export JACKETT_API_KEY="your_jackett_api_key"
```

## 🚀 **How It Works**

1. **Parallel Search**: All enabled providers are searched simultaneously
2. **Timeout Protection**: Each provider has a 10-second timeout
3. **Error Handling**: Failed providers don't break the search
4. **Deduplication**: Duplicate torrents are filtered by hash
5. **Quality Sorting**: Results sorted by quality (4K → 1080p → 720p)
6. **Real-Debrid Check**: Only cached torrents are returned as streams

## 📊 **Provider Statistics**

When searching for a movie, you'll see output like:
```
[RealDebrid] Searching 8 torrent providers (Torrentio-style)...
[RealDebrid] YTS: 5 torrents
[RealDebrid] EZTV: 12 torrents
[RealDebrid] RARBG: 8 torrents
[RealDebrid] ThePirateBay: 15 torrents
[RealDebrid] TorrentGalaxy: 7 torrents
[RealDebrid] Nyaa.si: 2 torrents
[RealDebrid] AniDex: 1 torrents
[RealDebrid] Jackett: 25 torrents
[RealDebrid] Found 75 potential torrents
[RealDebrid] 45 unique torrents found
[RealDebrid] Checking availability for 45 hashes
[RealDebrid] Generated 12 Real-Debrid streams
```

## 🎮 **Usage Examples**

### **Movie Search**
```javascript
const streams = await generateRealDebridStreams('tt0133093', 'movie');
// Returns cached streams from all providers
```

### **Provider-Specific Search**
```javascript
const ytsResults = await searchYTSTorrents('tt0133093', movieData);
const rarbgResults = await searchRARBGTorrents('tt0133093', movieData);
```

## 🛠️ **Jackett Setup (Optional)**

1. **Install Jackett**: https://github.com/Jackett/Jackett
2. **Configure Indexers**: Add your favorite torrent sites
3. **Get API Key**: Copy from Jackett dashboard
4. **Set Environment Variables**:
   ```bash
   export JACKETT_URL="http://localhost:9117"
   export JACKETT_API_KEY="your_jackett_api_key"
   ```

## 🔍 **Search Priority**

Providers are searched in priority order:
1. **YTS** (highest quality movies)
2. **EZTV** (TV shows)
3. **RARBG** (general content)
4. **ThePirateBay** (large database)
5. **TorrentGalaxy** (modern interface)
6. **Nyaa.si** (anime)
7. **AniDex** (anime)
8. **Jackett** (meta-search)

## 🌍 **Regional Providers**

Enable regional providers by setting:
```bash
export ENABLE_REGIONAL_PROVIDERS="true"
```

This will activate:
- **Rutor/Rutracker** (Russian)
- **Comando/BluDV** (Portuguese)
- **Torrent9** (French)
- **ilCorsaRoNeRo** (Italian)
- **MejorTorrent/Wolfmax4k/Cinecalidad** (Spanish)
- **BestTorrents** (Polish)

## 📈 **Performance**

- **Parallel Execution**: All providers searched simultaneously
- **Timeout Protection**: 10-second timeout per provider
- **Efficient Deduplication**: Hash-based filtering
- **Smart Caching**: Results cached for faster subsequent searches

## 🎯 **Result Quality**

Your addon now provides the same comprehensive torrent coverage as Torrentio, ensuring maximum Real-Debrid cache hit rates!

## 🔧 **Troubleshooting**

### **No results from a provider**
- Check provider logs in console
- Verify API endpoints are accessible
- Some providers may be geo-blocked

### **Slow searches**
- Reduce timeout values
- Disable slower providers
- Use Jackett for better performance

### **Missing torrents**
- Enable more providers
- Configure Jackett with private trackers
- Check Real-Debrid cache status

---

**Your subtitle addon now has the same torrent search capabilities as Torrentio! 🎉**
