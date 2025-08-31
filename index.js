require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const GRAPH_API_TOKEN = process.env.GRAPH_API_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// dotorders ERP Configuration
const DOTORDERS_ERP_URL = process.env.DOTORDERS_ERP_URL; // e.g., https://your-dotorders-site.com
const DOTORDERS_ERP_API_KEY = process.env.DOTORDERS_ERP_API_KEY;
const DOTORDERS_ERP_API_SECRET = process.env.DOTORDERS_ERP_API_SECRET;

// Keep-alive configuration
const KEEP_ALIVE_URL = process.env.KEEP_ALIVE_URL; // Set this to your app URL
const KEEP_ALIVE_INTERVAL = 25 * 60 * 1000; // 25 minutes in milliseconds

// Keep-alive function
async function keepAlive() {
    if (!KEEP_ALIVE_URL) {
        console.log('KEEP_ALIVE_URL not set - skipping keep-alive ping');
        return;
    }
    
    try {
        const response = await axios.get(`${KEEP_ALIVE_URL}/health`, {
            timeout: 30000, // 30 second timeout
            headers: {
                'User-Agent': 'KeepAlive-Bot/1.0'
            }
        });
        console.log(`? Keep-alive ping successful at ${new Date().toISOString()} - Status: ${response.status}`);
    } catch (error) {
        console.error(`? Keep-alive ping failed at ${new Date().toISOString()}:`, error.message);
    }
}

// Start keep-alive timer
function startKeepAlive() {
    if (!KEEP_ALIVE_URL) {
        console.log('??  KEEP_ALIVE_URL not configured - server may sleep on free hosting plans');
        return;
    }
    
    console.log(`?? Starting keep-alive service - pinging every ${KEEP_ALIVE_INTERVAL / 60000} minutes`);
    console.log(`?? Keep-alive URL: ${KEEP_ALIVE_URL}/health`);
    
    // Initial ping after 2 minutes (to let server fully start)
    setTimeout(keepAlive, 2 * 60 * 1000);
    
    // Set up recurring pings
    setInterval(keepAlive, KEEP_ALIVE_INTERVAL);
}

// Enhanced health check endpoint
app.get('/health', (req, res) => {
    const healthData = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        memory: process.memoryUsage(),
        environment: process.env.NODE_ENV || 'development',
        version: '1.0.0'
    };
    
    console.log(`?? Health check called from ${req.ip} at ${healthData.timestamp}`);
    res.status(200).json(healthData);
});

// Keep-alive status endpoint
app.get('/keep-alive-status', (req, res) => {
    res.json({
        keepAliveEnabled: !!KEEP_ALIVE_URL,
        keepAliveUrl: KEEP_ALIVE_URL || 'Not configured',
        intervalMinutes: KEEP_ALIVE_INTERVAL / 60000,
        nextPingEstimate: new Date(Date.now() + KEEP_ALIVE_INTERVAL).toISOString(),
        serverTime: new Date().toISOString()
    });
});

// Manual ping endpoint (for testing)
app.post('/manual-ping', async (req, res) => {
    console.log('Manual ping triggered');
    await keepAlive();
    res.json({ 
        message: 'Manual keep-alive ping sent', 
        timestamp: new Date().toISOString() 
    });
});

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

