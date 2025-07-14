const { RealDebridClient } = require('./realDebridSearch');
const { AllDebridClient } = require('./allDebridClient');

class StreamingProviderManager {
  constructor() {
    this.providers = {};
    this.timeout = 15000; // 15 seconds timeout
    this.maxRetries = 3;
    this.supportedProviders = {
      'realdebrid': {
        name: 'Real-Debrid',
        class: RealDebridClient,
        extension: 'RD',
        cacheAvailability: false
      },
      'alldebrid': {
        name: 'AllDebrid',
        class: AllDebridClient,
        extension: 'AD',
        cacheAvailability: false
      }
    };
  }

  // Register a streaming provider with enhanced configuration
  registerProvider(name, config) {
    const providerInfo = this.supportedProviders[name.toLowerCase()];
    
    if (!providerInfo) {
      throw new Error(`Unsupported provider: ${name}`);
    }

    this.providers[name] = {
      ...config,
      ...providerInfo,
      enabled: true,
      lastError: null,
      errorCount: 0,
      client: null
    };

    // Initialize the client
    try {
      this.providers[name].client = new providerInfo.class(config.apiKey, config.userIP);
      console.log(`✅ ${providerInfo.name} provider registered successfully`);
    } catch (error) {
      console.error(`❌ Failed to initialize ${providerInfo.name} provider:`, error);
      this.providers[name].enabled = false;
      this.providers[name].lastError = error.message;
    }
  }

  // Get all available providers
  getAvailableProviders() {
    return Object.keys(this.providers).filter(name => this.providers[name].enabled);
  }

  // Disable provider temporarily due to errors
  disableProvider(name, reason) {
    if (this.providers[name]) {
      this.providers[name].enabled = false;
      this.providers[name].lastError = reason;
      this.providers[name].errorCount++;
      
      // Re-enable after 5 minutes
      setTimeout(() => {
        if (this.providers[name]) {
          this.providers[name].enabled = true;
          this.providers[name].lastError = null;
        }
      }, 5 * 60 * 1000);
    }
  }

  // Create Real-Debrid client instance
  createRealDebridClient(token, userIP = null) {
    return new RealDebridClient(token, userIP);
  }

  // Search cached content across all providers
  async searchCachedContent(query, options = {}) {
    const { type = 'movie', maxResults = 50 } = options;
    const availableProviders = this.getAvailableProviders();
    const results = [];

    for (const providerName of availableProviders) {
      const provider = this.providers[providerName];
      
      try {
        let searchResults = [];
        
        if (provider.client) {
          searchResults = await provider.client.searchCachedContent(query, type);
        }

        results.push({
          provider: providerName,
          providerName: provider.name,
          extension: provider.extension,
          success: true,
          results: searchResults.slice(0, maxResults),
          cached: searchResults.length > 0
        });

      } catch (error) {
        console.error(`Error searching ${providerName}:`, error);
        results.push({
          provider: providerName,
          providerName: provider.name,
          extension: provider.extension,
          success: false,
          error: error.message,
          results: []
        });
        
        // Disable provider if too many errors
        provider.errorCount++;
        if (provider.errorCount >= 3) {
          this.disableProvider(providerName, error.message);
        }
      }
    }

    return {
      success: results.some(r => r.success),
      providers: results,
      totalResults: results.reduce((sum, r) => sum + r.results.length, 0)
    };
  }

  // Create streaming URL with fallback support
  async createStreamingURL(infoHash, magnetLink, options = {}) {
    const { filename = null, season = null, episode = null, preferredProvider = null } = options;
    const availableProviders = this.getAvailableProviders();
    
    // Try preferred provider first
    if (preferredProvider && availableProviders.includes(preferredProvider)) {
      const result = await this.tryProviderStream(preferredProvider, infoHash, magnetLink, options);
      if (result.success) {
        return result;
      }
    }

    // Try all providers in order
    for (const providerName of availableProviders) {
      if (providerName === preferredProvider) continue; // Already tried
      
      const result = await this.tryProviderStream(providerName, infoHash, magnetLink, options);
      if (result.success) {
        return result;
      }
    }

    return {
      success: false,
      error: 'No streaming providers available',
      provider: null
    };
  }

