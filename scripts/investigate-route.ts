import { Connection, PublicKey } from "@solana/web3.js";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import * as IDLJson from "../libs/server/src/solana/idl/multi_hopper_project.json";

const IDL = IDLJson as any;
const MULTI_HOPPER_PROGRAM_ID = new PublicKey(IDLJson.address);

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || "https://mainnet.helius-rpc.com/?api-key=f6d0c03a-562f-4784-8b78-ebb084b72514";
const connection = new Connection(SOLANA_RPC_URL);
const program = new Program(
  IDL as any,
  new AnchorProvider(connection, {} as any, {})
);

const getRouteConfigPda = (routeId: BN) => {
  const [routeConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("route"), routeId.toArrayLike(Buffer, "le", 8)],
    MULTI_HOPPER_PROGRAM_ID
  );
  return routeConfigPda;
};

const getRouteStatePda = (routeId: BN) => {
  const [routeStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("state"), routeId.toArrayLike(Buffer, "le", 8)],
    MULTI_HOPPER_PROGRAM_ID
  );
  return routeStatePda;
};

async function investigateRoute(routeId: number) {
  console.log(`\n========== Investigating Route ${routeId} ==========`);

  try {
    const routeConfigPda = getRouteConfigPda(new BN(routeId));
    const routeStatePda = getRouteStatePda(new BN(routeId));

    console.log(`Route Config PDA: ${routeConfigPda.toBase58()}`);
    console.log(`Route State PDA: ${routeStatePda.toBase58()}`);

    // Fetch route config
    try {
      const routeConfig = await program.account.routeConfig.fetch(routeConfigPda);
      console.log("\n--- Route Config ---");
      console.log("Creator:", routeConfig.creator.toBase58());
      console.log("Route ID:", routeConfig.routeId.toString());
      console.log("Source Owner:", routeConfig.sourceOwner.toBase58());
      console.log("Executor:", routeConfig.executor.toBase58());
      console.log("Hop Amount:", routeConfig.hopAmount.toString());
      console.log("Original Mint:", routeConfig.originalMint.toBase58());
      console.log("Route Token Mint:", routeConfig.routeTokenMint.toBase58());
      console.log("Is Finalized:", routeConfig.isFinalized);
      console.log("Created At:", routeConfig.createdAt.toString());
      console.log("Total Hops:", routeConfig.hops.length);

      console.log("\nHops:");
      routeConfig.hops.forEach((hop: any, index: number) => {
        console.log(`  Hop ${index}:`);
        console.log(`    Recipient: ${hop.recipient.toBase58()}`);
        console.log(`    Delay Seconds: ${hop.delaySeconds.toString()}`);
      });
    } catch (error) {
      console.log("\nRoute Config NOT FOUND ON-CHAIN");
      console.log("Error:", error instanceof Error ? error.message : String(error));
    }

    // Fetch route state
    try {
      const routeState = await program.account.routeState.fetch(routeStatePda);
      console.log("\n--- Route State ---");
      console.log("Current Hop Index:", routeState.currentHopIndex);
      console.log("Started At:", routeState.startedAt.toString());
      console.log("Hops Count:", routeState.hopsCount);
      console.log("Last Hop At:", routeState.lastHopAt?.toString() || "None");
    } catch (error) {
      console.log("\nRoute State NOT FOUND ON-CHAIN");
      console.log("Error:", error instanceof Error ? error.message : String(error));
    }

    // Check if PDAs have any balance
    try {
      const configBalance = await connection.getBalance(routeConfigPda);
      const stateBalance = await connection.getBalance(routeStatePda);
      console.log("\n--- PDA Balances ---");
      console.log(`Route Config Balance: ${configBalance / 1e9} SOL`);
      console.log(`Route State Balance: ${stateBalance / 1e9} SOL`);
    } catch (error) {
      console.log("\nError checking balances:", error);
    }

  } catch (error) {
    console.log("Error investigating route:", error);
  }
}

async function main() {
  const routeId = parseInt(process.argv[2] || "1027");
  await investigateRoute(routeId);
}

main().catch(console.error);
