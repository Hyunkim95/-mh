import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Card } from "../components/Card";
import { NavBar } from "../components/NavBar";
import { useWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { Buffer } from "buffer";
import { toast } from "react-hot-toast";
import { useSearch, useParams } from "@tanstack/react-router";
import { captureClientError } from "../utils/monitoring";

const PROGRAM_ID = new PublicKey(
  "3jLoS2wbNgtKzieUUxwg6Xhdv6gbZkHDtPWA9ZAgspFh",
);

// unwrap_sol discriminator from IDL: [99, 40, 14, 105, 45, 107, 172, 201]
const UNWRAP_SOL_DISCRIMINATOR = Buffer.from([
  99, 40, 14, 105, 45, 107, 172, 201,
]);

function getRouteConfigPda(routeId: number): PublicKey {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(routeId));
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("route"), buf],
    PROGRAM_ID,
  );
  return pda;
}

function getRouteStatePda(routeId: number): PublicKey {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(routeId));
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("state"), buf],
    PROGRAM_ID,
  );
  return pda;
}

function getPermanentDelegatePda(routeId: number): PublicKey {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(routeId));
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("delegate"), buf],
    PROGRAM_ID,
  );
  return pda;
}

function getTokenConfigPda(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("token_config_global")],
    PROGRAM_ID,
  );
  return pda;
}

function getSolVaultPda(creator: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("sol_vault"), creator.toBuffer()],
    PROGRAM_ID,
  );
  return pda;
}

interface RouteInfo {
  creator: string;
  routeTokenMint: string;
  hopAmount: bigint;
  hopsCount: number;
  currentHopIndex: number;
  tokenConfigCreator: string;
}

// Anchor account discriminators (first 8 bytes of SHA256("account:<Name>"))
// Pre-computed for RouteConfig, RouteState, TokenConfig
async function fetchRouteInfo(
  connection: any,
  routeId: number,
): Promise<RouteInfo> {
  const routeConfigPda = getRouteConfigPda(routeId);
  const routeStatePda = getRouteStatePda(routeId);
  const tokenConfigPda = getTokenConfigPda();

  const [routeConfigInfo, routeStateInfo, tokenConfigInfo] = await Promise.all([
    connection.getAccountInfo(routeConfigPda),
    connection.getAccountInfo(routeStatePda),
    connection.getAccountInfo(tokenConfigPda),
  ]);

  if (!routeConfigInfo || !routeStateInfo || !tokenConfigInfo) {
    const missing = [];
    if (!routeConfigInfo) missing.push("routeConfig");
    if (!routeStateInfo) missing.push("routeState");
    if (!tokenConfigInfo) missing.push("tokenConfig");
    const msg = `Could not fetch on-chain accounts: missing ${missing.join(", ")}`;
    throw new Error(msg);
  }

  const rcData = routeConfigInfo.data;
  // RouteConfig layout (verified against on-chain data):
  // discriminator: 8 bytes at offset 0
  // creator: Pubkey (32 bytes) at offset 8
  // route_id: u64 (8 bytes) at offset 40
  // original_mint: Pubkey (32 bytes) at offset 48
  // route_token_mint: Pubkey (32 bytes) at offset 80
  // hop_amount: u64 (8 bytes) at offset 292
  const creator = new PublicKey(rcData.slice(8, 40)).toBase58();
  const originalMint = new PublicKey(rcData.slice(48, 80)).toBase58();
  const routeTokenMint = new PublicKey(rcData.slice(80, 112)).toBase58();
  const hopAmount = rcData.readBigUInt64LE(292);

  const rsData = routeStateInfo.data;
  // RouteState layout (verified against on-chain data):
  // discriminator: 8 bytes at offset 0
  // current_hop_index: u8 at offset 8
  // started_at: i64 (8 bytes) at offset 9
  // hops_count: u8 at offset 17
  const currentHopIndex = rsData.readUInt8(8);
  const hopsCount = rsData.readUInt8(17);

  const tcData = tokenConfigInfo.data;
  // TokenConfig layout (after 8-byte discriminator):
  // creator: Pubkey (32 bytes) at offset 8
  const tokenConfigCreator = new PublicKey(tcData.slice(8, 40)).toBase58();

  return {
    creator,
    routeTokenMint,
    hopAmount,
    hopsCount,
    currentHopIndex,
    tokenConfigCreator,
  };
}

