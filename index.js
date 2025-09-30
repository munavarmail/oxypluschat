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

// Product catalog
const PRODUCTS = {
    'coupon_10_1': { 
        name: '10+1 Coupon Book', 
        price: 65, 
        deposit: 0, 
        item_code: '5 Gallon Water',
        qty: 11,
        description: '10+1 Coupon Book - 11 bottles total (10 bottles + 1 FREE bonus bottle)',
        priority: 1,
        salesPoints: ['11 bottles for AED 65', '1 FREE bottle included', 'Perfect for small families']
    },
    'coupon_25_5': { 
        name: '25+5 Coupon Book', 
        price: 175, 
        deposit: 0, 
        item_code: '5 Gallon Water',
        qty: 30,
        description: '25+5 Coupon Book - 30 bottles total (25 bottles + 5 FREE bonus bottles)',
        priority: 1,
        salesPoints: ['30 bottles for AED 175', '5 FREE bottles included', 'Great value for families']
    },
    'coupon_30_7': { 
        name: '30+7 Coupon Book', 
        price: 210, 
        deposit: 0, 
        item_code: '5 Gallon Water',
        qty: 37,
        description: '30+7 Coupon Book - 37 bottles total (30 bottles + 7 FREE bonus bottles)',
        priority: 1,
        salesPoints: ['37 bottles for AED 210', '7 FREE bottles included', 'Popular choice']
    },
    'coupon_100_40': { 
        name: '100+40 Coupon Book', 
        price: 700, 
        deposit: 0, 
        item_code: '5 Gallon Water',
        qty: 140,
        description: '100+40 Coupon Book - 140 bottles total (100 bottles + 40 FREE bonus bottles)',
        priority: 1,
        salesPoints: ['140 bottles for AED 700', '40 FREE bottles included', 'Best value for offices']
    },
    'coupon_100_cooler': { 
        name: '100 Bottles + Cooler', 
        price: 800, 
        deposit: 0, 
        item_code: '5 Gallon Water',
        qty: 100,
        description: '100 Bottles + FREE Water Cooler - Complete water solution package',
        priority: 1,
        salesPoints: ['100 bottles + FREE cooler', 'Complete package for AED 800', 'Perfect for offices']
    }
};

// Welcome message
const WELCOME_MESSAGE = `WELCOME TO PREMIUM WATER DELIVERY!

Hi! I'm your personal water delivery assistant.

To get started, I need to set up your delivery profile. This is a one-time setup that will make future orders super quick!

Please provide your details:
What's your name?`;

// Registration states
const REGISTRATION_STATES = {
    COLLECTING_NAME: 'collecting_name',
    COLLECTING_BUILDING: 'collecting_building',
    COLLECTING_AREA: 'collecting_area',
    COLLECTING_FLAT: 'collecting_flat',
    COLLECTING_LOCATION: 'collecting_location',
    REGISTRATION_COMPLETE: 'registration_complete'
};

// Customer status types (kept for compatibility but won't use Lead)
const CUSTOMER_STATUS = {
    CUSTOMER: 'Customer'
};

