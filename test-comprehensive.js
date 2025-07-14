#!/usr/bin/env node

/**
 * Comprehensive test script for multi-debrid addon with UI overhaul
 * Tests all new features including performance monitoring, environment variables, and UI integration
 */

const http = require('http');
const https = require('https');
const { performance } = require('perf_hooks');

class ComprehensiveAddonTester {
    constructor() {
        this.baseUrl = 'http://localhost:7000';
        this.testResults = [];
        this.startTime = Date.now();
    }

    async runAllTests() {
        console.log('🚀 Starting comprehensive addon tests...\n');
        
        try {
            // Test 1: Performance Metrics Endpoint
            await this.testPerformanceMetrics();
            
            // Test 2: Environment Status
            await this.testEnvironmentStatus();
            
            // Test 3: Enhanced Configuration
            await this.testEnhancedConfiguration();
            
            // Test 4: Multi-debrid Support
            await this.testMultiDebridSupport();
            
            // Test 5: UI Integration
            await this.testUIIntegration();
            
            // Test 6: Performance Monitoring
            await this.testPerformanceMonitoring();
            
            // Test 7: Environment Variable Fallback
            await this.testEnvironmentFallback();
            
            // Test 8: Error Handling
            await this.testErrorHandling();
            
            // Generate comprehensive report
            this.generateReport();
            
        } catch (error) {
            console.error('❌ Test suite failed:', error);
            process.exit(1);
        }
    }

    async testPerformanceMetrics() {
        console.log('📊 Testing performance metrics endpoint...');
        
        try {
            const response = await this.makeRequest('/api/performance/metrics');
            const metrics = JSON.parse(response);
            
            // Verify required fields
            const requiredFields = ['uptime', 'memory', 'cpu', 'requests', 'performance'];
            const missingFields = requiredFields.filter(field => !metrics[field]);
            
            if (missingFields.length > 0) {
                throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
            }
            
            // Verify memory metrics
            if (!metrics.memory.rss || !metrics.memory.heapUsed) {
                throw new Error('Memory metrics incomplete');
            }
            
            // Verify performance metrics
            if (metrics.performance.activeConnections === undefined) {
                throw new Error('Active connections metric missing');
            }
            
            this.addTestResult('Performance Metrics', 'PASS', 'All metrics endpoints working correctly');
            
        } catch (error) {
            this.addTestResult('Performance Metrics', 'FAIL', error.message);
        }
    }

    async testEnvironmentStatus() {
        console.log('🔧 Testing environment status endpoint...');
        
        try {
            const response = await this.makeRequest('/api/environment/status');
            const envStatus = JSON.parse(response);
            
            // Verify structure
            const requiredProviders = ['realdebrid', 'alldebrid', 'opensubtitles'];
            for (const provider of requiredProviders) {
                if (!envStatus[provider]) {
                    throw new Error(`Missing ${provider} environment status`);
                }
                
                if (envStatus[provider].available === undefined || !envStatus[provider].source) {
                    throw new Error(`Incomplete ${provider} environment status`);
                }
            }
            
            // Verify fallback status
            if (envStatus.fallbackEnabled === undefined) {
                throw new Error('Fallback enabled status missing');
            }
            
            this.addTestResult('Environment Status', 'PASS', 'Environment status endpoint working correctly');
            
        } catch (error) {
            this.addTestResult('Environment Status', 'FAIL', error.message);
        }
    }

    async testEnhancedConfiguration() {
        console.log('⚙️ Testing enhanced configuration endpoint...');
        
        try {
            const response = await this.makeRequest('/api/config');
            const config = JSON.parse(response);
            
            // Verify enhanced configuration structure
            const requiredFields = ['realdebrid', 'alldebrid', 'opensubtitles', 'preferredProvider', 'fallbackMode', 'sources'];
            const missingFields = requiredFields.filter(field => config[field] === undefined);
            
            if (missingFields.length > 0) {
                throw new Error(`Missing configuration fields: ${missingFields.join(', ')}`);
            }
            
            // Verify sources information
            if (!config.sources.realdebrid || !config.sources.alldebrid || !config.sources.opensubtitles) {
                throw new Error('API key sources information incomplete');
            }
            
            this.addTestResult('Enhanced Configuration', 'PASS', 'Configuration endpoint enhanced successfully');
            
        } catch (error) {
            this.addTestResult('Enhanced Configuration', 'FAIL', error.message);
        }
    }

