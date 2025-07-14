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
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Error fetching stats:', error);
            return {};
        }
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

    logActivity(message, type = 'info') {
        this.addToActivityLog(message, type);
    }

    // ...existing code...

    async fetchStats() {
        try {
            const response = await fetch('/api/stats');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Error fetching stats:', error);
            return {};
        }
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
