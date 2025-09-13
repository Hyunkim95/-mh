import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

export interface EncryptionResult {
  encrypted: string;
  iv: string;
}

export function encryptPrivateKey(privateKey: string, encryptionKey: string): EncryptionResult {
  const iv = randomBytes(16);
  const key = createHash('sha256').update(encryptionKey).digest();
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  
  let encrypted = cipher.update(privateKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  return {
    encrypted,
    iv: iv.toString('hex')
  };
}

export function decryptPrivateKey(encryptedData: EncryptionResult, encryptionKey: string): string {
  const key = createHash('sha256').update(encryptionKey).digest();
  const iv = Buffer.from(encryptedData.iv, 'hex');
  const decipher = createDecipheriv('aes-256-cbc', key, iv);
  
  let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}