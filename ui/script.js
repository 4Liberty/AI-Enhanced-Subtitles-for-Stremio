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
        
        // Progressive AI Enhancement System
        this.progressiveEnhancementEnabled = true;
        this.enhancementCheckInterval = 5000; // Check every 5 seconds
        this.activeEnhancementChecks = new Map();
        
        this.init();
    }

    init() {
        console.log('Initializing Enhanced Stremio Addon UI...');
        
        try {
            // Check if DOM is ready
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => this.initializeAfterDOM());
            } else {
                this.initializeAfterDOM();
            }
        } catch (error) {
            console.error('Critical error during UI initialization:', error);
            this.showNotification('System initialization failed - please refresh the page', 'error');
        }
    }

    initializeAfterDOM() {
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

    // Helper function to safely update DOM elements
    updateElementSafely(elementId, value) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = value;
        } else {
            console.warn(`Element not found: ${elementId}`);
        }
    }

    // Initialize fallback UI when main UI elements are missing
    initializeFallbackUI() {
        console.log('Initializing fallback UI...');
        
        // Create basic dashboard if missing
        const dashboardTab = document.getElementById('dashboard');
        if (!dashboardTab) {
            const newDashboard = document.createElement('div');
            newDashboard.id = 'dashboard';
            newDashboard.className = 'tab-content active';
            newDashboard.innerHTML = `
                <div class="stats-grid">
                    <div class="stat-card">
                        <h3>System Status</h3>
                        <p id="system-status">Initializing...</p>
                    </div>
                    <div class="stat-card">
                        <h3>Subtitles Processed</h3>
                        <p id="subtitles-processed">0</p>
                    </div>
                    <div class="stat-card">
                        <h3>Active Providers</h3>
                        <p id="active-providers">0</p>
                    </div>
                    <div class="stat-card">
                        <h3>Uptime</h3>
                        <p id="uptime">0s</p>
                    </div>
                </div>
            `;
            
            const mainContent = document.querySelector('.main-content') || document.body;
            mainContent.appendChild(newDashboard);
        }
    }

    // Show loading state
    showLoadingState() {
        const elements = ['subtitles-processed', 'torrents-found', 'active-providers', 'uptime'];
        elements.forEach(id => {
            this.updateElementSafely(id, 'Loading...');
        });
    }

    // Hide loading state
    hideLoadingState() {
        // Remove any loading indicators
        document.querySelectorAll('.loading').forEach(el => {
            el.classList.remove('loading');
        });
    }

    // Show fallback data when real data is unavailable
    showFallbackData() {
        console.log('Showing fallback data...');
        
        this.updateElementSafely('subtitles-processed', 'N/A');
        this.updateElementSafely('torrents-found', 'N/A');
        this.updateElementSafely('active-providers', 'N/A');
        this.updateElementSafely('uptime', 'N/A');
        
        const statusEl = document.getElementById('system-status');
        if (statusEl) {
            statusEl.textContent = 'Offline';
            statusEl.className = 'status-offline';
        }
    }

    // Fetch dashboard data with proper error handling
    async fetchDashboardData() {
        try {
            const response = await fetch('/api/dashboard');
            if (!response.ok) {
                // Try legacy health endpoint as fallback
                const healthResponse = await fetch('/api/health');
                if (healthResponse.ok) {
                    const healthData = await healthResponse.json();
                    return {
                        status: healthData.status || 'online',
                        subtitlesProcessed: 0,
                        torrentsFound: 0,
                        activeProviders: Object.values(healthData.services || {}).filter(Boolean).length,
                        uptime: 0
                    };
                }
                throw new Error(`Dashboard API failed: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Failed to fetch dashboard data:', error);
            return null;
        }
    }

    // Format uptime in human-readable format
    formatUptime(seconds) {
        if (!seconds || seconds === 0) return '0s';
        
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        
        if (days > 0) return `${days}d ${hours}h`;
        if (hours > 0) return `${hours}h ${minutes}m`;
        if (minutes > 0) return `${minutes}m ${secs}s`;
        return `${secs}s`;
    }

    // Update system status with proper styling
    async updateSystemStatus(status) {
        const statusEl = document.getElementById('system-status');
        if (!statusEl) {
            console.warn('System status element not found');
            return;
        }
        
        // Remove existing status classes
        statusEl.classList.remove('status-online', 'status-offline', 'status-warning', 'status-error');
        
        switch(status) {
            case 'ok':
            case 'online':
            case 'healthy':
                statusEl.textContent = 'Online';
                statusEl.classList.add('status-online');
                break;
            case 'warning':
                statusEl.textContent = 'Warning';
                statusEl.classList.add('status-warning');
                break;
            case 'error':
            case 'offline':
                statusEl.textContent = 'Offline';
                statusEl.classList.add('status-offline');
                break;
            default:
                statusEl.textContent = 'Unknown';
                statusEl.classList.add('status-warning');
        }
    }

    // Update performance metrics safely
    updatePerformanceMetrics(data) {
        if (!data || !data.performance) return;
        
        const perf = data.performance;
        
        // Update response time
        this.updateElementSafely('avg-response-time', `${perf.responseTime || 0}ms`);
        
        // Update success rate
        this.updateElementSafely('success-rate', `${perf.successRate || 0}%`);
        
        // Update memory usage
        this.updateElementSafely('memory-usage', `${perf.memoryUsage || 0}MB`);
        
        // Update active connections
        this.updateElementSafely('active-connections', perf.activeConnections || 0);
        
        // Add to performance data arrays
        if (perf.responseTime !== undefined) {
            this.performanceData.responseTime.push(perf.responseTime);
            if (this.performanceData.responseTime.length > 50) {
                this.performanceData.responseTime.shift();
            }
        }
        
        if (perf.successRate !== undefined) {
            this.performanceData.successRate.push(perf.successRate);
            if (this.performanceData.successRate.length > 50) {
                this.performanceData.successRate.shift();
            }
        }
        
        if (perf.memoryUsage !== undefined) {
            this.performanceData.memoryUsage.push(perf.memoryUsage);
            if (this.performanceData.memoryUsage.length > 50) {
                this.performanceData.memoryUsage.shift();
            }
        }
    }

    // Update system info safely
    updateSystemInfo(data) {
        if (!data) return;
        
        // Update Node.js version
        this.updateElementSafely('node-version', process?.version || 'Unknown');
        
        // Update uptime
        this.updateElementSafely('system-uptime', this.formatUptime(data.uptime || 0));
        
        // Update server info
        if (data.services) {
            const enabledServices = Object.values(data.services).filter(Boolean).length;
            this.updateElementSafely('enabled-services', enabledServices);
        }
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

    logActivity(message, type = 'info') {
        this.addToActivityLog(message, type);
    }

    applySettings(settings) {
        // Apply AI settings
        if (settings.aiProvider) document.getElementById('ai-provider').value = settings.aiProvider;
        if (settings.aiModel) document.getElementById('ai-model').value = settings.aiModel;
        if (settings.correctionIntensity) {
            document.getElementById('correction-intensity').value = settings.correctionIntensity;
            const rangeValue = document.querySelector('#correction-intensity + .range-value');
            if (rangeValue) rangeValue.textContent = settings.correctionIntensity;
        }
        if (settings.aiTemperature) {
            document.getElementById('ai-temperature').value = settings.aiTemperature;
            const rangeValue = document.querySelector('#ai-temperature + .range-value');
            if (rangeValue) rangeValue.textContent = settings.aiTemperature;
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
            const rangeValue = document.querySelector('#min-subtitle-score + .range-value');
            if (rangeValue) rangeValue.textContent = settings.minSubtitleScore;
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

    // API Testing Functions
    async testSubtitleSearch() {
        const imdbId = document.getElementById('test-imdb')?.value;
        const language = document.getElementById('test-language')?.value;
        const resultsDiv = document.getElementById('subtitle-test-results');
        
        if (!imdbId) {
            this.showNotification('Please enter an IMDb ID', 'error');
            return;
        }

        if (resultsDiv) {
            resultsDiv.innerHTML = '<div class="test-loading">Testing subtitle search...</div>';
            resultsDiv.classList.add('show');
        }

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
                if (resultsDiv) {
                    resultsDiv.innerHTML = `
                        <div class="test-success">
                            <h4>✓ Found ${result.subtitles.length} subtitle(s)</h4>
                            <pre>${JSON.stringify(result.subtitles, null, 2)}</pre>
                        </div>
                    `;
                }
                this.showNotification('Subtitle search successful', 'success');
            } else {
                if (resultsDiv) {
                    resultsDiv.innerHTML = `
                        <div class="test-error">
                            <h4>⚠ No subtitles found</h4>
                            <pre>${JSON.stringify(result, null, 2)}</pre>
                        </div>
                    `;
                }
                this.showNotification('No subtitles found', 'warning');
            }
        } catch (error) {
            if (resultsDiv) {
                resultsDiv.innerHTML = `
                    <div class="test-error">
                        <h4>✗ Test failed</h4>
                        <pre>${error.message}</pre>
                    </div>
                `;
            }
            this.showNotification('Test failed: ' + error.message, 'error');
        }
    }

    async testTorrentSearch() {
        const imdbId = document.getElementById('torrent-test-imdb')?.value;
        const quality = document.getElementById('torrent-test-quality')?.value;
        const resultsDiv = document.getElementById('torrent-test-results');
        
        if (!imdbId) {
            this.showNotification('Please enter an IMDb ID', 'error');
            return;
        }

        if (resultsDiv) {
            resultsDiv.innerHTML = '<div class="test-loading">Testing torrent search...</div>';
            resultsDiv.classList.add('show');
        }

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
                if (resultsDiv) {
                    resultsDiv.innerHTML = `
                        <div class="test-success">
                            <h4>✓ Found ${result.streams.length} stream(s)</h4>
                            <pre>${JSON.stringify(result.streams, null, 2)}</pre>
                        </div>
                    `;
                }
                this.showNotification('Torrent search successful', 'success');
            } else {
                if (resultsDiv) {
                    resultsDiv.innerHTML = `
                        <div class="test-error">
                            <h4>⚠ No streams found</h4>
                            <pre>${JSON.stringify(result, null, 2)}</pre>
                        </div>
                    `;
                }
                this.showNotification('No streams found', 'warning');
            }
        } catch (error) {
            if (resultsDiv) {
                resultsDiv.innerHTML = `
                    <div class="test-error">
                        <h4>✗ Test failed</h4>
                        <pre>${error.message}</pre>
                    </div>
                `;
            }
            this.showNotification('Test failed: ' + error.message, 'error');
        }
    }

    async testApiKeys() {
        const results = {};
        const keys = {
            gemini: document.getElementById('gemini-api-key')?.value,
            openai: document.getElementById('openai-api-key')?.value,
            claude: document.getElementById('claude-api-key')?.value,
            opensubtitles: document.getElementById('opensubtitles-api-key')?.value,
            tmdb: document.getElementById('tmdb-api-key')?.value,
            subdl: document.getElementById('subdl-api-key')?.value,
            realdebrid: document.getElementById('realdebrid-api-key')?.value,
            alldebrid: document.getElementById('alldebrid-api-key')?.value,
            jackett: document.getElementById('jackett-api-key')?.value
        };

        this.showNotification('Testing API keys...', 'info');

        for (const [key, value] of Object.entries(keys)) {
            if (value && value !== '***') {
                try {
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

    async testConnection(provider) {
        try {
            const response = await fetch(`/api/test/connection/${provider}`);
            const result = await response.json();
            
            if (result.success) {
                this.showNotification(`${provider} connection successful`, 'success');
                return true;
            } else {
                this.showNotification(`${provider} connection failed: ${result.error}`, 'error');
                return false;
            }
        } catch (error) {
            this.showNotification(`${provider} connection error: ${error.message}`, 'error');
            return false;
        }
    }

    // Configuration Management
    exportConfig() {
        const settings = {
            aiProvider: document.getElementById('ai-provider')?.value,
            aiModel: document.getElementById('ai-model')?.value,
            correctionIntensity: document.getElementById('correction-intensity')?.value,
            aiTemperature: document.getElementById('ai-temperature')?.value,
            primaryLanguage: document.getElementById('primary-language')?.value,
            fallbackLanguage: document.getElementById('fallback-language')?.value,
            autoTranslate: document.getElementById('auto-translate')?.checked,
            hearingImpaired: document.getElementById('hearing-impaired')?.checked,
            aiEnabled: document.getElementById('ai-enabled')?.checked,
            debugMode: document.getElementById('debug-mode')?.checked,
            scrapingEnabled: document.getElementById('scraping-enabled')?.checked,
            cacheEnabled: document.getElementById('cache-enabled')?.checked,
            maxConcurrentRequests: document.getElementById('max-concurrent-requests')?.value,
            requestTimeout: document.getElementById('request-timeout')?.value,
            minSubtitleScore: document.getElementById('min-subtitle-score')?.value,
            jackettUrl: document.getElementById('jackett-url')?.value,
            useEnvironmentFallback: document.getElementById('use-environment-fallback')?.checked
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
        const fileInput = document.getElementById('config-file');
        if (fileInput) {
            fileInput.click();
        }
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

    // Cache Management
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

    // Error Log Management
    clearErrorLogs() {
        const errorLogsElement = document.getElementById('error-logs');
        if (errorLogsElement) {
            errorLogsElement.innerHTML = '<div class="log-item"><span class="log-time">System</span><span class="log-message log-success">Error logs cleared</span></div>';
        }
        this.showNotification('Error logs cleared', 'success');
    }

    exportErrorLogs() {
        const logs = Array.from(document.querySelectorAll('.log-item')).map(item => {
            const time = item.querySelector('.log-time')?.textContent || '';
            const message = item.querySelector('.log-message')?.textContent || '';
            return { time, message };
        });

        const dataStr = JSON.stringify(logs, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', 'error-logs.json');
        linkElement.click();
    }

    // Utility Functions
    toggleVisibility(inputId) {
        const input = document.getElementById(inputId);
        if (!input) return;
        
        const button = input.nextElementSibling;
        if (!button) return;
        
        const icon = button.querySelector('i');
        if (!icon) return;
        
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

    async getSettings() {
        try {
            const response = await fetch('/api/settings');
            if (response.ok) {
                const data = await response.json();
                return data.settings || data;
            }
        } catch (error) {
            console.error('Error getting settings:', error);
        }
        return this.settings || {};
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

    // Health monitoring functions
    startHealthMonitoring() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
        
        // Update health every 10 seconds
        this.refreshInterval = setInterval(() => {
            this.updateDashboard().catch(error => {
                console.warn('Health monitoring update failed:', error);
            });
        }, 10000);
        
        console.log('Health monitoring started');
    }

    // Performance monitoring functions
    startPerformanceMonitoring() {
        if (this.performanceInterval) {
            clearInterval(this.performanceInterval);
        }
        
        // Update performance metrics every 5 seconds
        this.performanceInterval = setInterval(() => {
            this.fetchPerformanceMetrics().catch(error => {
                console.warn('Performance monitoring update failed:', error);
            });
        }, 5000);
        
        console.log('Performance monitoring started');
    }

    async fetchPerformanceMetrics() {
        try {
            const response = await fetch('/api/performance/metrics');
            if (response.ok) {
                const metrics = await response.json();
                this.updatePerformanceDisplay(metrics);
            }
        } catch (error) {
            console.error('Failed to fetch performance metrics:', error);
        }
    }

    updatePerformanceDisplay(metrics) {
        if (!metrics) return;
        
        // Update current metrics
        this.updateElementSafely('current-memory', `${metrics.memory?.heapUsed || 0}MB`);
        this.updateElementSafely('current-cpu', `${metrics.cpu?.user || 0}ms`);
        this.updateElementSafely('total-requests', metrics.requests?.total || 0);
        this.updateElementSafely('request-success-rate', `${metrics.requests?.successRate || 0}%`);
    }

    // Load and save settings
    async loadSettings() {
        try {
            const response = await fetch('/api/settings');
            if (response.ok) {
                const data = await response.json();
                this.settings = data.settings || data;
                this.applySettings(this.settings);
                console.log('Settings loaded successfully');
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
            // Use default settings
            this.settings = this.getDefaultSettings();
            this.applySettings(this.settings);
        }
    }

    async saveSettings() {
        try {
            // Collect current settings from form
            const settings = {
                aiProvider: document.getElementById('ai-provider')?.value,
                aiModel: document.getElementById('ai-model')?.value,
                correctionIntensity: document.getElementById('correction-intensity')?.value,
                aiTemperature: document.getElementById('ai-temperature')?.value,
                primaryLanguage: document.getElementById('primary-language')?.value,
                fallbackLanguage: document.getElementById('fallback-language')?.value,
                autoTranslate: document.getElementById('auto-translate')?.checked,
                hearingImpaired: document.getElementById('hearing-impaired')?.checked,
                aiEnabled: document.getElementById('ai-enabled')?.checked,
                debugMode: document.getElementById('debug-mode')?.checked,
                scrapingEnabled: document.getElementById('scraping-enabled')?.checked,
                cacheEnabled: document.getElementById('cache-enabled')?.checked,
                maxConcurrentRequests: document.getElementById('max-concurrent-requests')?.value,
                requestTimeout: document.getElementById('request-timeout')?.value,
                minSubtitleScore: document.getElementById('min-subtitle-score')?.value
            };
            
            const response = await fetch('/api/settings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ settings })
            });
            
            if (response.ok) {
                this.showNotification('Settings saved successfully', 'success');
                this.settings = settings;
            } else {
                throw new Error('Failed to save settings');
            }
        } catch (error) {
            console.error('Failed to save settings:', error);
            this.showNotification('Failed to save settings: ' + error.message, 'error');
        }
    }

    getDefaultSettings() {
        return {
            aiProvider: 'gemini',
            aiModel: 'gemini-pro',
            correctionIntensity: 50,
            aiTemperature: 0.7,
            primaryLanguage: 'tr',
            fallbackLanguage: 'en',
            autoTranslate: false,
            hearingImpaired: false,
            aiEnabled: true,
            debugMode: false,
            scrapingEnabled: true,
            cacheEnabled: true,
            maxConcurrentRequests: 5,
            requestTimeout: 30,
            minSubtitleScore: 0.7
        };
    }

    // Tab update functions
    updateSubtitlesTab() {
        console.log('Updating subtitles tab...');
        // This would fetch and display subtitle statistics
    }

    updateTorrentsTab() {
        console.log('Updating torrents tab...');
        // This would fetch and display torrent/stream statistics
    }

    updateHealthTab() {
        console.log('Updating health tab...');
        // Refresh charts and health data
        this.updateChartsData();
    }

    updateSettingsTab() {
        console.log('Updating settings tab...');
        // Reload settings from server
        this.loadSettings();
    }

    // Chart initialization and management
    async initializeCharts() {
        try {
            // Initialize performance charts if Chart.js is available
            if (typeof Chart !== 'undefined') {
                this.initializePerformanceCharts();
            } else {
                console.warn('Chart.js not available - charts will not be displayed');
            }
        } catch (error) {
            console.error('Failed to initialize charts:', error);
        }
    }

    initializePerformanceCharts() {
        // Response time chart
        const responseTimeCtx = document.getElementById('response-time-chart');
        if (responseTimeCtx) {
            this.chartInstances.responseTime = new Chart(responseTimeCtx, {
                type: 'line',
                data: {
                    labels: Array.from({length: 20}, (_, i) => i),
                    datasets: [{
                        label: 'Response Time (ms)',
                        data: this.performanceData.responseTime.slice(-20),
                        borderColor: '#007bff',
                        backgroundColor: 'rgba(0, 123, 255, 0.1)',
                        tension: 0.1
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: {
                            display: false
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true
                        }
                    }
                }
            });
        }

        // Memory usage chart
        const memoryCtx = document.getElementById('memory-chart');
        if (memoryCtx) {
            this.chartInstances.memory = new Chart(memoryCtx, {
                type: 'line',
                data: {
                    labels: Array.from({length: 20}, (_, i) => i),
                    datasets: [{
                        label: 'Memory Usage (MB)',
                        data: this.performanceData.memoryUsage.slice(-20),
                        borderColor: '#28a745',
                        backgroundColor: 'rgba(40, 167, 69, 0.1)',
                        tension: 0.1
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: {
                            display: false
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true
                        }
                    }
                }
            });
        }
    }

    updateChartsData() {
        // Update chart data with latest performance metrics
        if (this.chartInstances.responseTime) {
            this.chartInstances.responseTime.data.datasets[0].data = this.performanceData.responseTime.slice(-20);
            this.chartInstances.responseTime.update();
        }

        if (this.chartInstances.memory) {
            this.chartInstances.memory.data.datasets[0].data = this.performanceData.memoryUsage.slice(-20);
            this.chartInstances.memory.update();
        }
    }

    // Provider and source population
    populateProviders() {
        console.log('Populating providers...');
        // This would populate the providers status
    }

    populateSubtitleSources() {
        console.log('Populating subtitle sources...');
        // This would populate subtitle source information
    }

    // Environment status checking
    async checkEnvironmentStatus() {
        try {
            const response = await fetch('/api/environment/status');
            if (response.ok) {
                const envStatus = await response.json();
                this.updateEnvironmentStatus(envStatus);
            }
        } catch (error) {
            console.error('Failed to check environment status:', error);
        }
    }

    updateEnvironmentStatus(envStatus) {
        if (!envStatus) return;
        
        // Update provider status indicators
        Object.entries(envStatus).forEach(([provider, status]) => {
            if (typeof status === 'object' && status.available !== undefined) {
                const indicator = document.getElementById(`${provider}-status`);
                if (indicator) {
                    indicator.className = status.available ? 'status-online' : 'status-offline';
                    indicator.textContent = status.available ? 'Online' : 'Offline';
                }
            }
        });
    }

    // Activity logging
    addToActivityLog(message, type = 'info') {
        const timestamp = new Date();
        this.activityLog.unshift({
            message,
            type,
            timestamp
        });
        
        // Keep only last 50 activities
        if (this.activityLog.length > 50) {
            this.activityLog = this.activityLog.slice(0, 50);
        }
        
        this.updateActivityDisplay();
    }

    // Notification system
    showNotification(message, type = 'info') {
        console.log(`[${type.toUpperCase()}] ${message}`);
        
        // Try to show visual notification if notification container exists
        const container = document.getElementById('notification-container') || document.body;
        
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas ${this.getNotificationIcon(type)}"></i>
                <span>${message}</span>
                <button class="notification-close" onclick="this.parentElement.parentElement.remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        
        container.appendChild(notification);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 5000);
        
        // Add to activity log
        this.addToActivityLog(message, type);
    }

    getNotificationIcon(type) {
        switch (type) {
            case 'success': return 'fa-check-circle';
            case 'error': return 'fa-exclamation-circle';
            case 'warning': return 'fa-exclamation-triangle';
            case 'info':
            default: return 'fa-info-circle';
        }
    }

    // Addon installation functions
    installAddon() {
        const manifestUrl = `${window.location.origin}/manifest.json`;
        const stremioUrl = `stremio://${manifestUrl}`;
        
        try {
            window.open(stremioUrl, '_blank');
            this.showNotification('Opening Stremio to install addon...', 'info');
        } catch (error) {
            this.showNotification('Failed to open Stremio. Please copy the manifest URL manually.', 'error');
        }
    }

    copyManifestUrl() {
        const manifestUrl = `${window.location.origin}/manifest.json`;
        
        if (navigator.clipboard) {
            navigator.clipboard.writeText(manifestUrl).then(() => {
                this.showNotification('Manifest URL copied to clipboard', 'success');
            }).catch(() => {
                this.fallbackCopyText(manifestUrl);
            });
        } else {
            this.fallbackCopyText(manifestUrl);
        }
    }

    copyAddonUrl() {
        const addonUrl = window.location.origin;
        
        if (navigator.clipboard) {
            navigator.clipboard.writeText(addonUrl).then(() => {
                this.showNotification('Addon URL copied to clipboard', 'success');
            }).catch(() => {
                this.fallbackCopyText(addonUrl);
            });
        } else {
            this.fallbackCopyText(addonUrl);
        }
    }

    fallbackCopyText(text) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
            document.execCommand('copy');
            this.showNotification('URL copied to clipboard', 'success');
        } catch (err) {
            this.showNotification('Failed to copy URL. Please copy manually: ' + text, 'error');
        }
        
        document.body.removeChild(textArea);
    }

    // Progressive AI Enhancement Functions
    startProgressiveEnhancement(imdbId, hash, language = 'tr') {
        if (!this.progressiveEnhancementEnabled) return;
        
        const enhancementKey = `${imdbId}-${hash}`;
        
        // Don't start multiple checks for same content
        if (this.activeEnhancementChecks.has(enhancementKey)) {
            return;
        }
        
        console.log(`[UI] Starting progressive enhancement check for ${imdbId}`);
        
        const checkInterval = setInterval(async () => {
            try {
                const response = await fetch(`/subtitles/${imdbId}/${hash}/enhanced?language=${language}`);
                const result = await response.json();
                
                if (result.success && result.ready) {
                    console.log(`[UI] Enhanced subtitle ready for ${imdbId}`);
                    this.notifyEnhancementReady(imdbId, result.subtitle);
                    this.stopProgressiveEnhancement(enhancementKey);
                }
            } catch (error) {
                console.error(`[UI] Error checking enhancement status:`, error);
            }
        }, this.enhancementCheckInterval);
        
        this.activeEnhancementChecks.set(enhancementKey, checkInterval);
        
        // Auto-stop after 2 minutes
        setTimeout(() => {
            this.stopProgressiveEnhancement(enhancementKey);
        }, 120000);
    }
    
    stopProgressiveEnhancement(enhancementKey) {
        const interval = this.activeEnhancementChecks.get(enhancementKey);
        if (interval) {
            clearInterval(interval);
            this.activeEnhancementChecks.delete(enhancementKey);
            console.log(`[UI] Stopped progressive enhancement check for ${enhancementKey}`);
        }
    }
    
    notifyEnhancementReady(imdbId, subtitle) {
        this.showNotification(
            `🤖 AI-Enhanced Subtitle Ready for ${imdbId}`,
            'The AI has improved your subtitle quality. It will automatically switch to the enhanced version.',
            'success'
        );
    }

    // Enhanced subtitle download with progressive enhancement
    async downloadSubtitleWithEnhancement(url, imdbId, hash, language = 'tr') {
        try {
            // Start progressive enhancement check
            this.startProgressiveEnhancement(imdbId, hash, language);
            
            // Download original subtitle
            const response = await fetch(url);
            const content = await response.text();
            
            this.showNotification(
                `✅ Subtitle Downloaded`,
                `Original subtitle loaded. AI enhancement is processing in background...`,
                'info'
            );
            
            return content;
        } catch (error) {
            console.error('Error downloading subtitle:', error);
            this.showNotification(
                `❌ Download Failed`,
                `Failed to download subtitle: ${error.message}`,
                'error'
            );
            return null;
        }
    }

    // ...existing code...
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

// Enhanced initialization
async function initializeApp() {
    console.log('Initializing application...');
    
    // Load settings
    await window.stremioUI.loadSettings();
    
    // Check environment status
    await window.stremioUI.checkEnvironmentStatus();
    
    // Start performance monitoring if enabled
    const settings = await window.stremioUI.getSettings();
    if (settings && settings.performanceMonitoring) {
        window.stremioUI.startPerformanceMonitoring();
    }
    
    // Test initial connections
    await window.stremioUI.testAllConnections();
    
    console.log('Application initialized successfully');
}

// Set up automatic updates
function setupAutomaticUpdates() {
    // Auto-refresh settings every 30 seconds
    setInterval(() => window.stremioUI.loadSettings(), 30000);
    
    // Update performance metrics every 5 seconds
    setInterval(() => window.stremioUI.updatePerformanceMetrics(), 5000);
    
    // Check environment status every 60 seconds
    setInterval(() => window.stremioUI.checkEnvironmentStatus(), 60000);
    
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
