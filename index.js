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

// Enhanced conversation state management
const userSessions = new Map();

// Service area coordinates (UAE major cities)
const SERVICE_AREAS = {
    dubai: { lat: 25.2048, lng: 55.2708, radius: 50 },
    sharjah: { lat: 25.3463, lng: 55.4209, radius: 30 },
    ajman: { lat: 25.4052, lng: 55.5136, radius: 25 }
};

// Welcome menu
const WELCOME_MENU = `WELCOME TO PREMIUM WATER DELIVERY SERVICE!

?? PLACE ORDER
Just say what you want:
• "bottle", "single", "one bottle"
• "coupon", "bulk", "package"  
• "cooler", "dispenser", "pump"

?? VIEW PRICING - Type: "price" or "menu"
?? DELIVERY INFO - Type: "delivery"
?? PAYMENT OPTIONS - Type: "payment"
?? CUSTOMER SUPPORT - Type: "help"
?? RAISE COMPLAINT - Type: "complaint"
?? CHECK ACCOUNT - Send your mobile number
?? SPECIAL OFFERS - Type: "offers"
?? COMPANY INFO - Type: "about"

Just tell me what you need in your own words!`;

// Enhanced product catalog with fuzzy matching
const PRODUCTS = {
    'single_bottle': { 
        name: 'Single Bottle', 
        price: 7, 
        deposit: 15, 
        item_code: '5 Gallon Filled',
        description: '5-gallon water bottle made from 100% virgin material',
        keywords: ['single', 'one', 'bottle', 'individual', 'trial', '1', 'btl', 'singl', 'bottl'],
        fuzzyKeywords: ['sngle', 'botl', 'botle', 'singel', '1btl', 'onebottle'],
        salesPoints: ['Perfect for trying our quality', 'No commitment', 'Quick delivery']
    },
    'trial_bottle': { 
        name: 'Trial Bottle', 
        price: 7, 
        deposit: 15, 
        item_code: '5 Gallon Filled',
        description: 'Trial 5-gallon water bottle - perfect for first-time customers',
        keywords: ['trial', 'test', 'first', 'sample', 'try', 'tral', 'tryl'],
        fuzzyKeywords: ['triel', 'tryal', 'tst', 'smpl'],
        salesPoints: ['Risk-free trial', 'Experience our quality']
    },
    'table_dispenser': { 
        name: 'Table Top Dispenser', 
        price: 25, 
        deposit: 0, 
        item_code: 'Table Dispenser',
        description: 'Basic table top dispenser for convenient water access',
        keywords: ['table', 'dispenser', 'basic', 'simple', 'tbl', 'disp'],
        fuzzyKeywords: ['tabl', 'dispensr', 'dispenser', 'tbldispenser'],
        salesPoints: ['No electricity needed', 'Compact design']
    },
    'hand_pump': { 
        name: 'Hand Pump', 
        price: 15, 
        deposit: 0, 
        item_code: 'Hand Pump',
        description: 'Manual hand pump for bottles - most economical option',
        keywords: ['pump', 'manual', 'hand', 'cheap', 'hnd', 'pmp'],
        fuzzyKeywords: ['pumb', 'hanpump', 'handpmp', 'manul'],
        salesPoints: ['Most affordable', 'No maintenance']
    },
    'premium_cooler': { 
        name: 'Premium Water Cooler', 
        price: 300, 
        deposit: 0, 
        item_code: 'Water Cooler',
        description: 'Premium cooler with hot/cold water, 1-year warranty',
        keywords: ['premium', 'cooler', 'hot', 'cold', 'electric', 'cool', 'clr'],
        fuzzyKeywords: ['coler', 'coolar', 'premim', 'premum'],
        salesPoints: ['Hot & cold water', '1-year warranty']
    },
    'coupon_10_1': { 
        name: '10+1 Coupon Book', 
        price: 70, 
        deposit: 0, 
        item_code: 'Coupon Book',
        description: '11 bottles (10+1 free), up to 3 bottles without deposit',
        keywords: ['10+1', '11', 'eleven', 'coupon', 'small', 'cpn', 'book'],
        fuzzyKeywords: ['10plus1', '11bottles', 'couponbook', 'smallpack'],
        salesPoints: ['Save on deposit', 'Free bottle included']
    },
    'coupon_100_40': { 
        name: '100+40 Coupon Book', 
        price: 700, 
        deposit: 0, 
        item_code: 'Coupon Book',
        description: '140 bottles total, up to 5 bottles without deposit, BNPL available',
        keywords: ['100+40', '140', 'bulk', 'large', 'bnpl', 'big', 'hundred'],
        fuzzyKeywords: ['100plus40', '140bottles', 'bulkpack', 'largpack'],
        salesPoints: ['Best value', 'Buy now pay later option']
    },
    'premium_package': { 
        name: '140 Bottles + Premium Dispenser', 
        price: 920, 
        deposit: 0, 
        item_code: 'Premium Package',
        description: '140 bottles + Premium dispenser package - complete solution',
        keywords: ['premium', 'package', 'complete', 'combo', 'pkg', 'set'],
        fuzzyKeywords: ['premiumpack', 'completeset', 'combopack'],
        salesPoints: ['Complete solution', 'Maximum convenience']
    }
};

