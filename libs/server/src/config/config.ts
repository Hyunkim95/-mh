import dotenv from "dotenv";
import path from "path";

dotenv.config({
  path: path.resolve(__dirname, "../../../.env"),
});

export const config = {
  solanaRpcUrl: process.env.SOLANA_RPC_URL,
};
