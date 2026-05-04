const axios = require('axios');
async function test() {
    try {
        const res = await axios.post('http://localhost:3000/api/admin/clients/create', {
            name: 'Test Client',
            email: 'test@example.com',
            password: 'password123'
        });
        console.log('Create Status:', res.status);
    } catch (err) {
        console.log('Error:', err.message, err.response ? err.response.status : '');
    }
}
test();
