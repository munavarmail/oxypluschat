require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const GRAPH_API_TOKEN = process.env.GRAPH_API_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// OpenAI Configuration for GPT-4o-mini
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

// ERPNext Configuration
const ERPNEXT_URL = process.env.ERPNEXT_URL || process.env.DOTORDERS_ERP_URL;
const ERPNEXT_API_KEY = process.env.ERPNEXT_API_KEY || process.env.DOTORDERS_ERP_API_KEY;
const ERPNEXT_API_SECRET = process.env.ERPNEXT_API_SECRET || process.env.DOTORDERS_ERP_API_SECRET;

// Keep-alive configuration
const KEEP_ALIVE_URL = process.env.KEEP_ALIVE_URL;
const KEEP_ALIVE_INTERVAL = 25 * 60 * 1000;

// Enhanced conversation state management
const userSessions = new Map();

// Product catalog with enhanced descriptions
const PRODUCTS = {
    'single_bottle': { 
        name: 'Single Bottle', 
        price: 7, 
        deposit: 15, 
        item_code: '5 Gallon Filled',
        description: '5-gallon water bottle made from 100% virgin material with low sodium and pH-balanced water',
        keywords: ['single', 'one bottle', 'individual', 'trial', '1 bottle', 'bottle'],
        salesPoints: ['Perfect for trying our quality', 'No commitment', 'Quick delivery']
    },
    'trial_bottle': { 
        name: 'Trial Bottle', 
        price: 7, 
        deposit: 15, 
        item_code: '5 Gallon Filled',
        description: 'Trial 5-gallon water bottle - perfect for first-time customers',
        keywords: ['trial', 'test', 'first time', 'sample'],
        salesPoints: ['Risk-free trial', 'Experience our quality', 'Same premium water']
    },
    'table_dispenser': { 
        name: 'Table Top Dispenser', 
        price: 25, 
        deposit: 0, 
        item_code: 'Table Dispenser',
        description: 'Basic table top dispenser for convenient water access',
        keywords: ['table', 'dispenser', 'basic', 'simple', 'stand'],
        salesPoints: ['No electricity needed', 'Compact design', 'Easy to use']
    },
    'hand_pump': { 
        name: 'Hand Pump', 
        price: 15, 
        deposit: 0, 
        item_code: 'Hand Pump',
        description: 'Manual hand pump for bottles - most economical option',
        keywords: ['pump', 'manual', 'hand', 'cheap'],
        salesPoints: ['Most affordable', 'No maintenance', 'Works anywhere']
    },
    'premium_cooler': { 
        name: 'Premium Water Cooler', 
        price: 300, 
        deposit: 0, 
        item_code: 'Water Cooler',
        description: 'Premium cooler with hot/cold water, 1-year warranty from Geo General',
        keywords: ['premium', 'cooler', 'hot', 'cold', 'electric'],
        salesPoints: ['Hot & cold water', '1-year warranty', 'Premium quality', 'Energy efficient']
    },
    'coupon_10_1': { 
        name: '10+1 Coupon Book', 
        price: 70, 
        deposit: 0, 
        item_code: 'Coupon Book',
        description: '11 bottles (10+1 free), up to 3 bottles without deposit',
        keywords: ['10+1', 'eleven', 'coupon book', 'small package', '11 bottles', 'coupon'],
        salesPoints: ['Save on deposit', 'Free bottle included', 'Better per-bottle price', 'Priority delivery']
    },
    'coupon_100_40': { 
        name: '100+40 Coupon Book', 
        price: 700, 
        deposit: 0, 
        item_code: 'Coupon Book',
        description: '140 bottles total, up to 5 bottles without deposit, BNPL available',
        keywords: ['100+40', '140', 'bulk', 'large package', 'bnpl', '140 bottles', 'coupon'],
        salesPoints: ['Best value for money', 'Buy now pay later option', 'Huge savings', 'No deposit for 5 bottles', 'Priority service']
    },
    'premium_package': { 
        name: '140 Bottles + Premium Dispenser', 
        price: 920, 
        deposit: 0, 
        item_code: 'Premium Package',
        description: '140 bottles + Premium dispenser package - complete solution',
        keywords: ['premium package', 'complete', 'dispenser included', 'combo', 'package'],
        salesPoints: ['Complete water solution', 'Premium dispenser included', 'Maximum convenience', 'Best overall value']
    }
};

// Enhanced knowledge base
const KNOWLEDGE_BASE = `
COMPANY INFORMATION:
- Water delivery service operating in Dubai, Sharjah, Ajman (except freezones)
- HQ located in Ajman
- 10+ years of experience in commercial and residential delivery
- Focus on quality: 100% virgin material bottles, low sodium, pH-balanced water
- Superior customer service compared to competitors

PRODUCTS AND PRICING:
1. Single Bottle - AED 7 + AED 15 deposit (5-gallon water bottle)
2. Trial Bottle - AED 7 + AED 15 deposit (perfect for first-time customers)
3. Table Top Dispenser - AED 25 (basic dispenser, no electricity needed)
4. Hand Pump - AED 15 (manual pump, most economical)
5. Premium Water Cooler - AED 300 (hot/cold water, 1-year warranty)
6. 10+1 Coupon Book - AED 70 (11 bottles, save on deposit)
7. 100+40 Coupon Book - AED 700 (140 bottles, best value, BNPL available)
8. Premium Package - AED 920 (140 bottles + premium dispenser)

INTENT UNDERSTANDING:
Understand customer purpose through conversation rather than showing menu options.
Ask qualifying questions to understand their water needs and recommend appropriate products.

PAYMENT METHODS:
- Cash payment on delivery
- Bank transfer
- Card payment (notify one day prior)
- Buy Now Pay Later (ONLY for 100+40 Coupon Book)

DELIVERY INFORMATION:
- Coverage: Dubai, Sharjah, Ajman (no freezones)
- Same-day/next-day delivery available
- Weekly scheduled delivery options
- Free delivery with coupon books
- Standard charges for individual bottles
`;

