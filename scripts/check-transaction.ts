import { Connection } from "@solana/web3.js";

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || "https://mainnet.helius-rpc.com/?api-key=f6d0c03a-562f-4784-8b78-ebb084b72514";
const connection = new Connection(SOLANA_RPC_URL);

async function checkTransaction(signature: string) {
  console.log(`\n========== Checking Transaction ${signature} ==========`);

  try {
    const tx = await connection.getTransaction(signature, {
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed"
    });

    if (!tx) {
      console.log("Transaction not found");
      return;
    }

    console.log("\nTransaction Details:");
    console.log("Slot:", tx.slot);
    console.log("Block Time:", new Date((tx.blockTime || 0) * 1000).toISOString());
    console.log("Fee:", tx.meta?.fee, "lamports");
    console.log("Status:", tx.meta?.err ? "FAILED" : "SUCCESS");

    if (tx.meta?.err) {
      console.log("\n❌ ERROR:", JSON.stringify(tx.meta.err, null, 2));
    }

    if (tx.meta?.logMessages) {
      console.log("\n--- Log Messages ---");
      tx.meta.logMessages.forEach((log, i) => {
        console.log(`${i}: ${log}`);
      });
    }

    // Check pre and post balances
    console.log("\n--- Balance Changes ---");
    tx.transaction.message.staticAccountKeys.forEach((account, i) => {
      const pre = tx.meta?.preBalances[i] || 0;
      const post = tx.meta?.postBalances[i] || 0;
      const change = post - pre;
      if (change !== 0) {
        console.log(`${account.toBase58()}: ${change / 1e9} SOL`);
      }
    });

  } catch (error) {
    console.log("Error fetching transaction:", error);
  }
}

async function main() {
  // Route 1031 hop 0 (succeeded)
  await checkTransaction("22iHw9XnhByFzPZ47Myq8CFkjCb97onN8fQW1zamNEQELCyo6XEogNdMtgK4w1KEhvKUt5aVtsqiJEr9dEDdcPeP");

  // Route 1031 hop 1 (failed)
  await checkTransaction("59v92BACs4cWKT3eTyJBPiLqYTH2bpSMWDgBjUP6n4WFdsfqPQANDZDkGmwnMBtmRFuiffuJ83q7MNA7odwmENCK");

  // Route 1027 deployment
  await checkTransaction("4CvAC9LgWyzETJLQAJL57oWQE1sHubZxHYB7ckQihuSYUB5s9XcEy85by4eCZ8CiGWyWTsxj1qRPTu8oPdwxdELL");

  // Route 1031 deployment
  await checkTransaction("3Yai3MCXDdkGtTnkczuYRr3gBrGBouCxdWnVQ4TecaTb3huVAQyemSmJgKcYC5YP8MwKY97ycV6dvXyb4zDKUqjh");
}

main().catch(console.error);
