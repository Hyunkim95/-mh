import { Hop, Routes } from "../db";
import { Transaction, PublicKey, Connection, SystemProgram, Keypair, sendAndConfirmTransaction, clusterApiUrl } from "@solana/web3.js";
import { Program, AnchorProvider, utils, BN } from "@coral-xyz/anchor";
import { getAccount, getAssociatedTokenAddress, NATIVE_MINT, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { MultiHopperProject } from "./idl/multi_hopper_project";
import { TransferHookGuard } from "./idl/transfer_hook_guard";
import * as IDLJson from "./idl/multi_hopper_project.json";
import * as GuardIDLJson from "./idl/transfer_hook_guard.json";
import {  solToLamports } from "@libs/solana-node";
import bs58 from "bs58";

const IDL = IDLJson as any;
const GUARD_IDL = GuardIDLJson as any;

// Program IDs
const MULTI_HOPPER_PROGRAM_ID = new PublicKey("6HcDbzHgBdPMGhZRYPCHeujAZjTYWVcbhNTV4jW3eTHh");
const TRANSFER_HOOK_GUARD_PROGRAM_ID = new PublicKey("AkqpstLrD1tmbhGpAKidh3AfqGy7ENmxjtsnAMwVt7fi");

interface TokenConfig {
    minTransfer: BN;
    feeBps: BN;
    feeTreasury: PublicKey;
    maxHops: BN;
    maxDelaySeconds: BN;
    timelockSeconds: BN;
    flatFeeLamports: BN;
}

interface SolanaInstructionParams {
    connection: Connection;
    payer: PublicKey;
    programId: PublicKey;
}

// Helper function to get guard PDA
export const getGuardPda = (tokenMint: PublicKey): [PublicKey, number] => {
    return PublicKey.findProgramAddressSync(
        [Buffer.from("guard"), tokenMint.toBuffer()],
        TRANSFER_HOOK_GUARD_PROGRAM_ID
    );
};

interface IHop {
    recipient: PublicKey;
    delaySeconds: BN;
}

const buildProgram = (params: SolanaInstructionParams) => {
    return new Program<MultiHopperProject>(IDL as any, new AnchorProvider(params.connection, {} as any, {}));
}

const buildGuardProgram = (params: SolanaInstructionParams) => {
    return new Program<TransferHookGuard>(GUARD_IDL as any, new AnchorProvider(params.connection, {} as any, {}));
}

const initializeTokenConfig = async (
    params: SolanaInstructionParams,
    tokenMint: PublicKey,
    tokenPairMint: Keypair,
    tokenConfig: TokenConfig
) => {
    const programId = new PublicKey(params.programId) || MULTI_HOPPER_PROGRAM_ID;
    const program = buildProgram(params);
    
    const [tokenConfigPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("token_config"), tokenMint.toBuffer(), params.payer.toBuffer()],
        programId
    );
    
    const [mintAuthority] = PublicKey.findProgramAddressSync(
        [Buffer.from("mint_authority"), tokenPairMint.publicKey.toBuffer()],
        programId
    );
    
    const [permanentDelegate] = PublicKey.findProgramAddressSync(
        [Buffer.from("delegate"), tokenPairMint.publicKey.toBuffer()],
        programId
    );
    
    const [vaultAuthority] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault_authority"), tokenMint.toBuffer()],
        programId
    );
    
    // The vault is a PDA derived with the associated token program using vault_authority, token_program, and token_mint
    const [vault] = PublicKey.findProgramAddressSync(
        [vaultAuthority.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), tokenMint.toBuffer()],
        utils.token.ASSOCIATED_PROGRAM_ID
    );
    
    return await program.methods
        .initializeTokenConfig(
            tokenConfig.minTransfer,
            tokenConfig.feeBps,
            tokenConfig.feeTreasury,
            tokenConfig.maxHops,
            tokenConfig.maxDelaySeconds,
            tokenConfig.timelockSeconds,
            tokenConfig.flatFeeLamports
        )
        .accountsPartial({
            creator: params.payer,
            tokenConfig: tokenConfigPda,
            tokenMint,
            tokenPairMint: tokenPairMint.publicKey,
            mintAuthority,
            permanentDelegate,
            vault,
            vaultAuthority,
            tokenProgram: TOKEN_PROGRAM_ID,
            token2022Program: TOKEN_2022_PROGRAM_ID,
            associatedTokenProgram: utils.token.ASSOCIATED_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
        })
        .signers([tokenPairMint])
        .instruction()
}
const initializeTokenConfigSol = async (
    params: SolanaInstructionParams,
    tokenConfig: TokenConfig,
    wsolMint: Keypair // Accept the keypair as parameter instead of generating it
) => {
    const programId = params.programId || MULTI_HOPPER_PROGRAM_ID;
    const program = buildProgram(params);

    console.log('initializeTokenConfigSol', 'Program');
    const NATIVE_MINT = new PublicKey("So11111111111111111111111111111111111111112");
    console.log('initializeTokenConfigSol', 'NATIVE_MINT');
    const [tokenConfigPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("token_config"), NATIVE_MINT.toBuffer(), params.payer.toBuffer()],
        programId
    );
    console.log('initializeTokenConfigSol', 'tokenConfigPda');
    console.log('initializeTokenConfigSol', 'wsolMint');
    const [mintAuthority] = PublicKey.findProgramAddressSync(
        [Buffer.from("mint_authority"), wsolMint.publicKey.toBuffer()],
        programId
    );
    
    const [permanentDelegate] = PublicKey.findProgramAddressSync(
        [Buffer.from("delegate"), wsolMint.publicKey.toBuffer()],
        programId
    );
    
    const [solVault] = PublicKey.findProgramAddressSync(
        [Buffer.from("sol_vault"), params.payer.toBuffer()],
        programId
    );

    console.log(
        tokenConfig.minTransfer,
        tokenConfig.feeBps,
        tokenConfig.feeTreasury,
        tokenConfig.maxHops,
        tokenConfig.maxDelaySeconds,
        tokenConfig.timelockSeconds,
        tokenConfig.flatFeeLamports
    )
    
    return await program.methods
        .initializeSolTokenConfig(
            tokenConfig.minTransfer,
            tokenConfig.feeBps,
            tokenConfig.feeTreasury,
            tokenConfig.maxHops,
            tokenConfig.maxDelaySeconds,
            tokenConfig.timelockSeconds,
            tokenConfig.flatFeeLamports
        )
        .accountsPartial({
            creator: params.payer,
            tokenConfig: tokenConfigPda,
            wsolMint: wsolMint.publicKey,
            mintAuthority,
            permanentDelegate,
            solVault,
            token2022Program: TOKEN_2022_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
        })
        .signers([wsolMint])
        .instruction()
        .catch((error) => {
            console.log('initializeTokenConfigSol', 'error', error);
            throw error;
        });
}