function buildUnwrapSolInstruction(
  payer: PublicKey,
  tokenConfigPda: PublicKey,
  wsolMint: PublicKey,
  wsolFrom: PublicKey,
  from: PublicKey,
  to: PublicKey,
  permanentDelegate: PublicKey,
  solVault: PublicKey,
  routeConfigPda: PublicKey,
  routeStatePda: PublicKey,
  routeId: number,
  amount: bigint,
): TransactionInstruction {
  // Encode instruction data: discriminator (8) + route_id (u64, 8) + amount (u64, 8)
  const data = Buffer.alloc(24);
  UNWRAP_SOL_DISCRIMINATOR.copy(data, 0);
  data.writeBigUInt64LE(BigInt(routeId), 8);
  data.writeBigUInt64LE(amount, 16);

  const keys = [
    { pubkey: payer, isSigner: true, isWritable: true },
    { pubkey: tokenConfigPda, isSigner: false, isWritable: false },
    { pubkey: wsolMint, isSigner: false, isWritable: true },
    { pubkey: wsolFrom, isSigner: false, isWritable: true },
    { pubkey: from, isSigner: false, isWritable: true },
    { pubkey: to, isSigner: false, isWritable: true },
    { pubkey: permanentDelegate, isSigner: false, isWritable: false },
    { pubkey: solVault, isSigner: false, isWritable: true },
    { pubkey: routeConfigPda, isSigner: false, isWritable: false },
    { pubkey: routeStatePda, isSigner: false, isWritable: false },
    { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    keys,
    programId: PROGRAM_ID,
    data,
  });
}

const shortAddr = (addr: string) =>
  addr ? `${addr.slice(0, 4)}...${addr.slice(-4)}` : "";

