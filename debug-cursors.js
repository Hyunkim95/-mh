const { Client } = require('pg');

async function debugCursors() {
    const client = new Client({
        host: 'localhost',
        port: 5432,
        database: 'trpc_db',
        user: 'trpc_user',
        password: 'trpc_password',
    });

    try {
        await client.connect();
        console.log('Connected to database');

        // Check ETL cursors
        const cursorsQuery = 'SELECT * FROM etl_cursors ORDER BY updated_at DESC';
        const cursorsResult = await client.query(cursorsQuery);
        console.log('\n=== ETL CURSORS ===');
        console.table(cursorsResult.rows);

        // Check recent contract transactions
        const txQuery = `
            SELECT signature, slot, processed_at, created_at 
            FROM contract_transactions 
            ORDER BY created_at DESC 
            LIMIT 10
        `;
        const txResult = await client.query(txQuery);
        console.log('\n=== RECENT CONTRACT TRANSACTIONS ===');
        console.table(txResult.rows);

        // Check for duplicate transactions
        const duplicatesQuery = `
            SELECT signature, COUNT(*) as count 
            FROM contract_transactions 
            GROUP BY signature 
            HAVING COUNT(*) > 1
            ORDER BY count DESC
        `;
        const duplicatesResult = await client.query(duplicatesQuery);
        console.log('\n=== DUPLICATE TRANSACTIONS ===');
        console.table(duplicatesResult.rows);

        // Check transaction counts by hour
        const countsQuery = `
            SELECT 
                date_trunc('hour', created_at) as hour,
                COUNT(*) as transactions_count
            FROM contract_transactions 
            WHERE created_at >= NOW() - INTERVAL '24 hours'
            GROUP BY date_trunc('hour', created_at)
            ORDER BY hour DESC
        `;
        const countsResult = await client.query(countsQuery);
        console.log('\n=== TRANSACTION COUNTS BY HOUR (LAST 24H) ===');
        console.table(countsResult.rows);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await client.end();
    }
}

debugCursors();