// Enhanced user session structure with location support
function createUserSession() {
    return {
        state: 'active',
        conversationHistory: [],
        customerInfo: null,
        customerLocation: null,
        interests: [],
        qualification: {
            consumption: null,
            location: null,
            currentSupplier: null,
            budget: null,
            urgency: null,
            purpose: null
        },
        orderInProgress: null,
        lastActivity: Date.now(),
        salesStage: 'discovery',
        isExistingCustomer: false,
        locationShared: false
    };
}

// Keep-alive functions
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
        console.log(`Keep-alive ping successful at ${new Date().toISOString()} - Status: ${response.status}`);
    } catch (error) {
        console.error(`Keep-alive ping failed at ${new Date().toISOString()}:`, error.message);
    }
}

function startKeepAlive() {
    if (!KEEP_ALIVE_URL) {
        console.log('KEEP_ALIVE_URL not configured - server may sleep on free hosting plans');
        return;
    }
    
    console.log(`Starting keep-alive service - pinging every ${KEEP_ALIVE_INTERVAL / 60000} minutes`);
    setTimeout(keepAlive, 2 * 60 * 1000);
    setInterval(keepAlive, KEEP_ALIVE_INTERVAL);
}

// Enhanced customer identification with intent understanding
async function identifyCustomer(message, session, userPhone) {
    const lowerMessage = message.toLowerCase().trim();
    
    // Check if it's a mobile number
    if (isMobileNumber(message)) {
        console.log(`Mobile number detected: ${message}`);
        const customerInfo = await getCustomerByMobileEnhanced(message.trim());
        
        if (customerInfo && !customerInfo.includes('NEW CUSTOMER DETECTED')) {
            session.customerInfo = customerInfo;
            session.state = 'customer_identified';
            session.isExistingCustomer = true;
            
            return `${customerInfo}

How can I help you today? Are you looking to place a new order or need assistance with something else?`;
        } else {
            session.state = 'new_customer_setup';
            session.isExistingCustomer = false;
            return customerInfo; // This contains the new customer setup message
        }
    }
    
    return null; // Not a mobile number
}

// Intent understanding instead of menu display
async function understandCustomerIntent(message, session) {
    const lowerMessage = message.toLowerCase().trim();
    
    // Check for greeting patterns
    const greetings = ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening', 'salaam', 'assalam', 'start'];
    const isGreeting = greetings.some(greeting => lowerMessage.includes(greeting)) || lowerMessage === 'hi' || lowerMessage === 'hello';
    
    if (isGreeting) {
        return `Hello! I'm here to help you with premium water delivery in Dubai, Sharjah, and Ajman.

What brings you here today? Are you:
- Looking for water bottles for home or office?
- Interested in water dispensers or coolers?
- Need regular water delivery service?
- Have questions about our products?

Just tell me what you're looking for and I'll help you find the perfect solution.`;
    }
    
    // Detect specific intents
    if (lowerMessage.includes('water') || lowerMessage.includes('bottle') || lowerMessage.includes('delivery')) {
        session.qualification.purpose = 'water_delivery';
        return `I can help you with water delivery! 

To recommend the best option for you, let me ask:
- Is this for home or office use?
- How many people typically drink the water?
- Are you looking for a one-time order or regular delivery?

Based on your needs, I can suggest from single bottles to bulk packages with significant savings.`;
    }
    
    if (lowerMessage.includes('dispenser') || lowerMessage.includes('cooler') || lowerMessage.includes('pump')) {
        session.qualification.purpose = 'equipment';
        return `Looking for water dispensers or equipment? Great choice!

We offer:
- Hand Pump (AED 15) - Most economical, manual operation
- Table Dispenser (AED 25) - No electricity needed, convenient
- Premium Cooler (AED 300) - Hot & cold water, 1-year warranty

What type of setup do you prefer? Electric with hot/cold water, or a simpler manual option?`;
    }
    
    if (lowerMessage.includes('price') || lowerMessage.includes('cost') || lowerMessage.includes('how much')) {
        return `Our pricing is transparent with no hidden costs:

WATER BOTTLES:
Single Bottle: AED 7 + AED 15 deposit (refundable)

BETTER VALUE PACKAGES:
10+1 Coupon Book: AED 70 (11 bottles, save on deposits)
100+40 Coupon Book: AED 700 (140 bottles, best savings)

EQUIPMENT:
Hand Pump: AED 15
Table Dispenser: AED 25  
Premium Cooler: AED 300

What's your typical water consumption like? I can recommend the most cost-effective option for you.`;
    }
    
    // Default conversational response for intent discovery
    return `I'd be happy to help you find the right water solution!

Could you tell me a bit more about what you're looking for? For example:
- Are you setting up water for a new home or office?
- Looking to switch from your current water supplier?
- Need equipment like dispensers or coolers?
- Want to know about our delivery service?

The more I know about your needs, the better I can help you choose the perfect option.`;
}

// Enhanced location collection with attachment instructions
async function requestLocationWithInstructions(session, userPhone) {
    session.state = 'collecting_address';
    
    return `To provide accurate delivery service, I need your location.

METHOD 1 - ATTACH LOCATION (RECOMMENDED):
1. Tap the PAPERCLIP/ATTACHMENT icon (+) at the bottom left
2. Select "Location" from the options
3. Choose "Send your current location" or "Send nearby location"
4. Tap "Send"

This gives us your exact coordinates for precise delivery.

METHOD 2 - TYPE ADDRESS MANUALLY:
Simply type your full address including:
- Building/Villa name and number
- Street name
- Area/District  
- City (Dubai/Sharjah/Ajman)

Which method would you prefer?`;
}

