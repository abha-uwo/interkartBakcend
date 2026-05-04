const { MongoClient } = require('mongodb');
require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8']);

const uri = process.env.MONGODB_URI;

async function run() {
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const admin = client.db().admin();
        const { databases } = await admin.listDatabases();
        console.log("Databases:", databases.map(db => db.name));

        for (const dbInfo of databases) {
            const db = client.db(dbInfo.name);
            const collections = await db.listCollections().toArray();
            console.log(`\n--- DB: ${dbInfo.name} ---`);
            for (const col of collections) {
                const count = await db.collection(col.name).countDocuments();
                console.log(`Collection: ${col.name} (${count} documents)`);
                if (count > 0) {
                    const data = await db.collection(col.name).find({}).toArray();
                    console.log(JSON.stringify(data, null, 2));
                }
            }
        }

    } catch (err) {
        console.error("Error:", err);
    } finally {
        await client.close();
    }
}

run();
