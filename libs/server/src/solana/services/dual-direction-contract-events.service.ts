import {
  ContractEventsScheduler,
  ContractEventsSchedulerConfig,
} from "./contract-events-scheduler";
import { db } from "../../db";
import { MULTI_HOPPER_PROGRAM_ID } from "./contract-utils";
import { config } from "../../config/config";

export interface DualDirectionConfig {
  rpcUrl: string;
  programId: string;
  forwardConfig: {
    etlIntervalMs: number;
    processingIntervalMs: number;
    enabled: boolean;
  };
  backwardConfig: {
    etlIntervalMs: number;
    processingIntervalMs: number;
    enabled: boolean;
  };
}

export class DualDirectionContractEventsService {
  private forwardScheduler: ContractEventsScheduler;
  private backwardScheduler: ContractEventsScheduler;
  private isInitialized = false;

  constructor(config: DualDirectionConfig) {
    // Forward scheduler - processes from most recent to oldest
    const forwardConfig: ContractEventsSchedulerConfig = {
      rpcUrl: config.rpcUrl,
      programId: config.programId,
      direction: "forward",
      etlIntervalMs: config.forwardConfig.etlIntervalMs,
      processingIntervalMs: config.forwardConfig.processingIntervalMs,
      enabled: config.forwardConfig.enabled,
    };

    // Backward scheduler - processes from oldest to most recent
    const backwardConfig: ContractEventsSchedulerConfig = {
      rpcUrl: config.rpcUrl,
      programId: config.programId,
      direction: "backward",
      etlIntervalMs: config.backwardConfig.etlIntervalMs,
      processingIntervalMs: config.backwardConfig.processingIntervalMs,
      enabled: config.backwardConfig.enabled,
    };

    this.forwardScheduler = new ContractEventsScheduler(db, forwardConfig);
    this.backwardScheduler = new ContractEventsScheduler(db, backwardConfig);
  }

  /**
   * Initialize both forward and backward schedulers
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log("Dual direction contract events service already initialized");
      return;
    }

    try {
      console.log("🚀 Initializing dual direction contract events service...");

      // Start forward scheduler (always enabled for real-time processing)
      if (this.forwardScheduler.config.enabled) {
        console.log("🔄 Starting forward scheduler (newest → oldest)...");
        await this.forwardScheduler.start();
        console.log("✅ Forward scheduler started");
      } else {
        console.log("⏭️ Forward scheduler disabled");
      }

      // Start backward scheduler if enabled
      if (this.backwardScheduler.config.enabled) {
        // Add delay between starting schedulers to prevent simultaneous RPC load
        console.log(
          "⏳ Waiting 5 seconds before starting backward scheduler..."
        );
        await new Promise((resolve) => setTimeout(resolve, 5000));

        console.log("🔄 Starting backward scheduler (oldest → newest)...");
        await this.backwardScheduler.start();
        console.log("✅ Backward scheduler started");
      } else {
        console.log(
          "⏭️ Backward scheduler disabled (set CONTRACT_EVENTS_BACKWARD_ENABLED=true to enable)"
        );
      }

      this.isInitialized = true;

      console.log(
        "🎯 Dual direction contract events service initialized successfully"
      );
      console.log("📊 Configuration:");
      console.log(
        `   • Forward: ${
          this.forwardScheduler.config.enabled ? "ENABLED" : "DISABLED"
        } - Catches new transactions`
      );
      console.log(
        `   • Backward: ${
          this.backwardScheduler.config.enabled ? "ENABLED" : "DISABLED"
        } - Fills historical gaps`
      );
      if (
        this.forwardScheduler.config.enabled &&
        this.backwardScheduler.config.enabled
      ) {
        console.log("   • Sequential startup prevents RPC rate limiting");
      }
    } catch (error) {
      console.error(
        "❌ Failed to initialize dual direction contract events service:",
        error
      );
      throw error;
    }
  }

  /**
   * Shutdown both schedulers
   */
  async shutdown(): Promise<void> {
    if (!this.isInitialized) {
      console.log("Dual direction contract events service not initialized");
      return;
    }

    try {
      console.log("🛑 Shutting down dual direction contract events service...");

      await Promise.all([
        this.forwardScheduler.stop(),
        this.backwardScheduler.stop(),
      ]);

      this.isInitialized = false;
      console.log(
        "✅ Dual direction contract events service shut down successfully"
      );
    } catch (error) {
      console.error(
        "❌ Failed to shutdown dual direction contract events service:",
        error
      );
      throw error;
    }
  }

