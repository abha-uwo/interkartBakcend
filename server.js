require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const cors = require('cors');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- MONGODB CONNECTION ---
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB Connection Error:', err));

// --- EMAIL TRANSPORTER ---
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    family: 4, // Force IPv4
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    tls: {
        rejectUnauthorized: false,
        minVersion: 'TLSv1.2'
    },
    connectionTimeout: 20000,
    greetingTimeout: 20000,
    socketTimeout: 20000,
    logger: true,
    debug: true
});

// Verify transporter
transporter.verify((error, success) => {
    if (error) {
        console.error('❌ Email Transporter Error:', error.message);
    } else {
        console.log('✅ Email Transporter is ready');
    }
});

// --- SCHEMAS & MODELS ---

const ClientSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, default: 'client' },
    status: { type: String, default: 'pending' },
    whatsappNumber: { type: String, default: '' },
    apiKey: { type: String, default: '' },
    logoUrl: { type: String, default: '' },
    botEnabled: { type: Boolean, default: false },
    autoReplyRules: { type: String, default: '' },
    documents: [String],
    createdAt: { type: Date, default: Date.now }
});
const Client = mongoose.model('Client', ClientSchema);

const TicketSchema = new mongoose.Schema({
    clientId: String,
    clientName: String,
    status: { type: String, default: 'open' },
    messages: [{
        sender: String,
        text: String,
        timestamp: { type: Date, default: Date.now }
    }],
    lastUpdate: { type: Date, default: Date.now }
});
const Ticket = mongoose.model('Ticket', TicketSchema);

const ChatSchema = new mongoose.Schema({
    clientId: String,
    customerPhone: String,
    messages: [{
        sender: String,
        text: String,
        timestamp: { type: Date, default: Date.now }
    }],
    lastUpdate: { type: Date, default: Date.now }
});
const Chat = mongoose.model('Chat', ChatSchema);

// Store temporary OTPs (In-memory for now)
const tempOTPs = new Map();

// --- AUTH API ---

