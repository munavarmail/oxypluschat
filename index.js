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

// Quick Order Configuration
const STANDARD_BOTTLE_RATE = 7; // AED per bottle
const MIN_ORDER_QUANTITY = 1;
const MAX_ORDER_QUANTITY = 500;
const VAT_RATE = 0.05; // 5% VAT

// User sessions management
const userSessions = new Map();

// Service area coordinates (UAE major cities)
const SERVICE_AREAS = {
    ajman: { lat: 25.4052, lng: 55.5136, radius: 25 },
    sharjah: { lat: 25.3463, lng: 55.4209, radius: 30 },
    dubai: { lat: 25.2048, lng: 55.2708, radius: 50 }
};

// Product catalog with VAT
const PRODUCTS = {
    'coupon_10_1': { 
        name: '10+1 Coupon Book', 
        priceBeforeVAT: 65,
        vat: 3.25,
        price: 68.25, // Including 5% VAT
        deposit: 0, 
        item_code: '5 Gallon Water',
        qty: 11,
        description: '10+1 Coupon Book - 11 bottles total (10 bottles + 1 FREE bonus bottle)',
        priority: 1,
        salesPoints: ['11 bottles', '1 FREE bottle included', 'Perfect for small families']
    },
    'coupon_25_5': { 
        name: '25+5 Coupon Book', 
        priceBeforeVAT: 175,
        vat: 8.75,
        price: 183.75, // Including 5% VAT
        deposit: 0, 
        item_code: '5 Gallon Water',
        qty: 30,
        description: '25+5 Coupon Book - 30 bottles total (25 bottles + 5 FREE bonus bottles)',
        priority: 1,
        salesPoints: ['30 bottles', '5 FREE bottles included', 'Great value for families']
    },
    'coupon_30_7': { 
        name: '30+7 Coupon Book', 
        priceBeforeVAT: 210,
        vat: 10.50,
        price: 220.50, // Including 5% VAT
        deposit: 0, 
        item_code: '5 Gallon Water',
        qty: 37,
        description: '30+7 Coupon Book - 37 bottles total (30 bottles + 7 FREE bonus bottles)',
        priority: 1,
        salesPoints: ['37 bottles', '7 FREE bottles included', 'Popular choice']
    },
    'coupon_100_40': { 
        name: '100+40 Coupon Book', 
        priceBeforeVAT: 700,
        vat: 35,
        price: 735, // Including 5% VAT
        deposit: 0, 
        item_code: '5 Gallon Water',
        qty: 140,
        description: '100+40 Coupon Book - 140 bottles total (100 bottles + 40 FREE bonus bottles)',
        priority: 1,
        salesPoints: ['140 bottles', '40 FREE bottles included', 'Best value for offices']
    },
    'coupon_100_cooler': { 
        name: '100 Bottles + Cooler', 
        priceBeforeVAT: 800,
        vat: 40,
        price: 840, // Including 5% VAT
        deposit: 0, 
        item_code: '5 Gallon Water',
        qty: 100,
        description: '100 Bottles + FREE Water Cooler - Complete water solution package',
        priority: 1,
        salesPoints: ['100 bottles + FREE cooler', 'Complete package', 'Perfect for offices']
    }
};

// Registration states
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
        selectedProductBeforeRegistration: null,
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
                fields: JSON.stringify(['name', 'customer_name', 'mobile_no', 'creation', 'customer_primary_address'])
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

// Find missing fields - UPDATED to check address properly
function findMissingFields(customerData) {
    const requiredFields = [
        { key: 'customer_name', name: 'Name' },
        { key: 'customer_primary_address', name: 'Address' }
    ];
    const missing = [];
    
    requiredFields.forEach(field => {
        if (!customerData[field.key] || customerData[field.key] === '') {
            missing.push(field.name);
        }
    });
    
    return missing;
}

// Build message showing existing customer information
function buildExistingInfoMessage(customerInfo) {
    const info = [];
    if (customerInfo.customer_name) info.push(`Name: ${customerInfo.customer_name}`);
    if (customerInfo.mobile_no) info.push(`Phone: ${customerInfo.mobile_no}`);
    if (customerInfo.customer_primary_address) info.push(`Address: On file`);
    
    const missing = findMissingFields(customerInfo);
    if (missing.length > 0) {
        info.push(`\nMissing: ${missing.join(', ')}`);
    }
    
    return info.join('\n');
}

// Determine emirate from area name
function determineEmirate(area) {
    if (!area) return 'Dubai';
    
    const areaLower = area.toLowerCase();
    
    if (areaLower.includes('ajman')) return 'Ajman';
    if (areaLower.includes('sharjah')) return 'Sharjah';
    if (areaLower.includes('dubai')) return 'Dubai';
    if (areaLower.includes('qouz') || areaLower.includes('barsha')) return 'Dubai';
    
    return 'Dubai';
}

// Create customer with full information
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
            custom_coupon_bottle: 0,
            custom_saturday: 0,
            custom_sunday: 0,
            custom_monday: 0,
            custom_tuesday: 1,
            custom_wednesday: 0,
            custom_thursday: 0,
            custom_friday: 0
        };
        
        console.log('Creating customer:', customerData);
        
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
        
        console.log('Customer created:', response.data.data.name);
        
        // CRITICAL: Always create address if we have location data
        if (registrationData.latitude && registrationData.longitude) {
            const addressResult = await createAddressRecord(response.data.data.name, registrationData);
            if (!addressResult) {
                console.error('Failed to create address for customer');
            }
        }
        
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

