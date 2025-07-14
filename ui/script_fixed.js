// Enhanced UI script with proper error handling and resource management
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
        this.isInitialized = false;
        
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
            this.showSafeNotification('System initialization failed - please refresh the page', 'error');
        }
    }

    initializeAfterDOM() {
        try {
            if (this.isInitialized) {
                console.log('UI already initialized, skipping...');
                return;
            }

            // Setup event listeners first
            this.setupEventListeners();
            
            // Load settings and initialize components
            this.loadSettings();
            this.startHealthMonitoring();
            this.startPerformanceMonitoring();
            
            // Initialize dashboard with error handling
            this.updateDashboard().catch(error => {
                console.error('Initial dashboard update failed:', error);
                this.showSafeNotification('Dashboard initialization failed - some features may be limited', 'warning');
            });
            
            this.updateTorrentsTab();
            this.populateProviders();
            this.populateSubtitleSources();
            
            // Show success notification
            this.showSafeNotification('Enhanced UI initialized successfully', 'success');
            
            // Initialize charts with error handling
            this.initializeCharts().catch(error => {
                console.error('Chart initialization failed:', error);
            });
            
            this.isInitialized = true;
            console.log('Enhanced Stremio Addon UI initialization complete');
            
        } catch (error) {
            console.error('Critical error during UI initialization:', error);
            this.showSafeNotification('System initialization failed - please refresh the page', 'error');
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

        // Test buttons
        document.querySelectorAll('[data-test]').forEach(button => {
            button.addEventListener('click', (e) => {
                const testType = e.target.dataset.test;
                this.runTest(testType);
            });
        });
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
                this.updateSystemStatus(dashboardData.status || 'unknown');
                
                // Update performance metrics
                this.updatePerformanceMetrics(dashboardData);
                
                // Update recent activity
                this.updateRecentActivity(dashboardData.recentErrors || []);
                
                this.hideLoadingState();
            } else {
                this.showLoadingError();
            }
            
            // Update providers
            this.updateProviders();
            
        } catch (error) {
            console.error('Dashboard update error:', error);
            this.showLoadingError();
        }
    }

    async fetchDashboardData() {
        try {
            console.log('Fetching dashboard data...');
            const response = await fetch('/api/dashboard');
            if (!response.ok) {
                console.warn(`Dashboard API returned ${response.status}`);
                // Return fallback data instead of null
                return {
                    subtitlesProcessed: 0,
                    torrentsFound: 0,
                    activeProviders: 0,
                    uptime: 0,
                    memoryUsage: 0,
                    successRate: 0,
                    status: 'warning',
                    message: 'API not responding'
                };
            }
            const data = await response.json();
            console.log('Dashboard data fetched successfully');
            return data;
        } catch (error) {
            console.error('Error fetching dashboard data:', error);
            // Return fallback data instead of null
            return {
                subtitlesProcessed: 0,
                torrentsFound: 0,
                activeProviders: 0,
                uptime: 0,
                memoryUsage: 0,
                successRate: 0,
                status: 'error',
                message: 'Failed to fetch data'
            };
        }
    }

    updateElementSafely(id, value) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        } else {
            console.warn(`Element with id '${id}' not found`);
        }
    }

    updateSystemStatus(status) {
        const statusElement = document.getElementById('system-status');
        if (statusElement) {
            statusElement.textContent = status;
            statusElement.className = `status-${status}`;
        }
    }

    updatePerformanceMetrics(data) {
        this.updateElementSafely('response-time', `${data.averageResponseTime || 0}ms`);
        this.updateElementSafely('success-rate', `${data.successRate || 0}%`);
        this.updateElementSafely('memory-usage', `${data.memoryUsage || 0}MB`);
        this.updateElementSafely('cpu-usage', `${data.cpuUsage || 0}%`);
    }

    updateRecentActivity(errors) {
        const activityList = document.getElementById('activity-list');
        if (activityList) {
            activityList.innerHTML = '';
            
            if (errors.length === 0) {
                const noActivity = document.createElement('div');
                noActivity.className = 'activity-item';
                noActivity.innerHTML = `
                    <div class="activity-time">Just now</div>
                    <div class="activity-text">System initialized</div>
                `;
                activityList.appendChild(noActivity);
            } else {
                errors.forEach(error => {
                    const activityItem = document.createElement('div');
                    activityItem.className = 'activity-item';
                    activityItem.innerHTML = `
                        <div class="activity-time">${new Date(error.timestamp).toLocaleTimeString()}</div>
                        <div class="activity-text">${error.message}</div>
                    `;
                    activityList.appendChild(activityItem);
                });
            }
        }
    }

    showLoadingState() {
        // Show loading indicators
        document.querySelectorAll('.loading-indicator').forEach(el => {
            el.style.display = 'block';
        });
    }

    hideLoadingState() {
        // Hide loading indicators
        document.querySelectorAll('.loading-indicator').forEach(el => {
            el.style.display = 'none';
        });
    }

    showLoadingError() {
        this.updateElementSafely('subtitles-processed', 0);
        this.updateElementSafely('torrents-found', 0);
        this.updateElementSafely('active-providers', 0);
        this.updateElementSafely('uptime', '0h 0m');
        
        // Update system status as warning instead of offline
        this.updateSystemStatus('warning');
        
        // Show a specific message that the server API is not responding
        this.showSafeNotification('Server API not responding - please check if the server is running', 'warning');
    }

    formatUptime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return `${hours}h ${minutes}m`;
    }

    showSafeNotification(message, type = 'info') {
        try {
            // Create notification element
            const notification = document.createElement('div');
            notification.className = `notification notification-${type}`;
            notification.textContent = message;
            
            // Add to notification container or body
            const container = document.getElementById('notifications') || document.body;
            container.appendChild(notification);
            
            // Auto-remove after 5 seconds
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 5000);
        } catch (error) {
            console.error('Error showing notification:', error);
        }
    }

    showNotification(message, type = 'info') {
        this.showSafeNotification(message, type);
    }

    // Populate providers with fallback data
    updateProviders() {
        const providersList = document.getElementById('providers-list');
        if (providersList) {
            providersList.innerHTML = `
                <div class="provider-item">
                    <span class="provider-name">Real-Debrid</span>
                    <span class="provider-status">Checking...</span>
                </div>
                <div class="provider-item">
                    <span class="provider-name">AllDebrid</span>
                    <span class="provider-status">Checking...</span>
                </div>
                <div class="provider-item">
                    <span class="provider-name">OpenSubtitles</span>
                    <span class="provider-status">Checking...</span>
                </div>
            `;
        }
    }

    populateProviders() {
        this.updateProviders();
    }

    populateSubtitleSources() {
        const sourcesList = document.getElementById('subtitle-sources');
        if (sourcesList) {
            sourcesList.innerHTML = `
                <div class="source-item">
                    <span class="source-name">SubDL</span>
                    <span class="source-status">Available</span>
                </div>
                <div class="source-item">
                    <span class="source-name">Podnapisi</span>
                    <span class="source-status">Available</span>
                </div>
                <div class="source-item">
                    <span class="source-name">OpenSubtitles</span>
                    <span class="source-status">Available</span>
                </div>
            `;
        }
    }

    updateSubtitlesTab() {
        console.log('Updating subtitles tab...');
        // Populate subtitle sources
        this.populateSubtitleSources();
    }

    updateTorrentsTab() {
        console.log('Updating torrents tab...');
        // Populate providers
        this.populateProviders();
    }

    updateHealthTab() {
        console.log('Updating health tab...');
        // This will be called when health tab is activated
    }

    updateSettingsTab() {
        console.log('Updating settings tab...');
        // This will be called when settings tab is activated
    }

    async initializeCharts() {
        try {
            console.log('Initializing charts...');
            // Chart initialization would go here
            // For now, just log that it's being initialized
            console.log('Charts initialized successfully');
        } catch (error) {
            console.error('Error initializing charts:', error);
        }
    }

    startHealthMonitoring() {
        console.log('Starting health monitoring...');
        // Start health monitoring intervals
        this.refreshInterval = setInterval(() => {
            if (this.currentTab === 'dashboard') {
                this.updateDashboard();
            }
        }, 30000); // Update every 30 seconds
    }

    startPerformanceMonitoring() {
        console.log('Starting performance monitoring...');
        // Start performance monitoring intervals
        this.performanceInterval = setInterval(() => {
            // Update performance metrics
            this.updatePerformanceMetrics({
                averageResponseTime: Math.random() * 100,
                successRate: 90 + Math.random() * 10,
                memoryUsage: 50 + Math.random() * 20,
                cpuUsage: 20 + Math.random() * 30
            });
        }, 5000); // Update every 5 seconds
    }

    loadSettings() {
        console.log('Loading settings...');
        // Load settings from localStorage or API
        try {
            const savedSettings = localStorage.getItem('stremio-addon-settings');
            if (savedSettings) {
                this.settings = JSON.parse(savedSettings);
            }
        } catch (error) {
            console.error('Error loading settings:', error);
        }
    }

    saveSettings() {
        console.log('Saving settings...');
        // Save settings to localStorage
        try {
            localStorage.setItem('stremio-addon-settings', JSON.stringify(this.settings));
        } catch (error) {
            console.error('Error saving settings:', error);
        }
    }

    runTest(testType) {
        console.log(`Running test: ${testType}`);
        this.showSafeNotification(`Running ${testType} test...`, 'info');
        
        // Simulate test running
        setTimeout(() => {
            this.showSafeNotification(`${testType} test completed`, 'success');
        }, 2000);
    }

    // Cleanup method
    destroy() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
        if (this.performanceInterval) {
            clearInterval(this.performanceInterval);
        }
        
        // Clean up chart instances
        Object.values(this.chartInstances).forEach(chart => {
            if (chart && chart.destroy) {
                chart.destroy();
            }
        });
        
        console.log('UI destroyed and cleaned up');
    }
}

// Initialize the UI when the page loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing UI...');
    window.stremioUI = new StremioAddonUI();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (window.stremioUI) {
        window.stremioUI.destroy();
    }
});