// Enhanced user session structure
function createUserSession() {
    return {
        state: 'active',
        conversationHistory: [],
        customerInfo: null,
        interests: [],
        location: null,
        qualification: {
            consumption: null,
            location: null,
            currentSupplier: null,
            budget: null,
            urgency: null
        },
        orderInProgress: null,
        lastActivity: Date.now(),
        salesStage: 'discovery'
    };
}

// Smart product matching with fuzzy logic and spelling tolerance
function smartProductMatch(userInput) {
    const input = userInput.toLowerCase().trim();
    const words = input.split(/\s+/);
    
    let bestMatch = null;
    let highestScore = 0;
    
    for (const [productKey, product] of Object.entries(PRODUCTS)) {
        let score = 0;
        
        // Check exact matches first (highest weight)
        for (const keyword of product.keywords) {
            if (input.includes(keyword.toLowerCase())) {
                score += 10;
            }
        }
        
        // Check fuzzy matches for spelling mistakes (medium weight)
        for (const fuzzyKeyword of product.fuzzyKeywords || []) {
            if (input.includes(fuzzyKeyword.toLowerCase())) {
                score += 7;
            }
        }
        
        // Check word-by-word similarity (lower weight)
        for (const word of words) {
            for (const keyword of product.keywords) {
                if (calculateSimilarity(word, keyword.toLowerCase()) > 0.7) {
                    score += 5;
                }
            }
        }
        
        // Check product name similarity
        const nameSimilarity = calculateSimilarity(input, product.name.toLowerCase());
        if (nameSimilarity > 0.6) {
            score += Math.floor(nameSimilarity * 8);
        }
        
        // Special number patterns
        if (isNumberMatch(input, productKey)) {
            score += 15;
        }
        
        if (score > highestScore) {
            highestScore = score;
            bestMatch = { productKey, product, score };
        }
    }
    
    // Return match only if confidence is high enough
    return highestScore >= 5 ? bestMatch : null;
}

// Calculate string similarity using Levenshtein distance
function calculateSimilarity(str1, str2) {
    const len1 = str1.length;
    const len2 = str2.length;
    
    if (len1 === 0) return len2 === 0 ? 1 : 0;
    if (len2 === 0) return 0;
    
    const matrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(null));
    
    for (let i = 0; i <= len1; i++) matrix[i][0] = i;
    for (let j = 0; j <= len2; j++) matrix[0][j] = j;
    
    for (let i = 1; i <= len1; i++) {
        for (let j = 1; j <= len2; j++) {
            const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost
            );
        }
    }
    
    const maxLen = Math.max(len1, len2);
    return (maxLen - matrix[len1][len2]) / maxLen;
}

// Check for number-based matches
function isNumberMatch(input, productKey) {
    const numberMatches = {
        'single_bottle': ['1', 'one', 'single'],
        'coupon_10_1': ['10+1', '11', '10 1', 'ten plus one'],
        'coupon_100_40': ['100+40', '140', '100 40', 'hundred forty']
    };
    
    if (numberMatches[productKey]) {
        return numberMatches[productKey].some(pattern => 
            input.includes(pattern.toLowerCase())
        );
    }
    return false;
}

// Extract location coordinates from WhatsApp location message
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

// Validate if location is within service area
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
        nearestCity: findNearestCity(latitude, longitude),
        distance: null
    };
}

// Calculate distance between coordinates (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// Find nearest city to coordinates
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

// Validate manual address for service area
function validateManualAddress(address) {
    const lowerAddress = address.toLowerCase();
    
    if (lowerAddress.includes('dubai')) {
        return { isValid: true, city: 'dubai', method: 'manual_address', confidence: 'high' };
    } else if (lowerAddress.includes('sharjah')) {
        return { isValid: true, city: 'sharjah', method: 'manual_address', confidence: 'high' };
    } else if (lowerAddress.includes('ajman')) {
        return { isValid: true, city: 'ajman', method: 'manual_address', confidence: 'high' };
    } else {
        // Check for known areas/neighborhoods
        const knownAreas = {
            dubai: ['jumeirah', 'deira', 'bur dubai', 'marina', 'downtown', 'jlt', 'jbr'],
            sharjah: ['rolla', 'al nahda', 'al majaz', 'al qasba', 'king faisal'],
            ajman: ['al nuaimiya', 'al rashidiya', 'al jerf', 'al rawda', 'corniche']
        };
        
        for (const [city, areas] of Object.entries(knownAreas)) {
            if (areas.some(area => lowerAddress.includes(area))) {
                return { isValid: true, city: city, method: 'manual_address', confidence: 'medium' };
            }
        }
        
        return {
            isValid: false,
            city: null,
            method: 'manual_address',
            confidence: 'unknown',
            message: 'Please confirm if this address is in Dubai, Sharjah, or Ajman'
        };
    }
}

// Check if message looks like a manual address
function isManualAddress(message) {
    const addressIndicators = [
        'villa', 'building', 'apt', 'apartment', 'house', 'street', 'road',
        'dubai', 'sharjah', 'ajman', 'jumeirah', 'deira', 'bur dubai',
        'al', 'block', 'plot', 'tower', 'complex', 'mall', 'near'
    ];
    
    const lowerMessage = message.toLowerCase();
    const wordCount = message.trim().split(/\s+/).length;
    const hasNumbers = /\d/.test(message);
    
    const hasAddressWords = addressIndicators.some(indicator => 
        lowerMessage.includes(indicator)
    );
    
    return wordCount >= 3 && hasNumbers && hasAddressWords;
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
        console.log(`Keep-alive ping successful at ${new Date().toISOString()}`);
    } catch (error) {
        console.error(`Keep-alive ping failed at ${new Date().toISOString()}:`, error.message);
    }
}

