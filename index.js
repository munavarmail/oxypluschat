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

// Welcome menu with flexible ordering
const WELCOME_MENU = `WELCOME TO PREMIUM WATER DELIVERY SERVICE!

Choose what you'd like to do:

PLACE ORDER
Just tell me what you want naturally:
• "I want single bottle"
• "Give me coupon book"  
• "I need premium cooler"
• "Can I get water delivery"
• Or any way that feels natural!

VIEW PRICING
Type: "pricing" or "menu"

DELIVERY INFO
Type: "delivery" or "schedule"

PAYMENT OPTIONS
Type: "payment methods"

CUSTOMER SUPPORT
Type: "support" or "help"

RAISE COMPLAINT
Type: "complaint" or "issue"

CHECK ACCOUNT
Send your mobile number

SPECIAL OFFERS
Type: "offers" or "deals"

COMPANY INFO
Type: "about us"

Just tell me what you need - I understand natural language!`;

// Product catalog with enhanced descriptions
const PRODUCTS = {
    'single_bottle': { 
        name: 'Single Bottle', 
        price: 7, 
        deposit: 15, 
        item_code: '5 Gallon Filled',
        description: '5-gallon water bottle made from 100% virgin material with low sodium and pH-balanced water',
        keywords: ['single', 'one bottle', 'individual', 'trial', '1 bottle'],
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

FLEXIBLE ORDERING:
Accept natural language ordering - customers can say "I want...", "Give me...", "I need...", etc.

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
            urgency: null
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

// Enhanced customer identification with better flow
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

CUSTOMER VERIFIED

What would you like to order today?
• Type "pricing" for our complete menu
• Say "I want [product]" for direct ordering
• Ask "delivery options" for scheduling info

Or just tell me naturally what you need!`;
        } else {
            session.state = 'new_customer_setup';
            session.isExistingCustomer = false;
            return customerInfo; // This contains the new customer setup message
        }
    }
    
    return null; // Not a mobile number
}

// Enhanced location collection with WhatsApp location sharing
async function handleLocationCollection(message, session, userPhone) {
    const lowerMessage = message.toLowerCase().trim();
    
    if (lowerMessage.includes('share location') || lowerMessage.includes('send location')) {
        session.state = 'waiting_for_location';
        return `LOCATION SHARING INSTRUCTIONS

To share your location via WhatsApp:

1. Tap the attachment icon (bottom left)
2. Select Location
3. Choose "Send your current location" or "Send a specific location"
4. Tap Send

This helps us:
• Find you quickly for delivery
• Validate you're in our delivery area (Dubai, Sharjah, Ajman)
• Provide accurate delivery time estimates

Alternatively, you can still type your address manually.`;
    
    } else if (lowerMessage.includes('type address') || lowerMessage.includes('manual')) {
        session.state = 'collecting_address_manual';
        return `MANUAL ADDRESS ENTRY

Please provide your complete delivery address:

Required Information:
• Building/Villa name or number
• Street name
• Area/District
• City (Dubai/Sharjah/Ajman)

Example:
"Al Noor Building, Apartment 304
Sheikh Zayed Road
Business Bay, Dubai"

Optional but helpful:
• Landmark nearby
• Special delivery instructions
• Gate/entrance details

Type your complete address:`;
    
    } else {
        // Assume they're typing address directly
        return await processManualAddress(message, session, userPhone);
    }
}

// Process location message (coordinates from WhatsApp)
async function processLocationMessage(message, session, userPhone) {
    if (message.location) {
        const { latitude, longitude } = message.location;
        console.log(`Location received: ${latitude}, ${longitude}`);
        
        // Validate location is in service area
        const locationValidation = await validateDeliveryLocation(latitude, longitude);
        
        if (locationValidation.inServiceArea) {
            session.customerLocation = {
                latitude: latitude,
                longitude: longitude,
                address: locationValidation.formattedAddress,
                area: locationValidation.area,
                city: locationValidation.city
            };
            session.locationShared = true;
            
            if (session.state === 'new_customer_setup' || session.state === 'waiting_for_location') {
                session.state = 'collecting_customer_name';
                
                return `LOCATION CONFIRMED

Delivery Address:
${locationValidation.formattedAddress}

Area: ${locationValidation.area}, ${locationValidation.city}
Estimated delivery: ${locationValidation.estimatedDelivery}

${locationValidation.inServiceArea ? 'Delivery available!' : 'Outside delivery area'}

Great! Now I just need your name for delivery.

What name should I use for your orders?`;
            } else {
                session.state = 'location_confirmed';
                
                return `LOCATION CONFIRMED

Delivery Address:
${locationValidation.formattedAddress}

Area: ${locationValidation.area}, ${locationValidation.city}
Estimated delivery: ${locationValidation.estimatedDelivery}

Perfect! What would you like to order today?`;
            }
        } else {
            return `LOCATION OUTSIDE DELIVERY AREA

Your location: ${locationValidation.formattedAddress}

Sorry, we currently only deliver to:
Dubai
Sharjah  
Ajman
(Excluding freezones)

Options:
1. Share a different delivery location within our service area
2. Contact us for special delivery arrangements
3. Check if we serve your specific area

Would you like to try a different address?`;
        }
    }
    
    return "I didn't receive your location. Please try sharing your location again or type your address manually.";
}

// Validate if location is in delivery area
async function validateDeliveryLocation(latitude, longitude) {
    try {
        // Define delivery areas with approximate boundaries
        const deliveryAreas = {
            dubai: { lat: [25.0, 25.4], lon: [55.0, 55.5] },
            sharjah: { lat: [25.2, 25.4], lon: [55.3, 55.6] },
            ajman: { lat: [25.3, 25.5], lon: [55.4, 55.6] }
        };
        
        let inServiceArea = false;
        let city = 'Unknown';
        let area = 'Unknown';
        
        // Check if coordinates fall within delivery areas
        Object.entries(deliveryAreas).forEach(([cityName, bounds]) => {
            if (latitude >= bounds.lat[0] && latitude <= bounds.lat[1] &&
                longitude >= bounds.lon[0] && longitude <= bounds.lon[1]) {
                inServiceArea = true;
                city = cityName.charAt(0).toUpperCase() + cityName.slice(1);
                
                // Determine approximate area based on coordinates
                if (cityName === 'dubai') {
                    if (latitude > 25.25) area = 'Northern Dubai';
                    else if (longitude > 55.25) area = 'Dubai Marina / JBR';
                    else area = 'Central Dubai';
                } else if (cityName === 'sharjah') {
                    area = 'Sharjah City';
                } else if (cityName === 'ajman') {
                    area = 'Ajman City';
                }
            }
        });
        
        // In production, you would call a geocoding service here
        const formattedAddress = `Coordinates: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
        
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

// Process manually typed address
async function processManualAddress(address, session, userPhone) {
    console.log(`Processing manual address: ${address}`);
    
    const lowerAddress = address.toLowerCase();
    const validCities = ['dubai', 'sharjah', 'ajman'];
    const foundCity = validCities.find(city => lowerAddress.includes(city));
    
    if (!foundCity) {
        return `ADDRESS VERIFICATION NEEDED

I noticed you didn't specify the city. We deliver to:
Dubai
Sharjah  
Ajman

Please include your city in the address:

Example:
"Al Noor Building, Apartment 304
Sheikh Zayed Road
Business Bay, Dubai"

Please provide your complete address with city:`;
    }
    
    // Validate address format
    if (address.length < 10) {
        return `ADDRESS TOO SHORT

Please provide a more detailed address including:
• Building/Villa name or number
• Street name  
• Area/District
• City

Your current input: "${address}"

Please provide more details:`;
    }
    
    // Address looks good
    session.customerLocation = {
        address: address,
        city: foundCity.charAt(0).toUpperCase() + foundCity.slice(1),
        type: 'manual'
    };
    
    if (session.state === 'new_customer_setup' || session.state === 'collecting_address_manual') {
        session.state = 'collecting_customer_name';
        return `ADDRESS CONFIRMED

Delivery Address:
${address}

Great! Now I just need your name for delivery records.

What name should I use for your orders?
(This helps our delivery team identify you)`;
    } else {
        session.state = 'address_confirmed';
        return `ADDRESS UPDATED

New Delivery Address:
${address}

Perfect! What would you like to order today?`;
    }
}

// Handle customer name collection
async function handleCustomerNameCollection(message, session, userPhone) {
    const customerName = message.trim();
    
    if (customerName.length < 2) {
        return `Please provide a valid name for delivery purposes:`;
    }
    
    session.customerInfo = {
        name: customerName,
        phone: userPhone,
        location: session.customerLocation
    };
    
    session.state = 'customer_profile_complete';
    
    return `CUSTOMER PROFILE COMPLETE

Name: ${customerName}
Phone: ${userPhone}
Address: ${session.customerLocation.address || 'Location shared'}

Your profile is now set up for faster future orders!

READY TO ORDER?

Our popular products:
• Single Bottle - AED 7 + AED 15 deposit
• 10+1 Coupon Book - AED 70 (best for regular use)
• Premium Cooler - AED 300 (hot & cold water)

Just say what you'd like:
"I want single bottle" or "Give me coupon book"

What can I get started for you?`;
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
                fields: JSON.stringify(['name', 'customer_name', 'mobile_no', 'creation', 'modified'])
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
            
            let responseText = `EXISTING CUSTOMER FOUND

Name: ${customer.customer_name}
Mobile: ${customer.mobile_no}
Customer since: ${formatDate(customer.creation)}

${addressInfo}

${orderHistory}

Welcome back! Ready to place another order?`;
            
            return responseText;
            
        } else {
            console.log(`New customer: ${mobileNumber}`);
            return `NEW CUSTOMER DETECTED

Mobile: ${mobileNumber}

I'll help you set up your customer profile for faster future orders.

To get started, I need:
1. Your delivery location
2. Your name

LOCATION OPTIONS:
Share location via WhatsApp (recommended)
Type your address manually

Which would you prefer?
Reply: "share location" or "type address"`;
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
                fields: JSON.stringify(['address_title', 'address_line1', 'address_line2', 'city', 'phone', 'is_primary_address'])
            }
        });

        const addresses = response.data.data;
        
        if (addresses && addresses.length > 0) {
            let addressText = 'DELIVERY ADDRESSES:\n';
            
            addresses.forEach((address, index) => {
                addressText += `\n${index + 1}. ${address.address_title || 'Address'}${address.is_primary_address ? ' (Primary)' : ''}\n`;
                if (address.address_line1) addressText += `   ${address.address_line1}\n`;
                if (address.address_line2) addressText += `   ${address.address_line2}\n`;
                if (address.city) addressText += `   ${address.city}\n`;
            });
            
            if (addresses.length > 1) {
                addressText += `\nYou have ${addresses.length} addresses. I'll use your primary address unless you specify otherwise.`;
            }
            
            return addressText;
        } else {
            return 'ADDRESS: No address on file - I can help you add one!';
        }
        
    } catch (error) {
        console.error('Error fetching enhanced address:', error.response?.data || error.message);
        return 'ADDRESS: Unable to fetch address information';
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
            let orderText = `RECENT ORDERS:\n`;
            
            orders.forEach((order, index) => {
                orderText += `${index + 1}. ${order.name} - AED ${order.grand_total} (${order.status})\n`;
                orderText += `   Date: ${formatDate(order.transaction_date)}\n`;
            });
            
            return orderText;
        } else {
            return 'ORDERS: No previous orders found';
        }
        
    } catch (error) {
        console.error('Error fetching recent orders:', error);
        return 'ORDERS: Unable to fetch order history';
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

// GPT-4o-mini integration with flexible ordering
async function getGPTResponse(userMessage, session, context = '') {
    try {
        const conversationHistory = session.conversationHistory.slice(-8);
        
        const systemPrompt = `You are an intelligent sales assistant for a premium water delivery service in UAE. 

GREETING HANDLING:
When customers greet with "hi", "hello", "hey", "good morning", etc., show them the complete welcome menu with all available options.

FLEXIBLE ORDER HANDLING:
Customers can express ordering intent in many natural ways. Accept and process ANY of these expressions:
- "I want single bottle"
- "I need water delivery" 
- "Can I get a coupon book"
- "Give me premium cooler"
- "I'd like to buy hand pump"
- "Send me dispenser"
- "Get me 10+1 package"
- "I want to purchase..."

When customers show ordering intent, guide the conversation to:
1. Identify the specific product they want
2. Collect delivery address if needed  
3. Confirm order details
4. Process the order in ERPNext

Be flexible and natural - don't force rigid command formats.

CONTEXT:
${KNOWLEDGE_BASE}

${context}

CONVERSATION GUIDELINES:
1. For greetings, show the complete welcome menu with all options
2. Be helpful, professional, and sales-oriented
3. Accept natural language for ordering
4. Recommend appropriate products based on consumption
5. Handle objections with value propositions
6. Ask qualifying questions (usage, location, current supplier)
7. Be conversational and natural
8. Show clear pricing and benefits
9. End with call to action

Current conversation: ${JSON.stringify(conversationHistory)}`;

        const messages = [
            { role: 'system', content: systemPrompt },
            ...conversationHistory,
            { role: 'user', content: userMessage }
        ];

        const response = await axios.post(OPENAI_API_URL, {
            model: 'gpt-4o-mini',
            messages: messages,
            max_tokens: 400,
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
    if (gptResponse.includes('order') || gptResponse.includes('place an order')) {
        session.salesStage = 'decision';
    } else if (gptResponse.includes('recommend') || gptResponse.includes('suggest')) {
        session.salesStage = 'consideration';
    } else if (gptResponse.includes('interested') || gptResponse.includes('sounds good')) {
        session.salesStage = 'interest';
    }

    Object.keys(PRODUCTS).forEach(productKey => {
        const product = PRODUCTS[productKey];
        if (gptResponse.toLowerCase().includes(product.name.toLowerCase()) || 
            product.keywords.some(keyword => gptResponse.toLowerCase().includes(keyword))) {
            if (!session.interests.includes(productKey)) {
                session.interests.push(productKey);
            }
        }
    });
}

// Flexible order intent detection
function detectOrderingIntent(message) {
    const lowerMessage = message.toLowerCase().trim();
    
    // Multiple ways customers can express ordering intent
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

// Enhanced fallback response system with flexible ordering
function getFallbackResponse(message, session) {
    const lowerMessage = message.toLowerCase().trim();
    
    // Handle greetings - show welcome menu
    const greetings = ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening', 'salaam', 'assalam', 'start'];
    if (greetings.some(greeting => lowerMessage.includes(greeting)) || lowerMessage === 'hi' || lowerMessage === 'hello') {
        return WELCOME_MENU;
    }
    
    // Order intent detection with flexible language
    if (lowerMessage.includes('order') || lowerMessage.includes('buy') || lowerMessage.includes('purchase') || lowerMessage.includes('want') || lowerMessage.includes('need') || lowerMessage.includes('get')) {
        return `I'd be happy to help you place an order!

Our available products:
• Single Bottle - AED 7 + AED 15 deposit
• 10+1 Coupon Book - AED 70 (better value)
• 100+40 Coupon Book - AED 700 (best value)
• Premium Cooler - AED 300
• Hand Pump - AED 15
• Table Dispenser - AED 25

Just tell me what you'd like! You can say:
• "I want single bottle"
• "Give me coupon book"
• "I need premium cooler"
• Or any way that feels natural to you

What would you like to get?`;
    }
    
    // Pricing questions
    if (lowerMessage.includes('price') || lowerMessage.includes('cost') || lowerMessage.includes('how much') || lowerMessage.includes('pricing') || lowerMessage.includes('menu')) {
        return `COMPLETE PRICING MENU

WATER BOTTLES:
• Single Bottle - AED 7 + AED 15 deposit
• Trial Bottle - AED 7 + AED 15 deposit

COUPON BOOKS (Better Value):
• 10+1 Coupon Book - AED 70 (save on deposit)
• 100+40 Coupon Book - AED 700 (BNPL available)

EQUIPMENT:
• Hand Pump - AED 15
• Table Dispenser - AED 25
• Premium Cooler - AED 300 (1-year warranty)

PACKAGES:
• 140 Bottles + Dispenser - AED 920

Just let me know what interests you! You can say "I want..." or "I need..." - whatever feels natural.

How many bottles do you use per week? I can recommend the best value option.`;
    }
    
    // Delivery questions
    if (lowerMessage.includes('deliver') || lowerMessage.includes('when') || lowerMessage.includes('schedule') || lowerMessage.includes('delivery')) {
        return `DELIVERY INFORMATION

COVERAGE AREAS:
Dubai, Sharjah, Ajman (except freezones)

DELIVERY OPTIONS:
• Same-day/next-day delivery available
• Weekly scheduled delivery setup
• FREE delivery with coupon books
• WhatsApp coordination for timing

DELIVERY CHARGES:
• FREE with coupon books
• Standard charges for individual bottles

Just tell me what you'd like to order and your location!

Which area are you located in?`;
    }

    // Payment methods
    if (lowerMessage.includes('payment') || lowerMessage.includes('pay')) {
        return `PAYMENT METHODS

We accept:
• Cash on delivery
• Bank transfer
• Card payment (notify 1 day prior)

SPECIAL PAYMENT OPTIONS:
• Buy Now Pay Later (ONLY for 100+40 Coupon Book)

PAYMENT BENEFITS:
• No payment hassle with coupon books
• Just exchange coupons for bottles
• Better prices with advance payment

Ready to place an order? Just tell me what you need!`;
    }

    // Customer support
    if (lowerMessage.includes('support') || lowerMessage.includes('help') || lowerMessage.includes('contact')) {
        return `CUSTOMER SUPPORT

I'm here to help you with:
• Product information and recommendations
• Order placement and tracking
• Delivery scheduling
• Payment assistance
• Account management

NEED HELP WITH ORDERING?
Just tell me what you want naturally:
• "I want single bottle"
• "Give me coupon book"
• "I need water delivery"

OTHER CONTACT METHODS:
• WhatsApp: You're already here!
• Phone support available during business hours

What specific help do you need today?`;
    }

    // Complaint handling
    if (lowerMessage.includes('complaint') || lowerMessage.includes('issue') || lowerMessage.includes('problem') || lowerMessage.includes('complain')) {
        return `COMPLAINT / ISSUE REPORTING

I'm sorry to hear you're experiencing an issue. I'm here to help resolve it quickly.

COMMON ISSUES WE CAN HELP WITH:
• Delivery delays or missed deliveries
• Product quality concerns
• Billing or payment issues
• Customer service problems
• Equipment malfunction

TO HELP YOU BETTER:
Please describe your issue in detail including:
• Order number (if applicable)
• Date of incident
• Specific problem details
• Your contact information

Our team takes all complaints seriously and will respond within 2 hours.

What specific issue would you like to report?`;
    }

    // Special offers
    if (lowerMessage.includes('offer') || lowerMessage.includes('deal') || lowerMessage.includes('discount') || lowerMessage.includes('promo')) {
        return `SPECIAL OFFERS & DEALS

CURRENT PROMOTIONS:
• 10+1 Coupon Book: Get 11 bottles for price of 10!
• 100+40 Coupon Book: Get 140 bottles (40 FREE!)
• Buy Now Pay Later on 100+40 package

MONEY-SAVING OPTIONS:
• Coupon books eliminate bottle deposits
• FREE delivery with coupon purchases
• Volume discounts for bulk orders
• No hidden costs - transparent pricing

BUSINESS PACKAGES:
Special rates for offices and commercial customers

FIRST-TIME CUSTOMERS:
Try our Trial Bottle to experience quality

Just tell me what interests you! Say "I want..." and I'll help you order.

Which offer interests you most?`;
    }

    // Company information
    if (lowerMessage.includes('about') || lowerMessage.includes('company') || lowerMessage.includes('info')) {
        return `ABOUT OUR COMPANY

PREMIUM WATER DELIVERY SERVICE
• Based in Ajman, UAE
• 10+ years of trusted service
• Serving Dubai, Sharjah, Ajman

QUALITY COMMITMENT:
• 100% virgin material bottles
• Low sodium, pH-balanced water
• Rigorous quality testing
• Superior customer service

SERVICE EXCELLENCE:
• Reliable delivery network
• Professional delivery team
• WhatsApp-based coordination
• Flexible scheduling options

WHY CHOOSE US:
• Transparent pricing (no hidden costs)
• Equipment options available
• Flexible payment methods
• Customer-first approach

Ready to experience our premium service?
Just tell me what you'd like!`;
    }

    // Account lookup
    if (lowerMessage.includes('account') || lowerMessage.includes('profile') || lowerMessage.includes('my details')) {
        return `ACCOUNT LOOKUP

To check your account details, please send your mobile number.

WHAT YOU'LL SEE:
• Customer name and contact info
• Delivery address on file
• Order history
• Account preferences

PRIVACY NOTE:
Your information is secure and only used for service delivery.

NEW CUSTOMER?
No account yet? No problem! You can place your first order immediately.

Send your mobile number or just tell me what you'd like to order!`;
    }

    // Default response with menu
    return `Hello! I'm here to help with our premium water delivery service.

Type any of these for quick help:
• "pricing" - View all prices
• "delivery" - Delivery information
• "payment" - Payment methods
• "offers" - Special deals
• "support" - Get help
• "complaint" - Report issues
• Send mobile number - Check account

Or just tell me what you want:
• "I want single bottle"
• "Give me coupon book"
• "I need water delivery"

What can I help you with today?`;
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
    
    return context;
}

// Enhanced message handling with location support
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
        if (message.location && (session.state === 'waiting_for_location' || session.state === 'new_customer_setup')) {
            console.log('Location message received');
            response = await processLocationMessage(message, session, from);
        }
        // Handle customer identification states
        else if (session.state === 'new_customer_setup' && messageBody) {
            response = await handleLocationCollection(messageBody, session, from);
        }
        else if (session.state === 'collecting_customer_name') {
            response = await handleCustomerNameCollection(messageBody, session, from);
        }
        else if (session.state === 'collecting_address_manual') {
            response = await processManualAddress(messageBody, session, from);
        }
        // Priority existing states
        else if (session.state === 'confirming_order') {
            response = await handleOrderConfirmation(messageBody, session, from);
        }
        else if (session.state === 'collecting_address') {
            response = await handleAddressCollection(messageBody, session, from);
        }
        // Check for customer identification by mobile number
        else if (messageBody && !session.customerInfo) {
            const identificationResult = await identifyCustomer(messageBody, session, from);
            if (identificationResult) {
                response = identificationResult;
            } else if (detectOrderingIntent(messageBody)) {
                response = await handleFlexibleOrderCommand(messageBody, session, from);
            } else {
                const context = await buildContextForGPT(session, from);
                response = await getGPTResponse(messageBody, session, context);
            }
        }
        // Handle ordering intent
        else if (messageBody && detectOrderingIntent(messageBody)) {
            response = await handleFlexibleOrderCommand(messageBody, session, from);
        }
        // Default GPT conversation
        else if (messageBody) {
            const context = await buildContextForGPT(session, from);
            response = await getGPTResponse(messageBody, session, context);
        }
        
        if (response) {
            console.log('Sending response:', response.substring(0, 100) + '...');
            await sendMessage(from, response, phoneNumberId);
        }
    }
}

// Enhanced order command handling with natural language processing
async function handleFlexibleOrderCommand(message, session, userPhone) {
    const lowerMessage = message.toLowerCase().trim();
    console.log(`Processing flexible order for: "${message}"`);
    
    // Find matching product with flexible matching
    let selectedProduct = null;
    let productKey = null;
    
    // Try to match products based on natural language
    for (const [key, product] of Object.entries(PRODUCTS)) {
        const productName = product.name.toLowerCase();
        const keyWords = product.keywords.map(k => k.toLowerCase());
        
        if (
            // Direct product name mentions
            lowerMessage.includes(productName) ||
            keyWords.some(keyword => lowerMessage.includes(keyword)) ||
            
            // Flexible matching patterns
            (lowerMessage.includes('single') && lowerMessage.includes('bottle') && key === 'single_bottle') ||
            (lowerMessage.includes('trial') && key === 'trial_bottle') ||
            ((lowerMessage.includes('dispenser') || lowerMessage.includes('stand')) && !lowerMessage.includes('premium') && key === 'table_dispenser') ||
            (lowerMessage.includes('pump') && key === 'hand_pump') ||
            ((lowerMessage.includes('cooler') || lowerMessage.includes('hot') || lowerMessage.includes('cold')) && key === 'premium_cooler') ||
            
            // Coupon book flexible matching
            ((lowerMessage.includes('10') && lowerMessage.includes('1')) || 
             (lowerMessage.includes('eleven') || lowerMessage.includes('11')) && key === 'coupon_10_1') ||
            ((lowerMessage.includes('100') && lowerMessage.includes('40')) || 
             lowerMessage.includes('140') || lowerMessage.includes('bulk') && key === 'coupon_100_40') ||
            
            // Package matching
            (lowerMessage.includes('package') || lowerMessage.includes('combo') && key === 'premium_package') ||
            
            // Generic coupon reference
            (lowerMessage.includes('coupon') && !lowerMessage.includes('10') && !lowerMessage.includes('100') && key === 'coupon_10_1')
        ) {
            selectedProduct = product;
            productKey = key;
            console.log(`Found product match: ${product.name}`);
            break;
        }
    }
    
    if (!selectedProduct) {
        console.log('No specific product match found, showing options');
        return `I'd be happy to help you with an order! I understand you're interested in our products.

Here are our available options:

WATER BOTTLES:
• Single Bottle - AED 7 + AED 15 deposit
• Trial Bottle - AED 7 + AED 15 deposit

COUPON BOOKS (Better Value):
• 10+1 Coupon Book - AED 70 (11 bottles)
• 100+40 Coupon Book - AED 700 (140 bottles)

EQUIPMENT:
• Hand Pump - AED 15
• Table Dispenser - AED 25
• Premium Cooler - AED 300

PACKAGES:
• Premium Package - AED 920 (140 bottles + dispenser)

Which product interests you most? Just tell me what you'd like!`;
    }
    
    // Start order process
    session.orderInProgress = {
        product: selectedProduct,
        productKey: productKey,
        quantity: 1,
        customerPhone: userPhone,
        customerInfo: session.customerInfo
    };
    
    console.log('Order in progress created:', session.orderInProgress);
    
    // Check if we need address - prioritize session location, then customer info
    let hasValidAddress = false;
    let addressToUse = '';
    
    if (session.customerLocation && session.customerLocation.address) {
        hasValidAddress = true;
        addressToUse = session.customerLocation.address;
        session.orderInProgress.address = addressToUse;
    } else if (session.customerInfo && !session.customerInfo.includes('NEW CUSTOMER') && session.customerInfo.includes('ADDRESS:')) {
        hasValidAddress = true;
        // Extract address from customer info
        const addressMatch = session.customerInfo.match(/ADDRESS:\s*\n(.+?)(?:\n\n|\n[A-Z]|$)/s);
        if (addressMatch) {
            addressToUse = addressMatch[1].trim();
            session.orderInProgress.address = addressToUse;
        }
    }
    
    if (!hasValidAddress) {
        session.state = 'collecting_address';
        console.log('Collecting address for order');
        
        return `Perfect! I'll help you get the ${selectedProduct.name}.

PRODUCT DETAILS:
• ${selectedProduct.description}
• Price: AED ${selectedProduct.price}${selectedProduct.deposit > 0 ? ` + AED ${selectedProduct.deposit} deposit` : ''}
• Total: AED ${selectedProduct.price + selectedProduct.deposit}

To complete your order, I need your delivery address:
Please provide:
- Building/villa name or number
- Street name and area
- City (Dubai/Sharjah/Ajman)
- Any delivery instructions`;
    } else {
        session.state = 'confirming_order';
        console.log('Address available, moving to confirmation');
        return await generateOrderConfirmation(session.orderInProgress);
    }
}

// Order confirmation handling
async function handleOrderConfirmation(message, session, userPhone) {
    const lowerMessage = message.toLowerCase().trim();
    console.log(`Handling confirmation: "${lowerMessage}"`);
    
    if (lowerMessage.includes('yes') || lowerMessage.includes('confirm') || lowerMessage.includes('ok') || lowerMessage === 'y') {
        console.log('Order confirmed, processing...');
        return await processOrder(session, userPhone);
    } else if (lowerMessage.includes('no') || lowerMessage.includes('cancel') || lowerMessage === 'n') {
        console.log('Order cancelled');
        session.state = 'active';
        session.orderInProgress = null;
        return `Order cancelled. No problem!

Feel free to:
• Browse our menu: type "menu"
• Tell me what you'd like: "I want..."
• Ask any questions about our products

How else can I help you?`;
    } else {
        return `Please confirm your order:

Reply with:
• "YES" or "CONFIRM" to proceed with the order
• "NO" or "CANCEL" to cancel

Or ask me any questions about the order details.`;
    }
}

// Address collection handling  
async function handleAddressCollection(message, session, userPhone) {
    console.log('Address collected:', message);
    session.orderInProgress.address = message;
    session.state = 'confirming_order';
    return await generateOrderConfirmation(session.orderInProgress);
}

// Generate order confirmation
async function generateOrderConfirmation(orderInfo) {
    const total = orderInfo.product.price + orderInfo.product.deposit;
    
    console.log('Generating order confirmation for:', orderInfo.product.name);
    
    return `ORDER CONFIRMATION

Product: ${orderInfo.product.name}
Description: ${orderInfo.product.description}
Price: AED ${orderInfo.product.price}
${orderInfo.product.deposit > 0 ? `Deposit: AED ${orderInfo.product.deposit} (refundable)` : ''}
TOTAL: AED ${total}

Delivery Address:
${orderInfo.address || 'Using address on file'}

Payment: Cash/Card on delivery

Please reply "YES" to confirm your order or "NO" to cancel.`;
}

// Complete order processing with ERPNext integration
async function processOrder(session, userPhone) {
    try {
        console.log('Processing order...');
        const orderInfo = session.orderInProgress;
        
        if (!orderInfo) {
            console.log('No order in progress');
            return 'No order found. Please tell me what you\'d like to order!';
        }
        
        // Ensure customer exists in ERPNext
        console.log('Ensuring customer exists...');
        const customerResult = await ensureCustomerExists(orderInfo);
        
        if (!customerResult.success) {
            console.log('Customer creation failed:', customerResult.message);
            return `ORDER PROCESSING ERROR

${customerResult.message}

Please try again or contact our support team.`;
        }
        
        console.log('Customer ready, creating order...');
        // Create order in ERPNext
        const erpOrder = await createERPNextOrder(orderInfo, customerResult.customerName);
        
        if (erpOrder.success) {
            console.log('Order created successfully:', erpOrder.orderName);
            
            // Clear order state
            session.state = 'active';
            session.orderInProgress = null;
            session.salesStage = 'completed';
            
            return `ORDER CONFIRMED SUCCESSFULLY!

Order Number: ${erpOrder.orderName}
Product: ${orderInfo.product.name}
Total Amount: AED ${orderInfo.product.price + orderInfo.product.deposit}

NEXT STEPS:
• Our delivery team will contact you within 2 hours
• We'll schedule delivery to your address
• Payment: Cash/Card on delivery

DELIVERY AREAS:
Dubai, Sharjah, Ajman

Need to modify your order? Just message us!

Thank you for choosing our premium water service!`;
        } else {
            console.log('Order creation failed:', erpOrder.error);
            return handleOrderError(erpOrder.error, erpOrder.errorType);
        }
        
    } catch (error) {
        console.error('Error processing order:', error);
        return `ORDER PROCESSING ERROR

Technical issue occurred while processing your order.
Our team has been notified.

Please try again in a few minutes or contact support directly.
Order details have been saved.`;
    }
}

// Ensure customer exists in ERPNext, create if necessary
async function ensureCustomerExists(orderInfo) {
    try {
        console.log('Checking if customer exists...');
        
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
            console.log('Customer exists:', searchResponse.data.data[0].name);
            return {
                success: true,
                customerName: searchResponse.data.data[0].name,
                message: 'Customer found'
            };
        } else {
            console.log('Customer not found, creating new...');
            return await createERPNextCustomer(orderInfo);
        }
        
    } catch (error) {
        console.error('Error checking customer existence:', error.response?.data || error.message);
        return {
            success: false,
            message: 'Unable to verify customer information. Please contact support.'
        };
    }
}

// Create new customer in ERPNext
async function createERPNextCustomer(orderInfo) {
    try {
        console.log('Creating new customer...');
        
        const customerData = {
            doctype: 'Customer',
            customer_name: `Customer ${orderInfo.customerPhone}`,
            mobile_no: orderInfo.customerPhone,
            customer_type: 'Individual',
            customer_group: 'Individual',
            territory: 'UAE'
        };
        
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
            message: 'Unable to create customer profile. Please contact support.'
        };
    }
}

// Create customer address in ERPNext
async function createCustomerAddress(customerName, orderInfo) {
    try {
        console.log('Creating customer address...');
        
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
        // Don't fail the order for address creation issues
    }
}

// Create order in ERPNext
async function createERPNextOrder(orderInfo, customerName) {
    try {
        console.log('Creating ERPNext order...');
        
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
        
        // Add deposit as separate line item if applicable
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
        
        console.log('Sending order data to ERPNext...');
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
        
        console.log('ERPNext order created:', response.data.data.name);
        
        return {
            success: true,
            orderName: response.data.data.name,
            data: response.data.data
        };
        
    } catch (error) {
        console.error('ERPNext order creation failed:', error.response?.data || error.message);
        
        let errorMessage = 'Order creation failed';
        let errorType = 'general';
        
        if (error.response?.data) {
            const errorData = error.response.data;
            
            if (errorData.message) {
                errorMessage = errorData.message;
            }
            
            if (errorData.exc_type) {
                errorType = errorData.exc_type;
            }
            
            // Parse server messages if available
            if (errorData.server_messages) {
                try {
                    const serverMessages = JSON.parse(errorData.server_messages);
                    if (Array.isArray(serverMessages) && serverMessages.length > 0) {
                        const parsedMessage = JSON.parse(serverMessages[0]);
                        errorMessage = parsedMessage.message || errorMessage;
                    }
                } catch (parseError) {
                    console.error('Error parsing server messages:', parseError);
                }
            }
        }
        
        return {
            success: false,
            error: errorMessage,
            errorType: errorType
        };
    }
}

// Handle different types of order errors
function handleOrderError(error, errorType) {
    console.log('Handling order error:', error);
    
    if (typeof error === 'string') {
        if (error.includes('Customer') && error.includes('not found')) {
            return `CUSTOMER ACCOUNT ISSUE

We couldn't find your customer account. This has been resolved.
Please try placing your order again.`;
        }
        
        if (error.includes('Item') && error.includes('not found')) {
            return `PRODUCT UNAVAILABLE

The requested product is temporarily unavailable.
Please contact support or try a different product.`;
        }
        
        if (error.includes('permission') || error.includes('Permission')) {
            return `SYSTEM MAINTENANCE

Our ordering system is under maintenance.
Please try again in a few minutes.`;
        }
    }
    
    return `ORDER PROCESSING ISSUE

Technical issue encountered. Our team has been notified.

WHAT TO DO:
• Try again in a few minutes
• Contact support directly
• Your details have been saved

We'll resolve this quickly!`;
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
        version: '4.0.0-Enhanced-Customer-Location',
        activeSessions: userSessions.size,
        features: {
            gptIntegration: !!OPENAI_API_KEY,
            erpnextIntegration: !!(ERPNEXT_URL && ERPNEXT_API_KEY),
            flexibleOrdering: true,
            locationServices: true,
            customerIdentification: true,
            welcomeMenu: true
        }
    };
    
    console.log(`Health check called from ${req.ip} at ${healthData.timestamp}`);
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

// Test customer identification endpoint
app.post('/test-customer-identification', async (req, res) => {
    try {
        const { phone = '+971501234567' } = req.body;
        
        console.log('=== TESTING CUSTOMER IDENTIFICATION ===');
        
        const testSession = createUserSession();
        const result = await identifyCustomer(phone, testSession, phone);
        
        res.json({
            status: 'success',
            phone: phone,
            result: result,
            sessionState: testSession.state,
            customerInfo: testSession.customerInfo,
            isExistingCustomer: testSession.isExistingCustomer,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Test customer identification failed:', error);
        res.status(500).json({
            status: 'error',
            message: 'Test failed',
            error: error.message
        });
    }
});

// Test location validation endpoint
app.post('/test-location-validation', async (req, res) => {
    try {
        const { latitude = 25.2048, longitude = 55.2708 } = req.body; // Dubai coordinates
        
        console.log('=== TESTING LOCATION VALIDATION ===');
        
        const result = await validateDeliveryLocation(latitude, longitude);
        
        res.json({
            status: 'success',
            input: { latitude, longitude },
            result: result,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Test location validation failed:', error);
        res.status(500).json({
            status: 'error',
            message: 'Test failed',
            error: error.message
        });
    }
});

// Test complete order process
app.post('/test-complete-order', async (req, res) => {
    try {
        const { phone = '+971501234567', product = 'single_bottle', address = 'Test Address, Dubai' } = req.body;
        
        console.log('=== TESTING COMPLETE ORDER PROCESS ===');
        console.log('Phone:', phone);
        console.log('Product:', product);
        console.log('Address:', address);
        
        const testSession = createUserSession();
        testSession.orderInProgress = {
            product: PRODUCTS[product],
            productKey: product,
            quantity: 1,
            customerPhone: phone,
            address: address
        };
        
        console.log('Test Order Info:', JSON.stringify(testSession.orderInProgress, null, 2));
        
        const result = await processOrder(testSession, phone);
        
        res.json({
            status: 'success',
            message: 'Test order completed',
            orderInfo: testSession.orderInProgress,
            result: result,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Test order failed:', error);
        res.status(500).json({
            status: 'error',
            message: 'Test order failed',
            error: error.message,
            stack: error.stack
        });
    }
});

// Debug ERPNext configuration
app.get('/debug-erpnext-config', (req, res) => {
    res.json({
        status: 'debug',
        config: {
            url: ERPNEXT_URL || 'NOT SET',
            hasApiKey: !!ERPNEXT_API_KEY,
            hasApiSecret: !!ERPNEXT_API_SECRET,
            apiKeyLength: ERPNEXT_API_KEY ? ERPNEXT_API_KEY.length : 0,
            apiSecretLength: ERPNEXT_API_SECRET ? ERPNEXT_API_SECRET.length : 0
        },
        products: Object.keys(PRODUCTS),
        timestamp: new Date().toISOString()
    });
});

// Test ERPNext connection with detailed info
app.get('/test-erpnext-detailed', async (req, res) => {
    try {
        console.log('=== TESTING ERPNEXT CONNECTION ===');
        console.log('URL:', ERPNEXT_URL);
        console.log('API Key exists:', !!ERPNEXT_API_KEY);
        console.log('API Secret exists:', !!ERPNEXT_API_SECRET);
        
        // Test basic connection
        const authResponse = await axios.get(`${ERPNEXT_URL}/api/method/frappe.auth.get_logged_user`, {
            headers: {
                'Authorization': `token ${ERPNEXT_API_KEY}:${ERPNEXT_API_SECRET}`,
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });
        
        console.log('Auth Response:', authResponse.data);
        
        // Test customer access
        const customerResponse = await axios.get(`${ERPNEXT_URL}/api/resource/Customer`, {
            headers: {
                'Authorization': `token ${ERPNEXT_API_KEY}:${ERPNEXT_API_SECRET}`,
                'Content-Type': 'application/json'
            },
            params: {
                limit: 1
            },
            timeout: 10000
        });
        
        console.log('Customer Response:', customerResponse.data);
        
        res.json({ 
            status: 'success', 
            message: 'ERPNext connection working!',
            authTest: authResponse.data,
            customerTest: customerResponse.data,
            config: {
                url: ERPNEXT_URL,
                connected: true
            }
        });
    } catch (error) {
        console.error('ERPNext test failed:', error.response?.data || error.message);
        res.status(500).json({ 
            status: 'error', 
            message: 'ERPNext connection failed', 
            error: error.response?.data || error.message,
            config: {
                url: ERPNEXT_URL || 'NOT SET',
                hasCredentials: !!(ERPNEXT_API_KEY && ERPNEXT_API_SECRET)
            }
        });
    }
});

// Analytics endpoint
app.get('/analytics', (req, res) => {
    const analytics = {
        totalSessions: userSessions.size,
        salesStages: {},
        topInterests: {},
        activeOrders: 0,
        existingCustomers: 0,
        newCustomers: 0,
        locationsShared: 0
    };
    
    userSessions.forEach(session => {
        analytics.salesStages[session.salesStage] = 
            (analytics.salesStages[session.salesStage] || 0) + 1;
        
        session.interests.forEach(interest => {
            analytics.topInterests[interest] = 
                (analytics.topInterests[interest] || 0) + 1;
        });
        
        if (session.orderInProgress) {
            analytics.activeOrders++;
        }
        
        if (session.isExistingCustomer) {
            analytics.existingCustomers++;
        } else {
            analytics.newCustomers++;
        }
        
        if (session.locationShared) {
            analytics.locationsShared++;
        }
    });
    
    res.json(analytics);
});

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

// Homepage
app.get('/', (req, res) => {
    const statusHtml = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Enhanced WhatsApp Water Delivery Bot</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
            .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .status { padding: 20px; background: #e8f5e8; border-radius: 8px; margin: 20px 0; }
            .endpoint { margin: 10px 0; padding: 15px; background: #f8f8f8; border-radius: 6px; border-left: 4px solid #007bff; }
            .active { color: #28a745; font-weight: bold; }
            .inactive { color: #ffc107; }
            .feature { background: #e3f2fd; padding: 15px; margin: 10px 0; border-radius: 6px; }
            h1 { color: #333; text-align: center; }
            h2 { color: #007bff; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Enhanced WhatsApp Water Delivery Bot v4.0</h1>
            <div class="status">
                <h2>Status: <span class="active">CUSTOMER LOCATION + IDENTIFICATION</span></h2>
                <p><strong>Version:</strong> 4.0.0 (Enhanced Customer Management)</p>
                <p><strong>Active Sessions:</strong> ${userSessions.size}</p>
                <p><strong>GPT Integration:</strong> <span class="${OPENAI_API_KEY ? 'active' : 'inactive'}">${OPENAI_API_KEY ? 'ENABLED' : 'DISABLED'}</span></p>
                <p><strong>ERPNext:</strong> <span class="${ERPNEXT_URL ? 'active' : 'inactive'}">${ERPNEXT_URL ? 'ENABLED' : 'DISABLED'}</span></p>
            </div>
            
            <div class="feature">
                <h3>ENHANCED CUSTOMER FEATURES:</h3>
                <ul>
                    <li><strong>Smart Customer ID:</strong> Existing vs New customer detection</li>
                    <li><strong>WhatsApp Location:</strong> GPS coordinate sharing</li>
                    <li><strong>Address Management:</strong> Manual entry with validation</li>
                    <li><strong>Profile Setup:</strong> Guided onboarding for new customers</li>
                    <li><strong>Order History:</strong> Previous purchases display</li>
                    <li><strong>Multi-Address:</strong> Multiple delivery locations per customer</li>
                </ul>
            </div>

            <div class="feature">
                <h3>LOCATION SERVICES:</h3>
                <ul>
                    <li>WhatsApp native location sharing</li>
                    <li>Delivery area validation (Dubai, Sharjah, Ajman)</li>
                    <li>Manual address entry with city validation</li>
                    <li>Estimated delivery time calculation</li>
                </ul>
            </div>

            <div class="feature">
                <h3>CUSTOMER IDENTIFICATION:</h3>
                <ul>
                    <li>Mobile number detection</li>
                    <li>ERPNext customer lookup</li>
                    <li>Order history display</li>
                    <li>Address retrieval</li>
                    <li>New customer profile creation</li>
                </ul>
            </div>
            
            <h3>CUSTOMER FLOW EXAMPLES:</h3>
            <div class="endpoint">"+971501234567" ? Existing customer with history</div>
            <div class="endpoint">"+971509876543" ? New customer setup</div>
            <div class="endpoint">"share location" ? GPS coordinates</div>
            <div class="endpoint">"type address" ? Manual entry</div>
            
            <h3>TEST ENDPOINTS:</h3>
            <div class="endpoint"><strong>/test-customer-identification</strong> - Test customer lookup</div>
            <div class="endpoint"><strong>/test-location-validation</strong> - Test GPS validation</div>
            <div class="endpoint"><strong>/test-complete-order</strong> - End-to-end order test</div>
            <div class="endpoint"><strong>/analytics</strong> - Enhanced session analytics</div>
            <div class="endpoint"><strong>/test-erpnext-detailed</strong> - ERPNext connectivity</div>
        </div>
    </body>
    </html>
    `;
    res.send(statusHtml);
});

app.listen(PORT, () => {
    console.log(`?? Enhanced WhatsApp Water Delivery Bot v4.0 running on port ${PORT}`);
    console.log('? Customer location + identification + flexible ordering');
    console.log(`?? URL: http://localhost:${PORT}`);
    
    if (!OPENAI_API_KEY) {
        console.warn('??  OPENAI_API_KEY not set');
    }
    
    if (!ERPNEXT_URL) {
        console.warn('??  ERPNEXT_URL not set');
    }
    
    startKeepAlive();
});