  /**
   * Get status of both schedulers
   */
  async getStatus() {
    const [forwardStatus, backwardStatus] = await Promise.all([
      this.forwardScheduler.getStatus(),
      this.backwardScheduler.getStatus(),
    ]);

    return {
      isInitialized: this.isInitialized,
      forward: {
        ...forwardStatus,
        description: "Processes newest transactions first (real-time)",
      },
      backward: {
        ...backwardStatus,
        description: "Processes oldest transactions first (historical)",
      },
      coverage: {
        explanation:
          "Forward catches new events, backward fills historical gaps",
        cursors: {
          forward: "Tracks most recent processed signature",
          backward: "Tracks oldest processed signature",
        },
      },
    };
  }

  /**
   * Manually trigger ETL for both directions
   */
  async runEtlNow() {
    console.log("🔄 Running ETL manually for both directions...");

    const [forwardResult, backwardResult] = await Promise.all([
      this.forwardScheduler.runEtlNow().catch((error) => ({
        success: false,
        error: error.message,
        direction: "forward",
      })),
      this.backwardScheduler.runEtlNow().catch((error) => ({
        success: false,
        error: error.message,
        direction: "backward",
      })),
    ]);

    return {
      forward: forwardResult,
      backward: backwardResult,
    };
  }

  /**
   * Process events for both directions
   */
  async processEventsNow() {
    console.log("⚡ Processing events manually for both directions...");

    const [forwardResult, backwardResult] = await Promise.all([
      this.forwardScheduler.processEventsNow().catch((error) => ({
        processed: 0,
        errors: [{ eventId: 0, error: error.message }],
        direction: "forward",
      })),
      this.backwardScheduler.processEventsNow().catch((error) => ({
        processed: 0,
        errors: [{ eventId: 0, error: error.message }],
        direction: "backward",
      })),
    ]);

    return {
      forward: forwardResult,
      backward: backwardResult,
      total: {
        processed:
          (forwardResult.processed || 0) + (backwardResult.processed || 0),
        errors: [
          ...(forwardResult.errors || []),
          ...(backwardResult.errors || []),
        ],
      },
    };
  }

  /**
   * Get individual schedulers for advanced usage
   */
  getForwardScheduler(): ContractEventsScheduler {
    return this.forwardScheduler;
  }

  getBackwardScheduler(): ContractEventsScheduler {
    return this.backwardScheduler;
  }

  /**
   * Check if service is ready
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Update configuration for both directions
   */
  updateConfig(newConfig: Partial<DualDirectionConfig>): void {
    if (newConfig.forwardConfig) {
      this.forwardScheduler.updateConfig({
        etlIntervalMs: newConfig.forwardConfig.etlIntervalMs,
        processingIntervalMs: newConfig.forwardConfig.processingIntervalMs,
        enabled: newConfig.forwardConfig.enabled,
      });
    }

    if (newConfig.backwardConfig) {
      this.backwardScheduler.updateConfig({
        etlIntervalMs: newConfig.backwardConfig.etlIntervalMs,
        processingIntervalMs: newConfig.backwardConfig.processingIntervalMs,
        enabled: newConfig.backwardConfig.enabled,
      });
    }

    console.log("📝 Dual direction configuration updated");
  }
}

// Create default configuration
const DEFAULT_DUAL_CONFIG: DualDirectionConfig = {
  rpcUrl: config.solanaRpcUrl || "",
  programId: MULTI_HOPPER_PROGRAM_ID.toBase58(),
  forwardConfig: {
    etlIntervalMs: parseInt(
      process.env.CONTRACT_ETL_FORWARD_INTERVAL_MS || "60000"
    ), // 60 seconds (was 30)
    processingIntervalMs: parseInt(
      process.env.CONTRACT_PROCESSING_INTERVAL_MS || "15000"
    ), // 15 seconds (was 10)
    enabled: true, // Enabled by default
  },
  backwardConfig: {
    etlIntervalMs: parseInt(
      process.env.CONTRACT_ETL_BACKWARD_INTERVAL_MS || "120000"
    ), // 120 seconds (was 60)
    processingIntervalMs: parseInt(
      process.env.CONTRACT_PROCESSING_INTERVAL_MS || "15000"
    ), // 15 seconds (was 10)
    enabled: true, // Disabled by default to prevent duplicate processing
  },
};

// Export singleton instance
export const dualDirectionContractEventsService =
  new DualDirectionContractEventsService(DEFAULT_DUAL_CONFIG);

// Graceful shutdown handling
process.on("SIGTERM", async () => {
  console.log(
    "SIGTERM received, shutting down dual direction contract events service..."
  );
  try {
    await dualDirectionContractEventsService.shutdown();
  } catch (error) {
    console.error("Error during dual direction service shutdown:", error);
  }
});

process.on("SIGINT", async () => {
  console.log(
    "SIGINT received, shutting down dual direction contract events service..."
  );
  try {
    await dualDirectionContractEventsService.shutdown();
  } catch (error) {
    console.error("Error during dual direction service shutdown:", error);
  }
  process.exit(0);
});

export default dualDirectionContractEventsService;
