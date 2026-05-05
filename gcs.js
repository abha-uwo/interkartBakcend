const { Storage } = require('@google-cloud/storage');
const path = require('path');
const fs = require('fs');

// GCP Configuration from .env
const projectId = process.env.GCP_PROJECT_ID;
const bucketName = process.env.GCP_BUCKET_NAME;
const keyFilePath = process.env.GCP_KEY_FILE_PATH; // JSON key file path (e.g., 'gcp-key.json')

let storage;
let bucket;

const fullKeyPath = keyFilePath ? path.join(__dirname, keyFilePath) : null;

if (fullKeyPath && fs.existsSync(fullKeyPath)) {
    try {
        storage = new Storage({
            projectId,
            keyFilename: fullKeyPath,
        });
        bucket = storage.bucket(bucketName);
        console.log(`☁️ [GCS] Storage initialized for bucket: ${bucketName}`);
    } catch (err) {
        console.error('❌ [GCS] Initialization Error:', err.message);
    }
} else {
    console.log('⚠️ [GCS] GCP_KEY_FILE_PATH not found or file does not exist. GCS will not be active.');
}

/**
 * Uploads a file to the client's folder in the bucket
 * @param {string} clientId 
 * @param {string} fileName 
 * @param {Buffer|string} fileContent - Buffer or path to local file
 */
async function uploadToBucket(clientId, fileName, fileContent) {
    if (!bucket) {
        console.log('🚫 [GCS] Bucket not active. Skipping upload.');
        return null;
    }
    
    const destFileName = `${clientId}/${fileName}`;
    const file = bucket.file(destFileName);

    try {
        // If fileContent is a string, assume it's a file path
        if (typeof fileContent === 'string' && fs.existsSync(fileContent)) {
            await bucket.upload(fileContent, {
                destination: destFileName,
            });
        } else {
            // Assume it's a Buffer or direct content
            await file.save(fileContent);
        }
        
        console.log(`✅ [GCS] File uploaded to: ${destFileName}`);
        return `https://storage.googleapis.com/${bucketName}/${destFileName}`;
    } catch (err) {
        console.error(`❌ [GCS] Upload Error for ${fileName}:`, err.message);
        throw err;
    }
}

/**
 * Deletes a file from the bucket
 */
async function deleteFromBucket(clientId, fileName) {
    if (!bucket) return;
    try {
        const destFileName = `${clientId}/${fileName}`;
        await bucket.file(destFileName).delete();
        console.log(`🗑️ [GCS] File deleted: ${destFileName}`);
    } catch (err) {
        console.error(`❌ [GCS] Delete Error:`, err.message);
    }
}

module.exports = {
    uploadToBucket,
    deleteFromBucket,
    isGcsActive: !!bucket
};
