const { Client, OTP, isLocal } = require('../database');
require('dotenv').config();

async function test() {
    console.log('Is Local:', isLocal);
    try {
        console.log('Testing OTP.findOneAndUpdate...');
        const res = await OTP.findOneAndUpdate({ email: 'test@example.com' }, { otp: '123456', createdAt: new Date() }, { upsert: true });
        console.log('OTP Result:', res);

        console.log('Testing Client.new...');
        const client = Client.new({ name: 'Test', email: 'test@example.com', password: 'password' });
        await client.save();
        console.log('Client saved.');

        process.exit(0);
    } catch (err) {
        console.error('Test Failed:', err);
        process.exit(1);
    }
}

test();
