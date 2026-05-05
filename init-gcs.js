require('dotenv').config();
const { Client, isLocal } = require('./database');
const gcs = require('./gcs');

async function initializeBucketFolders() {
    console.log('🚀 Starting GCS Folder Initialization...');
    
    if (!gcs.isGcsActive) {
        console.error('❌ GCP Storage is NOT active. Please add gcp-key.json or run "gcloud auth application-default login".');
        process.exit(1);
    }

    try {
        const clients = await Client.find({});
        console.log(`Found ${clients.length} clients to process.`);

        for (const client of clients) {
            const clientId = client._id.toString();
            console.log(`📂 Initializing folder for: ${client.name} (${clientId})`);
            
            // Note: Creating a virtual folder by uploading an empty .keep file
            // This ensures the folder appears in the GCP Console UI.
            await gcs.uploadToBucket(clientId, '.keep', Buffer.from('folder initialization'));
        }

        console.log('✅ All client folders have been initialized in the bucket.');
        process.exit(0);
    } catch (err) {
        console.error('💥 Error during initialization:', err.message);
        process.exit(1);
    }
}

// Ye tabhi chalega jab aap 'node init-gcs.js' command run karenge
initializeBucketFolders();