    async testMultiDebridSupport() {
        console.log('🔗 Testing multi-debrid support...');
        
        try {
            // Test AllDebrid status
            const allDebridResponse = await this.makeRequest('/api/alldebrid/status');
            const allDebridStatus = JSON.parse(allDebridResponse);
            
            if (!allDebridStatus.hasOwnProperty('configured')) {
                throw new Error('AllDebrid status endpoint incomplete');
            }
            
            // Test Real-Debrid status (should still work)
            const realDebridResponse = await this.makeRequest('/api/realdebrid/status');
            const realDebridStatus = JSON.parse(realDebridResponse);
            
            if (!realDebridStatus.hasOwnProperty('configured')) {
                throw new Error('Real-Debrid status endpoint incomplete');
            }
            
            this.addTestResult('Multi-Debrid Support', 'PASS', 'Both AllDebrid and Real-Debrid endpoints working');
            
        } catch (error) {
            this.addTestResult('Multi-Debrid Support', 'FAIL', error.message);
        }
    }

    async testUIIntegration() {
        console.log('🎨 Testing UI integration...');
        
        try {
            // Test UI assets
            const htmlResponse = await this.makeRequest('/ui/');
            if (!htmlResponse.includes('Performance Metrics') || !htmlResponse.includes('Environment Settings')) {
                throw new Error('UI missing new sections');
            }
            
            // Test CSS assets
            const cssResponse = await this.makeRequest('/ui/styles.css');
            if (!cssResponse.includes('performance-metrics') || !cssResponse.includes('environment-card')) {
                throw new Error('CSS missing new styles');
            }
            
            // Test JavaScript assets
            const jsResponse = await this.makeRequest('/ui/script.js');
            if (!jsResponse.includes('updatePerformanceMetrics') || !jsResponse.includes('checkEnvironmentStatus')) {
                throw new Error('JavaScript missing new functions');
            }
            
            this.addTestResult('UI Integration', 'PASS', 'All UI components properly integrated');
            
        } catch (error) {
            this.addTestResult('UI Integration', 'FAIL', error.message);
        }
    }

    async testPerformanceMonitoring() {
        console.log('⏱️ Testing performance monitoring...');
        
        try {
            // Make multiple requests to generate performance data
            const requests = [];
            for (let i = 0; i < 5; i++) {
                requests.push(this.makeRequest('/api/health'));
            }
            
            await Promise.all(requests);
            
            // Wait a bit for metrics to be processed
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Check performance metrics
            const metricsResponse = await this.makeRequest('/api/performance/metrics');
            const metrics = JSON.parse(metricsResponse);
            
            // Verify metrics were collected
            if (metrics.requests.total < 5) {
                throw new Error('Performance monitoring not collecting request data');
            }
            
            if (metrics.performance.recentResponseTimes.length === 0) {
                throw new Error('Response times not being tracked');
            }
            
            this.addTestResult('Performance Monitoring', 'PASS', 'Performance monitoring working correctly');
            
        } catch (error) {
            this.addTestResult('Performance Monitoring', 'FAIL', error.message);
        }
    }