const initGuard = async (
    params: SolanaInstructionParams,
    tokenMint: PublicKey,
    permanentDelegate: PublicKey
) => {
    const guardProgram = buildGuardProgram(params);
    
    const [guardPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("guard"), tokenMint.toBuffer()],
        TRANSFER_HOOK_GUARD_PROGRAM_ID
    );
    
    return await guardProgram.methods
        .initGuard(permanentDelegate)
        .accountsPartial({
            payer: params.payer,
            mint: tokenMint,
            guard: guardPda,
            systemProgram: SystemProgram.programId,
        })
        .instruction();
}
const initGuardSol = async (
    params: SolanaInstructionParams,
    wsolMint: PublicKey,
    permanentDelegate: PublicKey
) => {
    const guardProgram = buildGuardProgram(params);
    
    const [guardPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("guard"), wsolMint.toBuffer()],
        TRANSFER_HOOK_GUARD_PROGRAM_ID
    );
    
    return await guardProgram.methods
        .initGuard(permanentDelegate)
        .accountsPartial({
            payer: params.payer,
            mint: wsolMint,
            guard: guardPda,
            systemProgram: SystemProgram.programId,
        })
        .instruction();
}

const wrap = async (
    params: SolanaInstructionParams,
    tokenConfigPda: PublicKey,
    originalMint: PublicKey,
    pairMint: PublicKey,
    amount: BN
) => {
    const program = buildProgram(params);
    
    const [vaultAuthority] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault_authority"), originalMint.toBuffer()],
        params.programId
    );
    
    const [wrapperMintAuth] = PublicKey.findProgramAddressSync(
        [Buffer.from("mint_authority"), pairMint.toBuffer()],
        params.programId
    );
    
    const originalFrom = await getAssociatedTokenAddress(originalMint, params.payer);
    const vault = await getAssociatedTokenAddress(originalMint, vaultAuthority, true);
    const pairTo = await getAssociatedTokenAddress(pairMint, params.payer, false, TOKEN_2022_PROGRAM_ID);
    
    return await program.methods
        .wrap(amount)
        .accountsPartial({
            payer: params.payer,
            tokenConfig: tokenConfigPda,
            originalMint,
            pairMint,
            originalFrom,
            vault,
            vaultAuth: vaultAuthority,
            pairTo,
            wrapperMintAuth,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            originalTokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: utils.token.ASSOCIATED_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
        })
        .instruction();
}
const wrapSol = async (
    params: SolanaInstructionParams,
    tokenConfigPda: PublicKey,
    wsolMint: PublicKey,
    amount: BN
) => {
    const program = buildProgram(params);
    const tokenConfigAccount = await program.account.tokenConfig.fetch(tokenConfigPda);
    
    const [mintAuthority] = PublicKey.findProgramAddressSync(
        [Buffer.from("mint_authority"), wsolMint.toBuffer()],
        params.programId
    );
    
    const [solVault] = PublicKey.findProgramAddressSync(
        [Buffer.from("sol_vault"), tokenConfigAccount.creator.toBuffer()],
        params.programId
    );

    console.log('wsolMint', wsolMint.toBase58());
    console.log('params.payer', params.payer.toBase58());
    console.log('tokenConfigPda', tokenConfigPda.toBase58());
    console.log('amount', amount.toString());
    console.log('mintAuthority', mintAuthority.toBase58());
    console.log('solVault', solVault.toBase58());
    console.log('token2022Program', TOKEN_2022_PROGRAM_ID.toBase58());
    console.log('associatedTokenProgram', utils.token.ASSOCIATED_PROGRAM_ID.toBase58());
    console.log('systemProgram', SystemProgram.programId.toBase58());

//     wsolMint 6ytpVfGxTPmyUSeE953ZyomqewTnyGm77W2VxbzHyLji
// params.payer 4jLPFoW7at66h6WhyCZmcskpn3jgR1uQ9CJdTLfe9hVH
// tokenConfigPda 4jibXqvhCQ1QphR8PfCYRPKauw1SgFjN9NEH6wyCLQKF
// amount 50000000
// mintAuthority 2VCyjG7CYdwtdnyVPrAtQCBmFboS8QRyAB64gknwiepv
// solVault 5uc6kWXVpPZfwyvxETbcXYFWMbpq8TqQp7y9mshNadcy
// token2022Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb
// associatedTokenProgram ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL
// systemProgram 11111111111111111111111111111111

    const wsolTo = await getAssociatedTokenAddress(wsolMint, params.payer, false, TOKEN_2022_PROGRAM_ID);
    
    return await program.methods
        .wrapSol(amount)
        .accountsPartial({
            payer: params.payer,
            tokenConfig: tokenConfigPda,
            wsolMint,
            wsolTo,
            mintAuthority,
            solVault,
            token2022Program: TOKEN_2022_PROGRAM_ID,
            associatedTokenProgram: utils.token.ASSOCIATED_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
        })
        .instruction();
}

