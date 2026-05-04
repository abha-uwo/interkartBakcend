const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;

async function fetchData() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        const db = mongoose.connection.db;
        const collections = await db.listCollections().toArray();
        
        const allData = {};

        for (const collection of collections) {
            const name = collection.name;
            console.log(`Fetching data from: ${name}`);
            const data = await db.collection(name).find({}).toArray();
            allData[name] = data;
        }

        console.log('--- DATA FETCHED ---');
        console.log(JSON.stringify(allData, null, 2));
        
        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error('Error fetching data:', err);
        process.exit(1);
    }
}

fetchData();
