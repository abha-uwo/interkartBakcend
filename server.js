require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const OpenAI = require('openai');
const fs = require('fs');
const multer = require('multer');
const nodemailer = require('nodemailer');

// Configure Email Transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../wabot-f')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const CLIENTS_FILE = path.join(__dirname, 'clients.json');
const TICKETS_FILE = path.join(__dirname, 'tickets.json');

// Multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const clientId = req.params.id;
        console.log(`[Multer] Upload request for client: ${clientId}, field: ${file.fieldname}`);
        let dir = '';
        if (file.fieldname === 'logo') {
            dir = path.join(__dirname, 'uploads', 'logos');
        } else {
            dir = path.join(__dirname, 'knowledge_base', clientId);
        }
        if (!fs.existsSync(dir)) {
            console.log(`[Multer] Creating directory: ${dir}`);
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const clientId = req.params.id;
        const ext = path.extname(file.originalname);
        const filename = file.fieldname === 'logo' ? `${clientId}${ext}` : file.originalname;
        console.log(`[Multer] Saving file: ${filename}`);
        cb(null, filename);
    }
});
const upload = multer({ storage });

// Helper to read clients
const readClients = () => {
    try {
        if (!fs.existsSync(CLIENTS_FILE)) return [];
        const data = fs.readFileSync(CLIENTS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        return [];
    }
};

// Helper to write clients
const writeClients = (clients) => {
    fs.writeFileSync(CLIENTS_FILE, JSON.stringify(clients, null, 2));
};

// Helper for tickets
const readTickets = () => {
    try {
        if (!fs.existsSync(TICKETS_FILE)) return [];
        return JSON.parse(fs.readFileSync(TICKETS_FILE, 'utf8'));
    } catch (err) { return []; }
};
const writeTickets = (tickets) => {
    fs.writeFileSync(TICKETS_FILE, JSON.stringify(tickets, null, 2));
};

// --- SUPPORT API ---

app.post('/api/support/send', (req, res) => {
    const { clientId, clientName, message } = req.body;
    if (!clientId || !message) return res.status(400).json({ error: 'Missing data' });

    const tickets = readTickets();
    let ticket = tickets.find(t => t.clientId === clientId && t.status === 'open');

    if (!ticket) {
        ticket = {
            id: 't_' + Math.random().toString(36).substr(2, 9),
            clientId,
            clientName,
            status: 'open',
            messages: [],
            lastUpdate: new Date().toISOString()
        };
        tickets.push(ticket);
    }

    ticket.messages.push({
        sender: 'client',
        text: message,
        timestamp: new Date().toISOString()
    });
    ticket.lastUpdate = new Date().toISOString();

    writeTickets(tickets);
    res.json({ success: true, ticket });
});

app.get('/api/admin/support/tickets', (req, res) => {
    res.json(readTickets());
});

app.post('/api/admin/support/reply', (req, res) => {
    const { ticketId, message } = req.body;
    const tickets = readTickets();
    const index = tickets.findIndex(t => t.id === ticketId);

    if (index === -1) return res.status(404).json({ error: 'Ticket not found' });

    tickets[index].messages.push({
        sender: 'admin',
        text: message,
        timestamp: new Date().toISOString()
    });
    tickets[index].lastUpdate = new Date().toISOString();

    writeTickets(tickets);
    res.json({ success: true });
});

app.get('/api/client/:id/support', (req, res) => {
    const tickets = readTickets();
    const ticket = tickets.find(t => t.clientId === req.params.id && t.status === 'open');
    res.json(ticket || { messages: [] });
});

// Interakt API Configuration
const INTERAKT_BASE_URL = 'https://api.interakt.ai/v1/public';

// OpenAI Configuration
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Initialize RAG system
const SimpleRAG = require('./rag');
const rag = new SimpleRAG(openai);

// Get AI response from OpenAI
async function getAIResponse(clientId, userMessage, clientRules = []) {
    try {
        if (clientRules && clientRules.length > 0) {
            const matchedRule = clientRules.find(rule => 
                rule.keyword.toLowerCase().split(',').some(k => userMessage.toLowerCase().includes(k.trim()))
            );
            if (matchedRule) return matchedRule.reply;
        }

        const context = await rag.search(clientId, userMessage);

        let systemPrompt = `Your name is AISA. You are the elite, highly persuasive, and charismatic AI Super Assistant and sales executive for AI-MALL and UWO.
Your goal is to make every customer feel valued and deeply excited about our products. Use persuasive language, highlight massive value, and speak with confidence and warmth. Make your answers highly attractive and sales-oriented.
CRITICAL INSTRUCTION: You must ONLY answer questions based on the provided BUSINESS CONTEXT below.
If the user asks a question that is not explicitly answered by the provided context, you MUST gracefully pivot and say: "While I'd love to help with that, my expertise is strictly focused on helping you scale with AI-MALL and AISA. How can I help you revolutionize your workflow today?"
Do NOT use your general internet knowledge to answer questions.
If someone just says "hi" or greets you, greet them back with massive enthusiasm and offer to show them how AISA can transform their business.
Always reply in the exact same language that the user used to speak to you.
Keep your replies incredibly friendly, highly engaging, and concise (under 200 words). Use emojis to build rapport!`;

        if (context) {
            systemPrompt += `\n\n--- BUSINESS CONTEXT ---\n${context}`;
        } else {
            systemPrompt += `\n\n--- BUSINESS CONTEXT ---\n[No relevant documentation found for this query.]`;
        }

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage }
            ],
            max_tokens: 300,
            temperature: 0.7
        });

        return completion.choices[0].message.content;
    } catch (error) {
        console.error('OpenAI Error:', error.message);
        return 'Sorry, I am unable to process your request right now.';
    }
}