function startKeepAlive() {
    if (!KEEP_ALIVE_URL) {
        console.log('KEEP_ALIVE_URL not configured');
        return;
    }
    
    console.log(`Starting keep-alive service - pinging every ${KEEP_ALIVE_INTERVAL / 60000} minutes`);
    setTimeout(keepAlive, 2 * 60 * 1000);
    setInterval(keepAlive, KEEP_ALIVE_INTERVAL);
}

// Enhanced GPT integration with smart order recognition
async function getGPTResponse(userMessage, session, context = '') {
    try {
        const conversationHistory = session.conversationHistory.slice(-8);
        
        const systemPrompt = `You are an intelligent sales assistant for a premium water delivery service in UAE.

SMART ORDER RECOGNITION:
- "bottle" or "btl" = single bottle
- "coupon" or "bulk" = coupon books  
- "cooler" = premium cooler
- "pump" = hand pump
- "dispenser" = table dispenser

NEW CUSTOMER REQUIREMENT:
- Must collect BOTH manual address AND GPS location
- Not options - both are mandatory for new customers
- Existing customers can proceed with saved info

GREETING HANDLING:
Show complete welcome menu for greetings.

${context}

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
        
        session.conversationHistory.push(
            { role: 'user', content: userMessage },
            { role: 'assistant', content: gptResponse }
        );

        return gptResponse;

    } catch (error) {
        console.error('GPT API Error:', error.response?.data || error.message);
        return getFallbackResponse(userMessage, session);
    }
}

// Enhanced fallback response with smart matching
function getFallbackResponse(message, session) {
    const lowerMessage = message.toLowerCase().trim();
    
    // Handle greetings
    const greetings = ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'salaam', 'start'];
    if (greetings.some(greeting => lowerMessage.includes(greeting))) {
        return WELCOME_MENU;
    }
    
    // Smart order detection
    const orderKeywords = ['want', 'need', 'order', 'buy', 'purchase', 'get'];
    if (orderKeywords.some(keyword => lowerMessage.includes(keyword))) {
        const productMatch = smartProductMatch(lowerMessage);
        
        if (productMatch) {
            return `Great choice! I found: ${productMatch.product.name}

${productMatch.product.description}
Price: AED ${productMatch.product.price}${productMatch.product.deposit > 0 ? ` + AED ${productMatch.product.deposit} deposit` : ''}

Would you like to place this order? Just say "yes"!`;
        }
    }
    
    // Try smart product matching for any input
    const productMatch = smartProductMatch(lowerMessage);
    if (productMatch && productMatch.score >= 8) {
        return `I think you're looking for: ${productMatch.product.name}

${productMatch.product.description}
Price: AED ${productMatch.product.price}${productMatch.product.deposit > 0 ? ` + AED ${productMatch.product.deposit} deposit` : ''}

Is this what you want? Say "yes" to order!`;
    }
    
    // Pricing questions
    if (lowerMessage.includes('price') || lowerMessage.includes('cost')) {
        return `?? PRICING MENU

WATER BOTTLES:
• Single Bottle - AED 7 + AED 15 deposit
• Trial Bottle - AED 7 + AED 15 deposit

COUPON BOOKS:
• 10+1 Coupon Book - AED 70
• 100+40 Coupon Book - AED 700

EQUIPMENT:
• Hand Pump - AED 15
• Table Dispenser - AED 25  
• Premium Cooler - AED 300

PACKAGES:
• 140 Bottles + Dispenser - AED 920

Just tell me what you want!`;
    }
    
    // Default response
    return `Hello! I'm here to help with our premium water delivery service.

Just say what you want: "bottle", "cooler", "coupon"
Or type "price" for pricing, "delivery" for areas.

I understand natural language and spelling mistakes!`;
}

// Health check endpoint
app.get('/health', (req, res) => {
    const healthData = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        version: '5.0.0-Final-Dual-Location-Mandatory',
        activeSessions: userSessions.size,
        features: {
            smartOrderRecognition: true,
            fuzzyMatching: true,
            dualLocationMandatory: true,
            erpNextIntegration: !!(ERPNEXT_URL && ERPNEXT_API_KEY),
            gptIntegration: !!OPENAI_API_KEY
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

// Enhanced message handling
async function handleIncomingMessage(message, phoneNumberId) {
    const from = message.from;
    const messageBody = message.text?.body;
    const location = message.location;
    
    console.log(`Processing message from ${from}:`, {
        text: messageBody,
        hasLocation: !!location,
        type: message.type
    });
    
    // Get or create user session
    if (!userSessions.has(from)) {
        userSessions.set(from, createUserSession());
    }
    
    const session = userSessions.get(from);
    session.lastActivity = Date.now();
    
    let response;
    
    // PRIORITY 1: Handle location messages
    if (location) {
        console.log('Location message detected');
        response = await handleLocationMessage(message, session, from);
    }
    // PRIORITY 2: Handle smart order recognition
    else if (messageBody) {
        const orderMatch = smartProductMatch(messageBody);
        if (orderMatch && orderMatch.score >= 8) {
            console.log('Smart order match detected:', orderMatch.product.name);
            response = await handleSmartOrder(orderMatch, session, from);
        }
        // PRIORITY 3: Handle order confirmations
        else if (session.state === 'confirming_order') {
            console.log('Handling order confirmation');
            response = await handleOrderConfirmation(messageBody, session, from);
        }
        // PRIORITY 4: Handle address collection for new customers (Step 1)
        else if (session.state === 'collecting_address_first') {
            console.log('Collecting address first (new customer)');
            response = await handleAddressFirstCollection(messageBody, session, from);
        }
        // PRIORITY 5: Handle location collection after address (Step 2)
        else if (session.state === 'collecting_location_after_address') {
            console.log('Waiting for location after address');
            response = `Please share your GPS location ?? using the attachment button.

I already have your address: ${session.orderInProgress.manualAddress}

GPS coordinates needed to complete setup for:
? Precise location verification
?? Delivery route optimization
?? Future order accuracy

Please use WhatsApp's location sharing feature.`;
        }
        // PRIORITY 6: Check for mobile number lookup
        else if (isMobileNumber(messageBody)) {
            console.log('Mobile number detected');
            response = await getCustomerByMobile(messageBody.trim());
            session.customerInfo = response;
        }
        // PRIORITY 7: Use GPT for conversation
        else {
            console.log('Using GPT for conversation');
            const context = await buildContextForGPT(session, from);
            response = await getGPTResponse(messageBody, session, context);
        }
    }
    
    console.log('Sending response:', response.substring(0, 100) + '...');
    await sendMessage(from, response, phoneNumberId);
}

