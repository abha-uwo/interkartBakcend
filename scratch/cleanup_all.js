const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { Client, Ticket, Chat, OTP, isLocal } = require('../database');

async function cleanData() {
    try {
        console.log(`Starting cleanup in ${isLocal ? 'LOCAL (JSON)' : 'LIVE (MongoDB)'} mode...`);

        const adminEmail = 'admin@uwo24.com';

        // 1. Clear Database
        const clientResult = await Client.deleteMany({ email: { $ne: adminEmail } });
        console.log(`🗑️ Deleted ${clientResult.deletedCount || 'all'} clients (except admin).`);

        const ticketResult = await Ticket.deleteMany({});
        console.log(`🗑️ Deleted ${ticketResult.deletedCount || 'all'} tickets.`);

        const chatResult = await Chat.deleteMany({});
        console.log(`🗑️ Deleted ${chatResult.deletedCount || 'all'} chats.`);

        const otpResult = await OTP.deleteMany({});
        console.log(`🗑️ Deleted OTPs.`);

        // 2. Clear Filesystem Folders
        const dirsToClean = [
            path.join(__dirname, '..', 'uploads'),
            path.join(__dirname, '..', 'knowledge_base')
        ];

        dirsToClean.forEach(baseDir => {
            if (fs.existsSync(baseDir)) {
                const subdirs = fs.readdirSync(baseDir);
                subdirs.forEach(subdir => {
                    const fullPath = path.join(baseDir, subdir);
                    if (fs.lstatSync(fullPath).isDirectory()) {
                        fs.rmSync(fullPath, { recursive: true, force: true });
                        console.log(`📁 Deleted directory: ${fullPath}`);
                    }
                });
            }
        });

        console.log('✨ Cleanup complete. All data except admin has been removed.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error during cleanup:', err.message);
        process.exit(1);
    }
}

cleanData();
