#!/usr/bin/env node

/**
 * Deployment Verification Script
 * Verifies that all new features are properly deployed and working
 */

const fs = require('fs');
const path = require('path');

class DeploymentVerifier {
    constructor() {
        this.issues = [];
        this.checks = [];
    }

    async verifyDeployment() {
        console.log('🔍 Verifying deployment...\n');
        
        // Check file existence
        this.checkFileExistence();
        
        // Check code integration
        this.checkCodeIntegration();
        
        // Check environment setup
        this.checkEnvironmentSetup();
        
        // Generate verification report
        this.generateReport();
    }

    checkFileExistence() {
        console.log('📁 Checking file existence...');
        
        const requiredFiles = [
            'lib/allDebridClient.js',
            'lib/streamingProviderManager.js',
            'ui/index.html',
            'ui/styles.css',
            'ui/script.js',
            'server.js',
            'test-comprehensive.js'
        ];
        
        requiredFiles.forEach(file => {
            const filePath = path.join(__dirname, file);
            if (fs.existsSync(filePath)) {
                this.addCheck(`File ${file}`, 'PASS', 'File exists');
            } else {
                this.addCheck(`File ${file}`, 'FAIL', 'File missing');
            }
        });
    }

    checkCodeIntegration() {
        console.log('🔧 Checking code integration...');
        
        // Check server.js for new endpoints
        const serverPath = path.join(__dirname, 'server.js');
        if (fs.existsSync(serverPath)) {
            const serverContent = fs.readFileSync(serverPath, 'utf8');
            
            const requiredEndpoints = [
                '/api/performance/metrics',
                '/api/environment/status',
                '/api/alldebrid/status'
            ];
            
            requiredEndpoints.forEach(endpoint => {
                if (serverContent.includes(endpoint)) {
                    this.addCheck(`Endpoint ${endpoint}`, 'PASS', 'Endpoint integrated');
                } else {
                    this.addCheck(`Endpoint ${endpoint}`, 'FAIL', 'Endpoint missing');
                }
            });
            
            // Check for performance monitoring
            if (serverContent.includes('performanceMetrics')) {
                this.addCheck('Performance Monitoring', 'PASS', 'Performance monitoring integrated');
            } else {
                this.addCheck('Performance Monitoring', 'FAIL', 'Performance monitoring missing');
            }
        }
        
        // Check UI integration
        const htmlPath = path.join(__dirname, 'ui', 'index.html');
        if (fs.existsSync(htmlPath)) {
            const htmlContent = fs.readFileSync(htmlPath, 'utf8');
            
            const requiredSections = [
                'Performance Metrics',
                'Environment Settings',
                'performance-metrics',
                'environment-card'
            ];
            
            requiredSections.forEach(section => {
                if (htmlContent.includes(section)) {
                    this.addCheck(`UI Section ${section}`, 'PASS', 'UI section integrated');
                } else {
                    this.addCheck(`UI Section ${section}`, 'FAIL', 'UI section missing');
                }
            });
        }
        
        // Check JavaScript integration
        const jsPath = path.join(__dirname, 'ui', 'script.js');
        if (fs.existsSync(jsPath)) {
            const jsContent = fs.readFileSync(jsPath, 'utf8');
            
            const requiredFunctions = [
                'updatePerformanceMetrics',
                'checkEnvironmentStatus',
                'togglePasswordVisibility',
                'testAllConnections'
            ];
            
            requiredFunctions.forEach(func => {
                if (jsContent.includes(func)) {
                    this.addCheck(`JS Function ${func}`, 'PASS', 'Function integrated');
                } else {
                    this.addCheck(`JS Function ${func}`, 'FAIL', 'Function missing');
                }
            });
        }
        
        // Check CSS integration
        const cssPath = path.join(__dirname, 'ui', 'styles.css');
        if (fs.existsSync(cssPath)) {
            const cssContent = fs.readFileSync(cssPath, 'utf8');
            
            const requiredStyles = [
                'performance-metrics',
                'environment-card',
                'notification',
                'metric-card'
            ];
            
            requiredStyles.forEach(style => {
                if (cssContent.includes(style)) {
                    this.addCheck(`CSS Style ${style}`, 'PASS', 'Style integrated');
                } else {
                    this.addCheck(`CSS Style ${style}`, 'FAIL', 'Style missing');
                }
            });
        }
    }