app.post('/api/auth/send-otp', async (req, res) => {
    const { email } = req.body;
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    tempOTPs.set(email, otp);

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Your Verification Code - Whatsabot',
        text: `Your OTP for registration is: ${otp}. This code is valid for 10 minutes.`,
        html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                <h2 style="color: #6366f1;">Welcome to Whatsabot!</h2>
                <p>Use the following code to complete your registration:</p>
                <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; font-size: 24px; font-weight: bold; letter-spacing: 5px; text-align: center; margin: 20px 0;">
                    ${otp}
                </div>
                <p style="font-size: 0.875rem; color: #666;">If you didn't request this, please ignore this email.</p>
            </div>
        `
    };

    try {
        console.log(`Attempting to send OTP to ${email}...`);
        await transporter.sendMail(mailOptions);
        console.log(`✅ OTP successfully sent to ${email}`);
        res.json({ success: true });
    } catch (err) {
        console.error('❌ Email Sending Error:', err.message);
        res.status(500).json({ error: 'Failed to send email. Check your EMAIL_USER and EMAIL_PASS on Render.' });
    }
});

app.post('/api/auth/register', async (req, res) => {
    const { name, email, password, otp } = req.body;
    const savedOtp = tempOTPs.get(email);

    if (!savedOtp || otp !== savedOtp) {
        return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    try {
        const client = new Client({ name, email, password });
        await client.save();
        tempOTPs.delete(email); // Clear OTP after success
        res.json({ success: true });
    } catch (err) {
        res.status(400).json({ error: 'Email already exists' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    
    if (email === 'admin@uwo24.com' && password === 'Admin@24') {
        return res.json({ id: 'admin_id', name: 'Master Admin', role: 'admin' });
    }

    const client = await Client.findOne({ email, password });
    if (client) {
        if (client.status !== 'approved') return res.status(403).json({ error: 'Account pending approval' });
        res.json({ id: client._id, name: client.name, role: 'client' });
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

// --- CLIENT API ---

app.get('/api/client/:id', async (req, res) => {
    try {
        const client = await Client.findById(req.params.id);
        res.json(client);
    } catch (err) {
        res.status(404).json({ error: 'Client not found' });
    }
});

app.post('/api/client/:id/config', async (req, res) => {
    const { whatsappNumber, apiKey } = req.body;
    try {
        await Client.findByIdAndUpdate(req.params.id, { whatsappNumber, apiKey });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Update failed' });
    }
});

app.post('/api/client/:id/toggle-bot', async (req, res) => {
    const { enabled } = req.body;
    try {
        await Client.findByIdAndUpdate(req.params.id, { botEnabled: enabled });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Toggle failed' });
    }
});

// --- CHATS & WEBHOOK ---

app.get('/api/client/:id/chats', async (req, res) => {
    const chats = await Chat.find({ clientId: req.params.id });
    const formatted = {};
    chats.forEach(c => {
        formatted[c.customerPhone] = c.messages;
    });
    res.json(formatted);
});

async function saveChatMessage(clientId, customerPhone, sender, text) {
    let chat = await Chat.findOne({ clientId, customerPhone });
    if (!chat) {
        chat = new Chat({ clientId, customerPhone, messages: [] });
    }
    chat.messages.push({ sender, text });
    chat.lastUpdate = Date.now();
    await chat.save();
}

app.post('/webhook/interakt/:clientId', async (req, res) => {
    const { clientId } = req.params;
    const data = req.body.data;
    
    try {
        const client = await Client.findById(clientId);
        if (!client || !client.botEnabled) return res.sendStatus(200);

        if (data && data.message && data.message.type === 'Text') {
            const incomingMessage = data.message.textContent;
            let senderPhone = null;
            if (data.customer && data.customer.phone_number) senderPhone = data.customer.phone_number;

            if (senderPhone && incomingMessage) {
                await saveChatMessage(clientId, senderPhone, 'customer', incomingMessage);
                
                const replyText = await getAIResponse(clientId, incomingMessage, client.autoReplyRules);
                
                await saveChatMessage(clientId, senderPhone, 'bot', replyText);
                await sendWhatsAppMessage(senderPhone, replyText, client.apiKey);
            }
        }
    } catch (err) { console.error('Webhook Error:', err); }
    res.sendStatus(200);
});

// --- ADMIN API ---

app.get('/api/admin/clients', async (req, res) => {
    const clients = await Client.find();
    res.json(clients.map(c => ({
        id: c._id,
        name: c.name,
        email: c.email,
        status: c.status,
        whatsappNumber: c.whatsappNumber,
        documentCount: c.documents.length,
        createdAt: c.createdAt
    })));
});

app.post('/api/admin/clients/:id/approve', async (req, res) => {
    await Client.findByIdAndUpdate(req.params.id, { status: 'approved' });
    res.json({ success: true });
});

app.delete('/api/admin/clients/:id', async (req, res) => {
    await Client.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

// --- SUPPORT API ---

app.post('/api/support/send', async (req, res) => {
    const { clientId, clientName, message } = req.body;
    let ticket = await Ticket.findOne({ clientId, status: 'open' });
    if (!ticket) {
        ticket = new Ticket({ clientId, clientName, messages: [] });
    }
    ticket.messages.push({ sender: 'client', text: message });
    ticket.lastUpdate = Date.now();
    await ticket.save();
    res.json({ success: true });
});

app.get('/api/admin/support/tickets', async (req, res) => {
    const tickets = await Ticket.find({ status: 'open' });
    res.json(tickets);
});

app.post('/api/support/reply', async (req, res) => {
    const { clientId, text } = req.body;
    const ticket = await Ticket.findOne({ clientId, status: 'open' });
    if (ticket) {
        ticket.messages.push({ sender: 'admin', text });
        ticket.lastUpdate = Date.now();
        await ticket.save();
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Ticket not found' });
    }
});

app.delete('/api/support/tickets/:clientId', async (req, res) => {
    await Ticket.deleteOne({ clientId: req.params.clientId });
    res.json({ success: true });
});

// --- AI LOGIC ---

async function getAIResponse(clientId, message, rules) {
    try {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-3.5-turbo',
            messages: [
                { role: 'system', content: `You are a helpful customer service bot. Rules: ${rules}` },
                { role: 'user', content: message }
            ]
        }, {
            headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` }
        });
        return response.data.choices[0].message.content;
    } catch (err) {
        return "I am currently processing your request. Please wait.";
    }
}

async function sendWhatsAppMessage(phone, text, apiKey) {
    try {
        await axios.post('https://api.interakt.ai/v1/public/message/', {
            fullPhoneNumber: phone,
            type: 'Text',
            text: text
        }, {
            headers: { 'Authorization': `Basic ${apiKey}` }
        });
    } catch (err) { console.error('Error sending WhatsApp:', err.response?.data || err.message); }
}

// --- FILE UPLOADS ---

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const clientId = req.params.id;
        const dir = path.join(__dirname, 'uploads', clientId);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage });
app.post('/api/client/:id/upload', upload.single('file'), async (req, res) => {
    const client = await Client.findById(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    
    client.documents.push(req.file.filename);
    await client.save();
    res.json({ success: true });
});

app.delete('/api/client/:id/documents/:filename', async (req, res) => {
    const { id, filename } = req.params;
    const client = await Client.findById(id);
    client.documents = client.documents.filter(d => d !== filename);
    await client.save();
    
    const filePath = path.join(__dirname, 'uploads', id, filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.json({ success: true });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
