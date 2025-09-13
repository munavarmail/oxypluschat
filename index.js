require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const GRAPH_API_TOKEN = process.env.GRAPH_API_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// OpenAI Configuration for GPT-4.1 mini
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
    dubai: { lat: 25.2048, lng: 55.2708, radius: 50 }, // 50km radius
    sharjah: { lat: 25.3463, lng: 55.4209, radius: 30 },
    ajman: { lat: 25.4052, lng: 55.5136, radius: 25 }
};

// Welcome menu options
const WELCOME_MENU = `WELCOME TO PREMIUM WATER DELIVERY SERVICE!

Choose what you'd like to do:

?? PLACE ORDER
Just say what you want:
• "bottle", "single", "one bottle"
• "coupon", "bulk", "package"  
• "cooler", "dispenser", "pump"

?? VIEW PRICING
Type: "price" or "menu"

?? DELIVERY INFO
Type: "delivery" or share your location

?? PAYMENT OPTIONS
Type: "payment"

?? CUSTOMER SUPPORT
Type: "help" or "support"

?? RAISE COMPLAINT
Type: "complaint" or "issue"

?? CHECK ACCOUNT
Send your mobile number

?? SPECIAL OFFERS
Type: "offers" or "deals"

?? COMPANY INFO
Type: "about"

Just tell me what you need in your own words!`;