// Handle smart order recognition
async function handleSmartOrder(orderMatch, session, userPhone) {
    console.log('Processing smart order:', orderMatch.product.name);
    
    // Get customer info if not available
    if (!session.customerInfo) {
        const customerInfo = await getCustomerByMobile(userPhone);
        session.customerInfo = customerInfo;
    }
    
    // Start order process
    session.orderInProgress = {
        product: orderMatch.product,
        productKey: orderMatch.productKey,
        quantity: 1,
        customerPhone: userPhone,
        customerInfo: session.customerInfo,
        matchConfidence: orderMatch.score
    };
    
    console.log('Smart order created:', session.orderInProgress);
    
    // Check if customer is new and needs both address and location
    const isNewCustomer = !session.customerInfo || session.customerInfo.includes('NEW CUSTOMER');
    
    if (isNewCustomer) {
        // New customers need BOTH manual address AND GPS location
        if (!session.orderInProgress.manualAddress && !session.location) {
            session.state = 'collecting_address_first';
            return `Perfect! I understand you want: ${orderMatch.product.name}

${orderMatch.product.description}
?? Price: AED ${orderMatch.product.price}${orderMatch.product.deposit > 0 ? ` + AED ${orderMatch.product.deposit} deposit` : ''}

As a new customer, I need to collect your complete delivery information:

?? STEP 1: Please provide your complete address:
• Building/Villa number or name
• Street name
• Area/Neighborhood  
• City (Dubai, Sharjah, or Ajman)
• Any delivery instructions

Example: "Villa 123, Al Wasl Road, Jumeirah, Dubai - Blue gate"

Please type your full address:`;
        } else if (session.orderInProgress.manualAddress && !session.location) {
            session.state = 'collecting_location_after_address';
            return `Great! I have your address: ${session.orderInProgress.manualAddress}

?? STEP 2: Now please share your GPS location using the ?? attachment button.

This helps us:
? Verify your exact location
?? Optimize delivery routes
?? Save precise coordinates for future orders

Please share your location to complete the setup.`;
        } else {
            return await generateOrderConfirmation(session.orderInProgress);
        }
    } else {
        // Existing customers can proceed with saved info
        return await generateOrderConfirmation(session.orderInProgress);
    }
}

// Handle address collection for new customers (Step 1)
async function handleAddressFirstCollection(message, session, userPhone) {
    const address = message.trim();
    console.log('Address collected (Step 1 for new customer):', address);
    
    if (address.length < 10) {
        return `Please provide a more complete address including:

?? REQUIRED FOR NEW CUSTOMERS:
• Building/Villa number or name
• Street name  
• Area/Neighborhood
• City (Dubai, Sharjah, or Ajman)

Example: "Villa 123, Al Wasl Road, Jumeirah, Dubai"

Please provide your full address:`;
    }
    
    session.orderInProgress.manualAddress = address;
    session.orderInProgress.deliveryMethod = 'both_address_and_location';
    
    // Validate the area from the address
    const areaValidation = validateManualAddress(address);
    session.orderInProgress.areaValidation = areaValidation;
    
    // Move to location collection (Step 2)
    session.state = 'collecting_location_after_address';
    
    return `? Address saved: ${address}

${areaValidation.isValid ? 
        `? Service Area: ${areaValidation.city} - We deliver there!` : 
        `?? Area: ${areaValidation.message || 'Please confirm if this is in Dubai/Sharjah/Ajman'}`}

?? STEP 2: Now please share your GPS location using the ?? attachment button.

This completes your delivery setup by providing:
• Your typed address (for delivery instructions)
• GPS coordinates (for precise location)

Please share your location now.`;
}

