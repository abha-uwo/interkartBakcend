const axios = require('axios');
async function test() {
    try {
        const res = await axios.get('http://localhost:3000/api/admin/stats');
        console.log('Stats Status:', res.status);
        
        const res2 = await axios.get('http://localhost:3000/api/admin/support/tickets');
        console.log('Support Status:', res2.status);
    } catch (err) {
        console.log('Error:', err.message, err.response ? err.response.status : '');
    }
}
test();