// Process location message with coordinates extraction
async function processLocationMessage(message, session, userPhone) {
    if (message.location) {
        const { latitude, longitude } = message.location;
        console.log(`Location coordinates received: ${latitude}, ${longitude}`);
        
        // Validate location is in service area
        const locationValidation = await validateDeliveryLocation(latitude, longitude);
        
        if (locationValidation.inServiceArea) {
            session.customerLocation = {
                latitude: latitude,
                longitude: longitude,
                address: locationValidation.formattedAddress,
                area: locationValidation.area,
                city: locationValidation.city,
                coordinates_saved: true
            };
            session.locationShared = true;
            
            // Save coordinates to customer if they exist
            if (session.isExistingCustomer && session.customerInfo) {
                await saveCoordinatesToCustomer(userPhone, latitude, longitude);
            }
            
            if (session.state === 'new_customer_setup' || session.state === 'collecting_address') {
                if (session.isExistingCustomer) {
                    session.state = 'location_confirmed';
                    return `Location saved successfully!

Coordinates: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}
Area: ${locationValidation.area}, ${locationValidation.city}
Delivery time: ${locationValidation.estimatedDelivery}

What would you like to order today?`;
                } else {
                    session.state = 'collecting_customer_name';
                    return `Perfect! Location coordinates saved.

Area: ${locationValidation.area}, ${locationValidation.city}
Delivery available: ${locationValidation.estimatedDelivery}

Now I need your name for delivery records. What name should I use for your orders?`;
                }
            }
        } else {
            return `Location received but outside our delivery area.

Your coordinates: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}

We currently serve:
- Dubai
- Sharjah  
- Ajman (excluding freezones)

If you have an address within these areas, please share that location or contact us for special arrangements.`;
        }
    }
    
    return "I didn't receive location coordinates. Please try attaching your location again or type your address manually.";
}

// Save coordinates to existing customer in ERPNext
async function saveCoordinatesToCustomer(customerPhone, latitude, longitude) {
    try {
        console.log(`Saving coordinates for customer: ${customerPhone}`);
        
        // First find the customer
        const searchUrl = `${ERPNEXT_URL}/api/resource/Customer`;
        const searchResponse = await axios.get(searchUrl, {
            headers: {
                'Authorization': `token ${ERPNEXT_API_KEY}:${ERPNEXT_API_SECRET}`,
                'Content-Type': 'application/json'
            },
            params: {
                filters: JSON.stringify([['mobile_no', '=', customerPhone]]),
                fields: JSON.stringify(['name'])
            }
        });

        if (searchResponse.data.data && searchResponse.data.data.length > 0) {
            const customerName = searchResponse.data.data[0].name;
            
            // Update customer with coordinates
            const updateUrl = `${ERPNEXT_URL}/api/resource/Customer/${customerName}`;
            await axios.put(updateUrl, {
                custom_latitude: latitude,
                custom_longitude: longitude
            }, {
                headers: {
                    'Authorization': `token ${ERPNEXT_API_KEY}:${ERPNEXT_API_SECRET}`,
                    'Content-Type': 'application/json'
                }
            });
            
            console.log(`Coordinates saved to customer ${customerName}: ${latitude}, ${longitude}`);
        }
        
    } catch (error) {
        console.error('Error saving coordinates to customer:', error.response?.data || error.message);
        // Don't fail the process if coordinate saving fails
    }
}