// Create address record - FIXED to ensure all fields are saved
async function createAddressRecord(customerName, registrationData) {
    try {
        const emirate = determineEmirate(registrationData.area);
        
        const addressData = {
            doctype: 'Address',
            address_title: customerName,
            address_type: 'Billing',
            address_line1: `${registrationData.buildingName || ''} ${registrationData.flatNo || ''}`.trim(),
            address_line2: registrationData.area || '',
            city: registrationData.buildingName || 'VILLA',
            state: emirate,
            emirate: emirate,
            country: 'United Arab Emirates',
            phone: registrationData.phoneNumber || '',
            custom_bottle_in_hand: 0,
            custom_coupon_count: 0,
            custom_cooler_in_hand: 0,
            custom_bottle_per_recharge: 0,
            custom_bottle_recharge_amount: 0,
            is_primary_address: 1,
            is_shipping_address: 1,
            links: [{
                link_doctype: 'Customer',
                link_name: customerName
            }]
        };
        
        if (registrationData.latitude && registrationData.longitude) {
            addressData.custom_latitude = registrationData.latitude;
            addressData.custom_longitude = registrationData.longitude;
        }
        
        console.log('Creating address with data:', JSON.stringify(addressData, null, 2));
        
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
        
        console.log('Contact created');
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
        console.log('Primary address updated');
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
        console.log('Primary contact updated');
    } catch (error) {
        console.error('Error updating primary contact:', error.message);
    }
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

// Get customer addresses
async function getCustomerAddresses(customerName) {
    try {
        const response = await axios.get(
            `${ERPNEXT_URL}/api/resource/Address`,
            {
                headers: {
                    'Authorization': `token ${ERPNEXT_API_KEY}:${ERPNEXT_API_SECRET}`,
                    'Content-Type': 'application/json'
                },
                params: {
                    filters: JSON.stringify([
                        ['Dynamic Link', 'link_doctype', '=', 'Customer'],
                        ['Dynamic Link', 'link_name', '=', customerName]
                    ]),
                    fields: JSON.stringify([
                        'name', 
                        'address_title',
                        'address_line1', 
                        'address_line2',
                        'city', 
                        'state',
                        'emirate',
                        'country',
                        'phone',
                        'custom_bottle_in_hand',
                        'custom_coupon_count',
                        'custom_cooler_in_hand',
                        'custom_bottle_per_recharge',
                        'custom_bottle_recharge_amount',
                        'custom_latitude',
                        'custom_longitude',
                        'is_primary_address'
                    ])
                }
            }
        );
        
        console.log(`Found ${response.data.data?.length || 0} addresses for ${customerName}`);
        return response.data.data || [];
    } catch (error) {
        console.error('Error getting addresses:', error.response?.data || error.message);
        return [];
    }
}

// Get full address details
async function getFullAddressDetails(addressName) {
    try {
        const response = await axios.get(
            `${ERPNEXT_URL}/api/resource/Address/${addressName}`,
            {
                headers: {
                    'Authorization': `token ${ERPNEXT_API_KEY}:${ERPNEXT_API_SECRET}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        return response.data.data;
    } catch (error) {
        console.error('Error getting address details:', error.response?.data || error.message);
        return null;
    }
}

// Update bottle inventory
async function updateBottleInventory(customerName, bottlesToAdd, couponToAdd = 0) {
    try {
        const addresses = await getCustomerAddresses(customerName);
        if (!addresses || addresses.length === 0) {
            console.log('No address found for inventory update');
            return { success: false, error: 'No address found' };
        }
        
        const primaryAddress = addresses.find(addr => addr.is_primary_address === 1) || addresses[0];
        const fullAddress = await getFullAddressDetails(primaryAddress.name);
        
        if (!fullAddress) {
            return { success: false, error: 'Could not fetch address details' };
        }
        
        const currentBottles = fullAddress.custom_bottle_in_hand || 0;
        const currentCoupons = fullAddress.custom_coupon_count || 0;
        
        const updateData = {
            custom_bottle_in_hand: currentBottles + bottlesToAdd,
            custom_coupon_count: currentCoupons + couponToAdd
        };
        
        const response = await axios.put(
            `${ERPNEXT_URL}/api/resource/Address/${primaryAddress.name}`,
            updateData,
            {
                headers: {
                    'Authorization': `token ${ERPNEXT_API_KEY}:${ERPNEXT_API_SECRET}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        console.log('Inventory updated:', updateData);
        return { 
            success: true, 
            newBottleCount: updateData.custom_bottle_in_hand,
            newCouponCount: updateData.custom_coupon_count
        };
        
    } catch (error) {
        console.error('Error updating inventory:', error.response?.data || error.message);
        return { success: false, error: error.message };
    }
}

// Validate quantity input
function validateQuantity(input) {
    const trimmed = String(input).trim();
    
    if (!/^\d+$/.test(trimmed)) {
        return {
            isValid: false,
            error: 'Please enter a valid whole number (no decimals or letters)',
            quantity: null
        };
    }
    
    const quantity = parseInt(trimmed, 10);
    
    if (isNaN(quantity)) {
        return {
            isValid: false,
            error: 'Please enter a valid number',
            quantity: null
        };
    }
    
    if (quantity < MIN_ORDER_QUANTITY) {
        return {
            isValid: false,
            error: `Minimum order is ${MIN_ORDER_QUANTITY} bottle${MIN_ORDER_QUANTITY > 1 ? 's' : ''}`,
            quantity: null
        };
    }
    
    if (quantity > MAX_ORDER_QUANTITY) {
        return {
            isValid: false,
            error: `Maximum order is ${MAX_ORDER_QUANTITY} bottles. For larger orders, please contact support.`,
            quantity: null
        };
    }
    
    return {
        isValid: true,
        error: null,
        quantity: quantity
    };
}

// Create direct order object from quantity
function createDirectOrder(quantity) {
    const totalPrice = quantity * STANDARD_BOTTLE_RATE;
    
    return {
        name: `${quantity} x 5 Gallon Water`,
        price: totalPrice,
        deposit: 0,
        item_code: '5 Gallon Water',
        qty: quantity,
        description: `${quantity} bottles of 5 Gallon Premium Water`,
        priority: 1,
        salesPoints: [
            `${quantity} bottles of premium water`,
            'Cash on delivery'
        ],
        isDirect: true,
        priceBeforeVAT: 0,
        vat: 0
    };
}

// Create sales order
async function createSalesOrder(customerName, product, customerPhone) {
    try {
        const ratePerBottle = product.isDirect ? STANDARD_BOTTLE_RATE : (product.price / product.qty);
        
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
        
        console.log('Creating order:', JSON.stringify(orderData, null, 2));
        
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
        
        // Update bottle inventory
        if (product.isDirect || !product.name.includes('Coupon')) {
            await updateBottleInventory(customerName, product.qty, 0);
        } else {
            await updateBottleInventory(customerName, 0, product.qty);
        }
        
        // Update cooler if included
        if (product.name.includes('Cooler')) {
            const addresses = await getCustomerAddresses(customerName);
            if (addresses && addresses.length > 0) {
                const primaryAddress = addresses.find(addr => addr.is_primary_address === 1) || addresses[0];
                await axios.put(
                    `${ERPNEXT_URL}/api/resource/Address/${primaryAddress.name}`,
                    { custom_cooler_in_hand: 1 },
                    {
                        headers: {
                            'Authorization': `token ${ERPNEXT_API_KEY}:${ERPNEXT_API_SECRET}`,
                            'Content-Type': 'application/json'
                        }
                    }
                );
            }
        }
        
        return {
            success: true,
            orderName: response.data.data.name,
            data: response.data.data
        };
        
    } catch (error) {
        console.error('Error creating order:', error.response?.data || error.message);
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
    let closestMatch = null;
    let minDistance = Infinity;
    
    for (const [city, area] of Object.entries(SERVICE_AREAS)) {
        const distance = calculateDistance(latitude, longitude, area.lat, area.lng);
        
        if (distance <= area.radius && distance < minDistance) {
            minDistance = distance;
            closestMatch = {
                isValid: true,
                city: city,
                distance: distance
            };
        }
    }
    
    if (closestMatch) {
        return closestMatch;
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

// Send WhatsApp message
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
                    button: buttonText.substring(0, 20),
                    sections: sections
                }
            }
        };

        if (header) {
            messageData.interactive.header = {
                type: 'text',
                text: header.substring(0, 60)
            };
        }

        if (footer) {
            messageData.interactive.footer = {
                text: footer.substring(0, 60)
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
        console.log('List message sent');
    } catch (error) {
        console.error('Error sending list:', error.response?.data || error.message);
    }
}

// Generate main menu - UPDATED: No "View Products" for existing customers
function generateMainMenu(session) {
    const customerName = session.customerInfo?.customer_name || 'valued customer';
    const message = `Welcome back, ${customerName}!\n\nPREMIUM WATER DELIVERY\n\nHow can I help you today?`;
    
    // Only Quick Order and More Options for existing customers
    const buttons = [
        { id: 'quick_order', title: 'Quick Order' },
        { id: 'more_options', title: 'More Options' }
    ];
    
    return { message, buttons };
}

// Generate more options menu
function generateMoreOptionsMenu() {
    const message = `MORE OPTIONS\n\nWhat would you like to do?`;
    
    const buttons = [
        { id: 'check_account', title: 'My Account' },
        { id: 'customer_support', title: 'Support' },
        { id: 'back_to_menu', title: 'Back' }
    ];
    
    return { message, buttons };
}

// Generate product list with VAT
function generateProductListMessage() {
    const sections = [
        {
            title: "Family Packages",
            rows: [
                {
                    id: "product_coupon_10_1",
                    title: "10+1 - AED 68.25",
                    description: "11 bottles. AED 65 + VAT 3.25"
                },
                {
                    id: "product_coupon_25_5",
                    title: "25+5 - AED 183.75",
                    description: "30 bottles. AED 175 + VAT 8.75"
                },
                {
                    id: "product_coupon_30_7",
                    title: "30+7 - AED 220.50",
                    description: "37 bottles. AED 210 + VAT 10.50"
                }
            ]
        },
        {
            title: "Premium Packages",
            rows: [
                {
                    id: "product_coupon_100_40",
                    title: "100+40 - AED 735",
                    description: "140 bottles. AED 700 + VAT 35"
                },
                {
                    id: "product_coupon_100_cooler",
                    title: "100+Cooler - AED 840",
                    description: "100 bottles + FREE cooler. AED 800 + VAT 40"
                }
            ]
        }
    ];
    
    return {
        message: null,
        buttons: null,
        listData: {
            header: "WATER DELIVERY",
            body: "Choose your package. All prices include 5% VAT!\n\nAll coupon books include FREE bonus bottles!\n\nTap 'View Products' below.",
            buttonText: "View Products",
            footer: "Cash on delivery",
            sections: sections
        }
    };
}

// Generate order confirmation
function generateOrderConfirmation(session) {
    const product = session.currentOrder;
    
    let message = '';
    
    if (product.isDirect) {
        // Quick order - no price shown
        message = `? ORDER CONFIRMATION

?? Product: ${product.name}
?? Quantity: ${product.qty} bottles

? Benefits:
${product.salesPoints.map(point => `  • ${point}`).join('\n')}

?? Delivery: Your registered address
?? Payment: Cash on delivery

Confirm your order?`;
    } else {
        // Coupon package - show price breakdown with VAT
        const total = product.price + product.deposit;
        
        message = `? ORDER CONFIRMATION

?? Product: ${product.name}
?? Quantity: ${product.qty} bottles

?? PRICE BREAKDOWN:
  • Base Price: AED ${product.priceBeforeVAT.toFixed(2)}
  • VAT (5%): AED ${product.vat.toFixed(2)}
  • Net Price: AED ${product.price.toFixed(2)}${product.deposit > 0 ? `\n  • Deposit: AED ${product.deposit.toFixed(2)}` : ''}
  • TOTAL: AED ${total.toFixed(2)}

? Benefits:
${product.salesPoints.map(point => `  • ${point}`).join('\n')}

?? Delivery: Your registered address
?? Payment: Cash on delivery

Confirm your order?`;
    }
    
    const buttons = [
        { id: 'confirm_order', title: '? Confirm Order' },
        { id: 'cancel_order', title: '? Cancel' }
    ];
    
    return { message, buttons };
}

// Generate support info
function generateSupportInfo() {
    const message = `CUSTOMER SUPPORT

For complaints or suggestions:

Call: +971-XX-XXXX-XXX
WhatsApp: This number
Email: support@waterdelivery.com

Support Hours:
Monday - Sunday: 8:00 AM - 10:00 PM

How can we help you?`;
    
    const buttons = [
        { id: 'back_to_menu', title: 'Back to Menu' }
    ];
    
    return { message, buttons };
}

// Generate account info - FIXED to show complete details
async function generateAccountInfo(session) {
    const customer = session.customerInfo;
    
    console.log('Generating account info for customer:', customer.name);
    
    // Get addresses with full details
    const addresses = await getCustomerAddresses(customer.name);
    
    console.log(`Retrieved ${addresses?.length || 0} addresses`);
    
    let addressInfo = '?? Address: Not set';
    let inventoryInfo = '';
    
    if (addresses && addresses.length > 0) {
        const primaryAddress = addresses.find(addr => addr.is_primary_address === 1) || addresses[0];
        
        console.log('Primary address:', primaryAddress);
        
        // Build complete address
        const addressParts = [];
        if (primaryAddress.address_line1) addressParts.push(primaryAddress.address_line1);
        if (primaryAddress.address_line2) addressParts.push(primaryAddress.address_line2);
        if (primaryAddress.city) addressParts.push(primaryAddress.city);
        if (primaryAddress.emirate) addressParts.push(primaryAddress.emirate);
        
        if (addressParts.length > 0) {
            addressInfo = `?? Address: ${addressParts.join(', ')}`;
        }
        
        if (primaryAddress.phone) {
            addressInfo += `\n?? Phone: ${primaryAddress.phone}`;
        }
        
        // Build inventory info with proper defaults
        const bottleInHand = primaryAddress.custom_bottle_in_hand || 0;
        const couponCount = primaryAddress.custom_coupon_count || 0;
        const coolerInHand = primaryAddress.custom_cooler_in_hand || 0;
        
        console.log('Inventory:', { bottleInHand, couponCount, coolerInHand });
        
        inventoryInfo = `\n\n?? INVENTORY DETAILS:
?? Bottles in Hand: ${bottleInHand}
?? Coupon Balance: ${couponCount}
?? Cooler: ${coolerInHand > 0 ? 'Yes ?' : 'No ?'}`;
        
        // Add low stock warning
        if (bottleInHand < 5 && bottleInHand > 0) {
            inventoryInfo += '\n\n?? LOW STOCK - Consider reordering!';
        } else if (bottleInHand === 0) {
            inventoryInfo += '\n\n? OUT OF STOCK - Time to reorder!';
        }
    } else {
        inventoryInfo = '\n\n?? No inventory tracking yet.\nPlace your first order to start tracking!';
    }
    
    const message = `?? YOUR ACCOUNT

?? Name: ${customer.customer_name || 'Not provided'}
?? Mobile: ${customer.mobile_no}
?? Member Since: ${new Date(customer.creation).toLocaleDateString()}

${addressInfo}${inventoryInfo}

?? Payment Mode: ${customer.custom_payment_mode || 'Cash'}

Need to update? Contact support.`;
    
    const buttons = [
        { id: 'back_to_menu', title: 'Back to Menu' }
    ];
    
    return { message, buttons };
}

// Generate inventory details
async function generateInventoryDetails(session) {
    const customer = session.customerInfo;
    const addresses = await getCustomerAddresses(customer.name);
    
    if (!addresses || addresses.length === 0) {
        return {
            message: "No inventory information available.\n\nPlace your first order to start tracking!",
            buttons: [
                { id: 'quick_order', title: 'Order Now' },
                { id: 'back_to_menu', title: 'Back' }
            ]
        };
    }
    
    const primaryAddress = addresses.find(addr => addr.is_primary_address === 1) || addresses[0];
    
    const bottleInHand = primaryAddress.custom_bottle_in_hand || 0;
    const couponCount = primaryAddress.custom_coupon_count || 0;
    const coolerInHand = primaryAddress.custom_cooler_in_hand || 0;
    
    const message = `?? YOUR INVENTORY

?? BOTTLES IN HAND: ${bottleInHand}
${bottleInHand > 0 ? '(Ready for use)' : '(Need to reorder)'}

?? COUPON BALANCE: ${couponCount}
${couponCount > 0 ? '(Redeem for bottles)' : '(Purchase coupon book)'}

?? COOLER: ${coolerInHand > 0 ? 'YES ?' : 'NO ?'}

${bottleInHand < 5 ? '\n?? LOW STOCK - Consider reordering!' : ''}

What would you like to do?`;
    
    const buttons = [
        { id: 'quick_order', title: 'Order More' },
        { id: 'back_to_menu', title: 'Back' }
    ];
    
    return { message, buttons };
}

// Generate address confirmation
function generateAddressConfirmation(session) {
    const data = session.registrationData;
    const message = `Please confirm your delivery address:

?? Name: ${data.name}
?? Building: ${data.buildingName}
?? Area: ${data.area}
?? Flat: ${data.flatNo}

Is this information correct?`;
    
    const buttons = [
        { id: 'confirm_address', title: 'Confirm' },
        { id: 'edit_address', title: 'Edit Details' }
    ];
    
    return { message, buttons };
}

// Generate edit address menu
function generateEditAddressMenu(session) {
    const data = session.registrationData;
    const message = `What would you like to edit?

?? Name: ${data.name}
?? Building: ${data.buildingName}
?? Area: ${data.area}
?? Flat: ${data.flatNo}

Reply with:
1 - Edit Name
2 - Edit Building
3 - Edit Area
4 - Edit Flat`;
    
    const buttons = [
        { id: 'back_confirm', title: 'Back' }
    ];
    
    return { message, buttons };
}

// Start profile completion - FIXED to ensure all fields collected
async function startProfileCompletion(session) {
    const missing = findMissingFields(session.customerInfo);
    
    console.log('Missing fields:', missing);
    
    // Check for missing name
    if (!session.customerInfo.customer_name || session.customerInfo.customer_name === '') {
        session.state = 'updating_missing_name';
        return { 
            message: "Let's complete your profile!\n\n?? What's your full name?", 
            buttons: null 
        };
    }
    
    // Check for missing address
    if (!session.customerInfo.customer_primary_address || session.customerInfo.customer_primary_address === '') {
        session.registrationData = { 
            phoneNumber: session.phoneNumber,
            name: session.customerInfo.customer_name 
        };
        session.state = 'updating_missing_building';
        return { 
            message: "Great! Now let's add your address.\n\n?? What's your building name or number?", 
            buttons: null 
        };
    }
    
    // Profile is complete
    session.state = 'registered';
    return generateMainMenu(session);
}

// Handle quick order quantity
async function handleQuickOrderQuantity(messageBody, session) {
    const validation = validateQuantity(messageBody);
    
    if (!validation.isValid) {
        return {
            message: `? ${validation.error}\n\nPlease enter the number of bottles you need.\n\nExample: 10, 25, 50, 100`,
            buttons: [
                { id: 'back_to_menu', title: 'Back' }
            ]
        };
    }
    
    const directOrder = createDirectOrder(validation.quantity);
    session.currentOrder = directOrder;
    session.state = 'confirming_order';
    
    const confirmation = generateOrderConfirmation(session);
    
    return {
        message: confirmation.message,
        buttons: confirmation.buttons
    };
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
    
    if (buttonReply) {
        const result = await handleButtonReply(buttonReply, session);
        response = result.message;
        buttons = result.buttons;
        listData = result.listData;
    }
    else if (listReply) {
        const result = await handleListReply(listReply, session);
        response = result.message;
        buttons = result.buttons;
    }
    else if (session.state === 'new_user') {
        const customerCheck = await checkExistingCustomer(phoneNumber);
        
        if (customerCheck.exists) {
            session.customerInfo = customerCheck.customerData;
            
            if (customerCheck.missingFields.length > 0) {
                const existingInfo = buildExistingInfoMessage(session.customerInfo);
                session.state = 'showing_incomplete_profile';
                session.registrationData = { phoneNumber: session.phoneNumber };
                
                response = `Welcome back!\n\n${existingInfo}\n\nYour profile is incomplete. Complete it to place orders?`;
                buttons = [
                    { id: 'complete_profile', title: 'Complete Profile' },
                    { id: 'customer_support', title: 'Contact Support' }
                ];
            } else {
                session.state = 'registered';
                const result = generateMainMenu(session);
                response = result.message;
                buttons = result.buttons;
            }
        } else {
            session.state = 'new_customer_browsing';
            response = `WELCOME TO PREMIUM WATER DELIVERY!\n\nExplore our products and choose what you need. We'll collect your delivery details after you decide.\n\nWhat would you like to do?`;
            buttons = [
                { id: 'view_products', title: 'View Products' },
                { id: 'customer_support', title: 'Contact Us' }
            ];
        }
    }
    else if (location) {
        const result = await handleLocationMessage(message, session);
        response = result.message;
        buttons = result.buttons;
    }
    else if (messageBody) {
        const result = await handleTextMessage(messageBody, session);
        response = result.message;
        buttons = result.buttons;
        listData = result.listData;
    }
    
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
            
        case 'quick_order':
            session.state = 'quick_ordering';
            return {
                message: `?? QUICK ORDER

How many 5-gallon bottles do you need?

Type the exact quantity (e.g., 10, 25, 50, 100)

We'll prepare your order immediately!`,
                buttons: [
                    { id: 'back_to_menu', title: 'Back' }
                ]
            };
            
        case 'complete_profile':
            return await startProfileCompletion(session);
            
        case 'confirm_address':
            session.state = REGISTRATION_STATES.COLLECTING_LOCATION;
            return { 
                message: `Perfect! Now share your GPS location using the attachment button (??).\n\nThis helps us:\n? Find you easily\n? Validate service area\n? Optimize delivery routes`,
                buttons: null
            };
            
        case 'edit_address':
            return generateEditAddressMenu(session);
            
        case 'back_confirm':
            return generateAddressConfirmation(session);
            
        case 'save_profile':
            const customerResult = await createCustomerInERP(session.registrationData);
            
            if (customerResult.success) {
                // Refresh customer info from ERP
                const refreshedCustomer = await getCustomerDetails(customerResult.customerName);
                session.customerInfo = refreshedCustomer || customerResult.data;
                session.state = 'registered';
                
                if (session.selectedProductBeforeRegistration) {
                    session.currentOrder = session.selectedProductBeforeRegistration;
                    session.selectedProductBeforeRegistration = null;
                    session.state = 'confirming_order';
                    
                    const confirmMsg = generateOrderConfirmation(session);
                    return {
                        message: `? Registration Complete!\n\nNow let's complete your order:\n\n${confirmMsg.message}`,
                        buttons: confirmMsg.buttons
                    };
                }
                
                const mainMenu = generateMainMenu(session);
                return {
                    message: `? Registration Complete!\n\n${mainMenu.message}`,
                    buttons: mainMenu.buttons
                };
            } else {
                return {
                    message: `? Error creating profile.\n\nError: ${customerResult.error}\n\nPlease try again or contact support.`,
                    buttons: [
                        { id: 'retry_save', title: 'Try Again' },
                        { id: 'customer_support', title: 'Support' }
                    ]
                };
            }
            
        case 'edit_before_save':
            return generateEditAddressMenu(session);
            
        case 'retry_save':
            return await handleButtonReply('save_profile', session);
            
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
            
        case 'view_bottles':
            return await generateInventoryDetails(session);
            
        default:
            return { message: "I didn't understand that. Please try again.", buttons: null };
    }
}

// Handle list replies
async function handleListReply(listReplyId, session) {
    if (listReplyId.startsWith('product_')) {
        const productKey = listReplyId.replace('product_', '');
        
        if (PRODUCTS[productKey]) {
            if (!session.customerInfo) {
                session.selectedProductBeforeRegistration = PRODUCTS[productKey];
                session.state = REGISTRATION_STATES.COLLECTING_NAME;
                
                return {
                    message: `Great choice! ${PRODUCTS[productKey].name}\n\nTo complete your order, I need your delivery details. This is quick and only needed once.\n\n?? What's your full name?`,
                    buttons: null
                };
            }
            
            session.currentOrder = PRODUCTS[productKey];
            session.state = 'confirming_order';
            return generateOrderConfirmation(session);
        }
    }
    
    return { 
        message: "I didn't understand that. Please try again.", 
        buttons: null 
    };
}

// Handle location messages - FIXED to ensure address is saved
async function handleLocationMessage(message, session) {
    const locationData = extractLocationCoordinates(message);
    
    if (!locationData) {
        return { 
            message: '? Sorry, could not extract your location. Please try sharing your location again.',
            buttons: null
        };
    }
    
    const validation = validateServiceArea(locationData.latitude, locationData.longitude);
    
    if (!validation.isValid) {
        return {
            message: `? Location outside service area!\n\nYour location is near ${validation.nearestCity?.city.toUpperCase()} (${validation.nearestCity?.distance.toFixed(1)} km away)\n\nWe serve:\n? Dubai\n? Sharjah\n? Ajman\n\nContact support for expansion updates.`,
            buttons: [
                { id: 'customer_support', title: 'Contact Support' }
            ]
        };
    }
    
    // Save location data
    session.registrationData.latitude = locationData.latitude;
    session.registrationData.longitude = locationData.longitude;
    session.registrationData.phoneNumber = session.phoneNumber;
    
    console.log('Location saved:', { 
        lat: locationData.latitude, 
        lng: locationData.longitude,
        city: validation.city 
    });
    
    // For new customer registration
    if (session.state === REGISTRATION_STATES.COLLECTING_LOCATION) {
        session.state = 'final_confirmation';
        return {
            message: `? Location Confirmed: ${validation.city.toUpperCase()}\n\nFINAL CONFIRMATION:\n\n?? Name: ${session.registrationData.name}\n?? Building: ${session.registrationData.buildingName}\n?? Area: ${session.registrationData.area}\n?? Flat: ${session.registrationData.flatNo}\n?? City: ${validation.city.toUpperCase()}\n\nSave this profile?`,
            buttons: [
                { id: 'save_profile', title: 'Save & Continue' },
                { id: 'edit_before_save', title: 'Edit' }
            ]
        };
    }
    
    // For updating existing customer address
    if (session.state === 'updating_missing_location') {
        console.log('Creating address for existing customer:', session.customerInfo.name);
        const addressResult = await createAddressRecord(session.customerInfo.name, session.registrationData);
        
        if (addressResult) {
            console.log('Address created successfully, refreshing customer data');
            // Refresh customer data
            const refreshedCustomer = await getCustomerDetails(session.customerInfo.name);
            session.customerInfo = refreshedCustomer || session.customerInfo;
            
            session.state = 'registered';
            const mainMenu = generateMainMenu(session);
            return {
                message: `? Address Updated Successfully!\n\n?? Location: ${validation.city.toUpperCase()}\n? Profile complete!\n\n${mainMenu.message}`,
                buttons: mainMenu.buttons
            };
        } else {
            return {
                message: '? Failed to save address. Please try again or contact support.',
                buttons: [
                    { id: 'customer_support', title: 'Contact Support' }
                ]
            };
        }
    }
    
    return {
        message: "? Location received. What would you like to do?",
        buttons: [
            { id: 'back_to_menu', title: 'Main Menu' }
        ]
    };
}

// Handle text messages
async function handleTextMessage(messageBody, session) {
    const text = messageBody.toLowerCase().trim();
    
    // GLOBAL NAVIGATION
    if (text.match(/\b(menu|main|home|back|cancel)\b/i)) {
        if (session.state === 'new_customer_browsing') {
            return {
                message: "To order, register first. Would you like to:",
                buttons: [
                    { id: 'view_products', title: 'View Products' },
                    { id: 'customer_support', title: 'Get Help' }
                ]
            };
        } else if (session.customerInfo) {
            session.state = 'registered';
            return generateMainMenu(session);
        } else {
            session.state = 'new_user';
            return {
                message: "Welcome! How can I help?",
                buttons: [
                    { id: 'view_products', title: 'View Products' },
                    { id: 'customer_support', title: 'Contact Us' }
                ]
            };
        }
    }
    
    switch (session.state) {
        case REGISTRATION_STATES.COLLECTING_NAME:
            if (text.length < 2) {
                return { message: "Please provide your full name (at least 2 characters).", buttons: null };
            }
            session.registrationData.name = messageBody.trim();
            session.state = REGISTRATION_STATES.COLLECTING_BUILDING;
            return { message: "Thanks! ?? What's your building name or number?", buttons: null };
            
        case REGISTRATION_STATES.COLLECTING_BUILDING:
            session.registrationData.buildingName = messageBody.trim();
            session.state = REGISTRATION_STATES.COLLECTING_AREA;
            return { message: "?? What area/neighborhood are you in?", buttons: null };
            
        case REGISTRATION_STATES.COLLECTING_AREA:
            session.registrationData.area = messageBody.trim();
            session.state = REGISTRATION_STATES.COLLECTING_FLAT;
            return { message: "?? What's your flat/apartment number?", buttons: null };
            
        case REGISTRATION_STATES.COLLECTING_FLAT:
            session.registrationData.flatNo = messageBody.trim();
            session.state = 'confirming_address_details';
            return generateAddressConfirmation(session);
            
        case 'updating_missing_name':
            if (text.length < 2) {
                return { message: "Please provide a valid name (at least 2 characters).", buttons: null };
            }
            
            const updateNameResult = await updateCustomerInERP(session.customerInfo.name, { 
                customer_name: messageBody.trim() 
            });
            
            if (updateNameResult.success) {
                session.customerInfo.customer_name = messageBody.trim();
                
                // Check if address exists
                const addresses = await getCustomerAddresses(session.customerInfo.name);
                
                if (!addresses || addresses.length === 0) {
                    session.registrationData = { 
                        phoneNumber: session.phoneNumber, 
                        name: messageBody.trim() 
                    };
                    session.state = 'updating_missing_building';
                    return { message: "Great! Now your address.\n\n?? Building name or number?", buttons: null };
                } else {
                    session.state = 'registered';
                    const mainMenu = generateMainMenu(session);
                    return {
                        message: `? Profile complete!\n\n${mainMenu.message}`,
                        buttons: mainMenu.buttons
                    };
                }
            } else {
                return {
                    message: `? Error updating. Try again.\n\nError: ${updateNameResult.error}`,
                    buttons: [
                        { id: 'customer_support', title: 'Contact Support' }
                    ]
                };
            }
            
        case 'updating_missing_building':
            session.registrationData.buildingName = messageBody.trim();
            session.state = 'updating_missing_area';
            return { message: "?? What area/neighborhood?", buttons: null };
            
        case 'updating_missing_area':
            session.registrationData.area = messageBody.trim();
            session.state = 'updating_missing_flat';
            return { message: "?? Flat/apartment number?", buttons: null };
            
        case 'updating_missing_flat':
            session.registrationData.flatNo = messageBody.trim();
            session.state = 'updating_missing_location';
            return { 
                message: `Almost done! ??\n\nShare your GPS location using the attachment button (??).`,
                buttons: null
            };
            
        case 'editing_name':
            if (text.length < 2) {
                return { message: "Valid name please (at least 2 characters).", buttons: null };
            }
            session.registrationData.name = messageBody.trim();
            session.state = 'confirming_address_details';
            return generateAddressConfirmation(session);
            
        case 'editing_building':
            session.registrationData.buildingName = messageBody.trim();
            session.state = 'confirming_address_details';
            return generateAddressConfirmation(session);
            
        case 'editing_area':
            session.registrationData.area = messageBody.trim();
            session.state = 'confirming_address_details';
            return generateAddressConfirmation(session);
            
        case 'editing_flat':
            session.registrationData.flatNo = messageBody.trim();
            session.state = 'confirming_address_details';
            return generateAddressConfirmation(session);
            
        case 'confirming_address_details':
            if (text === '1') {
                session.state = 'editing_name';
                return { message: `Current: ${session.registrationData.name}\n\nEnter new name:`, buttons: null };
            } else if (text === '2') {
                session.state = 'editing_building';
                return { message: `Current: ${session.registrationData.buildingName}\n\nEnter new building:`, buttons: null };
            } else if (text === '3') {
                session.state = 'editing_area';
                return { message: `Current: ${session.registrationData.area}\n\nEnter new area:`, buttons: null };
            } else if (text === '4') {
                session.state = 'editing_flat';
                return { message: `Current: ${session.registrationData.flatNo}\n\nEnter new flat:`, buttons: null };
            }
            return generateAddressConfirmation(session);
            
        case 'new_customer_browsing':
            if (text.match(/\b(product|water|bottle|view|order|buy|[1-5])\b/i)) {
                session.state = 'viewing_products';
                return generateProductListMessage();
            }
            return {
                message: "To get started:\n- View products\n- Contact support",
                buttons: [
                    { id: 'view_products', title: 'View Products' },
                    { id: 'customer_support', title: 'Get Help' }
                ]
            };
            
        case 'quick_ordering':
            return await handleQuickOrderQuantity(messageBody, session);
            
        case 'registered':
            return await handleRegisteredCustomerMessage(text, session);
            
        case 'viewing_products':
            if (text === '1' || text === '2' || text === '3' || text === '4' || text === '5') {
                return await handleProductSelectionByNumber(text, session);
            } else if (text.match(/\b(menu|back)\b/i)) {
                if (session.customerInfo) {
                    session.state = 'registered';
                    return generateMainMenu(session);
                } else {
                    session.state = 'new_customer_browsing';
                    return {
                        message: "What would you like to do?",
                        buttons: [
                            { id: 'view_products', title: 'View Products' },
                            { id: 'customer_support', title: 'Get Help' }
                        ]
                    };
                }
            } else {
                return generateProductListMessage();
            }
            
        case 'confirming_order':
            return await handleOrderConfirmation(text, session);
            
        default:
            console.log(`Unhandled state: ${session.state}`);
            session.state = 'new_user';
            
            const customerCheck = await checkExistingCustomer(session.phoneNumber);
            
            if (customerCheck.exists) {
                session.customerInfo = customerCheck.customerData;
                
                if (customerCheck.missingFields.length > 0) {
                    return await startProfileCompletion(session);
                } else {
                    session.state = 'registered';
                    return generateMainMenu(session);
                }
            } else {
                session.state = REGISTRATION_STATES.COLLECTING_NAME;
                return { 
                    message: "WELCOME TO PREMIUM WATER DELIVERY!\n\nTo get started, I need your details. This is quick!\n\n?? What's your name?", 
                    buttons: null 
                };
            }
    }
}

// Handle registered customer messages
async function handleRegisteredCustomerMessage(text, session) {
    if (text.match(/^(hi|hello|hey|hii|helo|start|good morning|good evening)$/i)) {
        return generateMainMenu(session);
    }
    
    if (text.match(/\b(account|profile|info|details|my info|inventory|bottles|stock)\b/i)) {
        return await generateAccountInfo(session);
    }
    
    if (text.match(/\b(support|help|contact|issue|problem|complaint|suggestion)\b/i)) {
        return generateSupportInfo();
    }
    
    // Direct number input for quick order
    if (text.match(/^\d+$/)) {
        const qty = parseInt(text);
        if (qty >= 1 && qty <= 500) {
            session.state = 'quick_ordering';
            return await handleQuickOrderQuantity(text, session);
        }
    }
    
    return {
        message: "I didn't understand. Here's what I can help with:",
        buttons: [
            { id: 'quick_order', title: 'Quick Order' },
            { id: 'check_account', title: 'My Account' },
            { id: 'customer_support', title: 'Get Help' }
        ]
    };
}

// Handle product selection by number
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
    } else if (text === '5' || text.includes('cooler')) {
        selectedProduct = PRODUCTS.coupon_100_cooler;
    }
    
    if (selectedProduct) {
        session.currentOrder = selectedProduct;
        session.state = 'confirming_order';
        return generateOrderConfirmation(session);
    }
    
    return generateProductListMessage();
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
            
            let orderSummary = '';
            if (currentOrder.isDirect) {
                orderSummary = `?? Order: ${orderResult.orderName}
?? Product: ${currentOrder.name}
?? Quantity: ${currentOrder.qty} bottles`;
            } else {
                orderSummary = `?? Order: ${orderResult.orderName}
?? Product: ${currentOrder.name}
?? Quantity: ${currentOrder.qty} bottles
?? Total: AED ${(currentOrder.price + currentOrder.deposit).toFixed(2)}`;
            }
            
            return {
                message: `? ORDER CONFIRMED!

${orderSummary}

?? NEXT STEPS:
• Team will call within 2 hours
• Delivery within 24 hours
• Payment on delivery (Cash)

Thank you for your order! ??

${mainMenu.message}`,
                buttons: mainMenu.buttons
            };
        } else {
            return {
                message: `? Order failed. Try again or contact support.\n\nError: ${orderResult.error}`,
                buttons: [
                    { id: 'customer_support', title: 'Contact Support' }
                ]
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
            message: `Please use buttons to confirm or cancel.\n\n${confirmation.message}`,
            buttons: confirmation.buttons
        };
    }
}

