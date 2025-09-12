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
const DOTORDERS_ERP_URL = process.env.DOTORDERS_ERP_URL;
const DOTORDERS_ERP_API_KEY = process.env.DOTORDERS_ERP_API_KEY;
const DOTORDERS_ERP_API_SECRET = process.env.DOTORDERS_ERP_API_SECRET;

// Keep-alive configuration
const KEEP_ALIVE_URL = process.env.KEEP_ALIVE_URL;
const KEEP_ALIVE_INTERVAL = 25 * 60 * 1000;

// Conversation state management
const userSessions = new Map();

// Product catalog
const PRODUCTS = {
    'single_bottle': { name: 'Single Bottle', price: 7, deposit: 15, description: '5-gallon water bottle' },
    'trial_bottle': { name: 'Trial Bottle', price: 7, deposit: 15, description: 'Trial 5-gallon water bottle' },
    'table_dispenser': { name: 'Table Top Dispenser', price: 25, deposit: 0, description: 'Basic table top dispenser' },
    'hand_pump': { name: 'Hand Pump', price: 15, deposit: 0, description: 'Manual hand pump for bottles' },
    'premium_cooler': { name: 'Premium Water Cooler', price: 300, deposit: 0, description: 'Premium cooler with 1-year warranty' },
    'coupon_10_1': { name: '10+1 Coupon Book', price: 70, deposit: 0, description: '11 bottles (10+1 free), up to 3 bottles without deposit' },
    'coupon_100_40': { name: '100+40 Coupon Book', price: 700, deposit: 0, description: '140 bottles, up to 5 bottles without deposit, BNPL available' },
    'premium_package': { name: '140 Bottles + Dispenser', price: 920, deposit: 0, description: '140 bottles + Premium dispenser package' }
};

// Customer service knowledge base
const KNOWLEDGE_BASE = {
    greetings: {
        keywords: ['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening'],
        response: `Hello! Welcome to our water delivery service! ??

I can help you with:
?? Product information & pricing
?? Place orders
?? Delivery scheduling
? Answer your questions

*How can I assist you today?*

Type "menu" to see our products or ask me anything!`
    },
    
    menu: {
        keywords: ['menu', 'products', 'catalog', 'price list', 'what do you sell'],
        response: `*??? OUR PRODUCTS & SERVICES*

*?? WATER BOTTLES*
• Single Bottle - AED 7 (+15 deposit)
• Trial Bottle - AED 7 (+15 deposit)

*?? EQUIPMENT*
• Table Top Dispenser - AED 25
• Hand Pump - AED 15
• Premium Water Cooler - AED 300 (1-year warranty)

*?? COUPON BOOKS*
• 10+1 Coupon Book - AED 70 (no deposit for 3 bottles)
• 100+40 Coupon Book - AED 700 (no deposit for 5 bottles, BNPL available)
• 140 Bottles + Dispenser Package - AED 920

*?? DELIVERY AREAS*
Dubai, Sharjah, Ajman (except freezones)

Type "order [product]" to place an order
Example: "order single bottle"`
    },

    coupon_info: {
        keywords: ['coupon', 'coupon book', 'what is coupon', 'benefits', 'bnpl', 'buy now pay later'],
        response: `*?? COUPON BOOK SYSTEM*

A coupon represents one bottle. Give coupons to delivery person = get bottles!

*? BENEFITS:*
• No bottle deposit (save AED 15/bottle)
• Prioritized delivery
• Out-of-schedule delivery possible
• No delivery charges
• No cash payment hassle
• Better price per bottle

*?? AVAILABLE BOOKS:*
• 10+1 Book (AED 70) - up to 3 bottles without deposit
• 100+40 Book (AED 700) - up to 5 bottles without deposit

*?? BUY NOW PAY LATER:*
Available ONLY for 100+40 Coupon Book

Would you like to order a coupon book?`
    },

    delivery: {
        keywords: ['delivery', 'schedule', 'when', 'how long', 'timing', 'areas'],
        response: `*?? DELIVERY INFORMATION*

*?? COVERAGE AREAS:*
Dubai, Sharjah, Ajman (except freezones)

*? SCHEDULING:*
• Message us on WhatsApp for delivery
• We'll set a weekly scheduled day
• Urgent/out-of-schedule requests accommodated

*?? DELIVERY CHARGES:*
• FREE with coupon books
• Standard charges for individual bottles

*?? TO SCHEDULE:*
Just tell me what you need and your location!

Would you like to place an order now?`
    },

    payment: {
        keywords: ['payment', 'pay', 'cash', 'card', 'bank transfer', 'installment'],
        response: `*?? PAYMENT METHODS*

We accept:
• ?? Cash
• ?? Card payment (subject to availability)
• ?? Bank transfer

*?? INSTALLMENT OPTIONS:*
Buy Now Pay Later available ONLY for 100+40 Coupon Book

*?? PRICING:*
• Base price: AED 7/bottle
• With coupon books: As low as AED 5/bottle

Ready to place an order?`
    },

    equipment: {
        keywords: ['dispenser', 'cooler', 'equipment', 'table top', 'hand pump', 'warranty'],
        response: `*?? EQUIPMENT AVAILABLE*

*?? DISPENSERS:*
• Table Top Dispenser - AED 25
• Hand Pump - AED 15
• Premium Water Cooler - AED 300

*? WARRANTY:*
Premium cooler comes with 1-year warranty from Geo General

*?? WHY WE CHARGE:*
We believe in transparent pricing instead of hiding costs in bottle prices like others do.

*?? PACKAGE DEAL:*
140 Bottles + Premium Dispenser = AED 920

Would you like to order any equipment?`
    }
};

