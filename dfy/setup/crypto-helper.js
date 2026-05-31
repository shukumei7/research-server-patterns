#!/usr/bin/env node
/**
 * AES-256-GCM reversible encryption helper.
 *
 * Requires env var: RS_MASTER_KEY (64 hex chars = 32 bytes)
 * Generate a key:  node -e "require('crypto').randomBytes(32).then?console.log(require('crypto').randomBytes(32).toString('hex'))" 2>/dev/null || node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * Encrypted format:  iv_hex:authTag_hex:ciphertext_hex  (colon-delimited, all hex)
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';

function getKey() {
  const hex = process.env.RS_MASTER_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error('RS_MASTER_KEY must be set to a 64-character hex string (32 bytes). Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  }
  return Buffer.from(hex, 'hex');
}

export function encrypt(plaintext) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decrypt(ciphertext) {
  const key = getKey();
  const parts = ciphertext.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted value format. Expected iv:authTag:ciphertext');
  const [ivHex, authTagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

export function isEncrypted(value) {
  if (typeof value !== 'string') return false;
  const parts = value.split(':');
  return parts.length === 3 && parts.every(p => /^[0-9a-f]+$/i.test(p));
}

// CLI usage: node crypto-helper.js encrypt "my secret"
//            node crypto-helper.js decrypt "iv:tag:ct"
if (process.argv[1] && process.argv[1].endsWith('crypto-helper.js')) {
  const [,, command, value] = process.argv;
  if (!command || !value) {
    console.error('Usage: node crypto-helper.js <encrypt|decrypt> <value>');
    process.exit(1);
  }
  try {
    if (command === 'encrypt') console.log(encrypt(value));
    else if (command === 'decrypt') console.log(decrypt(value));
    else { console.error('Unknown command:', command); process.exit(1); }
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}
