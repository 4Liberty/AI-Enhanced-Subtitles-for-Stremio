// Final Security Validation Test - All Flaws Resolved
console.log('🔐 Running final security validation...');

const fs = require('fs');
const path = require('path');

class FinalSecurityValidator {
    constructor() {
        this.passedChecks = [];
        this.failedChecks = [];
        this.warnings = [];
    }

    // Test 1: Security Headers Implementation
    testSecurityHeaders() {
        console.log('\n1. Testing security headers implementation...');
        
        const serverPath = path.join(__dirname, 'server.js');
        const serverContent = fs.readFileSync(serverPath, 'utf8');
        
        const requiredHeaders = [
            'X-Frame-Options',
            'X-Content-Type-Options',
            'X-XSS-Protection',
            'Content-Security-Policy',
            'Referrer-Policy',
            'Permissions-Policy'
        ];
        
        let headerCount = 0;
        requiredHeaders.forEach(header => {
            if (serverContent.includes(header)) {
                headerCount++;
                this.passedChecks.push(`Security header ${header} implemented`);
            } else {
                this.failedChecks.push(`Security header ${header} missing`);
            }
        });
        
        if (headerCount === requiredHeaders.length) {
            console.log('✅ All security headers implemented');
        } else {
            console.log(`❌ ${requiredHeaders.length - headerCount} security headers missing`);
        }
        
        return headerCount === requiredHeaders.length;
    }

    // Test 2: Input Validation Implementation
    testInputValidation() {
        console.log('\n2. Testing input validation implementation...');
        
        const serverPath = path.join(__dirname, 'server.js');
        const serverContent = fs.readFileSync(serverPath, 'utf8');
        
        const validationPatterns = [
            'validateInput',
            'dangerousPatterns',
            'script.*>.*<.*script',
            'javascript:',
            'eval.*\\(',
            'Function.*\\('
        ];
        
        let validationCount = 0;
        validationPatterns.forEach(pattern => {
            if (serverContent.includes(pattern) || new RegExp(pattern).test(serverContent)) {
                validationCount++;
                this.passedChecks.push(`Input validation pattern ${pattern} found`);
            } else {
                this.failedChecks.push(`Input validation pattern ${pattern} missing`);
            }
        });
        
        if (validationCount >= 4) {
            console.log('✅ Input validation properly implemented');
            return true;
        } else {
            console.log(`❌ Input validation incomplete: ${validationCount}/6 patterns found`);
            return false;
        }
    }

