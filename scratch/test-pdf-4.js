const { PDFParse } = require('pdf-parse/node');
console.log('PDFParse from node:', typeof PDFParse);
async function test() {
    try {
        const pdf = new PDFParse();
        console.log('Success');
    } catch (e) {
        console.log('Error:', e.message);
    }
}
test();
