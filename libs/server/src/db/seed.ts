import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'csv-parse/sync';
import { db } from './index';
import { createBusyWalletsService } from '../busy-wallets/services/busy-wallets.service';
import { type NewBusyWallet } from '../busy-wallets/schema/busy-wallets.schema';

/**
 * Seed script to populate busy_wallets table from CSV
 * Run with: yarn db:seed
 */
async function seedBusyWallets() {
  console.log('🌱 Starting busy wallets seed...');

  try {
    // Read CSV file
    const csvPath = join(__dirname, 'seeds', 'busy-wallets.csv');
    const csvContent = readFileSync(csvPath, 'utf-8');
    
    // Parse CSV
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });

    console.log(`📁 Found ${records.length} wallet records in CSV`);

    // Transform CSV data to database format
    const walletData: NewBusyWallet[] = records.map((record: any) => {
      // Handle BOM and different possible column names
      const addressKey = Object.keys(record).find(key => 
        key.includes('Wallet') || key.includes('address') || key.includes('Address')
      ) || Object.keys(record)[0];
      
      const transactionKey = Object.keys(record).find(key => 
        key.includes('Transaction') || key.includes('transaction') || key.includes('per day')
      ) || Object.keys(record)[1];

      return {
        address: record[addressKey],
        transactionsAmount: parseInt(record[transactionKey] || '0', 10),
        isActive: true,
      };
    });

    // Filter out invalid addresses (basic validation)
    const validWallets = walletData.filter(wallet => {
      const isValid = wallet.address && 
                     wallet.address.length >= 32 && 
                     wallet.address.length <= 64 &&
                     !wallet.address.includes(' ');
      if (!isValid) {
        console.warn(`⚠️  Skipping invalid wallet address: ${wallet.address}`);
      }
      return isValid;
    });

    console.log(`✅ Validated ${validWallets.length} wallet addresses`);

    // Create service and bulk insert
    const busyWalletsService = createBusyWalletsService(db);
    
    // Insert in batches to avoid overwhelming the database
    const batchSize = 100;
    let insertedCount = 0;
    
    for (let i = 0; i < validWallets.length; i += batchSize) {
      const batch = validWallets.slice(i, i + batchSize);
      
      try {
        await busyWalletsService.bulkCreate(batch);
        insertedCount += batch.length;
        console.log(`📝 Inserted batch ${Math.floor(i / batchSize) + 1}: ${batch.length} wallets (${insertedCount}/${validWallets.length} total)`);
      } catch (error) {
        console.error(`❌ Failed to insert batch ${Math.floor(i / batchSize) + 1}:`, error);
        // Continue with next batch
      }
    }

    console.log(`🎉 Seed completed! Inserted ${insertedCount} busy wallets`);

    // Print some stats
    const totalActive = await busyWalletsService.getActiveCount();
    console.log(`📊 Total active wallets in database: ${totalActive}`);

  } catch (error) {
    console.error('❌ Error during seeding:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  seedBusyWallets()
    .then(() => {
      console.log('✨ Seeding complete!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Seeding failed:', error);
      process.exit(1);
    });
}

export { seedBusyWallets };