// Enhanced product catalog with fuzzy matching keywords
const PRODUCTS = {
    'single_bottle': { 
        name: 'Single Bottle', 
        price: 7, 
        deposit: 15, 
        item_code: '5 Gallon Filled',
        description: '5-gallon water bottle made from 100% virgin material with low sodium and pH-balanced water',
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
        salesPoints: ['Risk-free trial', 'Experience our quality', 'Same premium water']
    },
    'table_dispenser': { 
        name: 'Table Top Dispenser', 
        price: 25, 
        deposit: 0, 
        item_code: 'Table Dispenser',
        description: 'Basic table top dispenser for convenient water access',
        keywords: ['table', 'dispenser', 'basic', 'simple', 'tbl', 'disp'],
        fuzzyKeywords: ['tabl', 'dispensr', 'dispenser', 'tbldispenser'],
        salesPoints: ['No electricity needed', 'Compact design', 'Easy to use']
    },
    'hand_pump': { 
        name: 'Hand Pump', 
        price: 15, 
        deposit: 0, 
        item_code: 'Hand Pump',
        description: 'Manual hand pump for bottles - most economical option',
        keywords: ['pump', 'manual', 'hand', 'cheap', 'hnd', 'pmp'],
        fuzzyKeywords: ['pumb', 'hanpump', 'handpmp', 'manul'],
        salesPoints: ['Most affordable', 'No maintenance', 'Works anywhere']
    },
    'premium_cooler': { 
        name: 'Premium Water Cooler', 
        price: 300, 
        deposit: 0, 
        item_code: 'Water Cooler',
        description: 'Premium cooler with hot/cold water, 1-year warranty from Geo General',
        keywords: ['premium', 'cooler', 'hot', 'cold', 'electric', 'cool', 'clr'],
        fuzzyKeywords: ['coler', 'coolar', 'premim', 'premum'],
        salesPoints: ['Hot & cold water', '1-year warranty', 'Premium quality', 'Energy efficient']
    },
    'coupon_10_1': { 
        name: '10+1 Coupon Book', 
        price: 70, 
        deposit: 0, 
        item_code: 'Coupon Book',
        description: '11 bottles (10+1 free), up to 3 bottles without deposit',
        keywords: ['10+1', '11', 'eleven', 'coupon', 'small', 'cpn', 'book'],
        fuzzyKeywords: ['10plus1', '11bottles', 'couponbook', 'smallpack'],
        salesPoints: ['Save on deposit', 'Free bottle included', 'Better per-bottle price', 'Priority delivery']
    },
    'coupon_100_40': { 
        name: '100+40 Coupon Book', 
        price: 700, 
        deposit: 0, 
        item_code: 'Coupon Book',
        description: '140 bottles total, up to 5 bottles without deposit, BNPL available',
        keywords: ['100+40', '140', 'bulk', 'large', 'bnpl', 'big', 'hundred'],
        fuzzyKeywords: ['100plus40', '140bottles', 'bulkpack', 'largpack'],
        salesPoints: ['Best value for money', 'Buy now pay later option', 'Huge savings', 'No deposit for 5 bottles', 'Priority service']
    },
    'premium_package': { 
        name: '140 Bottles + Premium Dispenser', 
        price: 920, 
        deposit: 0, 
        item_code: 'Premium Package',
        description: '140 bottles + Premium dispenser package - complete solution',
        keywords: ['premium', 'package', 'complete', 'combo', 'pkg', 'set'],
        fuzzyKeywords: ['premiumpack', 'completeset', 'combopack'],
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

SMART ORDER RECOGNITION:
System understands natural language, spelling mistakes, and short forms.

DUAL LOCATION SERVICES:
GPS location capture OR manual address input for accurate delivery.

ORDER PROCESS:
Natural language order processing with intelligent product matching.

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
- Both GPS and manual address validation for service area
`;

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

// Smart product matching with fuzzy logic
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
        
        // Check fuzzy matches (medium weight)
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
        
        // Special patterns
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
        const distance = calculateDistance(
            latitude, longitude,
            area.lat, area.lng
        );
        
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

// Calculate distance between two coordinates (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // Distance in kilometers
}

// Find nearest city to coordinates
function findNearestCity(latitude, longitude) {
    let nearest = null;
    let minDistance = Infinity;
    
    for (const [city, area] of Object.entries(SERVICE_AREAS)) {
        const distance = calculateDistance(
            latitude, longitude,
            area.lat, area.lng
        );
        
        if (distance < minDistance) {
            minDistance = distance;
            nearest = { city, distance };
        }
    }
    
    return nearest;
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
    
    // Check if it has address-like characteristics
    const hasAddressWords = addressIndicators.some(indicator => 
        lowerMessage.includes(indicator)
    );
    
    // Must have at least 3 words, some numbers, and address-like words
    return wordCount >= 3 && hasNumbers && hasAddressWords;
}

// Validate manual address for service area
function validateManualAddress(address) {
    const lowerAddress = address.toLowerCase();
    
    // Check for UAE cities in the address
    if (lowerAddress.includes('dubai')) {
        return {
            isValid: true,
            city: 'dubai',
            method: 'manual_address',
            confidence: 'high'
        };
    } else if (lowerAddress.includes('sharjah')) {
        return {
            isValid: true,
            city: 'sharjah', 
            method: 'manual_address',
            confidence: 'high'
        };
    } else if (lowerAddress.includes('ajman')) {
        return {
            isValid: true,
            city: 'ajman',
            method: 'manual_address', 
            confidence: 'high'
        };
    } else {
        // Check for known areas/neighborhoods
        const knownAreas = {
            dubai: ['jumeirah', 'deira', 'bur dubai', 'marina', 'downtown', 'jlt', 'jbr', 'mall of emirates', 'dubai mall', 'al barsha', 'motor city', 'silicon oasis', 'international city'],
            sharjah: ['rolla', 'al nahda', 'al majaz', 'al qasba', 'king faisal', 'al taawun', 'abu shagara', 'al fisht'],
            ajman: ['al nuaimiya', 'al rashidiya', 'al jerf', 'al rawda', 'corniche']
        };
        
        for (const [city, areas] of Object.entries(knownAreas)) {
            if (areas.some(area => lowerAddress.includes(area))) {
                return {
                    isValid: true,
                    city: city,
                    method: 'manual_address',
                    confidence: 'medium'
                };
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

// Enhanced GPT integration with smart order recognition
async function getGPTResponse(userMessage, session, context = '') {
    try {
        const conversationHistory = session.conversationHistory.slice(-8);
        
        const systemPrompt = `You are an intelligent sales assistant for a premium water delivery service in UAE with SMART ORDER RECOGNITION and DUAL LOCATION SERVICES.

GREETING HANDLING:
When customers greet with "hi", "hello", "hey", "good morning", etc., show them the complete welcome menu.

SMART ORDER RECOGNITION:
The system now understands natural language, spelling mistakes, and variations:
- "bottle" or "btl" = single bottle
- "coupon" or "bulk" = coupon books  
- "cooler" or "cool" = premium cooler
- "pump" = hand pump
- "dispenser" or "disp" = table dispenser
- Numbers: "1", "10+1", "140", etc.

DUAL LOCATION SERVICES:
- GPS location capture for delivery
- Manual address input option
- Service area validation for both methods
- Coordinate display and storage

CONTEXT:
${KNOWLEDGE_BASE}

${context}

CONVERSATION GUIDELINES:
1. For greetings, show the complete welcome menu
2. Use natural language understanding for orders
3. Handle spelling mistakes gracefully
4. Offer both GPS and manual address options
5. Validate service areas for both methods
6. Be conversational and helpful
7. Guide customers naturally without rigid commands

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

        return gptResponse;

    } catch (error) {
        console.error('GPT API Error:', error.response?.data || error.message);
        return getFallbackResponse(userMessage, session);
    }
}

