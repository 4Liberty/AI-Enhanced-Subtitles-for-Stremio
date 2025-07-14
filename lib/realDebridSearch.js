// lib/realDebridSearch.js
// Real-Debrid torrent search and stream integration for hash-based matching

const fetch = require('node-fetch');

class RealDebridClient {
  constructor(token, userIP = null) {
    this.token = token;
    this.userIP = userIP;
    this.baseURL = 'https://api.real-debrid.com/rest/1.0';
    this.oauthURL = 'https://api.real-debrid.com/oauth/v2';
    this.headers = {
      'Authorization': `Bearer ${token}`,
      'User-Agent': 'vlsub-opensubtitles-com/1.0.0'
    };
    this.timeout = 15000; // 15 seconds timeout like MediaFusion
  }

  async makeRequest(method, url, data = null, options = {}) {
    const { isExpectedToFail = false, maxRetries = 1 } = options;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const requestOptions = {
          method,
          headers: this.headers,
          timeout: this.timeout
        };

        // Add user IP for POST/PUT requests (MediaFusion pattern)
        if ((method === 'POST' || method === 'PUT') && this.userIP) {
          if (data) {
            data.ip = this.userIP;
          } else {
            data = { ip: this.userIP };
          }
        }

        if (data) {
          if (method === 'GET') {
            const params = new URLSearchParams(data);
            url += `?${params.toString()}`;
          } else {
            requestOptions.body = JSON.stringify(data);
            requestOptions.headers['Content-Type'] = 'application/json';
          }
        }

        const response = await fetch(url, requestOptions);
        
        if (!response.ok && !isExpectedToFail) {
          await this.handleServiceSpecificErrors(response, await response.json());
        }

        return await response.json();
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }

  async handleServiceSpecificErrors(response, errorData) {
    const errorCode = errorData.error_code;
    
    switch (errorCode) {
      case 9:
        throw new Error('Real-Debrid Permission denied - Invalid token');
      case 22:
        throw new Error('IP address not allowed');
      case 34:
        throw new Error('Too many requests - Rate limited');
      case 35:
        throw new Error('Content marked as infringing');
      case 21:
        throw new Error('Active torrents limit reached');
      case 30:
        throw new Error('Invalid magnet link');
      case 23:
        throw new Error('Remote traffic limit exceeded');
      default:
        throw new Error(`Real-Debrid API error: ${errorData.error || 'Unknown error'}`);
    }
  }

  async getUserInfo() {
    return this.makeRequest('GET', `${this.baseURL}/user`);
  }

  async getActiveTorrents() {
    return this.makeRequest('GET', `${this.baseURL}/torrents/activeCount`);
  }

  async getUserTorrentList() {
    return this.makeRequest('GET', `${this.baseURL}/torrents`);
  }

  async getTorrentInfo(torrentId) {
    return this.makeRequest('GET', `${this.baseURL}/torrents/info/${torrentId}`);
  }

  async addMagnetLink(magnetLink) {
    return this.makeRequest('POST', `${this.baseURL}/torrents/addMagnet`, {
      magnet: magnetLink
    });
  }

  async startTorrentDownload(torrentId, fileIds = 'all') {
    return this.makeRequest('POST', `${this.baseURL}/torrents/selectFiles/${torrentId}`, {
      files: fileIds
    });
  }

  async createDownloadLink(link) {
    return this.makeRequest('POST', `${this.baseURL}/unrestrict/link`, {
      link: link
    }, { isExpectedToFail: true });
  }

  async deleteTorrent(torrentId) {
    return this.makeRequest('DELETE', `${this.baseURL}/torrents/delete/${torrentId}`);
  }

  async getAvailableTorrent(infoHash) {
    const torrents = await this.getUserTorrentList();
    return torrents.find(torrent => torrent.hash === infoHash) || null;
  }

