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
    
    // Check if message contains a mobile number (Indian or International)
    const mobileRegex = /(\+?\d{1,4})?[0-9]{8,15}/;
    const mobileMatch = message.match(mobileRegex);
    
    // More specific patterns for better validation
    const indianMobile = /(\+91|91|0)?[6789]\d{9}/;
    const uaeMobile = /(\+971|971|0)?[5][0-9]\d{7}/;
    const generalMobile = /^[\+]?[0-9]{8,15}$/;
    
    if (lowerMessage.includes('hello') || lowerMessage.includes('hi')) {
        return 'Hello! ??\n\nI can help you find customer information.\n\n?? *Send a mobile number* to get customer address\n(Supports Indian, UAE & International formats)\n\n?? Type "help" for more options';
        
    } else if (lowerMessage.includes('help')) {
        return '?? *Available Commands:*\n\n?? Send mobile number to get customer address:\n   • Indian: 9876543210\n   • UAE: 0566337875\n   • International: +971566337875\n\n?? "hello" - Greeting\n?? "help" - Show this menu\n?? "bye" - End conversation';
        
    } else if (lowerMessage.includes('bye')) {
        return 'Goodbye! ?? Feel free to message me anytime for customer information.';
        
    } else if (mobileMatch && (indianMobile.test(message) || uaeMobile.test(message) || generalMobile.test(message.trim()))) {
        // Extract and clean mobile number
        let mobileNumber = mobileMatch[0];
        
        // Clean the number based on country patterns
        if (indianMobile.test(message)) {
            // Remove +91, 91, 0 prefixes for Indian numbers
            mobileNumber = mobileNumber.replace(/^(\+91|91|0)/, '');
        } else if (uaeMobile.test(message)) {
            // For UAE numbers, keep the format as is or remove country code
            mobileNumber = mobileNumber.replace(/^(\+971|971)/, '0');
            // If it doesn't start with 0, add it
            if (!mobileNumber.startsWith('0')) {
                mobileNumber = '0' + mobileNumber;
            }
        } else {
            // For other international numbers, clean minimal formatting
            mobileNumber = mobileNumber.replace(/^\+/, '');
        }
        
        // Fetch customer info from ERPNext
        return await getCustomerByMobile(mobileNumber.trim());
        
    } else {
        return '? Please send a valid mobile number to get customer address.\n\n*Supported formats:*\n• Indian: 9876543210\n• UAE: 0566337875\n• International: +971566337875\n\nType "help" for more options.';
    }
}

