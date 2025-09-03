import { ethers } from 'ethers';

/**
 * Validate an Ethereum address
 */
export function isValidAddress(address: string): boolean {
  try {
    return ethers.isAddress(address);
  } catch {
    return false;
  }
}

/**
 * Convert address to checksum format
 */
export function toChecksumAddress(address: string): string {
  if (!isValidAddress(address)) {
    throw new Error('Invalid Ethereum address');
  }
  return ethers.getAddress(address);
}

/**
 * Normalize an Ethereum address (convert to lowercase)
 */
export function normalizeAddress(address: string): string {
  if (!isValidAddress(address)) {
    throw new Error('Invalid Ethereum address');
  }
  return address.toLowerCase();
}

/**
 * Compare two Ethereum addresses (case-insensitive)
 */
export function addressesEqual(address1: string, address2: string): boolean {
  if (!isValidAddress(address1) || !isValidAddress(address2)) {
    return false;
  }
  return normalizeAddress(address1) === normalizeAddress(address2);
}

/**
 * Shorten an Ethereum address for display
 */
export function shortenAddress(
  address: string,
  startLength: number = 6,
  endLength: number = 4
): string {
  if (!isValidAddress(address)) {
    return address;
  }
  
  if (address.length <= startLength + endLength) {
    return address;
  }
  
  return `${address.slice(0, startLength)}...${address.slice(-endLength)}`;
}

/**
 * Validate a hex string (with or without 0x prefix)
 */
export function isValidHex(hex: string): boolean {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  return /^[0-9a-fA-F]*$/.test(cleanHex);
}

/**
 * Ensure hex string has 0x prefix
 */
export function ensureHexPrefix(hex: string): string {
  return hex.startsWith('0x') ? hex : `0x${hex}`;
}

/**
 * Remove 0x prefix from hex string
 */
export function removeHexPrefix(hex: string): string {
  return hex.startsWith('0x') ? hex.slice(2) : hex;
}

/**
 * Validate chain ID
 */
export function isValidChainId(chainId: number): boolean {
  return Number.isInteger(chainId) && chainId > 0;
}

/**
 * Get chain name from chain ID (common chains only)
 */
export function getChainName(chainId: number): string {
  const chains: Record<number, string> = {
    1: 'Ethereum Mainnet',
    3: 'Ropsten',
    4: 'Rinkeby',
    5: 'Goerli',
    10: 'Optimism',
    56: 'BSC',
    137: 'Polygon',
    250: 'Fantom',
    42161: 'Arbitrum One',
    43114: 'Avalanche',
    11155111: 'Sepolia',
  };
  
  return chains[chainId] || `Chain ${chainId}`;
}