// Validate if location is in delivery area with better area detection
async function validateDeliveryLocation(latitude, longitude) {
    try {
        // Enhanced delivery areas with more precise boundaries
        const deliveryAreas = {
            dubai: { 
                lat: [24.9, 25.35], 
                lon: [54.9, 55.6],
                areas: {
                    'Dubai Marina': { lat: [25.07, 25.1], lon: [55.13, 55.15] },
                    'Business Bay': { lat: [25.18, 25.2], lon: [55.25, 55.27] },
                    'Downtown Dubai': { lat: [25.19, 25.21], lon: [55.27, 55.29] },
                    'Jumeirah': { lat: [25.2, 25.25], lon: [55.25, 55.3] },
                    'Dubai South': { lat: [24.9, 25.0], lon: [55.15, 55.25] }
                }
            },
            sharjah: { 
                lat: [25.25, 25.4], 
                lon: [55.35, 55.65],
                areas: {
                    'Sharjah City': { lat: [25.34, 25.37], lon: [55.38, 55.42] },
                    'Al Nahda': { lat: [25.3, 25.32], lon: [55.37, 55.39] }
                }
            },
            ajman: { 
                lat: [25.35, 25.45], 
                lon: [55.4, 55.55],
                areas: {
                    'Ajman City': { lat: [25.4, 25.42], lon: [55.43, 55.46] },
                    'Al Nuaimia': { lat: [25.38, 25.4], lon: [55.45, 55.47] }
                }
            }
        };
        
        let inServiceArea = false;
        let city = 'Unknown';
        let area = 'Unknown';
        
        // Check if coordinates fall within delivery areas
        Object.entries(deliveryAreas).forEach(([cityName, cityBounds]) => {
            if (latitude >= cityBounds.lat[0] && latitude <= cityBounds.lat[1] &&
                longitude >= cityBounds.lon[0] && longitude <= cityBounds.lon[1]) {
                inServiceArea = true;
                city = cityName.charAt(0).toUpperCase() + cityName.slice(1);
                
                // Find specific area
                Object.entries(cityBounds.areas).forEach(([areaName, areaBounds]) => {
                    if (latitude >= areaBounds.lat[0] && latitude <= areaBounds.lat[1] &&
                        longitude >= areaBounds.lon[0] && longitude <= areaBounds.lon[1]) {
                        area = areaName;
                    }
                });
                
                // Default area if specific not found
                if (area === 'Unknown') {
                    if (cityName === 'dubai') {
                        area = latitude > 25.25 ? 'Northern Dubai' : 'Central Dubai';
                    } else {
                        area = city + ' Area';
                    }
                }
            }
        });
        
        const formattedAddress = `Coordinates: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
        
        return {
            inServiceArea: inServiceArea,
            formattedAddress: formattedAddress,
            area: area,
            city: city,
            estimatedDelivery: inServiceArea ? '2-4 hours' : 'Not available'
        };
        
    } catch (error) {
        console.error('Error validating location:', error);
        return {
            inServiceArea: false,
            formattedAddress: 'Unable to verify location',
            area: 'Unknown',
            city: 'Unknown',
            estimatedDelivery: 'Unknown'
        };
    }
}

// Process manually typed address and save to ERPNext
async function processManualAddress(address, session, userPhone) {
    console.log(`Processing manual address: ${address}`);
    
    const lowerAddress = address.toLowerCase();
    const validCities = ['dubai', 'sharjah', 'ajman'];
    const foundCity = validCities.find(city => lowerAddress.includes(city));
    
    if (!foundCity) {
        return `Please include the city in your address. We deliver to Dubai, Sharjah, and Ajman.

Example format:
"Villa 123, Al Noor Street
Business Bay, Dubai"

Please provide your complete address with city:`;
    }
    
    if (address.length < 15) {
        return `Please provide a more detailed address:

Required information:
- Building/Villa name and number
- Street name  
- Area/District
- City

Your current address: "${address}"

Please add more details:`;
    }
    
    // Address looks good, save it
    session.customerLocation = {
        address: address,
        city: foundCity.charAt(0).toUpperCase() + foundCity.slice(1),
        type: 'manual',
        coordinates_saved: false
    };
    
    // Save address to customer profile if existing customer
    if (session.isExistingCustomer && session.customerInfo) {
        await saveAddressToCustomer(userPhone, address);
    }
    
    if (session.state === 'new_customer_setup' || session.state === 'collecting_address') {
        if (session.isExistingCustomer) {
            session.state = 'address_confirmed';
            return `Address saved to your profile:
${address}

What would you like to order today?`;
        } else {
            session.state = 'collecting_customer_name';
            return `Address confirmed:
${address}

Now I need your name for delivery. What name should I use for your orders?`;
        }
    }
    
    return `Address updated:
${address}

How can I help you today?`;
}

// Save address to existing customer in ERPNext
async function saveAddressToCustomer(customerPhone, address) {
    try {
        console.log(`Saving address for customer: ${customerPhone}`);
        
        // Find the customer first
        const searchUrl = `${ERPNEXT_URL}/api/resource/Customer`;
        const searchResponse = await axios.get(searchUrl, {
            headers: {
                'Authorization': `token ${ERPNEXT_API_KEY}:${ERPNEXT_API_SECRET}`,
                'Content-Type': 'application/json'
            },
            params: {
                filters: JSON.stringify([['mobile_no', '=', customerPhone]]),
                fields: JSON.stringify(['name'])
            }
        });

        if (searchResponse.data.data && searchResponse.data.data.length > 0) {
            const customerName = searchResponse.data.data[0].name;
            
            // Create or update address
            await createCustomerAddress(customerName, { address: address, customerPhone: customerPhone });
            console.log(`Address saved for customer ${customerName}`);
        }
        
    } catch (error) {
        console.error('Error saving address to customer:', error.response?.data || error.message);
    }
}

// Handle customer name collection
async function handleCustomerNameCollection(message, session, userPhone) {
    const customerName = message.trim();
    
    if (customerName.length < 2) {
        return `Please provide a valid name for delivery:`;
    }
    
    session.customerInfo = {
        name: customerName,
        phone: userPhone,
        location: session.customerLocation
    };
    
    session.state = 'customer_profile_complete';
    
    return `Customer profile created successfully!

Name: ${customerName}
Phone: ${userPhone}
Address: ${session.customerLocation.address || 'Location coordinates saved'}

Your profile is ready for orders! What would you like to order today?`;
}

// Enhanced customer lookup with location info
async function getCustomerByMobileEnhanced(mobileNumber) {
    try {
        console.log(`Enhanced customer lookup: ${mobileNumber}`);
        
        const searchUrl = `${ERPNEXT_URL}/api/resource/Customer`;
        
        const response = await axios.get(searchUrl, {
            headers: {
                'Authorization': `token ${ERPNEXT_API_KEY}:${ERPNEXT_API_SECRET}`,
                'Content-Type': 'application/json'
            },
            params: {
                filters: JSON.stringify([['mobile_no', '=', mobileNumber]]),
                fields: JSON.stringify(['name', 'customer_name', 'mobile_no', 'creation', 'custom_latitude', 'custom_longitude'])
            }
        });

        const customers = response.data.data;
        
        if (customers && customers.length > 0) {
            const customer = customers[0];
            console.log(`Existing customer found: ${customer.customer_name}`);
            
            // Get customer's addresses and recent orders
            const [addressInfo, orderHistory] = await Promise.all([
                getCustomerAddressEnhanced(customer.name),
                getRecentOrders(customer.name)
            ]);
            
            let coordinateInfo = '';
            if (customer.custom_latitude && customer.custom_longitude) {
                coordinateInfo = `\nSaved coordinates: ${customer.custom_latitude}, ${customer.custom_longitude}`;
            }
            
            let responseText = `Welcome back!

Name: ${customer.customer_name}
Mobile: ${customer.mobile_no}
Customer since: ${formatDate(customer.creation)}${coordinateInfo}

${addressInfo}

${orderHistory}`;
            
            return responseText;
            
        } else {
            console.log(`New customer: ${mobileNumber}`);
            return `NEW CUSTOMER DETECTED

Mobile: ${mobileNumber}

Let me set up your profile for faster future orders.

I need your delivery location first. You can either:

1. ATTACH YOUR LOCATION (recommended):
   - Tap the attachment/paperclip icon (+)
   - Select "Location"
   - Send your current location

2. TYPE YOUR ADDRESS manually

Which method do you prefer?`;
        }
        
    } catch (error) {
        console.error('Error in enhanced customer lookup:', error.response?.data || error.message);
        return 'Unable to verify customer information. Please try again or contact support.';
    }
}

// Get enhanced customer address information
async function getCustomerAddressEnhanced(customerName) {
    try {
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
                fields: JSON.stringify(['address_title', 'address_line1', 'address_line2', 'city', 'is_primary_address'])
            }
        });

        const addresses = response.data.data;
        
        if (addresses && addresses.length > 0) {
            let addressText = 'Delivery addresses:\n';
            
            addresses.forEach((address, index) => {
                addressText += `${index + 1}. ${address.address_title || 'Address'}${address.is_primary_address ? ' (Primary)' : ''}\n`;
                if (address.address_line1) addressText += `   ${address.address_line1}\n`;
                if (address.address_line2) addressText += `   ${address.address_line2}\n`;
                if (address.city) addressText += `   ${address.city}\n`;
            });
            
            return addressText;
        } else {
            return 'No saved addresses found.';
        }
        
    } catch (error) {
        console.error('Error fetching enhanced address:', error.response?.data || error.message);
        return 'Unable to fetch address information.';
    }
}

// Get recent order history
async function getRecentOrders(customerName) {
    try {
        const orderUrl = `${ERPNEXT_URL}/api/resource/Sales Order`;
        
        const response = await axios.get(orderUrl, {
            headers: {
                'Authorization': `token ${ERPNEXT_API_KEY}:${ERPNEXT_API_SECRET}`,
                'Content-Type': 'application/json'
            },
            params: {
                filters: JSON.stringify([['customer', '=', customerName]]),
                fields: JSON.stringify(['name', 'transaction_date', 'grand_total', 'status']),
                order_by: 'transaction_date desc',
                limit: 3
            }
        });

        const orders = response.data.data;
        
        if (orders && orders.length > 0) {
            let orderText = `Recent orders:\n`;
            
            orders.forEach((order, index) => {
                orderText += `${index + 1}. ${order.name} - AED ${order.grand_total} (${order.status})\n`;
                orderText += `   ${formatDate(order.transaction_date)}\n`;
            });
            
            return orderText;
        } else {
            return 'No previous orders found.';
        }
        
    } catch (error) {
        console.error('Error fetching recent orders:', error);
        return 'Unable to fetch order history.';
    }
}

// Format date for display
function formatDate(dateString) {
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
        });
    } catch (error) {
        return dateString;
    }
}

// GPT-4o-mini integration with intent understanding focus
async function getGPTResponse(userMessage, session, context = '') {
    try {
        const conversationHistory = session.conversationHistory.slice(-8);
        
        const systemPrompt = `You are an intelligent sales assistant for a premium water delivery service in UAE. 

INTENT UNDERSTANDING:
Instead of showing menu options, understand customer purpose through conversation.
Ask qualifying questions to determine their needs before recommending products.

CONVERSATION APPROACH:
1. Understand why they contacted you (new setup, existing customer needs, equipment, etc.)
2. Ask about their usage patterns, location, current situation
3. Recommend appropriate products based on their specific needs
4. Be conversational and helpful, not pushy

FLEXIBLE ORDER HANDLING:
Accept natural language for orders. When customers show intent to buy, guide them through:
1. Product confirmation
2. Address collection (prioritize location attachment)
3. Order confirmation

CONTEXT:
${KNOWLEDGE_BASE}

${context}

CONVERSATION GUIDELINES:
1. Focus on understanding customer intent first
2. Ask qualifying questions about usage, location, current supplier
3. Recommend based on actual needs, not just features
4. Be conversational and consultative
5. Handle objections with value propositions
6. Guide toward appropriate products naturally

Current conversation: ${JSON.stringify(conversationHistory)}`;

        const messages = [
            { role: 'system', content: systemPrompt },
            ...conversationHistory,
            { role: 'user', content: userMessage }
        ];

        const response = await axios.post(OPENAI_API_URL, {
            model: 'gpt-4o-mini',
            messages: messages,
            max_tokens: 500,
            temperature: 0.7,
            presence_penalty: 0.6,
            frequency_penalty: 0.3
        }, {
            headers: {
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const gptResponse = response.data.choices[0].message.content;
        
        // Update conversation history
        session.conversationHistory.push(
            { role: 'user', content: userMessage },
            { role: 'assistant', content: gptResponse }
        );

        // Extract sales intelligence
        extractSalesIntelligence(gptResponse, session);

        return gptResponse;

    } catch (error) {
        console.error('GPT API Error:', error.response?.data || error.message);
        return getFallbackResponse(userMessage, session);
    }
}

// Extract sales intelligence and update session
function extractSalesIntelligence(gptResponse, session) {
    const lowerResponse = gptResponse.toLowerCase();
    
    if (lowerResponse.includes('order') || lowerResponse.includes('place an order')) {
        session.salesStage = 'decision';
    } else if (lowerResponse.includes('recommend') || lowerResponse.includes('suggest')) {
        session.salesStage = 'consideration';
    } else if (lowerResponse.includes('interested') || lowerResponse.includes('sounds good')) {
        session.salesStage = 'interest';
    }

    // Extract consumption patterns
    if (lowerResponse.includes('how many') || lowerResponse.includes('usage') || lowerResponse.includes('consume')) {
        session.salesStage = 'qualification';
    }

    Object.keys(PRODUCTS).forEach(productKey => {
        const product = PRODUCTS[productKey];
        if (lowerResponse.includes(product.name.toLowerCase()) || 
            product.keywords.some(keyword => lowerResponse.includes(keyword))) {
            if (!session.interests.includes(productKey)) {
                session.interests.push(productKey);
            }
        }
    });
}

// Flexible order intent detection
function detectOrderingIntent(message) {
    const lowerMessage = message.toLowerCase().trim();
    
    const orderingKeywords = [
        'order', 'buy', 'purchase', 'get', 'want', 'need', 'i would like',
        'can i get', 'can i have', 'give me', 'send me', 'deliver',
        'i want to buy', 'i need to order', 'place order', 'get me'
    ];
    
    const productKeywords = [
        'bottle', 'water', 'coupon', 'dispenser', 'pump', 'cooler',
        'single', 'trial', 'premium', 'table', 'hand', '10+1', '100+40',
        '140', 'package', 'gallon'
    ];
    
    const hasOrderIntent = orderingKeywords.some(keyword => lowerMessage.includes(keyword));
    const hasProductReference = productKeywords.some(keyword => lowerMessage.includes(keyword));
    
    return hasOrderIntent && hasProductReference;
}

// Enhanced fallback response with intent understanding
function getFallbackResponse(message, session) {
    const lowerMessage = message.toLowerCase().trim();
    
    // Handle greetings with intent understanding instead of menu
    const greetings = ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening', 'salaam', 'assalam', 'start'];
    if (greetings.some(greeting => lowerMessage.includes(greeting)) || lowerMessage === 'hi' || lowerMessage === 'hello') {
        return understandCustomerIntent(message, session);
    }
    
    // Order intent detection
    if (detectOrderingIntent(message)) {
        return `I'd be happy to help you place an order!

To recommend the best option, could you tell me:
- Is this for home or office use?
- How many people typically drink the water?
- Are you looking for equipment like dispensers too?

Based on your needs, I can suggest anything from single bottles (AED 7) to bulk packages (up to 140 bottles) with significant savings.`;
    }
    
    // Pricing questions with consultation approach
    if (lowerMessage.includes('price') || lowerMessage.includes('cost') || lowerMessage.includes('how much')) {
        return `Our pricing is designed to offer great value:

SINGLE BOTTLE: AED 7 + AED 15 deposit
VALUE PACKAGES: 
- 10+1 bottles: AED 70 (save on deposits)
- 100+40 bottles: AED 700 (best savings)

EQUIPMENT:
- Hand Pump: AED 15
- Table Dispenser: AED 25
- Premium Cooler: AED 300

To give you the best recommendation, what's your typical water usage? Are you setting up for a household or office?`;
    }
    
    // Default intent discovery
    return `I'm here to help you with premium water delivery in Dubai, Sharjah, and Ajman.

What brings you here today? Are you:
- Setting up water service for a new home or office?
- Looking to switch from your current supplier?
- Need water equipment like dispensers or coolers?
- Want to know about regular delivery options?

Just let me know what you're looking for and I'll help you find the perfect solution!`;
}