  // MediaFusion-inspired status waiting with proper polling
  async waitForStatus(torrentId, targetStatus, maxRetries = 10, retryInterval = 2, torrentInfo = null) {
    if (torrentInfo && torrentInfo.status === targetStatus) {
      return torrentInfo;
    }

    for (let i = 0; i < maxRetries; i++) {
      const info = await this.getTorrentInfo(torrentId);
      if (info.status === targetStatus) {
        return info;
      }
      
      // Check for error states
      if (['magnet_error', 'error', 'virus', 'dead'].includes(info.status)) {
        throw new Error(`Torrent failed with status: ${info.status}`);
      }

      await new Promise(resolve => setTimeout(resolve, retryInterval * 1000));
    }
    
    throw new Error(`Torrent did not reach ${targetStatus} status within ${maxRetries} retries`);
  }

  // Enhanced file selection logic from MediaFusion
  async selectFileFromTorrent(torrentInfo, filename, season, episode) {
    if (!torrentInfo.files || torrentInfo.files.length === 0) {
      throw new Error('No files found in torrent');
    }

    // If specific filename provided, try to find exact match
    if (filename) {
      const exactMatch = torrentInfo.files.find(file => 
        file.path.toLowerCase().includes(filename.toLowerCase())
      );
      if (exactMatch) {
        return torrentInfo.files.indexOf(exactMatch);
      }
    }

    // For TV shows, use season/episode matching
    if (season && episode) {
      const seasonEpRegex = new RegExp(`s0*${season}e0*${episode}`, 'i');
      const seasonEpMatch = torrentInfo.files.find(file => 
        seasonEpRegex.test(file.path)
      );
      if (seasonEpMatch) {
        return torrentInfo.files.indexOf(seasonEpMatch);
      }
    }

    // Find largest video file as fallback
    const videoFiles = torrentInfo.files.filter(file => {
      const ext = file.path.split('.').pop().toLowerCase();
      return ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v'].includes(ext);
    });

    if (videoFiles.length === 0) {
      throw new Error('No video files found in torrent');
    }

    // Return index of largest video file
    const largestFile = videoFiles.reduce((prev, current) => 
      current.bytes > prev.bytes ? current : prev
    );
    return torrentInfo.files.indexOf(largestFile);
  }

  // Enhanced cached content search with proper error handling
  async searchCachedContent(query, type = 'movie') {
    try {
      const userInfo = await this.getUserInfo();
      if (!userInfo) {
        throw new Error('Unable to verify Real-Debrid account');
      }

      const torrents = await this.getUserTorrentList();
      const downloads = await this.makeRequest('GET', `${this.baseURL}/downloads`);

      const cachedResults = [];
      
      // Search through user's torrents
      for (const torrent of torrents) {
        if (torrent.filename.toLowerCase().includes(query.toLowerCase())) {
          cachedResults.push({
            id: torrent.id,
            hash: torrent.hash,
            filename: torrent.filename,
            size: torrent.bytes,
            status: torrent.status,
            progress: torrent.progress,
            type: 'torrent',
            cached: true
          });
        }
      }

      // Search through downloads
      for (const download of downloads) {
        if (download.filename.toLowerCase().includes(query.toLowerCase())) {
          cachedResults.push({
            id: download.id,
            filename: download.filename,
            size: download.filesize,
            link: download.download,
            type: 'download',
            cached: true
          });
        }
      }

      return cachedResults;
    } catch (error) {
      console.error('Error searching cached content:', error);
      return [];
    }
  }

