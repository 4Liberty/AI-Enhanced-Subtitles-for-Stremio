// Modern UI JavaScript for Stremio Addon Control Panel
class StremioAddonUI {
    constructor() {
        this.currentTab = 'dashboard';
        this.healthData = {};
        this.performanceData = {
            responseTime: [],
            successRate: [],
            memoryUsage: []
        };
        this.activityLog = [];
        this.settings = {};
        this.refreshInterval = null;
        
        this.init();
    }

    init() {
        console.log('Initializing Stremio Addon UI...');
        
        // Setup event listeners first
        this.setupEventListeners();
        
        // Load settings and initialize components
        this.loadSettings();
        this.startHealthMonitoring();
        this.updateDashboard();
        this.populateProviders();
        this.populateSubtitleSources();
        
        // Show success notification
        this.showNotification('System initialized successfully', 'success');
        
        // Initialize charts
        this.initializeCharts();
        
        console.log('Stremio Addon UI initialization complete');
    }

    setupEventListeners() {
        console.log('Setting up event listeners...');
        
        // Tab navigation with more robust handling
        const tabs = document.querySelectorAll('.nav-tab');
        console.log(`Found ${tabs.length} tabs`);
        
        tabs.forEach((tab, index) => {
            console.log(`Setting up tab ${index}: ${tab.dataset.tab}`);
            tab.addEventListener('click', (e) => {
                e.preventDefault();
                console.log('Tab clicked:', e.target);
                
                // Get the tab name from the clicked element or its parent
                const tabName = e.target.dataset.tab || e.target.closest('.nav-tab').dataset.tab;
                console.log('Tab name:', tabName);
                
                if (tabName) {
                    this.switchTab(tabName);
                } else {
                    console.error('No tab name found for clicked element');
                }
            });
        });

        // Range inputs
        document.querySelectorAll('.form-range').forEach(range => {
            range.addEventListener('input', (e) => {
                const valueSpan = e.target.nextElementSibling;
                if (valueSpan && valueSpan.classList.contains('range-value')) {
                    valueSpan.textContent = e.target.value;
                }
            });
        });

        // Settings auto-save
        document.querySelectorAll('.form-input, .form-select, .toggle-input').forEach(input => {
            input.addEventListener('change', () => {
                this.saveSettings();
            });
        });

        // Import config file
        const configFileInput = document.getElementById('config-file');
        if (configFileInput) {
            configFileInput.addEventListener('change', (e) => {
                this.handleConfigImport(e);
            });
        }

        // Addon installation buttons
        const installBtn = document.getElementById('install-addon-btn');
        if (installBtn) {
            installBtn.addEventListener('click', () => {
                this.installAddon();
            });
        }

        const copyManifestBtn = document.getElementById('copy-manifest-btn');
        if (copyManifestBtn) {
            copyManifestBtn.addEventListener('click', () => {
                this.copyManifestUrl();
            });
        }

        const copyAddonBtn = document.getElementById('copy-addon-btn');
        if (copyAddonBtn) {
            copyAddonBtn.addEventListener('click', () => {
                this.copyAddonUrl();
            });
        }
        
        console.log('Event listeners setup complete');
    }

    switchTab(tabName) {
        console.log(`Switching to tab: ${tabName}`);
        
        // Update active tab
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        
        const activeTab = document.querySelector(`[data-tab="${tabName}"]`);
        if (activeTab) {
            activeTab.classList.add('active');
            console.log(`Tab button activated: ${tabName}`);
        } else {
            console.error(`Tab button not found for: ${tabName}`);
        }

        // Update content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        
        const tabContent = document.getElementById(tabName);
        if (tabContent) {
            tabContent.classList.add('active');
            console.log(`Tab content activated: ${tabName}`);
        } else {
            console.error(`Tab content not found for: ${tabName}`);
        }

        this.currentTab = tabName;

        // Load tab-specific data
        switch(tabName) {
            case 'dashboard':
                this.updateDashboard();
                break;
            case 'subtitles':
                this.updateSubtitlesTab();
                break;
            case 'torrents':
                this.updateTorrentsTab();
                break;
            case 'health':
                this.initializeCharts();
                this.updateHealthTab();
                break;
            case 'settings':
                this.updateSettingsTab();
                break;
        }
    }

