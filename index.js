require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const GRAPH_API_TOKEN = process.env.GRAPH_API_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// OpenAI Configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

// ERPNext Configuration
const ERPNEXT_URL = process.env.ERPNEXT_URL || process.env.DOTORDERS_ERP_URL;
const ERPNEXT_API_KEY = process.env.ERPNEXT_API_KEY || process.env.DOTORDERS_ERP_API_KEY;
const ERPNEXT_API_SECRET = process.env.ERPNEXT_API_SECRET || process.env.DOTORDERS_ERP_API_SECRET;

// Keep-alive configuration
const KEEP_ALIVE_URL = process.env.KEEP_ALIVE_URL;
const KEEP_ALIVE_INTERVAL = 25 * 60 * 1000;

// User sessions management
const userSessions = new Map();

// Service area coordinates (UAE major cities)
const SERVICE_AREAS = {
    dubai: { lat: 25.2048, lng: 55.2708, radius: 50 },
    sharjah: { lat: 25.3463, lng: 55.4209, radius: 30 },
    ajman: { lat: 25.4052, lng: 55.5136, radius: 25 }
};

// Product catalog with high priority on coupon books
const PRODUCTS = {
    'coupon_10_1': { 
        name: '10+1 Coupon Book', 
        price: 70, 
        deposit: 0, 
        item_code: 'Coupon Book 10+1',
        description: '11 bottles total (10+1 free) - Save money and time!',
        priority: 1,
        salesPoints: ['Save AED 7 compared to individual bottles', '1 FREE bottle included', 'No deposit required']
    },
    'coupon_100_40': { 
        name: '100+40 Coupon Book', 
        price: 700, 
        deposit: 0, 
        item_code: 'Coupon Book 100+40',
        description: '140 bottles total (100+40 free) - Best value package!',
        priority: 1,
        salesPoints: ['Save AED 280 compared to individual bottles', '40 FREE bottles included', 'Buy now pay later available']
    },
    'single_bottle': { 
        name: 'Single Bottle', 
        price: 7, 
        deposit: 15, 
        item_code: '5 Gallon Filled',
        description: '5-gallon premium water bottle',
        priority: 2,
        salesPoints: ['Perfect for trying our service', 'Premium quality water']
    }
};

// Welcome message for new users
const WELCOME_MESSAGE = `?? WELCOME TO PREMIUM WATER DELIVERY!

Hi! I'm your personal water delivery assistant.

To get started, I need to set up your delivery profile. This is a one-time setup that will make future orders super quick!

Please provide your details:
?? What's your name?`;

// Customer registration flow states
const REGISTRATION_STATES = {
    COLLECTING_NAME: 'collecting_name',
    COLLECTING_BUILDING: 'collecting_building',
    COLLECTING_AREA: 'collecting_area',
    COLLECTING_FLAT: 'collecting_flat',
    COLLECTING_LOCATION: 'collecting_location',
    REGISTRATION_COMPLETE: 'registration_complete'
};

// Main menu for registered customers
const MAIN_MENU = `?? PREMIUM WATER DELIVERY

Choose an option:

1?? *Get a coupon book* (BEST VALUE - Save money!)
2?? *Order a bottle* (Single bottle)
3?? *Check my account* (View your details)
4?? *Customer support* (Get help)

?? *RECOMMENDED:* Coupon books save you money and delivery fees!

Just type the number (1, 2, 3, or 4) or tell me what you want.`;

// Coupon book promotion menu
const COUPON_MENU = `?? COUPON BOOK OPTIONS - SAVE MONEY!

?? *Option 1: 10+1 Coupon Book* - AED 70
• Get 11 bottles (10 + 1 FREE)
• Save AED 7 compared to buying individually
• Perfect for families

?? *Option 2: 100+40 Coupon Book* - AED 700  
• Get 140 bottles (100 + 40 FREE!)
• Save AED 280 compared to buying individually
• Best for offices/large families
• Buy now, pay later available

Which coupon book interests you?
Type *1* for 10+1 or *2* for 100+40
Or type *back* to see other options.`;

