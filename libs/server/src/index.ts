import { config } from "dotenv";
config({
  path: "../../.env",
});

import dualDirectionContractEventsService from "./solana/services/dual-direction-contract-events.service";

export { server, type AppRouter } from "./server";
export { authService } from "./auth/services/auth.service";
export * from "./solana/services/contract.service";
// Export database configurations
export * from "./db";

// Export executor service
export { default as executorService } from "./executors/executor.service";

// Export timezone utilities
export * from "./utils/timezone";

// Export logger
export { createLogger } from "./utils/logger";
export * from "./hops/services/hops-scheduler.service";
export { dualDirectionContractEventsService };
export { type HelisuTokenResponse } from "./solana/services/tokens.service";
export { default as routesService } from "./routes/services/routes.service";

// Obfuscation exports
export type { ObfuscationFeeEstimate } from "./obfuscation";
export { obfuscationSchedulerService } from "./obfuscation";
