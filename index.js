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
const WELCOME_MESSAGE = `WELCOME TO PREMIUM WATER DELIVERY!

Hi! I'm your personal water delivery assistant.

To get started, I need to set up your delivery profile. This is a one-time setup that will make future orders super quick!

Please provide your details:
What's your name?`;

// Customer registration flow states
const REGISTRATION_STATES = {
    COLLECTING_NAME: 'collecting_name',
    COLLECTING_BUILDING: 'collecting_building',
    COLLECTING_AREA: 'collecting_area',
    COLLECTING_FLAT: 'collecting_flat',
    COLLECTING_LOCATION: 'collecting_location',
    REGISTRATION_COMPLETE: 'registration_complete'
};

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
                fields: JSON.stringify([
                    'name', 'customer_name', 'mobile_no', 'creation', 
                    'custom_area', 'custom_building_no', 'custom_whatsapp_number'
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

// Find missing required fields - UPDATED VERSION
function findMissingFields(customerData) {
    const requiredFields = [
        { key: 'customer_name', name: 'Customer Name' },
        { key: 'custom_area', name: 'Area' },
        { key: 'custom_building_no', name: 'Building' }
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
            territory: '', // Left blank as requested
            
            // Use custom fields that exist in your system
            custom_area: registrationData.area || '',
            custom_building_no: registrationData.buildingName || '',
            custom_whatsapp_number: registrationData.phoneNumber,
            
            // Set default values for other fields
            default_price_list: 'Price 5',
            custom_payment_mode: 'Cash',
            custom_coupon_bottle: 0,
            
            // Set delivery days (default to Tuesday)
            custom_saturday: 0,
            custom_sunday: 0,
            custom_monday: 0,
            custom_tuesday: 1,
            custom_wednesday: 0,
            custom_thursday: 0,
            custom_friday: 0
        };
        
        // Determine customer group based on building type if possible
        if (registrationData.buildingName) {
            const buildingLower = registrationData.buildingName.toLowerCase();
            if (buildingLower.includes('villa')) {
                customerData.customer_group = 'VILLA';
            } else if (buildingLower.includes('apartment') || buildingLower.includes('flat')) {
                customerData.customer_group = 'APARTMENT';
            }
        }
        
        console.log('Creating customer with data:', customerData);
        
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
        
        // Create contact record
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

// Create address record with GPS coordinates
async function createAddressRecord(customerName, registrationData) {
    try {
        const addressData = {
            doctype: 'Address',
            address_title: `${customerName} - Delivery Address`,
            address_type: 'Billing',
            address_line1: registrationData.buildingName || '',
            address_line2: `Flat ${registrationData.flatNo || ''}`,
            city: registrationData.area || '',
            state: 'Dubai',
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
        
        // Update the customer to link this address as primary address
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
        
        console.log('Contact created successfully:', response.data.data.name);
        
        // Update customer to link this contact as primary contact
        await updateCustomerPrimaryContact(customerName, response.data.data.name);
        
        return response.data.data;
        
    } catch (error) {
        console.error('Error creating contact:', error.response?.data || error.message);
        return null;
    }
}

// Update customer with primary address link
async function updateCustomerPrimaryAddress(customerName, addressName) {
    try {
        const updateData = {
            customer_primary_address: addressName
        };
        
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
        
        console.log('Customer primary address updated successfully');
        return response.data.data;
        
    } catch (error) {
        console.error('Error updating customer primary address:', error.response?.data || error.message);
        return null;
    }
}

// Update customer with primary contact link
async function updateCustomerPrimaryContact(customerName, contactName) {
    try {
        const updateData = {
            customer_primary_contact: contactName
        };
        
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
        
        console.log('Customer primary contact updated successfully');
        return response.data.data;
        
    } catch (error) {
        console.error('Error updating customer primary contact:', error.response?.data || error.message);
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

// Send WhatsApp message with buttons
async function sendMessage(to, message, phoneNumberId, buttons = null) {
    try {
        let messageData = {
            messaging_product: 'whatsapp',
            to: to
        };

        if (buttons && buttons.length > 0) {
            messageData.type = 'interactive';
            messageData.interactive = {
                type: 'button',
                body: {
                    text: message
                },
                action: {
                    buttons: buttons.map((btn, index) => ({
                        type: 'reply',
                        reply: {
                            id: btn.id || `button_${index}`,
                            title: btn.title.substring(0, 20) // WhatsApp button title limit
                        }
                    }))
                }
            };
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
        console.log('Message sent successfully to:', to);
    } catch (error) {
        console.error('Error sending message:', error.response?.data || error.message);
    }
}

// Main message handler
async function handleIncomingMessage(message, phoneNumberId) {
    const phoneNumber = message.from;
    const messageBody = message.text?.body;
    const location = message.location;
    const buttonReply = message.interactive?.button_reply?.id;
    
    console.log(`Message from ${phoneNumber}:`, { 
        text: messageBody, 
        hasLocation: !!location,
        buttonReply: buttonReply
    });
    
    const session = getSession(phoneNumber);
    let response = '';
    let buttons = null;
    
    // Handle button replies first
    if (buttonReply) {
        const result = await handleButtonReply(buttonReply, session);
        response = result.message;
        buttons = result.buttons;
    }
    // Check if customer exists first
    else if (session.state === 'new_user') {
        const customerCheck = await checkExistingCustomer(phoneNumber);
        
        if (customerCheck.exists) {
            session.customerInfo = customerCheck.customerData;
            
            if (customerCheck.missingFields.length > 0) {
                // Existing customer with missing information
                session.state = 'updating_missing_info';
                response = `Welcome back!\n\nI notice your name is missing from your account. What's your full name?`;
            } else {
                // Complete existing customer
                session.state = 'registered';
                const result = generateMainMenu(session);
                response = result.message;
                buttons = result.buttons;
            }
        } else {
            // New customer - start registration
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
    // Handle text messages based on current state
    else if (messageBody) {
        const result = await handleTextMessage(messageBody, session);
        response = result.message;
        buttons = result.buttons;
    }
    
    await sendMessage(phoneNumber, response, phoneNumberId, buttons);
}

// Handle button replies
async function handleButtonReply(buttonId, session) {
    switch (buttonId) {
        case 'coupon_books':
            session.state = 'ordering_coupon';
            return generateCouponMenu();
            
        case 'single_bottle':
            return generateSingleBottleOffer();
            
        case 'check_account':
            return await generateAccountInfo(session);
            
        case 'customer_support':
            return generateSupportInfo();
            
        case 'coupon_10_1':
            session.currentOrder = PRODUCTS.coupon_10_1;
            session.state = 'confirming_order';
            return generateOrderConfirmation(session);
            
        case 'coupon_100_40':
            session.currentOrder = PRODUCTS.coupon_100_40;
            session.state = 'confirming_order';
            return generateOrderConfirmation(session);
            
        case 'back_to_menu':
            session.state = 'registered';
            return generateMainMenu(session);
            
        case 'confirm_order':
            return await handleOrderConfirmation('yes', session);
            
        case 'cancel_order':
            return await handleOrderConfirmation('no', session);
            
        case 'order_single':
            session.currentOrder = PRODUCTS.single_bottle;
            session.state = 'confirming_order';
            return generateOrderConfirmation(session);
            
        default:
            return { message: "I didn't understand that selection. Please try again.", buttons: null };
    }
}

// Generate main menu with buttons
function generateMainMenu(session) {
    const customerName = session.customerInfo?.customer_name || 'valued customer';
    const message = `Welcome back, ${customerName}!\n\nPREMIUM WATER DELIVERY\n\nChoose an option below:`;
    
    const buttons = [
        { id: 'coupon_books', title: 'Coupon Books' },
        { id: 'single_bottle', title: 'Single Bottle' },
        { id: 'check_account', title: 'My Account' },
        { id: 'customer_support', title: 'Support' }
    ];
    
    return { message, buttons };
}

// Generate coupon menu with buttons
function generateCouponMenu() {
    const message = `COUPON BOOK OPTIONS - SAVE MONEY!\n\n10+1 Coupon Book - AED 70\n• Get 11 bottles (10 + 1 FREE)\n• Save AED 7 compared to buying individually\n• Perfect for families\n\n100+40 Coupon Book - AED 700\n• Get 140 bottles (100 + 40 FREE!)\n• Save AED 280 compared to buying individually\n• Best for offices/large families\n• Buy now, pay later available\n\nWhich coupon book interests you?`;
    
    const buttons = [
        { id: 'coupon_10_1', title: '10+1 Book' },
        { id: 'coupon_100_40', title: '100+40 Book' },
        { id: 'back_to_menu', title: 'Back to Menu' }
    ];
    
    return { message, buttons };
}

// Generate single bottle offer with buttons
function generateSingleBottleOffer() {
    const message = `Before ordering a single bottle, did you know?\n\nBETTER VALUE: Our 10+1 Coupon Book costs AED 70\n• You get 11 bottles (10 + 1 FREE)\n• Save AED 7 compared to buying single bottles\n• No deposit required per bottle\n\nSingle Bottle: AED 7 + AED 15 deposit = AED 22 total\n\nWould you prefer:`;
    
    const buttons = [
        { id: 'coupon_10_1', title: 'Coupon Book' },
        { id: 'order_single', title: 'Single Bottle' },
        { id: 'back_to_menu', title: 'Back to Menu' }
    ];
    
    return { message, buttons };
}

// Generate order confirmation with buttons
function generateOrderConfirmation(session) {
    const product = session.currentOrder;
    const total = product.price + product.deposit;
    
    const message = `ORDER CONFIRMATION\n\nProduct: ${product.name}\nDescription: ${product.description}\nPrice: AED ${product.price}${product.deposit > 0 ? `\nDeposit: AED ${product.deposit}` : ''}\nTOTAL: AED ${total}\n\nBenefits:\n${product.salesPoints.map(point => `• ${point}`).join('\n')}\n\nDelivery to: ${session.customerInfo?.custom_area || 'Your registered address'}\nPayment: Cash on delivery\n\nConfirm your order?`;
    
    const buttons = [
        { id: 'confirm_order', title: 'Confirm Order' },
        { id: 'cancel_order', title: 'Cancel Order' }
    ];
    
    return { message, buttons };
}

// Generate support information
function generateSupportInfo() {
    const message = `CUSTOMER SUPPORT\n\nCall us: +971-XX-XXXX-XXX\nWhatsApp: This number\nEmail: support@waterdelivery.com\n\nSupport Hours:\nMonday - Sunday: 8:00 AM - 10:00 PM\n\nHow can we help you today?\n• Delivery questions\n• Product information\n• Account issues\n• Complaints or feedback\n\nJust tell me what you need help with!`;
    
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
            message: 'Sorry, I could not extract your location. Please try sharing your location again using the attachment button.',
            buttons: null
        };
    }
    
    const validation = validateServiceArea(locationData.latitude, locationData.longitude);
    
    if (!validation.isValid) {
        return {
            message: `Location received but outside our service area!\n\nYour location is outside Dubai, Sharjah, or Ajman\nNearest service area: ${validation.nearestCity?.city} (${validation.nearestCity?.distance.toFixed(1)} km away)\n\nWe currently serve Dubai, Sharjah, and Ajman. We're expanding soon!`,
            buttons: null
        };
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
        
        const mainMenu = generateMainMenu(session);
        return {
            message: `Registration Complete!\n\nLocation confirmed: ${validation.city.toUpperCase()}\nCustomer profile created successfully!\n\n${mainMenu.message}`,
            buttons: mainMenu.buttons
        };
    } else {
        return {
            message: `Registration Error\n\nThere was an issue creating your profile. Please try again or contact support.\n\nError: ${customerResult.error}`,
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
            return { message: "Thanks! Now, what's your building name or number?", buttons: null };
            
        case REGISTRATION_STATES.COLLECTING_BUILDING:
            if (text.length < 1) {
                return { message: "Please provide your building name or number.", buttons: null };
            }
            session.registrationData.buildingName = messageBody.trim();
            session.state = REGISTRATION_STATES.COLLECTING_AREA;
            return { message: "Got it! What area/neighborhood are you in?\n\nJust type any area name - no validation needed!", buttons: null };
            
        case REGISTRATION_STATES.COLLECTING_AREA:
            if (text.length < 2) {
                return { message: "Please provide your area or neighborhood name.", buttons: null };
            }
            session.registrationData.area = messageBody.trim();
            session.state = REGISTRATION_STATES.COLLECTING_FLAT;
            return { message: "Perfect! What's your flat/apartment number?", buttons: null };
            
        case REGISTRATION_STATES.COLLECTING_FLAT:
            if (text.length < 1) {
                return { message: "Please provide your flat or apartment number.", buttons: null };
            }
            session.registrationData.flatNo = messageBody.trim();
            session.state = REGISTRATION_STATES.COLLECTING_LOCATION;
            return { 
                message: `Almost done! Now I need your GPS location for accurate delivery.\n\nPlease tap the attachment button ? Location ? Share your current location.\n\nThis helps us:\n• Find you easily during delivery\n• Validate service area (Dubai, Sharjah, Ajman only)\n• Optimize our delivery routes\n\nPlease share your location now.`,
                buttons: null
            };
            
        case 'registered':
            return await handleRegisteredCustomerMessage(text, session);
            
        case 'updating_missing_info':
            return await handleMissingInfoUpdate(messageBody, session);
            
        case 'ordering_coupon':
            return await handleCouponOrder(text, session);
            
        case 'confirming_order':
            return await handleOrderConfirmation(text, session);
            
        default:
            return { message: "I didn't understand that. Please try again.", buttons: null };
    }
}

// Handle messages from registered customers
async function handleRegisteredCustomerMessage(text, session) {
    if (text.includes('1') || text.includes('coupon') || text.includes('book')) {
        session.state = 'ordering_coupon';
        return generateCouponMenu();
    }
    
    if (text.includes('2') || text.includes('bottle') || text.includes('single')) {
        return generateSingleBottleOffer();
    }
    
    if (text.includes('3') || text.includes('account') || text.includes('check')) {
        return await generateAccountInfo(session);
    }
    
    if (text.includes('4') || text.includes('support') || text.includes('help')) {
        return generateSupportInfo();
    }
    
    // If not clear, show menu again
    return generateMainMenu(session);
}

// Handle missing information updates
async function handleMissingInfoUpdate(messageBody, session) {
    const updateData = {
        customer_name: messageBody.trim()
    };
    
    // Update customer in ERP
    const updateResult = await updateCustomerInERP(session.customerInfo.name, updateData);
    
    if (updateResult.success) {
        session.state = 'registered';
        session.customerInfo.customer_name = messageBody.trim();
        const mainMenu = generateMainMenu(session);
        return {
            message: `Your name has been updated!\n\n${mainMenu.message}`,
            buttons: mainMenu.buttons
        };
    } else {
        return {
            message: `Error updating your information. Please try again.\n\nError: ${updateResult.error}`,
            buttons: null
        };
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
        return generateMainMenu(session);
    } else {
        const couponMenu = generateCouponMenu();
        return {
            message: `Please select an option:\n\n${couponMenu.message}`,
            buttons: couponMenu.buttons
        };
    }
    
    session.currentOrder = selectedProduct;
    session.state = 'confirming_order';
    
    return generateOrderConfirmation(session);
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
            
            const mainMenu = generateMainMenu(session);
            return {
                message: `ORDER CONFIRMED!\n\nOrder Number: ${orderResult.orderName}\nProduct: ${currentOrder.name}\nTotal: AED ${currentOrder.price + currentOrder.deposit}\n\nNEXT STEPS:\n• Our delivery team will call you within 2 hours\n• Delivery within 24 hours\n• Payment on delivery (Cash/Card)\n\nThank you for choosing our premium water service!\n\n${mainMenu.message}`,
                buttons: mainMenu.buttons
            };
        } else {
            return {
                message: `Order processing failed. Please try again or contact support.\n\nError: ${orderResult.error}`,
                buttons: null
            };
        }
    } else if (text.includes('no') || text.includes('cancel')) {
        session.state = 'registered';
        session.currentOrder = null;
        const mainMenu = generateMainMenu(session);
        return {
            message: `Order cancelled. No problem!\n\n${mainMenu.message}`,
            buttons: mainMenu.buttons
        };
    } else {
        const confirmation = generateOrderConfirmation(session);
        return {
            message: `Please use the buttons to confirm or cancel your order.\n\n${confirmation.message}`,
            buttons: confirmation.buttons
        };
    }
}

// Generate account information
async function generateAccountInfo(session) {
    const customer = session.customerInfo;
    
    const message = `YOUR ACCOUNT DETAILS\n\nPhone: ${customer.mobile_no}\nName: ${customer.customer_name || 'Not provided'}\nArea: ${customer.custom_area || 'Not provided'}\nBuilding: ${customer.custom_building_no || 'Not provided'}\nMember Since: ${new Date(customer.creation).toLocaleDateString()}\n\nNeed to update any information? Just let me know!`;
    
    const buttons = [
        { id: 'back_to_menu', title: 'Back to Menu' }
    ];
    
    return { message, buttons };
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
        version: '7.0.0-Clean-UI-With-Buttons',
        activeSessions: userSessions.size,
        features: {
            customerRegistration: true,
            couponBookPriority: true,
            automaticAccountDetection: true,
            gpsLocationOnlyValidation: true,
            erpNextIntegration: !!(ERPNEXT_URL && ERPNEXT_API_KEY),
            interactiveButtons: true,
            cleanTextFormatting: true,
            emptyTerritoryField: true
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
        <title>WhatsApp Water Delivery Bot v7.0</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
            .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .status { padding: 20px; background: #e8f5e8; border-radius: 8px; margin: 20px 0; }
            .feature { margin: 15px 0; padding: 15px; background: #f8f8f8; border-radius: 6px; border-left: 4px solid #28a745; }
            .active { color: #28a745; font-weight: bold; }
            .inactive { color: #ffc107; }
            h1 { color: #333; text-align: center; }
            h2, h3 { color: #007bff; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>WhatsApp Water Delivery Bot v7.0</h1>
            
            <div class="status">
                <h2>Status: <span class="active">CLEAN UI WITH INTERACTIVE BUTTONS</span></h2>
                <p><strong>Version:</strong> 7.0.0-Clean-UI-With-Buttons</p>
                <p><strong>Active Sessions:</strong> ${userSessions.size}</p>
                <p><strong>ERPNext Integration:</strong> <span class="${ERPNEXT_URL ? 'active' : 'inactive'}">${ERPNEXT_URL ? 'ENABLED' : 'DISABLED'}</span></p>
            </div>

            <h3>NEW FEATURES:</h3>
            <div class="feature">Interactive WhatsApp buttons for all major actions</div>
            <div class="feature">Clean text formatting without emojis or icons</div>
            <div class="feature">Improved user experience with button-driven navigation</div>
            <div class="feature">Empty territory field in ERPNext customer creation</div>
            <div class="feature">Better structured messages and responses</div>

            <h3>ERPNEXT INTEGRATION (FIXED):</h3>
            <div class="feature"><strong>Customer Creation:</strong> Uses custom fields properly</div>
            <div class="feature"><strong>Territory Field:</strong> Left blank as requested</div>
            <div class="feature"><strong>Address Creation:</strong> Separate document with GPS</div>
            <div class="feature"><strong>Contact Creation:</strong> Proper linking to customer</div>

            <h3>USER INTERFACE:</h3>
            <div class="feature"><strong>Interactive Buttons:</strong> Main menu, product selection, order confirmation</div>
            <div class="feature"><strong>Clean Text:</strong> No emojis or special characters</div>
            <div class="feature"><strong>Better UX:</strong> Reduced typing, faster interactions</div>
        </div>
    </body>
    </html>
    `;
    res.send(statusHtml);
});

app.listen(PORT, () => {
    console.log(`WhatsApp Water Delivery Bot v7.0 running on port ${PORT}`);
    console.log('Features: Interactive buttons, clean text, empty territory field');
    console.log('ERPNext integration: Fixed with proper custom fields');
    
    if (!ERPNEXT_URL) {
        console.warn('Warning: ERPNEXT_URL not configured');
    }
    
    startKeepAlive();
});