// Keep-alive functions (keeping original)
async function keepAlive() {
    if (!KEEP_ALIVE_URL) {
        console.log('KEEP_ALIVE_URL not set - skipping keep-alive ping');
        return;
    }
    
    try {
        const response = await axios.get(`${KEEP_ALIVE_URL}/health`, {
            timeout: 30000,
            headers: { 'User-Agent': 'KeepAlive-Bot/1.0' }
        });
        console.log(`? Keep-alive ping successful at ${new Date().toISOString()} - Status: ${response.status}`);
    } catch (error) {
        console.error(`? Keep-alive ping failed at ${new Date().toISOString()}:`, error.message);
    }
}

function startKeepAlive() {
    if (!KEEP_ALIVE_URL) {
        console.log('??  KEEP_ALIVE_URL not configured - server may sleep on free hosting plans');
        return;
    }
    
    console.log(`?? Starting keep-alive service - pinging every ${KEEP_ALIVE_INTERVAL / 60000} minutes`);
    setTimeout(keepAlive, 2 * 60 * 1000);
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
        version: '2.0.0',
        activeSessions: userSessions.size
    };
    
    console.log(`?? Health check called from ${req.ip} at ${healthData.timestamp}`);
    res.status(200).json(healthData);
});

// Webhook verification (keeping original)
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

// Enhanced webhook to receive messages
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

// Enhanced message handling with conversation state
async function handleIncomingMessage(message, phoneNumberId) {
    const from = message.from;
    const messageBody = message.text?.body;
    
    if (messageBody) {
        // Get or create user session
        if (!userSessions.has(from)) {
            userSessions.set(from, {
                state: 'greeting',
                orderInProgress: null,
                customerInfo: null,
                lastActivity: Date.now()
            });
        }
        
        const session = userSessions.get(from);
        session.lastActivity = Date.now();
        
        let response = await generateEnhancedResponse(messageBody, session, from);
        await sendMessage(from, response, phoneNumberId);
    }
}

// Enhanced response generation with knowledge base and order handling
async function generateEnhancedResponse(message, session, userPhone) {
    const lowerMessage = message.toLowerCase().trim();
    
    // Handle order commands first
    if (lowerMessage.startsWith('order ')) {
        return await handleOrderCommand(message, session, userPhone);
    }
    
    // Handle order confirmation
    if (session.state === 'confirming_order' && (lowerMessage.includes('yes') || lowerMessage.includes('confirm'))) {
        return await processOrder(session, userPhone);
    }
    
    if (session.state === 'confirming_order' && (lowerMessage.includes('no') || lowerMessage.includes('cancel'))) {
        session.state = 'greeting';
        session.orderInProgress = null;
        return "Order cancelled. How else can I help you today?";
    }
    
    // Handle address collection for orders
    if (session.state === 'collecting_address') {
        session.orderInProgress.address = message;
        session.state = 'confirming_order';
        return await generateOrderConfirmation(session.orderInProgress);
    }
    
    // Check mobile number for customer lookup
    const mobileRegex = /(\+?\d{1,4})?[0-9]{8,15}/;
    const mobileMatch = message.match(mobileRegex);
    
    if (mobileMatch && lowerMessage.length < 20) {
        let mobileNumber = mobileMatch[0].trim();
        console.log(`Processing mobile number: ${mobileNumber}`);
        return await getCustomerByMobile(mobileNumber);
    }
    
    // Check knowledge base
    for (const [category, info] of Object.entries(KNOWLEDGE_BASE)) {
        if (info.keywords.some(keyword => lowerMessage.includes(keyword))) {
            return info.response;
        }
    }
    
    // Fallback responses
    if (lowerMessage.includes('help')) {
        return `*?? HOW I CAN HELP*

?? Type "menu" - See all products
?? Type "order [product]" - Place an order
?? Send mobile number - Get customer details
? Ask about delivery, pricing, coupons

*Example orders:*
• "order single bottle"
• "order coupon book"
• "order dispenser"

What would you like to do?`;
    }
    
    return `I understand you're asking about: "${message}"

I can help you with:
?? Product orders - Type "order [product name]"
?? Product information - Type "menu"
?? Delivery information - Ask about delivery
?? Payment options - Ask about payment

*Or send a mobile number to look up customer details*

What specific information do you need?`;
}