// Handle location messages (enhanced for new customer flow)
async function handleLocationMessage(message, session, userPhone) {
    const locationData = extractLocationCoordinates(message);
    
    if (!locationData) {
        return 'Sorry, I could not extract location data. Please try sharing your location again.';
    }
    
    console.log('Location received:', locationData);
    
    // Validate service area
    const validation = validateServiceArea(locationData.latitude, locationData.longitude);
    
    session.location = {
        ...locationData,
        validation: validation,
        timestamp: Date.now()
    };
    
    // Update customer location in ERPNext
    await updateCustomerLocation(userPhone, locationData);
    
    // Check if this was part of new customer setup
    const isNewCustomerSetup = session.state === 'collecting_location_after_address';
    
    if (validation.isValid) {
        session.state = 'active';
        
        if (isNewCustomerSetup && session.orderInProgress.manualAddress) {
            // Complete new customer setup with both address and location
            return `?? DELIVERY SETUP COMPLETE!

?? MANUAL ADDRESS:
${session.orderInProgress.manualAddress}

?? GPS COORDINATES:
Latitude: ${locationData.latitude}
Longitude: ${locationData.longitude}
${locationData.name ? `Location: ${locationData.name}` : ''}

? SERVICE AREA: ${validation.city.toUpperCase()}
?? Distance from hub: ${validation.distance.toFixed(1)} km

Perfect! We now have both your address and precise GPS location for optimal delivery service.

${session.orderInProgress ? 
                'Ready to confirm your order!' : 
                'You can now place orders anytime!'}`;
        } else {
            // Regular location confirmation
            return `?? Location confirmed! 

?? COORDINATES:
Latitude: ${locationData.latitude}
Longitude: ${locationData.longitude}
${locationData.name ? `Location: ${locationData.name}` : ''}

? SERVICE AREA: ${validation.city.toUpperCase()}
?? Distance from hub: ${validation.distance.toFixed(1)} km

${session.orderInProgress ? 
                'Now let\'s continue with your order!' : 
                'What would you like to order today?'}`;
        }
    } else {
        return `?? Location received but outside our service area!

?? COORDINATES:
Latitude: ${locationData.latitude}
Longitude: ${locationData.longitude}

? SERVICE AREA: Outside coverage
?? Nearest: ${validation.nearestCity?.city} (${validation.nearestCity?.distance.toFixed(1)} km away)

?? WE SERVE: Dubai, Sharjah, Ajman

Sorry, we're expanding soon to your area!`;
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

Just tell me what you want:
• "bottle" for water bottles
• "coupon" for bulk packages  
• "cooler" for water coolers

What can I help you with?`;
    } else {
        // Try to understand if they want something different
        const newMatch = smartProductMatch(lowerMessage);
        if (newMatch && newMatch.score >= 8) {
            return await handleSmartOrder(newMatch, session, userPhone);
        }
        
        return `Please let me know:
• "YES" or "CONFIRM" to proceed
• "NO" or "CANCEL" to cancel
• Or tell me what product you actually want

I'm here to help!`;
    }
}

// Generate order confirmation (enhanced for new customer dual requirement)
async function generateOrderConfirmation(orderInfo) {
    const total = orderInfo.product.price + orderInfo.product.deposit;
    const session = userSessions.get(orderInfo.customerPhone);
    
    console.log('Generating order confirmation for:', orderInfo.product.name);
    
    let locationInfo = '';
    
    // For new customers, show both address AND GPS location
    if (session.orderInProgress.manualAddress && session.location) {
        locationInfo = `
?? COMPLETE DELIVERY INFORMATION:

?? MANUAL ADDRESS:
${session.orderInProgress.manualAddress}

?? GPS COORDINATES:
Latitude: ${session.location.latitude}
Longitude: ${session.location.longitude}
${session.location.name ? `Location Name: ${session.location.name}` : ''}

? SERVICE AREA: ${session.location.validation.isValid ? session.location.validation.city.toUpperCase() : 'VERIFIED'}
?? Perfect delivery accuracy guaranteed!`;
    }
    // Handle GPS location only (existing customers)
    else if (session && session.location) {
        locationInfo = `
?? DELIVERY LOCATION (GPS):
Coordinates: ${session.location.latitude}, ${session.location.longitude}
${session.location.validation.isValid ? 
            `? Service Area: ${session.location.validation.city}` : 
            '? Outside service area'}`;
    }
    // Handle manual address only (fallback)
    else if (orderInfo.manualAddress) {
        const validation = orderInfo.areaValidation;
        locationInfo = `
?? DELIVERY ADDRESS:
${orderInfo.manualAddress}
${validation.isValid ? 
            `? Service Area: ${validation.city}` : 
            `? Area validation: ${validation.message || 'Please confirm delivery area'}`}`;
    }
    
    session.state = 'confirming_order';
    
    return `?? ORDER CONFIRMATION

?? Product: ${orderInfo.product.name}
?? Description: ${orderInfo.product.description}
?? Price: AED ${orderInfo.product.price}
${orderInfo.product.deposit > 0 ? `?? Deposit: AED ${orderInfo.product.deposit} (refundable)` : ''}
?? TOTAL: AED ${total}

${locationInfo}

?? Payment: Cash/Card on delivery

Reply "YES" to confirm or "NO" to cancel.`;
}