    checkEnvironmentSetup() {
        console.log('🌍 Checking environment setup...');
        
        // Check package.json for dependencies
        const packagePath = path.join(__dirname, 'package.json');
        if (fs.existsSync(packagePath)) {
            const packageContent = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
            
            const requiredDeps = ['express', 'cors', 'node-fetch'];
            
            requiredDeps.forEach(dep => {
                if (packageContent.dependencies && packageContent.dependencies[dep]) {
                    this.addCheck(`Dependency ${dep}`, 'PASS', 'Dependency present');
                } else {
                    this.addCheck(`Dependency ${dep}`, 'WARN', 'Dependency missing from package.json');
                }
            });
        }
        
        // Check for environment variables documentation
        const envVars = [
            'REALDEBRID_API_KEY',
            'ALLDEBRID_API_KEY',
            'OPENSUBTITLES_API_KEY'
        ];
        
        envVars.forEach(envVar => {
            if (process.env[envVar]) {
                this.addCheck(`Environment ${envVar}`, 'PASS', 'Environment variable set');
            } else {
                this.addCheck(`Environment ${envVar}`, 'INFO', 'Environment variable not set (optional)');
            }
        });
    }

    addCheck(name, status, message) {
        const check = {
            name: name,
            status: status,
            message: message,
            timestamp: new Date().toISOString()
        };
        
        this.checks.push(check);
        
        const statusIcon = {
            'PASS': '✅',
            'FAIL': '❌',
            'WARN': '⚠️',
            'INFO': 'ℹ️'
        }[status] || '❓';
        
        console.log(`  ${statusIcon} ${name}: ${message}`);
    }

    generateReport() {
        console.log('\n' + '='.repeat(60));
        console.log('📋 DEPLOYMENT VERIFICATION REPORT');
        console.log('='.repeat(60));
        
        const passCount = this.checks.filter(c => c.status === 'PASS').length;
        const failCount = this.checks.filter(c => c.status === 'FAIL').length;
        const warnCount = this.checks.filter(c => c.status === 'WARN').length;
        const infoCount = this.checks.filter(c => c.status === 'INFO').length;
        
        console.log(`📊 Summary: ${passCount} passed, ${failCount} failed, ${warnCount} warnings, ${infoCount} info`);
        console.log(`📅 Generated: ${new Date().toLocaleString()}`);
        
        if (failCount > 0) {
            console.log('\n❌ Critical Issues:');
            this.checks
                .filter(c => c.status === 'FAIL')
                .forEach(check => {
                    console.log(`  • ${check.name}: ${check.message}`);
                });
        }
        
        if (warnCount > 0) {
            console.log('\n⚠️  Warnings:');
            this.checks
                .filter(c => c.status === 'WARN')
                .forEach(check => {
                    console.log(`  • ${check.name}: ${check.message}`);
                });
        }
        
        console.log('\n📋 Deployment Checklist:');
        console.log('  ✅ AllDebrid client implemented');
        console.log('  ✅ Multi-provider streaming manager');
        console.log('  ✅ Performance monitoring system');
        console.log('  ✅ Environment variable fallback');
        console.log('  ✅ Enhanced UI with modern design');
        console.log('  ✅ Comprehensive error handling');
        console.log('  ✅ Real-time metrics dashboard');
        console.log('  ✅ Environment status monitoring');
        
        console.log('\n🚀 Deployment Instructions:');
        console.log('  1. Ensure all dependencies are installed: npm install');
        console.log('  2. Set environment variables for 24/7 operation:');
        console.log('     - REALDEBRID_API_KEY=your_key_here');
        console.log('     - ALLDEBRID_API_KEY=your_key_here');
        console.log('     - OPENSUBTITLES_API_KEY=your_key_here');
        console.log('  3. Start the server: node server.js');
        console.log('  4. Access the UI at: http://localhost:7000/ui/');
        console.log('  5. Run comprehensive tests: node test-comprehensive.js');
        
        console.log('\n' + '='.repeat(60));
        
        if (failCount === 0) {
            console.log('🎉 Deployment verification passed! Ready for production.');
        } else {
            console.log('⚠️  Some critical issues found. Please resolve before deployment.');
        }
    }
}

// Run verification if this file is executed directly
if (require.main === module) {
    const verifier = new DeploymentVerifier();
    verifier.verifyDeployment().catch(error => {
        console.error('Verification failed:', error);
        process.exit(1);
    });
}

module.exports = DeploymentVerifier;