// Create user session
function createUserSession(phoneNumber) {
    return {
        phoneNumber: phoneNumber,
        state: 'new_user',
        registrationData: {},
        customerInfo: null,
        currentOrder: null,
        lastActivity: Date.now(),
        conversationHistory: []
    };
}

// Get or create user session
function getSession(phoneNumber) {
    if (!userSessions.has(phoneNumber)) {
        userSessions.set(phoneNumber, createUserSession(phoneNumber));
    }
    const session = userSessions.get(phoneNumber);
    session.lastActivity = Date.now();
    return session;
}

// Check if customer exists in ERPNext - FIXED VERSION
async function checkExistingCustomer(phoneNumber) {
    try {
        const searchUrl = `${ERPNEXT_URL}/api/resource/Customer`;
        const response = await axios.get(searchUrl, {
            headers: {
                'Authorization': `token ${ERPNEXT_API_KEY}:${ERPNEXT_API_SECRET}`,
                'Content-Type': 'application/json'
            },
            params: {
                filters: JSON.stringify([['mobile_no', '=', phoneNumber]]),
                // Only query standard fields that are guaranteed to exist
                fields: JSON.stringify([
                    'name', 'customer_name', 'mobile_no', 'creation'
                ])
            }
        });

        if (response.data.data && response.data.data.length > 0) {
            const customer = response.data.data[0];
            
            // Get full customer details in a separate call
            const customerDetails = await getCustomerDetails(customer.name);
            
            return {
                exists: true,
                customerData: customerDetails || customer,
                missingFields: findMissingFields(customerDetails || customer)
            };
        }
        
        return { exists: false, customerData: null, missingFields: [] };
        
    } catch (error) {
        console.error('Error checking customer:', error.response?.data || error.message);
        return { exists: false, customerData: null, missingFields: [] };
    }
}

