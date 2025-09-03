/**
 * Shorten an Ethereum address for display
 */
export function shortenAddress(
  address: string,
  startLength: number = 6,
  endLength: number = 4
): string {
  if (!address || address.length <= startLength + endLength) {
    return address || '';
  }
  
  return `${address.slice(0, startLength)}...${address.slice(-endLength)}`;
}

/**
 * Format chain name from chain ID
 */
export function formatChainName(chainId: number): string {
  const chains: Record<number, string> = {
    1: 'Ethereum',
    5: 'Goerli',
    10: 'Optimism',
    56: 'BSC',
    137: 'Polygon',
    250: 'Fantom',
    42161: 'Arbitrum',
    43114: 'Avalanche',
    11155111: 'Sepolia',
  };
  
  return chains[chainId] || `Chain ${chainId}`;
}

/**
 * Format wei to ether with specified decimals
 */
export function formatEther(wei: bigint, decimals: number = 4): string {
  // Simple conversion - in production you might want to use a more robust library
  const ether = Number(wei) / Math.pow(10, 18);
  return ether.toFixed(decimals);
}

/**
 * Validate Ethereum address format
 */
export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}