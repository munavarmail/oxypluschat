const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// ===== PASTE YOUR CREDENTIALS HERE =====
const PORT = 3000;
const VERIFY_TOKEN = 'oxyplusbot_2030';
const GRAPH_API_TOKEN = 'EAASQlOvZAJ3gBPu2EcRJv8X0toyE6i2iuYv9cpANEzELU7EJgEsCBjV1tUlHd0n3WtGpM1obXaKoYL5Q4AEzF8NnIUm9CyfmDbhVn2HUSn6EH0lswA8aZC09QMDEZBHDsgZCbOiPaFAcRPMdqNc3aRHBZBb2IG2yIxaBgfGSZAcujy2Vrs6WOjAHAHew83vHBZA0Wc83cHeEZBUdE5IAEgmcZCAkQ3ytDsVA2eHdThuE5
';  // ? REPLACE THIS
const PHONE_NUMBER_ID = '755591667635998';
// ========================================

// Simple homepage
app.get('/', (req, res) => {
    res.send(`
        <html>
            <head><title>WhatsApp Bot</title></head>
            <body style="font-family: Arial; padding: 40px; text-align: center;">
                <h1>? WhatsApp Bot is Running!</h1>
                <p>Server is active and ready to receive messages</p>
                <p><strong>Port:</strong> ${PORT}</p>
                <p><strong>Token Set:</strong> ${GRAPH_API_TOKEN !== 'EAASQlOvZAJ3gBPu2EcRJv8X0toyE6i2iuYv9cpANEzELU7EJgEsCBjV1tUlHd0n3WtGpM1obXaKoYL5Q4AEzF8NnIUm9CyfmDbhVn2HUSn6EH0lswA8aZC09QMDEZBHDsgZCbOiPaFAcRPMdqNc3aRHBZBb2IG2yIxaBgfGSZAcujy2Vrs6WOjAHAHew83vHBZA0Wc83cHeEZBUdE5IAEgmcZCAkQ3ytDsVA2eHdThuE5
' ? '? Yes' : '? No - Update token!'}</p>
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
    // Check if token is set
    if (GRAPH_API_TOKEN === 'PASTE_YOUR_TOKEN_HERE') {
        console.error('? ERROR: GRAPH_API_TOKEN not set! Please update the token at the top of bot.js');
        return;
    }
    
    try {
        const response = await axios.post(
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
        return response.data;
    } catch (error) {
        console.error('? Error sending message:', error.response?.data || error.message);
        
        // Show helpful error messages
        if (error.response?.data?.error?.code === 190) {
            console.error('');
            console.error('?? TOKEN ERROR: Your access token is invalid or expired!');
            console.error('?? Get a new token from: https://developers.facebook.com/apps/1284869193279352/whatsapp-business/wa-dev-console/');
            console.error('');
        }
    }
}

// Start server
app.listen(PORT, () => {
    console.log('');
    console.log('?? ================================');
    console.log('   Simple WhatsApp Bot Started!');
    console.log('?? ================================');
    console.log('');
    console.log(`?? Server running on port ${PORT}`);
    console.log(`?? Visit: http://localhost:${PORT}`);
    console.log('');
    
    // Check if token is set
    if (GRAPH_API_TOKEN === 'PASTE_YOUR_TOKEN_HERE') {
        console.log('??  WARNING: Token not set!');
        console.log('?? Please edit bot.js and add your GRAPH_API_TOKEN');
        console.log('');
    } else {
        console.log('? Token configured');
        console.log(`?? Phone Number ID: ${PHONE_NUMBER_ID}`);
        console.log(`?? Verify Token: ${VERIFY_TOKEN}`);
        console.log('');
        console.log('? Ready to receive messages!');
    }
    console.log('');
});