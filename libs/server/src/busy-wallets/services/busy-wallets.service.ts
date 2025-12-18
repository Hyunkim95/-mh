import { eq, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { busyWalletsSchema, type BusyWallet, type NewBusyWallet } from '../schema/busy-wallets.schema';

export class BusyWalletsService {
  constructor(private db: NodePgDatabase<any>) {}

  /**
   * Get N unique random active wallets for use in Easy Route intermediate hops
   * Ensures no wallet is selected twice in the same route
   * Ordered by RANDOM() to distribute usage across wallets
   */
  async getRandomWallets(count: number): Promise<BusyWallet[]> {
    // Get more wallets than needed to ensure uniqueness after filtering
    const bufferMultiplier = Math.max(2, Math.ceil(count * 1.5));
    const queryLimit = Math.min(500, count * bufferMultiplier); // Don't exceed our total wallet count
    
    const candidates = await this.db
      .select()
      .from(busyWalletsSchema)
      .where(eq(busyWalletsSchema.isActive, true))
      .orderBy(sql`RANDOM()`)
      .limit(queryLimit);
    
    // Ensure uniqueness by deduplicating by address
    const uniqueWallets = candidates.filter((wallet, index, array) => 
      array.findIndex(w => w.address === wallet.address) === index
    );
    
    // Return exactly the requested count
    return uniqueWallets.slice(0, count);
  }

  /**
   * Mark wallets as recently used (updates lastUsedAt timestamp)
   */
  async markWalletsUsed(walletIds: number[]): Promise<void> {
    if (walletIds.length === 0) return;
    
    const now = new Date();
    for (const id of walletIds) {
      await this.db
        .update(busyWalletsSchema)
        .set({ lastUsedAt: now })
        .where(eq(busyWalletsSchema.id, id));
    }
  }

  /**
   * Get wallet by address
   */
  async getByAddress(address: string): Promise<BusyWallet | null> {
    const wallets = await this.db
      .select()
      .from(busyWalletsSchema)
      .where(eq(busyWalletsSchema.address, address))
      .limit(1);
    
    return wallets[0] || null;
  }

  /**
   * Create a new busy wallet
   */
  async create(data: NewBusyWallet): Promise<BusyWallet> {
    const [wallet] = await this.db
      .insert(busyWalletsSchema)
      .values(data)
      .returning();
    
    return wallet;
  }

  /**
   * Bulk create wallets (used for seeding from CSV)
   */
  async bulkCreate(wallets: NewBusyWallet[]): Promise<BusyWallet[]> {
    if (wallets.length === 0) return [];
    
    return await this.db
      .insert(busyWalletsSchema)
      .values(wallets)
      .returning();
  }

  /**
   * Get total count of active wallets
   */
  async getActiveCount(): Promise<number> {
    const result = await this.db
      .select({ count: busyWalletsSchema.id })
      .from(busyWalletsSchema)
      .where(eq(busyWalletsSchema.isActive, true));
    
    return result.length;
  }
}

// Export singleton instance
let busyWalletsService: BusyWalletsService | null = null;

export const createBusyWalletsService = (db: NodePgDatabase<any>): BusyWalletsService => {
  if (!busyWalletsService) {
    busyWalletsService = new BusyWalletsService(db);
  }
  return busyWalletsService;
};

export default busyWalletsService;