// TODO: unwrap can be called by anyone maybe thats a security risk
// TODO: make originaltokenprogram a parameter
export const unwrap = async (
    params: SolanaInstructionParams,
    recipient: PublicKey,
    tokenConfigPda: PublicKey,
    originalMint: PublicKey,
    pairMint: PublicKey,
    amount: BN
) => {
    const program = buildProgram(params);
    
    const [vaultAuthority] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault_authority"), originalMint.toBuffer()],
        params.programId
    );
    
    const [permanentDelegate] = PublicKey.findProgramAddressSync(
        [Buffer.from("delegate"), pairMint.toBuffer()],
        params.programId
    );
    
    // These need to be PDAs according to the IDL, not standard associated token accounts
    const [pairFrom] = PublicKey.findProgramAddressSync(
        [recipient.toBuffer(), TOKEN_2022_PROGRAM_ID.toBuffer(), pairMint.toBuffer()],
        utils.token.ASSOCIATED_PROGRAM_ID
    );
    
    const [originalTo] = PublicKey.findProgramAddressSync(
        [recipient.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), originalMint.toBuffer()],
        utils.token.ASSOCIATED_PROGRAM_ID
    );
    
    const [vault] = PublicKey.findProgramAddressSync(
        [vaultAuthority.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), originalMint.toBuffer()],
        utils.token.ASSOCIATED_PROGRAM_ID
    );
    
    return await program.methods
        .unwrap(amount)
        .accountsPartial({
            payer: params.payer,
            tokenConfig: tokenConfigPda,
            originalMint,
            pairMint,
            pairFrom,
            from: recipient,
            originalTo,
            vault,
            vaultAuth: vaultAuthority,
            permanentDelegate,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            originalTokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: utils.token.ASSOCIATED_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
        })
        .instruction()
        .catch((error) => {
            console.log('unwrap', 'error', error);
            throw error;
        });
}
export const unwrapSol = async (
    params: SolanaInstructionParams,
    creator: PublicKey,
    recipient: PublicKey,
    tokenConfigPda: PublicKey,
    wsolMint: PublicKey,
    amount: BN
) => {
    const program = buildProgram(params);
    
    const [permanentDelegate] = PublicKey.findProgramAddressSync(
        [Buffer.from("delegate"), wsolMint.toBuffer()],
        params.programId
    );
    
    const [solVault] = PublicKey.findProgramAddressSync(
        [Buffer.from("sol_vault"), creator.toBuffer()],
        params.programId
    );
    
    const wsolFrom = await getAssociatedTokenAddress(wsolMint, recipient, false, TOKEN_2022_PROGRAM_ID);
    const account = await getAccount(params.connection, wsolFrom, 'finalized', TOKEN_2022_PROGRAM_ID);
    console.log(account.owner.toBase58(), '----------------------------------------');
    
    return await program.methods
        .unwrapSol(amount)
        .accountsPartial({
            payer: params.payer,
            tokenConfig: tokenConfigPda,
            wsolMint,
            wsolFrom,
            from: recipient,
            permanentDelegate,
            solVault,
            token2022Program: TOKEN_2022_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
        })
        .instruction();
}

