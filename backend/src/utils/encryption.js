// src/utils/encryption.js
const crypto = require('crypto');

// Get key from environment
const MASTER_KEY = process.env.MASTER_KEY; // Must be 32 bytes for aes-256
const IV_LENGTH = 16; // AES always uses 16-byte IV

if (!MASTER_KEY) {
  // Warn at load time but don't throw — allow the module to be required safely.
  // Functions will throw at CALL time if the key is actually needed.
  console.warn('[encryption] MASTER_KEY environment variable is missing. Encrypt/decrypt will fail at call time.');
}

// AUTO-FIX: Hash the key to ensure it is exactly 32 bytes (256 bits)
// This prevents "Invalid Key Length" errors
const getKey = () => {
    if (!MASTER_KEY) {
      throw new Error('MASTER_KEY environment variable is missing — cannot encrypt/decrypt.');
    }
    return crypto.createHash('sha256').update(MASTER_KEY).digest();
};

const encrypt = (text) => {
  if (!text) return text;
  
  // 1. Generate a random Initialization Vector (IV)
  const iv = crypto.randomBytes(IV_LENGTH);
  
  // 2. Create cipher with the hashed key
  const cipher = crypto.createCipheriv('aes-256-cbc', getKey(), iv);
  
  // 3. Encrypt
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  
  // 4. Return as "IV:EncryptedData" (Hex encoded)
  return iv.toString('hex') + ':' + encrypted.toString('hex');
};

const decrypt = (text) => {
  if (!text) return text;
  
  // 1. Split IV and Encrypted content
  const textParts = text.split(':');
  if (textParts.length < 2) return text; // Not encrypted
  
  const iv = Buffer.from(textParts.shift(), 'hex');
  const encryptedText = Buffer.from(textParts.join(':'), 'hex');
  
  // 2. Decrypt
  const decipher = crypto.createDecipheriv('aes-256-cbc', getKey(), iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  
  return decrypted.toString();
};

module.exports = { encrypt, decrypt };