// Helper function to detect mobile numbers
function isMobileNumber(text) {
    const mobileRegex = /^(\+?\d{1,4})?[0-9]{8,15}$/;
    return mobileRegex.test(text.trim()) && text.length < 20;
}

// Build context for GPT based on session data
async function buildContextForGPT(session, userPhone) {
    let context = '';
    
    if (session.customerInfo && !session.customerInfo.includes('NOT FOUND')) {
        context += `EXISTING CUSTOMER INFO:\n${session.customerInfo}\n\n`;
    }
    
    if (Object.values(session.qualification).some(v => v !== null)) {
        context += `CUSTOMER QUALIFICATION:\n`;
        Object.entries(session.qualification).forEach(([key, value]) => {
            if (value) context += `${key}: ${value}\n`;
        });
        context += '\n';
    }
    
    if (session.interests.length > 0) {
        context += `CUSTOMER INTERESTS:\n`;
        session.interests.forEach(productKey => {
            const product = PRODUCTS[productKey];
            if (product) context += `- ${product.name}: ${product.description}\n`;
        });
        context += '\n';
    }
    
    context += `SALES STAGE: ${session.salesStage}\n`;
    context += `CUSTOMER TYPE: ${session.isExistingCustomer ? 'Existing' : 'New'}\n`;
    
    return context;
}