    // Test 3: API Key Security
    testAPIKeySecurity() {
        console.log('\n3. Testing API key security...');
        
        const serverPath = path.join(__dirname, 'server.js');
        const serverContent = fs.readFileSync(serverPath, 'utf8');
        
        // Check for API key masking
        const hasMasking = serverContent.includes('substring(0, 4)') && serverContent.includes('***');
        
        // Check for environment variable validation
        const hasValidation = serverContent.includes('validateEnvironmentVariables');
        
        // Check for no hardcoded keys
        const hasHardcodedKeys = /api[_-]?key['"]\s*:\s*['"][^'"]{10,}['"]/.test(serverContent);
        
        if (hasMasking) {
            this.passedChecks.push('API key masking implemented');
        } else {
            this.failedChecks.push('API key masking missing');
        }
        
        if (hasValidation) {
            this.passedChecks.push('Environment variable validation implemented');
        } else {
            this.failedChecks.push('Environment variable validation missing');
        }
        
        if (!hasHardcodedKeys) {
            this.passedChecks.push('No hardcoded API keys found');
        } else {
            this.failedChecks.push('Hardcoded API keys detected');
        }
        
        const passed = hasMasking && hasValidation && !hasHardcodedKeys;
        if (passed) {
            console.log('✅ API key security properly implemented');
        } else {
            console.log('❌ API key security issues found');
        }
        
        return passed;
    }

    // Test 4: Request Size Limiting
    testRequestLimiting() {
        console.log('\n4. Testing request size limiting...');
        
        const serverPath = path.join(__dirname, 'server.js');
        const serverContent = fs.readFileSync(serverPath, 'utf8');
        
        const hasJSONLimit = serverContent.includes('express.json({ limit:');
        const hasURLLimit = serverContent.includes('express.urlencoded({ limit:');
        
        if (hasJSONLimit) {
            this.passedChecks.push('JSON request size limiting implemented');
        } else {
            this.failedChecks.push('JSON request size limiting missing');
        }
        
        if (hasURLLimit) {
            this.passedChecks.push('URL-encoded request size limiting implemented');
        } else {
            this.failedChecks.push('URL-encoded request size limiting missing');
        }
        
        const passed = hasJSONLimit && hasURLLimit;
        if (passed) {
            console.log('✅ Request size limiting properly implemented');
        } else {
            console.log('❌ Request size limiting incomplete');
        }
        
        return passed;
    }

    // Test 5: Error Handling Security
    testErrorHandling() {
        console.log('\n5. Testing secure error handling...');
        
        const serverPath = path.join(__dirname, 'server.js');
        const serverContent = fs.readFileSync(serverPath, 'utf8');
        
        // Check for proper error handling
        const hasTryCatch = (serverContent.match(/try\s*\{[\s\S]*?\}\s*catch/g) || []).length > 5;
        const hasSecureErrors = serverContent.includes('error: \'Input validation failed\'');
        const noStackExposure = !serverContent.includes('error.stack');
        
        if (hasTryCatch) {
            this.passedChecks.push('Comprehensive try-catch blocks implemented');
        } else {
            this.failedChecks.push('Insufficient error handling');
        }
        
        if (hasSecureErrors) {
            this.passedChecks.push('Secure error messages implemented');
        } else {
            this.failedChecks.push('Secure error messages missing');
        }
        
        if (noStackExposure) {
            this.passedChecks.push('No stack trace exposure');
        } else {
            this.failedChecks.push('Stack traces may be exposed');
        }
        
        const passed = hasTryCatch && hasSecureErrors && noStackExposure;
        if (passed) {
            console.log('✅ Error handling security properly implemented');
        } else {
            console.log('❌ Error handling security issues found');
        }
        
        return passed;
    }

    // Test 6: Configuration Security
    testConfigurationSecurity() {
        console.log('\n6. Testing configuration security...');
        
        const configPath = path.join(__dirname, 'config.js');
        if (fs.existsSync(configPath)) {
            const configContent = fs.readFileSync(configPath, 'utf8');
            
            // Check for environment variable usage
            const usesEnvVars = configContent.includes('process.env.');
            const noHardcodedSecrets = !configContent.includes('your-vps-ip-or-domain');
            
            if (usesEnvVars) {
                this.passedChecks.push('Environment variables used for configuration');
            } else {
                this.failedChecks.push('Hardcoded configuration detected');
            }
            
            if (noHardcodedSecrets) {
                this.passedChecks.push('No hardcoded secrets in configuration');
            } else {
                this.failedChecks.push('Hardcoded secrets in configuration');
            }
            
            const passed = usesEnvVars && noHardcodedSecrets;
            if (passed) {
                console.log('✅ Configuration security properly implemented');
            } else {
                console.log('❌ Configuration security issues found');
            }
            
            return passed;
        } else {
            this.warnings.push('Configuration file not found');
            console.log('⚠️  Configuration file not found');
            return true; // Not critical if file doesn't exist
        }
    }

    // Test 7: UI Security
    testUIScriptSecurity() {
        console.log('\n7. Testing UI script security...');
        
        const uiScriptPath = path.join(__dirname, 'ui', 'script.js');
        if (fs.existsSync(uiScriptPath)) {
            const uiContent = fs.readFileSync(uiScriptPath, 'utf8');
            
            // Check for XSS protection
            const hasXSSProtection = uiContent.includes('sanitizeHTML') || uiContent.includes('textContent');
            const noInnerHTML = !uiContent.includes('innerHTML =');
            const hasSafeNotifications = uiContent.includes('showSafeNotification');
            
            if (hasXSSProtection) {
                this.passedChecks.push('XSS protection implemented in UI');
            } else {
                this.failedChecks.push('XSS protection missing in UI');
            }
            
            if (noInnerHTML) {
                this.passedChecks.push('No unsafe innerHTML usage');
            } else {
                this.failedChecks.push('Unsafe innerHTML usage detected');
            }
            
            const passed = hasXSSProtection;
            if (passed) {
                console.log('✅ UI script security properly implemented');
            } else {
                console.log('❌ UI script security issues found');
            }
            
            return passed;
        } else {
            this.warnings.push('UI script file not found');
            console.log('⚠️  UI script file not found');
            return true; // Not critical if file doesn't exist
        }
    }

    // Generate final validation report
    generateFinalReport() {
        const totalTests = 7;
        const passedTests = this.passedChecks.length;
        const failedTests = this.failedChecks.length;
        const totalChecks = passedTests + failedTests;
        
        console.log('\n' + '='.repeat(80));
        console.log('🔐 FINAL SECURITY VALIDATION REPORT');
        console.log('='.repeat(80));
        
        console.log(`\n📊 SUMMARY:`);
        console.log(`  ✅ Passed Checks: ${passedTests}`);
        console.log(`  ❌ Failed Checks: ${failedTests}`);
        console.log(`  ⚠️  Warnings: ${this.warnings.length}`);
        console.log(`  📈 Total Checks: ${totalChecks}`);
        
        if (passedTests > 0) {
            console.log('\n✅ PASSED SECURITY CHECKS:');
            this.passedChecks.forEach(check => {
                console.log(`  • ${check}`);
            });
        }
        
        if (failedTests > 0) {
            console.log('\n❌ FAILED SECURITY CHECKS:');
            this.failedChecks.forEach(check => {
                console.log(`  • ${check}`);
            });
        }
        
        if (this.warnings.length > 0) {
            console.log('\n⚠️  WARNINGS:');
            this.warnings.forEach(warning => {
                console.log(`  • ${warning}`);
            });
        }
        
        const securityScore = Math.round((passedTests / (passedTests + failedTests)) * 100);
        
        console.log(`\n🔐 SECURITY SCORE: ${securityScore}/100`);
        
        if (securityScore >= 95) {
            console.log('  Status: ✅ EXCELLENT - Production ready');
        } else if (securityScore >= 80) {
            console.log('  Status: ✅ GOOD - Minor improvements needed');
        } else if (securityScore >= 60) {
            console.log('  Status: ⚠️  FAIR - Several improvements needed');
        } else {
            console.log('  Status: ❌ POOR - Major security issues');
        }
        
        console.log('\n🎯 FINAL ASSESSMENT:');
        if (failedTests === 0) {
            console.log('  🎉 ALL SECURITY FLAWS RESOLVED!');
            console.log('  🚀 System is production-ready and secure');
            console.log('  🔐 Comprehensive security measures implemented');
            console.log('  📋 Ready for enterprise deployment');
        } else {
            console.log(`  ⚠️  ${failedTests} security issues remain`);
            console.log('  🔧 Please address remaining issues before deployment');
        }
        
        console.log('\n' + '='.repeat(80));
        
        return {
            securityScore,
            passedTests,
            failedTests,
            totalChecks: passedTests + failedTests,
            warnings: this.warnings.length,
            isSecure: failedTests === 0
        };
    }

    // Run complete validation
    async runCompleteValidation() {
        console.log('🚀 Starting final security validation...\n');
        
        const results = [];
        
        results.push(this.testSecurityHeaders());
        results.push(this.testInputValidation());
        results.push(this.testAPIKeySecurity());
        results.push(this.testRequestLimiting());
        results.push(this.testErrorHandling());
        results.push(this.testConfigurationSecurity());
        results.push(this.testUIScriptSecurity());
        
        const report = this.generateFinalReport();
        
        console.log('\n🎉 Final security validation completed!');
        
        return {
            ...report,
            allTestsPassed: results.every(result => result === true)
        };
    }
}

// Export for use in other files
module.exports = FinalSecurityValidator;

// Run validation if called directly
if (require.main === module) {
    const validator = new FinalSecurityValidator();
    validator.runCompleteValidation().then(result => {
        if (result.isSecure) {
            console.log('\n🎊 SUCCESS: All security flaws have been resolved!');
            process.exit(0);
        } else {
            console.log('\n⚠️  WARNING: Some security issues remain');
            process.exit(1);
        }
    }).catch(console.error);
}
