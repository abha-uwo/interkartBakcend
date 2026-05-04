const mongoose = require('mongoose');
require('dotenv').config();

async function cleanData() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // Get models (must match server.js)
        const Client = mongoose.model('Client', new mongoose.Schema({ email: String }));
        const Ticket = mongoose.model('Ticket', new mongoose.Schema({}));
        const Chat = mongoose.model('Chat', new mongoose.Schema({}));

        // Delete all except admin@uwo24.com
        const clientResult = await Client.deleteMany({ email: { $ne: 'admin@uwo24.com' } });
        console.log(`Deleted ${clientResult.deletedCount} clients (except admin).`);

        const ticketResult = await Ticket.deleteMany({});
        console.log(`Deleted ${ticketResult.deletedCount} tickets.`);

        const chatResult = await Chat.deleteMany({});
        console.log(`Deleted ${chatResult.deletedCount} chats.`);

        console.log('Cleanup complete.');
        process.exit(0);
    } catch (err) {
        console.error('Error during cleanup:', err);
        process.exit(1);
    }
}

cleanData();