export const getTokenConfigPda = async (
    params: SolanaInstructionParams,
    tokenMint: PublicKey,
    creator: PublicKey
) => {
    const [tokenConfigPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("token_config"), tokenMint.toBuffer(), creator.toBuffer()],
        params.programId
    );
    return tokenConfigPda;
}

export const getRouteConfigPda = async (
    params: SolanaInstructionParams,
    creator: PublicKey,
    tokenConfigPda: PublicKey,
    routeId: BN
) => {
    const [routeConfigPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("route"), creator.toBuffer(), tokenConfigPda.toBuffer(), routeId.toArrayLike(Buffer, "le", 8)],
        params.programId
    );
    return routeConfigPda;
}

export const getRouteStatePda = async (
    params: SolanaInstructionParams,
    routeConfigPda: PublicKey
) => {
    const [routeStatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("state"), routeConfigPda.toBuffer()],
        params.programId
    );
    return routeStatePda;
}


const initializeRoute = async (
    params: SolanaInstructionParams,
    creator: PublicKey,
    tokenConfigPda: PublicKey,
    originalMint: PublicKey,
    routeId: BN,
    executor: PublicKey,
    hopAmount: BN,
    hops: IHop[],
    originalTokenProgram: PublicKey,    
) => {
    const program = buildProgram(params);
    const routeConfigPda = await getRouteConfigPda(params, creator, tokenConfigPda, routeId);
    const routeStatePda = await getRouteStatePda(params, routeConfigPda);
    
    const originalFrom = await getAssociatedTokenAddress(originalMint, creator, false, originalTokenProgram);
    console.log('Original from', originalFrom.toBase58());
    console.log('Original mint', originalMint.toBase58());

    // Get fee treasury from token config
    const tokenConfigAccount = await program.account.tokenConfig.fetch(tokenConfigPda);
    const originalTreasuryAccount = await getAssociatedTokenAddress(
        originalMint, 
        tokenConfigAccount.feeTreasury as PublicKey
    );
    
    return await program.methods
        .initializeRoute(routeId, executor, hopAmount, hops)
        .accountsPartial({
            creator: params.payer,
            tokenConfig: tokenConfigPda,
            routeConfig: routeConfigPda,
            routeState: routeStatePda,
            originalTreasuryAccount,
            originalMint,
            originalFrom,
            feeTreasury: tokenConfigAccount.feeTreasury as PublicKey,
            solTreasury: tokenConfigAccount.feeTreasury as PublicKey,
            originalTokenProgram,
            associatedTokenProgram: utils.token.ASSOCIATED_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
        })
        .instruction();
}
const initializeRouteSol = async (
    params: SolanaInstructionParams,
    creator: PublicKey,
    tokenConfigPda: PublicKey,
    routeId: BN,
    executor: PublicKey,
    hopAmount: BN,
    hops: IHop[]
) => {
    const program = buildProgram(params);
    const routeConfigPda = await getRouteConfigPda(params, creator, tokenConfigPda, routeId);
    const routeStatePda = await getRouteStatePda(params, routeConfigPda);
    
    // Get fee treasury from token config
    const tokenConfigAccount = await program.account.tokenConfig.fetch(tokenConfigPda);
    
    return await program.methods
        .initializeRouteSol(routeId, executor, hopAmount, hops)
        .accountsPartial({
            creator: params.payer,
            tokenConfig: tokenConfigPda,
            routeConfig: routeConfigPda,
            routeState: routeStatePda,
            solTreasury: tokenConfigAccount.feeTreasury as PublicKey,
            systemProgram: SystemProgram.programId,
        })
        .instruction()
        .catch((error) => {
            console.log('initializeRouteSol', 'error', error);
            throw error;
        });
}