    async updateDashboard() {
        try {
            console.log('Updating dashboard...');
            
            // Update quick stats using the new dashboard API
            const dashboardData = await this.fetchDashboardData();
            if (dashboardData) {
                console.log('Dashboard data received:', dashboardData);
                
                // Update quick stats
                document.getElementById('subtitles-processed').textContent = dashboardData.subtitlesProcessed || 0;
                document.getElementById('torrents-found').textContent = dashboardData.torrentsFound || 0;
                document.getElementById('active-providers').textContent = dashboardData.activeProviders || 0;
                document.getElementById('uptime').textContent = this.formatUptime(dashboardData.uptime || 0);

                // Update system status
                await this.updateSystemStatus();

                // Update performance metrics
                this.updatePerformanceMetrics(dashboardData);
                
                // Update system info
                this.updateSystemInfo(dashboardData);
                
                console.log('Dashboard updated successfully');
            }

        } catch (error) {
            console.error('Error updating dashboard:', error);
            this.showNotification('Failed to update dashboard - ' + error.message, 'error');
        }
    }

    async fetchDashboardData() {
        try {
            console.log('Fetching dashboard data...');
            const response = await fetch('/api/dashboard');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            console.log('Dashboard data fetched successfully');
            return data;
        } catch (error) {
            console.error('Error fetching dashboard data:', error);
            return null;
        }
    }

    async fetchStats() {
        try {
            const response = await fetch('/api/stats');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Error fetching stats:', error);
            return null;
        }
    }

    updateSystemInfo(dashboardData) {
        try {
            // Update memory usage if elements exist
            const memoryUsageElement = document.getElementById('memory-usage');
            if (memoryUsageElement) {
                memoryUsageElement.textContent = `${dashboardData.memoryUsage || 0} MB`;
            }
            
            const systemMemoryElement = document.getElementById('system-memory');
            if (systemMemoryElement) {
                systemMemoryElement.textContent = `${dashboardData.systemMemory || 0} MB`;
            }
            
            // Update success rate
            const successRateElement = document.getElementById('success-rate');
            if (successRateElement) {
                successRateElement.textContent = `${dashboardData.successRate || 0}%`;
            }
            
            // Update average response time
            const avgResponseTimeElement = document.getElementById('avg-response-time');
            if (avgResponseTimeElement) {
                avgResponseTimeElement.textContent = `${dashboardData.averageResponseTime || 0}ms`;
            }
            
        } catch (error) {
            console.error('Error updating system info:', error);
        }
    }