// Enhanced order processing
async function processOrder(session, userPhone) {
    try {
        console.log('Processing order with location/address data...');
        const orderInfo = session.orderInProgress;
        
        if (!orderInfo) {
            console.log('No order in progress');
            return 'No order found. Please tell me what you want to order!';
        }
        
        // Add location or address data to order
        if (session.location) {
            orderInfo.deliveryLocation = session.location;
            orderInfo.deliveryMethod = 'both_address_and_location';
        } else if (orderInfo.manualAddress) {
            orderInfo.deliveryMethod = 'manual_address';
            orderInfo.deliveryAddress = orderInfo.manualAddress;
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
            
            let deliveryInfo = '';
            if (session.location && orderInfo.manualAddress) {
                deliveryInfo = `?? Address: ${orderInfo.manualAddress}\n?? GPS: ${session.location.latitude}, ${session.location.longitude}\n`;
            } else if (session.location) {
                deliveryInfo = `?? GPS Location: ${session.location.latitude}, ${session.location.longitude}\n`;
            } else if (orderInfo.manualAddress) {
                deliveryInfo = `?? Address: ${orderInfo.manualAddress}\n`;
            }
            
            return `? ORDER CONFIRMED SUCCESSFULLY!

?? Order Number: ${erpOrder.orderName}
?? Product: ${orderInfo.product.name}  
?? Total: AED ${orderInfo.product.price + orderInfo.product.deposit}
${deliveryInfo}
?? NEXT STEPS:
• Delivery team will contact you within 2 hours
• Complete delivery information saved
• Payment: Cash/Card on delivery

Thank you for choosing our premium water service! ??`;
        } else {
            console.log('Order creation failed:', erpOrder.error);
            return handleOrderError(erpOrder.error, erpOrder.errorType);
        }
        
    } catch (error) {
        console.error('Error processing order:', error);
        return `ORDER PROCESSING ERROR

Technical issue occurred. Our team has been notified.
Please try again in a few minutes.`;
    }
}