const initializeRouteSolWithWrap = async (
    params: SolanaInstructionParams,
    creator: PublicKey,
    tokenConfigPda: PublicKey,
    routeId: BN,
    executor: PublicKey,
    hopAmount: BN,
    hops: IHop[]
) => {
    const program = buildProgram(params);
    const tokenConfigAccount = await program.account.tokenConfig.fetch(tokenConfigPda);
    console.log('Token config account', tokenConfigAccount);
    const wrapIx = await wrapSol(params, tokenConfigPda, tokenConfigAccount.pairAddress as PublicKey, hopAmount);
    const transaction = new Transaction();
    const initializeRouteSolIx = await initializeRouteSol(params, creator, tokenConfigPda, routeId, executor, hopAmount, hops);
    transaction.add(initializeRouteSolIx);
    transaction.add(wrapIx);
    return transaction;
}

const initializeRouteWithWrap = async (
    params: SolanaInstructionParams,
    creator: PublicKey,
    tokenConfigPda: PublicKey,
    routeId: BN,
    executor: PublicKey,
    hopAmount: BN,
    hops: IHop[],
    originalTokenProgram: PublicKey,
) => {
    const program = buildProgram(params);
    const tokenConfigAccount = await program.account.tokenConfig.fetch(tokenConfigPda);
    const wrapIx = await wrap(params, tokenConfigPda, tokenConfigAccount.tokenMint as PublicKey, tokenConfigAccount.pairAddress as PublicKey, hopAmount);
    const transaction = new Transaction();
    const initializeRouteIx = await initializeRoute(params, creator, tokenConfigPda, tokenConfigAccount.tokenMint as PublicKey, routeId, executor, hopAmount, hops, originalTokenProgram);
    transaction.add(initializeRouteIx);
    transaction.add(wrapIx);
    return transaction;
}

const triggerHop = async (
    params: SolanaInstructionParams,
    routeConfigPda: PublicKey,
    tokenConfigPda: PublicKey,
    executor: PublicKey,
    pairMint: PublicKey,
    fromOwner: PublicKey,
    toOwner: PublicKey
) => {
    const program = buildProgram(params);
    
    const [routeStatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("state"), routeConfigPda.toBuffer()],
        params.programId
    );
    
    const [permanentDelegate] = PublicKey.findProgramAddressSync(
        [Buffer.from("delegate"), pairMint.toBuffer()],
        params.programId
    );
    
    const pairFrom = await getAssociatedTokenAddress(pairMint, fromOwner, false, TOKEN_2022_PROGRAM_ID);
    const pairTo = await getAssociatedTokenAddress(pairMint, toOwner, false, TOKEN_2022_PROGRAM_ID);

    console.log('Route config pda', routeConfigPda.toBase58());
    console.log('Token config pda', tokenConfigPda.toBase58());
    console.log('Executor', executor.toBase58());
    console.log('Pair mint', pairMint.toBase58());
    console.log('From owner', fromOwner.toBase58());
    console.log('To owner', toOwner.toBase58());
    console.log('Permanent delegate', permanentDelegate.toBase58());
    
    return await program.methods
        .triggerHop()
        .accountsPartial({
            routeConfig: routeConfigPda,
            executor,
            tokenConfig: tokenConfigPda,
            routeState: routeStatePda,
            pairMint,
            pairFrom,
            pairTo,
            fromOwner,
            toOwner,
            permanentDelegate,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            originalTokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: utils.token.ASSOCIATED_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
        })
        .instruction()
        .catch((error) => {
            console.log('triggerHop', 'error', error);
            throw error;
        });
}

const serialize = async (transaction: Transaction, user: PublicKey, provider: Connection) => {
    const { blockhash, lastValidBlockHeight } =
      await provider.getLatestBlockhash('finalized');
    transaction.recentBlockhash = blockhash;
    transaction.lastValidBlockHeight = lastValidBlockHeight;
    transaction.feePayer = user;

    const serialized = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });
    return serialized.toString('base64');
};

// Convenience function to create a complete token configuration with guard
const initializeCompleteTokenConfig = async (
    params: SolanaInstructionParams,
    tokenMint: PublicKey,
    tokenPairMint: Keypair,
    tokenConfig: TokenConfig
) => {
    const transaction = new Transaction();
    
    // First initialize the token config
    const tokenConfigIx = await initializeTokenConfig(params, tokenMint, tokenPairMint, tokenConfig);
    transaction.add(tokenConfigIx);
    
    // Get the permanent delegate that was created
    const programId = params.programId || MULTI_HOPPER_PROGRAM_ID;
    const [permanentDelegate] = PublicKey.findProgramAddressSync(
        [Buffer.from("delegate"), tokenPairMint.publicKey.toBuffer()],
        programId
    );
    
    // Then initialize the guard for the token pair mint
    const guardIx = await initGuard(params, tokenPairMint.publicKey, permanentDelegate);
    transaction.add(guardIx);
    
    return { transaction, tokenPairMint };
};