// Enhanced fallback response with smart matching
function getFallbackResponse(message, session) {
    const lowerMessage = message.toLowerCase().trim();
    
    // Handle greetings - show welcome menu
    const greetings = ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening', 'salaam', 'assalam', 'start'];
    if (greetings.some(greeting => lowerMessage.includes(greeting)) || lowerMessage === 'hi' || lowerMessage === 'hello') {
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

Would you like to place this order? Just say "yes" or let me know if you meant something else!`;
        } else {
            return `I'd be happy to help you place an order!

Just tell me what you want in your own words:
• "bottle" or "water" - for single bottles
• "coupon" or "bulk" - for coupon books  
• "cooler" - for water coolers
• "pump" - for hand pumps
• "dispenser" - for table dispensers

What would you like today?`;
        }
    }
    
    // Try smart product matching for any input
    const productMatch = smartProductMatch(lowerMessage);
    if (productMatch && productMatch.score >= 8) {
        return `I think you're looking for: ${productMatch.product.name}

${productMatch.product.description}
Price: AED ${productMatch.product.price}${productMatch.product.deposit > 0 ? ` + AED ${productMatch.product.deposit} deposit` : ''}

Is this what you want? Say "yes" to order or tell me more about what you need!`;
    }
    
    // Pricing questions
    if (lowerMessage.includes('price') || lowerMessage.includes('cost') || lowerMessage.includes('how much')) {
        return `?? COMPLETE PRICING MENU

WATER BOTTLES:
• Single Bottle - AED 7 + AED 15 deposit
• Trial Bottle - AED 7 + AED 15 deposit

COUPON BOOKS (Better Value):
• 10+1 Coupon Book - AED 70
• 100+40 Coupon Book - AED 700 (BNPL available)

EQUIPMENT:
• Hand Pump - AED 15
• Table Dispenser - AED 25  
• Premium Cooler - AED 300

PACKAGES:
• 140 Bottles + Dispenser - AED 920

Just tell me what you want in your own words!`;
    }
    
    // Location/Delivery questions
    if (lowerMessage.includes('deliver') || lowerMessage.includes('location') || lowerMessage.includes('area') || lowerMessage.includes('address')) {
        return `?? DELIVERY & LOCATION SERVICES

COVERAGE AREAS:
Dubai, Sharjah, Ajman (except freezones)

DELIVERY OPTIONS:
?? **GPS Location**: Share your location for instant verification
?? **Manual Address**: Type your complete address

DELIVERY FEATURES:
• Same-day/next-day delivery
• Weekly scheduled delivery
• FREE delivery with coupon books
• Both GPS and manual address accepted

Share your location ?? OR type your address, and I'll confirm if we deliver there!`;
    }

    // Default response
    return `Hello! I'm here to help with our premium water delivery service.

?? QUICK HELP:
• Just say what you want: "bottle", "cooler", "coupon"
• "price" - View all prices  
• "delivery" - Location & delivery info
• Share your location ?? or type your address
• Send mobile number - Check account

I understand natural language, so just tell me what you need!`;
}