export const UnwrapSol: React.FC = () => {
  const { routeId: routeIdParam } = useParams({ strict: false }) as {
    routeId: string;
  };
  const search = useSearch({ strict: false }) as { recipient?: string };
  const recipient = search.recipient || "";
  const routeId = parseInt(routeIdParam || "0", 10);

  const { publicKey, signTransaction, connected } = useWallet();
  const { connection } = useConnection();
  const { setVisible } = useWalletModal();

  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [wsolBalance, setWsolBalance] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recipientPubkey = useMemo(() => {
    try {
      return recipient ? new PublicKey(recipient) : null;
    } catch {
      return null;
    }
  }, [recipient]);

  const isRouteOwner = useMemo(() => {
    if (!publicKey || !routeInfo) return false;
    return publicKey.toBase58() === routeInfo.creator;
  }, [publicKey, routeInfo]);

  // Fetch route info on mount
  useEffect(() => {
    if (!routeId || !recipientPubkey) {
      setLoading(false);
      return;
    }

    (async () => {
      try {
        setLoading(true);
        const info = await fetchRouteInfo(connection, routeId);
        setRouteInfo(info);

        // Fetch wSOL balance
        const wsolMint = new PublicKey(info.routeTokenMint);
        const ata = await getAssociatedTokenAddress(
          wsolMint,
          recipientPubkey,
          false,
          TOKEN_2022_PROGRAM_ID,
        );
        try {
          const balance = await connection.getTokenAccountBalance(ata);
          setWsolBalance(balance.value.uiAmountString || "0");
        } catch {
          setWsolBalance("0");
        }
      } catch (e: any) {
        captureClientError(e, {
          area: "unwrap-sol",
          action: "load-route-info",
          level: "warning",
          extra: {
            routeId,
            recipient: recipientPubkey.toBase58(),
          },
        });
        setError(e.message || "Failed to fetch route info");
      } finally {
        setLoading(false);
      }
    })();
  }, [routeId, recipientPubkey, connection]);

  const handleUnwrap = useCallback(async () => {
    if (!publicKey || !signTransaction || !routeInfo || !recipientPubkey) {
      return;
    }

    setSending(true);
    setError(null);

    try {
      // Derive all PDAs
      const tokenConfigPda = getTokenConfigPda();
      const routeConfigPda = getRouteConfigPda(routeId);
      const routeStatePda = getRouteStatePda(routeId);
      const permanentDelegate = getPermanentDelegatePda(routeId);
      const wsolMint = new PublicKey(routeInfo.routeTokenMint);
      const creator = new PublicKey(routeInfo.tokenConfigCreator);
      const solVault = getSolVaultPda(creator);

      const wsolFrom = await getAssociatedTokenAddress(
        wsolMint,
        recipientPubkey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );

      // Build instruction
      const unwrapIx = buildUnwrapSolInstruction(
        publicKey,
        tokenConfigPda,
        wsolMint,
        wsolFrom,
        recipientPubkey,
        recipientPubkey,
        permanentDelegate,
        solVault,
        routeConfigPda,
        routeStatePda,
        routeId,
        routeInfo.hopAmount,
      );

      // Build transaction
      const transaction = new Transaction();
      transaction.add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
      );
      transaction.add(
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
      );
      transaction.add(unwrapIx);

      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash("confirmed");
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      // Sign
      const signed = await signTransaction(transaction);

      // Send
      const signature = await connection.sendRawTransaction(
        signed.serialize(),
        { skipPreflight: false, preflightCommitment: "confirmed" },
      );

      // Confirm
      const confirmation = await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed",
      );

      if (confirmation.value.err) {
        throw new Error(`Transaction failed on-chain: ${JSON.stringify(confirmation.value.err)}`);
      }

      setTxSignature(signature);
      toast.success("wSOL unwrapped successfully!");
    } catch (e: any) {
      const msg = e.message || "Transaction failed";
      // Extract program logs if available (SendTransactionError)
      const logs = e.logs || e.transactionLogs || e.getLogs?.() || null;
      captureClientError(e, {
        area: "unwrap-sol",
        action: "unwrap",
        extra: {
          routeId,
          recipient,
          code: e?.code,
          programLogs: logs,
        },
      });
      setError(msg);
      toast.error(msg.length > 100 ? msg.slice(0, 100) + "..." : msg);
    } finally {
      setSending(false);
    }
  }, [publicKey, signTransaction, routeInfo, recipientPubkey, routeId, connection]);

  if (!routeId || !recipient) {
    return (
      <div className="min-h-screen text-[var(--white-100)] flex flex-col items-center gap-10 w-full relative py-12 sm:py-0">
        <div className="min-h-screen flex w-full fixed">
          <div className="app-gradient-bg">
            <div className="ellipse-bg-one" />
            <div className="ellipse-bg-two" />
          </div>
        </div>
        <div className="hidden sm:block w-full">
          <NavBar />
        </div>
        <Card
          cardBody={
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <h2 className="text-xl font-medium">Invalid URL</h2>
              <p className="text-sm text-[var(--white-100-transparency-58)]">
                Missing route ID or recipient parameter.
              </p>
              <p className="text-xs text-[var(--white-100-transparency-58)]">
                Expected: /unwrap/{'<routeId>'}?recipient={'<walletAddress>'}
              </p>
            </div>
          }
          cardHeight="300px"
        />
      </div>
    );
  }

  const cardBody = (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <h2 className="text-xl md:text-2xl font-medium mb-2">
          Unwrap wSOL
        </h2>
        <p className="text-sm text-[var(--white-100-transparency-58)]">
          Route #{routeId}
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="text-sm text-[var(--white-100-transparency-58)]">
            Loading route info...
          </div>
        </div>
      ) : error && !routeInfo ? (
        <div className="text-center py-8">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      ) : routeInfo ? (
        <>
          {/* Route details */}
          <div className="bg-[var(--dark-gunmetal-500)] rounded-2xl p-5 flex flex-col gap-3">
            <div className="flex justify-between text-sm">
              <span className="text-[var(--white-100-transparency-58)]">
                Route Creator
              </span>
              <span className="font-mono">{shortAddr(routeInfo.creator)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--white-100-transparency-58)]">
                Recipient
              </span>
              <span className="font-mono">{shortAddr(recipient)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--white-100-transparency-58)]">
                wSOL Balance
              </span>
              <span>{wsolBalance || "0"} wSOL</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--white-100-transparency-58)]">
                Unwrap Amount
              </span>
              <span>
                {(Number(routeInfo.hopAmount) / 1e9).toFixed(6)} SOL
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--white-100-transparency-58)]">
                Hop Progress
              </span>
              <span>
                {routeInfo.currentHopIndex} / {routeInfo.hopsCount}
              </span>
            </div>
          </div>

          {/* Wallet connection / status */}
          {!connected ? (
            <button
              onClick={() => setVisible(true)}
              className="w-full rounded-3xl py-3 bg-[var(--laser-lemon-500)] text-[var(--black-900)] font-semibold text-base hover:brightness-95 transition"
            >
              Connect Wallet
            </button>
          ) : !isRouteOwner ? (
            <div className="bg-red-900/30 border border-red-500/30 rounded-2xl p-4 text-center">
              <p className="text-red-400 text-sm font-medium mb-1">
                Wrong Wallet
              </p>
              <p className="text-xs text-[var(--white-100-transparency-58)]">
                Connected: {shortAddr(publicKey!.toBase58())}
              </p>
              <p className="text-xs text-[var(--white-100-transparency-58)]">
                Required: {shortAddr(routeInfo.creator)}
              </p>
              <p className="text-xs text-[var(--white-100-transparency-58)] mt-2">
                Only the route creator can sign this transaction.
              </p>
            </div>
          ) : txSignature ? (
            <div className="bg-green-900/30 border border-green-500/30 rounded-2xl p-4 text-center">
              <p className="text-green-400 text-sm font-medium mb-2">
                Unwrap Successful!
              </p>
              <a
                href={`https://solscan.io/tx/${txSignature}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--laser-lemon-500)] text-sm hover:underline break-all"
              >
                View on Solscan
              </a>
            </div>
          ) : (
            <>
              {error && (
                <div className="bg-red-900/30 border border-red-500/30 rounded-2xl p-3">
                  <p className="text-red-400 text-xs break-all">{error}</p>
                </div>
              )}
              <button
                onClick={handleUnwrap}
                disabled={sending || wsolBalance === "0"}
                className={`w-full rounded-3xl py-3 font-semibold text-base transition ${
                  sending || wsolBalance === "0"
                    ? "bg-[var(--laser-lemon-500-transparency-30)] text-[var(--black-900)] cursor-not-allowed"
                    : "bg-[var(--laser-lemon-500)] text-[var(--black-900)] hover:brightness-95"
                }`}
              >
                {sending
                  ? "Signing & Sending..."
                  : wsolBalance === "0"
                    ? "No wSOL to Unwrap"
                    : `Unwrap ${(Number(routeInfo.hopAmount) / 1e9).toFixed(6)} SOL`}
              </button>
            </>
          )}
        </>
      ) : null}
    </div>
  );

  return (
    <div className="min-h-screen text-[var(--white-100)] flex flex-col items-center gap-10 w-full relative py-12 sm:py-0">
      <div className="min-h-screen flex w-full fixed">
        <div className="app-gradient-bg">
          <div className="ellipse-bg-one" />
          <div className="ellipse-bg-two" />
        </div>
      </div>
      <div className="hidden sm:block w-full">
        <NavBar />
      </div>
      <Card
        cardClasses={{
          mainCardContainer: "sm:!w-[90%] md:!w-full px-8 md:px-14 md:pt-12 md:pb-10",
          cardBodyContainer: "flex flex-col justify-center",
        }}
        cardBody={cardBody}
        cardHeight="auto"
        cardStyle={{
          background:
            "linear-gradient(#1F2224, #1F2224) padding-box, linear-gradient(0deg, rgba(255,255,255,0) 23%, rgba(255,255,255,0.5) 49%, rgba(255,255,255,0) 75%) border-box",
          border: "1px solid transparent",
        }}
      />
    </div>
  );
};

export default UnwrapSol;