// Fetch customer information from ERPNext by mobile number
async function getCustomerByMobile(mobileNumber) {
    try {
        // ERPNext API endpoint to search customers
        const searchUrl = `${ERPNEXT_URL}/api/resource/Customer`;
        
        // Try multiple search patterns and field names since different ERPNext versions use different fields
        const searchPatterns = [
            mobileNumber,                    // As provided
            `+${mobileNumber}`,             // With + prefix
            mobileNumber.replace(/^0/, ''), // Remove leading 0
            `0${mobileNumber}`,             // Add leading 0
        ];
        
        // Different field names that might be used for mobile numbers
        const mobileFields = ['mobile_no', 'phone', 'mobile', 'mobile_number'];
        
        let customers = [];
        
        // First, try a simple search without filters to test basic API access
        try {
            console.log('Testing basic API access...');
            const basicResponse = await axios.get(searchUrl, {
                headers: {
                    'Authorization': `token ${ERPNEXT_API_KEY}:${ERPNEXT_API_SECRET}`,
                    'Content-Type': 'application/json'
                },
                params: {
                    limit: 1
                }
            });
            console.log('Basic API access works, proceeding with filtered search...');
        } catch (basicErr) {
            console.error('Basic API access failed:', basicErr.response?.status, basicErr.message);
            throw basicErr;
        }

        // Try each field name with each pattern until we find a match
        for (const fieldName of mobileFields) {
            if (customers.length > 0) break; // Stop if we found customers
            
            for (const pattern of searchPatterns) {
                if (customers.length > 0) break; // Stop if we found customers
                
                try {
                    // Use simpler filter format that works better with some ERPNext versions
                    const filterArray = [[fieldName, '=', pattern]];
                    
                    const response = await axios.get(searchUrl, {
                        headers: {
                            'Authorization': `token ${ERPNEXT_API_KEY}:${ERPNEXT_API_SECRET}`,
                            'Content-Type': 'application/json',
                            'Accept': 'application/json'
                        },
                        params: {
                            filters: JSON.stringify(filterArray),
                            fields: '["name","customer_name","mobile_no","customer_primary_address","phone","mobile"]',
                            limit: 10
                        }
                    });
                    
                    if (response.data.data && response.data.data.length > 0) {
                        customers = response.data.data;
                        console.log(`Found customer with field ${fieldName} and pattern: ${pattern}`);
                        break;
                    } else {
                        console.log(`No results for field ${fieldName} with pattern ${pattern}`);
                    }
                } catch (err) {
                    console.log(`Search failed for field ${fieldName} with pattern ${pattern}:`, err.response?.status, err.message);
                    
                    // Try alternative API method for this pattern
                    try {
                        console.log(`Trying alternative method for ${fieldName}: ${pattern}`);
                        const altResponse = await axios.post(`${ERPNEXT_URL}/api/method/frappe.client.get_list`, {
                            doctype: 'Customer',
                            filters: {
                                [fieldName]: pattern
                            },
                            fields: ['name', 'customer_name', 'mobile_no', 'customer_primary_address', 'phone', 'mobile'],
                            limit_page_length: 10
                        }, {
                            headers: {
                                'Authorization': `token ${ERPNEXT_API_KEY}:${ERPNEXT_API_SECRET}`,
                                'Content-Type': 'application/json'
                            }
                        });
                        
                        if (altResponse.data.message && altResponse.data.message.length > 0) {
                            customers = altResponse.data.message;
                            console.log(`Found customer using alternative method with ${fieldName}: ${pattern}`);
                            break;
                        }
                    } catch (altErr) {
                        console.log(`Alternative method also failed for ${fieldName} with ${pattern}:`, altErr.response?.status);
                    }
                    continue; // Try next combination
                }
            }
        }
        
        if (customers && customers.length > 0) {
            const customer = customers[0];
            
            // Get the mobile number from whatever field it's stored in
            const displayMobile = customer.mobile_no || customer.phone || customer.mobile || 'N/A';
            
            // Get detailed address information
            const addressInfo = await getCustomerAddress(customer.customer_primary_address || customer.name);
            
            // Get custom documents/fields linked to this customer
            const customDocsInfo = await getCustomDocuments(customer.name);
            
            let response = `? *Customer Found!*\n\n?? *Name:* ${customer.customer_name}\n?? *Mobile:* ${displayMobile}\n\n${addressInfo}`;
            
            if (customDocsInfo) {
                response += `\n\n${customDocsInfo}`;
            }
            
            return response;
            
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
                const customDocsUrl = `${ERPNEXT_URL}/api/resource/${docType}`;
                
                const response = await axios.get(customDocsUrl, {
                    headers: {
                        'Authorization': `token ${ERPNEXT_API_KEY}:${ERPNEXT_API_SECRET}`,
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
        const docUrl = `${ERPNEXT_URL}/api/resource/${docType}/${docName}`;
        
        const response = await axios.get(docUrl, {
            headers: {
                'Authorization': `token ${ERPNEXT_API_KEY}:${ERPNEXT_API_SECRET}`,
                'Content-Type': 'application/json'
            }
        });

        const docData = response.data.data;
        
        if (!docData) return null;
        
        // Format the document information
        let docInfo = `?? *${docData.name || docData.title || docType}:*\n`;
        
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
        
        // Display custom fields if they exist
        customFields.forEach(field => {
            if (docData[field] !== undefined && docData[field] !== null) {
                const fieldValue = docData[field];
                const displayName = field.replace(/custom_|_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                docInfo += `${displayName}: ${fieldValue}\n`;
            }
        });
        
        // If no custom fields found, show some basic info
        if (!customFields.some(field => docData[field] !== undefined)) {
            if (docData.address_line1) docInfo += `Address: ${docData.address_line1}\n`;
            if (docData.city) docInfo += `City: ${docData.city}\n`;
            if (docData.pincode) docInfo += `Pincode: ${docData.pincode}\n`;
        }
        
        return docInfo;
        
    } catch (error) {
        console.error(`Error fetching ${docType} details:`, error.message);
        return null;
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
            error: error.response?.data || error.message,
            url: ERPNEXT_URL,
            hasCredentials: !!(ERPNEXT_API_KEY && ERPNEXT_API_SECRET)
        });
    }
});

// Debug endpoint to see customer structure
app.get('/debug-customer', async (req, res) => {
    try {
        // Get first few customers to see the field structure
        const response = await axios.get(`${ERPNEXT_URL}/api/resource/Customer`, {
            headers: {
                'Authorization': `token ${ERPNEXT_API_KEY}:${ERPNEXT_API_SECRET}`,
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
        const searchUrl = `${ERPNEXT_URL}/api/resource/Customer`;
        
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
                url: `${ERPNEXT_URL}/api/method/frappe.client.get_list`,
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
                    'Authorization': `token ${ERPNEXT_API_KEY}:${ERPNEXT_API_SECRET}`,
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
        const response = await axios.get(`${ERPNEXT_URL}/api/resource/Customer`, {
            headers: {
                'Authorization': `token ${ERPNEXT_API_KEY}:${ERPNEXT_API_SECRET}`,
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
        const response = await axios.get(`${ERPNEXT_URL}/api/resource/Address`, {
            headers: {
                'Authorization': `token ${ERPNEXT_API_KEY}:${ERPNEXT_API_SECRET}`,
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
            const detailResponse = await axios.get(`${ERPNEXT_URL}/api/resource/Address/${addr.name}`, {
                headers: {
                    'Authorization': `token ${ERPNEXT_API_KEY}:${ERPNEXT_API_SECRET}`,
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

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log('WhatsApp Bot with ERPNext Integration Ready! ??');
});