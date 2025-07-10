const axios = require('axios');
const { MongoClient } = require('mongodb');

// Database connection URI and name
const dbUri = 'mongodb+srv://avarch:eips_24@cluster0.hpksunr.mongodb.net/?retryWrites=true&w=majority';
const dbName = 'test';

// RPC node URL
const rpcNodeUrl = 'https://ethereum-rpc.publicnode.com';

// Function to fetch block data by block number
async function fetchBlockData(blockNumber) {
    try {
        const response = await axios.post(rpcNodeUrl, {
            jsonrpc: "2.0",
            method: "eth_getBlockByNumber",
            params: [blockNumber, true], // true to get the full transaction objects
            id: 1
        });
        const block = response.data.result;

        // Convert hex values to numbers
        const timestamp = parseInt(block.timestamp, 16) * 1000; // Convert to milliseconds
        const baseFeePerGas = parseInt(block.baseFeePerGas, 16);
        const gasUsed = parseInt(block.gasUsed, 16);
        const blockNumberDecimal = parseInt(block.number, 16);

        // Calculate gasBurnt
        const gasBurnt = gasUsed * baseFeePerGas;

        // Count transaction types
        const transactionTypes = {
            type0: 0,
            type1: 0,
            type2: 0,
            type3: 0,
            type4: 0,
            total: block.transactions.length
        };

        block.transactions.forEach((tx) => {
            if (tx.type === '0x0') transactionTypes.type0++;
            else if (tx.type === '0x1') transactionTypes.type1++;
            else if (tx.type === '0x2') transactionTypes.type2++;
            else if (tx.type === '0x3') transactionTypes.type3++;
            else if (tx.type === '0x4') transactionTypes.type4++;
        });

        // Extract only the required fields
        return {
            blockNumber: blockNumberDecimal,
            timestamp,
            baseFeePerGas,
            gasUsed,
            priorityFeePerGas: block.transactions[0]?.maxPriorityFeePerGas || '0x0', // Use the first transaction's priority fee
            gasBurnt,
            transactionTypes
        };
    } catch (error) {
        console.error(`Error fetching block ${blockNumber}:`, error);
        return null;
    }
}

// Function to check if a block already exists in the database
async function isBlockProcessed(client, blockNumber) {
    const baseFeeCollection = client.db(dbName).collection('base_fee');
    const existingBlock = await baseFeeCollection.findOne({ blockNumber });
    return !!existingBlock; // Returns true if the block exists, false otherwise
}

// Function to update the collections with new data
async function updateCollections(client, data) {
    const baseFeeCollection = client.db(dbName).collection('base_fee');
    const priorityFeeCollection = client.db(dbName).collection('priority_fee');
    const gasUsedCollection = client.db(dbName).collection('gas_used');
    const gasBurntCollection = client.db(dbName).collection('gas_burnt');
    const transactionTypesCollection = client.db(dbName).collection('transaction_types');

    // Insert data into respective collections
    await baseFeeCollection.insertOne({ blockNumber: data.blockNumber, timestamp: data.timestamp, baseFeePerGas: data.baseFeePerGas });
    await priorityFeeCollection.insertOne({ blockNumber: data.blockNumber, timestamp: data.timestamp, priorityFeePerGas: data.priorityFeePerGas });
    await gasUsedCollection.insertOne({ blockNumber: data.blockNumber, timestamp: data.timestamp, gasUsed: data.gasUsed });
    await gasBurntCollection.insertOne({ blockNumber: data.blockNumber, timestamp: data.timestamp, gasBurnt: data.gasBurnt });
    await transactionTypesCollection.insertOne({ blockNumber: data.blockNumber, timestamp: data.timestamp, ...data.transactionTypes });

    console.log(`Data added for block: ${data.blockNumber}`);
}

// Function to delete old data (older than 24 hours)
async function deleteOldData(client) {
    const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);

    const baseFeeCollection = client.db(dbName).collection('base_fee');
    const priorityFeeCollection = client.db(dbName).collection('priority_fee');
    const gasUsedCollection = client.db(dbName).collection('gas_used');
    const gasBurntCollection = client.db(dbName).collection('gas_burnt');
    const transactionTypesCollection = client.db(dbName).collection('transaction_types');

    await baseFeeCollection.deleteMany({ timestamp: { $lt: twentyFourHoursAgo } });
    await priorityFeeCollection.deleteMany({ timestamp: { $lt: twentyFourHoursAgo } });
    await gasUsedCollection.deleteMany({ timestamp: { $lt: twentyFourHoursAgo } });
    await gasBurntCollection.deleteMany({ timestamp: { $lt: twentyFourHoursAgo } });
    await transactionTypesCollection.deleteMany({ timestamp: { $lt: twentyFourHoursAgo } });

    console.log("Deleted old data (older than 24 hours).");
}

// Main function to handle the fetching and updating process
async function main() {
    const client = new MongoClient(dbUri);
    try {
        await client.connect();
        console.log("Connected to MongoDB");

        // Initialize collections if they don't exist
        const db = client.db(dbName);
        const collections = ['base_fee', 'priority_fee', 'gas_used', 'gas_burnt', 'transaction_types'];
        for (const collectionName of collections) {
            if (!(await db.listCollections({ name: collectionName }).hasNext())) {
                await db.createCollection(collectionName);
                console.log(`Created collection ${collectionName}`);
            }
        }

        while (true) {
            const latestBlockResponse = await axios.post(rpcNodeUrl, {
                jsonrpc: "2.0",
                method: "eth_blockNumber",
                params: [],
                id: 1
            });
            const latestBlockNumber = parseInt(latestBlockResponse.data.result, 16);

            // Fetch new blocks in batches of 100
            for (let i = 0; i < 7200; i += 100) {
                const blockNumbers = Array.from({ length: 100 }, (_, index) => `0x${(latestBlockNumber - i - index).toString(16)}`);
                const blocks = await Promise.all(blockNumbers.map(fetchBlockData));
                const validBlocks = blocks.filter(block => block !== null);

                // Check for duplicates and stop if any block is already processed
                let duplicateFound = false;
                for (const block of validBlocks) {
                    if (await isBlockProcessed(client, block.blockNumber)) {
                        console.log(`Duplicate block found at block number: ${block.blockNumber}. Stopping this iteration.`);
                        duplicateFound = true;
                        break;
                    }
                    await updateCollections(client, block);
                }

                if (duplicateFound) {
                    break; // Stop processing further blocks in this iteration
                }

                console.log(`Processed ${validBlocks.length} blocks.`);
                await new Promise(resolve => setTimeout(resolve, 30000)); // 10 seconds delay
            }

            // Clean up old data
            await deleteOldData(client);
            console.log("Database updated with the latest data and old data removed.");
            await new Promise(resolve => setTimeout(resolve, 60000)); // Wait for 1 minute before next iteration
        }
    } catch (error) {
        console.error("Error in main function:", error);
    } finally {
        await client.close();
    }
}

main();