/**
 * TestWalletAdapter — A custom Solana wallet adapter for browser E2E tests.
 *
 * Uses the same deterministic keypair as `e2e/setup/test-context.ts` so the
 * browser session and the test runner share the same wallet identity.
 *
 * Gated behind VITE_TEST_WALLET=true — never included in production builds.
 */
import {
  BaseMessageSignerWalletAdapter,
  WalletName,
  WalletReadyState,
} from "@solana/wallet-adapter-base";
import { Keypair, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import nacl from "tweetnacl";

// Pre-computed: sha256("e2e_test_payer").slice(0, 32)
// Must match e2e/setup/test-context.ts
const TEST_PAYER_SEED = new Uint8Array([
  126, 87, 189, 114, 89, 150, 71, 223, 4, 29, 86, 127, 68, 42, 206, 91, 132,
  135, 127, 63, 141, 51, 177, 179, 204, 198, 108, 198, 222, 227, 129, 38,
]);

// 1×1 green pixel PNG as data-uri (minimal icon)
const ICON =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

export class TestWalletAdapter extends BaseMessageSignerWalletAdapter {
  name = "Test Wallet" as WalletName<"Test Wallet">;
  url = "https://localhost";
  icon = ICON;
  readyState = WalletReadyState.Installed;
  supportedTransactionVersions = new Set(["legacy", 0] as const);

  private _keypair: Keypair;
  private _publicKey: PublicKey | null = null;
  private _connecting = false;
  private _connected = false;

  constructor() {
    super();
    this._keypair = Keypair.fromSeed(TEST_PAYER_SEED);
  }

  get publicKey(): PublicKey | null {
    return this._publicKey;
  }

  get connecting(): boolean {
    return this._connecting;
  }

  get connected(): boolean {
    return this._connected;
  }

  async connect(): Promise<void> {
    this._connecting = true;
    try {
      this._publicKey = this._keypair.publicKey;
      this._connected = true;
      this.emit("connect", this._publicKey);
    } finally {
      this._connecting = false;
    }
  }

  async disconnect(): Promise<void> {
    this._publicKey = null;
    this._connected = false;
    this.emit("disconnect");
  }

  async signTransaction<T extends Transaction | VersionedTransaction>(
    transaction: T
  ): Promise<T> {
    if (transaction instanceof Transaction) {
      transaction.partialSign(this._keypair);
    } else {
      // VersionedTransaction
      transaction.sign([this._keypair]);
    }
    return transaction;
  }

  async signAllTransactions<T extends Transaction | VersionedTransaction>(
    transactions: T[]
  ): Promise<T[]> {
    for (const tx of transactions) {
      await this.signTransaction(tx);
    }
    return transactions;
  }

  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    return nacl.sign.detached(message, this._keypair.secretKey);
  }
}
