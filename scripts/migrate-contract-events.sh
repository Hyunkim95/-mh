#!/bin/bash

# Contract Events Migration Script
# This script runs the necessary database migrations for the contract events system

set -e

echo "🚀 Starting Contract Events System Migration..."

# Navigate to server directory
cd "$(dirname "$0")/../libs/server"

echo "📋 Current migration status:"
npx drizzle-kit introspect:pg || echo "Introspect not available, continuing..."

echo "🔄 Running database migrations..."

# Run the migrations
npx drizzle-kit push:pg

echo "✅ Contract Events System Migration Complete!"

echo "📊 Tables that should now exist:"
echo "  - contract_transactions (for storing Solana transaction data)"
echo "  - contract_events (for storing parsed contract events)"
echo "  - etl_cursors (for tracking ETL job progress)"

echo ""
echo "🎯 Next steps:"
echo "  1. Start your server to initialize the contract events service"
echo "  2. Check the service status: trpc.contractEvents.getStatus.query()"
echo "  3. Monitor ETL progress: trpc.contractEvents.getProcessingStats.query()"

echo ""
echo "🔧 Configuration:"
echo "  Set these environment variables:"
echo "  - SOLANA_RPC_URL=https://api.mainnet-beta.solana.com"
echo "  - MULTI_HOPPER_PROGRAM_ID=DzM2xPUErizCjWTHyWTFqWtSgVazcfFVAGiehoRsG8os"
echo "  - CONTRACT_ETL_INTERVAL_MS=30000"
echo "  - CONTRACT_PROCESSING_INTERVAL_MS=10000"
echo "  - CONTRACT_EVENTS_ENABLED=true" 