// Generate bot responses with dotorders ERP integration
async function generateResponse(message) {
    const lowerMessage = message.toLowerCase();
    
    // Check if message contains a mobile number (Indian or International)
    const mobileRegex = /(\+?\d{1,4})?[0-9]{8,15}/;
    const mobileMatch = message.match(mobileRegex);
    
    // More specific patterns for better validation
    const indianMobile = /(\+91|91|0)?[6789]\d{9}/;
    const uaeMobile = /(\+971|971|0)?[5][0-9]\d{7}/;
    const generalMobile = /^[\+]?[0-9]{8,15}$/;
    
    if (lowerMessage.includes('hello') || lowerMessage.includes('hi')) {
        return 'Hello!\n\nI can help you find customer information.\n\n*Send a mobile number* to get customer details\n\nType "help" for more options';
        
    } else if (lowerMessage.includes('help')) {
        return '*AVAILABLE COMMANDS:*\n\nSend mobile number to get customer details\nExample: 0502594880';
        
    } else if (lowerMessage.includes('bye')) {
        return 'Goodbye! Feel free to message me anytime for customer information.';
        
    } else if (mobileMatch) {
        // Use the mobile number as entered by user
        let mobileNumber = mobileMatch[0].trim();
        
        console.log(`Processing mobile number: ${mobileNumber}`);
        
        // Fetch customer info from dotorders ERP
        return await getCustomerByMobile(mobileNumber);
        
    } else {
        return 'Please send a valid mobile number to get customer details.\n\n*Example:* 0502594880\n\nType "help" for more options.';
    }
}