    formatUptime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return `${hours}h ${minutes}m`;
    }

    async updateSystemStatus() {
        const statusItems = [
            { id: 'subtitle-service-status', endpoint: '/api/health/subtitles' },
            { id: 'realdebrid-service-status', endpoint: '/api/health/realdebrid' },
            { id: 'torrent-providers-status', endpoint: '/api/health/providers' },
            { id: 'api-keys-status', endpoint: '/api/health/keys' }
        ];

        for (const item of statusItems) {
            try {
                const response = await fetch(item.endpoint);
                const data = await response.json();
                this.updateStatusItem(item.id, data.status, data.message);
            } catch (error) {
                this.updateStatusItem(item.id, 'error', 'Connection failed');
            }
        }
    }

    updateStatusItem(id, status, message) {
        const element = document.getElementById(id);
        if (!element) return;

        const icon = element.querySelector('.status-icon i');
        const value = element.querySelector('.status-value');

        // Remove existing status classes
        icon.classList.remove('status-healthy', 'status-warning', 'status-error', 'status-unknown');
        
        // Add new status class
        icon.classList.add(`status-${status}`);
        value.textContent = message;

        // Update overall status
        this.updateOverallStatus();
    }

    updateOverallStatus() {
        const statusItems = document.querySelectorAll('.status-item i');
        let healthy = 0;
        let warning = 0;
        let error = 0;

        statusItems.forEach(item => {
            if (item.classList.contains('status-healthy')) healthy++;
            else if (item.classList.contains('status-warning')) warning++;
            else if (item.classList.contains('status-error')) error++;
        });

        const overall = document.getElementById('overall-status');
        const dot = overall.querySelector('.status-dot');
        const text = overall.querySelector('span');

        if (error > 0) {
            dot.className = 'status-dot status-error';
            text.textContent = `${error} error${error > 1 ? 's' : ''}`;
        } else if (warning > 0) {
            dot.className = 'status-dot status-warning';
            text.textContent = `${warning} warning${warning > 1 ? 's' : ''}`;
        } else if (healthy === statusItems.length) {
            dot.className = 'status-dot status-healthy';
            text.textContent = 'All systems operational';
        } else {
            dot.className = 'status-dot status-loading';
            text.textContent = 'Checking systems...';
        }
    }

    updatePerformanceMetrics(stats) {
        // Response time
        const responseTime = stats.averageResponseTime || 0;
        const responseTimeBar = document.getElementById('response-time-bar');
        const responseTimeValue = document.getElementById('response-time-value');
        
        responseTimeBar.style.width = `${Math.min(responseTime / 10, 100)}%`;
        responseTimeValue.textContent = `${responseTime}ms`;

        // Memory usage
        const memoryUsage = stats.memoryUsage || 0;
        const memoryBar = document.getElementById('memory-usage-bar');
        const memoryValue = document.getElementById('memory-usage-value');
        
        memoryBar.style.width = `${Math.min(memoryUsage / 500, 100)}%`;
        memoryValue.textContent = `${memoryUsage}MB`;

        // Success rate
        const successRate = stats.successRate || 0;
        const successBar = document.getElementById('success-rate-bar');
        const successValue = document.getElementById('success-rate-value');
        
        successBar.style.width = `${successRate}%`;
        successValue.textContent = `${successRate}%`;
    }

    async updateSubtitlesTab() {
        try {
            const response = await fetch('/api/subtitles/sources');
            const sources = await response.json();
            this.populateSubtitleSources(sources);
        } catch (error) {
            console.error('Error updating subtitles tab:', error);
        }
    }

    async updateTorrentsTab() {
        try {
            // Update Real-Debrid status
            const rdResponse = await fetch('/api/realdebrid/status');
            const rdData = await rdResponse.json();
            this.updateRealDebridStatus(rdData);

            // Update provider status
            const providersResponse = await fetch('/api/torrents/providers');
            const providersData = await providersResponse.json();
            this.populateProviders(providersData);

            // Update cache stats
            const cacheResponse = await fetch('/api/cache/stats');
            const cacheData = await cacheResponse.json();
            this.updateCacheStats(cacheData);

        } catch (error) {
            console.error('Error updating torrents tab:', error);
        }
    }

    async updateHealthTab() {
        try {
            const response = await fetch('/api/health/detailed');
            const healthData = await response.json();
            
            this.updateHealthScore(healthData);
            this.updateHealthChecks(healthData.checks);
            this.updateErrorLogs(healthData.errors);
            
            // Update performance charts
            this.updatePerformanceCharts();

        } catch (error) {
            console.error('Error updating health tab:', error);
        }
    }

    updateHealthScore(data) {
        const scoreElement = document.getElementById('health-score');
        const scoreCircle = document.getElementById('health-score-circle');
        
        const score = data.overallScore || 0;
        scoreElement.textContent = score;
        
        // Update circle color based on score
        let color = '#4CAF50'; // Green
        if (score < 70) color = '#FF9800'; // Orange
        if (score < 40) color = '#F44336'; // Red
        
        const percentage = (score / 100) * 360;
        scoreCircle.style.background = `conic-gradient(${color} 0deg, ${color} ${percentage}deg, rgba(255, 255, 255, 0.1) ${percentage}deg)`;
        
        // Update detail values
        document.getElementById('apis-health').textContent = data.apis || '--';
        document.getElementById('services-health').textContent = data.services || '--';
        document.getElementById('providers-health').textContent = data.providers || '--';
    }

    updateHealthChecks(checks) {
        const container = document.getElementById('health-checks');
        container.innerHTML = '';

        checks.forEach(check => {
            const checkElement = document.createElement('div');
            checkElement.className = 'status-item';
            checkElement.innerHTML = `
                <div class="status-icon">
                    <i class="fas fa-circle status-${check.status}"></i>
                </div>
                <span class="status-text">${check.name}</span>
                <span class="status-value">${check.message}</span>
            `;
            container.appendChild(checkElement);
        });
    }

    updateErrorLogs(errors) {
        const container = document.getElementById('error-logs');
        const logsContainer = container.querySelector('.error-logs') || container;
        
        logsContainer.innerHTML = '';

        if (errors.length === 0) {
            logsContainer.innerHTML = '<div class="log-item"><span class="log-time">System</span><span class="log-message log-success">No errors detected</span></div>';
            return;
        }

        errors.forEach(error => {
            const logItem = document.createElement('div');
            logItem.className = 'log-item';
            logItem.innerHTML = `
                <span class="log-time">${new Date(error.timestamp).toLocaleTimeString()}</span>
                <span class="log-message log-${error.level}">${error.message}</span>
            `;
            logsContainer.appendChild(logItem);
        });
    }

    updateRealDebridStatus(data) {
        document.getElementById('rd-api-status').textContent = data.apiStatus || 'Unknown';
        document.getElementById('rd-account-type').textContent = data.accountType || '--';
        document.getElementById('rd-expiration').textContent = data.expiration || '--';
        document.getElementById('rd-traffic').textContent = data.trafficLeft || '--';
    }

    updateCacheStats(data) {
        document.getElementById('cached-torrents').textContent = data.cachedTorrents || 0;
        document.getElementById('cache-hit-rate').textContent = `${data.hitRate || 0}%`;
        document.getElementById('cache-size').textContent = `${data.size || 0} MB`;
    }

    populateProviders(providers) {
        const container = document.getElementById('torrent-providers');
        if (!container) return;

        const defaultProviders = [
            { name: 'YTS', type: 'api', status: 'healthy', description: 'High-quality movies' },
            { name: 'EZTV', type: 'api', status: 'healthy', description: 'TV shows and movies' },
            { name: 'RARBG', type: 'api', status: 'healthy', description: 'Movies and TV via mirrors' },
            { name: 'ThePirateBay', type: 'api', status: 'healthy', description: 'General torrents' },
            { name: 'TorrentGalaxy', type: 'api', status: 'healthy', description: 'Movies and TV' },
            { name: 'Nyaa.si', type: 'api', status: 'healthy', description: 'Anime and Asian content' },
            { name: 'AniDex', type: 'api', status: 'healthy', description: 'Anime torrents' },
            { name: 'Jackett', type: 'api', status: 'warning', description: 'Meta-search (requires config)' },
            { name: '1337x', type: 'scraping', status: 'healthy', description: 'General torrents (web scraping)' },
            { name: 'KickassTorrents', type: 'scraping', status: 'healthy', description: 'General torrents (web scraping)' },
            { name: 'MagnetDL', type: 'scraping', status: 'healthy', description: 'Magnet links (web scraping)' },
            { name: 'Rutor', type: 'scraping', status: 'warning', description: 'Russian torrents (framework ready)' },
            { name: 'Torrent9', type: 'scraping', status: 'warning', description: 'French torrents (framework ready)' }
        ];

        const providerList = providers || defaultProviders;
        container.innerHTML = '';

        providerList.forEach(provider => {
            const providerElement = document.createElement('div');
            providerElement.className = 'provider-item';
            providerElement.innerHTML = `
                <div class="provider-name">
                    <i class="fas fa-${provider.type === 'api' ? 'plug' : 'spider'}"></i>
                    <span>${provider.name}</span>
                    <span class="provider-type ${provider.type}">${provider.type.toUpperCase()}</span>
                </div>
                <div class="provider-status">
                    <i class="fas fa-circle status-${provider.status}"></i>
                    <span>${provider.description}</span>
                </div>
            `;
            container.appendChild(providerElement);
        });
    }

    populateSubtitleSources(sources) {
        const container = document.getElementById('subtitle-sources');
        if (!container) return;

        const defaultSources = [
            { name: 'OpenSubtitles', status: 'healthy', description: 'Primary subtitle source' },
            { name: 'SubDL', status: 'healthy', description: 'Secondary subtitle source' },
            { name: 'AI Correction', status: 'healthy', description: 'Google Gemini powered' },
            { name: 'Local Cache', status: 'healthy', description: 'Cached subtitles' }
        ];

        const sourceList = sources || defaultSources;
        container.innerHTML = '';

        sourceList.forEach(source => {
            const sourceElement = document.createElement('div');
            sourceElement.className = 'source-item';
            sourceElement.innerHTML = `
                <div class="source-name">
                    <i class="fas fa-closed-captioning"></i>
                    <span>${source.name}</span>
                </div>
                <div class="source-status">
                    <i class="fas fa-circle status-${source.status}"></i>
                    <span>${source.description}</span>
                </div>
            `;
            container.appendChild(sourceElement);
        });
    }

    startHealthMonitoring() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }

        this.refreshInterval = setInterval(() => {
            if (this.currentTab === 'dashboard') {
                this.updateDashboard();
            } else if (this.currentTab === 'health') {
                this.updateHealthTab();
            }
        }, 10000); // Update every 10 seconds
    }

    async fetchStats() {
        try {
            const response = await fetch('/api/stats');
            return await response.json();
        } catch (error) {
            console.error('Error fetching stats:', error);
            return {};
        }
    }

    formatUptime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return `${hours}h ${minutes}m`;
    }

    addToActivityLog(message, type = 'info') {
        const activity = {
            timestamp: new Date(),
            message,
            type
        };

        this.activityLog.unshift(activity);
        if (this.activityLog.length > 50) {
            this.activityLog = this.activityLog.slice(0, 50);
        }

        this.updateActivityDisplay();
    }

    updateActivityDisplay() {
        const container = document.getElementById('activity-list');
        if (!container) return;

        container.innerHTML = '';
        
        this.activityLog.slice(0, 10).forEach(activity => {
            const activityElement = document.createElement('div');
            activityElement.className = 'activity-item';
            activityElement.innerHTML = `
                <div class="activity-time">${activity.timestamp.toLocaleTimeString()}</div>
                <div class="activity-text">${activity.message}</div>
            `;
            container.appendChild(activityElement);
        });
    }

    async saveSettings() {
        try {
            const settings = {
                aiProvider: document.getElementById('ai-provider').value,
                aiModel: document.getElementById('ai-model').value,
                correctionIntensity: document.getElementById('correction-intensity').value,
                aiTemperature: document.getElementById('ai-temperature').value,
                primaryLanguage: document.getElementById('primary-language').value,
                fallbackLanguage: document.getElementById('fallback-language').value,
                autoTranslate: document.getElementById('auto-translate').checked,
                hearingImpaired: document.getElementById('hearing-impaired').checked,
                aiEnabled: document.getElementById('ai-enabled').checked,
                debugMode: document.getElementById('debug-mode').checked,
                scrapingEnabled: document.getElementById('scraping-enabled').checked,
                cacheEnabled: document.getElementById('cache-enabled').checked,
                maxConcurrentRequests: document.getElementById('max-concurrent-requests').value,
                requestTimeout: document.getElementById('request-timeout').value,
                minSubtitleScore: document.getElementById('min-subtitle-score').value,
                apiKeys: {
                    gemini: document.getElementById('gemini-api-key').value,
                    openai: document.getElementById('openai-api-key').value,
                    claude: document.getElementById('claude-api-key').value,
                    opensubtitles: document.getElementById('opensubtitles-api-key').value,
                    tmdb: document.getElementById('tmdb-api-key').value,
                    subdl: document.getElementById('subdl-api-key').value,
                    realdebrid: document.getElementById('realdebrid-api-key').value,
                    jackett: document.getElementById('jackett-api-key').value
                },
                jackettUrl: document.getElementById('jackett-url').value
            };

            const response = await fetch('/api/settings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(settings)
            });

            if (response.ok) {
                this.showNotification('Settings saved successfully', 'success');
                // Store locally as well
                localStorage.setItem('stremio-addon-settings', JSON.stringify(settings));
            } else {
                throw new Error('Failed to save settings');
            }
        } catch (error) {
            console.error('Error saving settings:', error);
            this.showNotification('Failed to save settings: ' + error.message, 'error');
        }
    }

    async loadSettings() {
        try {
            // Try to load from server first
            const response = await fetch('/api/settings');
            let settings = null;
            
            if (response.ok) {
                settings = await response.json();
            } else {
                // Fallback to local storage
                const stored = localStorage.getItem('stremio-addon-settings');
                if (stored) {
                    settings = JSON.parse(stored);
                }
            }

            if (settings) {
                this.applySettings(settings);
            }
        } catch (error) {
            console.error('Error loading settings:', error);
            // Try local storage as fallback
            const stored = localStorage.getItem('stremio-addon-settings');
            if (stored) {
                this.applySettings(JSON.parse(stored));
            }
        }
    }

    applySettings(settings) {
        // Apply AI settings
        if (settings.aiProvider) document.getElementById('ai-provider').value = settings.aiProvider;
        if (settings.aiModel) document.getElementById('ai-model').value = settings.aiModel;
        if (settings.correctionIntensity) {
            document.getElementById('correction-intensity').value = settings.correctionIntensity;
            document.querySelector('#correction-intensity + .range-value').textContent = settings.correctionIntensity;
        }
        if (settings.aiTemperature) {
            document.getElementById('ai-temperature').value = settings.aiTemperature;
            document.querySelector('#ai-temperature + .range-value').textContent = settings.aiTemperature;
        }

        // Apply language settings
        if (settings.primaryLanguage) document.getElementById('primary-language').value = settings.primaryLanguage;
        if (settings.fallbackLanguage) document.getElementById('fallback-language').value = settings.fallbackLanguage;
        if (settings.autoTranslate !== undefined) document.getElementById('auto-translate').checked = settings.autoTranslate;
        if (settings.hearingImpaired !== undefined) document.getElementById('hearing-impaired').checked = settings.hearingImpaired;

        // Apply advanced settings
        if (settings.aiEnabled !== undefined) document.getElementById('ai-enabled').checked = settings.aiEnabled;
        if (settings.debugMode !== undefined) document.getElementById('debug-mode').checked = settings.debugMode;
        if (settings.scrapingEnabled !== undefined) document.getElementById('scraping-enabled').checked = settings.scrapingEnabled;
        if (settings.cacheEnabled !== undefined) document.getElementById('cache-enabled').checked = settings.cacheEnabled;
        if (settings.maxConcurrentRequests) document.getElementById('max-concurrent-requests').value = settings.maxConcurrentRequests;
        if (settings.requestTimeout) document.getElementById('request-timeout').value = settings.requestTimeout;
        if (settings.minSubtitleScore) {
            document.getElementById('min-subtitle-score').value = settings.minSubtitleScore;
            document.querySelector('#min-subtitle-score + .range-value').textContent = settings.minSubtitleScore;
        }

        // Apply API keys (only if they exist)
        if (settings.apiKeys) {
            Object.entries(settings.apiKeys).forEach(([key, value]) => {
                if (value) {
                    const element = document.getElementById(`${key}-api-key`);
                    if (element) element.value = value;
                }
            });
        }

        // Apply Jackett URL
        if (settings.jackettUrl) document.getElementById('jackett-url').value = settings.jackettUrl;

        console.log('Settings applied successfully');
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check' : type === 'error' ? 'times' : 'info'}"></i>
            <span>${message}</span>
        `;

        // Add to page
        document.body.appendChild(notification);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            notification.remove();
        }, 5000);
    }

    // API Functions
    async testSubtitleSearch() {
        const imdbId = document.getElementById('test-imdb').value;
        const language = document.getElementById('test-language').value;
        const resultsDiv = document.getElementById('subtitle-test-results');
        
        if (!imdbId) {
            this.showNotification('Please enter an IMDb ID', 'error');
            return;
        }

        resultsDiv.innerHTML = '<div class="test-loading">Testing subtitle search...</div>';
        resultsDiv.classList.add('show');

        try {
            const response = await fetch('/api/test/subtitle', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ imdbId, language })
            });

            const result = await response.json();
            
            if (response.ok && result.subtitles && result.subtitles.length > 0) {
                resultsDiv.innerHTML = `
                    <div class="test-success">
                        <h4>✓ Found ${result.subtitles.length} subtitle(s)</h4>
                        <pre>${JSON.stringify(result.subtitles, null, 2)}</pre>
                    </div>
                `;
                this.showNotification('Subtitle search successful', 'success');
            } else {
                resultsDiv.innerHTML = `
                    <div class="test-error">
                        <h4>⚠ No subtitles found</h4>
                        <pre>${JSON.stringify(result, null, 2)}</pre>
                    </div>
                `;
                this.showNotification('No subtitles found', 'warning');
            }
        } catch (error) {
            resultsDiv.innerHTML = `
                <div class="test-error">
                    <h4>✗ Test failed</h4>
                    <pre>${error.message}</pre>
                </div>
            `;
            this.showNotification('Test failed: ' + error.message, 'error');
        }
    }

    async testTorrentSearch() {
        const imdbId = document.getElementById('torrent-test-imdb').value;
        const quality = document.getElementById('torrent-test-quality').value;
        const resultsDiv = document.getElementById('torrent-test-results');
        
        if (!imdbId) {
            this.showNotification('Please enter an IMDb ID', 'error');
            return;
        }

        resultsDiv.innerHTML = '<div class="test-loading">Testing torrent search...</div>';
        resultsDiv.classList.add('show');

        try {
            const response = await fetch('/api/test/torrent', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ imdbId, quality })
            });

            const result = await response.json();
            
            if (response.ok && result.streams && result.streams.length > 0) {
                resultsDiv.innerHTML = `
                    <div class="test-success">
                        <h4>✓ Found ${result.streams.length} stream(s)</h4>
                        <pre>${JSON.stringify(result.streams, null, 2)}</pre>
                    </div>
                `;
                this.showNotification('Torrent search successful', 'success');
            } else {
                resultsDiv.innerHTML = `
                    <div class="test-error">
                        <h4>⚠ No streams found</h4>
                        <pre>${JSON.stringify(result, null, 2)}</pre>
                    </div>
                `;
                this.showNotification('No streams found', 'warning');
            }
        } catch (error) {
            resultsDiv.innerHTML = `
                <div class="test-error">
                    <h4>✗ Test failed</h4>
                    <pre>${error.message}</pre>
                </div>
            `;
            this.showNotification('Test failed: ' + error.message, 'error');
        }
    }

    toggleVisibility(inputId) {
        const input = document.getElementById(inputId);
        const button = input.nextElementSibling;
        const icon = button.querySelector('i');
        
        if (input.type === 'password') {
            input.type = 'text';
            icon.classList.remove('fa-eye');
            icon.classList.add('fa-eye-slash');
        } else {
            input.type = 'password';
            icon.classList.remove('fa-eye-slash');
            icon.classList.add('fa-eye');
        }
    }

    async testApiKeys() {
        const results = {};
        const keys = {
            gemini: document.getElementById('gemini-api-key').value,
            openai: document.getElementById('openai-api-key').value,
            claude: document.getElementById('claude-api-key').value,
            opensubtitles: document.getElementById('opensubtitles-api-key').value,
            tmdb: document.getElementById('tmdb-api-key').value,
            subdl: document.getElementById('subdl-api-key').value,
            realdebrid: document.getElementById('realdebrid-api-key').value,
            jackett: document.getElementById('jackett-api-key').value
        };

        this.showNotification('Testing API keys...', 'info');

        for (const [key, value] of Object.entries(keys)) {
            if (value && value !== '***') {
                try {
                    // Test each API key
                    const response = await fetch(`/api/test/key/${key}`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ apiKey: value })
                    });

                    const result = await response.json();
                    results[key] = result.success ? 'Valid' : 'Invalid';
                } catch (error) {
                    results[key] = 'Error';
                }
            } else {
                results[key] = 'Not set';
            }
        }

        let message = 'API Key Test Results:\n';
        Object.entries(results).forEach(([key, result]) => {
            message += `${key}: ${result}\n`;
        });

        this.showNotification(message, 'info');
    }

    exportConfig() {
        const settings = {
            aiProvider: document.getElementById('ai-provider').value,
            aiModel: document.getElementById('ai-model').value,
            correctionIntensity: document.getElementById('correction-intensity').value,
            // ... other settings
        };

        const dataStr = JSON.stringify(settings, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        
        const exportFileDefaultName = 'stremio-addon-config.json';
        
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
    }

    importConfig() {
        document.getElementById('config-file').click();
    }

    handleConfigImport(event) {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const config = JSON.parse(e.target.result);
                    this.applySettings(config);
                    this.showNotification('Configuration imported successfully', 'success');
                } catch (error) {
                    this.showNotification('Failed to import configuration: ' + error.message, 'error');
                }
            };
            reader.readAsText(file);
        }
    }

    clearErrorLogs() {
        document.getElementById('error-logs').innerHTML = '<div class="log-item"><span class="log-time">System</span><span class="log-message log-success">Error logs cleared</span></div>';
        this.showNotification('Error logs cleared', 'success');
    }

    exportErrorLogs() {
        const logs = Array.from(document.querySelectorAll('.log-item')).map(item => {
            const time = item.querySelector('.log-time').textContent;
            const message = item.querySelector('.log-message').textContent;
            return { time, message };
        });

        const dataStr = JSON.stringify(logs, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', 'error-logs.json');
        linkElement.click();
    }

    clearCache() {
        fetch('/api/cache/clear', { method: 'POST' })
            .then(response => response.json())
            .then(data => {
                this.showNotification('Cache cleared successfully', 'success');
                this.updateTorrentsTab();
            })
            .catch(error => {
                this.showNotification('Failed to clear cache: ' + error.message, 'error');
            });
    }

    startHealthMonitoring() {
        // Update health data every 30 seconds
        this.refreshInterval = setInterval(() => {
            if (this.currentTab === 'dashboard') {
                this.updateDashboard();
            } else if (this.currentTab === 'health') {
                this.updateHealthTab();
            }
        }, 30000);
    }

    updateSettingsTab() {
        // Settings tab is mostly static, no need to update
        console.log('Settings tab loaded');
    }

    // Simple chart implementation
    createSimpleChart(canvasId, data, options = {}) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        const { width, height } = canvas;
        
        // Clear canvas
        ctx.clearRect(0, 0, width, height);
        
        // Set defaults
        const color = options.color || '#2196F3';
        const label = options.label || 'Data';
        const maxPoints = options.maxPoints || 50;
        
        // Prepare data
        const points = data.slice(-maxPoints);
        if (points.length === 0) {
            ctx.fillStyle = '#757575';
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('No data available', width / 2, height / 2);
            return;
        }
        
        const max = Math.max(...points);
        const min = Math.min(...points);
        const range = max - min || 1;
        
        // Draw grid
        ctx.strokeStyle = '#404040';
        ctx.lineWidth = 1;
        
        // Vertical lines
        for (let i = 0; i <= 10; i++) {
            const x = (i / 10) * width;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
        
        // Horizontal lines
        for (let i = 0; i <= 5; i++) {
            const y = (i / 5) * height;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }
        
        // Draw line
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        points.forEach((point, index) => {
            const x = (index / (points.length - 1)) * width;
            const y = height - ((point - min) / range) * height;
            
            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        
        ctx.stroke();
        
        // Draw points
        ctx.fillStyle = color;
        points.forEach((point, index) => {
            const x = (index / (points.length - 1)) * width;
            const y = height - ((point - min) / range) * height;
            
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, 2 * Math.PI);
            ctx.fill();
        });
        
        // Draw labels
        ctx.fillStyle = '#B0B0B0';
        ctx.font = '12px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(`${label}: ${points[points.length - 1]}`, 10, 20);
        ctx.fillText(`Max: ${max}`, 10, 35);
        ctx.fillText(`Min: ${min}`, 10, 50);
    }

    // Update performance charts
    updatePerformanceCharts() {
        if (this.currentTab !== 'health') return;
        
        // Create sample data for demonstration
        const now = Date.now();
        const responseTimeData = this.performanceData.responseTime.length > 0 
            ? this.performanceData.responseTime 
            : Array.from({ length: 20 }, (_, i) => Math.random() * 100 + 50);
        
        const successRateData = this.performanceData.successRate.length > 0 
            ? this.performanceData.successRate 
            : Array.from({ length: 20 }, (_, i) => 95 + Math.random() * 5);
        
        this.createSimpleChart('response-time-chart', responseTimeData, {
            color: '#2196F3',
            label: 'Response Time (ms)'
        });
        
        this.createSimpleChart('success-rate-chart', successRateData, {
            color: '#4CAF50',
            label: 'Success Rate (%)'
        });
    }

    initializeCharts() {
        // Initialize canvas elements for charts
        const responseTimeCanvas = document.getElementById('response-time-chart');
        const successRateCanvas = document.getElementById('success-rate-chart');
        
        if (responseTimeCanvas) {
            const container = responseTimeCanvas.parentElement;
            responseTimeCanvas.width = container.offsetWidth - 32; // Account for padding
            responseTimeCanvas.height = container.offsetHeight - 32;
        }
        
        if (successRateCanvas) {
            const container = successRateCanvas.parentElement;
            successRateCanvas.width = container.offsetWidth - 32; // Account for padding
            successRateCanvas.height = container.offsetHeight - 32;
        }
        
        // Add resize observer to handle window resize
        if (window.ResizeObserver) {
            const resizeObserver = new ResizeObserver(() => {
                setTimeout(() => {
                    this.initializeCharts();
                    this.updatePerformanceCharts();
                }, 100);
            });
            
            if (responseTimeCanvas) resizeObserver.observe(responseTimeCanvas.parentElement);
            if (successRateCanvas) resizeObserver.observe(successRateCanvas.parentElement);
        }
    }

    // Addon installation methods
    async installAddon() {
        try {
            const addonUrl = this.getAddonUrl();
            
            // Try to open Stremio directly
            const stremioUrl = `stremio://${addonUrl}`;
            window.open(stremioUrl, '_blank');
            
            this.showNotification('Addon installation initiated! If Stremio doesn\'t open automatically, please copy the URL manually.', 'success');
            
            // Also show the URL for manual copy
            this.showAddonUrls();
            
        } catch (error) {
            console.error('Error installing addon:', error);
            this.showNotification('Error installing addon. Please copy the URL manually.', 'error');
            this.showAddonUrls();
        }
    }

    getAddonUrl() {
        const baseUrl = window.location.origin;
        return `${baseUrl}/manifest.json`;
    }

    showAddonUrls() {
        const addonUrl = this.getAddonUrl();
        const stremioUrl = `stremio://${addonUrl}`;
        
        const urlsHtml = `
            <div class="addon-urls">
                <h4>Addon URLs:</h4>
                <div class="url-item">
                    <label>Manifest URL:</label>
                    <input type="text" value="${addonUrl}" readonly onclick="this.select()">
                    <button onclick="navigator.clipboard.writeText('${addonUrl}')">Copy</button>
                </div>
                <div class="url-item">
                    <label>Stremio URL:</label>
                    <input type="text" value="${stremioUrl}" readonly onclick="this.select()">
                    <button onclick="navigator.clipboard.writeText('${stremioUrl}')">Copy</button>
                </div>
            </div>
        `;
        
        document.getElementById('addon-urls').innerHTML = urlsHtml;
    }

    async copyManifestUrl() {
        try {
            const addonUrl = this.getAddonUrl();
            await navigator.clipboard.writeText(addonUrl);
            this.showNotification('Manifest URL copied to clipboard!', 'success');
        } catch (error) {
            console.error('Error copying manifest URL:', error);
            this.showNotification('Error copying URL. Please copy manually.', 'error');
            this.showAddonUrls();
        }
    }

    async copyAddonUrl() {
        try {
            const addonUrl = this.getAddonUrl();
            const stremioUrl = `stremio://${addonUrl}`;
            await navigator.clipboard.writeText(stremioUrl);
            this.showNotification('Stremio addon URL copied to clipboard!', 'success');
        } catch (error) {
            console.error('Error copying addon URL:', error);
            this.showNotification('Error copying URL. Please copy manually.', 'error');
            this.showAddonUrls();
        }
    }
}

// Global functions for HTML onclick handlers
function testSubtitleSearch() {
    window.stremioUI.testSubtitleSearch();
}

function testTorrentSearch() {
    window.stremioUI.testTorrentSearch();
}

function toggleVisibility(inputId) {
    window.stremioUI.toggleVisibility(inputId);
}

// Initialize the UI when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM Content Loaded - Initializing Stremio Addon UI...');
    window.stremioUI = new StremioAddonUI();
    console.log('Stremio Addon UI initialized successfully');
});

// Fallback initialization if DOMContentLoaded already fired
if (document.readyState === 'loading') {
    // DOMContentLoaded has not fired yet
    console.log('DOM is still loading...');
} else {
    // DOM is already loaded
    console.log('DOM already loaded - Initializing Stremio Addon UI...');
    window.stremioUI = new StremioAddonUI();
    console.log('Stremio Addon UI initialized successfully');
}
