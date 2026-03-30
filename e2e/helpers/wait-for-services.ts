import { Connection } from "@solana/web3.js";
import { Pool } from "pg";

export async function waitForSolanaValidator(
  rpcUrl: string,
  timeoutMs: number = 60_000
): Promise<void> {
  const start = Date.now();
  const connection = new Connection(rpcUrl);

  while (Date.now() - start < timeoutMs) {
    try {
      const version = await connection.getVersion();
      if (version) {
        console.log(
          `Solana validator ready (v${version["solana-core"]})`
        );
        return;
      }
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(
    `Solana validator did not become healthy within ${timeoutMs}ms`
  );
}

export async function waitForPostgres(
  host: string,
  port: number,
  timeoutMs: number = 30_000
): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const pool = new Pool({
        host,
        port,
        user: "trpc_user",
        password: "trpc_password",
        database: "trpc_e2e",
        connectionTimeoutMillis: 2000,
      });
      await pool.query("SELECT 1");
      await pool.end();
      console.log(`Postgres ready at ${host}:${port}`);
      return;
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(
    `Postgres did not become healthy within ${timeoutMs}ms`
  );
}