// Create user session
function createUserSession(phoneNumber) {
    return {
        phoneNumber: phoneNumber,
        state: 'new_user',
        registrationData: {},
        customerInfo: null,
        customerStatus: null, // 'Lead' or 'Customer'
        currentOrder: null,
        lastActivity: Date.now(),
        conversationHistory: [],
        hasPlacedOrder: false
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

// Check if customer exists in database
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
                fields: JSON.stringify(['name', 'customer_name', 'mobile_no', 'custom_customer_status'])
            }
        });

        if (response.data.data && response.data.data.length > 0) {
            const customer = response.data.data[0];
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

// Get customer details
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

// Find missing fields
function findMissingFields(customerData) {
    const requiredFields = [
        { key: 'customer_name', name: 'Customer Name' },
        { key: 'customer_primary_address', name: 'Address' }
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

// Create customer with full information (no Lead status)
async function createCustomerInERP(registrationData) {
    try {
        const customerData = {
            doctype: 'Customer',
            customer_name: registrationData.name,
            mobile_no: registrationData.phoneNumber,
            customer_type: 'Individual',
            customer_group: 'Individual',
            territory: '',
            custom_payment_mode: 'Cash',
            custom_customer_status: CUSTOMER_STATUS.CUSTOMER,
            custom_coupon_bottle: 0,
            // Delivery days
            custom_saturday: 0,
            custom_sunday: 0,
            custom_monday: 0,
            custom_tuesday: 1,
            custom_wednesday: 0,
            custom_thursday: 0,
            custom_friday: 0
        };
        
        console.log('Creating customer with full data:', customerData);
        
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
        
        console.log('Customer created successfully:', response.data.data.name);
        
        // Create address with GPS coordinates
        if (registrationData.latitude && registrationData.longitude) {
            await createAddressRecord(response.data.data.name, registrationData);
        }
        
        // Create contact
        await createContactRecord(response.data.data.name, registrationData);
        
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

// Create address record
async function createAddressRecord(customerName, registrationData) {
    try {
        const addressData = {
            doctype: 'Address',
            address_title: `${customerName} - Delivery`,
            address_type: 'Billing',
            address_line1: `${registrationData.buildingName || ''} ${registrationData.flatNo || ''}`.trim(),
            address_line2: registrationData.area || '',
            country: 'United Arab Emirates',
            links: [{
                link_doctype: 'Customer',
                link_name: customerName
            }]
        };
        
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
        
        console.log('Address created successfully');
        await updateCustomerPrimaryAddress(customerName, response.data.data.name);
        
        return response.data.data;
        
    } catch (error) {
        console.error('Error creating address:', error.response?.data || error.message);
        return null;
    }
}

// Create contact record
async function createContactRecord(customerName, registrationData) {
    try {
        const contactData = {
            doctype: 'Contact',
            first_name: registrationData.name.split(' ')[0] || registrationData.name,
            last_name: registrationData.name.split(' ').slice(1).join(' ') || '',
            mobile_no: registrationData.phoneNumber,
            links: [{
                link_doctype: 'Customer',
                link_name: customerName
            }]
        };
        
        const response = await axios.post(
            `${ERPNEXT_URL}/api/resource/Contact`,
            contactData,
            {
                headers: {
                    'Authorization': `token ${ERPNEXT_API_KEY}:${ERPNEXT_API_SECRET}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        console.log('Contact created successfully');
        await updateCustomerPrimaryContact(customerName, response.data.data.name);
        
        return response.data.data;
        
    } catch (error) {
        console.error('Error creating contact:', error.response?.data || error.message);
        return null;
    }
}

// Update customer primary address
async function updateCustomerPrimaryAddress(customerName, addressName) {
    try {
        await axios.put(
            `${ERPNEXT_URL}/api/resource/Customer/${customerName}`,
            { customer_primary_address: addressName },
            {
                headers: {
                    'Authorization': `token ${ERPNEXT_API_KEY}:${ERPNEXT_API_SECRET}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        console.log('Customer primary address updated');
    } catch (error) {
        console.error('Error updating primary address:', error.message);
    }
}

// Update customer primary contact
async function updateCustomerPrimaryContact(customerName, contactName) {
    try {
        await axios.put(
            `${ERPNEXT_URL}/api/resource/Customer/${customerName}`,
            { customer_primary_contact: contactName },
            {
                headers: {
                    'Authorization': `token ${ERPNEXT_API_KEY}:${ERPNEXT_API_SECRET}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        console.log('Customer primary contact updated');
    } catch (error) {
        console.error('Error updating primary contact:', error.message);
    }
}

// Create sales order
async function createSalesOrder(customerName, product, customerPhone) {
    try {
        const ratePerBottle = product.price / product.qty;
        
        const orderData = {
            doctype: 'Sales Order',
            customer: customerName,
            order_type: 'Sales',
            delivery_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            items: [{
                item_code: '5 Gallon Water',
                item_name: product.name,
                description: product.description,
                qty: product.qty,
                rate: ratePerBottle,
                amount: product.price
            }]
        };
        
        if (product.deposit > 0) {
            orderData.items.push({
                item_code: '5 Gallon Water',
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
        
        console.log('Sales order created:', response.data.data.name);
        
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

// Validate service area
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

// Calculate distance
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

// Send WhatsApp message (buttons or text)
async function sendMessage(to, message, phoneNumberId, buttons = null) {
    try {
        let messageData = {
            messaging_product: 'whatsapp',
            to: to
        };

        if (buttons && buttons.length > 0) {
            const validButtons = buttons.slice(0, 3).filter(btn => 
                btn.id && btn.title && btn.title.trim().length > 0 && btn.title.length <= 20
            );
            
            if (validButtons.length === 0) {
                messageData.type = 'text';
                messageData.text = { body: message };
            } else {
                messageData.type = 'interactive';
                messageData.interactive = {
                    type: 'button',
                    body: { text: message },
                    action: {
                        buttons: validButtons.map(btn => ({
                            type: 'reply',
                            reply: {
                                id: btn.id,
                                title: btn.title.substring(0, 20).trim()
                            }
                        }))
                    }
                };
            }
        } else {
            messageData.type = 'text';
            messageData.text = { body: message };
        }

        await axios.post(
            `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
            messageData,
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

// Send WhatsApp list message
async function sendListMessage(to, bodyText, buttonText, sections, phoneNumberId, header = null, footer = null) {
    try {
        const messageData = {
            messaging_product: 'whatsapp',
            to: to,
            type: 'interactive',
            interactive: {
                type: 'list',
                body: {
                    text: bodyText
                },
                action: {
                    button: buttonText.substring(0, 20), // Max 20 chars
                    sections: sections
                }
            }
        };

        // Optional header
        if (header) {
            messageData.interactive.header = {
                type: 'text',
                text: header.substring(0, 60) // Max 60 chars
            };
        }

        // Optional footer
        if (footer) {
            messageData.interactive.footer = {
                text: footer.substring(0, 60) // Max 60 chars
            };
        }

        await axios.post(
            `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
            messageData,
            {
                headers: {
                    'Authorization': `Bearer ${GRAPH_API_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        console.log('List message sent successfully');
    } catch (error) {
        console.error('Error sending list message:', error.response?.data || error.message);
    }
}

// Main message handler
async function handleIncomingMessage(message, phoneNumberId) {
    const phoneNumber = message.from;
    const messageBody = message.text?.body;
    const location = message.location;
    const buttonReply = message.interactive?.button_reply?.id;
    const listReply = message.interactive?.list_reply?.id;
    
    const session = getSession(phoneNumber);
    let response = '';
    let buttons = null;
    let listData = null;
    
    // Handle button replies
    if (buttonReply) {
        const result = await handleButtonReply(buttonReply, session);
        response = result.message;
        buttons = result.buttons;
        listData = result.listData;
    }
    // Handle list replies (product selection)
    else if (listReply) {
        const result = await handleListReply(listReply, session);
        response = result.message;
        buttons = result.buttons;
    }
    // WORKFLOW: Check if customer exists in DB (automatic detection)
    else if (session.state === 'new_user') {
        const customerCheck = await checkExistingCustomer(phoneNumber);
        
        if (customerCheck.exists) {
            // Customer exists in DB
            session.customerInfo = customerCheck.customerData;
            session.customerStatus = CUSTOMER_STATUS.CUSTOMER;
            
            if (customerCheck.missingFields.length > 0) {
                // Info is missing - capture it
                session.state = 'updating_missing_info';
                session.missingFieldsList = customerCheck.missingFields;
                response = `Welcome back!\n\nYour account is incomplete. We need the following information:\n${customerCheck.missingFields.join(', ')}\n\nLet's start with your full name:`;
            } else {
                // All info is captured - proceed normally
                session.state = 'registered';
                const result = generateMainMenu(session);
                response = result.message;
                buttons = result.buttons;
            }
        } else {
            // Customer NOT in DB - start registration directly
            session.state = REGISTRATION_STATES.COLLECTING_NAME;
            response = WELCOME_MESSAGE;
        }
    }
    // Handle location messages
    else if (location) {
        const result = await handleLocationMessage(message, session);
        response = result.message;
        buttons = result.buttons;
    }
    // Handle text messages
    else if (messageBody) {
        const result = await handleTextMessage(messageBody, session);
        response = result.message;
        buttons = result.buttons;
        listData = result.listData;
    }
    
    // Send appropriate message type
    if (listData) {
        await sendListMessage(phoneNumber, listData.body, listData.buttonText, listData.sections, phoneNumberId, listData.header, listData.footer);
    } else {
        await sendMessage(phoneNumber, response, phoneNumberId, buttons);
    }
}

// Handle button replies
async function handleButtonReply(buttonId, session) {
    switch (buttonId) {
        case 'view_products':
            session.state = 'viewing_products';
            return generateProductListMessage();
            
        case 'more_options':
            return generateMoreOptionsMenu();
            
        case 'check_account':
            return await generateAccountInfo(session);
            
        case 'customer_support':
            return generateSupportInfo();
            
        case 'back_to_menu':
            session.state = 'registered';
            return generateMainMenu(session);
            
        case 'confirm_order':
            return await handleOrderConfirmation('yes', session);
            
        case 'cancel_order':
            return await handleOrderConfirmation('no', session);
            
        default:
            return { message: "I didn't understand that selection. Please try again.", buttons: null };
    }
}

// Handle list replies (product selection)
async function handleListReply(listReplyId, session) {
    // Product selection
    if (listReplyId.startsWith('product_')) {
        const productKey = listReplyId.replace('product_', '');
        
        if (PRODUCTS[productKey]) {
            session.currentOrder = PRODUCTS[productKey];
            session.state = 'confirming_order';
            return generateOrderConfirmation(session);
        }
    }
    
    return { 
        message: "I didn't understand that selection. Please try again.", 
        buttons: null 
    };
}

// Generate main menu with buttons
function generateMainMenu(session) {
    const customerName = session.customerInfo?.customer_name || 'valued customer';
    const message = `Welcome back, ${customerName}!\n\nPREMIUM WATER DELIVERY\n\nWhat would you like to do today?`;
    
    const buttons = [
        { id: 'view_products', title: 'View Products' },
        { id: 'check_account', title: 'My Account' },
        { id: 'more_options', title: 'More Options' }
    ];
    
    return { message, buttons };
}

// Generate more options menu
function generateMoreOptionsMenu() {
    const message = `MORE OPTIONS\n\nWhat would you like to do?`;
    
    const buttons = [
        { id: 'customer_support', title: 'Support' },
        { id: 'back_to_menu', title: 'Back to Menu' }
    ];
    
    return { message, buttons };
}

// Generate product list as WhatsApp interactive list
function generateProductListMessage() {
    const sections = [
        {
            title: "Family Packages", // Max 24 chars
            rows: [
                {
                    id: "product_coupon_10_1",
                    title: "10+1 - AED 65", // Max 24 chars
                    description: "11 bottles total. 1 FREE bottle. Small families." // Max 72 chars
                },
                {
                    id: "product_coupon_25_5",
                    title: "25+5 - AED 175", // Max 24 chars
                    description: "30 bottles total. 5 FREE bottles. Great value!" // Max 72 chars
                },
                {
                    id: "product_coupon_30_7",
                    title: "30+7 - AED 210", // Max 24 chars
                    description: "37 bottles total. 7 FREE bottles. Popular choice!" // Max 72 chars
                }
            ]
        },
        {
            title: "Premium Packages",
            rows: [
                {
                    id: "product_coupon_100_40",
                    title: "100+40 - AED 700", // Max 24 chars
                    description: "140 bottles. 40 FREE bottles. Best value package!" // Max 72 chars
                },
                {
                    id: "product_coupon_100_cooler",
                    title: "100+Cooler - AED 800", // Max 24 chars
                    description: "100 bottles + FREE cooler. Complete solution!" // Max 72 chars
                }
            ]
        }
    ];
    
    return {
        message: null,
        buttons: null,
        listData: {
            header: "WATER DELIVERY",
            body: "Choose your package. All coupon books include FREE bonus bottles! Cooler package includes a FREE water cooler.",
            buttonText: "View Products",
            footer: "Cash on delivery",
            sections: sections
        }
    };
}

// Keep old text-based function for fallback
function generateProductList() {
    const message = `PRODUCT CATALOG

1. 10+1 COUPON - AED 65
   11 bottles total (10 + 1 FREE)
   Perfect for small families

2. 25+5 COUPON - AED 175
   30 bottles total (25 + 5 FREE)
   Great value package

3. 30+7 COUPON - AED 210
   37 bottles total (30 + 7 FREE)
   Popular choice!

4. 100+40 COUPON - AED 700
   140 bottles total (100 + 40 FREE)
   Best value for offices

5. 100 + COOLER - AED 800
   100 bottles + FREE water cooler
   Complete package!

Reply with number (1-5) to order, or type 'menu' to go back.`;
    
    return { message, buttons: null };
}

// Generate order confirmation with buttons
function generateOrderConfirmation(session) {
    const product = session.currentOrder;
    const total = product.price + product.deposit;
    
    const message = `ORDER CONFIRMATION

Product: ${product.name}
Quantity: ${product.qty} bottles
Price: AED ${product.price}${product.deposit > 0 ? `\nDeposit: AED ${product.deposit}` : ''}
TOTAL: AED ${total}

Benefits:
${product.salesPoints.map(point => `- ${point}`).join('\n')}

Delivery: Your registered GPS location
Payment: Cash on delivery

Confirm your order?`;
    
    const buttons = [
        { id: 'confirm_order', title: 'Confirm Order' },
        { id: 'cancel_order', title: 'Cancel' }
    ];
    
    return { message, buttons };
}

// Generate support info
function generateSupportInfo() {
    const message = `CUSTOMER SUPPORT

Call: +971-XX-XXXX-XXX
WhatsApp: This number
Email: support@waterdelivery.com

Support Hours:
Monday - Sunday: 8:00 AM - 10:00 PM

How can we help you today?`;
    
    const buttons = [
        { id: 'back_to_menu', title: 'Back to Menu' }
    ];
    
    return { message, buttons };
}

// Handle location messages
async function handleLocationMessage(message, session) {
    const locationData = extractLocationCoordinates(message);
    
    if (!locationData) {
        return { 
            message: 'Sorry, I could not extract your location. Please try sharing again.',
            buttons: null
        };
    }
    
    const validation = validateServiceArea(locationData.latitude, locationData.longitude);
    
    if (!validation.isValid) {
        return {
            message: `Location outside our service area!\n\nNearest service: ${validation.nearestCity?.city} (${validation.nearestCity?.distance.toFixed(1)} km away)\n\nWe currently serve Dubai, Sharjah, and Ajman.`,
            buttons: null
        };
    }
    
    // Store location
    session.registrationData.latitude = locationData.latitude;
    session.registrationData.longitude = locationData.longitude;
    session.registrationData.phoneNumber = session.phoneNumber;
    
    // Create customer with full information
    const customerResult = await createCustomerInERP(session.registrationData);
    
    if (customerResult.success) {
        // Set customer info and state
        session.customerInfo = customerResult.data;
        session.customerStatus = CUSTOMER_STATUS.CUSTOMER;
        session.state = 'registered';
        
        const mainMenu = generateMainMenu(session);
        return {
            message: `Registration Complete!\n\nLocation confirmed: ${validation.city.toUpperCase()}\nYour profile has been created successfully!\n\n${mainMenu.message}`,
            buttons: mainMenu.buttons
        };
    } else {
        return {
            message: `Error creating your profile. Please contact support.\n\nError: ${customerResult.error}`,
            buttons: null
        };
    }
}

// Handle text messages
async function handleTextMessage(messageBody, session) {
    const text = messageBody.toLowerCase().trim();
    
    switch (session.state) {
        case REGISTRATION_STATES.COLLECTING_NAME:
            if (text.length < 2) {
                return { message: "Please provide your full name (at least 2 characters).", buttons: null };
            }
            session.registrationData.name = messageBody.trim();
            session.state = REGISTRATION_STATES.COLLECTING_BUILDING;
            return { message: "Thanks! What's your building name or number?", buttons: null };
            
        case REGISTRATION_STATES.COLLECTING_BUILDING:
            session.registrationData.buildingName = messageBody.trim();
            session.state = REGISTRATION_STATES.COLLECTING_AREA;
            return { message: "What area/neighborhood are you in?", buttons: null };
            
        case REGISTRATION_STATES.COLLECTING_AREA:
            session.registrationData.area = messageBody.trim();
            session.state = REGISTRATION_STATES.COLLECTING_FLAT;
            return { message: "What's your flat/apartment number?", buttons: null };
            
        case REGISTRATION_STATES.COLLECTING_FLAT:
            session.registrationData.flatNo = messageBody.trim();
            session.state = REGISTRATION_STATES.COLLECTING_LOCATION;
            return { 
                message: `Almost done!\n\nPlease share your GPS location using the attachment button.\n\nThis helps us:\n- Find you easily\n- Validate service area\n- Optimize delivery routes`,
                buttons: null
            };
            
        case 'registered':
            return await handleRegisteredCustomerMessage(text, session);
            
        case 'viewing_products':
            // Handle product selection by number or show list again
            if (text === '1' || text === '2' || text === '3' || text === '4' || text === '5' || text.includes('coupon') || text.includes('cooler')) {
                return await handleProductSelectionByNumber(text, session);
            } else if (text.includes('menu') || text.includes('back')) {
                session.state = 'registered';
                return generateMainMenu(session);
            } else {
                // Show list again
                return generateProductListMessage();
            }
            
        case 'confirming_order':
            return await handleOrderConfirmation(text, session);
            
        case 'updating_missing_info':
            // Update the customer name
            const updateData = { customer_name: messageBody.trim() };
            const updateResult = await updateCustomerInERP(session.customerInfo.name, updateData);
            
            if (updateResult.success) {
                session.customerInfo.customer_name = messageBody.trim();
                
                // Check if there are more missing fields
                const stillMissing = findMissingFields(session.customerInfo);
                
                if (stillMissing.length > 0) {
                    // Still have missing fields, continue updating
                    return {
                        message: `Great! Now we need: ${stillMissing.join(', ')}\n\nPlease provide the next information.`,
                        buttons: null
                    };
                } else {
                    // All info collected, proceed to menu
                    session.state = 'registered';
                    const mainMenu = generateMainMenu(session);
                    return {
                        message: `Your information has been updated!\n\n${mainMenu.message}`,
                        buttons: mainMenu.buttons
                    };
                }
            } else {
                return {
                    message: `Error updating your information. Please try again.\n\nError: ${updateResult.error}`,
                    buttons: null
                };
            }
            
        default:
            // Fallback for any unhandled states
            console.log(`Unhandled state: ${session.state}, resetting to new_user`);
            session.state = 'new_user';
            
            // Re-check customer existence
            const customerCheck = await checkExistingCustomer(session.phoneNumber);
            
            if (customerCheck.exists) {
                session.customerInfo = customerCheck.customerData;
                session.customerStatus = CUSTOMER_STATUS.CUSTOMER;
                
                if (customerCheck.missingFields.length > 0) {
                    session.state = 'updating_missing_info';
                    return {
                        message: `Welcome back! Your account needs some information. What's your full name?`,
                        buttons: null
                    };
                } else {
                    session.state = 'registered';
                    return generateMainMenu(session);
                }
            } else {
                session.state = REGISTRATION_STATES.COLLECTING_NAME;
                return { message: WELCOME_MESSAGE, buttons: null };
            }
    }
}

// Handle registered customer messages
async function handleRegisteredCustomerMessage(text, session) {
    // Greetings or casual messages
    if (text.match(/^(hi|hello|hey|hii|helo|start)$/i)) {
        return generateMainMenu(session);
    }
    
    // Product-related keywords
    if (text.includes('product') || text.includes('view') || text.includes('order') || text.includes('buy') || text.includes('water') || text.includes('bottle')) {
        session.state = 'viewing_products';
        return generateProductListMessage();
    }
    
    // Account-related
    if (text.includes('account') || text.includes('profile') || text.includes('info')) {
        return await generateAccountInfo(session);
    }
    
    // Support-related
    if (text.includes('support') || text.includes('help') || text.includes('contact')) {
        return generateSupportInfo();
    }
    
    // Menu request
    if (text.includes('menu') || text.includes('back') || text.includes('main')) {
        return generateMainMenu(session);
    }
    
    // Check if it's a product number (fallback for text input)
    if (text === '1' || text === '2' || text === '3' || text === '4' || text === '5') {
        session.state = 'viewing_products';
        return await handleProductSelectionByNumber(text, session);
    }
    
    // Default: show menu for any unrecognized message
    return generateMainMenu(session);
}

// Handle product selection by number (fallback)
async function handleProductSelectionByNumber(text, session) {
    let selectedProduct = null;
    
    if (text === '1' || text.includes('10+1')) {
        selectedProduct = PRODUCTS.coupon_10_1;
    } else if (text === '2' || text.includes('25+5')) {
        selectedProduct = PRODUCTS.coupon_25_5;
    } else if (text === '3' || text.includes('30+7')) {
        selectedProduct = PRODUCTS.coupon_30_7;
    } else if (text === '4' || text.includes('100+40')) {
        selectedProduct = PRODUCTS.coupon_100_40;
    } else if (text === '5' || text.includes('cooler') || text.includes('100+cooler')) {
        selectedProduct = PRODUCTS.coupon_100_cooler;
    }
    
    if (selectedProduct) {
        session.currentOrder = selectedProduct;
        session.state = 'confirming_order';
        return generateOrderConfirmation(session);
    }
    
    return generateProductListMessage();
}

// Update customer in ERPNext
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

// Handle order confirmations
async function handleOrderConfirmation(text, session) {
    if (text.includes('yes') || text.includes('confirm')) {
        const orderResult = await createSalesOrder(
            session.customerInfo.name, 
            session.currentOrder,
            session.phoneNumber
        );
        
        if (orderResult.success) {
            session.state = 'registered';
            const currentOrder = session.currentOrder;
            session.currentOrder = null;
            
            const mainMenu = generateMainMenu(session);
            return {
                message: `ORDER CONFIRMED!

Order Number: ${orderResult.orderName}
Product: ${currentOrder.name}
Quantity: ${currentOrder.qty} bottles
Total: AED ${currentOrder.price + currentOrder.deposit}

NEXT STEPS:
- Our team will call within 2 hours
- Delivery within 24 hours
- Payment on delivery

Thank you for choosing our service!

${mainMenu.message}`,
                buttons: mainMenu.buttons
            };
        } else {
            return {
                message: `Order failed. Please try again or contact support.\n\nError: ${orderResult.error}`,
                buttons: null
            };
        }
    } else if (text.includes('no') || text.includes('cancel')) {
        session.state = 'registered';
        session.currentOrder = null;
        const mainMenu = generateMainMenu(session);
        return {
            message: `Order cancelled.\n\n${mainMenu.message}`,
            buttons: mainMenu.buttons
        };
    } else {
        const confirmation = generateOrderConfirmation(session);
        return {
            message: `Please use the buttons to confirm or cancel.\n\n${confirmation.message}`,
            buttons: confirmation.buttons
        };
    }
}

// Generate account info
async function generateAccountInfo(session) {
    const customer = session.customerInfo;
    
    const message = `YOUR ACCOUNT

Phone: ${customer.mobile_no}
Name: ${customer.customer_name || 'Not provided'}
Member Since: ${new Date(customer.creation).toLocaleDateString()}

Your delivery address is stored with GPS coordinates.

Need to update? Just let me know!`;
    
    const buttons = [
        { id: 'back_to_menu', title: 'Back to Menu' }
    ];
    
    return { message, buttons };
}

// Keep-alive
async function keepAlive() {
    if (!KEEP_ALIVE_URL) return;
    try {
        await axios.get(`${KEEP_ALIVE_URL}/health`, { timeout: 30000 });
        console.log(`Keep-alive ping at ${new Date().toISOString()}`);
    } catch (error) {
        console.error(`Keep-alive failed:`, error.message);
    }
}

function startKeepAlive() {
    if (!KEEP_ALIVE_URL) return;
    console.log(`Starting keep-alive - pinging every ${KEEP_ALIVE_INTERVAL / 60000} minutes`);
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

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '11.0.0-List-Based-Products',
        activeSessions: userSessions.size,
        features: {
            listBasedProducts: true,
            workflowCompliant: true,
            leadToCustomerFlow: true,
            buttonNavigation: true
        }
    });
});

// Webhook verification
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('Webhook verified!');
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

// Homepage
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>WhatsApp Bot v13.0 - Streamlined Flow</title>
        <style>
            body { font-family: Arial; margin: 20px; background: #f5f5f5; }
            .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; }
            .status { padding: 20px; background: #e8f5e8; border-radius: 8px; margin: 20px 0; }
            .feature { margin: 15px 0; padding: 15px; background: #f8f8f8; border-radius: 6px; border-left: 4px solid #28a745; }
            .product { margin: 10px 0; padding: 12px; background: #e3f2fd; border-radius: 6px; }
            .workflow { margin: 10px 0; padding: 12px; background: #fff3e0; border-radius: 6px; }
            .active { color: #28a745; font-weight: bold; }
            h1 { color: #333; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>WhatsApp Water Delivery Bot v13.0</h1>
            <div class="status">
                <h2>Status: <span class="active">ACTIVE</span></h2>
                <p><strong>Version:</strong> 13.0.0-Streamlined-Flow</p>
                <p><strong>Active Sessions:</strong> ${userSessions.size}</p>
                <p><strong>Total Products:</strong> 5</p>
            </div>
            
            <h3>WORKFLOW (AUTOMATIC):</h3>
            <div class="workflow">1. Customer messages ? Auto-check if exists in DB</div>
            <div class="workflow">2. If exists with complete info ? Show menu directly</div>
            <div class="workflow">3. If exists with missing info ? Prompt to complete</div>
            <div class="workflow">4. If NOT exists ? Start registration directly</div>
            <div class="workflow">5. NO Lead creation - only complete customers</div>
            
            <h3>AVAILABLE PRODUCTS:</h3>
            <div class="product">1. 10+1 Coupon Book - AED 65 (11 bottles)</div>
            <div class="product">2. 25+5 Coupon Book - AED 175 (30 bottles)</div>
            <div class="product">3. 30+7 Coupon Book - AED 210 (37 bottles)</div>
            <div class="product">4. 100+40 Coupon Book - AED 700 (140 bottles)</div>
            <div class="product">5. 100 Bottles + Cooler - AED 800 (100 bottles + FREE cooler)</div>
            
            <h3>KEY FEATURES:</h3>
            <div class="feature">? Automatic customer detection (no questions)</div>
            <div class="feature">? WhatsApp Interactive List UI for products</div>
            <div class="feature">? Direct to menu for existing customers</div>
            <div class="feature">? Smart missing field detection</div>
            <div class="feature">? No Lead status - only full customers</div>
            <div class="feature">? Text fallback support (type 1-5)</div>
        </div>
    </body>
    </html>
    `);
});

app.listen(PORT, () => {
    console.log(`WhatsApp Bot v11.0 running on port ${PORT}`);
    console.log('Products displayed as LIST (no buttons)');
    console.log('Navigation uses BUTTONS (max 3)');
    console.log('Workflow: Check DB ? Lead/Customer ? Complete info');
    startKeepAlive();
});