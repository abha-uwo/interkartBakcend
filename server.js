require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const OpenAI = require('openai');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../wabot-f')));

// Interakt API Configuration
const INTERAKT_API_KEY = process.env.INTERAKT_API_KEY || 'your_interakt_api_key_here';
const INTERAKT_BASE_URL = 'https://api.interakt.ai/v1/public';

// OpenAI Configuration
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Initialize RAG system
const SimpleRAG = require('./rag');
const rag = new SimpleRAG(openai);

// Get AI response from OpenAI
async function getAIResponse(userMessage) {
    try {
        // 1. Retrieve context from RAG
        const context = await rag.search(userMessage);

        // 2. Build the strict RAG system prompt
        let systemPrompt = `You are an AI assistant for AI-MALL and AISA.
CRITICAL INSTRUCTION: You must ONLY answer questions based on the provided BUSINESS CONTEXT below.
If the user asks a question that is not explicitly answered by the provided context, you MUST refuse to answer and say: "I apologize, but I only have information regarding AI-MALL and AISA documentation. For other inquiries, please contact our team."
Do NOT use your general internet knowledge to answer questions.
If someone just says "hi" or greets you, you may greet them back warmly and ask how you can help them with AI-MALL or AISA.
Keep your replies friendly and concise.`;

        // 3. Inject context
        if (context) {
            systemPrompt += `\n\n--- BUSINESS CONTEXT ---\n${context}`;
        } else {
            systemPrompt += `\n\n--- BUSINESS CONTEXT ---\n[No relevant documentation found for this query.]`;
        }

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: systemPrompt
                },
                {
                    role: 'user',
                    content: userMessage
                }
            ],
            max_tokens: 300,
            temperature: 0.7
        });

        return completion.choices[0].message.content;
    } catch (error) {
        console.error('OpenAI Error:', error.message);
        return 'Sorry, I am unable to process your request right now. Please try again later or type "AGENT" to connect with a human.';
    }
}

// Helper function to send WhatsApp message via Interakt
async function sendWhatsAppMessage(phoneNumber, message) {
    try {
        const response = await axios.post(
            `${INTERAKT_BASE_URL}/message/`,
            {
                countryCode: '+91',
                phoneNumber: phoneNumber.replace(/^\+91/, ''),
                type: 'Text',
                data: {
                    message: message
                }
            },
            {
                headers: {
                    'Authorization': `Basic ${INTERAKT_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        console.log(`Message sent successfully to ${phoneNumber}`);
        return response.data;
    } catch (error) {
        console.error('Error sending message:', error.response ? error.response.data : error.message);
    }
}

// Webhook endpoint to receive messages from Interakt
app.post('/webhook/interakt', async (req, res) => {
    console.log('=== WEBHOOK RECEIVED ===');
    console.log(JSON.stringify(req.body, null, 2));

    try {
        const body = req.body;
        const data = body.data || body;

        let incomingMessage = '';
        let senderPhone = '';
        let isCustomerMessage = false;

        // Check if this is a customer message (not a bot/agent sent message)
        if (data.chat_message_type === 'CustomerMessage' || body.type === 'message_received') {
            isCustomerMessage = true;
        }

        // Extract message text - Interakt puts text in data.message.message
        if (data.message) {
            if (typeof data.message === 'string') {
                incomingMessage = data.message;
            } else if (data.message.message) {
                incomingMessage = data.message.message;
            } else if (data.message.text) {
                incomingMessage = data.message.text;
            }
        }

        // Extract sender phone number
        if (data.customer && data.customer.phone_number) {
            senderPhone = data.customer.phone_number;
        }

        console.log(`=== PARSED: isCustomer=${isCustomerMessage}, phone=${senderPhone}, msg="${incomingMessage}" ===`);

        if (isCustomerMessage && senderPhone && incomingMessage) {
            console.log(`Processing message from ${senderPhone}: ${incomingMessage}`);

            // Get AI-powered response from OpenAI
            const replyText = await getAIResponse(incomingMessage);
            console.log(`AI Reply: ${replyText}`);

            // Send the reply via Interakt
            await sendWhatsAppMessage(senderPhone, replyText);
        } else {
            console.log('Skipped: Not a customer message or missing data.');
        }

        res.status(200).send('Webhook processed');
    } catch (error) {
        console.error('Webhook processing error:', error);
        res.status(500).send('Internal Server Error');
    }
});

// API endpoint to update config from frontend
app.post('/api/config', (req, res) => {
    const { apiKey, autoReplyRules } = req.body;
    console.log('Updated config:', req.body);
    res.json({ success: true, message: 'Configuration saved successfully!' });
});

app.listen(PORT, async () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`Webhook URL for Interakt: http://<your_domain>/webhook/interakt`);
    console.log(`OpenAI Integration: ${process.env.OPENAI_API_KEY ? 'ACTIVE' : 'NOT CONFIGURED'}`);
    
    // Initialize RAG on startup
    if (process.env.OPENAI_API_KEY) {
        await rag.init();
    }
});