// Fetch customer information from dotorders ERP by mobile number
async function getCustomerByMobile(mobileNumber) {
    try {
        // dotorders ERP API endpoint to search customers
        const searchUrl = `${DOTORDERS_ERP_URL}/api/resource/Customer`;
        
        console.log(`Searching for customer with mobile: ${mobileNumber}`);
        
        const response = await axios.get(searchUrl, {
            headers: {
                'Authorization': `token ${DOTORDERS_ERP_API_KEY}:${DOTORDERS_ERP_API_SECRET}`,
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
            console.log(`Found customer: ${customer.customer_name}`);
            
            // Get detailed address information
            const addressInfo = await getCustomerAddress(customer.customer_primary_address || customer.name);
            
            // Get custom documents/fields linked to this customer
            const customDocsInfo = await getCustomDocuments(customer.name);
            
            let response = `*CUSTOMER FOUND*\n\n*Name:* ${customer.customer_name}\n*Mobile:* ${customer.mobile_no}\n\n${addressInfo}`;
            
            if (customDocsInfo) {
                response += `${customDocsInfo}`;
            }
            
            return response;
            
        } else {
            console.log(`No customer found for mobile: ${mobileNumber}`);
            return `*CUSTOMER NOT FOUND*\n\nNo customer found with mobile number: ${mobileNumber}\n\nPlease check the number and try again.`;
        }
        
    } catch (error) {
        console.error('Error fetching customer:', error.response?.status, error.response?.data || error.message);
        
        if (error.response?.status === 401) {
            return 'Authentication failed. Please check dotorders ERP credentials.';
        } else if (error.response?.status === 404) {
            return 'dotorders ERP server not found. Please check the URL.';
        } else if (error.response?.status === 417) {
            return 'dotorders ERP API request format issue. Please contact support.';
        } else {
            return 'Unable to fetch customer information. Please try again later.';
        }
    }
}

// Get custom documents/fields linked to customer
async function getCustomDocuments(customerName) {
    try {
        let customInfo = '';
        
        // List of custom doctypes that might be linked to customers
        // Add your custom doctype names here
        const customDocTypes = [
            'Address', // Since your custom fields seem to be in Address
            // Add other custom doctypes if needed
            // 'Custom Billing Details',
            // 'Customer Equipment',
        ];
        
        for (const docType of customDocTypes) {
            try {
                const customDocsUrl = `${DOTORDERS_ERP_URL}/api/resource/${docType}`;
                
                const response = await axios.get(customDocsUrl, {
                    headers: {
                        'Authorization': `token ${DOTORDERS_ERP_API_KEY}:${DOTORDERS_ERP_API_SECRET}`,
                        'Content-Type': 'application/json'
                    },
                    params: {
                        filters: JSON.stringify([
                            ['Dynamic Link', 'link_name', '=', customerName],
                            ['Dynamic Link', 'link_doctype', '=', 'Customer']
                        ]),
                        limit: 10
                    }
                });

                if (response.data.data && response.data.data.length > 0) {
                    const docs = response.data.data;
                    
                    for (const doc of docs) {
                        // Get full document details
                        const docDetails = await getDocumentDetails(docType, doc.name);
                        if (docDetails) {
                            customInfo += docDetails + '\n';
                        }
                    }
                }
            } catch (err) {
                console.log(`Error fetching ${docType}:`, err.message);
                continue;
            }
        }
        
        return customInfo || null;
        
    } catch (error) {
        console.error('Error fetching custom documents:', error.message);
        return null;
    }
}

// Get detailed information for a specific document
async function getDocumentDetails(docType, docName) {
    try {
        const docUrl = `${DOTORDERS_ERP_URL}/api/resource/${docType}/${docName}`;
        
        const response = await axios.get(docUrl, {
            headers: {
                'Authorization': `token ${DOTORDERS_ERP_API_KEY}:${DOTORDERS_ERP_API_SECRET}`,
                'Content-Type': 'application/json'
            }
        });

        const docData = response.data.data;
        
        if (!docData) return null;
        
        // Format the document information
        let docInfo = `\n*${docData.name || docData.title || docType}:*\n`;
        
        // Custom fields to display (add your custom field names here)
        const customFields = [
            'custom_bottle_in_hand',
            'custom_coupon_count', 
            'custom_cooler_in_hand',
            'custom_bottle_per_recharge',
            'custom_bottle_recharge_amount',
            'postal_code',
            // Add more custom field names as needed
        ];
        
        let hasCustomFields = false;
        
        // Display custom fields if they exist
        customFields.forEach(field => {
            if (docData[field] !== undefined && docData[field] !== null) {
                const fieldValue = docData[field];
                const displayName = field.replace(/custom_|_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                docInfo += `${displayName}: ${fieldValue}\n`;
                hasCustomFields = true;
            }
        });
        
        // If no custom fields found, show some basic info
        if (!hasCustomFields) {
            if (docData.address_line1) {
                docInfo += `Address: ${docData.address_line1}\n`;
                hasCustomFields = true;
            }
            if (docData.city) {
                docInfo += `City: ${docData.city}\n`;
                hasCustomFields = true;
            }
            if (docData.pincode) {
                docInfo += `Pincode: ${docData.pincode}\n`;
                hasCustomFields = true;
            }
        }
        
        return hasCustomFields ? docInfo : null;
        
    } catch (error) {
        console.error(`Error fetching ${docType} details:`, error.message);
        return null;
    }
}

// Get customer address details
async function getCustomerAddress(customerName) {
    try {
        // Fetch address linked to customer
        const addressUrl = `${DOTORDERS_ERP_URL}/api/resource/Address`;
        
        const response = await axios.get(addressUrl, {
            headers: {
                'Authorization': `token ${DOTORDERS_ERP_API_KEY}:${DOTORDERS_ERP_API_SECRET}`,
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
            
            let addressText = '*ADDRESS:*\n';
            
            if (address.address_title) {
                addressText += `${address.address_title}\n`;
            }
            if (address.address_line1) {
                addressText += `${address.address_line1}\n`;
            }
            if (address.address_line2) {
                addressText += `${address.address_line2}\n`;
            }
            
            // City, State, Pincode line
            let locationLine = '';
            if (address.city) locationLine += address.city;
            if (address.state) {
                locationLine += locationLine ? `, ${address.state}` : address.state;
            }
            if (address.pincode) {
                locationLine += locationLine ? ` - ${address.pincode}` : address.pincode;
            }
            if (locationLine) {
                addressText += `${locationLine}\n`;
            }
            
            if (address.country) {
                addressText += `${address.country}\n`;
            }
            
            if (address.phone) {
                addressText += `*Phone:* ${address.phone}\n`;
            }
            
            if (address.email_id) {
                addressText += `*Email:* ${address.email_id}`;
            }
            
            return addressText;
            
        } else {
            return '*ADDRESS:* Not available';
        }
        
    } catch (error) {
        console.error('Error fetching address:', error.response?.data || error.message);
        return '*ADDRESS:* Unable to fetch address details';
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

// Main homepage endpoint
app.get('/', (req, res) => {
    const statusHtml = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>WhatsApp Bot Status</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 40px; }
            .status { padding: 20px; background: #f0f8f0; border-radius: 8px; }
            .endpoint { margin: 10px 0; padding: 10px; background: #f8f8f8; border-radius: 4px; }
            .active { color: green; font-weight: bold; }
            .inactive { color: orange; }
        </style>
    </head>
    <body>
        <h1>?? WhatsApp Bot with dotorders ERP Integration</h1>
        <div class="status">
            <h2>Server Status: <span class="active">RUNNING</span></h2>
            <p><strong>Uptime:</strong> ${Math.floor(process.uptime())} seconds</p>
            <p><strong>Keep-alive:</strong> <span class="${KEEP_ALIVE_URL ? 'active' : 'inactive'}">${KEEP_ALIVE_URL ? 'ENABLED' : 'DISABLED'}</span></p>
            <p><strong>Time:</strong> ${new Date().toISOString()}</p>
        </div>
        
        <h3>Available Endpoints:</h3>
        <div class="endpoint"><strong>/health</strong> - Health check</div>
        <div class="endpoint"><strong>/keep-alive-status</strong> - Keep-alive configuration</div>
        <div class="endpoint"><strong>/test-dotorders-erp</strong> - Test dotorders ERP connection</div>
        <div class="endpoint"><strong>/webhook</strong> - WhatsApp webhook</div>
    </body>
    </html>
    `;
    res.send(statusHtml);
});

// Test dotorders ERP connection endpoint
app.get('/test-dotorders-erp', async (req, res) => {
    try {
        const response = await axios.get(`${DOTORDERS_ERP_URL}/api/method/frappe.auth.get_logged_user`, {
            headers: {
                'Authorization': `token ${DOTORDERS_ERP_API_KEY}:${DOTORDERS_ERP_API_SECRET}`,
                'Content-Type': 'application/json'
            }
        });
        res.json({ status: 'success', message: 'dotorders ERP connection working!', data: response.data });
    } catch (error) {
        res.status(500).json({ 
            status: 'error', 
            message: 'dotorders ERP connection failed', 
            error: error.response?.data || error.message,
            url: DOTORDERS_ERP_URL,
            hasCredentials: !!(DOTORDERS_ERP_API_KEY && DOTORDERS_ERP_API_SECRET)
        });
    }
});

// Debug endpoint to see customer structure
app.get('/debug-customer', async (req, res) => {
    try {
        // Get first few customers to see the field structure
        const response = await axios.get(`${DOTORDERS_ERP_URL}/api/resource/Customer`, {
            headers: {
                'Authorization': `token ${DOTORDERS_ERP_API_KEY}:${DOTORDERS_ERP_API_SECRET}`,
                'Content-Type': 'application/json'
            },
            params: {
                limit: 3
            }
        });
        res.json({ 
            status: 'success', 
            message: 'Sample customers retrieved', 
            data: response.data.data,
            availableFields: Object.keys(response.data.data[0] || {})
        });
    } catch (error) {
        res.status(500).json({ 
            status: 'error', 
            message: 'Could not retrieve customer data', 
            error: error.response?.data || error.message 
        });
    }
});

// Debug endpoint for mobile number search
app.get('/debug-mobile/:mobileNumber', async (req, res) => {
    try {
        const mobileNumber = req.params.mobileNumber;
        const searchUrl = `${DOTORDERS_ERP_URL}/api/resource/Customer`;
        
        // Try different search approaches
        const approaches = [
            {
                name: 'Standard API with mobile_no',
                method: 'GET',
                url: searchUrl,
                params: {
                    filters: JSON.stringify([['mobile_no', '=', mobileNumber]]),
                    fields: '["name","customer_name","mobile_no"]',
                    limit: 5
                }
            },
            {
                name: 'Alternative frappe.client.get_list',
                method: 'POST',
                url: `${DOTORDERS_ERP_URL}/api/method/frappe.client.get_list`,
                data: {
                    doctype: 'Customer',
                    filters: { mobile_no: mobileNumber },
                    fields: ['name', 'customer_name', 'mobile_no'],
                    limit_page_length: 5
                }
            },
            {
                name: 'Search with phone field',
                method: 'GET',
                url: searchUrl,
                params: {
                    filters: JSON.stringify([['phone', '=', mobileNumber]]),
                    fields: '["name","customer_name","phone"]',
                    limit: 5
                }
            }
        ];
        
        const results = [];
        
        for (const approach of approaches) {
            try {
                let response;
                const headers = {
                    'Authorization': `token ${DOTORDERS_ERP_API_KEY}:${DOTORDERS_ERP_API_SECRET}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                };
                
                if (approach.method === 'GET') {
                    response = await axios.get(approach.url, {
                        headers,
                        params: approach.params
                    });
                } else {
                    response = await axios.post(approach.url, approach.data, { headers });
                }
                
                results.push({
                    approach: approach.name,
                    status: 'success',
                    data: response.data.data || response.data.message || response.data,
                    count: (response.data.data || response.data.message || []).length
                });
                
            } catch (error) {
                results.push({
                    approach: approach.name,
                    status: 'error',
                    error: error.response?.status,
                    message: error.message,
                    details: error.response?.data
                });
            }
        }
        
        res.json({
            searchTerm: mobileNumber,
            results: results,
            summary: `Tested ${approaches.length} different approaches`
        });
        
    } catch (error) {
        res.status(500).json({
            error: 'Debug search failed',
            message: error.message
        });
    }
});

// Simple customer list endpoint to test basic API access
app.get('/debug-simple', async (req, res) => {
    try {
        const response = await axios.get(`${DOTORDERS_ERP_URL}/api/resource/Customer`, {
            headers: {
                'Authorization': `token ${DOTORDERS_ERP_API_KEY}:${DOTORDERS_ERP_API_SECRET}`,
                'Content-Type': 'application/json'
            },
            params: {
                limit: 5
            }
        });
        
        res.json({
            status: 'success',
            message: 'Basic customer listing works',
            customers: response.data.data,
            availableFields: response.data.data.length > 0 ? Object.keys(response.data.data[0]) : []
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            error: error.response?.status || 'Unknown',
            message: error.message,
            details: error.response?.data
        });
    }
});

app.get('/debug-address/:customerName', async (req, res) => {
    try {
        const customerName = req.params.customerName;
        
        // Get addresses linked to this customer
        const response = await axios.get(`${DOTORDERS_ERP_URL}/api/resource/Address`, {
            headers: {
                'Authorization': `token ${DOTORDERS_ERP_API_KEY}:${DOTORDERS_ERP_API_SECRET}`,
                'Content-Type': 'application/json'
            },
            params: {
                filters: JSON.stringify([
                    ['Dynamic Link', 'link_name', '=', customerName],
                    ['Dynamic Link', 'link_doctype', '=', 'Customer']
                ])
            }
        });
        
        const addresses = response.data.data;
        let addressDetails = [];
        
        // Get full details for each address
        for (const addr of addresses) {
            const detailResponse = await axios.get(`${DOTORDERS_ERP_URL}/api/resource/Address/${addr.name}`, {
                headers: {
                    'Authorization': `token ${DOTORDERS_ERP_API_KEY}:${DOTORDERS_ERP_API_SECRET}`,
                    'Content-Type': 'application/json'
                }
            });
            addressDetails.push(detailResponse.data.data);
        }
        
        res.json({ 
            status: 'success', 
            message: `Address documents for ${customerName}`, 
            addresses: addressDetails,
            availableFields: addressDetails.length > 0 ? Object.keys(addressDetails[0]) : []
        });
    } catch (error) {
        res.status(500).json({ 
            status: 'error', 
            message: 'Could not retrieve address data', 
            error: error.response?.data || error.message 
        });
    }
});

// Start server and keep-alive service
app.listen(PORT, () => {
    console.log(`?? Server is running on port ${PORT}`);
    console.log('?? WhatsApp Bot with dotorders ERP Integration Ready!');
    console.log(`?? Server URL: http://localhost:${PORT}`);
    
    // Start the keep-alive service
    startKeepAlive();
});