// Convenience function for SOL token configuration with guard
const initializeCompleteSolTokenConfig = async (
    params: SolanaInstructionParams,
    tokenConfig: TokenConfig
) => {
    const transaction = new Transaction();
    
    // Generate the wSOL mint once and use it for both instructions
    const wsolMint = Keypair.generate();
    console.log('Generated wsolMint', wsolMint.publicKey.toBase58());
    
    // First initialize the SOL token config with the wsolMint
    const solConfigIx = await initializeTokenConfigSol(params, tokenConfig, wsolMint);
    transaction.add(solConfigIx);
    console.log('SOL config ix added');
    
    // Get the permanent delegate for wSOL
    const programId = params.programId || MULTI_HOPPER_PROGRAM_ID;
    const [permanentDelegate] = PublicKey.findProgramAddressSync(
        [Buffer.from("delegate"), wsolMint.publicKey.toBuffer()],
        programId
    );
    console.log('Permanent delegate', permanentDelegate.toBase58());
    
    // Then initialize the guard for the wSOL mint
    const guardIx = await initGuardSol(params, wsolMint.publicKey, permanentDelegate);
    transaction.add(guardIx);
    console.log('Guard ix added');
    console.log('Wsol mint', wsolMint.publicKey.toBase58());
    
    return { transaction, wsolMint };
};

const executeHop = async (params: SolanaInstructionParams, hop: Hop, route: Routes, executor: Keypair): Promise<string> => {
    let fromOwner;
    if (!route) {
        throw new Error(`Route ${hop.routeId} not found`);
    }
    const creator = new PublicKey(route.owner);
    const tokenConfigPda = await getTokenConfigPda(params, new PublicKey(route.token), creator);
    const routeConfigPda = await getRouteConfigPda(params, creator, tokenConfigPda, new BN(route.id));
    const routeStatePda = await getRouteStatePda(params, routeConfigPda);
    const program = buildProgram(params);
    const tokenConfigAccount = await program.account.tokenConfig.fetch(tokenConfigPda);
    const routeConfigAccount = await program.account.routeConfig.fetch(routeConfigPda);
    const routeStateAccount = await program.account.routeState.fetch(routeStatePda);

    const previousHop = routeConfigAccount.hops[routeStateAccount.currentHopIndex - 1];
    const currentHop = routeConfigAccount.hops[routeStateAccount.currentHopIndex];
    const isFirstHop = routeStateAccount.currentHopIndex === 0;
    const isLastHop = routeStateAccount.currentHopIndex === routeConfigAccount.hops.length - 1;

    if(isFirstHop) {
        fromOwner = new PublicKey(route?.owner);
    } else {
        fromOwner = new PublicKey(previousHop.recipient);
    }

    const transaction = new Transaction();
    const triggerIx = await triggerHop(params, routeConfigPda, tokenConfigPda, executor.publicKey, tokenConfigAccount.pairAddress, fromOwner, currentHop.recipient);
    transaction.add(triggerIx);

    if(isLastHop) {
        const recipient = new PublicKey(currentHop.recipient);
        if (route.token === NATIVE_MINT.toBase58()) {
            let unwrapIx = await unwrapSol(params, creator, recipient, tokenConfigPda, tokenConfigAccount.pairAddress, routeConfigAccount.hopAmount);
            transaction.add(unwrapIx);
        } else {
            let unwrapIx = await unwrap(params, recipient, tokenConfigPda, tokenConfigAccount.tokenMint, tokenConfigAccount.pairAddress, routeConfigAccount.hopAmount);
            transaction.add(unwrapIx);
        }
    }

    return await sendAndConfirmTransaction(params.connection, transaction, [executor]);
}

const contractService = {
    initializeCompleteTokenConfig,
    initializeCompleteSolTokenConfig,
    initializeRouteSolWithWrap,
    initializeRouteWithWrap,
    serialize,
    executeHop,
    
}

export default contractService;

const privateKey = 'zNNYT4aNPQEj8YJoVshrkcaRPqdoFLm76UF9tepVDCrTQWFJMxkaqXbk6wmUuGisjCcM9fL3CM5csvDZtsVEPYs';
const creatorUser = Keypair.fromSecretKey(bs58.decode(privateKey));
const splToken = new PublicKey('HL2HB3medCwhHNkzC3cdCKoknYGrBtH5MtJKbj6KSLfV');
const treasury = new PublicKey('7kQX84vLNS32of1F3XL9H4LD5LauRej8nNz5csv7su2P');