// Handle order commands
async function handleOrderCommand(message, session, userPhone) {
    const orderText = message.substring(6).toLowerCase().trim(); // Remove "order "
    
    // Find matching product
    let selectedProduct = null;
    let productKey = null;
    
    for (const [key, product] of Object.entries(PRODUCTS)) {
        if (orderText.includes(key.replace('_', ' ')) || 
            orderText.includes(product.name.toLowerCase()) ||
            (key.includes('bottle') && orderText.includes('bottle')) ||
            (key.includes('dispenser') && orderText.includes('dispenser')) ||
            (key.includes('coupon') && orderText.includes('coupon'))) {
            selectedProduct = product;
            productKey = key;
            break;
        }
    }
    
    if (!selectedProduct) {
        return `*? Product not found*

Available products:
${Object.entries(PRODUCTS).map(([key, product]) => 
    `• ${product.name} - AED ${product.price}${product.deposit > 0 ? ` (+${product.deposit} deposit)` : ''}`
).join('\n')}

*Example:* "order single bottle"`;
    }
    
    // Get customer info first
    const customerInfo = await getCustomerByMobile(userPhone);
    
    // Start order process
    session.orderInProgress = {
        product: selectedProduct,
        productKey: productKey,
        quantity: 1,
        customerPhone: userPhone,
        customerInfo: customerInfo
    };
    
    // Check if we need address
    if (customerInfo.includes('CUSTOMER NOT FOUND') || !customerInfo.includes('ADDRESS:')) {
        session.state = 'collecting_address';
        return `*?? ORDER STARTED*

Product: ${selectedProduct.name}
Price: AED ${selectedProduct.price}${selectedProduct.deposit > 0 ? ` (+${selectedProduct.deposit} deposit)` : ''}

*?? Please provide your delivery address:*
Include building name, area, and any specific directions.`;
    } else {
        session.state = 'confirming_order';
        return await generateOrderConfirmation(session.orderInProgress);
    }
}

// Generate order confirmation
async function generateOrderConfirmation(orderInfo) {
    const total = orderInfo.product.price + orderInfo.product.deposit;
    
    return `*?? ORDER CONFIRMATION*

*Product:* ${orderInfo.product.name}
*Description:* ${orderInfo.product.description}
*Price:* AED ${orderInfo.product.price}
${orderInfo.product.deposit > 0 ? `*Deposit:* AED ${orderInfo.product.deposit}` : ''}
*Total:* AED ${total}

*?? Delivery Address:*
${orderInfo.address || 'Using address on file'}

*?? Payment:* Cash/Card on delivery

*Confirm your order?*
Reply "YES" to confirm or "NO" to cancel.`;
}

// Process confirmed order
async function processOrder(session, userPhone) {
    try {
        const orderInfo = session.orderInProgress;
        
        // Create order in ERPNext
        const erpOrder = await createERPOrder(orderInfo);
        
        if (erpOrder.success) {
            session.state = 'greeting';
            session.orderInProgress = null;
            
            return `*? ORDER CONFIRMED!*

*Order ID:* ${erpOrder.orderName}
*Product:* ${orderInfo.product.name}
*Total:* AED ${orderInfo.product.price + orderInfo.product.deposit}

*?? Next Steps:*
Our delivery team will contact you within 2 hours to schedule delivery.

*?? Delivery Areas:*
Dubai, Sharjah, Ajman

Thank you for choosing our service! ??`;
        } else {
            return `*? ORDER ERROR*

Sorry, there was an issue creating your order. Please try again or contact support.

Error: ${erpOrder.error}`;
        }
        
    } catch (error) {
        console.error('Error processing order:', error);
        return `*? ORDER ERROR*

Sorry, there was a technical issue. Please try again or contact our support team.`;
    }
}

