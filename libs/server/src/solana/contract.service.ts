import { Transaction, PublicKey, Connection, SystemProgram, Keypair, sendAndConfirmTransaction, clusterApiUrl, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Program, AnchorProvider, utils, BN } from "@coral-xyz/anchor";
import { getAssociatedTokenAddress, NATIVE_MINT, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { MultiHopperProject } from "./idl/multi_hopper_project";
import { TransferHookGuard } from "./idl/transfer_hook_guard";
import * as IDLJson from "./idl/multi_hopper_project.json";
import * as GuardIDLJson from "./idl/transfer_hook_guard.json";
import bs58 from "bs58";
import executorService from "../executors/executor.service";
import { fetchTokenMetadata } from "@libs/solana-node";

const solToLamports = (sol: number) => {
    return sol * LAMPORTS_PER_SOL;
}
const IDL = IDLJson as any;
const GUARD_IDL = GuardIDLJson as any;

// Program IDs
const MULTI_HOPPER_PROGRAM_ID = new PublicKey(IDLJson.address);
const TRANSFER_HOOK_GUARD_PROGRAM_ID = new PublicKey(GuardIDLJson.address);

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

export const params = {
    connection: new Connection(clusterApiUrl("devnet")),
    programId: MULTI_HOPPER_PROGRAM_ID,
}

const buildProgram = (params: SolanaInstructionParams) => {
    return new Program<MultiHopperProject>(IDL as any, new AnchorProvider(params.connection, {} as any, {}));
}

const buildGuardProgram = (params: SolanaInstructionParams) => {
    return new Program<TransferHookGuard>(GUARD_IDL as any, new AnchorProvider(params.connection, {} as any, {}));
}

export const getMintAuthority = async (
    mint: PublicKey
) => {
    const [mintAuthority] = PublicKey.findProgramAddressSync(
        [Buffer.from("mint_authority"), mint.toBuffer()],
        params.programId
    );
    return mintAuthority;
}

const initializeTokenConfig = async (
    payer: PublicKey,
    tokenMint: PublicKey,
    tokenPairMint: Keypair,
    tokenConfig: TokenConfig
) => {
    const program = buildProgram(params);
    const tokenConfigPda = await getTokenConfigPda(tokenMint);
    const mintAuthority = await getMintAuthority(tokenPairMint.publicKey);
    const permanentDelegate = await getPermanentDelegate(tokenPairMint.publicKey);
    
    const vaultAuthority = await getVaultAuthority(tokenMint);
    const vault = await getVault(vaultAuthority, tokenMint);
    
    // Try to get original URI first - if token already has metadata, reuse it
    const offchainMetadata = await fetchTokenMetadata(params.connection, tokenMint);
    const uri = offchainMetadata?.uri || '';
    const name = offchainMetadata?.name || 'SPL Token';
    const symbol = offchainMetadata?.symbol || 'SPL';

    return await program.methods
        .initializeTokenConfig(
            tokenConfig.minTransfer,
            tokenConfig.feeBps.toNumber(),
            tokenConfig.feeTreasury,
            tokenConfig.maxHops.toNumber(),
            tokenConfig.maxDelaySeconds,
            tokenConfig.timelockSeconds,
            tokenConfig.flatFeeLamports,
            name,
            symbol,
            uri
        )
        .accountsPartial({
            creator: payer,
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
    payer: PublicKey,
    tokenConfig: TokenConfig,
    wsolMint: Keypair // Accept the keypair as parameter instead of generating it
) => {
    const program = buildProgram(params);

    console.log('initializeTokenConfigSol', 'Program');
    const NATIVE_MINT = new PublicKey("So11111111111111111111111111111111111111112");
    console.log('initializeTokenConfigSol', 'NATIVE_MINT');
    const tokenConfigPda = await getTokenConfigPda(NATIVE_MINT);
    console.log('initializeTokenConfigSol', 'tokenConfigPda');
    console.log('initializeTokenConfigSol', 'wsolMint');
    const mintAuthority = await getMintAuthority(wsolMint.publicKey);
    const permanentDelegate = await getPermanentDelegate(wsolMint.publicKey);
    const solVault = await getSolVault(payer);

    // todo: find hardcoded values or upload it to ipfs ourselves
    const name = 'Wrapped SOL';
    const symbol = 'wSOL';
    const uri = "";

    return await program.methods
        .initializeSolTokenConfig(
            tokenConfig.minTransfer,
            tokenConfig.feeBps.toNumber(),
            tokenConfig.feeTreasury,
            tokenConfig.maxHops.toNumber(),
            tokenConfig.maxDelaySeconds,
            tokenConfig.timelockSeconds,
            tokenConfig.flatFeeLamports,
            name,
            symbol,
            uri
        )
        .accountsPartial({
            creator: payer,
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
    payer: PublicKey,
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
            payer: payer,
            mint: tokenMint,
            guard: guardPda,
            systemProgram: SystemProgram.programId,
        })
        .instruction();
}
const initGuardSol = async (
    payer: PublicKey,
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
            payer,
            mint: wsolMint,
            guard: guardPda,
            systemProgram: SystemProgram.programId,
        })
        .instruction();
}

const wrap = async (
    payer: PublicKey,
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
    
    const originalFrom = await getAssociatedTokenAddress(originalMint, payer);
    const vault = await getAssociatedTokenAddress(originalMint, vaultAuthority, true);
    const pairTo = await getAssociatedTokenAddress(pairMint, payer, false, TOKEN_2022_PROGRAM_ID);
    
    return await program.methods
        .wrap(amount)
        .accountsPartial({
            payer: payer,
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
    payer: PublicKey,
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
    
    const solVault = await getSolVault(tokenConfigAccount.creator);

    console.log('wsolMint', wsolMint.toBase58());
    console.log('payer', payer.toBase58());
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

    const wsolTo = await getAssociatedTokenAddress(wsolMint, payer, false, TOKEN_2022_PROGRAM_ID);
    
    return await program.methods
        .wrapSol(amount)
        .accountsPartial({
            payer: payer,
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
    payer: PublicKey,
    recipient: PublicKey,
    tokenConfigPda: PublicKey,
    originalMint: PublicKey,
    pairMint: PublicKey,
    amount: BN,
    routeId: BN
) => {
    const program = buildProgram(params);
    const vaultAuthority = await getVaultAuthority(originalMint);
    const permanentDelegate = await getPermanentDelegate(pairMint);
    const routeConfigPda = await getRouteConfigPda(routeId);
    const routeStatePda = await getRouteStatePda(routeId);
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
            payer: payer,
            tokenConfig: tokenConfigPda,
            originalMint,
            pairMint,
            pairFrom,
            from: recipient,
            originalTo,
            to: recipient,
            vault,
            routeConfig: routeConfigPda,
            routeState: routeStatePda,
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
    payer: PublicKey,
    recipient: PublicKey,
    tokenConfigPda: PublicKey,
    wsolMint: PublicKey,
    amount: BN,
    routeId: BN
) => {
    const program = buildProgram(params);
    const permanentDelegate = await getPermanentDelegate(wsolMint);
    const tokenConfigAccount = await program.account.tokenConfig.fetch(tokenConfigPda);
    const solVault = await getSolVault(tokenConfigAccount.creator);
    const wsolFrom = await getAssociatedTokenAddress(wsolMint, recipient, false, TOKEN_2022_PROGRAM_ID);
    const routeConfigPda = await getRouteConfigPda(routeId);
    const routeStatePda = await getRouteStatePda(routeId);
    return await program.methods
        .unwrapSol(amount)
        .accountsPartial({
            payer,
            tokenConfig: tokenConfigPda,
            wsolMint,
            wsolFrom,
            from: recipient,
            to: recipient,
            routeConfig: routeConfigPda,
            routeState: routeStatePda,
            permanentDelegate,
            solVault,
            token2022Program: TOKEN_2022_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
        })
        .instruction();
}

export const getTokenConfigPda = async (
    tokenMint: PublicKey
) => {
    const [tokenConfigPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("token_config"), tokenMint.toBuffer()],
        params.programId
    );
    return tokenConfigPda;
}

export const getRouteConfigPda = async (
    routeId: BN
) => {
    const [routeConfigPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("route"), routeId.toArrayLike(Buffer, "le", 8)],
        params.programId
    );
    return routeConfigPda;
}

export const getRouteStatePda = async (
    routeId: BN
) => {
    const [routeStatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("state"), routeId.toArrayLike(Buffer, "le", 8)],
        params.programId
    );
    return routeStatePda;
}

export const getPermanentDelegate = async (
    pairMint: PublicKey
) => {
    const [permanentDelegate] = PublicKey.findProgramAddressSync(
        [Buffer.from("delegate"), pairMint.toBuffer()],
        params.programId
    );
    return permanentDelegate;
}

export const getVaultAuthority = async (
    originalMint: PublicKey
) => {
    const [vaultAuthority] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault_authority"), originalMint.toBuffer()],
        params.programId
    );
    return vaultAuthority;
}

export const getSolVault = async (
    creator: PublicKey
) => {
    const [solVault] = PublicKey.findProgramAddressSync(
        [Buffer.from("sol_vault"), creator.toBuffer()],
        params.programId
    );
    return solVault;
}

export const getVault = async (
    vaultAuthority: PublicKey,
    originalMint: PublicKey
) => {
    const [vault] = PublicKey.findProgramAddressSync(
        [vaultAuthority.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), originalMint.toBuffer()],
        utils.token.ASSOCIATED_PROGRAM_ID
    );
    return vault;
}

