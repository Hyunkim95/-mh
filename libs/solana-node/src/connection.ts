import { Connection, clusterApiUrl, Cluster } from '@solana/web3.js';

/**
 * Create a connection to the Solana network
 */
export function createConnection(
  endpoint?: string | Cluster,
  commitment: 'processed' | 'confirmed' | 'finalized' = 'confirmed'
): Connection {
  const rpcUrl = endpoint 
    ? (typeof endpoint === 'string' && endpoint.startsWith('http') 
        ? endpoint 
        : clusterApiUrl(endpoint as Cluster))
    : clusterApiUrl('devnet');

  return new Connection(rpcUrl, commitment);
}

/**
 * Default connection instance
 */
export const defaultConnection = createConnection();