// Health check endpoint
app.get('/health', (req, res) => {
    const healthData = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        memory: process.memoryUsage(),
        environment: process.env.NODE_ENV || 'development',
        version: '4.1.0-Dual-Location-System',
        activeSessions: userSessions.size,
        features: {
            gptIntegration: !!OPENAI_API_KEY,
            erpIntegration: !!(ERPNEXT_URL && ERPNEXT_API_KEY),
            keepAlive: !!KEEP_ALIVE_URL,
            smartOrderRecognition: true,
            gpsLocationServices: true,
            manualAddressInput: true,
            fuzzyMatching: true,
            dualLocationSystem: true
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

// Enhanced webhook to receive messages with location support
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

// Enhanced message handling with location and smart order recognition
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
        // PRIORITY 4: Handle location or address choice
        else if (session.state === 'requesting_location_or_address') {
            console.log('Handling location/address choice');
            response = await handleLocationOrAddressChoice(messageBody, session, from);
        }
        // PRIORITY 5: Handle manual address collection
        else if (session.state === 'collecting_manual_address') {
            console.log('Collecting manual address');
            response = await handleManualAddressCollection(messageBody, session, from);
        }
        // PRIORITY 6: Handle waiting for location
        else if (session.state === 'waiting_for_location') {
            console.log('Waiting for location');
            response = `Please share your location ?? using the attachment button.

If you prefer to type your address instead, just type your complete address including:
- Building/villa number
- Street name and area  
- City (Dubai/Sharjah/Ajman)

Which would you prefer?`;
        }
        // PRIORITY 7: Check for mobile number lookup
        else if (isMobileNumber(messageBody)) {
            console.log('Mobile number detected');
            response = await getCustomerByMobile(messageBody.trim());
            session.customerInfo = response;
        }
        // PRIORITY 8: Use GPT for conversation
        else {
            console.log('Using GPT for conversation');
            const context = await buildContextForGPT(session, from);
            response = await getGPTResponse(messageBody, session, context);
        }
    }
    
    console.log('Sending response:', response.substring(0, 100) + '...');
    await sendMessage(from, response, phoneNumberId);
}

// Handle location messages
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
    
    if (validation.isValid) {
        session.state = 'active';
        return `?? Location confirmed! 

?? COORDINATES:
Latitude: ${locationData.latitude}
Longitude: ${locationData.longitude}
${locationData.name ? `Location: ${locationData.name}` : ''}

? SERVICE AREA: ${validation.city.toUpperCase()}
?? Distance from hub: ${validation.distance.toFixed(1)} km

Great news! We deliver to your area.

${session.orderInProgress ? 
    'Now let\'s continue with your order!' : 
    'What would you like to order today? Just tell me what you need!'}`;
    } else {
        return `?? Location received!

?? COORDINATES:
Latitude: ${locationData.latitude}
Longitude: ${locationData.longitude}

? SERVICE AREA: Outside coverage
?? Nearest service area: ${validation.nearestCity?.city} (${validation.nearestCity?.distance.toFixed(1)} km away)

?? WE CURRENTLY SERVE:
• Dubai (50km radius)
• Sharjah (30km radius)  
• Ajman (25km radius)

Sorry, your location is outside our current delivery area. We're expanding soon!`;
    }
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
    
    // Check if we need location or address
    if (!session.location && !session.orderInProgress.manualAddress) {
        session.state = 'requesting_location_or_address';
        return `Perfect! I understand you want: ${orderMatch.product.name}

${orderMatch.product.description}
?? Price: AED ${orderMatch.product.price}${orderMatch.product.deposit > 0 ? ` + AED ${orderMatch.product.deposit} deposit` : ''}

To proceed, please provide your delivery information:

?? OPTION 1: Share GPS Location
Use the attachment button to share your location for automatic area verification

?? OPTION 2: Type Manual Address  
Type your complete address including:
- Building/villa number
- Street name and area
- City (Dubai/Sharjah/Ajman)

Which option would you prefer?`;
    } else {
        return await generateOrderConfirmation(session.orderInProgress);
    }
}