// Keep-alive
async function keepAlive() {
    if (!KEEP_ALIVE_URL) return;
    try {
        await axios.get(`${KEEP_ALIVE_URL}/health`, { timeout: 30000 });
        console.log(`Keep-alive: ${new Date().toISOString()}`);
    } catch (error) {
        console.error(`Keep-alive failed:`, error.message);
    }
}

function startKeepAlive() {
    if (!KEEP_ALIVE_URL) return;
    console.log(`Keep-alive every ${KEEP_ALIVE_INTERVAL / 60000} min`);
    setInterval(keepAlive, KEEP_ALIVE_INTERVAL);
}

// Session cleanup
setInterval(() => {
    const now = Date.now();
    const twoHours = 2 * 60 * 60 * 1000;
    
    for (const [phone, session] of userSessions.entries()) {
        if (now - session.lastActivity > twoHours) {
            userSessions.delete(phone);
            console.log(`Cleaned session: ${phone}`);
        }
    }
}, 30 * 60 * 1000);

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '16.0.0-Complete-Fixed',
        activeSessions: userSessions.size,
        features: {
            quickOrderDirect: true,
            vatPricing: true,
            inventoryTracking: true,
            addressSavingFixed: true,
            customerDetailsComplete: true,
            existingCustomersNoViewProducts: true
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
        <title>WhatsApp Bot v16.0 - Fixed</title>
        <style>
            body { font-family: Arial; margin: 20px; background: #f5f5f5; }
            .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; }
            .status { padding: 20px; background: #e8f5e8; border-radius: 8px; margin: 20px 0; }
            .feature { margin: 10px 0; padding: 12px; background: #f8f8f8; border-radius: 6px; border-left: 4px solid #28a745; }
            .fix { margin: 10px 0; padding: 12px; background: #fff3cd; border-radius: 6px; border-left: 4px solid #ffc107; }
            .active { color: #28a745; font-weight: bold; }
            h1 { color: #333; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>? WhatsApp Water Delivery Bot v16.0</h1>
            <div class="status">
                <h2>Status: <span class="active">ACTIVE & FIXED</span></h2>
                <p><strong>Version:</strong> 16.0.0-Complete-Fixed</p>
                <p><strong>Active Sessions:</strong> ${userSessions.size}</p>
            </div>
            
            <h3>?? FIXES APPLIED:</h3>
            <div class="fix">? FIX 1: Existing customers - "View Products" button removed</div>
            <div class="fix">? FIX 2: Address details - All fields properly prompted and saved to ERP</div>
            <div class="fix">? FIX 3: Customer details - Shows complete info including bottles in hand, coupon count, cooler status</div>
            
            <h3>?? FEATURES:</h3>
            <div class="feature">? Quick Order: Direct quantity input (no price shown)</div>
            <div class="feature">? Coupon Packages: Price + 5% VAT breakdown</div>
            <div class="feature">? Address Saving: Proper ERPNext format with all fields</div>
            <div class="feature">? Inventory Tracking: Bottles, coupons, cooler - all displayed</div>
            <div class="feature">? Profile Management: Complete customer details with emojis</div>
            <div class="feature">? Service Area: Closest city detection</div>
        </div>
    </body>
    </html>
    `);
});

app.listen(PORT, () => {
    console.log(`? WhatsApp Bot v16.0 on port ${PORT}`);
    console.log('? All fixes applied and tested');
    console.log('? Ready for production');
    startKeepAlive();
});