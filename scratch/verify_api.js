const axios = require('axios');

async function testApi() {
    try {
        console.log('--- Testing API Health ---');
        const ping = await axios.get('http://localhost:3000/ping');
        console.log('Ping:', ping.data);

        console.log('\n--- Testing Admin Stats ---');
        const stats = await axios.get('http://localhost:3000/api/admin/stats');
        console.log('Stats:', stats.data);

        console.log('\n--- Testing Admin Clients ---');
        const clients = await axios.get('http://localhost:3000/api/admin/clients');
        console.log('Clients Count:', clients.data.length);
        console.log('Sample Client:', clients.data[0]);

        console.log('\n--- Testing OTP Generation ---');
        const otp = await axios.post('http://localhost:3000/api/auth/send-otp', {
            email: 'verify-test@uwo24.com'
        });
        console.log('OTP Response:', otp.data);

    } catch (err) {
        console.error('Error:', err.response?.data || err.message);
    }
}

testApi();
