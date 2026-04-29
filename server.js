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
app.use(express.static(path.join(__dirname, '../frontend')));

// Interakt API Configuration
const INTERAKT_API_KEY = process.env.INTERAKT_API_KEY || 'your_interakt_api_key_here';
const INTERAKT_BASE_URL = 'https://api.interakt.ai/v1/public';

// OpenAI Configuration
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Get AI response from OpenAI
async function getAIResponse(userMessage) {
    try {
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: `You are a friendly and helpful WhatsApp business assistant. 
Keep your replies concise (under 200 words) since this is WhatsApp. 
Be polite, professional, and helpful. 
Use emojis occasionally to keep things friendly. 
If someone greets you, greet them back warmly.
If you don't know something, politely say so and offer to connect them with a human agent.`
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
                countryCode: '+91', // Defaulting to India, can be parsed from incoming
                phoneNumber: phoneNumber.replace(/^\+91/, ''), // Clean up +91 if present
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
    console.log('Received Webhook:', JSON.stringify(req.body, null, 2));

    try {
        const { type, data } = req.body;

        // Ensure this is an incoming message
        if (type === 'message_received' && data && data.message) {
            const incomingMessage = data.message.text ? data.message.text : '';
            const senderPhone = data.customer ? data.customer.phone_number : null;

            if (senderPhone && incomingMessage) {
                console.log(`Incoming message from ${senderPhone}: ${incomingMessage}`);

                // Get AI-powered response from OpenAI
                const replyText = await getAIResponse(incomingMessage);
                console.log(`AI Reply: ${replyText}`);

                // Send the reply
                await sendWhatsAppMessage(senderPhone, replyText);
            }
        }

        // Always respond with 200 OK to acknowledge receipt
        res.status(200).send('Webhook processed');
    } catch (error) {
        console.error('Webhook processing error:', error);
        res.status(500).send('Internal Server Error');
    }
});

// API endpoint to update config from frontend (mocked for simplicity)
app.post('/api/config', (req, res) => {
    const { apiKey, autoReplyRules } = req.body;
    // In a real app, you'd save this to a database
    console.log('Updated config:', req.body);
    res.json({ success: true, message: 'Configuration saved successfully!' });
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`Webhook URL for Interakt: http://<your_domain>/webhook/interakt`);
    console.log(`OpenAI Integration: ${process.env.OPENAI_API_KEY ? 'ACTIVE ✅' : 'NOT CONFIGURED ❌'}`);
});
