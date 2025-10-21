const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// ===== CREDENTIALS =====
const PORT = 3000;
const VERIFY_TOKEN = 'oxyplusbot_2030';
const GRAPH_API_TOKEN = 'EAASQlOvZAJ3gBPu2EcRJv8X0toyE6i2iuYv9cpANEzELU7EJgEsCBjV1tUlHd0n3WtGpM1obXaKoYL5Q4AEzF8NnIUm9CyfmDbhVn2HUSn6EH0lswA8aZC09QMDEZBHDsgZCbOiPaFAcRPMdqNc3aRHBZBb2IG2yIxaBgfGSZAcujy2Vrs6WOjAHAHew83vHBZA0Wc83cHeEZBUdE5IAEgmcZCAkQ3ytDsVA2eHdThuE5';
const PHONE_NUMBER_ID = '755591667635998';
// =======================

app.get('/', (req, res) => {
    res.send(`
        <html>
            <head><title>WhatsApp Bot</title></head>
            <body style="font-family: Arial; padding: 40px; text-align: center;">
                <h1>? WhatsApp Bot Running!</h1>
                <p><strong>Port:</strong> ${PORT}</p>
                <p><strong>Status:</strong> Online</p>
            </body>
        </html>
    `);
});

app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('? Webhook verified!');
        res.status(200).send(challenge);
    } else {
        console.log('? Verification failed');
        res.sendStatus(403);
    }
});

app.post('/webhook', async (req, res) => {
    try {
        const body = req.body;
        
        if (body.object === 'whatsapp_business_account') {
            const message = body.entry[0].changes[0].value.messages?.[0];
            
            if (message && message.text) {
                const from = message.from;
                const text = message.text.body;
                
                console.log(`?? Received: "${text}" from ${from}`);
                
                const response = generateResponse(text);
                await sendMessage(from, response);
            }
        }
        
        res.sendStatus(200);
    } catch (error) {
        console.error('? Error:', error.message);
        res.sendStatus(500);
    }
});

function generateResponse(message) {
    const msg = message.toLowerCase();
    
    if (msg.includes('hello') || msg.includes('hi')) {
        return '?? Hello! How can I help you?';
    }
    
    if (msg.includes('help')) {
        return '?? Commands:\n• menu - See products\n• order - Place order\n• contact - Contact info';
    }
    
    if (msg.includes('menu')) {
        return '?? Menu:\n1?? Water 500ml - $1\n2?? Water 1L - $2\n3?? Water 5L - $5';
    }
    
    if (msg.includes('contact')) {
        return '?? Contact:\nPhone: +971 50 123 4567\nEmail: info@company.com';
    }
    
    return `I received: "${message}"\n\nType "help" for commands! ??`;
}

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
        console.log('? Message sent!');
    } catch (error) {
        console.error('? Send error:', error.response?.data || error.message);
        if (error.response?.data?.error?.code === 190) {
            console.error('?? TOKEN EXPIRED! Get new token from Meta Dashboard');
        }
    }
}

app.listen(PORT, () => {
    console.log('?? WhatsApp Bot Started!');
    console.log(`?? Port: ${PORT}`);
    console.log('? Ready to receive messages!');
});