  // Try streaming with specific provider
  async tryProviderStream(providerName, infoHash, magnetLink, options = {}) {
    const provider = this.providers[providerName];
    if (!provider || !provider.enabled) {
      return {
        success: false,
        error: `Provider ${providerName} not available`,
        provider: providerName
      };
    }

    try {
      let streamResult;
      
      switch (provider.type) {
        case 'realdebrid':
          const rdClient = this.createRealDebridClient(provider.token, provider.userIP);
          streamResult = await rdClient.createStreamingURL(
            infoHash, 
            magnetLink, 
            options.filename, 
            options.season, 
            options.episode
          );
          break;
          
        default:
          throw new Error(`Unsupported provider type: ${provider.type}`);
      }

      return {
        success: true,
        streamUrl: streamResult.url,
        filename: streamResult.filename,
        filesize: streamResult.filesize,
        mimeType: streamResult.mimeType,
        provider: providerName
      };

    } catch (error) {
      console.error(`Error creating stream with ${providerName}:`, error);
      
      // Increment error count
      provider.errorCount++;
      
      // Disable provider if too many errors
      if (provider.errorCount >= 5) {
        this.disableProvider(providerName, error.message);
      }

      return {
        success: false,
        error: error.message,
        provider: providerName
      };
    }
  }

  // Get provider status
  getProviderStatus(providerName) {
    const provider = this.providers[providerName];
    if (!provider) {
      return { exists: false };
    }

    return {
      exists: true,
      enabled: provider.enabled,
      type: provider.type,
      errorCount: provider.errorCount,
      lastError: provider.lastError
    };
  }

  // Validate provider credentials
  async validateProvider(providerName) {
    const provider = this.providers[providerName];
    if (!provider) {
      return { valid: false, error: 'Provider not found' };
    }

    try {
      switch (provider.type) {
        case 'realdebrid':
          const rdClient = this.createRealDebridClient(provider.token, provider.userIP);
          const userInfo = await rdClient.getUserInfo();
          return {
            valid: true,
            user: userInfo,
            provider: providerName
          };
          
        default:
          throw new Error(`Unsupported provider type: ${provider.type}`);
      }
    } catch (error) {
      return {
        valid: false,
        error: error.message,
        provider: providerName
      };
    }
  }

  // Get cache statistics
  async getCacheStats() {
    const availableProviders = this.getAvailableProviders();
    const stats = {};

    for (const providerName of availableProviders) {
      const provider = this.providers[providerName];
      
      try {
        switch (provider.type) {
          case 'realdebrid':
            const rdClient = this.createRealDebridClient(provider.token, provider.userIP);
            const userInfo = await rdClient.getUserInfo();
            const activeTorrents = await rdClient.getActiveTorrents();
            
            stats[providerName] = {
              type: provider.type,
              user: userInfo.username,
              premium: userInfo.premium,
              expiration: userInfo.expiration,
              activeTorrents: activeTorrents.nb,
              torrentLimit: activeTorrents.limit,
              enabled: provider.enabled,
              errorCount: provider.errorCount
            };
            break;
        }
      } catch (error) {
        stats[providerName] = {
          type: provider.type,
          error: error.message,
          enabled: provider.enabled,
          errorCount: provider.errorCount
        };
      }
    }

    return stats;
  }

  // Health check for all providers
  async healthCheck() {
    const availableProviders = this.getAvailableProviders();
    const health = {};

    for (const providerName of availableProviders) {
      const validation = await this.validateProvider(providerName);
      health[providerName] = {
        healthy: validation.valid,
        error: validation.error,
        lastChecked: new Date().toISOString()
      };
    }

    return health;
  }
}

// Create singleton instance
const streamingManager = new StreamingProviderManager();

// Enhanced provider initialization with multi-debrid support
function initializeStreamingProviders(config) {
  console.log('Initializing streaming providers with multi-debrid support...');
  
  if (config.realdebrid && config.realdebrid.apiKey) {
    streamingManager.registerProvider('realdebrid', {
      apiKey: config.realdebrid.apiKey,
      userIP: config.realdebrid.userIP || null,
      priority: 1
    });
  }

  if (config.alldebrid && config.alldebrid.apiKey) {
    streamingManager.registerProvider('alldebrid', {
      apiKey: config.alldebrid.apiKey,
      userIP: config.alldebrid.userIP || null,
      priority: 2
    });
  }

  const enabledProviders = streamingManager.getAvailableProviders();
  console.log(`Enabled providers: ${enabledProviders.join(', ')}`);

  return streamingManager;
}

module.exports = {
  StreamingProviderManager,
  streamingManager,
  initializeStreamingProviders
};