// Enhanced message handling with intent understanding
async function handleIncomingMessage(message, phoneNumberId) {
    const from = message.from;
    const messageBody = message.text?.body;
    
    if (messageBody || message.location) {
        console.log(`Processing message from ${from}`);
        
        // Get or create user session
        if (!userSessions.has(from)) {
            userSessions.set(from, createUserSession());
        }
        
        const session = userSessions.get(from);
        session.lastActivity = Date.now();
        
        let response;
        
        // Handle location messages
        if (message.location && (session.state === 'collecting_address' || session.state === 'new_customer_setup')) {
            console.log('Location message received');
            response = await processLocationMessage(message, session, from);
        }
        // Handle customer setup states
        else if (session.state === 'new_customer_setup' && messageBody) {
            if (messageBody.toLowerCase().includes('attach') || messageBody.toLowerCase().includes('location')) {
                response = await requestLocationWithInstructions(session, from);
            } else {
                response = await processManualAddress(messageBody, session, from);
            }
        }
        else if (session.state === 'collecting_customer_name') {
            response = await handleCustomerNameCollection(messageBody, session, from);
        }
        else if (session.state === 'collecting_address') {
            if (isMobileNumber(messageBody)) {
                response = "I'm waiting for your address. Please attach your location or type your full address.";
            } else {
                response = await processManualAddress(messageBody, session, from);
            }
        }
        // Priority existing states
        else if (session.state === 'confirming_order') {
            response = await handleOrderConfirmation(messageBody, session, from);
        }
        // Check for customer identification by mobile number
        else if (messageBody && !session.customerInfo && isMobileNumber(messageBody)) {
            const identificationResult = await identifyCustomer(messageBody, session, from);
            if (identificationResult) {
                response = identificationResult;
            }
        }
        // Handle ordering intent
        else if (messageBody && detectOrderingIntent(messageBody)) {
            response = await handleFlexibleOrderCommand(messageBody, session, from);
        }
        // Use intent understanding or GPT
        else if (messageBody) {
            // Check if it's a greeting and no customer info yet
            const greetings = ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening', 'salaam', 'assalam', 'start'];
            const isGreeting = greetings.some(greeting => messageBody.toLowerCase().includes(greeting));
            
            if (isGreeting && !session.customerInfo) {
                response = await understandCustomerIntent(messageBody, session);
            } else {
                const context = await buildContextForGPT(session, from);
                response = await getGPTResponse(messageBody, session, context);
            }
        }
        
        if (response) {
            console.log('Sending response:', response.substring(0, 100) + '...');
            await sendMessage(from, response, phoneNumberId);
        }
    }
}

