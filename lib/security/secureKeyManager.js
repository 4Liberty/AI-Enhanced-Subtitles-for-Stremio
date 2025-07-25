// lib/security/secureKeyManager.js
// Secure API Key Management with Encryption

const crypto = require('crypto');

class SecureKeyManager {
    constructor(options = {}) {
        this.config = {
            // Encryption settings
            algorithm: options.algorithm || 'aes-256-gcm',
            ivLength: options.ivLength || 16,
            authTagLength: options.authTagLength || 16,
            
            // Master key configuration
            masterKey: options.masterKey || process.env.MASTER_ENCRYPTION_KEY,
            
            // Key rotation settings
            enableKeyRotation: options.enableKeyRotation !== false,
            keyRotationInterval: options.keyRotationInterval || 30 * 24 * 60 * 60 * 1000 // 30 days
        };
        
        if (!this.config.masterKey || this.config.masterKey.length < 32) {
            throw new Error('MASTER_ENCRYPTION_KEY must be at least 32 characters long');
        }
        
        this.currentKey = this.deriveKey(this.config.masterKey);
        this.previousKeys = [];
        
        if (this.config.enableKeyRotation) {
            this.startKeyRotation();
        }
        
        console.log('[SecureKeyManager] Initialized secure key manager');
    }
    
    deriveKey(masterKey) {
        // Use a key derivation function to create a more secure key
        return crypto.pbkdf2Sync(masterKey, 'vlsub-salt', 100000, 32, 'sha512');
    }
    
    encrypt(apiKey) {
        try {
            const iv = crypto.randomBytes(this.config.ivLength);
            const cipher = crypto.createCipheriv(this.config.algorithm, this.currentKey, iv);
            
            let encrypted = cipher.update(apiKey, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            
            const authTag = cipher.getAuthTag();
            
            // Combine IV, auth tag, and encrypted data
            return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
            
        } catch (error) {
            console.error('[SecureKeyManager] Encryption failed:', error);
            throw new Error('Failed to encrypt API key');
        }
    }
    
    decrypt(encryptedKey) {
        try {
            const parts = encryptedKey.split(':');
            if (parts.length !== 3) {
                throw new Error('Invalid encrypted key format');
            }
            
            const [ivHex, authTagHex, encryptedData] = parts;
            const iv = Buffer.from(ivHex, 'hex');
            const authTag = Buffer.from(authTagHex, 'hex');
            
            // Try decrypting with the current key first
            try {
                return this.tryDecrypt(encryptedData, this.currentKey, iv, authTag);
            } catch (error) {
                // If decryption fails, try with previous keys (for key rotation)
                for (const oldKey of this.previousKeys) {
                    try {
                        return this.tryDecrypt(encryptedData, oldKey, iv, authTag);
                    } catch (e) {
                        // Ignore and try the next key
                    }
                }
                
                // If all keys fail, re-throw the original error
                throw error;
            }
            
        } catch (error) {
            console.error('[SecureKeyManager] Decryption failed:', error);
            throw new Error('Failed to decrypt API key');
        }
    }
    
    tryDecrypt(encryptedData, key, iv, authTag) {
        const decipher = crypto.createDecipheriv(this.config.algorithm, key, iv);
        decipher.setAuthTag(authTag);
        
        let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    }
    
    startKeyRotation() {
        setInterval(() => {
            this.rotateKey();
        }, this.config.keyRotationInterval);
        
        console.log(`[SecureKeyManager] Key rotation enabled (interval: ${this.config.keyRotationInterval}ms)`);
    }
    
    rotateKey() {
        console.log('[SecureKeyManager] Rotating encryption key...');
        
        // Move current key to previous keys
        this.previousKeys.unshift(this.currentKey);
        
        // Keep only a limited number of old keys
        if (this.previousKeys.length > 5) {
            this.previousKeys.pop();
        }
        
        // Generate a new key
        const newMasterKey = crypto.randomBytes(32).toString('hex');
        this.currentKey = this.deriveKey(newMasterKey);
        
        // In a real application, you would need to persist the new master key
        // securely, for example, in a secret management system.
        console.warn('[SecureKeyManager] New master key generated. You must persist this key securely:', newMasterKey);
        
        this.emit('keyRotated', { newKeyId: this.currentKey.toString('hex').substring(0, 8) });
    }
    
    // Utility to get encrypted keys from environment variables
    getEncryptedKeysFromEnv(envPrefix = 'ENC_') {
        const encryptedKeys = {};
        
        for (const key in process.env) {
            if (key.startsWith(envPrefix)) {
                const serviceName = key.substring(envPrefix.length).toLowerCase();
                encryptedKeys[serviceName] = process.env[key];
            }
        }
        
        return encryptedKeys;
    }
    
    // Utility to decrypt all keys
    decryptAllKeys(encryptedKeys) {
        const decryptedKeys = {};
        
        for (const serviceName in encryptedKeys) {
            try {
                decryptedKeys[serviceName] = this.decrypt(encryptedKeys[serviceName]);
            } catch (error) {
                console.error(`[SecureKeyManager] Failed to decrypt key for ${serviceName}:`, error.message);
            }
        }
        
        return decryptedKeys;
    }
}

module.exports = SecureKeyManager;