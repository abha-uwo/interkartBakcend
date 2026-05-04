const { PDFParse } = require('pdf-parse');
async function test() {
    try {
        const pdf = new PDFParse();
        console.log('PDFParse instance created');
        console.log('Methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(pdf)));
    } catch (e) {
        console.log('Error:', e.message);
    }
}
test();
