require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const GRAPH_API_TOKEN = process.env.GRAPH_API_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// ERPNext Configuration
const ERPNEXT_URL = process.env.ERPNEXT_URL; // e.g., https://your-erpnext-site.com
const ERPNEXT_API_KEY = process.env.ERPNEXT_API_KEY;
const ERPNEXT_API_SECRET = process.env.ERPNEXT_API_SECRET;

// Webhook verification
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('Webhook verified successfully!');
        res.status(200).send(challenge);
    } else {
        res.status(403).send('Verification failed');
    }
});

// Webhook to receive messages
app.post('/webhook', (req, res) => {
    const body = req.body;
    
    if (body.object === 'whatsapp_business_account') {
        body.entry.forEach(entry => {
            const changes = entry.changes;
            changes.forEach(change => {
                if (change.field === 'messages') {
                    const messages = change.value.messages;
                    if (messages) {
                        messages.forEach(message => {
                            console.log('Received message:', message);
                            handleIncomingMessage(message, change.value.metadata.phone_number_id);
                        });
                    }
                }
            });
        });
        res.status(200).send('ok');
    } else {
        res.status(404).send('Not found');
    }
});

// Handle incoming messages
async function handleIncomingMessage(message, phoneNumberId) {
    const from = message.from;
    const messageBody = message.text?.body;
    
    if (messageBody) {
        let response = await generateResponse(messageBody);
        await sendMessage(from, response, phoneNumberId);
    }
}

// Generate bot responses with ERPNext integration
async function generateResponse(message) {
    const lowerMessage = message.toLowerCase();
    
    // Check if message contains a mobile number
    const mobileRegex = /(\+91|91|0)?[6789]\d{9}/;
    const mobileMatch = message.match(mobileRegex);
    
    if (lowerMessage.includes('hello') || lowerMessage.includes('hi')) {
        return 'Hello! ??\n\nI can help you find customer information.\n\n?? *Send a mobile number* to get customer address\n?? Type "help" for more options';
        
    } else if (lowerMessage.includes('help')) {
        return '?? *Available Commands:*\n\n?? Send mobile number (e.g., 9876543210) - Get customer address\n?? "hello" - Greeting\n?? "help" - Show this menu\n?? "bye" - End conversation';
        
    } else if (lowerMessage.includes('bye')) {
        return 'Goodbye! ?? Feel free to message me anytime for customer information.';
        
    } else if (mobileMatch) {
        // Extract clean mobile number
        let mobileNumber = mobileMatch[0];
        // Clean the number (remove +91, 91, 0 prefixes)
        mobileNumber = mobileNumber.replace(/^(\+91|91|0)/, '');
        
        // Fetch customer info from ERPNext
        return await getCustomerByMobile(mobileNumber);
        
    } else {
        return '? Please send a valid mobile number to get customer address.\n\n*Example:* 9876543210\n\nType "help" for more options.';
    }
}

// Fetch customer information from ERPNext by mobile number
async function getCustomerByMobile(mobileNumber) {
    try {
        // ERPNext API endpoint to search customers
        const searchUrl = `${ERPNEXT_URL}/api/resource/Customer`;
        
        const response = await axios.get(searchUrl, {
            headers: {
                'Authorization': `token ${ERPNEXT_API_KEY}:${ERPNEXT_API_SECRET}`,
                'Content-Type': 'application/json'
            },
            params: {
                filters: JSON.stringify([['mobile_no', '=', mobileNumber]]),
                fields: JSON.stringify(['name', 'customer_name', 'mobile_no', 'customer_primary_address'])
            }
        });

        const customers = response.data.data;
        
        if (customers && customers.length > 0) {
            const customer = customers[0];
            
            // Get detailed address information
            const addressInfo = await getCustomerAddress(customer.customer_primary_address || customer.name);
            
            return `? *Customer Found!*\n\n?? *Name:* ${customer.customer_name}\n?? *Mobile:* ${customer.mobile_no}\n\n${addressInfo}`;
            
        } else {
            return `? *Customer Not Found*\n\nNo customer found with mobile number: ${mobileNumber}\n\nPlease check the number and try again.`;
        }
        
    } catch (error) {
        console.error('Error fetching customer:', error.response?.data || error.message);
        
        if (error.response?.status === 401) {
            return '?? Authentication failed. Please check ERPNext credentials.';
        } else if (error.response?.status === 404) {
            return '?? ERPNext server not found. Please check the URL.';
        } else {
            return '?? Unable to fetch customer information. Please try again later.';
        }
    }
}

// Get customer address details
async function getCustomerAddress(customerName) {
    try {
        // Fetch address linked to customer
        const addressUrl = `${ERPNEXT_URL}/api/resource/Address`;
        
        const response = await axios.get(addressUrl, {
            headers: {
                'Authorization': `token ${ERPNEXT_API_KEY}:${ERPNEXT_API_SECRET}`,
                'Content-Type': 'application/json'
            },
            params: {
                filters: JSON.stringify([
                    ['Dynamic Link', 'link_name', '=', customerName],
                    ['Dynamic Link', 'link_doctype', '=', 'Customer']
                ]),
                fields: JSON.stringify(['address_title', 'address_line1', 'address_line2', 'city', 'state', 'pincode', 'country', 'phone', 'email_id'])
            }
        });

        const addresses = response.data.data;
        
        if (addresses && addresses.length > 0) {
            const address = addresses[0];
            
            let addressText = '?? *Address:*\n';
            addressText += `${address.address_title ? address.address_title + '\n' : ''}`;
            addressText += `${address.address_line1 || ''}\n`;
            addressText += `${address.address_line2 ? address.address_line2 + '\n' : ''}`;
            addressText += `${address.city || ''}, ${address.state || ''} - ${address.pincode || ''}\n`;
            addressText += `${address.country || ''}`;
            
            if (address.phone) {
                addressText += `\n?? *Phone:* ${address.phone}`;
            }
            
            if (address.email_id) {
                addressText += `\n?? *Email:* ${address.email_id}`;
            }
            
            return addressText;
            
        } else {
            return '?? *Address:* Not available in records';
        }
        
    } catch (error) {
        console.error('Error fetching address:', error.response?.data || error.message);
        return '?? *Address:* Unable to fetch address details';
    }
}

// Send message function
async function sendMessage(to, message, phoneNumberId) {
    try {
        await axios.post(
            `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
            {
                messaging_product: 'whatsapp',
                to: to,
                text: { body: message }
            },
            {
                headers: {
                    'Authorization': `Bearer ${GRAPH_API_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        console.log('Message sent successfully');
    } catch (error) {
        console.error('Error sending message:', error.response?.data || error.message);
    }
}

// Health check endpoint
app.get('/', (req, res) => {
    res.send('WhatsApp Bot with ERPNext Integration is running! ??');
});

// Test ERPNext connection endpoint
app.get('/test-erpnext', async (req, res) => {
    try {
        const response = await axios.get(`${ERPNEXT_URL}/api/method/frappe.auth.get_logged_user`, {
            headers: {
                'Authorization': `token ${ERPNEXT_API_KEY}:${ERPNEXT_API_SECRET}`,
                'Content-Type': 'application/json'
            }
        });
        res.json({ status: 'success', message: 'ERPNext connection working!', data: response.data });
    } catch (error) {
        res.status(500).json({ 
            status: 'error', 
            message: 'ERPNext connection failed', 
            error: error.message 
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log('WhatsApp Bot with ERPNext Integration Ready! ??');
});