const initializeRoute = async (
    payer: PublicKey,
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
    const routeConfigPda = await getRouteConfigPda(routeId);
    const routeStatePda = await getRouteStatePda(routeId);
    
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
            creator: payer,
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
    payer: PublicKey,
    tokenConfigPda: PublicKey,
    routeId: BN,
    executor: PublicKey,
    hopAmount: BN,
    hops: IHop[]
) => {
    const program = buildProgram(params);
    const routeConfigPda = await getRouteConfigPda(routeId);
    const routeStatePda = await getRouteStatePda(routeId);
    
    // Get fee treasury from token config
    const tokenConfigAccount = await program.account.tokenConfig.fetch(tokenConfigPda);
    
    return await program.methods
        .initializeRouteSol(routeId, executor, hopAmount, hops)
        .accountsPartial({
            creator: payer,
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

/**
 * Calculates the SOL amount needed to fund an executor based on hop count.
 * Uses moderate funding formula: (hopCount * 0.002) + 0.02 SOL
 * This covers transaction fees and provides a safety buffer.
 * 
 * @param hopCount - Number of hops in the route
 * @returns BN representing lamports to fund the executor
 */
const calculateExecutorFunding = (hopCount: number): BN => {
    // Moderate funding formula: (hopCount * 0.002) + 0.02 SOL
    const perHopFunding = 0.002; // SOL per hop
    const baseFunding = 0.02; // Base SOL amount
    const totalFunding = (hopCount * perHopFunding) + baseFunding;
    return new BN(solToLamports(totalFunding));
};

/**
 * Creates a SystemProgram transfer instruction to fund an executor wallet.
 * 
 * @param payer - The account paying for the transfer
 * @param executor - The executor wallet to receive funding
 * @param amount - Amount in lamports to transfer
 * @returns SystemProgram transfer instruction
 */
const createExecutorFundingInstruction = (
    payer: PublicKey,
    executor: PublicKey,
    amount: BN
) => {
    return SystemProgram.transfer({
        fromPubkey: payer,
        toPubkey: executor,
        lamports: amount.toNumber(),
    });
};

const initializeRouteSolWithWrap = async (
    payer: PublicKey,
    routeId: BN,
    hopAmount: BN,
    hops: IHop[]
) => {
    const program = buildProgram(params);
    const tokenConfigPDA = await getTokenConfigPda(NATIVE_MINT);
    const tokenConfigAccount = await program.account.tokenConfig.fetch(tokenConfigPDA);
    const wrapIx = await wrapSol(payer, tokenConfigPDA, tokenConfigAccount.pairAddress as PublicKey, hopAmount);
    const transaction = new Transaction();
    
    // Get deterministic executor for this route
    const executorWallet = executorService.getWalletByRouteId(routeId.toNumber());
    
    // Calculate and add executor funding
    const executorFunding = calculateExecutorFunding(hops.length);
    const fundingIx = createExecutorFundingInstruction(payer, executorWallet.publicKey, executorFunding);
    transaction.add(fundingIx);
    
    const initializeRouteSolIx = await initializeRouteSol(payer, tokenConfigPDA, routeId, executorWallet.publicKey, hopAmount, hops);
    transaction.add(initializeRouteSolIx);
    transaction.add(wrapIx);
    
    // Add first hop trigger if there are hops
    if (hops.length > 0) {
        const triggerIx = await triggerHop(routeId, tokenConfigPDA, executorWallet.publicKey, tokenConfigAccount.pairAddress as PublicKey, payer, hops[0].recipient);
        transaction.add(triggerIx);
    }
    
    console.log(`Executor ${executorWallet.publicKey.toBase58()} will be funded with ${executorFunding.toNumber() / LAMPORTS_PER_SOL} SOL for ${hops.length} hops`);
    
    return transaction;
}

const initializeRouteWithWrap = async (
    payer: PublicKey,
    creator: PublicKey,
    routeId: BN,
    hopAmount: BN,
    hops: IHop[],
    splMint: string,
    originalTokenProgram: PublicKey,
) => {
    const program = buildProgram(params);
    const tokenConfigPDA = await getTokenConfigPda(new PublicKey(splMint));
    const tokenConfigAccount = await program.account.tokenConfig.fetch(tokenConfigPDA);
    const wrapIx = await wrap(payer, tokenConfigPDA, tokenConfigAccount.tokenMint as PublicKey, tokenConfigAccount.pairAddress as PublicKey, hopAmount);
    const transaction = new Transaction();
    
    // Get deterministic executor for this route
    const executorWallet = executorService.getWalletByRouteId(routeId.toNumber());
    
    // Calculate and add executor funding
    const executorFunding = calculateExecutorFunding(hops.length);
    const fundingIx = createExecutorFundingInstruction(payer, executorWallet.publicKey, executorFunding);
    transaction.add(fundingIx);
    
    const initializeRouteIx = await initializeRoute(payer, creator, tokenConfigPDA, tokenConfigAccount.tokenMint as PublicKey, routeId, executorWallet.publicKey, hopAmount, hops, originalTokenProgram);
    transaction.add(initializeRouteIx);
    transaction.add(wrapIx);
    
    // Add first hop trigger if there are hops
    if (hops.length > 0) {
        const triggerIx = await triggerHop(routeId, tokenConfigPDA, executorWallet.publicKey, tokenConfigAccount.pairAddress as PublicKey, creator, hops[0].recipient);
        transaction.add(triggerIx);
    }
    
    console.log(`Executor ${executorWallet.publicKey.toBase58()} will be funded with ${executorFunding.toNumber() / LAMPORTS_PER_SOL} SOL for ${hops.length} hops`);
    
    return transaction;
}

const triggerHop = async (
    routeId: BN,
    tokenConfigPda: PublicKey,
    executor: PublicKey,
    pairMint: PublicKey,
    fromOwner: PublicKey,
    toOwner: PublicKey
) => {
    const program = buildProgram(params);
    const routeStatePda = await getRouteStatePda(routeId);
    const routeConfigPda = await getRouteConfigPda(routeId);
    const permanentDelegate = await getPermanentDelegate(pairMint);
    
    const pairFrom = await getAssociatedTokenAddress(pairMint, fromOwner, false, TOKEN_2022_PROGRAM_ID);
    const pairTo = await getAssociatedTokenAddress(pairMint, toOwner, false, TOKEN_2022_PROGRAM_ID);

    console.log('Route config pda', routeConfigPda.toBase58());
    console.log('Token config pda', tokenConfigPda.toBase58());
    console.log('Executor', executor.toBase58());
    console.log('Pair from', pairFrom.toBase58());
    console.log('Pair to', pairTo.toBase58());
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

export const serialize = async (transaction: Transaction, user: PublicKey, provider: Connection) => {
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

export const signAndSerialize = async (transaction: Transaction, payer: PublicKey, signer: Keypair, provider: Connection) => {
    const { blockhash, lastValidBlockHeight } =
      await provider.getLatestBlockhash('finalized');
    transaction.recentBlockhash = blockhash;
    transaction.lastValidBlockHeight = lastValidBlockHeight;
    transaction.feePayer = payer;
    transaction.partialSign(signer);
    const serialized = transaction.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
    });
    return serialized.toString('base64');
}

// Convenience function to create a complete token configuration with guard
export const initializeCompleteTokenConfig = async (
    payer: PublicKey,
    tokenMint: PublicKey,
    tokenPairMint: Keypair,
    tokenConfig: TokenConfig
) => {
    const transaction = new Transaction();

    
    // First initialize the token config
    const tokenConfigIx = await initializeTokenConfig(payer, tokenMint, tokenPairMint, tokenConfig);
    transaction.add(tokenConfigIx);
    
    const permanentDelegate = await getPermanentDelegate(tokenPairMint.publicKey);

    // Then initialize the guard for the token pair mint
    const guardIx = await initGuard(payer, tokenPairMint.publicKey, permanentDelegate);
    transaction.add(guardIx);

    return { transaction, tokenPairMint };
};

// Convenience function for SOL token configuration with guard
export const initializeCompleteSolTokenConfig = async (
    payer: PublicKey,
    tokenConfig: TokenConfig
) => {
    const transaction = new Transaction();
    
    // Generate the wSOL mint once and use it for both instructions
    const wsolMint = Keypair.generate();
    console.log('Generated wsolMint', wsolMint.publicKey.toBase58());
    
    // First initialize the SOL token config with the wsolMint
    const solConfigIx = await initializeTokenConfigSol(payer, tokenConfig, wsolMint);
    transaction.add(solConfigIx);
    console.log('SOL config ix added');
    
    const permanentDelegate = await getPermanentDelegate(wsolMint.publicKey);
    
    // Then initialize the guard for the wSOL mint
    const guardIx = await initGuardSol(payer, wsolMint.publicKey, permanentDelegate);
    transaction.add(guardIx);
    console.log('Guard ix added');

    console.log('Wsol mint', wsolMint.publicKey.toBase58());

    return { transaction, wsolMint };
};

const executeHop = async (
    creator: PublicKey, 
    routeId: BN,
    splMint: PublicKey
): Promise<string> => {
    let fromOwner;
    const tokenConfigPda = await getTokenConfigPda(splMint);
    const routeConfigPda = await getRouteConfigPda(routeId);
    const routeStatePda = await getRouteStatePda(routeId);
    const program = buildProgram(params);
    const tokenConfigAccount = await program.account.tokenConfig.fetch(tokenConfigPda);
    const routeConfigAccount = await program.account.routeConfig.fetch(routeConfigPda);
    const routeStateAccount = await program.account.routeState.fetch(routeStatePda);

    const previousHop = routeConfigAccount.hops[routeStateAccount.currentHopIndex - 1];
    const currentHop = routeConfigAccount.hops[routeStateAccount.currentHopIndex];
    console.log('Current hop', currentHop);
    const isFirstHop = routeStateAccount.currentHopIndex === 0;
    const isLastHop = routeStateAccount.currentHopIndex === routeConfigAccount.hops.length - 1;

    if(isFirstHop) {
        fromOwner = new PublicKey(creator);
    } else {
        fromOwner = new PublicKey(previousHop.recipient);
    }

    // Get deterministic executor for this route
    const executorWallet = executorService.getWalletByRouteId(routeId.toNumber());
    
    const transaction = new Transaction();
    const triggerIx = await triggerHop(routeId, tokenConfigPda, executorWallet.publicKey, tokenConfigAccount.pairAddress, fromOwner, currentHop.recipient);
    transaction.add(triggerIx);

    if(isLastHop) {
        const recipient = new PublicKey(currentHop.recipient);
        if (tokenConfigAccount.tokenMint.toBase58() === NATIVE_MINT.toBase58()) {
            let unwrapIx = await unwrapSol(
                executorWallet.publicKey, 
                recipient, 
                tokenConfigPda, 
                tokenConfigAccount.pairAddress, 
                routeConfigAccount.hopAmount,
                routeId
            );
            transaction.add(unwrapIx);
        } else {
            let unwrapIx = await unwrap(
                executorWallet.publicKey, 
                recipient, 
                tokenConfigPda, 
                tokenConfigAccount.tokenMint, 
                tokenConfigAccount.pairAddress, 
                routeConfigAccount.hopAmount,
                routeId
            );
            transaction.add(unwrapIx);
        }
    }

    return await sendAndConfirmTransaction(params.connection, transaction, [executorWallet]);
}

export const getTokenConfigSPL = async (splMint: string, creator: string) => {
    try {
        const program = buildProgram(params);
        const tokenConfigPda = await getTokenConfigPda(new PublicKey(splMint));
        const tokenConfigAccount = await program.account.tokenConfig.fetch(tokenConfigPda);
        return {
            creator: creator,
            splMint: tokenConfigAccount.tokenMint.toBase58(),
            pairMint: tokenConfigAccount.pairAddress.toBase58(),
            minTransfer: tokenConfigAccount.minTransfer.toString(),
            feeBps: tokenConfigAccount.feeBps.toString(),
            feeTreasury: tokenConfigAccount.feeTreasury.toBase58(),
            maxHops: tokenConfigAccount.maxHops.toString(),
            maxDelaySeconds: tokenConfigAccount.maxDelaySeconds.toString(),
            timelockSeconds: tokenConfigAccount.timelockSeconds.toString(),
            flatFeeLamports: tokenConfigAccount.flatFeeLamports.toString(),
        };
    } catch (error) {
        console.log('Error', error);
        return null;
    }
}

export const getTokenConfigSOL = async (creator: string) => {
    try {
        const program = buildProgram(params);
        const tokenConfigPda = await getTokenConfigPda(new PublicKey(NATIVE_MINT.toBase58()));
        const tokenConfigAccount = await program.account.tokenConfig.fetch(tokenConfigPda);
        return {
            creator: creator,
            splMint: tokenConfigAccount.tokenMint.toBase58(),
            pairMint: tokenConfigAccount.pairAddress.toBase58(),
            minTransfer: tokenConfigAccount.minTransfer.toString(),
            feeBps: tokenConfigAccount.feeBps.toString(),
            feeTreasury: tokenConfigAccount.feeTreasury.toBase58(),
            maxHops: tokenConfigAccount.maxHops.toString(),
            maxDelaySeconds: tokenConfigAccount.maxDelaySeconds.toString(),
            timelockSeconds: tokenConfigAccount.timelockSeconds.toString(),
            flatFeeLamports: tokenConfigAccount.flatFeeLamports.toString(),
        };
    } catch (error) {
        console.log('Error', error);
        return null;
    }
}

const contractService = {
    initializeCompleteTokenConfig,
    initializeCompleteSolTokenConfig,
    initializeRouteSolWithWrap,
    initializeRouteWithWrap,
    serialize,
    executeHop,
    getTokenConfigSPL,
    getTokenConfigSOL,
    calculateExecutorFunding,
    createExecutorFundingInstruction,
}

// Functions to get route configuration and state
export const getRouteConfiguration = async (
    routeId: number
) => {
    try {
        const program = buildProgram(params);
        const routeConfigPda = await getRouteConfigPda(new BN(routeId));
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
        console.log('Error fetching route configuration:', error);
        return null;
    }
};

export const getRouteStateAccount = async (
    routeId: number
) => {
    try {
        const program = buildProgram(params);
        const routeStatePda = await getRouteStatePda(new BN(routeId));
        const routeStateAccount = await program.account.routeState.fetch(routeStatePda);
        
        return {
            currentHopIndex: routeStateAccount.currentHopIndex,
            startedAt: routeStateAccount.startedAt.toString(),
            lastHopAt: routeStateAccount.lastHopAt.map((timestamp: BN) => timestamp.toString()),
            hopsCount: routeStateAccount.hopsCount,
        };
    } catch (error) {
        console.log('Error fetching route state:', error);
        return null;
    }
};

// Check if a route is actually deployed on-chain by verifying the route config PDA exists
export const isRouteDeployedOnChain = async (routeId: number): Promise<boolean> => {
    try {
        const program = buildProgram(params);
        const routeConfigPda = await getRouteConfigPda(new BN(routeId));
        
        // Try to fetch the route config account
        await program.account.routeConfig.fetch(routeConfigPda);
        return true;
    } catch (error) {
        // If account doesn't exist or can't be fetched, route is not deployed
        return false;
    }
};

// Check if a specific route config PDA exists on-chain
export const isRouteConfigPdaDeployed = async (routeConfigPda: string): Promise<boolean> => {
    try {
        const program = buildProgram(params);
        const pda = new PublicKey(routeConfigPda);
        
        // Try to fetch the route config account
        await program.account.routeConfig.fetch(pda);
        return true;
    } catch (error) {
        // If account doesn't exist or can't be fetched, route is not deployed
        return false;
    }
};

// Export individual functions needed by the router
export { initializeRouteWithWrap, initializeRouteSolWithWrap, executeHop, calculateExecutorFunding, createExecutorFundingInstruction };

export default contractService;

const privateKey = 'zNNYT4aNPQEj8YJoVshrkcaRPqdoFLm76UF9tepVDCrTQWFJMxkaqXbk6wmUuGisjCcM9fL3CM5csvDZtsVEPYs';
export const creatorUser = Keypair.fromSecretKey(bs58.decode(privateKey));
const splToken = new PublicKey('HL2HB3medCwhHNkzC3cdCKoknYGrBtH5MtJKbj6KSLfV');
const treasury = new PublicKey('7kQX84vLNS32of1F3XL9H4LD5LauRej8nNz5csv7su2P');

export const createSPLTokenConfig = async () => {
    const tokenConfigPda = await getTokenConfigPda(splToken);
    const pairMint = Keypair.generate();
    console.log('Pair mint', pairMint.publicKey.toBase58());
    console.log('Token config PDA', tokenConfigPda.toBase58());
    const transaction = new Transaction();
    const createSPLIx = await initializeTokenConfig(creatorUser.publicKey, splToken, pairMint, {
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
        creatorUser.publicKey,
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

// Hardcoded executor removed - now using deterministic executor service
// const routeId = new BN(6969691);
// const wSOLMint = new PublicKey('6ytpVfGxTPmyUSeE953ZyomqewTnyGm77W2VxbzHyLji');

// export const initializeSPLRoute = async () => {
//     const hopAmount = new BN(solToLamports(100));
//     const params = {
//         connection: new Connection(clusterApiUrl('devnet') , 'finalized'),
//         payer: creatorUser.publicKey,
//         programId: MULTI_HOPPER_PROGRAM_ID,
//     };
//     const tokenConfigPda = await getTokenConfigPda(splToken);
//     console.log('Token config PDA', tokenConfigPda.toBase58());
//     const transaction = new Transaction();
//     const initializeRouteIx = await initializeRouteWithWrap(
//         creatorUser.publicKey,
//         creatorUser.publicKey, 
//         routeId, 
//         hopAmount, 
//         hops.map(hop => ({
//         recipient: new PublicKey(hop.toAddress),
//             delaySeconds: new BN(0),
//         })), 
//         splToken.toBase58(),
//         TOKEN_PROGRAM_ID
//     );
//     console.log('Initialize route SOL ix', initializeRouteIx);
//     transaction.add(initializeRouteIx);
//     const serialized = await serialize(transaction, creatorUser.publicKey, params.connection);
//     const serializedTransaction = Transaction.from(Buffer.from(serialized, 'base64'));
//     console.log('Serialized transaction');

//     try {
//         console.log('Sending transaction');
//         const signature = await sendAndConfirmTransaction(params.connection, serializedTransaction, [creatorUser]);
//         console.log('Signature', signature);
//         console.log('Transaction sent', signature);
//     } catch (error) {
//         console.log('Error', error);
//     }
// }

// export const initializeSolRoute = async () => {
//     const hopAmount = new BN(solToLamports(0.05));
//     console.log('Route ID', routeId);
//     console.log('Hop amount', hopAmount);
    
//     // Get deterministic executor for this route
//     const executorWallet = executorService.getWalletByRouteId(routeId.toNumber());
//     console.log('Executor', executorWallet.publicKey.toBase58());
//     console.log('Initializing SOL route');
    
//     const params = {
//         connection: new Connection(clusterApiUrl('devnet') , 'finalized'),
//         payer: creatorUser.publicKey,
//         programId: MULTI_HOPPER_PROGRAM_ID,
//     };
//     const program = buildProgram(params);
//     const routeConfigPda = await getRouteConfigPda(routeId);
//     const routeConfigAccount = await program.account.routeConfig.fetch(routeConfigPda);
//     const tokenConfigPDA = routeConfigAccount.tokenConfig;
//     console.log('Token config PDA', tokenConfigPDA.toBase58());
//     const transaction = new Transaction();
//     const initializeRouteSolIx = await initializeRouteSolWithWrap(
//         creatorUser.publicKey, 
//         routeId, 
//         hopAmount, 
//         hops.map(hop => ({
//             recipient: new PublicKey(hop.toAddress),
//             delaySeconds: new BN(0),
//         }))
//     );
//     console.log('Initialize route SOL ix', initializeRouteSolIx);
//     transaction.add(initializeRouteSolIx);
//     const serialized = await serialize(transaction, creatorUser.publicKey, params.connection);
//     const serializedTransaction = Transaction.from(Buffer.from(serialized, 'base64'));
//     console.log('Serialized transaction');
//     try {
//         console.log('Sending transaction');
//         const signature = await sendAndConfirmTransaction(params.connection, serializedTransaction, [creatorUser]);
//         console.log('Signature', signature);
//         console.log('Transaction sent', signature);
//     } catch (error) {
//         console.log('Error', error);
//     }
// }

// export const testSPLHop = async () => {
//     try {
//         for (const hop of hops) {
//             console.log('Starting test hop', hop.toAddress );
//             const signature = await executeHop(creatorUser.publicKey, routeId, splToken);
//             console.log('Hop executed', hop.toAddress);
//             console.log('Signature', signature);
//             await new Promise(resolve => setTimeout(resolve, 1000));
//         }
//     } catch (error) {
//         console.log('Error', error);
//     }
// }

// export const testHops = async () => {
//     try {
//         for (const hop of hops) {
//             try {
//                 console.log('Starting test hop', hop.toAddress, routeId);
//                 const signature = await executeHop(creatorUser.publicKey, routeId, splToken);
//                 console.log('Hop executed', hop.toAddress);
//                 console.log('Signature', signature);
//                 await new Promise(resolve => setTimeout(resolve, 1000));
//             } catch (error) {
//                 console.log('Error', error);
//             }
//         }
//     } catch (error) {
//         console.log('Error', error);
//     }
// }