// Handle choice between GPS location and manual address
async function handleLocationOrAddressChoice(message, session, userPhone) {
    const lowerMessage = message.toLowerCase().trim();
    console.log(`Handling location/address choice: "${lowerMessage}"`);
    
    // Check if they're providing a manual address directly
    if (isManualAddress(lowerMessage)) {
        console.log('Manual address provided directly');
        session.orderInProgress.manualAddress = message.trim();
        session.orderInProgress.deliveryMethod = 'manual_address';
        
        const areaValidation = validateManualAddress(message.trim());
        session.orderInProgress.areaValidation = areaValidation;
        
        session.state = 'confirming_order';
        return await generateOrderConfirmation(session.orderInProgress);
    }
    
    // Check for GPS/location preference
    if (lowerMessage.includes('location') || lowerMessage.includes('gps') || lowerMessage.includes('share') || lowerMessage === '1') {
        session.state = 'waiting_for_location';
        return `Great! Please share your GPS location ?? using the attachment button.

This will help us:
? Automatically verify your delivery area
?? Save precise coordinates for delivery
?? Provide accurate delivery estimates

Please use the ?? location sharing feature in WhatsApp.`;
    }
    
    // Check for manual/address preference  
    if (lowerMessage.includes('manual') || lowerMessage.includes('address') || lowerMessage.includes('type') || lowerMessage === '2') {
        session.state = 'collecting_manual_address';
        return `Perfect! Please provide your complete delivery address:

?? REQUIRED INFORMATION:
• Building/Villa number or name
• Street name
• Area/Neighborhood  
• City (Dubai, Sharjah, or Ajman)
• Any special delivery instructions

Example: "Villa 123, Al Wasl Road, Jumeirah, Dubai - Gate is blue color"

Please type your full address:`;
    }
    
    return `Please choose how to provide your delivery information:

?? **OPTION 1: GPS Location**
Reply "location" or "GPS" then share your location using ??

?? **OPTION 2: Manual Address** 
Reply "address" or "manual" to type your address

Or just start typing your address directly!

Which do you prefer?`;
}

// Handle manual address collection
async function handleManualAddressCollection(message, session, userPhone) {
    const address = message.trim();
    console.log('Manual address collected:', address);
    
    if (address.length < 10) {
        return `Please provide a more complete address including:

?? REQUIRED:
• Building/Villa number or name
• Street name  
• Area/Neighborhood
• City (Dubai, Sharjah, or Ajman)

Example: "Villa 123, Al Wasl Road, Jumeirah, Dubai"

Please provide your full address:`;
    }
    
    session.orderInProgress.manualAddress = address;
    session.orderInProgress.deliveryMethod = 'manual_address';
    
    // Validate the area from the address
    const areaValidation = validateManualAddress(address);
    session.orderInProgress.areaValidation = areaValidation;
    
    session.state = 'confirming_order';
    return await generateOrderConfirmation(session.orderInProgress);
}

// Update customer location in ERPNext
async function updateCustomerLocation(customerPhone, locationData) {
    try {
        console.log('Updating customer location in ERPNext...');
        
        // First, find the customer
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
            
            // Update customer with location data
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

// Order confirmation handling (enhanced)
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

Just tell me what you want in your own words:
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
• "YES" or "CONFIRM" to proceed with the order
• "NO" or "CANCEL" to cancel
• Or tell me what product you actually want

I'm here to help!`;
    }
}

