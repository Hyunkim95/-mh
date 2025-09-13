import { PublicKey, Connection, clusterApiUrl } from '@solana/web3.js';
import { Program, AnchorProvider, BN, EventParser } from '@coral-xyz/anchor';
import { MultiHopperProject } from './idl/multi_hopper_project';
import * as IDLJson from './idl/multi_hopper_project.json';

const IDL = IDLJson as any;

// Program ID - should match the one in contract.service.ts
const MULTI_HOPPER_PROGRAM_ID = new PublicKey(IDLJson.address);

export interface SolanaInstructionParams {
    connection: Connection;
    programId: PublicKey;
}

// Default connection parameters
export const getDefaultParams = (): SolanaInstructionParams => ({
    connection: new Connection(
        process.env.SOLANA_RPC_URL || clusterApiUrl("devnet")
    ),
    programId: MULTI_HOPPER_PROGRAM_ID,
});

// Build program instance
export const buildProgram = (params: SolanaInstructionParams) => {
    return new Program<MultiHopperProject>(IDL as any, new AnchorProvider(params.connection, {} as any, {}));
};

// PDA derivation functions (extracted from contract.service.ts)
export const getTokenConfigPda = async (tokenMint: PublicKey, programId?: PublicKey): Promise<PublicKey> => {
    const [tokenConfigPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("token_config"), tokenMint.toBuffer()],
        programId || MULTI_HOPPER_PROGRAM_ID
    );
    return tokenConfigPda;
};

export const getRouteConfigPda = async (routeId: BN, programId?: PublicKey): Promise<PublicKey> => {
    const [routeConfigPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("route"), routeId.toArrayLike(Buffer, "le", 8)],
        programId || MULTI_HOPPER_PROGRAM_ID
    );
    return routeConfigPda;
};

export const getRouteStatePda = async (routeId: BN, programId?: PublicKey): Promise<PublicKey> => {
    const [routeStatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("state"), routeId.toArrayLike(Buffer, "le", 8)],
        programId || MULTI_HOPPER_PROGRAM_ID
    );
    return routeStatePda;
};

// Function to derive route ID from route config PDA
export const getRouteIdFromPda = async (routeConfigPda: PublicKey, programId?: PublicKey): Promise<number | null> => {
    try {
        const params = getDefaultParams();
        if (programId) {
            params.programId = programId;
        }
        
        const program = buildProgram(params);
        const routeConfigAccount = await program.account.routeConfig.fetch(routeConfigPda);
        
        return routeConfigAccount.routeId.toNumber();
    } catch (error) {
        console.warn(`Failed to derive route ID from PDA ${routeConfigPda.toString()}:`, error);
        return null;
    }
};

// Function to get route configuration from on-chain account
export const getRouteConfiguration = async (routeId: number, programId?: PublicKey) => {
    try {
        const params = getDefaultParams();
        if (programId) {
            params.programId = programId;
        }
        
        const program = buildProgram(params);
        const routeConfigPda = await getRouteConfigPda(new BN(routeId), programId);
        const routeConfigAccount = await program.account.routeConfig.fetch(routeConfigPda);
        
        return {
            creator: routeConfigAccount.creator.toBase58(),
            routeId: routeConfigAccount.routeId.toString(),
            tokenConfig: routeConfigAccount.tokenConfig.toBase58(),
            sourceOwner: routeConfigAccount.sourceOwner.toBase58(),
            executor: routeConfigAccount.executor.toBase58(),
            hops: routeConfigAccount.hops.map((hop: any) => ({
                recipient: hop.recipient.toBase58(),
                delaySeconds: hop.delaySeconds.toString(),
            })),
            hopAmount: routeConfigAccount.hopAmount.toString(),
            isFinalized: routeConfigAccount.isFinalized,
            createdAt: routeConfigAccount.createdAt.toString(),
        };
    } catch (error) {
        console.warn('Error fetching route configuration:', error);
        return null;
    }
};

// Function to get route state from on-chain account
export const getRouteStateAccount = async (routeId: number, programId?: PublicKey) => {
    try {
        const params = getDefaultParams();
        if (programId) {
            params.programId = programId;
        }
        
        const program = buildProgram(params);
        const routeStatePda = await getRouteStatePda(new BN(routeId), programId);
        const routeStateAccount = await program.account.routeState.fetch(routeStatePda);
        
        return {
            currentHopIndex: routeStateAccount.currentHopIndex,
            startedAt: routeStateAccount.startedAt.toString(),
            lastHopAt: routeStateAccount.lastHopAt.map((timestamp: BN) => timestamp.toString()),
            hopsCount: routeStateAccount.hopsCount,
        };
    } catch (error) {
        console.warn('Error fetching route state:', error);
        return null;
    }
};

// Function to verify if a PDA matches expected route ID
export const verifyRoutePda = async (routePda: PublicKey, expectedRouteId: number, programId?: PublicKey): Promise<boolean> => {
    try {
        const derivedPda = await getRouteConfigPda(new BN(expectedRouteId), programId);
        return derivedPda.equals(routePda);
    } catch (error) {
        console.warn('Error verifying route PDA:', error);
        return false;
    }
};

// Function to get all route PDAs for a range of route IDs (useful for bulk operations)
export const getRouteConfigPdas = async (routeIds: number[], programId?: PublicKey): Promise<{ routeId: number; pda: PublicKey }[]> => {
    const results = [];
    
    for (const routeId of routeIds) {
        try {
            const pda = await getRouteConfigPda(new BN(routeId), programId);
            results.push({ routeId, pda });
        } catch (error) {
            console.warn(`Failed to derive PDA for route ${routeId}:`, error);
        }
    }
    
    return results;
};

// Helper function to parse route ID from various formats
export const parseRouteId = (routeIdInput: string | number | BN): number => {
    if (typeof routeIdInput === 'number') {
        return routeIdInput;
    }
    
    if (typeof routeIdInput === 'string') {
        return parseInt(routeIdInput, 10);
    }
    
    if (routeIdInput instanceof BN) {
        return routeIdInput.toNumber();
    }
    
    throw new Error(`Invalid route ID format: ${routeIdInput}`);
};

// Function to check if a public key is a valid route config PDA
export const isValidRouteConfigPda = async (pda: PublicKey, programId?: PublicKey): Promise<boolean> => {
    try {
        const params = getDefaultParams();
        if (programId) {
            params.programId = programId;
        }
        
        const program = buildProgram(params);
        await program.account.routeConfig.fetch(pda);
        return true;
    } catch (error) {
        return false;
    }
};

// Export the program ID for external use
export { MULTI_HOPPER_PROGRAM_ID }; 

export const buildEventParser = (
    programId: PublicKey,
    connection: Connection,
) => {
    const program = buildProgram({
        programId,
        connection,
    });
    return new EventParser(programId, program.coder);
}