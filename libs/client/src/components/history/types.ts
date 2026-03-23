export interface Route {
  id: number;
  routeId: number;
  name: string | null; //route name
  description?: string | null;
  tokenType: string;
  tokenMint?: string | null;
  tokenSymbol?: string | null;
  hopAmountTokens: string;
  hopAmountRaw: string;
  hops?: Array<{
    recipient: string;
    scheduledAt: string; // ISO string from database
    executedAt?: string | null; // actual execution time
    delayMinutes?: number;
    delaySeconds?: number;
    status?: "completed" | "active" | "upcoming";
  }>;
  creator: string;
  status: string;
  createdAt: string;
  deployedAt?: string | null;
  deploymentTxHash?: string | null;
  routeConfigPda?: string | null;
  canDeploy: boolean;
  deploymentStatus: "draft" | "deploying" | "deployed" | "completed" | "failed";
  hasObfuscation?: boolean;
  obfuscationStatus?: string | null;
}