    async testEnvironmentFallback() {
        console.log('🔄 Testing environment variable fallback...');
        
        try {
            // Test configuration with potential environment fallback
            const configResponse = await this.makeRequest('/api/config');
            const config = JSON.parse(configResponse);
            
            // Check if sources are properly identified
            const validSources = ['user', 'environment', 'none'];
            
            if (!validSources.includes(config.sources.realdebrid)) {
                throw new Error('Invalid Real-Debrid source classification');
            }
            
            if (!validSources.includes(config.sources.alldebrid)) {
                throw new Error('Invalid AllDebrid source classification');
            }
            
            if (!validSources.includes(config.sources.opensubtitles)) {
                throw new Error('Invalid OpenSubtitles source classification');
            }
            
            this.addTestResult('Environment Fallback', 'PASS', 'Environment variable fallback working correctly');
            
        } catch (error) {
            this.addTestResult('Environment Fallback', 'FAIL', error.message);
        }
    }

    async testErrorHandling() {
        console.log('🚨 Testing error handling...');
        
        try {
            // Test invalid endpoint
            try {
                await this.makeRequest('/api/invalid/endpoint');
                throw new Error('Should have received 404 error');
            } catch (error) {
                if (!error.message.includes('404')) {
                    throw new Error('Invalid error handling for 404');
                }
            }
            
            // Test malformed request
            try {
                await this.makeRequest('/api/config', 'POST', 'invalid json');
                throw new Error('Should have received 400 error');
            } catch (error) {
                if (!error.message.includes('400') && !error.message.includes('500')) {
                    throw new Error('Invalid error handling for malformed request');
                }
            }
            
            this.addTestResult('Error Handling', 'PASS', 'Error handling working correctly');
            
        } catch (error) {
            this.addTestResult('Error Handling', 'FAIL', error.message);
        }
    }

    async makeRequest(path, method = 'GET', data = null) {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'localhost',
                port: 7000,
                path: path,
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'AddonTester/1.0'
                }
            };
            
            if (data) {
                options.headers['Content-Length'] = Buffer.byteLength(data);
            }
            
            const req = http.request(options, (res) => {
                let responseData = '';
                
                res.on('data', (chunk) => {
                    responseData += chunk;
                });
                
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(responseData);
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
                    }
                });
            });
            
            req.on('error', reject);
            
            if (data) {
                req.write(data);
            }
            
            req.end();
        });
    }

    addTestResult(testName, status, message) {
        const result = {
            test: testName,
            status: status,
            message: message,
            timestamp: new Date().toISOString()
        };
        
        this.testResults.push(result);
        
        const statusIcon = status === 'PASS' ? '✅' : '❌';
        console.log(`  ${statusIcon} ${testName}: ${message}`);
    }

    generateReport() {
        const endTime = Date.now();
        const duration = endTime - this.startTime;
        
        console.log('\n' + '='.repeat(60));
        console.log('📋 COMPREHENSIVE TEST REPORT');
        console.log('='.repeat(60));
        
        const passCount = this.testResults.filter(r => r.status === 'PASS').length;
        const failCount = this.testResults.filter(r => r.status === 'FAIL').length;
        
        console.log(`📊 Summary: ${passCount} passed, ${failCount} failed`);
        console.log(`⏱️  Duration: ${duration}ms`);
        console.log(`📅 Generated: ${new Date().toLocaleString()}`);
        
        if (failCount > 0) {
            console.log('\n❌ Failed Tests:');
            this.testResults
                .filter(r => r.status === 'FAIL')
                .forEach(result => {
                    console.log(`  • ${result.test}: ${result.message}`);
                });
        }
        
        console.log('\n✅ All Tests:');
        this.testResults.forEach(result => {
            const statusIcon = result.status === 'PASS' ? '✅' : '❌';
            console.log(`  ${statusIcon} ${result.test}`);
        });
        
        console.log('\n' + '='.repeat(60));
        
        if (failCount === 0) {
            console.log('🎉 All tests passed! Addon is working correctly.');
        } else {
            console.log('⚠️  Some tests failed. Please review the issues above.');
            process.exit(1);
        }
    }
}

// Run tests if this file is executed directly
if (require.main === module) {
    const tester = new ComprehensiveAddonTester();
    tester.runAllTests().catch(error => {
        console.error('Test suite failed:', error);
        process.exit(1);
    });
}

module.exports = ComprehensiveAddonTester;
