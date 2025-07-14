// Modern UI JavaScript for Stremio Addon Control Panel
class StremioAddonUI {
    constructor() {
        this.currentTab = 'dashboard';
        this.healthData = {};
        this.performanceData = {
            responseTime: [],
            successRate: [],
            memoryUsage: [],
            cpuUsage: [],
            activeConnections: []
        };
        this.activityLog = [];
        this.settings = {};
        this.refreshInterval = null;
        this.performanceInterval = null;
        this.chartInstances = {};
        
        this.init();
    }

    init() {
        console.log('Initializing Enhanced Stremio Addon UI...');
        
        try {
            // Setup event listeners first
            this.setupEventListeners();
            
            // Load settings and initialize components
            this.loadSettings();
            this.startHealthMonitoring();
            this.startPerformanceMonitoring();
            
            // Initialize dashboard with error handling
            this.updateDashboard().catch(error => {
                console.error('Initial dashboard update failed:', error);
                this.showNotification('Dashboard initialization failed - some features may be limited', 'warning');
            });
            
            this.updateTorrentsTab();
            this.populateProviders();
            this.populateSubtitleSources();
            
            // Show success notification
            this.showNotification('Enhanced UI initialized successfully', 'success');
            
            // Initialize charts with error handling
            this.initializeCharts().catch(error => {
                console.error('Chart initialization failed:', error);
            });
            
            console.log('Enhanced Stremio Addon UI initialization complete');
            
        } catch (error) {
            console.error('Critical error during UI initialization:', error);
            this.showNotification('System initialization failed - please refresh the page', 'error');
        }
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
            
            // Show loading state
            this.showLoadingState();
            
            // Update quick stats using the new dashboard API
            const dashboardData = await this.fetchDashboardData();
            if (dashboardData) {
                console.log('Dashboard data received:', dashboardData);
                
                // Update quick stats safely
                this.updateElementSafely('subtitles-processed', dashboardData.subtitlesProcessed || 0);
                this.updateElementSafely('torrents-found', dashboardData.torrentsFound || 0);
                this.updateElementSafely('active-providers', dashboardData.activeProviders || 0);
                this.updateElementSafely('uptime', this.formatUptime(dashboardData.uptime || 0));

                // Update system status
                await this.updateSystemStatus(dashboardData.status);

                // Update performance metrics
                this.updatePerformanceMetrics(dashboardData);
                
                // Update system info
                this.updateSystemInfo(dashboardData);
                
                // Hide loading state
                this.hideLoadingState();
                
                console.log('Dashboard updated successfully');
            } else {
                // Handle case where no data is returned
                this.showFallbackData();
                this.hideLoadingState();
            }

        } catch (error) {
            console.error('Error updating dashboard:', error);
            this.hideLoadingState();
            this.showFallbackData();
            
            // Show a more helpful error message
            const errorMessage = error.message.includes('fetch') || error.message.includes('Failed to fetch') 
                ? 'Cannot connect to server - please check if the server is running on port 7000'
                : 'Dashboard update failed - using cached data';
            
            this.showNotification(errorMessage, 'warning');
        }
    }

    updateElementSafely(elementId, value) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = value;
        } else {
            console.warn(`Element with ID '${elementId}' not found`);
        }
    }

    showLoadingState() {
        // Add loading indicators to dashboard elements
        ['subtitles-processed', 'torrents-found', 'active-providers', 'uptime'].forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = '...';
            }
        });
    }

    hideLoadingState() {
        // Remove loading indicators if needed
        console.log('Loading state hidden');
    }

    showFallbackData() {
        // Show fallback data when API fails
        this.updateElementSafely('subtitles-processed', '0');
        this.updateElementSafely('torrents-found', '0');
        this.updateElementSafely('active-providers', '0');
        this.updateElementSafely('uptime', '0h 0m');
        
        // Update system status as warning instead of offline
        this.updateSystemStatus('warning');
        
        // Show a specific message that the server API is not responding
        this.showNotification('Server API not responding - please check if the server is running', 'warning');
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

    async updateSystemStatus(statusOverride = null) {
        try {
            if (statusOverride) {
                // Use the provided status override
                this.updateOverallSystemStatus(statusOverride);
                return;
            }

            const statusItems = [
                { id: 'subtitle-service-status', endpoint: '/api/health/subtitles', label: 'Subtitle Service' },
                { id: 'realdebrid-service-status', endpoint: '/api/health/realdebrid', label: 'Real-Debrid Service' },
                { id: 'alldebrid-service-status', endpoint: '/api/health/alldebrid', label: 'AllDebrid Service' },
                { id: 'torrent-providers-status', endpoint: '/api/health/providers', label: 'Torrent Providers' },
                { id: 'api-keys-status', endpoint: '/api/health/keys', label: 'API Keys' }
            ];

            // Test if the server is running by trying to fetch the first endpoint
            let serverRunning = false;
            try {
                const testResponse = await fetch('/api/health/subtitles');
                serverRunning = testResponse.status !== 0; // 0 means connection refused
            } catch (error) {
                console.warn('Server connection test failed:', error);
                serverRunning = false;
            }

            if (!serverRunning) {
                // Server is not running - show warning status
                console.warn('Server is not running - showing warning status');
                statusItems.forEach(item => {
                    this.updateStatusItem(item.id, 'warning', 'Server not running');
                });
                return;
            }

            // Server is running - check individual services
            for (const item of statusItems) {
                try {
                    const response = await fetch(item.endpoint);
                    if (response.ok) {
                        const data = await response.json();
                        this.updateStatusItem(item.id, data.status, data.message);
                    } else {
                        this.updateStatusItem(item.id, 'error', 'Service unavailable');
                    }
                } catch (error) {
                    console.warn(`Failed to check ${item.label}:`, error);
                    this.updateStatusItem(item.id, 'error', 'Connection failed');
                }
            }
        } catch (error) {
            console.error('Error updating system status:', error);
            this.updateOverallSystemStatus('error');
        }
    }

    updateOverallSystemStatus(status) {
        // Update the overall system status indicator
        const systemStatusElement = document.querySelector('.system-status');
        if (systemStatusElement) {
            systemStatusElement.className = `system-status status-${status}`;
            systemStatusElement.textContent = this.getStatusText(status);
        }
        
        // Update individual status items with fallback
        const statusItems = [
            { id: 'subtitle-service-status', status: status === 'offline' ? 'error' : status === 'warning' ? 'warning' : 'healthy' },
            { id: 'realdebrid-service-status', status: status === 'offline' ? 'error' : status === 'warning' ? 'warning' : 'healthy' },
            { id: 'alldebrid-service-status', status: status === 'offline' ? 'error' : status === 'warning' ? 'warning' : 'healthy' },
            { id: 'torrent-providers-status', status: status === 'offline' ? 'error' : status === 'warning' ? 'warning' : 'healthy' },
            { id: 'api-keys-status', status: status === 'offline' ? 'error' : status === 'warning' ? 'warning' : 'healthy' }
        ];
        
        statusItems.forEach(item => {
            const message = status === 'warning' ? 'Server not running' : this.getStatusText(item.status);
            this.updateStatusItem(item.id, item.status, message);
        });
    }

    getStatusText(status) {
        const statusTexts = {
            'healthy': 'Operational',
            'warning': 'Degraded',
            'error': 'Down',
            'offline': 'Offline',
            'starting': 'Starting...',
            'unknown': 'Unknown'
        };
        return statusTexts[status] || 'Unknown';
    }

    updateStatusItem(id, status, message) {
        const element = document.getElementById(id);
        if (!element) {
            console.warn(`Status element with ID '${id}' not found`);
            return;
        }

        const icon = element.querySelector('.status-icon i');
        const value = element.querySelector('.status-value');

        if (icon) {
            // Remove existing status classes
            icon.classList.remove('status-healthy', 'status-warning', 'status-error', 'status-unknown', 'status-offline');
            
            // Add new status class
            icon.classList.add(`status-${status}`);
        }

        if (value) {
            value.textContent = message || this.getStatusText(status);
        }

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

            // Update AllDebrid status
            const adResponse = await fetch('/api/alldebrid/status');
            const adData = await adResponse.json();
            this.updateAllDebridStatus(adData);

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

    updateAllDebridStatus(data) {
        const container = document.getElementById('alldebrid-status');
        if (!container) return;

        const status = data.enabled ? 'healthy' : 'error';
        const statusText = data.enabled ? 'Connected' : 'Disconnected';
        
        container.innerHTML = `
            <div class="debrid-status">
                <div class="debrid-header">
                    <i class="fas fa-cloud-download-alt"></i>
                    <span>AllDebrid Status</span>
                    <span class="status-badge status-${status}">${statusText}</span>
                </div>
                <div class="debrid-info">
                    <p><strong>User:</strong> ${data.user || 'Unknown'}</p>
                    <p><strong>Premium:</strong> ${data.premium ? 'Yes' : 'No'}</p>
                    <p><strong>Expires:</strong> ${data.expiration || 'Unknown'}</p>
                </div>
            </div>
        `;
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

    // Start comprehensive performance monitoring
    startPerformanceMonitoring() {
        // Monitor performance metrics every 30 seconds
        this.performanceInterval = setInterval(() => {
            this.collectPerformanceMetrics();
        }, 30000);
        
        // Initial collection
        this.collectPerformanceMetrics();
    }

    async collectPerformanceMetrics() {
        try {
            const response = await fetch('/api/performance/metrics');
            const data = await response.json();
            
            if (data.success) {
                // Update performance data
                this.performanceData.responseTime.push(data.metrics.responseTime || 0);
                this.performanceData.successRate.push(data.metrics.successRate || 0);
                this.performanceData.memoryUsage.push(data.metrics.memoryUsage || 0);
                this.performanceData.cpuUsage.push(data.metrics.cpuUsage || 0);
                this.performanceData.activeConnections.push(data.metrics.activeConnections || 0);
                
                // Keep only last 20 data points
                Object.keys(this.performanceData).forEach(key => {
                    if (this.performanceData[key].length > 20) {
                        this.performanceData[key] = this.performanceData[key].slice(-20);
                    }
                });
                
                // Update performance display
                this.updatePerformanceDisplay(data.metrics);
                
                // Update charts if visible
                if (this.currentTab === 'health') {
                    this.updatePerformanceCharts();
                }
            }
        } catch (error) {
            console.error('Error collecting performance metrics:', error);
        }
    }

    updatePerformanceDisplay(metrics) {
        // Update metric cards
        const responseTimeEl = document.getElementById('response-time-value');
        const successRateEl = document.getElementById('success-rate-value');
        const memoryUsageEl = document.getElementById('memory-usage-value');
        const cpuUsageEl = document.getElementById('cpu-usage-value');
        const activeConnectionsEl = document.getElementById('active-connections-value');
        
        if (responseTimeEl) responseTimeEl.textContent = metrics.responseTime ? `${metrics.responseTime}ms` : 'N/A';
        if (successRateEl) successRateEl.textContent = metrics.successRate ? `${metrics.successRate.toFixed(1)}%` : 'N/A';
        if (memoryUsageEl) memoryUsageEl.textContent = metrics.memoryUsage ? `${(metrics.memoryUsage / 1024 / 1024).toFixed(1)}MB` : 'N/A';
        if (cpuUsageEl) cpuUsageEl.textContent = metrics.cpuUsage ? `${metrics.cpuUsage.toFixed(1)}%` : 'N/A';
        if (activeConnectionsEl) activeConnectionsEl.textContent = metrics.activeConnections || '0';
        
        // Update trend indicators
        this.updateTrendIndicators(metrics);
    }

    updateTrendIndicators(metrics) {
        const trends = {
            'response-time-trend': this.calculateTrend(this.performanceData.responseTime),
            'success-rate-trend': this.calculateTrend(this.performanceData.successRate),
            'memory-usage-trend': this.calculateTrend(this.performanceData.memoryUsage),
            'cpu-usage-trend': this.calculateTrend(this.performanceData.cpuUsage),
            'active-connections-trend': this.calculateTrend(this.performanceData.activeConnections)
        };
        
        Object.entries(trends).forEach(([id, trend]) => {
            const element = document.getElementById(id);
            if (element) {
                element.className = `metric-trend trend-${trend.direction}`;
                element.innerHTML = `<i class="fas fa-${trend.icon}"></i> ${trend.text}`;
            }
        });
    }

    calculateTrend(data) {
        if (data.length < 2) return { direction: 'stable', icon: 'minus', text: 'Stable' };
        
        const recent = data.slice(-3);
        const average = recent.reduce((a, b) => a + b, 0) / recent.length;
        const previous = data.slice(-6, -3);
        const prevAverage = previous.length > 0 ? previous.reduce((a, b) => a + b, 0) / previous.length : average;
        
        const change = ((average - prevAverage) / prevAverage) * 100;
        
        if (Math.abs(change) < 5) return { direction: 'stable', icon: 'minus', text: 'Stable' };
        if (change > 0) return { direction: 'up', icon: 'arrow-up', text: `+${change.toFixed(1)}%` };
        return { direction: 'down', icon: 'arrow-down', text: `${change.toFixed(1)}%` };
    }

    async updateSettingsTab() {
        // Settings tab is mostly static, no need to update
        console.log('Settings tab loaded');
    }

    async saveSettings() {
        try {
            // Show saving indicator
            this.showNotification('Saving settings...', 'info');
            
            const settings = {
                enableCache: document.getElementById('enable-cache')?.checked || false,
                enableAiCorrection: document.getElementById('enable-ai-correction')?.checked || false,
                enableProgressiveLoading: document.getElementById('enable-progressive-loading')?.checked || false,
                autoSyncEnabled: document.getElementById('auto-sync-enabled')?.checked || false,
                requestTimeout: document.getElementById('request-timeout')?.value || 30000,
                minSubtitleScore: document.getElementById('min-subtitle-score')?.value || 0.7,
                apiKeys: {
                    gemini: document.getElementById('gemini-api-key')?.value || '',
                    openai: document.getElementById('openai-api-key')?.value || '',
                    claude: document.getElementById('claude-api-key')?.value || '',
                    opensubtitles: document.getElementById('opensubtitles-api-key')?.value || '',
                    tmdb: document.getElementById('tmdb-api-key')?.value || '',
                    subdl: document.getElementById('subdl-api-key')?.value || '',
                    realdebrid: document.getElementById('realdebrid-api-key')?.value || '',
                    alldebrid: document.getElementById('alldebrid-api-key')?.value || '',
                    jackett: document.getElementById('jackett-api-key')?.value || ''
                },
                jackettUrl: document.getElementById('jackett-url')?.value || '',
                // Environment variable fallback configuration
                useEnvironmentFallback: document.getElementById('use-environment-fallback')?.checked ?? true,
                fallbackPriority: ['environment', 'user'], // Environment first, then user input
                providerPriority: {
                    realdebrid: parseInt(document.getElementById('realdebrid-priority')?.value) || 1,
                    alldebrid: parseInt(document.getElementById('alldebrid-priority')?.value) || 2
                }
            };

            const response = await fetch('/api/settings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(settings)
            });

            const result = await response.json();

            if (result.success) {
                this.showNotification('Settings saved successfully - Environment variables will be used as fallback', 'success');
                
                // Update local settings
                this.settings = { ...this.settings, ...settings };
                
                // Refresh health status after settings change
                setTimeout(() => {
                    this.updateDashboard();
                    this.updateTorrentsTab();
                }, 1000);
                
                // Log activity
                this.logActivity('Settings updated with environment fallback enabled', 'success');
                
            } else {
                throw new Error(result.error || 'Failed to save settings');
            }

        } catch (error) {
            console.error('Error saving settings:', error);
            this.showNotification(`Failed to save settings: ${error.message}`, 'error');
            this.logActivity(`Settings save failed: ${error.message}`, 'error');
        }
    }

    async loadSettings() {
        try {
            const response = await fetch('/api/settings');
            const data = await response.json();
            
            if (data.success && data.settings) {
                this.settings = data.settings;
                this.populateSettingsForm(data.settings);
                this.logActivity('Settings loaded successfully', 'info');
            }
        } catch (error) {
            console.error('Error loading settings:', error);
            this.logActivity('Settings load failed, using defaults', 'warning');
        }
    }

    populateSettingsForm(settings) {
        // Populate form fields with loaded settings
        if (document.getElementById('enable-cache')) {
            document.getElementById('enable-cache').checked = settings.enableCache || false;
        }
        if (document.getElementById('enable-ai-correction')) {
            document.getElementById('enable-ai-correction').checked = settings.enableAiCorrection || false;
        }
        if (document.getElementById('enable-progressive-loading')) {
            document.getElementById('enable-progressive-loading').checked = settings.enableProgressiveLoading || false;
        }
        if (document.getElementById('auto-sync-enabled')) {
            document.getElementById('auto-sync-enabled').checked = settings.autoSyncEnabled || false;
        }
        if (document.getElementById('request-timeout')) {
            document.getElementById('request-timeout').value = settings.requestTimeout || 30000;
        }
        if (document.getElementById('min-subtitle-score')) {
            document.getElementById('min-subtitle-score').value = settings.minSubtitleScore || 0.7;
        }
        if (document.getElementById('use-environment-fallback')) {
            document.getElementById('use-environment-fallback').checked = settings.useEnvironmentFallback ?? true;
        }
        
        // Populate API keys (show masked values if they exist)
        if (settings.apiKeys) {
            Object.entries(settings.apiKeys).forEach(([key, value]) => {
                const element = document.getElementById(`${key}-api-key`);
                if (element && value) {
                    element.value = '***'; // Show masked value to indicate key is set
                    element.dataset.hasValue = 'true';
                }
            });
        }
        
        // Populate other settings
        if (document.getElementById('jackett-url')) {
            document.getElementById('jackett-url').value = settings.jackettUrl || '';
        }
        
        // Populate provider priorities
        if (settings.providerPriority) {
            if (document.getElementById('realdebrid-priority')) {
                document.getElementById('realdebrid-priority').value = settings.providerPriority.realdebrid || 1;
            }
            if (document.getElementById('alldebrid-priority')) {
                document.getElementById('alldebrid-priority').value = settings.providerPriority.alldebrid || 2;
            }
        }
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

    // Environment status monitoring
    async checkEnvironmentStatus() {
        try {
            const response = await fetch('/api/environment/status');
            const envStatus = await response.json();
            
            // Update environment status indicators
            this.updateEnvironmentIndicator('env-realdebrid', envStatus.realdebrid);
            this.updateEnvironmentIndicator('env-alldebrid', envStatus.alldebrid);
            this.updateEnvironmentIndicator('env-opensubtitles', envStatus.opensubtitles);
            
            // Update fallback status
            const fallbackStatus = document.getElementById('fallback-status');
            if (fallbackStatus) {
                const statusLight = fallbackStatus.querySelector('.status-light');
                const statusText = fallbackStatus.querySelector('.status-text');
                
                if (envStatus.fallbackEnabled) {
                    statusLight.className = 'status-light status-active';
                    statusText.textContent = 'Active';
                } else {
                    statusLight.className = 'status-light status-inactive';
                    statusText.textContent = 'Inactive';
                }
            }
            
            return envStatus;
        } catch (error) {
            console.error('Error checking environment status:', error);
            return null;
        }
    }

    updateEnvironmentIndicator(elementId, status) {
        const element = document.getElementById(elementId);
        if (element) {
            const textElement = element.querySelector('.env-text');
            if (status.available) {
                textElement.textContent = `Available (${status.source})`;
                textElement.style.color = '#00ff88';
            } else {
                textElement.textContent = 'Not Available';
                textElement.style.color = '#ff6b6b';
            }
        }
    }

    // Enhanced performance monitoring
    async updatePerformanceMetrics() {
        try {
            const response = await fetch('/api/performance/metrics');
            const metrics = await response.json();
            
            // Update metric values
            this.updateMetricCard('response-time', metrics.performance.averageResponseTime, 'ms');
            this.updateMetricCard('success-rate', metrics.requests.successRate, '%');
            this.updateMetricCard('memory-usage', metrics.memory.heapUsed, 'MB');
            this.updateMetricCard('cpu-usage', this.calculateCpuPercentage(metrics.cpu), '%');
            this.updateMetricCard('active-connections', metrics.performance.activeConnections, '');
            
            // Store metrics for trend analysis
            this.storeMetricTrend('response-time', metrics.performance.averageResponseTime);
            this.storeMetricTrend('success-rate', metrics.requests.successRate);
            this.storeMetricTrend('memory-usage', metrics.memory.heapUsed);
            this.storeMetricTrend('cpu-usage', this.calculateCpuPercentage(metrics.cpu));
            this.storeMetricTrend('active-connections', metrics.performance.activeConnections);
            
            return metrics;
        } catch (error) {
            console.error('Error updating performance metrics:', error);
            return null;
        }
    }

    updateMetricCard(metricName, value, unit) {
        const valueElement = document.getElementById(`${metricName}-value`);
        const trendElement = document.getElementById(`${metricName}-trend`);
        
        if (valueElement) {
            valueElement.textContent = `${value}${unit}`;
        }
        
        if (trendElement) {
            const trend = this.calculateTrend(metricName, value);
            const icon = trendElement.querySelector('i');
            const text = trendElement.querySelector('.metric-text') || trendElement;
            
            if (trend > 0) {
                icon.className = 'fas fa-arrow-up';
                text.textContent = ` ${trend.toFixed(1)}% up`;
                trendElement.style.color = metricName === 'success-rate' ? '#00ff88' : '#ff6b6b';
            } else if (trend < 0) {
                icon.className = 'fas fa-arrow-down';
                text.textContent = ` ${Math.abs(trend).toFixed(1)}% down`;
                trendElement.style.color = metricName === 'success-rate' ? '#ff6b6b' : '#00ff88';
            } else {
                icon.className = 'fas fa-minus';
                text.textContent = ' Stable';
                trendElement.style.color = '#888';
            }
        }
    }

    calculateCpuPercentage(cpu) {
        // Simple CPU usage calculation (this is a rough estimate)
        const totalCpu = cpu.user + cpu.system;
        return Math.min(Math.round((totalCpu / 1000) * 100), 100);
    }

    storeMetricTrend(metricName, value) {
        if (!window.metricTrends) {
            window.metricTrends = {};
        }
        
        if (!window.metricTrends[metricName]) {
            window.metricTrends[metricName] = [];
        }
        
        window.metricTrends[metricName].push(value);
        
        // Keep only last 10 values for trend calculation
        if (window.metricTrends[metricName].length > 10) {
            window.metricTrends[metricName].shift();
        }
    }

    calculateTrend(metricName, currentValue) {
        if (!window.metricTrends || !window.metricTrends[metricName] || window.metricTrends[metricName].length < 2) {
            return 0;
        }
        
        const values = window.metricTrends[metricName];
        const previousValue = values[values.length - 2];
        
        if (previousValue === 0) return 0;
        
        return ((currentValue - previousValue) / previousValue) * 100;
    }

    // Password visibility toggle
    togglePasswordVisibility(inputId) {
        const input = document.getElementById(inputId);
        const button = input.nextElementSibling;
        const icon = button.querySelector('i');
        
        if (input.type === 'password') {
            input.type = 'text';
            icon.className = 'fas fa-eye-slash';
        } else {
            input.type = 'password';
            icon.className = 'fas fa-eye';
        }
    }

    // Enhanced connection testing
    async testAllConnections() {
        const testButton = document.querySelector('button[onclick="testAllConnections()"]');
        const originalText = testButton.innerHTML;
        
        testButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testing...';
        testButton.disabled = true;
        
        try {
            // Test Real-Debrid
            await this.testConnection('real-debrid');
            
            // Test AllDebrid
            await this.testConnection('alldebrid');
            
            // Test OpenSubtitles
            await this.testConnection('opensubtitles');
            
            // Show success message
            this.showNotification('All connections tested successfully!', 'success');
            
        } catch (error) {
            this.showNotification('Some connections failed. Check the logs for details.', 'error');
        } finally {
            testButton.innerHTML = originalText;
            testButton.disabled = false;
        }
    }

    showNotification(message, type) {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
            <span>${message}</span>
        `;
        
        document.body.appendChild(notification);
        
        // Remove after 3 seconds
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    // Enhanced initialization
    async initializeApp() {
        console.log('Initializing application...');
        
        // Load settings
        await this.loadSettings();
        
        // Check environment status
        await this.checkEnvironmentStatus();
        
        // Start performance monitoring if enabled
        const settings = await this.getSettings();
        if (settings && settings.performanceMonitoring) {
            this.startPerformanceMonitoring();
        }
        
        // Test initial connections
        await this.testAllConnections();
        
        console.log('Application initialized successfully');
    }
}

// Global error handling
window.addEventListener('error', function(event) {
    console.error('Global error caught:', event.error);
    
    // Try to show notification if UI is initialized
    if (window.stremioUI && typeof window.stremioUI.showNotification === 'function') {
        window.stremioUI.showNotification('System error occurred - some features may not work properly', 'error');
    }
});

window.addEventListener('unhandledrejection', function(event) {
    console.error('Unhandled promise rejection:', event.reason);
    
    // Try to show notification if UI is initialized
    if (window.stremioUI && typeof window.stremioUI.showNotification === 'function') {
        window.stremioUI.showNotification('Network error occurred - retrying...', 'warning');
    }
});

// Initialize the UI when DOM is ready
async function initializeUI() {
    if (window.stremioUI) {
        console.log('UI already initialized');
        return;
    }
    
    try {
        console.log('Initializing Stremio Addon UI...');
        window.stremioUI = new StremioAddonUI();
        console.log('Stremio Addon UI initialized successfully');
        
        // Initialize additional app features
        await initializeApp();
        
        // Set up automatic updates
        setupAutomaticUpdates();
        
    } catch (error) {
        console.error('Failed to initialize UI:', error);
        
        // Show basic error message
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = 'position: fixed; top: 10px; right: 10px; background: #ff4444; color: white; padding: 10px; border-radius: 5px; z-index: 1000;';
        errorDiv.textContent = 'UI initialization failed - please refresh the page';
        document.body.appendChild(errorDiv);
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.parentNode.removeChild(errorDiv);
            }
        }, 5000);
    }
}

// Set up automatic updates
function setupAutomaticUpdates() {
    // Auto-refresh settings every 30 seconds
    setInterval(loadSettings, 30000);
    
    // Update performance metrics every 5 seconds
    setInterval(updatePerformanceMetrics, 5000);
    
    // Check environment status every 60 seconds
    setInterval(checkEnvironmentStatus, 60000);
    
    console.log('Automatic updates configured');
}

document.addEventListener('DOMContentLoaded', initializeUI);

// Fallback initialization if DOMContentLoaded already fired
if (document.readyState === 'loading') {
    // DOMContentLoaded has not fired yet
    console.log('DOM is still loading...');
} else {
    // DOM is already loaded
    console.log('DOM already loaded - Initializing immediately...');
    initializeUI();
}