// Get full customer details safely
async function getCustomerDetails(customerName) {
    try {
        const response = await axios.get(
            `${ERPNEXT_URL}/api/resource/Customer/${customerName}`,
            {
                headers: {
                    'Authorization': `token ${ERPNEXT_API_KEY}:${ERPNEXT_API_SECRET}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        return response.data.data;
    } catch (error) {
        console.error('Error getting customer details:', error.response?.data || error.message);
        return null;
    }
}

// Find missing required fields - SIMPLIFIED VERSION
function findMissingFields(customerData) {
    const requiredFields = [
        { key: 'customer_name', name: 'Customer Name' }
    ];
    
    const missing = [];
    requiredFields.forEach(field => {
        if (!customerData[field.key] || customerData[field.key] === '') {
            if (!missing.includes(field.name)) {
                missing.push(field.name);
            }
        }
    });
    
    return missing;
}

// Create customer in ERPNext - FIXED VERSION
async function createCustomerInERP(registrationData) {
    try {
        const customerData = {
            doctype: 'Customer',
            customer_name: registrationData.name,
            mobile_no: registrationData.phoneNumber,
            customer_type: 'Individual',
            customer_group: 'Individual',
            territory: 'UAE'
        };
        
        // Only add custom fields if they exist in the system
        // Store address information in standard fields
        if (registrationData.buildingName || registrationData.area || registrationData.flatNo) {
            const addressLine = [
                registrationData.flatNo,
                registrationData.buildingName,
                registrationData.area
            ].filter(Boolean).join(', ');
            
            // Use standard address field instead of custom fields
            customerData.customer_primary_address = addressLine;
        }
        
        const response = await axios.post(
            `${ERPNEXT_URL}/api/resource/Customer`,
            customerData,
            {
                headers: {
                    'Authorization': `token ${ERPNEXT_API_KEY}:${ERPNEXT_API_SECRET}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        // Create a separate address document for GPS coordinates
        if (registrationData.latitude && registrationData.longitude) {
            await createAddressRecord(response.data.data.name, registrationData);
        }
        
        return {
            success: true,
            customerName: response.data.data.name,
            data: response.data.data
        };
        
    } catch (error) {
        console.error('Error creating customer:', error.response?.data || error.message);
        return {
            success: false,
            error: error.response?.data?.message || 'Failed to create customer'
        };
    }
}

// Create address record with GPS coordinates
async function createAddressRecord(customerName, registrationData) {
    try {
        const addressData = {
            doctype: 'Address',
            address_title: customerName,
            address_type: 'Billing',
            address_line1: registrationData.buildingName || '',
            address_line2: registrationData.flatNo || '',
            city: registrationData.area || '',
            country: 'United Arab Emirates',
            links: [{
                link_doctype: 'Customer',
                link_name: customerName
            }]
        };
        
        // Add GPS coordinates as custom fields in address if available
        if (registrationData.latitude && registrationData.longitude) {
            addressData.custom_latitude = registrationData.latitude;
            addressData.custom_longitude = registrationData.longitude;
        }
        
        const response = await axios.post(
            `${ERPNEXT_URL}/api/resource/Address`,
            addressData,
            {
                headers: {
                    'Authorization': `token ${ERPNEXT_API_KEY}:${ERPNEXT_API_SECRET}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        console.log('Address created successfully:', response.data.data.name);
        return response.data.data;
        
    } catch (error) {
        console.error('Error creating address:', error.response?.data || error.message);
        return null;
    }
}

// Update customer in ERPNext - SIMPLIFIED VERSION
async function updateCustomerInERP(customerName, updateData) {
    try {
        const response = await axios.put(
            `${ERPNEXT_URL}/api/resource/Customer/${customerName}`,
            updateData,
            {
                headers: {
                    'Authorization': `token ${ERPNEXT_API_KEY}:${ERPNEXT_API_SECRET}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        return { success: true, data: response.data.data };
        
    } catch (error) {
        console.error('Error updating customer:', error.response?.data || error.message);
        return {
            success: false,
            error: error.response?.data?.message || 'Failed to update customer'
        };
    }
}

// Create sales order in ERPNext
async function createSalesOrder(customerName, product, customerPhone) {
    try {
        const orderData = {
            doctype: 'Sales Order',
            customer: customerName,
            order_type: 'Sales',
            delivery_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            items: [{
                item_code: product.item_code,
                item_name: product.name,
                description: product.description,
                qty: 1,
                rate: product.price,
                amount: product.price
            }]
        };
        
        // Add deposit as separate line item if applicable
        if (product.deposit > 0) {
            orderData.items.push({
                item_code: 'Bottle Deposit',
                item_name: 'Bottle Deposit',
                description: 'Refundable bottle deposit',
                qty: 1,
                rate: product.deposit,
                amount: product.deposit
            });
        }
        
        const response = await axios.post(
            `${ERPNEXT_URL}/api/resource/Sales Order`,
            orderData,
            {
                headers: {
                    'Authorization': `token ${ERPNEXT_API_KEY}:${ERPNEXT_API_SECRET}`,
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
        console.error('Error creating sales order:', error.response?.data || error.message);
        return {
            success: false,
            error: error.response?.data?.message || 'Failed to create order'
        };
    }
}

// Extract location coordinates
function extractLocationCoordinates(message) {
    if (message.location) {
        return {
            latitude: message.location.latitude,
            longitude: message.location.longitude,
            name: message.location.name || 'Customer Location',
            address: message.location.address || ''
        };
    }
    return null;
}

// Validate service area - ONLY GPS VALIDATION
function validateServiceArea(latitude, longitude) {
    for (const [city, area] of Object.entries(SERVICE_AREAS)) {
        const distance = calculateDistance(latitude, longitude, area.lat, area.lng);
        
        if (distance <= area.radius) {
            return {
                isValid: true,
                city: city,
                distance: distance
            };
        }
    }
    
    return {
        isValid: false,
        nearestCity: findNearestCity(latitude, longitude)
    };
}

// Calculate distance between coordinates
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// Find nearest city
function findNearestCity(latitude, longitude) {
    let nearest = null;
    let minDistance = Infinity;
    
    for (const [city, area] of Object.entries(SERVICE_AREAS)) {
        const distance = calculateDistance(latitude, longitude, area.lat, area.lng);
        if (distance < minDistance) {
            minDistance = distance;
            nearest = { city, distance };
        }
    }
    return nearest;
}

// Main message handler
async function handleIncomingMessage(message, phoneNumberId) {
    const phoneNumber = message.from;
    const messageBody = message.text?.body;
    const location = message.location;
    
    console.log(`Message from ${phoneNumber}:`, { text: messageBody, hasLocation: !!location });
    
    const session = getSession(phoneNumber);
    let response = '';
    
    // Check if customer exists first
    if (session.state === 'new_user') {
        const customerCheck = await checkExistingCustomer(phoneNumber);
        
        if (customerCheck.exists) {
            session.customerInfo = customerCheck.customerData;
            
            if (customerCheck.missingFields.length > 0) {
                // Existing customer with missing information
                session.state = 'updating_missing_info';
                response = `Welcome back!

I notice your name is missing from your account. What's your full name?`;
            } else {
                // Complete existing customer
                session.state = 'registered';
                response = `Welcome back, ${customerCheck.customerData.customer_name || 'valued customer'}! ??

${MAIN_MENU}`;
            }
        } else {
            // New customer - start registration
            session.state = REGISTRATION_STATES.COLLECTING_NAME;
            response = WELCOME_MESSAGE;
        }
    }
    // Handle location messages
    else if (location) {
        response = await handleLocationMessage(message, session);
    }
    // Handle text messages based on current state
    else if (messageBody) {
        response = await handleTextMessage(messageBody, session);
    }
    
    await sendMessage(phoneNumber, response, phoneNumberId);
}

// Handle location messages
async function handleLocationMessage(message, session) {
    const locationData = extractLocationCoordinates(message);
    
    if (!locationData) {
        return 'Sorry, I could not extract your location. Please try sharing your location again using the ?? attachment button.';
    }
    
    const validation = validateServiceArea(locationData.latitude, locationData.longitude);
    
    if (!validation.isValid) {
        return `?? Location received but outside our service area!

?? Your location is outside Dubai, Sharjah, or Ajman
?? Nearest service area: ${validation.nearestCity?.city} (${validation.nearestCity?.distance.toFixed(1)} km away)

We currently serve Dubai, Sharjah, and Ajman. We're expanding soon!`;
    }
    
    // Store location data
    session.registrationData.latitude = locationData.latitude;
    session.registrationData.longitude = locationData.longitude;
    session.registrationData.phoneNumber = session.phoneNumber;
    
    // Complete registration
    const customerResult = await createCustomerInERP(session.registrationData);
    
    if (customerResult.success) {
        session.state = 'registered';
        session.customerInfo = customerResult.data;
        
        return `? Registration Complete!

?? Location confirmed: ${validation.city.toUpperCase()}
?? Customer profile created successfully!

${MAIN_MENU}`;
    } else {
        return `? Registration Error

There was an issue creating your profile. Please try again or contact support.

Error: ${customerResult.error}`;
    }
}

// Handle text messages
async function handleTextMessage(messageBody, session) {
    const text = messageBody.toLowerCase().trim();
    
    switch (session.state) {
        case REGISTRATION_STATES.COLLECTING_NAME:
            if (text.length < 2) {
                return "Please provide your full name (at least 2 characters).";
            }
            session.registrationData.name = messageBody.trim();
            session.state = REGISTRATION_STATES.COLLECTING_BUILDING;
            return "?? Thanks! Now, what's your building name or number?";
            
        case REGISTRATION_STATES.COLLECTING_BUILDING:
            if (text.length < 1) {
                return "Please provide your building name or number.";
            }
            session.registrationData.buildingName = messageBody.trim();
            session.state = REGISTRATION_STATES.COLLECTING_AREA;
            return "??? Got it! What area/neighborhood are you in?\n\n?? Just type any area name - no validation needed!";
            
        case REGISTRATION_STATES.COLLECTING_AREA:
            if (text.length < 2) {
                return "Please provide your area or neighborhood name.";
            }
            // NO AREA VALIDATION - Just store whatever they type
            session.registrationData.area = messageBody.trim();
            session.state = REGISTRATION_STATES.COLLECTING_FLAT;
            return "?? Perfect! What's your flat/apartment number?";
            
        case REGISTRATION_STATES.COLLECTING_FLAT:
            if (text.length < 1) {
                return "Please provide your flat or apartment number.";
            }
            session.registrationData.flatNo = messageBody.trim();
            session.state = REGISTRATION_STATES.COLLECTING_LOCATION;
            return `?? Almost done! Now I need your GPS location for accurate delivery.

Please tap the ?? attachment button ? Location ? Share your current location.

This helps us:
? Find you easily during delivery
? Validate service area (Dubai, Sharjah, Ajman only)
? Optimize our delivery routes

Please share your location now.`;
            
        case 'registered':
            return await handleRegisteredCustomerMessage(text, session);
            
        case 'updating_missing_info':
            return await handleMissingInfoUpdate(messageBody, session);
            
        case 'ordering_coupon':
            return await handleCouponOrder(text, session);
            
        case 'confirming_order':
            return await handleOrderConfirmation(text, session);
            
        default:
            return "I didn't understand that. Please try again.";
    }
}

// Handle messages from registered customers
async function handleRegisteredCustomerMessage(text, session) {
    if (text.includes('1') || text.includes('coupon') || text.includes('book')) {
        session.state = 'ordering_coupon';
        return COUPON_MENU;
    }
    
    if (text.includes('2') || text.includes('bottle') || text.includes('single')) {
        // Offer coupon first, then single bottle
        return `?? Before ordering a single bottle, did you know?

?? *BETTER VALUE:* Our 10+1 Coupon Book costs AED 70
• You get 11 bottles (10 + 1 FREE)
• Save AED 7 compared to buying single bottles
• No deposit required per bottle

?? *Single Bottle:* AED 7 + AED 15 deposit = AED 22 total

Would you prefer:
*A* - 10+1 Coupon Book (Better value!)
*B* - Single Bottle
*C* - Back to main menu

Type A, B, or C`;
    }
    
    if (text.includes('3') || text.includes('account') || text.includes('check')) {
        return await generateAccountInfo(session);
    }
    
    if (text.includes('4') || text.includes('support') || text.includes('help')) {
        return `?? CUSTOMER SUPPORT

?? Call us: +971-XX-XXXX-XXX
?? WhatsApp: This number
?? Email: support@waterdelivery.com

?? Support Hours:
Monday - Sunday: 8:00 AM - 10:00 PM

How can we help you today?
• Delivery questions
• Product information
• Account issues
• Complaints or feedback

Just tell me what you need help with!`;
    }
    
    // If not clear, show menu again
    return `I didn't understand that. Here are your options:

${MAIN_MENU}`;
}

// Handle missing information updates - SIMPLIFIED
async function handleMissingInfoUpdate(messageBody, session) {
    const updateData = {
        customer_name: messageBody.trim()
    };
    
    // Update customer in ERP
    const updateResult = await updateCustomerInERP(session.customerInfo.name, updateData);
    
    if (updateResult.success) {
        session.state = 'registered';
        session.customerInfo.customer_name = messageBody.trim();
        return `? Your name has been updated!

${MAIN_MENU}`;
    } else {
        return `? Error updating your information. Please try again.

Error: ${updateResult.error}`;
    }
}

// Handle coupon book orders
async function handleCouponOrder(text, session) {
    let selectedProduct = null;
    
    if (text.includes('1') || text.includes('10')) {
        selectedProduct = PRODUCTS.coupon_10_1;
    } else if (text.includes('2') || text.includes('100')) {
        selectedProduct = PRODUCTS.coupon_100_40;
    } else if (text.includes('back')) {
        session.state = 'registered';
        return MAIN_MENU;
    } else {
        return `Please select an option:
*1* for 10+1 Coupon Book
*2* for 100+40 Coupon Book
*back* for main menu`;
    }
    
    session.currentOrder = selectedProduct;
    session.state = 'confirming_order';
    
    const total = selectedProduct.price + selectedProduct.deposit;
    
    return `?? ORDER CONFIRMATION

?? Product: ${selectedProduct.name}
?? Description: ${selectedProduct.description}
?? Price: AED ${selectedProduct.price}
${selectedProduct.deposit > 0 ? `?? Deposit: AED ${selectedProduct.deposit}` : ''}
?? TOTAL: AED ${total}

? Benefits:
${selectedProduct.salesPoints.map(point => `• ${point}`).join('\n')}

?? Delivery to: ${session.customerInfo.customer_primary_address || 'Your registered address'}
?? Payment: Cash on delivery

Reply *YES* to confirm or *NO* to cancel.`;
}

// Handle order confirmations
async function handleOrderConfirmation(text, session) {
    if (text.includes('yes') || text.includes('confirm')) {
        // Process the order
        const orderResult = await createSalesOrder(
            session.customerInfo.name, 
            session.currentOrder,
            session.phoneNumber
        );
        
        if (orderResult.success) {
            session.state = 'registered';
            const currentOrder = session.currentOrder;
            session.currentOrder = null;
            
            return `?? ORDER CONFIRMED!

?? Order Number: ${orderResult.orderName}
?? Product: ${currentOrder.name}
?? Total: AED ${currentOrder.price + currentOrder.deposit}

?? NEXT STEPS:
• Our delivery team will call you within 2 hours
• Delivery within 24 hours
• Payment on delivery (Cash/Card)

Thank you for choosing our premium water service! ??

${MAIN_MENU}`;
        } else {
            return `? Order processing failed. Please try again or contact support.
            
Error: ${orderResult.error}`;
        }
    } else if (text.includes('no') || text.includes('cancel')) {
        session.state = 'registered';
        session.currentOrder = null;
        return `Order cancelled. No problem!

${MAIN_MENU}`;
    } else {
        return `Please reply *YES* to confirm your order or *NO* to cancel.`;
    }
}

// Generate account information - SIMPLIFIED
async function generateAccountInfo(session) {
    const customer = session.customerInfo;
    
    return `?? YOUR ACCOUNT DETAILS

?? Phone: ${customer.mobile_no}
?? Name: ${customer.customer_name || 'Not provided'}
?? Address: ${customer.customer_primary_address || 'Not provided'}
?? Member Since: ${new Date(customer.creation).toLocaleDateString()}

Need to update any information? Just let me know!

${MAIN_MENU}`;
}

// Send WhatsApp message
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
        console.log('Message sent successfully to:', to);
    } catch (error) {
        console.error('Error sending message:', error.response?.data || error.message);
    }
}

// Keep-alive function
async function keepAlive() {
    if (!KEEP_ALIVE_URL) return;
    
    try {
        await axios.get(`${KEEP_ALIVE_URL}/health`, { timeout: 30000 });
        console.log(`Keep-alive ping successful at ${new Date().toISOString()}`);
    } catch (error) {
        console.error(`Keep-alive ping failed:`, error.message);
    }
}

function startKeepAlive() {
    if (!KEEP_ALIVE_URL) return;
    console.log(`Starting keep-alive service - pinging every ${KEEP_ALIVE_INTERVAL / 60000} minutes`);
    setInterval(keepAlive, KEEP_ALIVE_INTERVAL);
}

// Session cleanup
setInterval(() => {
    const now = Date.now();
    const twoHours = 2 * 60 * 60 * 1000;
    
    for (const [phone, session] of userSessions.entries()) {
        if (now - session.lastActivity > twoHours) {
            userSessions.delete(phone);
            console.log(`Cleaned up session: ${phone}`);
        }
    }
}, 30 * 60 * 1000);

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '6.1.0-Fixed-ERPNext-Integration',
        activeSessions: userSessions.size,
        features: {
            customerRegistration: true,
            couponBookPriority: true,
            automaticAccountDetection: true,
            gpsLocationOnlyValidation: true,
            erpNextIntegration: !!(ERPNEXT_URL && ERPNEXT_API_KEY),
            fixedAreaValidation: true
        }
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

// Analytics endpoint
app.get('/analytics', (req, res) => {
    const analytics = {
        totalSessions: userSessions.size,
        registrationStates: {},
        customerTypes: {
            new: 0,
            existing: 0,
            incomplete: 0
        }
    };
    
    userSessions.forEach(session => {
        analytics.registrationStates[session.state] = 
            (analytics.registrationStates[session.state] || 0) + 1;
            
        if (session.customerInfo) {
            analytics.customerTypes.existing++;
        } else if (session.state.includes('collecting')) {
            analytics.customerTypes.new++;
        }
    });
    
    res.json(analytics);
});

// Homepage
app.get('/', (req, res) => {
    const statusHtml = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>WhatsApp Water Delivery Bot - Fixed ERPNext Integration</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
            .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .status { padding: 20px; background: #e8f5e8; border-radius: 8px; margin: 20px 0; }
            .feature { margin: 15px 0; padding: 15px; background: #f8f8f8; border-radius: 6px; border-left: 4px solid #28a745; }
            .fix { margin: 10px 0; padding: 12px; background: #d1ecf1; border-radius: 6px; border-left: 4px solid #17a2b8; }
            .active { color: #28a745; font-weight: bold; }
            .inactive { color: #ffc107; }
            h1 { color: #333; text-align: center; }
            h2, h3 { color: #007bff; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>?? WhatsApp Water Delivery Bot v6.1</h1>
            
            <div class="status">
                <h2>Status: <span class="active">FIXED ERPNEXT INTEGRATION</span></h2>
                <p><strong>Version:</strong> 6.1.0-Fixed-ERPNext-Integration</p>
                <p><strong>Active Sessions:</strong> ${userSessions.size}</p>
                <p><strong>ERPNext Integration:</strong> <span class="${ERPNEXT_URL ? 'active' : 'inactive'}">${ERPNEXT_URL ? 'ENABLED' : 'DISABLED'}</span></p>
            </div>

            <h3>?? BUG FIXES APPLIED:</h3>
            <div class="fix">? Removed problematic custom field queries (custom_building_name, etc.)</div>
            <div class="fix">? Removed area validation - only GPS location is validated</div>
            <div class="fix">? Use standard Customer fields only for queries</div>
            <div class="fix">? Store address info in customer_primary_address field</div>
            <div class="fix">? Create separate Address document for GPS coordinates</div>
            <div class="fix">? Simplified missing field detection</div>

            <h3>?? AREA HANDLING:</h3>
            <div class="feature">?? Manual area entry: NO validation, just store text</div>
            <div class="feature">?? GPS location: ONLY validation point for service area</div>
            <div class="feature">?? Service areas: Dubai, Sharjah, Ajman (GPS radius check)</div>

            <h3>?? ERPNEXT INTEGRATION (FIXED):</h3>
            <div class="feature"><strong>Customer Creation:</strong> Standard fields only</div>
            <div class="feature"><strong>Address Creation:</strong> Separate document with GPS</div>
            <div class="feature"><strong>Safe Queries:</strong> Only guaranteed fields</div>
            <div class="feature"><strong>Error Handling:</strong> Graceful fallbacks</div>

            <h3>?? ANALYTICS:</h3>
            <div class="feature"><strong>/analytics</strong> - View session statistics</div>
            <div class="feature"><strong>/health</strong> - System health check</div>
        </div>
    </body>
    </html>
    `;
    res.send(statusHtml);
});

app.listen(PORT, () => {
    console.log(`?? WhatsApp Water Delivery Bot v6.2 running on port ${PORT}`);
    console.log('?? Single Item Strategy: All orders use "5 Gallon Water" with different quantities');
    console.log('?? Quantities: 1 (single), 11 (10+1), 140 (100+40)');
    console.log('?? GPS Validation Only: Area text input has no validation');
    console.log('? ERPNext Compatible: Uses existing item with detailed descriptions');
    
    if (!ERPNEXT_URL) {
        console.warn('??  ERPNEXT_URL not configured');
    }
    
    startKeepAlive();
});