// Update customer location in ERPNext
async function updateCustomerLocation(customerPhone, locationData) {
    try {
        console.log('Updating customer location in ERPNext...');
        
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
            
            const updateData = {
                custom_latitude: locationData.latitude,
                custom_longitude: locationData.longitude,
                custom_location_name: locationData.name || 'GPS Location',
                custom_location_address: locationData.address || '',
                custom_location_updated: new Date().toISOString()
            };
            
            await axios.put(
                `${ERPNEXT_URL}/api/resource/Customer/${customerName}`,
                updateData,
                {
                    headers: {
                        'Authorization': `token ${ERPNEXT_API_KEY}:${ERPNEXT_API_SECRET}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            
            console.log('Customer location updated successfully');
        }
        
    } catch (error) {
        console.error('Error updating customer location:', error.response?.data || error.message);
    }
}

// Helper function to detect mobile numbers
function isMobileNumber(text) {
    const mobileRegex = /^(\+?\d{1,4})?[0-9]{8,15}$/;
    return mobileRegex.test(text.trim()) && text.length < 20;
}

// Build context for GPT
async function buildContextForGPT(session, userPhone) {
    let context = '';
    
    if (session.customerInfo && !session.customerInfo.includes('NOT FOUND')) {
        context += `EXISTING CUSTOMER INFO:\n${session.customerInfo}\n\n`;
    }
    
    if (session.location) {
        context += `CUSTOMER LOCATION:\n`;
        context += `Coordinates: ${session.location.latitude}, ${session.location.longitude}\n`;
        context += `Area: ${session.location.validation.isValid ? session.location.validation.city : 'Outside service area'}\n\n`;
    }
    
    context += `SALES STAGE: ${session.salesStage}\n`;
    
    return context;
}

// ERPNext integration functions
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
        
        // Add both GPS and manual address data for new customers
        const session = userSessions.get(orderInfo.customerPhone);
        if (session && session.location) {
            // GPS location data
            customerData.custom_latitude = session.location.latitude;
            customerData.custom_longitude = session.location.longitude;
            customerData.custom_location_name = session.location.name || 'GPS Location';
            customerData.custom_location_updated = new Date().toISOString();
        }
        
        if (orderInfo.manualAddress) {
            // Manual address data
            customerData.custom_manual_address = orderInfo.manualAddress;
            if (orderInfo.areaValidation) {
                customerData.custom_delivery_city = orderInfo.areaValidation.city;
                customerData.custom_address_validation = orderInfo.areaValidation.confidence;
            }
        }
        
        // Set address type based on what we have
        if (session && session.location && orderInfo.manualAddress) {
            customerData.custom_address_type = 'both_address_and_gps';
        } else if (session && session.location) {
            customerData.custom_address_type = 'gps_location';
        } else if (orderInfo.manualAddress) {
            customerData.custom_address_type = 'manual_address';
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
        
        console.log('Customer created:', response.data.data.name);
        
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
            custom_customer_phone: orderInfo.customerPhone,
            custom_order_source: 'WhatsApp Bot Dual Location System'
        };
        
        // Add both GPS and manual address data for comprehensive order information
        if (orderInfo.deliveryLocation) {
            // GPS location data
            orderData.custom_delivery_latitude = orderInfo.deliveryLocation.latitude;
            orderData.custom_delivery_longitude = orderInfo.deliveryLocation.longitude;
            orderData.custom_delivery_location_name = orderInfo.deliveryLocation.name;
        }
        
        if (orderInfo.deliveryAddress || orderInfo.manualAddress) {
            // Manual address data
            orderData.custom_delivery_address = orderInfo.deliveryAddress || orderInfo.manualAddress;
        }
        
        // Set delivery method based on what information we have
        if (orderInfo.deliveryLocation && (orderInfo.deliveryAddress || orderInfo.manualAddress)) {
            orderData.custom_delivery_method = 'both_address_and_gps';
        } else if (orderInfo.deliveryLocation) {
            orderData.custom_delivery_method = 'gps_location';
        } else if (orderInfo.deliveryAddress || orderInfo.manualAddress) {
            orderData.custom_delivery_method = 'manual_address';
        }
        
        if (orderInfo.areaValidation) {
            orderData.custom_delivery_city = orderInfo.areaValidation.city;
            orderData.custom_address_confidence = orderInfo.areaValidation.confidence;
        }
        
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
        }
        
        return {
            success: false,
            error: errorMessage,
            errorType: errorType
        };
    }
}

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
    }
    
    return `ORDER PROCESSING ISSUE

Technical issue encountered. Our team has been notified.
Please try again in a few minutes.`;
}

async function getCustomerByMobile(mobileNumber) {
    try {
        console.log(`Looking up customer: ${mobileNumber}`);
        
        const searchUrl = `${ERPNEXT_URL}/api/resource/Customer`;
        const response = await axios.get(searchUrl, {
            headers: {
                'Authorization': `token ${ERPNEXT_API_KEY}:${ERPNEXT_API_SECRET}`,
                'Content-Type': 'application/json'
            },
            params: {
                filters: JSON.stringify([['mobile_no', '=', mobileNumber]]),
                fields: JSON.stringify(['name', 'customer_name', 'mobile_no', 'custom_latitude', 'custom_longitude', 'custom_manual_address'])
            }
        });

        const customers = response.data.data;
        
        if (customers && customers.length > 0) {
            const customer = customers[0];
            console.log(`Customer found: ${customer.customer_name}`);
            
            let responseText = `?? CUSTOMER FOUND

Name: ${customer.customer_name}
Mobile: ${customer.mobile_no}`;

            // Add location info if available
            if (customer.custom_latitude && customer.custom_longitude) {
                responseText += `

?? SAVED GPS LOCATION:
Coordinates: ${customer.custom_latitude}, ${customer.custom_longitude}`;
            }
            
            if (customer.custom_manual_address) {
                responseText += `

?? SAVED ADDRESS:
${customer.custom_manual_address}`;
            }
            
            responseText += `

To place an order, just tell me what you want!
Examples: "bottle", "cooler", "coupon"`;
            
            return responseText;
            
        } else {
            console.log(`No customer found for: ${mobileNumber}`);
            return `?? NEW CUSTOMER

No customer found with mobile: ${mobileNumber}

Ready to place your first order?
Just tell me what you want and I'll guide you through the setup!`;
        }
        
    } catch (error) {
        console.error('Error fetching customer:', error.response?.data || error.message);
        return 'Unable to fetch customer information. Please try again.';
    }
}

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

// Test endpoints
app.get('/test-smart-match', (req, res) => {
    const testInputs = [
        'i want bottle',
        'need coler', 
        'buy cupon',
        'get pump',
        'want dispensr',
        '1 bottle pls',
        '10+1 cpn',
        'bulk packag',
        'single btl',
        'premiun cool'
    ];
    
    const results = testInputs.map(input => {
        const match = smartProductMatch(input);
        return {
            input: input,
            match: match ? match.product.name : 'No match',
            score: match ? match.score : 0
        };
    });
    
    res.json({
        status: 'success',
        message: 'Smart matching test results',
        results: results
    });
});

app.get('/test-manual-address', (req, res) => {
    const testAddresses = [
        'Villa 123, Al Wasl Road, Jumeirah, Dubai',
        'Building 45, King Faisal Street, Sharjah',
        'Tower 78, Al Nuaimiya, Ajman',
        'House 12, Deira, Dubai',
        'Apartment 34, Al Nahda, Sharjah',
        'Office 56, Marina, Dubai'
    ];
    
    const results = testAddresses.map(address => {
        const validation = validateManualAddress(address);
        return {
            address: address,
            isValid: validation.isValid,
            city: validation.city || 'Unknown',
            confidence: validation.confidence
        };
    });
    
    res.json({
        status: 'success',
        message: 'Manual address validation test results',
        results: results
    });
});

app.get('/analytics', (req, res) => {
    const analytics = {
        totalSessions: userSessions.size,
        salesStages: {},
        activeOrders: 0,
        locationsReceived: 0,
        manualAddresses: 0,
        smartOrderMatches: 0
    };
    
    userSessions.forEach(session => {
        analytics.salesStages[session.salesStage] = 
            (analytics.salesStages[session.salesStage] || 0) + 1;
        
        if (session.orderInProgress) {
            analytics.activeOrders++;
            if (session.orderInProgress.matchConfidence) {
                analytics.smartOrderMatches++;
            }
            if (session.orderInProgress.manualAddress) {
                analytics.manualAddresses++;
            }
        }
        
        if (session.location) {
            analytics.locationsReceived++;
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
        <title>WhatsApp Bot Final - Smart Recognition + Mandatory Dual Location</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
            .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .status { padding: 20px; background: #e8f5e8; border-radius: 8px; margin: 20px 0; }
            .feature { margin: 15px 0; padding: 15px; background: #f8f8f8; border-radius: 6px; border-left: 4px solid #28a745; }
            .endpoint { margin: 10px 0; padding: 12px; background: #e3f2fd; border-radius: 6px; border-left: 4px solid #007bff; font-family: monospace; }
            .active { color: #28a745; font-weight: bold; }
            .inactive { color: #ffc107; }
            h1 { color: #333; text-align: center; }
            h2, h3 { color: #007bff; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 20px 0; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>?? WhatsApp Bot Final v5.0</h1>
            
            <div class="status">
                <h2>Status: <span class="active">DUAL LOCATION MANDATORY FOR NEW CUSTOMERS</span></h2>
                <p><strong>Version:</strong> 5.0.0 (Smart Recognition + Mandatory Address + GPS)</p>
                <p><strong>Active Sessions:</strong> ${userSessions.size}</p>
                <p><strong>GPT Integration:</strong> <span class="${OPENAI_API_KEY ? 'active' : 'inactive'}">${OPENAI_API_KEY ? 'ENABLED' : 'DISABLED'}</span></p>
                <p><strong>ERPNext:</strong> <span class="${ERPNEXT_URL ? 'active' : 'inactive'}">${ERPNEXT_URL ? 'ENABLED' : 'DISABLED'}</span></p>
            </div>

            <div class="grid">
                <div>
                    <h3>?? SMART ORDER RECOGNITION:</h3>
                    <div class="feature">? Natural language understanding</div>
                    <div class="feature">? Spelling mistake tolerance</div>
                    <div class="feature">? Short form recognition</div>
                    <div class="feature">? Fuzzy matching algorithm</div>
                    <div class="feature">? Context-aware suggestions</div>
                </div>
                
                <div>
                    <h3>?? MANDATORY DUAL LOCATION:</h3>
                    <div class="feature">? NEW CUSTOMERS: Both manual address + GPS required</div>
                    <div class="feature">? Manual address entry (Step 1)</div>
                    <div class="feature">? GPS location sharing (Step 2)</div>
                    <div class="feature">? Existing customers: Use saved information</div>
                    <div class="feature">? Complete delivery accuracy & optimization</div>
                </div>
            </div>

            <h3>?? SMART ORDER EXAMPLES:</h3>
            <div class="endpoint">"bottle" ? Single Bottle</div>
            <div class="endpoint">"coler" ? Premium Cooler</div>
            <div class="endpoint">"cupon" ? Coupon Book</div>
            <div class="endpoint">"1 btl pls" ? Single Bottle</div>
            <div class="endpoint">"need pump" ? Hand Pump</div>
            <div class="endpoint">"bulk pack" ? 100+40 Coupon</div>
            
            <h3>?? NEW CUSTOMER SETUP:</h3>
            <div class="endpoint"><strong>Step 1:</strong> Type complete manual address</div>
            <div class="endpoint"><strong>Step 2:</strong> Share GPS location ??</div>
            <div class="endpoint"><strong>Result:</strong> Both saved for optimal delivery</div>
            <div class="endpoint"><strong>Existing customers:</strong> Proceed with saved info</div>

            <h3>?? TEST ENDPOINTS:</h3>
            <div class="endpoint"><strong>/test-smart-match</strong> - Test smart order recognition</div>
            <div class="endpoint"><strong>/test-manual-address</strong> - Test manual address validation</div>
            <div class="endpoint"><strong>/analytics</strong> - Enhanced session analytics</div>
            
            <h3>?? ERPNEXT INTEGRATION:</h3>
            <div class="endpoint"><strong>Customer Fields:</strong> custom_latitude, custom_longitude, custom_manual_address</div>
            <div class="endpoint"><strong>Address Type:</strong> custom_address_type = 'both_address_and_gps'</div>
            <div class="endpoint"><strong>Order Method:</strong> custom_delivery_method = 'both_address_and_gps'</div>
            <div class="endpoint"><strong>Complete Data:</strong> Both GPS coordinates and manual address saved</div>
        </div>
    </body>
    </html>
    `;
    res.send(statusHtml);
});

app.listen(PORT, () => {
    console.log(`?? WhatsApp Water Delivery Bot FINAL v5.0 running on port ${PORT}`);
    console.log('? Smart Order Recognition + Mandatory Dual Location for New Customers');
    console.log(`?? URL: http://localhost:${PORT}`);
    console.log('?? Features: Natural Language, Fuzzy Matching, Mandatory Address+GPS for New Customers');
    
    if (!OPENAI_API_KEY) {
        console.warn('??  OPENAI_API_KEY not set');
    }
    
    if (!ERPNEXT_URL) {
        console.warn('??  ERPNEXT_URL not set');
    }
    
    startKeepAlive();
});