export const createSPLTokenConfig = async () => {
    const params = {
        connection: new Connection(clusterApiUrl('devnet') , 'finalized'),
        payer: creatorUser.publicKey,
        programId: MULTI_HOPPER_PROGRAM_ID,
    };
    const tokenConfigPda = await getTokenConfigPda(params, splToken, creatorUser.publicKey);
    const pairMint = Keypair.generate();
    console.log('Pair mint', pairMint.publicKey.toBase58());
    console.log('Token config PDA', tokenConfigPda.toBase58());
    const transaction = new Transaction();
    const createSPLIx = await initializeTokenConfig(params, splToken, pairMint, {
        minTransfer: new BN(solToLamports(0.0001)),
        feeBps: new BN(500),
        feeTreasury: treasury,
        maxHops: new BN(5),
        maxDelaySeconds: new BN(100),
        timelockSeconds: new BN(10),
        flatFeeLamports: new BN(solToLamports(0.0001)),
    });
    transaction.add(createSPLIx);
    const serialized = await serialize(transaction, creatorUser.publicKey, params.connection);
    const serializedTransaction = Transaction.from(Buffer.from(serialized, 'base64'));
    console.log('Serialized transaction');
    try {
        const signature = await sendAndConfirmTransaction(params.connection, serializedTransaction, [creatorUser, pairMint]);
        console.log('Signature', signature);
        console.log('Transaction sent', signature);
    } catch (error) {
        console.log('Error', error);
    }
}

export const createSolTokenConfig = async () => {
    console.log('Creating SOL token config');
    const config = {
        minTransfer: new BN(solToLamports(0.0001)),
        feeBps: new BN(500),
        feeTreasury: treasury,
        maxHops: new BN(5),
        maxDelaySeconds: new BN(100),
        timelockSeconds: new BN(10),
        flatFeeLamports: new BN(solToLamports(0.0001)),
    } as TokenConfig;
    const params = {
        connection: new Connection(clusterApiUrl('devnet') , 'finalized'),
        payer: creatorUser.publicKey,
        programId: MULTI_HOPPER_PROGRAM_ID,
    };
    console.log('Params');
    const {
        transaction,
        wsolMint
    } = await initializeCompleteSolTokenConfig(
        params,
        config
    );
    console.log('Transaction', transaction);
    console.log('Transaction created');
    console.log('wsolMint', wsolMint.publicKey.toBase58());
    const serialized = await serialize(transaction, creatorUser.publicKey, params.connection);
    console.log('Serialized');
    const serializedTransaction = Transaction.from(Buffer.from(serialized, 'base64'));
    console.log(
        'Personal user',
        creatorUser.publicKey.toBase58(),
        'wsolMint',
        wsolMint.publicKey.toBase58()
    );
    try {
        console.log('Sending transaction');
        const signature = await sendAndConfirmTransaction(params.connection, serializedTransaction, [creatorUser, wsolMint]);
        console.log('Signature', signature);
        console.log('Transaction sent', signature);
    } catch (error) {
        console.log('Error', error);
    }
};

const executorUint8 = [
    128, 110,  27, 128, 241,  68, 229, 148,  88, 238, 213,
    45,  11,   2, 229,  59,  71, 115, 174, 239, 216,  45,
   210, 134,  77,  89, 244,  54,  92, 187, 221, 101,  28,
   107, 254, 154, 196, 238,  32, 238, 104, 109, 161, 116,
   220, 254, 194,  25, 178, 156,  17, 211, 204, 189, 168,
    96, 134,  83,  35, 178, 196, 220,  10, 134
];
const executor = Keypair.fromSecretKey(new Uint8Array(executorUint8));
const routeId = new BN(6969691);
// const wSOLMint = new PublicKey('6ytpVfGxTPmyUSeE953ZyomqewTnyGm77W2VxbzHyLji');

const hops = [
    {
        routeId: Number(routeId),
        index: 0,
        toAddress: '9sxuvwgUWHpGCLy5EFFKPV5bHz2vjDUN3J1kguPCgfqn',
        executesAt: new Date(),
        executedAt: new Date(),
        txHash: '',
        error: '',
        isReady: false,
    },
    {
        routeId: Number(routeId),
        index: 1,
        toAddress: 'AHz5Emsg8xTXZenPkdhEjkzfJxTTJinQqqFLnsJvpB6q',
        executesAt: new Date(),
        executedAt: new Date(),
        txHash: '',
        error: '',
        isReady: false,
    }
] as Hop[];
const route = {
    id: Number(routeId),
    // token: NATIVE_MINT.toBase58(),
    token: splToken.toBase58(),
    owner: creatorUser.publicKey.toBase58(),
    // pairMint: wSOLMint.toBase58(),
    currentIndex: 0,
    lastIndex: hops.length - 1,
} as Routes;

