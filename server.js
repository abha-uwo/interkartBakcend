require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Interakt API Configuration
const INTERAKT_API_KEY = process.env.INTERAKT_API_KEY || 'your_interakt_api_key_here';
const INTERAKT_BASE_URL = 'https://api.interakt.ai/v1/public';

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
            const incomingMessage = data.message.text ? data.message.text.toLowerCase() : '';
            const senderPhone = data.customer ? data.customer.phone_number : null;

            if (senderPhone) {
                // Auto-reply logic
                let replyText = 'Hello! Thank you for reaching out to us. We will get back to you shortly.';
                
                if (incomingMessage.includes('hello') || incomingMessage.includes('hi')) {
                    replyText = 'Hi there! How can I assist you today?';
                } else if (incomingMessage.includes('pricing')) {
                    replyText = 'Our pricing starts at $9.99/month. Reply with "DETAILS" for more info.';
                } else if (incomingMessage.includes('support')) {
                    replyText = 'Please describe your issue, and our support team will review it.';
                }

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
});