  // Enhanced streaming URL creation with proper error handling
  async createStreamingURL(infoHash, magnetLink, filename, season, episode, maxRetries = 5) {
    try {
      let torrentInfo = await this.getAvailableTorrent(infoHash);
      
      if (!torrentInfo) {
        // Check torrent limits before adding
        const activeCount = await this.getActiveTorrents();
        if (activeCount.limit === activeCount.nb) {
          throw new Error('Torrent limit reached. Please try again later.');
        }

        // Add new torrent
        const addResult = await this.addMagnetLink(magnetLink);
        if (!addResult.id) {
          throw new Error('Failed to add magnet link to Real-Debrid');
        }

        torrentInfo = await this.waitForStatus(addResult.id, 'waiting_files_selection', maxRetries, 2);
      }

      const torrentId = torrentInfo.id;
      const status = torrentInfo.status;

      // Handle different torrent statuses
      if (['magnet_error', 'error', 'virus', 'dead'].includes(status)) {
        await this.deleteTorrent(torrentId);
        throw new Error(`Torrent cannot be downloaded due to status: ${status}`);
      }

      // Start download if not already started
      if (!['queued', 'downloading', 'downloaded'].includes(status)) {
        await this.startTorrentDownload(torrentId, 'all');
      }

      // Wait for download completion
      const completedTorrent = await this.waitForStatus(torrentId, 'downloaded', maxRetries, 5);
      
      // Select appropriate file
      const selectedFileIndex = await this.selectFileFromTorrent(completedTorrent, filename, season, episode);
      const selectedFile = completedTorrent.files[selectedFileIndex];
      
      if (!selectedFile || selectedFile.selected !== 1) {
        throw new Error('Selected file not available for download');
      }

      // Find corresponding download link
      const selectedFiles = completedTorrent.files.filter(file => file.selected === 1);
      const linkIndex = selectedFiles.indexOf(selectedFile);
      
      if (linkIndex === -1 || !completedTorrent.links[linkIndex]) {
        throw new Error('Download link not found for selected file');
      }

      // Create unrestricted download link
      const downloadResult = await this.createDownloadLink(completedTorrent.links[linkIndex]);
      
      if (!downloadResult.download) {
        throw new Error('Failed to create download link');
      }

      // Validate file type
      const mimeType = downloadResult.mimeType || '';
      if (!mimeType.startsWith('video/')) {
        console.warn(`Warning: File mime type is ${mimeType}, not a video file`);
      }

      return {
        url: downloadResult.download,
        filename: downloadResult.filename,
        filesize: downloadResult.filesize,
        mimeType: downloadResult.mimeType,
        torrentId: torrentId
      };

    } catch (error) {
      console.error('Error creating streaming URL:', error);
      throw error;
    }
  }
}

// Enhanced search function with MediaFusion patterns
async function searchRealDebridCachedContent(query, apiKey, options = {}) {
  const { type = 'movie', userIP = null, maxResults = 50 } = options;
  
  try {
    const client = new RealDebridClient(apiKey, userIP);
    
    // Verify credentials first
    await client.getUserInfo();
    
    // Search cached content
    const results = await client.searchCachedContent(query, type);
    
    return {
      success: true,
      results: results.slice(0, maxResults),
      cached: results.length > 0,
      service: 'real-debrid'
    };
    
  } catch (error) {
    console.error('Real-Debrid search error:', error);
    return {
      success: false,
      error: error.message,
      results: [],
      cached: false,
      service: 'real-debrid'
    };
  }
}

// Enhanced stream creation with better error handling
async function createRealDebridStream(infoHash, magnetLink, apiKey, options = {}) {
  const { filename = null, season = null, episode = null, userIP = null } = options;
  
  try {
    const client = new RealDebridClient(apiKey, userIP);
    
    const streamResult = await client.createStreamingURL(
      infoHash, 
      magnetLink, 
      filename, 
      season, 
      episode
    );
    
    return {
      success: true,
      streamUrl: streamResult.url,
      filename: streamResult.filename,
      filesize: streamResult.filesize,
      mimeType: streamResult.mimeType,
      service: 'real-debrid'
    };
    
  } catch (error) {
    console.error('Real-Debrid stream creation error:', error);
    return {
      success: false,
      error: error.message,
      service: 'real-debrid'
    };
  }
}

// Validate Real-Debrid credentials
async function validateRealDebridCredentials(apiKey, userIP = null) {
  try {
    const client = new RealDebridClient(apiKey, userIP);
    const userInfo = await client.getUserInfo();
    
    return {
      valid: true,
      user: userInfo,
      service: 'real-debrid'
    };
    
  } catch (error) {
    return {
      valid: false,
      error: error.message,
      service: 'real-debrid'
    };
  }
}

module.exports = {
  RealDebridClient,
  searchRealDebridCachedContent,
  createRealDebridStream,
  validateRealDebridCredentials
};