// Generate order confirmation (enhanced with location OR manual address)
async function generateOrderConfirmation(orderInfo) {
    const total = orderInfo.product.price + orderInfo.product.deposit;
    const session = userSessions.get(orderInfo.customerPhone);
    
    console.log('Generating order confirmation for:', orderInfo.product.name);
    
    let locationInfo = '';
    
    // Handle GPS location
    if (session && session.location) {
        locationInfo = `
?? DELIVERY LOCATION (GPS):
${session.location.name || 'GPS Location'}
Coordinates: ${session.location.latitude}, ${session.location.longitude}
${session.location.validation.isValid ? 
    `? Service Area: ${session.location.validation.city}` : 
    '? Outside service area'}`;
    }
    // Handle manual address
    else if (orderInfo.manualAddress) {
        const validation = orderInfo.areaValidation;
        locationInfo = `
?? DELIVERY ADDRESS (Manual):
${orderInfo.manualAddress}
${validation.isValid ? 
    `? Service Area: ${validation.city} (${validation.confidence} confidence)` : 
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

Reply "YES" to confirm your order or "NO" to cancel.`;
}

// Enhanced order processing with location OR manual address data
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
            orderInfo.deliveryMethod = 'gps_location';
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
            if (session.location) {
                deliveryInfo = `?? Delivery Location: ${session.location.name || 'GPS Location'}\nCoordinates: ${session.location.latitude}, ${session.location.longitude}\n`;
            } else if (orderInfo.manualAddress) {
                deliveryInfo = `?? Delivery Address: ${orderInfo.manualAddress}\n`;
            }
            
            return `? ORDER CONFIRMED SUCCESSFULLY!

?? Order Number: ${erpOrder.orderName}
?? Product: ${orderInfo.product.name}  
?? Total Amount: AED ${orderInfo.product.price + orderInfo.product.deposit}
${deliveryInfo}
?? NEXT STEPS:
• Our delivery team will contact you within 2 hours
• ${session.location ? 'GPS coordinates saved for accurate delivery' : 'Address saved for delivery coordination'}
• Payment: Cash/Card on delivery

DELIVERY AREAS: Dubai, Sharjah, Ajman

Need to modify your order? Just message us!

Thank you for choosing our premium water service! ??`;
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

// Helper function to detect mobile numbers
function isMobileNumber(text) {
    const mobileRegex = /^(\+?\d{1,4})?[0-9]{8,15}$/;
    return mobileRegex.test(text.trim()) && text.length < 20;
}

// Build context for GPT (enhanced with location)
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
        
        // Add GPS location data if available
        const session = userSessions.get(orderInfo.customerPhone);
        if (session && session.location) {
            customerData.custom_latitude = session.location.latitude;
            customerData.custom_longitude = session.location.longitude;
            customerData.custom_location_name = session.location.name || 'GPS Location';
            customerData.custom_location_updated = new Date().toISOString();
            customerData.custom_address_type = 'gps_location';
        }
        // Add manual address data if available
        else if (orderInfo.manualAddress) {
            customerData.custom_manual_address = orderInfo.manualAddress;
            customerData.custom_address_type = 'manual_address';
            if (orderInfo.areaValidation) {
                customerData.custom_delivery_city = orderInfo.areaValidation.city;
                customerData.custom_address_validation = orderInfo.areaValidation.confidence;
            }
            customerData.custom_location_updated = new Date().toISOString();
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
        
        // Add GPS location data if available
        if (orderInfo.deliveryLocation) {
            orderData.custom_delivery_latitude = orderInfo.deliveryLocation.latitude;
            orderData.custom_delivery_longitude = orderInfo.deliveryLocation.longitude;
            orderData.custom_delivery_location_name = orderInfo.deliveryLocation.name;
            orderData.custom_delivery_address = orderInfo.deliveryLocation.address || 'GPS Location';
            orderData.custom_delivery_method = 'gps_location';
        }
        // Add manual address data if available
        else if (orderInfo.deliveryAddress) {
            orderData.custom_delivery_address = orderInfo.deliveryAddress;
            orderData.custom_delivery_method = 'manual_address';
            if (orderInfo.areaValidation) {
                orderData.custom_delivery_city = orderInfo.areaValidation.city;
                orderData.custom_address_confidence = orderInfo.areaValidation.confidence;
            }
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

WHAT TO DO:
• Try again in a few minutes
• Contact support directly  
• Your details have been saved

We'll resolve this quickly!`;
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
            } else if (customer.custom_manual_address) {
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
Just tell me what you want:
• "bottle" for water bottles
• "cooler" for water coolers  
• "coupon" for bulk packages

I'll guide you through the process!`;
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

// Test smart matching endpoint
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

// Test manual address validation endpoint
app.get('/test-manual-address', (req, res) => {
    const testAddresses = [
        'Villa 123, Al Wasl Road, Jumeirah, Dubai',
        'Building 45, King Faisal Street, Sharjah',
        'Tower 78, Al Nuaimiya, Ajman',
        'House 12, Deira, Dubai',
        'Apartment 34, Al Nahda, Sharjah',
        'Office 56, Marina, Dubai',
        'Some random address without city',
        'Block 9, Abu Dhabi'
    ];
    
    const results = testAddresses.map(address => {
        const validation = validateManualAddress(address);
        return {
            address: address,
            isValid: validation.isValid,
            city: validation.city || 'Unknown',
            confidence: validation.confidence,
            method: validation.method
        };
    });
    
    res.json({
        status: 'success',
        message: 'Manual address validation test results',
        results: results
    });
});

// Test location validation endpoint (enhanced)
app.get('/test-location', (req, res) => {
    const testLocations = [
        { lat: 25.2048, lng: 55.2708, name: 'Dubai Center' },
        { lat: 25.3463, lng: 55.4209, name: 'Sharjah Center' },
        { lat: 25.4052, lng: 55.5136, name: 'Ajman Center' },
        { lat: 24.4539, lng: 54.3773, name: 'Abu Dhabi (outside)' }
    ];
    
    const results = testLocations.map(loc => {
        const validation = validateServiceArea(loc.lat, loc.lng);
        return {
            location: loc.name,
            coordinates: `${loc.lat}, ${loc.lng}`,
            isValid: validation.isValid,
            city: validation.city || 'Outside',
            distance: validation.distance || 'N/A'
        };
    });
    
    res.json({
        status: 'success',
        message: 'Location validation test results',
        results: results
    });
});

// Test endpoints
app.get('/test-gpt', async (req, res) => {
    try {
        const testMessage = "hi";
        const testSession = createUserSession();
        
        const response = await getGPTResponse(testMessage, testSession);
        
        res.json({
            status: 'success',
            message: 'GPT integration working!',
            testMessage: testMessage,
            response: response
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: 'GPT integration failed',
            error: error.message
        });
    }
});

app.get('/test-erpnext', async (req, res) => {
    try {
        const response = await axios.get(`${ERPNEXT_URL}/api/method/frappe.auth.get_logged_user`, {
            headers: {
                'Authorization': `token ${ERPNEXT_API_KEY}:${ERPNEXT_API_SECRET}`,
                'Content-Type': 'application/json'
            }
        });
        res.json({ 
            status: 'success', 
            message: 'ERPNext connection working!', 
            data: response.data 
        });
    } catch (error) {
        res.status(500).json({ 
            status: 'error', 
            message: 'ERPNext connection failed', 
            error: error.response?.data || error.message
        });
    }
});

// Analytics endpoint (enhanced)
app.get('/analytics', (req, res) => {
    const analytics = {
        totalSessions: userSessions.size,
        salesStages: {},
        topInterests: {},
        activeOrders: 0,
        locationsReceived: 0,
        manualAddresses: 0,
        smartOrderMatches: 0
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

// Test order endpoint
app.post('/test-order', async (req, res) => {
    try {
        const { phone = '+971501234567', product = 'single_bottle', address = 'Test Address, Dubai' } = req.body;
        
        const testSession = createUserSession();
        testSession.orderInProgress = {
            product: PRODUCTS[product],
            productKey: product,
            quantity: 1,
            customerPhone: phone,
            manualAddress: address,
            deliveryMethod: 'manual_address',
            areaValidation: validateManualAddress(address)
        };
        
        const result = await processOrder(testSession, phone);
        
        res.json({
            status: 'success',
            message: 'Test order processed',
            result: result
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: 'Test order failed',
            error: error.message
        });
    }
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

// Enhanced homepage
app.get('/', (req, res) => {
    const statusHtml = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Enhanced WhatsApp Bot - Smart Recognition + Dual Location System</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
            .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .status { padding: 20px; background: #e8f5e8; border-radius: 8px; margin: 20px 0; }
            .feature { margin: 15px 0; padding: 15px; background: #f8f8f8; border-radius: 6px; border-left: 4px solid #28a745; }
            .endpoint { margin: 10px 0; padding: 12px; background: #e3f2fd; border-radius: 6px; border-left: 4px solid #007bff; font-family: monospace; }
            .active { color: #28a745; font-weight: bold; }
            .inactive { color: #ffc107; }
            .new { color: #007bff; font-weight: bold; }
            h1 { color: #333; text-align: center; }
            h2, h3 { color: #007bff; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 20px 0; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>?? Enhanced WhatsApp Water Delivery Bot v4.1</h1>
            
            <div class="status">
                <h2>Status: <span class="active">DUAL LOCATION SYSTEM ENABLED</span></h2>
                <p><strong>Version:</strong> 4.1.0 (Smart Order Recognition + GPS + Manual Address)</p>
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
                    <h3>?? FLEXIBLE LOCATION SERVICES:</h3>
                    <div class="feature">? WhatsApp GPS location capture</div>
                    <div class="feature">? Manual address input option</div>
                    <div class="feature">? Service area validation (both methods)</div>
                    <div class="feature">? Coordinate storage in ERPNext</div>
                    <div class="feature">? Distance calculations & delivery optimization</div>
                </div>
            </div>

            <h3>?? SMART ORDER EXAMPLES:</h3>
            <div class="endpoint">"bottle" ? Single Bottle</div>
            <div class="endpoint">"coler" ? Premium Cooler</div>
            <div class="endpoint">"cupon" ? Coupon Book</div>
            <div class="endpoint">"1 btl pls" ? Single Bottle</div>
            <div class="endpoint">"need pump" ? Hand Pump</div>
            <div class="endpoint">"bulk pack" ? 100+40 Coupon</div>
            
            <h3>?? LOCATION OPTIONS:</h3>
            <div class="endpoint"><strong>GPS Location:</strong> Share location ? Instant GPS validation & coordinate storage</div>
            <div class="endpoint"><strong>Manual Address:</strong> Type address ? Area validation & address storage</div>
            <div class="endpoint"><strong>Service Areas:</strong> Dubai (50km), Sharjah (30km), Ajman (25km)</div>
            <div class="endpoint"><strong>Smart Detection:</strong> Automatically recognizes address format</div>

            <h3>?? TEST ENDPOINTS:</h3>
            <div class="endpoint"><strong>/test-smart-match</strong> - Test smart order recognition</div>
            <div class="endpoint"><strong>/test-location</strong> - Test GPS validation</div>
            <div class="endpoint"><strong>/test-manual-address</strong> - Test manual address validation</div>
            <div class="endpoint"><strong>/test-gpt</strong> - Test GPT integration</div>
            <div class="endpoint"><strong>/test-erpnext</strong> - Test ERPNext connection</div>
            <div class="endpoint"><strong>/analytics</strong> - Enhanced session analytics</div>
            
            <h3>?? ERPNEXT CUSTOM FIELDS:</h3>
            <div class="endpoint"><strong>GPS Fields:</strong> custom_latitude, custom_longitude, custom_location_name</div>
            <div class="endpoint"><strong>Manual Address Fields:</strong> custom_manual_address, custom_delivery_city</div>
            <div class="endpoint"><strong>Order Fields:</strong> custom_delivery_method, custom_address_confidence</div>
            <div class="endpoint"><strong>Validation Fields:</strong> custom_address_type, custom_address_validation</div>
            <div class="endpoint"><strong>Delivery Fields:</strong> custom_delivery_latitude, custom_delivery_longitude</div>
        </div>
    </body>
    </html>
    `;
    res.send(statusHtml);
});

app.listen(PORT, () => {
    console.log(`?? ENHANCED WhatsApp Water Delivery Bot v4.1 running on port ${PORT}`);
    console.log('? Smart Order Recognition + GPS Location + Manual Address + ERPNext Integration');
    console.log(`?? URL: http://localhost:${PORT}`);
    console.log('?? Features: Fuzzy Matching, Natural Language, Dual Location System, Complete Flexibility');
    
    if (!OPENAI_API_KEY) {
        console.warn('??  OPENAI_API_KEY not set');
    }
    
    if (!ERPNEXT_URL) {
        console.warn('??  ERPNEXT_URL not set');
    }
    
    startKeepAlive();
});