// Enhanced order command handling
async function handleFlexibleOrderCommand(message, session, userPhone) {
    const lowerMessage = message.toLowerCase().trim();
    console.log(`Processing flexible order for: "${message}"`);
    
    // Find matching product
    let selectedProduct = null;
    let productKey = null;
    
    for (const [key, product] of Object.entries(PRODUCTS)) {
        const productName = product.name.toLowerCase();
        const keyWords = product.keywords.map(k => k.toLowerCase());
        
        if (lowerMessage.includes(productName) || keyWords.some(keyword => lowerMessage.includes(keyword))) {
            selectedProduct = product;
            productKey = key;
            console.log(`Found product match: ${product.name}`);
            break;
        }
    }
    
    if (!selectedProduct) {
        return `I understand you'd like to place an order! 

To help you choose the right product, could you tell me:
- Are you looking for water bottles, dispensers, or a complete package?
- Is this for home or office use?
- How many people typically drink the water?

Based on your needs, I can recommend from single bottles to bulk packages with significant savings.`;
    }
    
    // Start order process
    session.orderInProgress = {
        product: selectedProduct,
        productKey: productKey,
        quantity: 1,
        customerPhone: userPhone,
        customerInfo: session.customerInfo
    };
    
    // Check if we need address
    let hasValidAddress = false;
    if (session.customerLocation && (session.customerLocation.address || session.customerLocation.coordinates_saved)) {
        hasValidAddress = true;
        session.orderInProgress.address = session.customerLocation.address || 'Coordinates on file';
    }
    
    if (!hasValidAddress) {
        return await requestLocationWithInstructions(session, userPhone);
    } else {
        session.state = 'confirming_order';
        return await generateOrderConfirmation(session.orderInProgress);
    }
}

// Order confirmation handling
async function handleOrderConfirmation(message, session, userPhone) {
    const lowerMessage = message.toLowerCase().trim();
    
    if (lowerMessage.includes('yes') || lowerMessage.includes('confirm') || lowerMessage.includes('ok') || lowerMessage === 'y') {
        return await processOrder(session, userPhone);
    } else if (lowerMessage.includes('no') || lowerMessage.includes('cancel') || lowerMessage === 'n') {
        session.state = 'active';
        session.orderInProgress = null;
        return `Order cancelled. No problem! Let me know if you'd like to order something else or have any questions.`;
    } else {
        return `Please confirm your order by replying:
- "YES" or "CONFIRM" to proceed
- "NO" or "CANCEL" to cancel

Or ask any questions about the order details.`;
    }
}

// Generate order confirmation
async function generateOrderConfirmation(orderInfo) {
    const total = orderInfo.product.price + orderInfo.product.deposit;
    
    return `ORDER CONFIRMATION

Product: ${orderInfo.product.name}
Description: ${orderInfo.product.description}
Price: AED ${orderInfo.product.price}
${orderInfo.product.deposit > 0 ? `Deposit: AED ${orderInfo.product.deposit} (refundable)` : ''}
TOTAL: AED ${total}

Delivery Address: ${orderInfo.address}
Payment: Cash/Card on delivery

Please reply "YES" to confirm or "NO" to cancel.`;
}

// Complete order processing
async function processOrder(session, userPhone) {
    try {
        const orderInfo = session.orderInProgress;
        if (!orderInfo) return 'No order found. Please try again.';
        
        const customerResult = await ensureCustomerExists(orderInfo);
        if (!customerResult.success) {
            return `ORDER PROCESSING ERROR\n${customerResult.message}\n\nPlease try again.`;
        }
        
        const erpOrder = await createERPNextOrder(orderInfo, customerResult.customerName);
        
        if (erpOrder.success) {
            session.state = 'active';
            session.orderInProgress = null;
            session.salesStage = 'completed';
            
            return `ORDER CONFIRMED SUCCESSFULLY!

Order Number: ${erpOrder.orderName}
Product: ${orderInfo.product.name}
Total Amount: AED ${orderInfo.product.price + orderInfo.product.deposit}

Our delivery team will contact you within 2 hours to schedule delivery.
Payment: Cash/Card on delivery

Thank you for choosing our premium water service!`;
        } else {
            return handleOrderError(erpOrder.error, erpOrder.errorType);
        }
        
    } catch (error) {
        console.error('Error processing order:', error);
        return 'Technical issue occurred. Please try again or contact support.';
    }
}

// Ensure customer exists in ERPNext with coordinates
async function ensureCustomerExists(orderInfo) {
    try {
        const searchUrl = `${ERPNEXT_URL}/api/resource/Customer`;
        const searchResponse = await axios.get(searchUrl, {
            headers: {
                'Authorization': `token ${ERPNEXT_API_KEY}:${ERPNEXT_API_SECRET}`,
                'Content-Type': 'application/json'
            },
            params: {
                filters: JSON.stringify([['mobile_no', '=', orderInfo.customerPhone]]),
                fields: JSON.stringify(['name', 'customer_name', 'mobile_no'])
            }
        });
        
        if (searchResponse.data.data && searchResponse.data.data.length > 0) {
            return {
                success: true,
                customerName: searchResponse.data.data[0].name,
                message: 'Customer found'
            };
        } else {
            return await createERPNextCustomer(orderInfo);
        }
        
    } catch (error) {
        console.error('Error checking customer existence:', error.response?.data || error.message);
        return {
            success: false,
            message: 'Unable to verify customer information.'
        };
    }
}

