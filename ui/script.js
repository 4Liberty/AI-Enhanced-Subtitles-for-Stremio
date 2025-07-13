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
        this.setupEventListeners();
        this.loadSettings();
        this.startHealthMonitoring();
        this.updateDashboard();
        this.populateProviders();
        this.populateSubtitleSources();
        this.showNotification('System initialized successfully', 'success');
    }

    setupEventListeners() {
        // Tab navigation
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabName = e.target.dataset.tab;
                this.switchTab(tabName);
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
        document.getElementById('config-file').addEventListener('change', (e) => {
            this.handleConfigImport(e);
        });
    }

    switchTab(tabName) {
        // Update active tab
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // Update content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(tabName).classList.add('active');

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
                this.updateHealthTab();
                break;
            case 'settings':
                this.updateSettingsTab();
                break;
        }
    }

    async updateDashboard() {
        try {
            // Update quick stats
            const stats = await this.fetchStats();
            document.getElementById('subtitles-processed').textContent = stats.subtitlesProcessed || 0;
            document.getElementById('torrents-found').textContent = stats.torrentsFound || 0;
            document.getElementById('active-providers').textContent = stats.activeProviders || 0;
            document.getElementById('uptime').textContent = this.formatUptime(stats.uptime || 0);

            // Update system status
            await this.updateSystemStatus();

            // Update performance metrics
            this.updatePerformanceMetrics(stats);

        } catch (error) {
            console.error('Error updating dashboard:', error);
            this.showNotification('Failed to update dashboard', 'error');
        }
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

    loadSettings() {
        const saved = localStorage.getItem('stremio-addon-settings');
        if (saved) {
            this.settings = JSON.parse(saved);
            this.applySettings();
        }
    }

    saveSettings() {
        const settings = {
            primaryLanguage: document.getElementById('primary-language')?.value,
            fallbackLanguage: document.getElementById('fallback-language')?.value,
            aiEnabled: document.getElementById('ai-enabled')?.checked,
            aiModel: document.getElementById('ai-model')?.value,
            correctionIntensity: document.getElementById('correction-intensity')?.value,
            debugMode: document.getElementById('debug-mode')?.checked,
            scrapingEnabled: document.getElementById('scraping-enabled')?.checked,
            cacheEnabled: document.getElementById('cache-enabled')?.checked,
            maxConcurrentRequests: document.getElementById('max-concurrent-requests')?.value,
            requestTimeout: document.getElementById('request-timeout')?.value,
            geminiApiKey: document.getElementById('gemini-api-key')?.value,
            opensubtitlesApiKey: document.getElementById('opensubtitles-api-key')?.value,
            tmdbApiKey: document.getElementById('tmdb-api-key')?.value,
            subdlApiKey: document.getElementById('subdl-api-key')?.value,
            realdebridApiKey: document.getElementById('realdebrid-api-key')?.value,
            jackettUrl: document.getElementById('jackett-url')?.value,
            jackettApiKey: document.getElementById('jackett-api-key')?.value
        };

        this.settings = settings;
        localStorage.setItem('stremio-addon-settings', JSON.stringify(settings));
        this.showNotification('Settings saved successfully', 'success');
    }

    applySettings() {
        Object.keys(this.settings).forEach(key => {
            const element = document.getElementById(key.replace(/([A-Z])/g, '-$1').toLowerCase());
            if (element) {
                if (element.type === 'checkbox') {
                    element.checked = this.settings[key];
                } else {
                    element.value = this.settings[key] || '';
                }
            }
        });
    }

    updateSettingsTab() {
        this.applySettings();
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.add('show');
        }, 100);
        
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 3000);
    }

    // API Functions
    async testSubtitleSearch() {
        const imdbId = document.getElementById('test-imdb').value;
        const language = document.getElementById('test-language').value;
        
        if (!imdbId) {
            this.showNotification('Please enter an IMDb ID', 'warning');
            return;
        }

        const resultsContainer = document.getElementById('subtitle-test-results');
        resultsContainer.innerHTML = '<div class="loading"></div> Testing subtitle search...';
        resultsContainer.classList.add('show');

        try {
            const response = await fetch(`/api/subtitles/test?imdb=${imdbId}&lang=${language}`);
            const data = await response.json();
            
            resultsContainer.innerHTML = `
                <h4>Test Results</h4>
                <pre>${JSON.stringify(data, null, 2)}</pre>
            `;
            
            this.addToActivityLog(`Subtitle search test: ${imdbId} (${language})`, 'info');
            this.showNotification('Subtitle test completed', 'success');
        } catch (error) {
            resultsContainer.innerHTML = `<div class="log-error">Error: ${error.message}</div>`;
            this.showNotification('Subtitle test failed', 'error');
        }
    }

    async testTorrentSearch() {
        const imdbId = document.getElementById('torrent-test-imdb').value;
        const quality = document.getElementById('torrent-test-quality').value;
        
        if (!imdbId) {
            this.showNotification('Please enter an IMDb ID', 'warning');
            return;
        }

        const resultsContainer = document.getElementById('torrent-test-results');
        resultsContainer.innerHTML = '<div class="loading"></div> Testing torrent search...';
        resultsContainer.classList.add('show');

        try {
            const response = await fetch(`/api/torrents/test?imdb=${imdbId}&quality=${quality}`);
            const data = await response.json();
            
            resultsContainer.innerHTML = `
                <h4>Test Results</h4>
                <pre>${JSON.stringify(data, null, 2)}</pre>
            `;
            
            this.addToActivityLog(`Torrent search test: ${imdbId} (${quality || 'all'})`, 'info');
            this.showNotification('Torrent test completed', 'success');
        } catch (error) {
            resultsContainer.innerHTML = `<div class="log-error">Error: ${error.message}</div>`;
            this.showNotification('Torrent test failed', 'error');
        }
    }

    async testApiKeys() {
        this.showNotification('Testing API keys...', 'info');
        
        try {
            const response = await fetch('/api/test-keys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(this.settings)
            });
            
            const results = await response.json();
            
            let message = 'API Key Test Results:\n';
            Object.keys(results).forEach(key => {
                message += `${key}: ${results[key] ? '✓' : '✗'}\n`;
            });
            
            this.showNotification('API key test completed', 'success');
            this.addToActivityLog('API keys tested', 'info');
        } catch (error) {
            this.showNotification('API key test failed', 'error');
        }
    }

    async clearCache() {
        if (!confirm('Are you sure you want to clear the cache?')) return;
        
        try {
            await fetch('/api/cache/clear', { method: 'POST' });
            this.showNotification('Cache cleared successfully', 'success');
            this.addToActivityLog('Cache cleared', 'info');
            this.updateTorrentsTab();
        } catch (error) {
            this.showNotification('Failed to clear cache', 'error');
        }
    }

    clearErrorLogs() {
        if (!confirm('Are you sure you want to clear error logs?')) return;
        
        const container = document.getElementById('error-logs');
        const logsContainer = container.querySelector('.error-logs') || container;
        logsContainer.innerHTML = '<div class="log-item"><span class="log-time">System</span><span class="log-message log-success">Logs cleared</span></div>';
        
        this.showNotification('Error logs cleared', 'success');
    }

    exportErrorLogs() {
        const logs = this.activityLog.map(log => `${log.timestamp.toISOString()}: ${log.message}`).join('\n');
        const blob = new Blob([logs], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = 'stremio-addon-logs.txt';
        a.click();
        
        URL.revokeObjectURL(url);
        this.showNotification('Logs exported', 'success');
    }

    exportConfig() {
        const config = {
            settings: this.settings,
            timestamp: new Date().toISOString(),
            version: '1.0.0'
        };
        
        const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = 'stremio-addon-config.json';
        a.click();
        
        URL.revokeObjectURL(url);
        this.showNotification('Configuration exported', 'success');
    }

    importConfig() {
        document.getElementById('config-file').click();
    }

    handleConfigImport(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const config = JSON.parse(e.target.result);
                this.settings = config.settings;
                this.applySettings();
                this.saveSettings();
                this.showNotification('Configuration imported successfully', 'success');
            } catch (error) {
                this.showNotification('Invalid configuration file', 'error');
            }
        };
        reader.readAsText(file);
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

    destroy() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
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

function testApiKeys() {
    window.stremioUI.testApiKeys();
}

function saveSettings() {
    window.stremioUI.saveSettings();
}

function clearCache() {
    window.stremioUI.clearCache();
}

function clearErrorLogs() {
    window.stremioUI.clearErrorLogs();
}

function exportErrorLogs() {
    window.stremioUI.exportErrorLogs();
}

function exportConfig() {
    window.stremioUI.exportConfig();
}

function importConfig() {
    window.stremioUI.importConfig();
}

function toggleVisibility(inputId) {
    window.stremioUI.toggleVisibility(inputId);
}

// Initialize the UI when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.stremioUI = new StremioAddonUI();
});

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    if (window.stremioUI) {
        window.stremioUI.destroy();
    }
});