export const initializeSPLRoute = async () => {
    const hopAmount = new BN(solToLamports(100));
    const params = {
        connection: new Connection(clusterApiUrl('devnet') , 'finalized'),
        payer: creatorUser.publicKey,
        programId: MULTI_HOPPER_PROGRAM_ID,
    };
    const tokenConfigPda = await getTokenConfigPda(params, splToken, creatorUser.publicKey);
    console.log('Token config PDA', tokenConfigPda.toBase58());
    const transaction = new Transaction();
    const initializeRouteIx = await initializeRouteWithWrap(params, creatorUser.publicKey, tokenConfigPda, routeId, executor.publicKey, hopAmount, hops.map(hop => ({
        recipient: new PublicKey(hop.toAddress),
        delaySeconds: new BN(0),
    })), TOKEN_PROGRAM_ID);
    console.log('Initialize route SOL ix', initializeRouteIx);
    transaction.add(initializeRouteIx);
    const serialized = await serialize(transaction, creatorUser.publicKey, params.connection);
    const serializedTransaction = Transaction.from(Buffer.from(serialized, 'base64'));
    console.log('Serialized transaction');

    try {
        console.log('Sending transaction');
        const signature = await sendAndConfirmTransaction(params.connection, serializedTransaction, [creatorUser]);
        console.log('Signature', signature);
        console.log('Transaction sent', signature);
    } catch (error) {
        console.log('Error', error);
    }
}

export const initializeSolRoute = async () => {
    const hopAmount = new BN(solToLamports(0.05));
    console.log('Route ID', routeId);
    console.log('Hop amount', hopAmount);
    // const executor = await executorService.getKeypair(routeId);
    console.log('Executor', executor.publicKey.toBase58());
    console.log('Initializing SOL route');
    const params = {
        connection: new Connection(clusterApiUrl('devnet') , 'finalized'),
        payer: creatorUser.publicKey,
        programId: MULTI_HOPPER_PROGRAM_ID,
    };
    const tokenConfigPda = await getTokenConfigPda(params, new PublicKey(NATIVE_MINT.toBase58()), creatorUser.publicKey);
    console.log('Token config PDA', tokenConfigPda.toBase58());
    const transaction = new Transaction();
    const initializeRouteSolIx = await initializeRouteSolWithWrap(params, creatorUser.publicKey, tokenConfigPda, routeId, executor.publicKey, hopAmount, hops.map(hop => ({
        recipient: new PublicKey(hop.toAddress),
        delaySeconds: new BN(0),
    })));
    console.log('Initialize route SOL ix', initializeRouteSolIx);
    transaction.add(initializeRouteSolIx);
    const serialized = await serialize(transaction, creatorUser.publicKey, params.connection);
    const serializedTransaction = Transaction.from(Buffer.from(serialized, 'base64'));
    console.log('Serialized transaction');
    try {
        console.log('Sending transaction');
        const signature = await sendAndConfirmTransaction(params.connection, serializedTransaction, [creatorUser]);
        console.log('Signature', signature);
        console.log('Transaction sent', signature);
    } catch (error) {
        console.log('Error', error);
    }
}

export const testSPLHop = async () => {
    const params = {
        connection: new Connection(clusterApiUrl('devnet') , 'finalized'),
        payer: executor.publicKey,
        programId: MULTI_HOPPER_PROGRAM_ID,
    };

    try {
        for (const hop of hops) {
            console.log('Starting test hop', hop.toAddress );
            const signature = await executeHop(params, hop, route, executor);
            console.log('Hop executed', hop.toAddress);
            console.log('Signature', signature);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    } catch (error) {
        console.log('Error', error);
    }
}

export const testHops = async () => {
    const params = {
        connection: new Connection(clusterApiUrl('devnet') , 'finalized'),
        payer: executor.publicKey,
        programId: MULTI_HOPPER_PROGRAM_ID,
    };
    try {
        for (const hop of hops) {
            try {
                console.log('Starting test hop', hop.toAddress, route);
                const signature = await executeHop(params, hop, route, executor);
                console.log('Hop executed', hop.toAddress);
                console.log('Signature', signature);
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (error) {
                console.log('Error', error);
            }
        }
    } catch (error) {
        console.log('Error', error);
    }
}
