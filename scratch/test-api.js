const axios = require('axios');
async function test() {
    try {
        const res = await axios.get('http://localhost:3000/api/admin/support/tickets');
        console.log('Status:', res.status);
        console.log('Data:', res.data);
    } catch (err) {
        console.log('Error:', err.message);
    }
}
test();
