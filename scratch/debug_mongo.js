const { MongoClient } = require('mongodb');
require('dotenv').config();

const uri = process.env.MONGODB_URI;

async function run() {
    const client = new MongoClient(uri);
    try {
        console.log("Attempting to connect to:", uri);
        await client.connect();
        console.log("Connected successfully to server");
        
        const db = client.db();
        const collections = await db.listCollections().toArray();
        console.log("Collections found:", collections.map(c => c.name));

        const result = {};
        for (const col of collections) {
            const data = await db.collection(col.name).find({}).toArray();
            result[col.name] = data;
        }

        console.log("--- DATA ---");
        console.log(JSON.stringify(result, null, 2));

    } catch (err) {
        console.error("Connection failed:", err);
    } finally {
        await client.close();
    }
}

run();