// Create new customer in ERPNext with coordinates
async function createERPNextCustomer(orderInfo) {
    try {
        const customerData = {
            doctype: 'Customer',
            customer_name: `Customer ${orderInfo.customerPhone}`,
            mobile_no: orderInfo.customerPhone,
            customer_type: 'Individual',
            customer_group: 'Individual',
            territory: ''
        };
        
        // Add coordinates if available
        if (orderInfo.customerLocation) {
            if (orderInfo.customerLocation.latitude) {
                customerData.custom_latitude = orderInfo.customerLocation.latitude;
            }
            if (orderInfo.customerLocation.longitude) {
                customerData.custom_longitude = orderInfo.customerLocation.longitude;
            }
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
        
        console.log('Customer created with coordinates:', response.data.data.name);
        
        // Create address if provided
        if (orderInfo.address) {
            await createCustomerAddress(response.data.data.name, orderInfo);
        }
        
        return {
            success: true,
            customerName: response.data.data.name,
            message: 'New customer created successfully'
        };
        
    } catch (error) {
        console.error('Error creating customer:', error.response?.data || error.message);
        return {
            success: false,
            message: 'Unable to create customer profile.'
        };
    }
}

// Create customer address in ERPNext
async function createCustomerAddress(customerName, orderInfo) {
    try {
        const addressData = {
            doctype: 'Address',
            address_title: 'Delivery Address',
            address_line1: orderInfo.address,
            city: 'UAE',
            country: 'United Arab Emirates',
            phone: orderInfo.customerPhone,
            links: [{
                link_doctype: 'Customer',
                link_name: customerName
            }]
        };
        
        await axios.post(
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
        
    } catch (error) {
        console.error('Error creating address:', error.response?.data || error.message);
    }
}

// Create order in ERPNext
async function createERPNextOrder(orderInfo, customerName) {
    try {
        const orderData = {
            doctype: 'Sales Order',
            customer: customerName,
            order_type: 'Sales',
            delivery_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            items: [{
                item_code: orderInfo.product.item_code,
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
        
        if (orderInfo.product.deposit > 0) {
            orderData.items.push({
                item_code: 'Bottle Deposit',
                item_name: 'Bottle Deposit',
                description: 'Refundable bottle deposit',
                qty: orderInfo.quantity,
                rate: orderInfo.product.deposit,
                amount: orderInfo.product.deposit * orderInfo.quantity
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
        console.error('ERPNext order creation failed:', error.response?.data || error.message);
        return {
            success: false,
            error: 'Order creation failed',
            errorType: 'general'
        };
    }
}

// Handle order errors
function handleOrderError(error, errorType) {
    return `ORDER PROCESSING ISSUE

Technical issue encountered. Our team has been notified.

Please try again in a few minutes or contact support directly.`;
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

// Health check endpoint
app.get('/health', (req, res) => {
    const healthData = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        memory: process.memoryUsage(),
        environment: process.env.NODE_ENV || 'development',
        version: '5.0.0-Intent-Understanding-Location',
        activeSessions: userSessions.size,
        features: {
            gptIntegration: !!OPENAI_API_KEY,
            erpnextIntegration: !!(ERPNEXT_URL && ERPNEXT_API_KEY),
            intentUnderstanding: true,
            locationAttachment: true,
            coordinateStorage: true,
            addressSaving: true
        }
    };
    
    res.status(200).json(healthData);
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

// Test endpoints
app.post('/test-location-attachment', async (req, res) => {
    try {
        const { latitude = 25.2048, longitude = 55.2708, phone = '+971501234567' } = req.body;
        
        const testSession = createUserSession();
        testSession.state = 'collecting_address';
        
        const mockLocationMessage = {
            location: { latitude, longitude },
            from: phone
        };
        
        const result = await processLocationMessage(mockLocationMessage, testSession, phone);
        
        res.json({
            status: 'success',
            input: { latitude, longitude, phone },
            result: result,
            sessionState: testSession.state,
            customerLocation: testSession.customerLocation,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        res.status(500).json({
            status: 'error',
            error: error.message
        });
    }
});

// Homepage
app.get('/', (req, res) => {
    const statusHtml = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Intent Understanding WhatsApp Bot</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
            .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .status { padding: 20px; background: #e8f5e8; border-radius: 8px; margin: 20px 0; }
            .endpoint { margin: 10px 0; padding: 15px; background: #f8f8f8; border-radius: 6px; border-left: 4px solid #007bff; }
            .active { color: #28a745; font-weight: bold; }
            .feature { background: #e3f2fd; padding: 15px; margin: 10px 0; border-radius: 6px; }
            h1 { color: #333; text-align: center; }
            h2 { color: #007bff; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Intent Understanding WhatsApp Bot v5.0</h1>
            <div class="status">
                <h2>Status: <span class="active">INTENT UNDERSTANDING + LOCATION ATTACHMENT</span></h2>
                <p><strong>Version:</strong> 5.0.0 (Conversational Intent Recognition)</p>
                <p><strong>Active Sessions:</strong> ${userSessions.size}</p>
                <p><strong>Features:</strong> Intent Understanding, Location Attachment, Coordinate Storage</p>
            </div>
            
            <div class="feature">
                <h3>NEW INTENT UNDERSTANDING:</h3>
                <ul>
                    <li>No more menu options - understands customer purpose naturally</li>
                    <li>Asks qualifying questions to determine needs</li>
                    <li>Recommends products based on actual requirements</li>
                    <li>Conversational and consultative approach</li>
                </ul>
            </div>

            <div class="feature">
                <h3>ENHANCED LOCATION FEATURES:</h3>
                <ul>
                    <li>Clear attachment instructions for WhatsApp location sharing</li>
                    <li>Extracts longitude/latitude from attached locations</li>
                    <li>Saves coordinates to custom_longitude, custom_latitude fields</li>
                    <li>Manual address typing with ERPNext profile saving</li>
                    <li>Improved delivery area validation</li>
                </ul>
            </div>
            
            <h3>CONVERSATION EXAMPLES:</h3>
            <div class="endpoint">"Hi" ? "What brings you here today? Looking for water bottles, dispensers...?"</div>
            <div class="endpoint">"I need water" ? "Is this for home or office? How many people?"</div>
            <div class="endpoint">Location attachment ? Coordinates saved to customer profile</div>
            <div class="endpoint">Manual address ? Saved to ERPNext customer address</div>
            
            <h3>TEST ENDPOINTS:</h3>
            <div class="endpoint"><strong>/test-location-attachment</strong> - Test location coordinate extraction</div>
            <div class="endpoint"><strong>/analytics</strong> - Session analytics</div>
        </div>
    </body>
    </html>
    `;
    res.send(statusHtml);
});

app.listen(PORT, () => {
    console.log(`?? Fast Order WhatsApp Bot v5.0 running on port ${PORT}`);
    console.log('? Fast ordering + location attachment + coordinate storage');
    console.log(`?? URL: http://localhost:${PORT}`);
    
    if (!OPENAI_API_KEY) {
        console.warn('??  OPENAI_API_KEY not set');
    }
    
    if (!ERPNEXT_URL) {
        console.warn('??  ERPNEXT_URL not set');
    }
    
    startKeepAlive();
});