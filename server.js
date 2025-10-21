require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// Configuration from .env file
const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const GRAPH_API_TOKEN = process.env.GRAPH_API_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// Simple homepage
app.get('/', (req, res) => {
    res.send(`
        <html>
            <head><title>WhatsApp Bot</title></head>
            <body style="font-family: Arial; padding: 40px; text-align: center;">
                <h1>? WhatsApp Bot is Running!</h1>
                <p>Server is active and ready to receive messages</p>
                <p><strong>Port:</strong> ${PORT}</p>
                <p><strong>Status:</strong> Online</p>
            </body>
        </html>
    `);
});

// Webhook verification (Meta will call this)
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('? Webhook verified successfully!');
        res.status(200).send(challenge);
    } else {
        console.log('? Webhook verification failed');
        res.sendStatus(403);
    }
});

// Receive messages from WhatsApp
app.post('/webhook', async (req, res) => {
    try {
        const body = req.body;
        
        if (body.object === 'whatsapp_business_account') {
            const changes = body.entry[0].changes[0];
            const message = changes.value.messages?.[0];
            
            if (message && message.text) {
                const from = message.from;
                const messageText = message.text.body;
                
                console.log(`?? Received: "${messageText}" from ${from}`);
                
                // Generate response based on message
                const response = generateResponse(messageText);
                
                // Send reply
                await sendMessage(from, response);
            }
        }
        
        res.sendStatus(200);
    } catch (error) {
        console.error('? Error:', error.message);
        res.sendStatus(500);
    }
});

// Generate bot response
function generateResponse(message) {
    const msg = message.toLowerCase();
    
    // Simple keyword matching
    if (msg.includes('hello') || msg.includes('hi') || msg.includes('hey')) {
        return '?? Hello! Welcome to our service. How can I help you today?';
    }
    
    if (msg.includes('help')) {
        return `?? Here's how I can help:

• Type "menu" - See our products
• Type "order" - Place an order
• Type "contact" - Get our contact info
• Type "help" - See this message`;
    }
    
    if (msg.includes('menu') || msg.includes('price')) {
        return `?? Our Menu:

1?? Water Bottle (500ml) - $1
2?? Water Bottle (1L) - $2
3?? Water Gallon (5L) - $5

Reply with the item number to order!`;
    }
    
    if (msg.includes('order')) {
        return '?? To place an order, please send:\nORDER [quantity] [item name]\n\nExample: ORDER 5 water bottles';
    }
    
    if (msg.includes('contact') || msg.includes('phone')) {
        return `?? Contact Us:
        
Phone: +971 50 123 4567
Email: info@yourcompany.com
Hours: 9 AM - 6 PM (Sun-Thu)`;
    }
    
    if (msg.includes('thanks') || msg.includes('thank you')) {
        return '?? You\'re welcome! Let me know if you need anything else.';
    }
    
    // Default response
    return `I received your message: "${message}"

Type "help" to see what I can do! ??`;
}

// Send message via WhatsApp API
async function sendMessage(to, text) {
    try {
        await axios.post(
            `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
            {
                messaging_product: 'whatsapp',
                to: to,
                text: { body: text }
            },
            {
                headers: {
                    'Authorization': `Bearer ${GRAPH_API_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        console.log('? Message sent successfully');
    } catch (error) {
        console.error('? Error sending message:', error.response?.data || error.message);
    }
}

// Start server
app.listen(PORT, () => {
    console.log('?? Simple WhatsApp Bot Started!');
    console.log(`?? Server running on port ${PORT}`);
    console.log(`?? Visit: http://localhost:${PORT}`);
    console.log('? Ready to receive messages!');
});