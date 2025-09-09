import { SolanaWalletManager } from '@libs/solana-node';
import { db } from '../db';
import { clusterApiUrl, Connection } from '@solana/web3.js';

const solanaWalletManager = new SolanaWalletManager({
    database: db,
    encryptionKey: process.env.SOLANA_ENCRYPTION_KEY!   ,
    connection: new Connection(
        process.env.SOLANA_RPC_URL! || clusterApiUrl('devnet'),
        { commitment: 'confirmed' }
    ),
});

const getKeypair = async (routeId: number) => {
    try {
        console.log('Getting keypair for route ID', routeId);
        const wallet = await solanaWalletManager.getOrCreateWalletForObject({ routeId });
        console.log('Wallet', wallet);
        const keypair = await solanaWalletManager.getKeypairFromWallet(wallet);
        return keypair;
    } catch (error) {
        console.log('Error getting keypair for route ID', routeId, 'error', error);
        throw error;
    }
}

const executorService = {
    getKeypair
}

export default executorService;