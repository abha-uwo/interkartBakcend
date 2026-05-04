const { MongoClient } = require('mongodb');
require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8']);

const uri = process.env.MONGODB_URI;

async function run() {
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const dbNames = ['whatsabot', 'wabot', 'aisa', 'test'];
        
        for (const name of dbNames) {
            console.log(`Checking database: ${name}`);
            const db = client.db(name);
            const collections = await db.listCollections().toArray();
            if (collections.length > 0) {
                console.log(`Found collections in ${name}:`, collections.map(c => c.name));
                for (const col of collections) {
                    const data = await db.collection(col.name).find({}).toArray();
                    console.log(`Data in ${name}.${col.name}:`, JSON.stringify(data, null, 2));
                }
            } else {
                console.log(`No collections in ${name}`);
            }
        }

    } catch (err) {
        console.error("Error:", err);
    } finally {
        await client.close();
    }
}

run();
