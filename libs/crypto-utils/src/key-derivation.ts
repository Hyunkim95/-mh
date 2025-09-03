import { createHash } from 'crypto';

export interface KeyDerivableObject {
  [key: string]: string | number | boolean | null | undefined;
}

export function deriveKeyFromObject(obj: KeyDerivableObject): string {
  const sortedKeys = Object.keys(obj).sort();
  const keyValuePairs = sortedKeys.map(key => `${key}:${obj[key]}`);
  const concatenated = keyValuePairs.join('|');
  
  return createHash('sha256')
    .update(concatenated)
    .digest('hex');
}