// Create order in ERPNext
async function createERPOrder(orderInfo) {
    try {
        const orderData = {
            doctype: 'Sales Order',
            customer: orderInfo.customerPhone, // Will need to create customer if doesn't exist
            order_type: 'Sales',
            delivery_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Tomorrow
            items: [{
                item_code: orderInfo.productKey,
                item_name: orderInfo.product.name,
                description: orderInfo.product.description,
                qty: orderInfo.quantity,
                rate: orderInfo.product.price,
                amount: orderInfo.product.price * orderInfo.quantity
            }],
            custom_delivery_address: orderInfo.address,
            custom_customer_phone: orderInfo.customerPhone,
            custom_order_source: 'WhatsApp Bot'
        };
        
        // If there's a deposit, add it as a separate line item
        if (orderInfo.product.deposit > 0) {
            orderData.items.push({
                item_code: 'BOTTLE_DEPOSIT',
                item_name: 'Bottle Deposit',
                description: 'Refundable bottle deposit',
                qty: orderInfo.quantity,
                rate: orderInfo.product.deposit,
                amount: orderInfo.product.deposit * orderInfo.quantity
            });
        }
        
        const response = await axios.post(
            `${DOTORDERS_ERP_URL}/api/resource/Sales Order`,
            orderData,
            {
                headers: {
                    'Authorization': `token ${DOTORDERS_ERP_API_KEY}:${DOTORDERS_ERP_API_SECRET}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        return {
            success: true,
            orderName: response.data.data.name,
            data: response.data.data
        };
        
    } catch (error) {
        console.error('ERP Order creation failed:', error.response?.data || error.message);
        return {
            success: false,
            error: error.response?.data?.message || error.message
        };
    }
}

// Enhanced customer lookup (keeping original functionality)
async function getCustomerByMobile(mobileNumber) {
    try {
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
            
            const addressInfo = await getCustomerAddress(customer.customer_primary_address || customer.name);
            const customDocsInfo = await getCustomDocuments(customer.name);
            
            let response = `*? CUSTOMER FOUND*\n\n*Name:* ${customer.customer_name}\n*Mobile:* ${customer.mobile_no}\n\n${addressInfo}`;
            
            if (customDocsInfo) {
                response += `${customDocsInfo}`;
            }
            
            return response;
            
        } else {
            console.log(`No customer found for mobile: ${mobileNumber}`);
            return `*CUSTOMER NOT FOUND*

No customer found with mobile number: ${mobileNumber}

Would you like to place a new order? I can help you get started!`;
        }
        
    } catch (error) {
        console.error('Error fetching customer:', error.response?.status, error.response?.data || error.message);
        return 'Unable to fetch customer information. Please try again later.';
    }
}

// Keep original ERP integration functions
async function getCustomDocuments(customerName) {
    try {
        let customInfo = '';
        const customDocTypes = ['Address'];
        
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
        
        let docInfo = `\n*${docData.name || docData.title || docType}:*\n`;
        
        const customFields = [
            'custom_bottle_in_hand',
            'custom_coupon_count', 
            'custom_cooler_in_hand',
            'custom_bottle_per_recharge',
            'custom_bottle_recharge_amount',
            'postal_code'
        ];
        
        let hasCustomFields = false;
        
        customFields.forEach(field => {
            if (docData[field] !== undefined && docData[field] !== null) {
                const fieldValue = docData[field];
                const displayName = field.replace(/custom_|_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                docInfo += `${displayName}: ${fieldValue}\n`;
                hasCustomFields = true;
            }
        });
        
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

async function getCustomerAddress(customerName) {
    try {
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
            
            if (address.address_title) addressText += `${address.address_title}\n`;
            if (address.address_line1) addressText += `${address.address_line1}\n`;
            if (address.address_line2) addressText += `${address.address_line2}\n`;
            
            let locationLine = '';
            if (address.city) locationLine += address.city;
            if (address.state) {
                locationLine += locationLine ? `, ${address.state}` : address.state;
            }
            if (address.pincode) {
                locationLine += locationLine ? ` - ${address.pincode}` : address.pincode;
            }
            if (locationLine) addressText += `${locationLine}\n`;
            
            if (address.country) addressText += `${address.country}\n`;
            if (address.phone) addressText += `*Phone:* ${address.phone}\n`;
            if (address.email_id) addressText += `*Email:* ${address.email_id}`;
            
            return addressText;
            
        } else {
            return '*ADDRESS:* Not available';
        }
        
    } catch (error) {
        console.error('Error fetching address:', error.response?.data || error.message);
        return '*ADDRESS:* Unable to fetch address details';
    }
}

// Enhanced send message function
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

// Session cleanup (remove inactive sessions after 1 hour)
setInterval(() => {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    
    for (const [phone, session] of userSessions.entries()) {
        if (now - session.lastActivity > oneHour) {
            userSessions.delete(phone);
            console.log(`Cleaned up inactive session for ${phone}`);
        }
    }
}, 15 * 60 * 1000); // Check every 15 minutes

// Enhanced homepage
app.get('/', (req, res) => {
    const statusHtml = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>WhatsApp Water Delivery Bot</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
            .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .status { padding: 20px; background: #e8f5e8; border-radius: 8px; margin: 20px 0; }
            .endpoint { margin: 10px 0; padding: 15px; background: #f8f8f8; border-radius: 6px; border-left: 4px solid #007bff; }
            .active { color: #28a745; font-weight: bold; }
            .inactive { color: #ffc107; }
            .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 20px 0; }
            .stat-box { padding: 20px; background: #007bff; color: white; border-radius: 8px; text-align: center; }
            h1 { color: #333; text-align: center; }
            h2 { color: #007bff; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>?? WhatsApp Water Delivery Bot</h1>
            <div class="status">
                <h2>Server Status: <span class="active">RUNNING</span></h2>
                <p><strong>Version:</strong> 2.0.0 (Enhanced with Order Management)</p>
                <p><strong>Uptime:</strong> ${Math.floor(process.uptime())} seconds</p>
                <p><strong>Keep-alive:</strong> <span class="${KEEP_ALIVE_URL ? 'active' : 'inactive'}">${KEEP_ALIVE_URL ? 'ENABLED' : 'DISABLED'}</span></p>
                <p><strong>Time:</strong> ${new Date().toISOString()}</p>
            </div>
            
            <div class="stats">
                <div class="stat-box">
                    <h3>${userSessions.size}</h3>
                    <p>Active Sessions</p>
                </div>
                <div class="stat-box">
                    <h3>${Object.keys(PRODUCTS).length}</h3>
                    <p>Products Available</p>
                </div>
                <div class="stat-box">
                    <h3>${Object.keys(KNOWLEDGE_BASE).length}</h3>
                    <p>Knowledge Categories</p>
                </div>
            </div>
            
            <h3>?? Available Endpoints:</h3>
            <div class="endpoint"><strong>/health</strong> - Health check and system status</div>
            <div class="endpoint"><strong>/keep-alive-status</strong> - Keep-alive configuration</div>
            <div class="endpoint"><strong>/test-dotorders-erp</strong> - Test ERPNext connection</div>
            <div class="endpoint"><strong>/webhook</strong> - WhatsApp webhook endpoint</div>
            <div class="endpoint"><strong>/debug-customer</strong> - Debug customer data structure</div>
            <div class="endpoint"><strong>/debug-mobile/:number</strong> - Debug mobile number search</div>
            
            <h3>?? Bot Capabilities:</h3>
            <ul>
                <li>? Customer query handling with knowledge base</li>
                <li>? Product catalog and pricing information</li>
                <li>? Order placement and confirmation</li>
                <li>? ERPNext integration for order management</li>
                <li>? Customer lookup by mobile number</li>
                <li>? Conversation state management</li>
                <li>? Automatic session cleanup</li>
            </ul>
        </div>
    </body>
    </html>
    `;
    res.send(statusHtml);
});

// Additional debug endpoints (keeping originals)
app.get('/test-dotorders-erp', async (req, res) => {
    try {
        const response = await axios.get(`${DOTORDERS_ERP_URL}/api/method/frappe.auth.get_logged_user`, {
            headers: {
                'Authorization': `token ${DOTORDERS_ERP_API_KEY}:${DOTORDERS_ERP_API_SECRET}`,
                'Content-Type': 'application/json'
            }
        });
        res.json({ status: 'success', message: 'ERPNext connection working!', data: response.data });
    } catch (error) {
        res.status(500).json({ 
            status: 'error', 
            message: 'ERPNext connection failed', 
            error: error.response?.data || error.message
        });
    }
});

// Session management endpoint
app.get('/sessions', (req, res) => {
    const sessions = Array.from(userSessions.entries()).map(([phone, session]) => ({
        phone: phone.substring(0, 8) + '****', // Mask phone numbers for privacy
        state: session.state,
        hasOrder: !!session.orderInProgress,
        lastActivity: new Date(session.lastActivity).toISOString()
    }));
    
    res.json({
        totalSessions: userSessions.size,
        sessions: sessions
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`?? Enhanced Water Delivery Bot running on port ${PORT}`);
    console.log('?? Features: Customer Service + Order Management + ERPNext Integration');
    console.log(`?? Server URL: http://localhost:${PORT}`);
    
    startKeepAlive();
});