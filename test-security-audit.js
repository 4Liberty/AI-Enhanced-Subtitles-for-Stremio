// Advanced Security Audit and Flaw Detection
console.log('🔒 Running advanced security audit...');

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class SecurityAuditor {
    constructor() {
        this.vulnerabilities = [];
        this.recommendations = [];
        this.criticalIssues = [];
        this.configFlaws = [];
    }

    // 1. Environment Variable Security
    auditEnvironmentVariables() {
        console.log('\n🔍 Auditing environment variables...');
        
        const sensitiveVars = [
            'OPENSUBTITLES_API_KEY',
            'SUBDL_API_KEY',
            'GEMINI_API_KEY',
            'REAL_DEBRID_API_KEY',
            'ALL_DEBRID_API_KEY',
            'TMDB_API_KEY'
        ];

        sensitiveVars.forEach(varName => {
            const value = process.env[varName];
            if (value) {
                // Check for common API key patterns that might be weak
                if (value.length < 16) {
                    this.vulnerabilities.push(`${varName} appears to be too short (${value.length} chars)`);
                }
                
                // Check for test/dummy keys
                if (value.includes('test') || value.includes('dummy') || value.includes('example')) {
                    this.criticalIssues.push(`${varName} contains test/dummy value`);
                }
                
                // Check for common weak patterns
                if (value === '123456' || value === 'password' || value === 'admin') {
                    this.criticalIssues.push(`${varName} uses extremely weak value`);
                }
            }
        });

        console.log('✅ Environment variable security audit completed');
    }

    // 2. Configuration Security
    auditConfiguration() {
        console.log('\n🔧 Auditing configuration security...');
        
        try {
            const configPath = path.join(__dirname, 'config.js');
            if (fs.existsSync(configPath)) {
                const configContent = fs.readFileSync(configPath, 'utf8');
                
                // Check for hardcoded secrets
                const secretPatterns = [
                    /api[_-]?key['"]\s*:\s*['"][^'"]{10,}['"]/gi,
                    /password['"]\s*:\s*['"][^'"]+['"]/gi,
                    /secret['"]\s*:\s*['"][^'"]+['"]/gi,
                    /token['"]\s*:\s*['"][^'"]+['"]/gi
                ];

                secretPatterns.forEach(pattern => {
                    const matches = configContent.match(pattern);
                    if (matches) {
                        this.vulnerabilities.push(`Potential hardcoded secret found in config.js: ${matches.length} matches`);
                    }
                });

                // Check for insecure default values
                if (configContent.includes('your-vps-ip-or-domain')) {
                    this.configFlaws.push('Default placeholder URL still present in config');
                }
            }
        } catch (error) {
            this.vulnerabilities.push(`Error reading configuration: ${error.message}`);
        }

        console.log('✅ Configuration security audit completed');
    }

    // 3. Input Validation Gaps
    auditInputValidation() {
        console.log('\n🛡️ Auditing input validation...');
        
        const serverPath = path.join(__dirname, 'server.js');
        if (fs.existsSync(serverPath)) {
            const serverContent = fs.readFileSync(serverPath, 'utf8');
            
            // Check for SQL injection vulnerabilities
            const sqlPatterns = [
                /SELECT\s+.*FROM\s+.*WHERE\s+.*\$\{/gi,
                /INSERT\s+INTO\s+.*VALUES\s+.*\$\{/gi,
                /UPDATE\s+.*SET\s+.*\$\{/gi
            ];

            sqlPatterns.forEach(pattern => {
                if (pattern.test(serverContent)) {
                    this.criticalIssues.push('Potential SQL injection vulnerability detected');
                }
            });

            // Check for XSS vulnerabilities
            const xssPatterns = [
                /innerHTML\s*=\s*.*\+/gi,
                /document\.write\s*\(/gi,
                /eval\s*\(/gi,
                /Function\s*\(/gi
            ];

            xssPatterns.forEach(pattern => {
                if (pattern.test(serverContent)) {
                    this.vulnerabilities.push('Potential XSS vulnerability detected');
                }
            });

            // Check for command injection
            const commandPatterns = [
                /exec\s*\(/gi,
                /spawn\s*\(/gi,
                /system\s*\(/gi
            ];

            commandPatterns.forEach(pattern => {
                if (pattern.test(serverContent)) {
                    this.vulnerabilities.push('Potential command injection vulnerability detected');
                }
            });
        }

        console.log('✅ Input validation audit completed');
    }

    // 4. Network Security
    auditNetworkSecurity() {
        console.log('\n🌐 Auditing network security...');
        
        const serverPath = path.join(__dirname, 'server.js');
        if (fs.existsSync(serverPath)) {
            const serverContent = fs.readFileSync(serverPath, 'utf8');
            
            // Check for HTTPS enforcement
            if (!serverContent.includes('https://') && serverContent.includes('http://')) {
                this.vulnerabilities.push('HTTP used instead of HTTPS in some configurations');
            }

            // Check for CORS configuration
            if (!serverContent.includes('cors') && !serverContent.includes('Access-Control-Allow-Origin')) {
                this.vulnerabilities.push('CORS policy not explicitly configured');
            }

            // Check for rate limiting
            if (!serverContent.includes('rate') && !serverContent.includes('limit')) {
                this.vulnerabilities.push('Rate limiting not implemented');
            }
        }

        console.log('✅ Network security audit completed');
    }

    // 5. File Security
    auditFileSystem() {
        console.log('\n📁 Auditing file system security...');
        
        // Check for sensitive files
        const sensitiveFiles = [
            '.env',
            '.env.local',
            '.env.production',
            'secrets.json',
            'private.key',
            'id_rsa',
            'config.json'
        ];

        sensitiveFiles.forEach(file => {
            if (fs.existsSync(path.join(__dirname, file))) {
                this.vulnerabilities.push(`Sensitive file ${file} found in root directory`);
            }
        });

        // Check for world-readable files
        try {
            const packagePath = path.join(__dirname, 'package.json');
            if (fs.existsSync(packagePath)) {
                const stats = fs.statSync(packagePath);
                // Check if file is readable by others (simplified check)
                if (stats.mode & 0o004) {
                    this.recommendations.push('Consider restricting file permissions on sensitive files');
                }
            }
        } catch (error) {
            // Ignore permission errors on Windows
        }

        console.log('✅ File system security audit completed');
    }

    // 6. Dependency Security
    auditDependencies() {
        console.log('\n📦 Auditing dependency security...');
        
        const packagePath = path.join(__dirname, 'package.json');
        if (fs.existsSync(packagePath)) {
            const packageContent = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
            
            // Check for outdated dependencies
            const dependencies = packageContent.dependencies || {};
            const outdatedPatterns = [
                { name: 'express', version: '^4.19.2', issue: 'Should use latest stable version' },
                { name: 'node-fetch', version: '^2.7.0', issue: 'Consider upgrading to v3+ for better security' }
            ];

            outdatedPatterns.forEach(dep => {
                if (dependencies[dep.name] && dependencies[dep.name] !== dep.version) {
                    this.recommendations.push(`${dep.name}: ${dep.issue}`);
                }
            });

            // Check for dev dependencies in production
            if (packageContent.devDependencies && Object.keys(packageContent.devDependencies).length > 0) {
                this.recommendations.push('Consider removing dev dependencies in production builds');
            }
        }

        console.log('✅ Dependency security audit completed');
    }

    // 7. Runtime Security
    auditRuntime() {
        console.log('\n⚡ Auditing runtime security...');
        
        // Check Node.js version
        const nodeVersion = process.version;
        const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
        
        if (majorVersion < 18) {
            this.vulnerabilities.push(`Node.js version ${nodeVersion} is outdated. Use Node.js 18+ for better security`);
        }

        // Check for security headers
        const serverPath = path.join(__dirname, 'server.js');
        if (fs.existsSync(serverPath)) {
            const serverContent = fs.readFileSync(serverPath, 'utf8');
            
            const securityHeaders = [
                'X-Frame-Options',
                'X-Content-Type-Options',
                'X-XSS-Protection',
                'Content-Security-Policy',
                'Strict-Transport-Security'
            ];

            securityHeaders.forEach(header => {
                if (!serverContent.includes(header)) {
                    this.vulnerabilities.push(`Missing security header: ${header}`);
                }
            });
        }

        console.log('✅ Runtime security audit completed');
    }

    // Generate comprehensive security report
    generateSecurityReport() {
        console.log('\n' + '='.repeat(80));
        console.log('🔒 COMPREHENSIVE SECURITY AUDIT REPORT');
        console.log('='.repeat(80));

        const totalIssues = this.criticalIssues.length + this.vulnerabilities.length + this.configFlaws.length;
        
        console.log(`\n📊 SUMMARY:`);
        console.log(`  🔴 Critical Issues: ${this.criticalIssues.length}`);
        console.log(`  🟡 Vulnerabilities: ${this.vulnerabilities.length}`);
        console.log(`  🔧 Configuration Flaws: ${this.configFlaws.length}`);
        console.log(`  💡 Recommendations: ${this.recommendations.length}`);
        console.log(`  📈 Total Issues: ${totalIssues}`);

        if (this.criticalIssues.length > 0) {
            console.log('\n🚨 CRITICAL ISSUES:');
            this.criticalIssues.forEach(issue => {
                console.log(`  • ${issue}`);
            });
        }

        if (this.vulnerabilities.length > 0) {
            console.log('\n⚠️  VULNERABILITIES:');
            this.vulnerabilities.forEach(vuln => {
                console.log(`  • ${vuln}`);
            });
        }

        if (this.configFlaws.length > 0) {
            console.log('\n🔧 CONFIGURATION FLAWS:');
            this.configFlaws.forEach(flaw => {
                console.log(`  • ${flaw}`);
            });
        }

        if (this.recommendations.length > 0) {
            console.log('\n💡 RECOMMENDATIONS:');
            this.recommendations.forEach(rec => {
                console.log(`  • ${rec}`);
            });
        }

        console.log('\n🔐 SECURITY SCORE:');
        const maxScore = 100;
        const deductions = (this.criticalIssues.length * 20) + (this.vulnerabilities.length * 10) + (this.configFlaws.length * 5);
        const score = Math.max(0, maxScore - deductions);
        
        console.log(`  Score: ${score}/100`);
        if (score >= 90) {
            console.log('  Status: ✅ EXCELLENT - Very secure');
        } else if (score >= 70) {
            console.log('  Status: ⚠️  GOOD - Minor issues to address');
        } else if (score >= 50) {
            console.log('  Status: 🟡 FAIR - Several issues need attention');
        } else {
            console.log('  Status: 🔴 POOR - Critical security issues present');
        }

        console.log('\n🛡️  NEXT STEPS:');
        if (this.criticalIssues.length > 0) {
            console.log('  1. ⚠️  Address critical issues immediately');
        }
        if (this.vulnerabilities.length > 0) {
            console.log('  2. 🔧 Fix identified vulnerabilities');
        }
        if (this.configFlaws.length > 0) {
            console.log('  3. 🔄 Update configuration issues');
        }
        if (this.recommendations.length > 0) {
            console.log('  4. 💡 Implement security recommendations');
        }
        
        console.log('  5. 🔁 Re-run audit after fixes');
        console.log('  6. 📊 Monitor security continuously');

        console.log('\n' + '='.repeat(80));
        
        return {
            score,
            totalIssues,
            criticalIssues: this.criticalIssues.length,
            vulnerabilities: this.vulnerabilities.length,
            configFlaws: this.configFlaws.length,
            recommendations: this.recommendations.length
        };
    }

    // Run complete security audit
    async runCompleteAudit() {
        console.log('🚀 Starting comprehensive security audit...\n');
        
        try {
            this.auditEnvironmentVariables();
            this.auditConfiguration();
            this.auditInputValidation();
            this.auditNetworkSecurity();
            this.auditFileSystem();
            this.auditDependencies();
            this.auditRuntime();
            
            const report = this.generateSecurityReport();
            
            console.log('\n🎉 Security audit completed successfully!');
            return report;
            
        } catch (error) {
            console.error('❌ Security audit failed:', error);
            throw error;
        }
    }
}

// Export for use in other files
module.exports = SecurityAuditor;

// Run audit if called directly
if (require.main === module) {
    const auditor = new SecurityAuditor();
    auditor.runCompleteAudit().catch(console.error);
}
