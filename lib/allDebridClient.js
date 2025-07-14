// lib/allDebridClient.js
// AllDebrid client implementation based on Comet patterns

const fetch = require('node-fetch');

class AllDebridClient {
  constructor(token, userIP = null) {
    this.token = token;
    this.userIP = userIP;
    this.baseURL = 'https://api.alldebrid.com/v4';
    this.headers = {
      'Authorization': `Bearer ${token}`,
      'User-Agent': 'vlsub-opensubtitles-com/1.0.0'
    };
    this.timeout = 15000; // 15 seconds timeout like Comet
  }

  async makeRequest(method, url, data = null, options = {}) {
    const { isExpectedToFail = false, maxRetries = 1 } = options;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const requestOptions = {
          method: method,
          headers: this.headers,
          timeout: this.timeout
        };

        if (data && (method === 'POST' || method === 'PUT')) {
          requestOptions.body = JSON.stringify(data);
          requestOptions.headers['Content-Type'] = 'application/json';
        }

        const response = await fetch(url, requestOptions);
        
        if (!response.ok && !isExpectedToFail) {
          throw new Error(`AllDebrid API error: ${response.status} - ${response.statusText}`);
        }

        return await response.json();
      } catch (error) {
        if (attempt === maxRetries - 1) {
          throw error;
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }

  async getUser() {
    try {
      const response = await this.makeRequest('GET', `${this.baseURL}/user`);
      return response;
    } catch (error) {
      console.error('AllDebrid getUser error:', error);
      return null;
    }
  }

  async checkLinkAvailability(links) {
    try {
      const response = await this.makeRequest('POST', `${this.baseURL}/link/infos`, {
        link: links
      });
      return response;
    } catch (error) {
      console.error('AllDebrid checkLinkAvailability error:', error);
      return null;
    }
  }

  async addMagnetLink(magnetLink) {
    try {
      const response = await this.makeRequest('POST', `${this.baseURL}/magnet/upload`, {
        magnets: [magnetLink]
      });
      return response;
    } catch (error) {
      console.error('AllDebrid addMagnetLink error:', error);
      return null;
    }
  }

  async getMagnetStatus(magnetId) {
    try {
      const response = await this.makeRequest('GET', `${this.baseURL}/magnet/status?id=${magnetId}`);
      return response;
    } catch (error) {
      console.error('AllDebrid getMagnetStatus error:', error);
      return null;
    }
  }

  async waitForMagnetReady(magnetId, maxWaitTime = 30000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      const status = await this.getMagnetStatus(magnetId);
      
      if (status && status.data && status.data.magnets) {
        const magnet = status.data.magnets.find(m => m.id === magnetId);
        
        if (magnet && magnet.status === 'Ready') {
          return magnet;
        }
        
        if (magnet && magnet.status === 'Error') {
          throw new Error(`AllDebrid magnet processing failed: ${magnet.statusCode}`);
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    throw new Error('AllDebrid magnet processing timeout');
  }

  async unrestrictLink(link) {
    try {
      const response = await this.makeRequest('POST', `${this.baseURL}/link/unlock`, {
        link: link
      });
      return response;
    } catch (error) {
      console.error('AllDebrid unrestrictLink error:', error);
      return null;
    }
  }

  async searchCachedContent(query) {
    try {
      // AllDebrid doesn't have direct search, but we can check popular torrents
      const response = await this.makeRequest('GET', `${this.baseURL}/magnet/instant`);
      
      if (response && response.data && response.data.magnets) {
        return response.data.magnets.filter(magnet => 
          magnet.filename.toLowerCase().includes(query.toLowerCase())
        );
      }
      
      return [];
    } catch (error) {
      console.error('AllDebrid searchCachedContent error:', error);
      return [];
    }
  }

  async createStreamingURL(magnetLink, fileIndex = 0) {
    try {
      // Add magnet to AllDebrid
      const addResult = await this.addMagnetLink(magnetLink);
      
      if (!addResult || !addResult.data || !addResult.data.magnets) {
        throw new Error('Failed to add magnet to AllDebrid');
      }

      const magnetId = addResult.data.magnets[0].id;
      
      // Wait for magnet to be ready
      const readyMagnet = await this.waitForMagnetReady(magnetId);
      
      if (!readyMagnet.links || readyMagnet.links.length === 0) {
        throw new Error('No files available in AllDebrid magnet');
      }

      // Get the file at specified index (or first file)
      const selectedFile = readyMagnet.links[fileIndex] || readyMagnet.links[0];
      
      // Unrestrict the link to get streaming URL
      const unrestrictResult = await this.unrestrictLink(selectedFile.link);
      
      if (!unrestrictResult || !unrestrictResult.data) {
        throw new Error('Failed to unrestrict AllDebrid link');
      }

      return {
        url: unrestrictResult.data.link,
        filename: selectedFile.filename,
        size: selectedFile.size,
        provider: 'AllDebrid'
      };
    } catch (error) {
      console.error('AllDebrid createStreamingURL error:', error);
      throw error;
    }
  }

  async getAvailability(infoHashes) {
    try {
      const response = await this.makeRequest('POST', `${this.baseURL}/magnet/instant`, {
        magnets: infoHashes
      });
      
      if (response && response.data) {
        return response.data.magnets || [];
      }
      
      return [];
    } catch (error) {
      console.error('AllDebrid getAvailability error:', error);
      return [];
    }
  }

  async selectFileFromTorrent(magnetId, fileIndex) {
    try {
      const status = await this.getMagnetStatus(magnetId);
      
      if (status && status.data && status.data.magnets) {
        const magnet = status.data.magnets.find(m => m.id === magnetId);
        
        if (magnet && magnet.links && magnet.links[fileIndex]) {
          return magnet.links[fileIndex];
        }
      }
      
      throw new Error('File not found in AllDebrid torrent');
    } catch (error) {
      console.error('AllDebrid selectFileFromTorrent error:', error);
      throw error;
    }
  }

  async getAccountInfo() {
    try {
      const userInfo = await this.getUser();
      
      if (userInfo && userInfo.data) {
        return {
          username: userInfo.data.user.username,
          email: userInfo.data.user.email,
          premium: userInfo.data.user.isPremium,
          expiration: userInfo.data.user.premiumUntil,
          provider: 'AllDebrid'
        };
      }
      
      return null;
    } catch (error) {
      console.error('AllDebrid getAccountInfo error:', error);
      return null;
    }
  }
}

module.exports = { AllDebridClient };
