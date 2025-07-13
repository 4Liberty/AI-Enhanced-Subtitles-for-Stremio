# Stremio OpenSubtitles.com Subtitle Addon + Real-Debrid

This project provides a Stremio subtitle addon that delivers Turkish subtitles from OpenSubtitles.com, Podnapisi, and subdl.com, with AI-powered sync correction, robust fallback logic, Real-Debrid cached stream integration, and modern quality indicators.

## 🚀 Features

- 🔍 **Smart Search**: Hash-based search for exact matches, name-based search with GuessIt integration, and robust fallback logic
- 📱 **Modern API**: Uses OpenSubtitles.com REST API v1 for better performance and reliability
- 🔄 **Auto-updates**: Always up-to-date with the latest subtitle sources and improvements
- 🎬 **Smart Metadata**: GuessIt API integration for accurate movie/TV show detection and metadata extraction
- 🏆 **Quality Indicators**: Shows trusted uploaders, download counts, sync quality (🎯 Perfect Match), and ratings
- 💾 **Flexible Download**: Auto-load subtitles or save manually with language codes, direct download for Stremio desktop/mobile
- 🤖 **AI Sync Correction**: Gemini AI-powered subtitle sync correction for perfect timing
- 🌐 **Multi-source Fallback**: Podnapisi and subdl.com fallback for maximum coverage
- 🇹🇷 **Turkish-only Filtering**: Only Turkish subtitles are provided for best user experience
- 🔗 **Easy Install**: Simple configuration UI and Stremio install link generation
- 🎯 **Real-Debrid Integration**: Torrentio-style multi-provider torrent search and cached stream access
- ⚡ **Priority Streaming**: Real-Debrid cached streams appear at the top of the list
- 🌐 **Multi-Provider Search**: Supports 20+ torrent providers like YTS, EZTV, RARBG, ThePirateBay, and more
- 🔍 **Jackett Integration**: Optional meta-search across 100+ torrent sites

## 🆚 Differences from Legacy vlsub (.org version)

| Feature                | Legacy vlsub (.org) | VLSub OpenSubtitles.com (Stremio Addon) |
|------------------------|---------------------|-----------------------------------------|
| **API**                | XML-RPC (legacy)    | REST API v1 (modern)                    |
| **Authentication**     | Optional            | Required (free account)                 |
| **Language Selection** | Single language     | Up to 3 languages with priority         |
| **Search Methods**     | Basic hash/name     | Hash + Name + GuessIt fallback          |
| **Auto-updates**       | None                | Built-in update system                  |
| **Locale Detection**   | Simple              | Advanced system detection               |
| **Quality Indicators** | Basic               | Detailed (trusted, HD, sync, etc.)      |
| **Performance**        | Slower XML parsing  | Fast JSON API                           |
| **Metadata**           | Manual input        | Smart GuessIt extraction                |

## Installation (Stremio)

1. Open the [configuration page](configure.html) to select your language and generate an install link.
2. Click the install link or copy it into Stremio's "Add addon by URL" field.
3. Subtitles will appear automatically in the player if available.

## Torrent Provider Support

This addon now supports **the same torrent providers as Torrentio** for maximum Real-Debrid cache hit rates:

### ✅ **Active Providers**
- **YTS** - High-quality movie torrents
- **EZTV** - TV shows and movies
- **RARBG** - Movies and TV (via mirrors)
- **ThePirateBay** - General torrents (via API)
- **TorrentGalaxy** - Movies and TV
- **Nyaa.si** - Anime and Asian content
- **AniDex** - Anime torrents

### 🔧 **Optional Jackett Integration**
- **Jackett** - Meta-search across 100+ torrent sites
- Supports private trackers
- Requires local Jackett server

### 🌍 **Regional Providers**
- **Rutor/Rutracker** (Russian)
- **Comando/BluDV** (Portuguese)
- **Torrent9** (French)
- **ilCorsaRoNeRo** (Italian)
- **MejorTorrent/Wolfmax4k/Cinecalidad** (Spanish)
- **BestTorrents** (Polish)

See [TORRENT_PROVIDERS.md](TORRENT_PROVIDERS.md) for detailed configuration.

## Real-Debrid Configuration

For premium users, this addon supports Real-Debrid integration for cached stream access:

1. **Get your Real-Debrid API Key:**
   - Visit [Real-Debrid API](https://real-debrid.com/api)
   - Log in to your account
   - Generate a new API key

2. **Configure the addon:**
   - Set the `REAL_DEBRID_API_KEY` environment variable
   - Or use the Stremio configuration UI (if available)

3. **Benefits:**
   - Cached streams appear at the top of the list
   - Perfect hash matches for subtitle synchronization
   - Instant availability checking
   - Premium quality streams (4K, 1080p, 720p)

## Usage

- Subtitles are provided automatically for Turkish content in Stremio.
- Direct download is supported for desktop and mobile apps.
- 🎯 **Perfect Match** subtitles are hash-matched and guaranteed to be in sync.
- Real-Debrid users get priority cached streams at the top of the list.

## Support

- [OpenSubtitles.com](https://www.opensubtitles.com/)
- [GitHub Issues](https://github.com/opensubtitles/vlsub-opensubtitles-com/issues)

## License

This project is licensed under the MIT License.
curl -sSL https://raw.githubusercontent.com/opensubtitles/vlsub-opensubtitles-com/main/scripts/install.sh | bash


**Windows (PowerShell):**
*Press `Windows + R` → type `powershell` → Enter, then run:*
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser; iwr -useb https://raw.githubusercontent.com/opensubtitles/vlsub-opensubtitles-com/main/scripts/install.ps1 | iex
```

### Method 2: Manual Installation

1. **Clone or download** this repository
2. **Install dependencies**:
   ```bash
   npm install
   ```
3. **Start the addon server**:
   ```bash
   npm start
   ```
4. **Add to Stremio**: Use `http://localhost:7000/manifest.json` as the addon URL
5. **Access beautiful UI**: Open `http://localhost:7000/ui` for advanced configuration

## 📋 Requirements

- **Stremio** desktop or mobile app
- **Node.js** 16.0 or newer
- **OpenSubtitles.com account** ([free registration](https://www.opensubtitles.com/newuser))
- **Internet connection** for searching and downloading
- **Real-Debrid account** (optional, for premium cached streams)

## 🎬 Usage

### Quick Start
1. **Setup**: Install the addon in Stremio using the manifest URL
2. **Login**: Configure your OpenSubtitles.com credentials via the web UI
3. **Play**: Start any video in Stremio
4. **Subtitles**: Available subtitles will appear automatically in the player
5. **Advanced**: Access `http://localhost:7000/ui` for detailed configuration

### Search Methods

#### 🎯 Hash Search (Recommended)
- **Best for**: Any video content in Stremio
- **Accuracy**: Finds exactly synchronized subtitles
- **How it works**: Calculates unique file fingerprint for perfect matching, falls back to Name Search

#### 🔍 Name Search
- **Best for**: When hash search fails or for alternative subtitles
- **Features**: Uses GuessIt to extract title, year, season, episode from filename
- **Flexibility**: Works with various naming conventions and streaming sources

