/**
 * Create a devnet SPL token, mint an initial supply, and attach Metaplex metadata.
 *
 * Usage:
 *   SIGNER_PRIVATE_KEY=<base58> yarn create:devnet-spl-token --name "Dev Token" --symbol DVT
 *
 * Optional flags:
 *   --decimals 6
 *   --amount 1000
 *   --uri https://example.com/devnet-token.json
 *   --rpc https://api.devnet.solana.com
 *   --recipient <wallet>
 */

import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  clusterApiUrl,
} from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import bs58 from "bs58";
import {
  createSignerFromKeypair,
  generateSigner,
  percentAmount,
  signerIdentity,
} from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  fromWeb3JsKeypair,
  toWeb3JsPublicKey,
} from "@metaplex-foundation/umi-web3js-adapters";
import {
  createFungible,
  findMetadataPda,
  mplTokenMetadata,
} from "@metaplex-foundation/mpl-token-metadata";

type Args = {
  name: string;
  symbol: string;
  decimals: number;
  amount: number;
  uri: string;
  rpcUrl: string;
  recipient?: string;
};

const DEFAULT_URI = "https://example.com/devnet-token.json";

function parseArgs(argv: string[]): Args {
  const getValue = (flag: string): string | undefined => {
    const index = argv.indexOf(flag);
    if (index === -1) return undefined;
    return argv[index + 1];
  };

  const name = getValue("--name") ?? "Devnet Test Token";
  const symbol = getValue("--symbol") ?? "DTT";
  const decimals = Number(getValue("--decimals") ?? "6");
  const amount = Number(getValue("--amount") ?? "1000");
  const uri = getValue("--uri") ?? DEFAULT_URI;
  const rpcUrl =
    getValue("--rpc") ??
    process.env.SOLANA_RPC_URL ??
    clusterApiUrl("devnet");
  const recipient = getValue("--recipient");

  if (!Number.isFinite(decimals) || decimals < 0 || decimals > 9) {
    throw new Error("--decimals must be a number between 0 and 9");
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("--amount must be a positive number");
  }

  if (!name.trim()) {
    throw new Error("--name is required");
  }

  if (!symbol.trim()) {
    throw new Error("--symbol is required");
  }

  return {
    name: name.trim(),
    symbol: symbol.trim(),
    decimals,
    amount,
    uri,
    rpcUrl,
    recipient,
  };
}

function getSigner(): Keypair {
  const privateKey =
    process.env.SIGNER_PRIVATE_KEY ?? process.env.ADMIN_PRIVATE_KEY;

  if (!privateKey) {
    throw new Error(
      "SIGNER_PRIVATE_KEY or ADMIN_PRIVATE_KEY environment variable is required"
    );
  }

  return Keypair.fromSecretKey(bs58.decode(privateKey));
}

async function ensureDevnetBalance(
  connection: Connection,
  payer: Keypair
): Promise<void> {
  if (process.env.SKIP_DEVNET_AIRDROP === "1") return;

  const balance = await connection.getBalance(payer.publicKey);
  if (balance >= 0.2 * LAMPORTS_PER_SOL) return;

  const signature = await connection.requestAirdrop(
    payer.publicKey,
    2 * LAMPORTS_PER_SOL
  );
  const latest = await connection.getLatestBlockhash("confirmed");
  await connection.confirmTransaction(
    {
      signature,
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
    },
    "confirmed"
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const payer = getSigner();
  const recipient = args.recipient
    ? new PublicKey(args.recipient)
    : payer.publicKey;
  const connection = new Connection(args.rpcUrl, "confirmed");

  console.log("=== Devnet SPL Token Creator ===");
  console.log(`RPC: ${args.rpcUrl}`);
  console.log(`Payer: ${payer.publicKey.toBase58()}`);
  console.log(`Recipient: ${recipient.toBase58()}`);
  console.log(`Name: ${args.name}`);
  console.log(`Symbol: ${args.symbol}`);
  console.log(`Decimals: ${args.decimals}`);
  console.log(`Amount: ${args.amount}`);
  console.log(`URI: ${args.uri}`);

  if (args.rpcUrl.includes("devnet")) {
    console.log("\nEnsuring payer has enough devnet SOL...");
    await ensureDevnetBalance(connection, payer);
  }

  let metadataPda: string | null = null;
  let mint: PublicKey;

  const umi = createUmi(args.rpcUrl).use(mplTokenMetadata());
  const umiSigner = createSignerFromKeypair(umi, fromWeb3JsKeypair(payer));
  umi.use(signerIdentity(umiSigner));

  if (process.env.SKIP_TOKEN_METADATA !== "1") {
    const mintSigner = generateSigner(umi);

    await createFungible(umi, {
      mint: mintSigner,
      authority: umiSigner,
      payer: umiSigner,
      updateAuthority: umiSigner,
      name: args.name,
      symbol: args.symbol,
      uri: args.uri,
      sellerFeeBasisPoints: percentAmount(0),
      decimals: args.decimals,
      isMutable: true,
    }).sendAndConfirm(umi);

    mint = toWeb3JsPublicKey(mintSigner.publicKey);
    const [metadata] = findMetadataPda(umi, {
      mint: mintSigner.publicKey,
    });
    metadataPda = metadata;
  } else {
    mint = await createMint(
      connection,
      payer,
      payer.publicKey,
      payer.publicKey,
      args.decimals
    );
  }

  const ata = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint,
    recipient
  );

  const rawAmount = BigInt(Math.round(args.amount * 10 ** args.decimals));
  await mintTo(connection, payer, mint, ata.address, payer, rawAmount);

  console.log("\n✅ Token created successfully");
  console.log(`Mint: ${mint.toBase58()}`);
  console.log(`Metadata PDA: ${metadataPda ?? "skipped"}`);
  console.log(`Recipient ATA: ${ata.address.toBase58()}`);
  console.log(`Raw amount minted: ${rawAmount.toString()}`);
  console.log(
    `Explorer: https://explorer.solana.com/address/${mint.toBase58()}?cluster=devnet`
  );
}

main().catch((error) => {
  console.error("\n❌ Failed to create devnet SPL token");
  console.error(error);
  process.exit(1);
});