async function sendWhatsAppMessage(phoneNumber, message, apiKey) {
    try {
        const response = await axios.post(
            `${INTERAKT_BASE_URL}/message/`,
            {
                countryCode: '+91',
                phoneNumber: phoneNumber.replace(/^\+91/, ''),
                type: 'Text',
                data: { message: message }
            },
            {
                headers: {
                    'Authorization': `Basic ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        return response.data;
    } catch (error) {
        console.error('Error sending message:', error.response ? error.response.data : error.message);
    }
}

// --- AUTH API ---

const otpStore = {}; // Temporary store for OTPs

app.post('/api/auth/send-otp', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore[email] = { otp, expires: Date.now() + 600000 };

    console.log(`\n[OTP] Code for ${email}: ${otp}\n`);

    try {
        if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
            await transporter.sendMail({
                from: `"Whatsabot Support" <${process.env.EMAIL_USER}>`,
                to: email,
                subject: "Your Verification Code",
                text: `Your OTP for Whatsabot registration is: ${otp}. Valid for 10 minutes.`,
                html: `<b>Your OTP for Whatsabot registration is: <span style="font-size: 24px; color: #4f46e5;">${otp}</span></b><p>Valid for 10 minutes.</p>`
            });
            res.json({ success: true, message: 'OTP sent to your email' });
        } else {
            res.json({ success: true, message: 'OTP sent (Check terminal for now)' });
        }
    } catch (err) {
        console.error('Email error:', err.message);
        res.json({ success: true, message: 'OTP sent (Check terminal, email failed)' });
    }
});

app.post('/api/auth/register', (req, res) => {
    const { name, email, password, otp } = req.body;
    if (!name || !email || !password || !otp) return res.status(400).json({ error: 'All fields and OTP required' });

    if (!otpStore[email] || otpStore[email].otp !== otp) {
        return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    const clients = readClients();
    if (clients.find(c => c.email === email)) return res.status(400).json({ error: 'Email already exists' });

    const newClient = {
        id: 'cli_' + Math.random().toString(36).substr(2, 9),
        name,
        email,
        password,
        whatsappNumber: '',
        apiKey: '',
        autoReplyRules: [],
        status: 'pending',
        botEnabled: false,
        logoUrl: '',
        createdAt: new Date().toISOString()
    };
    clients.push(newClient);
    writeClients(clients);
    delete otpStore[email];
    res.status(201).json({ success: true, message: 'Registration successful! Wait for admin approval.' });
});

// ... (other endpoints)

app.post('/api/client/:id/upload-logo', upload.single('logo'), (req, res) => {
    const clientId = req.params.id;
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const clients = readClients();
    const index = clients.findIndex(c => c.id === clientId);
    if (index === -1) return res.status(404).json({ error: 'Client not found' });

    const logoUrl = `/uploads/logos/${req.file.filename}`;
    clients[index].logoUrl = logoUrl;
    writeClients(clients);

    res.json({ success: true, logoUrl });
});

app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    
    // Check for Master Admin
    if (email === 'admin@uwo24.com' && password === 'Admin@24') {
        return res.json({ id: 'admin', name: 'Master Admin', role: 'admin' });
    }

    const clients = readClients();
    const client = clients.find(c => c.email === email && c.password === password);

    if (!client) return res.status(401).json({ error: 'Invalid credentials' });
    if (client.status !== 'approved') return res.status(403).json({ error: `Account ${client.status}. Please contact admin.` });

    res.json({ id: client.id, name: client.name, role: 'client' });
});

// --- ADMIN API ---

app.get('/api/admin/stats', (req, res) => {
    const clients = readClients();
    let totalDocs = 0;
    clients.forEach(c => {
        totalDocs += rag.getClientFiles(c.id).length;
    });

    res.json({
        totalClients: clients.length,
        totalDocs: totalDocs,
        pendingApprovals: clients.filter(c => c.status === 'pending').length,
        approvedClients: clients.filter(c => c.status === 'approved').length
    });
});

app.get('/api/admin/clients', (req, res) => {
    const clients = readClients();
    const enhancedClients = clients.map(c => ({
        ...c,
        documentCount: rag.getClientFiles(c.id).length,
        isBotActive: c.status === 'approved' && c.whatsappNumber && c.apiKey && c.botEnabled ? true : false
    }));
    res.json(enhancedClients);
});

app.delete('/api/admin/clients/:id', (req, res) => {
    let clients = readClients();
    const clientId = req.params.id;
    
    // Remove client knowledge base directory
    const kbPath = path.join(__dirname, 'knowledge_base', clientId);
    if (fs.existsSync(kbPath)) fs.rmSync(kbPath, { recursive: true, force: true });
    
    // Remove client from list
    clients = clients.filter(c => c.id !== clientId);
    writeClients(clients);
    
    res.json({ success: true, message: 'Client deleted successfully' });
});

app.post('/api/admin/clients/:id/approve', (req, res) => {
    const clients = readClients();
    const index = clients.findIndex(c => c.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Client not found' });

    clients[index].status = 'approved';
    writeClients(clients);
    res.json({ success: true });
});

app.post('/api/admin/clients/:id/reject', (req, res) => {
    const clients = readClients();
    const index = clients.findIndex(c => c.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Client not found' });

    clients[index].status = 'rejected';
    writeClients(clients);
    res.json({ success: true });
});

app.post('/api/admin/clients/create', (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'All fields are required' });

    const clients = readClients();
    if (clients.find(c => c.email === email)) return res.status(400).json({ error: 'Email already exists' });

    const clientId = 'cli_' + Math.random().toString(36).substr(2, 9);
    const newClient = {
        id: clientId,
        name,
        email,
        password,
        whatsappNumber: '',
        apiKey: '',
        autoReplyRules: [],
        status: 'approved',
        botEnabled: false,
        logoUrl: '',
        createdAt: new Date().toISOString()
    };
    
    clients.push(newClient);
    writeClients(clients);

    // Create KB dir
    const kbPath = path.join(__dirname, 'knowledge_base', clientId);
    if (!fs.existsSync(kbPath)) fs.mkdirSync(kbPath, { recursive: true });

    res.status(201).json({ success: true, client: newClient });
});

// --- CLIENT API ---

app.get('/api/client/:id', (req, res) => {
    const clients = readClients();
    const client = clients.find(c => c.id === req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    
    const { password, ...safeClient } = client;
    res.json({ 
        ...safeClient, 
        documents: rag.getClientFiles(client.id) 
    });
});

app.post('/api/client/:id/config', (req, res) => {
    const { apiKey, autoReplyRules, whatsappNumber } = req.body;
    const clients = readClients();
    const index = clients.findIndex(c => c.id === req.params.id);
    
    if (index === -1) return res.status(404).json({ error: 'Client not found' });

    clients[index].apiKey = apiKey || clients[index].apiKey;
    clients[index].autoReplyRules = autoReplyRules || clients[index].autoReplyRules;
    clients[index].whatsappNumber = whatsappNumber || clients[index].whatsappNumber;
    
    writeClients(clients);
    res.json({ success: true, message: 'Settings saved!' });
});

app.post('/api/client/:id/toggle-bot', (req, res) => {
    const { enabled } = req.body;
    const clients = readClients();
    const index = clients.findIndex(c => c.id === req.params.id);
    
    if (index === -1) return res.status(404).json({ error: 'Client not found' });
    
    const client = clients[index];
    if (enabled && (!client.whatsappNumber || !client.apiKey)) {
        return res.status(400).json({ error: 'Setup incomplete. Add WhatsApp number and API key first.' });
    }

    clients[index].botEnabled = enabled;
    writeClients(clients);
    res.json({ success: true, botEnabled: enabled });
});

app.post('/api/client/:id/update-profile', (req, res) => {
    const { name } = req.body;
    const clients = readClients();
    const index = clients.findIndex(c => c.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Client not found' });

    clients[index].name = name || clients[index].name;
    writeClients(clients);
    res.json({ success: true, name: clients[index].name });
});

app.post('/api/client/:id/delete-whatsapp', (req, res) => {
    const clients = readClients();
    const index = clients.findIndex(c => c.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Client not found' });

    clients[index].whatsappNumber = '';
    clients[index].botEnabled = false; // Disable bot if number is removed
    writeClients(clients);
    res.json({ success: true });
});

app.post('/api/client/:id/deactivate', (req, res) => {
    const clients = readClients();
    const index = clients.findIndex(c => c.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Client not found' });

    clients[index].status = 'deactivated';
    clients[index].botEnabled = false;
    writeClients(clients);
    res.json({ success: true });
});

// RAG Document Management
app.post('/api/client/:id/upload', upload.single('file'), async (req, res) => {
    try {
        const clientId = req.params.id;
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        await rag.loadClientKnowledge(clientId);
        res.json({ success: true, filename: req.file.originalname });
    } catch (error) {
        console.error('Upload Error:', error);
        res.status(500).json({ error: 'Failed to process document: ' + error.message });
    }
});

app.get('/api/client/:id/documents/:filename', (req, res) => {
    const { id, filename } = req.params;
    const filePath = path.join(__dirname, 'knowledge_base', id, filename);
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).json({ error: 'File not found' });
    }
});

app.delete('/api/client/:id/documents/:filename', async (req, res) => {
    const { id, filename } = req.params;
    await rag.deleteFile(id, filename);
    res.json({ success: true });
});

// Webhook
app.post('/webhook/interakt/:clientId', async (req, res) => {
    const { clientId } = req.params;
    const clients = readClients();
    const client = clients.find(c => c.id === clientId);

    if (!client || client.status !== 'approved' || !client.apiKey || !client.whatsappNumber || !client.botEnabled) {
        return res.status(403).send('Bot disabled or not configured');
    }

    try {
        const body = req.body;
        const data = body.data || body;
        let incomingMessage = '';
        let senderPhone = '';

        if (data.chat_message_type === 'CustomerMessage' || body.type === 'message_received') {
            if (data.message) {
                if (typeof data.message === 'string') incomingMessage = data.message;
                else incomingMessage = data.message.message || data.message.text;
            }
            if (data.customer && data.customer.phone_number) senderPhone = data.customer.phone_number;

            if (senderPhone && incomingMessage) {
                const replyText = await getAIResponse(clientId, incomingMessage, client.autoReplyRules);
                await sendWhatsAppMessage(senderPhone, replyText, client.apiKey);
            }
        }
        res.status(200).send('OK');
    } catch (error) {
        res.status(500).send('Error');
    }
});

app.listen(PORT, async () => {
    console.log(`Server running on http://localhost:${PORT}`);
    if (process.env.OPENAI_API_KEY) await rag.init();
});
