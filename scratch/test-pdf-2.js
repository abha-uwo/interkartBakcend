const { PDFParse } = require('pdf-parse');
console.log('PDFParse type:', typeof PDFParse);
try {
    const p = new PDFParse();
    console.log('PDFParse instance keys:', Object.keys(p));
    console.log('PDFParse prototype keys:', Object.keys(Object.getPrototypeOf(p)));
} catch (e) {
    console.log('Error creating instance:', e.message);
}
