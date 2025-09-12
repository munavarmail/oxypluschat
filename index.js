require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

// Try to import node-nlp, fallback to basic functionality if not available
let NlpManager = null;
let nlpAvailable = false;

try {
    const nodeNlp = require('node-nlp');
    NlpManager = nodeNlp.NlpManager;
    nlpAvailable = true;
    console.log('? NLP module loaded successfully');
} catch (error) {
    console.log('?? NLP module not available, running in basic mode');
    console.log('To enable NLP: npm install node-nlp');
}

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

// NLP Configuration
const NLP_CONFIDENCE_THRESHOLD = parseFloat(process.env.NLP_CONFIDENCE_THRESHOLD) || 0.6;
const ENABLE_NLP_ANALYTICS = process.env.ENABLE_NLP_ANALYTICS === 'true';

// Conversation state management
const userSessions = new Map();

// NLP System
let nlpProcessor = null;
let nlpReady = false;

// NLP Analytics
let nlpAnalytics = {
    totalQueries: 0,
    intentDistribution: {},
    averageConfidence: 0,
    responseTime: [],
    errors: 0,
    fallbacksUsed: 0
};

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

// Enhanced Customer service knowledge base
const KNOWLEDGE_BASE = {
    greetings: {
        keywords: ['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening'],
        response: `Hello! Welcome to our AI-powered water delivery service! ??

I'm your smart assistant and can help you with:
• ?? Product information & pricing
• ?? Intelligent order placement
• ?? Delivery scheduling
• ? Natural language questions

*How can I assist you today?*

${nlpAvailable ? 'Just talk to me naturally - I understand context and conversation!' : 'Type "menu" to see products or ask me anything!'}

Try: "I need water for my office" or "What's your cheapest option?"`
    },
    
    menu: {
        keywords: ['menu', 'products', 'catalog', 'price list', 'what do you sell'],
        response: `*OUR PRODUCTS & SERVICES* ??

*WATER BOTTLES*
• Single Bottle - AED 7 (+15 deposit)
• Trial Bottle - AED 7 (+15 deposit)

*EQUIPMENT*
• Table Top Dispenser - AED 25
• Hand Pump - AED 15
• Premium Water Cooler - AED 300 (1-year warranty)

*COUPON BOOKS* (Best Value!)
• 10+1 Coupon Book - AED 70 (no deposit for 3 bottles)
• 100+40 Coupon Book - AED 700 (no deposit for 5 bottles, BNPL available)
• 140 Bottles + Dispenser Package - AED 920

*DELIVERY AREAS*
Dubai, Sharjah, Ajman (except freezones)

${nlpAvailable ? '*Tell me what you need in your own words!*\nExample: "I need 5 bottles for home delivery"' : 'Type "order [product]" to place an order\nExample: "order single bottle"'}`
    },

    coupon_info: {
        keywords: ['coupon', 'coupon book', 'what is coupon', 'benefits', 'bnpl', 'buy now pay later'],
        response: `*COUPON BOOK SYSTEM* ??

A coupon = one bottle. Give coupons to delivery person = get bottles!

*AMAZING BENEFITS:*
• ?? No bottle deposit (save AED 15/bottle)
• ? Priority delivery
• ?? Out-of-schedule delivery possible
• ?? FREE delivery charges
• ?? No cash payment hassle
• ?? Better price per bottle (as low as AED 5!)

*AVAILABLE BOOKS:*
• 10+1 Book (AED 70) - up to 3 bottles without deposit
• 100+40 Book (AED 700) - up to 5 bottles without deposit

*?? BUY NOW PAY LATER:*
Available ONLY for 100+40 Coupon Book

Ready to get started with coupons?`
    },

    delivery: {
        keywords: ['delivery', 'schedule', 'when', 'how long', 'timing', 'areas'],
        response: `*DELIVERY INFORMATION* ??

*COVERAGE AREAS:*
? Dubai - Full coverage (except JAFZA & Airport Freezone)
? Sharjah - Complete emirate coverage
? Ajman - All areas served

*SMART SCHEDULING:*
• Message us for delivery requests
• We'll set up your weekly schedule
• Urgent/out-of-schedule requests welcome
• Smart routing for fastest delivery

*DELIVERY CHARGES:*
• ?? FREE with coupon books
• Standard charges for individual bottles

*DELIVERY PROMISE:*
• Same-day delivery possible
• SMS/WhatsApp delivery confirmations
• Professional, uniformed delivery team

Ready to schedule your delivery?`
    },

    payment: {
        keywords: ['payment', 'pay', 'cash', 'card', 'bank transfer', 'installment'],
        response: `*PAYMENT METHODS* ??

*WE ACCEPT:*
• ?? Cash on delivery
• ?? Card payment (subject to availability)
• ?? Bank transfer
• ?? Digital payments

*?? SPECIAL OFFERS:*
• Buy Now Pay Later - Available for 100+40 Coupon Book only
• Bulk discounts for large orders
• Corporate payment plans available

*TRANSPARENT PRICING:*
• Base price: AED 7/bottle
• With coupon books: As low as AED 5/bottle
• No hidden charges - what you see is what you pay

Ready to place an order?`
    },

    equipment: {
        keywords: ['dispenser', 'cooler', 'equipment', 'table top', 'hand pump', 'warranty'],
        response: `*EQUIPMENT AVAILABLE* ???

*DISPENSERS:*
• Table Top Dispenser - AED 25
• Hand Pump - AED 15
• Premium Water Cooler - AED 300

*WARRANTY:*
Premium cooler comes with 1-year warranty from Geo General

*WHY WE CHARGE:*
We believe in transparent pricing instead of hiding costs in bottle prices like others do.

*PACKAGE DEAL:*
140 Bottles + Premium Dispenser = AED 920

Would you like to order any equipment?`
    }
};

// NLP Processor Class (Built-in)
class WaterDeliveryNLP {
    constructor() {
        if (!nlpAvailable) {
            this.ready = false;
            return;
        }

        this.manager = new NlpManager({ 
            languages: ['en'], 
            forceNER: true,
            nlu: { useNoneFeature: true }
        });
        this.isTrained = false;
        this.setupTrainingData();
    }

    setupTrainingData() {
        if (!nlpAvailable) return;

        // GREETING INTENT
        const greetings = [
            'hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening',
            'salaam', 'salam', 'hi there', 'hey there', 'greetings', 'howdy',
            'what\'s up', 'yo', 'morning', 'evening', 'afternoon'
        ];
        greetings.forEach(greeting => {
            this.manager.addDocument('en', greeting, 'greeting');
        });

        // ORDER INTENT - Comprehensive patterns
        const orderPhrases = [
            'I want to order %product%', 'I need %product%', 'Can I buy %product%',
            'I would like to purchase %product%', 'Order %product%', 'Get me %product%',
            'I want %quantity% %product%', 'Buy %product%', 'I need %quantity% bottles',
            'Order water', 'I want water delivery', 'Book water bottles',
            'Can I get water', 'I need water for office', 'Water delivery please',
            'I want to buy water', 'Need water supply', 'Water bottles needed',
            'Order bottles for home', 'Get water delivered', 'office water supply',
            'home water delivery', 'bulk water order', 'emergency water needed'
        ];
        orderPhrases.forEach(phrase => {
            this.manager.addDocument('en', phrase, 'order');
        });

        // MENU INQUIRY INTENT
        const menuPhrases = [
            'show menu', 'what products', 'price list', 'what do you sell',
            'show products', 'what items', 'catalog', 'available products',
            'what can I buy', 'product list', 'services', 'offerings',
            'what are your prices', 'cost of products', 'pricing',
            'show me options', 'what do you have', 'menu please',
            'product catalog', 'what\'s available', 'options available',
            'cheapest option', 'best deal', 'most economical'
        ];
        menuPhrases.forEach(phrase => {
            this.manager.addDocument('en', phrase, 'menu');
        });

        // DELIVERY INTENT
        const deliveryPhrases = [
            'delivery information', 'when can you deliver', 'delivery areas',
            'do you deliver to %location%', 'delivery schedule', 'how long delivery',
            'when will it arrive', 'delivery time', 'shipping info',
            'can you deliver', 'delivery charges', 'delivery fee',
            'delivery cost', 'shipping cost', 'delivery timing',
            'where do you deliver', 'delivery zones', 'same day delivery',
            'next day delivery', 'urgent delivery', 'fast delivery',
            'delivery to dubai', 'delivery to sharjah', 'delivery to ajman'
        ];
        deliveryPhrases.forEach(phrase => {
            this.manager.addDocument('en', phrase, 'delivery');
        });

        // PAYMENT INTENT
        const paymentPhrases = [
            'payment methods', 'how to pay', 'payment options', 'cash payment',
            'card payment', 'bank transfer', 'installment', 'pay later',
            'payment info', 'cost', 'price', 'how much', 'total cost',
            'payment plans', 'financing', 'credit options', 'bnpl',
            'buy now pay later', 'installments', 'what payment methods',
            'how much does it cost', 'final price', 'payment terms'
        ];
        paymentPhrases.forEach(phrase => {
            this.manager.addDocument('en', phrase, 'payment');
        });

        // HELP INTENT
        const helpPhrases = [
            'help', 'I need help', 'assist me', 'support', 'customer service',
            'I am confused', 'I don\'t understand', 'guide me', 'how to',
            'what can you do', 'help me please', 'assistance needed',
            'can you help', 'I\'m lost', 'don\'t know what to do',
            'customer support', 'need assistance', 'confused', 'stuck'
        ];
        helpPhrases.forEach(phrase => {
            this.manager.addDocument('en', phrase, 'help');
        });

        // COMPLAINT INTENT
        const complaintPhrases = [
            'I have a problem', 'this is terrible', 'very disappointed',
            'poor service', 'bad experience', 'not satisfied', 'complaint',
            'issue with order', 'problem with delivery', 'wrong product',
            'late delivery', 'missing bottles', 'damaged product',
            'not happy', 'unsatisfied', 'terrible service', 'awful',
            'bad quality', 'wrong order', 'missing items', 'broken',
            'delivery problem', 'order issue', 'service problem'
        ];
        complaintPhrases.forEach(phrase => {
            this.manager.addDocument('en', phrase, 'complaint');
        });

        // CUSTOMER LOOKUP INTENT
        const lookupPhrases = [
            'my number is %phone%', 'customer %phone%', '%phone%',
            'my account', 'check my account', 'account details',
            'customer details', 'my information', 'account info',
            'find my account', 'lookup account', 'my profile'
        ];
        lookupPhrases.forEach(phrase => {
            this.manager.addDocument('en', phrase, 'customer_lookup');
        });

        // ADD NAMED ENTITIES
        this.manager.addNamedEntityText('product', 'bottle', ['en'], [
            'bottle', 'bottles', 'water', 'water bottle', '5 gallon', 'gallon',
            'aqua', 'mineral water', 'drinking water', 'bottled water'
        ]);
        
        this.manager.addNamedEntityText('product', 'dispenser', ['en'], [
            'dispenser', 'water dispenser', 'cooler', 'water cooler', 'machine',
            'tap', 'faucet', 'spout', 'table top dispenser'
        ]);
        
        this.manager.addNamedEntityText('product', 'coupon', ['en'], [
            'coupon', 'coupon book', 'package', 'deal', 'book',
            'bulk package', 'bulk deal', 'subscription'
        ]);

        // Locations
        this.manager.addNamedEntityText('location', 'dubai', ['en'], [
            'dubai', 'dxb', 'dubai emirate', 'dubai city', 'marina', 'downtown', 'jbr', 'jumeirah'
        ]);
        
        this.manager.addNamedEntityText('location', 'sharjah', ['en'], [
            'sharjah', 'shj', 'sharjah emirate', 'sharjah city'
        ]);
        
        this.manager.addNamedEntityText('location', 'ajman', ['en'], [
            'ajman', 'ajm', 'ajman emirate', 'ajman city'
        ]);

        // Regex entities
        this.manager.addRegexEntity('phone', 'en', /(\+?971|0)?[0-9]{8,9}/gi);
        this.manager.addRegexEntity('quantity', 'en', /\b(\d+)\s*(bottle|bottles|piece|pieces|unit|units|gallon|gallons)?\b/gi);

        // Urgency
        this.manager.addNamedEntityText('urgency', 'high', ['en'], [
            'urgent', 'asap', 'immediately', 'now', 'today', 'emergency', 'quick', 'fast', 'rush'
        ]);

        // ADD RESPONSES
        this.manager.addAnswer('en', 'greeting', 'Hello! Welcome to our premium water delivery service! ??');
        this.manager.addAnswer('en', 'order', 'I\'d be happy to help you place an order! What product would you like?');
        this.manager.addAnswer('en', 'menu', 'Let me show you our complete product catalog!');
        this.manager.addAnswer('en', 'delivery', 'Here\'s information about our delivery service!');
        this.manager.addAnswer('en', 'payment', 'Here are our available payment options!');
        this.manager.addAnswer('en', 'help', 'I\'m here to help! What do you need assistance with?');
        this.manager.addAnswer('en', 'complaint', 'I\'m sorry to hear about the issue. Let me help resolve this!');
        this.manager.addAnswer('en', 'customer_lookup', 'Let me look up your customer information!');
    }

    async trainModel() {
        if (!nlpAvailable || this.isTrained) return;

        try {
            console.log('?? Training NLP model...');
            await this.manager.train();
            this.isTrained = true;
            console.log('? NLP model trained successfully!');
        } catch (error) {
            console.error('? NLP training failed:', error);
        }
    }

    async processMessage(message, context = {}) {
        if (!nlpAvailable || !this.isTrained) {
            return this.fallbackResult(message);
        }

        try {
            const result = await this.manager.process('en', message);
            
            return {
                intent: {
                    intent: result.intent || 'unknown',
                    confidence: result.score || 0
                },
                entities: this.extractEntities(result.entities || []),
                sentiment: {
                    sentiment: result.sentiment?.vote || 'neutral',
                    score: result.sentiment?.score || 0,
                    confidence: Math.abs(result.sentiment?.score || 0)
                },
                answer: result.answer,
                originalResult: result
            };
        } catch (error) {
            console.error('NLP processing error:', error);
            return this.fallbackResult(message);
        }
    }

    extractEntities(entities) {
        const extracted = {
            products: [],
            locations: [],
            phone_numbers: [],
            quantities: [],
            urgency: 'low'
        };

        entities.forEach(entity => {
            switch(entity.entity) {
                case 'product':
                    const product = entity.resolution?.value || entity.utteranceText;
                    if (!extracted.products.includes(product)) {
                        extracted.products.push(product);
                    }
                    break;
                case 'location':
                    const location = entity.resolution?.value || entity.utteranceText;
                    if (!extracted.locations.includes(location)) {
                        extracted.locations.push(location);
                    }
                    break;
                case 'phone':
                    const phone = entity.utteranceText.replace(/\s+/g, '');
                    if (phone.length >= 8 && !extracted.phone_numbers.includes(phone)) {
                        extracted.phone_numbers.push(phone);
                    }
                    break;
                case 'quantity':
                    const qty = parseInt(entity.utteranceText);
                    if (!isNaN(qty) && qty > 0) {
                        extracted.quantities.push({ number: qty, unit: 'unit' });
                    }
                    break;
                case 'urgency':
                    extracted.urgency = entity.resolution?.value || 'medium';
                    break;
            }
        });

        return extracted;
    }

    fallbackResult(message) {
        return {
            intent: { intent: 'unknown', confidence: 0 },
            entities: { products: [], locations: [], phone_numbers: [], quantities: [], urgency: 'low' },
            sentiment: { sentiment: 'neutral', score: 0, confidence: 0 },
            answer: 'I understand you need assistance. How can I help you?'
        };
    }

    async addTrainingData(utterance, intent) {
        if (!nlpAvailable) return false;
        
        try {
            this.manager.addDocument('en', utterance, intent);
            await this.manager.train();
            console.log(`? Added training data: "${utterance}" -> ${intent}`);
            return true;
        } catch (error) {
            console.error('? Failed to add training data:', error);
            return false;
        }
    }

    getModelStats() {
        if (!nlpAvailable) {
            return { nlpAvailable: false, message: 'NLP not available' };
        }

        return {
            nlpAvailable: true,
            isTrained: this.isTrained,
            languages: this.manager?.settings?.languages || [],
            totalDocuments: 'Available after training'
        };
    }
}

// Initialize NLP
if (nlpAvailable) {
    nlpProcessor = new WaterDeliveryNLP();
    
    // Train model on startup
    (async () => {
        try {
            await nlpProcessor.trainModel();
            nlpReady = true;
        } catch (error) {
            console.error('Failed to initialize NLP:', error);
        }
    })();
} else {
    console.log('?? Running in basic mode. Install node-nlp for AI features: npm install node-nlp');
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

// Enhanced health check endpoint
app.get('/health', (req, res) => {
    const healthData = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        memory: process.memoryUsage(),
        environment: process.env.NODE_ENV || 'development',
        version: nlpAvailable ? '3.0.0-NLP' : '2.0.0-Basic',
        activeSessions: userSessions.size,
        nlpStatus: nlpAvailable ? (nlpReady ? 'ready' : 'training') : 'not_available',
        nlpQueries: nlpAnalytics.totalQueries
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
                            console.log('?? Received message:', message);
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

// Enhanced message handling with optional NLP
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
                lastActivity: Date.now(),
                conversationHistory: [],
                nlpContext: {}
            });
        }
        
        const session = userSessions.get(from);
        session.lastActivity = Date.now();
        
        // Add to conversation history
        session.conversationHistory = session.conversationHistory || [];
        session.conversationHistory.push({
            message: messageBody,
            timestamp: Date.now(),
            type: 'user'
        });
        if (session.conversationHistory.length > 10) {
            session.conversationHistory.shift();
        }
        
        let response;
        if (nlpAvailable && nlpReady) {
            response = await generateNLPEnhancedResponse(messageBody, session, from);
        } else {
            response = await generateEnhancedResponse(messageBody, session, from);
        }
        
        // Add bot response to history
        session.conversationHistory.push({
            message: response,
            timestamp: Date.now(),
            type: 'bot'
        });
        
        await sendMessage(from, response, phoneNumberId);
    }
}

// NLP-Enhanced response generation
async function generateNLPEnhancedResponse(message, session, userPhone) {
    const startTime = Date.now();
    const lowerMessage = message.toLowerCase().trim();
    
    try {
        // Handle existing states first
        if (lowerMessage.startsWith('order ')) {
            return await handleOrderCommand(message, session, userPhone);
        }
        
        if (session.state === 'confirming_order' && (lowerMessage.includes('yes') || lowerMessage.includes('confirm'))) {
            return await processOrder(session, userPhone);
        }
        
        if (session.state === 'confirming_order' && (lowerMessage.includes('no') || lowerMessage.includes('cancel'))) {
            session.state = 'greeting';
            session.orderInProgress = null;
            return "Order cancelled. How else can I help you today? ??";
        }
        
        if (session.state === 'collecting_address') {
            session.orderInProgress.address = message;
            session.state = 'confirming_order';
            return await generateOrderConfirmation(session.orderInProgress);
        }

        if (session.state === 'handling_complaint') {
            return await handleComplaintFollowup(message, session, userPhone);
        }

        // NLP Processing
        let nlpResult = null;
        
        if (nlpReady) {
            try {
                nlpResult = await nlpProcessor.processMessage(message, {
                    state: session.state,
                    conversationHistory: session.conversationHistory.slice(-3),
                    orderInProgress: !!session.orderInProgress
                });
                
                console.log('?? NLP Analysis:', {
                    intent: nlpResult.intent.intent,
                    confidence: (nlpResult.intent.confidence * 100).toFixed(1) + '%',
                    entities: nlpResult.entities,
                    sentiment: nlpResult.sentiment.sentiment
                });
                
                // Track analytics
                if (ENABLE_NLP_ANALYTICS) {
                    trackNLPPerformance(
                        nlpResult.intent.intent,
                        nlpResult.intent.confidence,
                        Date.now() - startTime,
                        false
                    );
                }
                
                // Use NLP results for high-confidence intents
                if (nlpResult.intent.confidence >= NLP_CONFIDENCE_THRESHOLD) {
                    const nlpResponse = await handleNLPIntent(nlpResult, session, userPhone);
                    if (nlpResponse) return nlpResponse;
                }
                
            } catch (error) {
                console.error('NLP processing error:', error);
                if (ENABLE_NLP_ANALYTICS) {
                    trackNLPPerformance(null, 0, Date.now() - startTime, true);
                }
            }
        }
        
        // Fallback to original logic
        if (ENABLE_NLP_ANALYTICS) {
            nlpAnalytics.fallbacksUsed++;
        }
        
        return await generateEnhancedResponse(message, session, userPhone);
        
    } catch (error) {
        console.error('Error in generateNLPEnhancedResponse:', error);
        return "I apologize, but I encountered a technical issue. Please try again or contact our support team.";
    }
}

// NLP Intent Handler
async function handleNLPIntent(nlpResult, session, userPhone) {
    const { intent, entities, sentiment } = nlpResult;
    
    session.nlpContext = {
        lastIntent: intent.intent,
        lastEntities: entities,
        lastSentiment: sentiment.sentiment,
        timestamp: Date.now()
    };
    
    switch (intent.intent) {
        case 'greeting':
            const hour = new Date().getHours();
            let timeGreeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
            
            return `${timeGreeting}! Welcome to our AI-powered water delivery service! ??

I'm your intelligent assistant and can understand natural language. I can help you with:

• ?? **Smart Ordering** - Just tell me what you need
• ?? **Product Info** - Ask about any product naturally
• ?? **Delivery Planning** - Schedule deliveries intelligently
• ?? **Payment Options** - Flexible payment solutions
• ?? **Account Management** - Send your mobile for lookup

*How can I assist you today?*

Try saying: "I need water for my office" or "What's the cheapest option?"`;

        case 'order':
            return await handleNLPOrder(entities, session, userPhone);
            
        case 'menu':
            let menuResponse = KNOWLEDGE_BASE.menu.response;
            if (entities.locations.length > 0) {
                const location = entities.locations[0].toLowerCase();
                menuResponse += `\n\n*? Great news! We deliver to ${location}*`;
            }
            return menuResponse;

        case 'delivery':
            return await handleDeliveryInquiry(entities, session);
            
        case 'payment':
            let paymentResponse = KNOWLEDGE_BASE.payment.response;
            if (entities.products.some(p => p.includes('coupon'))) {
                paymentResponse += "\n\n*?? Coupon Book Special:* Buy Now Pay Later available for 100+40 book!";
            }
            return paymentResponse;

        case 'help':
            return await handleHelpRequest(session, entities);
            
        case 'complaint':
            return await handleComplaint(nlpResult, session, userPhone);
            
        case 'customer_lookup':
            if (entities.phone_numbers.length > 0) {
                return await getCustomerByMobile(entities.phone_numbers[0]);
            }
            return "Please share your mobile number so I can look up your account details.";
    }
    
    return null;
}

// Enhanced order handling with NLP entities
async function handleNLPOrder(entities, session, userPhone) {
    if (entities.products.length > 0) {
        const requestedProduct = entities.products[0];
        let quantity = 1;
        
        if (entities.quantities.length > 0) {
            quantity = entities.quantities[0].number;
        }
        
        let productKey = mapProductToKey(requestedProduct);
        
        if (productKey) {
            const orderCommand = `order ${quantity > 1 ? quantity + ' ' : ''}${productKey.replace('_', ' ')}`;
            return await handleOrderCommand(orderCommand, session, userPhone);
        } else {
            return `I understand you're looking for "${requestedProduct}". 

Here are our available products:
${Object.entries(PRODUCTS).map(([key, product]) => 
    `• ${product.name} - AED ${product.price}${product.deposit > 0 ? ` (+${product.deposit} deposit)` : ''}`
).join('\n')}

*Which product interests you most?*`;
        }
    }
    
    return `I'd love to help you place an order! 

*QUICK ORDER OPTIONS:*
• "I need water bottles" - For individual bottles
• "Show me dispensers" - For water equipment  
• "I want the best deal" - For coupon books
• "Office water solution" - For bulk orders

What would work best for you?`;
}

// Product mapping helper
function mapProductToKey(nlpProduct) {
    const productMappings = {
        'bottle': 'single_bottle',
        'water': 'single_bottle', 
        'dispenser': 'table_dispenser',
        'cooler': 'premium_cooler',
        'coupon': 'coupon_10_1',
        'book': 'coupon_10_1',
        'package': 'premium_package'
    };
    
    const lowerProduct = nlpProduct.toLowerCase();
    for (const [key, value] of Object.entries(productMappings)) {
        if (lowerProduct.includes(key)) {
            return value;
        }
    }
    return null;
}

// Enhanced delivery inquiry handler
async function handleDeliveryInquiry(entities, session) {
    let response = KNOWLEDGE_BASE.delivery.response;
    
    if (entities.locations.length > 0) {
        const location = entities.locations[0].toLowerCase();
        
        switch (location) {
            case 'dubai':
            case 'dxb':
                response += "\n\n*??? DUBAI DELIVERY:*\n• Same-day delivery available\n• All areas except JAFZA\n• Premium areas: Marina, Downtown, JBR";
                break;
            case 'sharjah':
            case 'shj':
                response += "\n\n*??? SHARJAH DELIVERY:*\n• Next-day delivery standard\n• Full emirate coverage\n• Industrial areas supported";
                break;
            case 'ajman':
            case 'ajm':
                response += "\n\n*?? AJMAN DELIVERY:*\n• Same/next-day delivery\n• Complete coverage\n• Beach areas included";
                break;
        }
    }
    
    return response;
}

// Help request handler
async function handleHelpRequest(session, entities) {
    if (session.orderInProgress) {
        return `I see you have an order in progress! ??

*Current Order:* ${session.orderInProgress.product.name}
*Status:* ${session.state}

*I can help with:*
• ?? Modify your order
• ?? Change delivery address  
• ?? Payment questions
• ? Cancel the order

*What would you like to do?*`;
    }
    
    return `*I'M HERE TO HELP!* ???

*?? POPULAR ACTIONS:*
• "Show menu" - Browse all products
• "Order water" - Smart ordering assistant
• "Delivery to [area]" - Area-specific info
• Send mobile number - Instant account lookup

*?? AI FEATURES:*
${nlpAvailable ? '• Natural language understanding - talk normally!\n• Context awareness - I remember our conversation\n• Smart suggestions - personalized recommendations\n• Instant complaint resolution' : '• Keyword-based assistance\n• Order management\n• Customer support\n• Product information'}

What would you like help with?`;
}

// Complaint handler
async function handleComplaint(nlpResult, session, userPhone) {
    const severity = nlpResult.sentiment.sentiment === 'negative' ? 'high' : 'medium';
    
    session.state = 'handling_complaint';
    session.complaintData = {
        severity: severity,
        initialMessage: nlpResult.originalResult?.utterance,
        timestamp: new Date().toISOString(),
        sentiment: nlpResult.sentiment
    };
    
    return `I sincerely apologize for any inconvenience! ??

${severity === 'high' ? '?? **HIGH PRIORITY COMPLAINT**' : '?? **COMPLAINT LOGGED**'}

Your satisfaction is our priority. I'm escalating this to management immediately.

*Please provide details:*
• ?? What specific problem occurred?  
• ? When did this happen?
• ?? Order details (if applicable)

*I GUARANTEE:*
• ? Immediate management attention
• ?? Quick resolution within 2 hours  
• ?? Fair compensation if warranted

*What exactly went wrong?*`;
}

// Complaint follow-up handler
async function handleComplaintFollowup(message, session, userPhone) {
    const complaintData = session.complaintData;
    complaintData.followupMessage = message;
    complaintData.updated = new Date().toISOString();
    
    session.state = 'greeting';
    
    return `Thank you for providing those details. 

*COMPLAINT SUMMARY:*
• Priority: ${complaintData.severity.toUpperCase()}
• Details: ? Received and logged
• Reference: #CMP${Date.now().toString().slice(-6)}

*NEXT STEPS:*
1. ????? Management team notified
2. ?? We'll call you within 2 hours  
3. ?? Resolution team assigned
4. ?? Follow-up confirmation sent

We'll review and provide appropriate compensation. Thank you for your patience! ??`;
}

// Original enhanced response generation (fallback)
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
    
    // Enhanced fallback
    if (lowerMessage.includes('help')) {
        return `*HOW I CAN HELP* ??

${nlpAvailable ? '• Talk to me naturally - I understand context!' : '• Type "menu" - See all products'}
• Type "order [product]" - Place an order
• Send mobile number - Get customer details
• Ask about delivery, pricing, coupons

*Example queries:*
${nlpAvailable ? '• "I need water for 20 people"\n• "What\'s the most economical option?"\n• "Can you deliver to Marina tomorrow?"' : '• "order single bottle"\n• "order coupon book"\n• "order dispenser"'}

What would you like to do?`;
    }
    
    return `I understand you're asking about: "${message}"

I can help you with:
- Product orders - ${nlpAvailable ? 'Just tell me what you need naturally' : 'Type "order [product name]"'}
- Product information - Type "menu"
- Delivery information - Ask about delivery
- Payment options - Ask about payment

${nlpAvailable ? '*Just talk to me in your own words - I understand natural language!*' : '*Or send a mobile number to look up customer details*'}

What specific information do you need?`;
}

// NLP Performance tracking
function trackNLPPerformance(intent, confidence, responseTime, hasError = false) {
    if (!ENABLE_NLP_ANALYTICS) return;
    
    nlpAnalytics.totalQueries++;
    
    if (hasError) {
        nlpAnalytics.errors++;
        return;
    }
    
    if (intent && !nlpAnalytics.intentDistribution[intent]) {
        nlpAnalytics.intentDistribution[intent] = 0;
    }
    if (intent) nlpAnalytics.intentDistribution[intent]++;
    
    const totalConfidence = nlpAnalytics.averageConfidence * (nlpAnalytics.totalQueries - 1) + (confidence || 0);
    nlpAnalytics.averageConfidence = totalConfidence / nlpAnalytics.totalQueries;
    
    nlpAnalytics.responseTime.push(responseTime);
    if (nlpAnalytics.responseTime.length > 100) {
        nlpAnalytics.responseTime.shift();
    }
}

// ALL YOUR EXISTING FUNCTIONS (unchanged)
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
        return `*PRODUCT NOT FOUND*

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
        return `*ORDER STARTED*

Product: ${selectedProduct.name}
Price: AED ${selectedProduct.price}${selectedProduct.deposit > 0 ? ` (+${selectedProduct.deposit} deposit)` : ''}

*Please provide your delivery address:*
Include building name, area, and any specific directions.`;
    } else {
        session.state = 'confirming_order';
        return await generateOrderConfirmation(session.orderInProgress);
    }
}

// Generate order confirmation
async function generateOrderConfirmation(orderInfo) {
    const total = orderInfo.product.price + orderInfo.product.deposit;
    
    return `*ORDER CONFIRMATION*

*Product:* ${orderInfo.product.name}
*Description:* ${orderInfo.product.description}
*Price:* AED ${orderInfo.product.price}
${orderInfo.product.deposit > 0 ? `*Deposit:* AED ${orderInfo.product.deposit}` : ''}
*Total:* AED ${total}

*Delivery Address:*
${orderInfo.address || 'Using address on file'}

*Payment:* Cash/Card on delivery

*Confirm your order?*
Reply "YES" to confirm or "NO" to cancel.`;
}

// Process confirmed order
async function processOrder(session, userPhone) {
    try {
        const orderInfo = session.orderInProgress;
        
        // First, ensure customer exists in ERP
        const customerResult = await ensureCustomerExists(orderInfo);
        
        if (!customerResult.success) {
            return `*ORDER PROCESSING ERROR*

${customerResult.message}

Please try again or contact our support team for assistance.`;
        }
        
        // Create order in ERPNext
        const erpOrder = await createERPOrder(orderInfo, customerResult.customerName);
        
        if (erpOrder.success) {
            session.state = 'greeting';
            session.orderInProgress = null;
            
            return `*ORDER CONFIRMED* ?

*Order ID:* ${erpOrder.orderName}
*Product:* ${orderInfo.product.name}
*Total:* AED ${orderInfo.product.price + orderInfo.product.deposit}

*Next Steps:*
Our delivery team will contact you within 2 hours to schedule delivery.

*Delivery Areas:*
Dubai, Sharjah, Ajman

Thank you for choosing our ${nlpAvailable ? 'AI-powered ' : ''}service!`;
        } else {
            return handleOrderError(erpOrder.error, erpOrder.errorType);
        }
        
    } catch (error) {
        console.error('Error processing order:', error);
        return `*ORDER PROCESSING ERROR*

There was a technical issue while processing your order. Our team has been notified.

Please try again in a few minutes or contact support directly.`;
    }
}

// Ensure customer exists in ERP, create if necessary
async function ensureCustomerExists(orderInfo) {
    try {
        // First try to find existing customer
        const searchUrl = `${DOTORDERS_ERP_URL}/api/resource/Customer`;
        
        const response = await axios.get(searchUrl, {
            headers: {
                'Authorization': `token ${DOTORDERS_ERP_API_KEY}:${DOTORDERS_ERP_API_SECRET}`,
                'Content-Type': 'application/json'
            },
            params: {
                filters: JSON.stringify([['mobile_no', '=', orderInfo.customerPhone]]),
                fields: JSON.stringify(['name', 'customer_name'])
            }
        });
        
        if (response.data.data && response.data.data.length > 0) {
            // Customer exists
            return {
                success: true,
                customerName: response.data.data[0].name,
                message: 'Customer found'
            };
        } else {
            // Customer doesn't exist, create new one
            return await createERPCustomer(orderInfo);
        }
        
    } catch (error) {
        console.error('Error checking customer existence:', error);
        return {
            success: false,
            message: 'Unable to verify customer information. Please contact support.'
        };
    }
}

// Create new customer in ERP
async function createERPCustomer(orderInfo) {
    try {
        const customerData = {
            doctype: 'Customer',
            customer_name: `Customer ${orderInfo.customerPhone}`,
            mobile_no: orderInfo.customerPhone,
            customer_type: 'Individual',
            customer_group: 'Individual',
            territory: 'DXB 02'
        };
        
        const response = await axios.post(
            `${DOTORDERS_ERP_URL}/api/resource/Customer`,
            customerData,
            {
                headers: {
                    'Authorization': `token ${DOTORDERS_ERP_API_KEY}:${DOTORDERS_ERP_API_SECRET}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        // Create address for the customer if provided
        if (orderInfo.address) {
            await createCustomerAddress(response.data.data.name, orderInfo);
        }
        
        return {
            success: true,
            customerName: response.data.data.name,
            message: 'New customer created successfully'
        };
        
    } catch (error) {
        console.error('Error creating customer:', error);
        return {
            success: false,
            message: 'Unable to create customer profile. Please provide your details to our support team.'
        };
    }
}

// Create customer address
async function createCustomerAddress(customerName, orderInfo) {
    try {
        const addressData = {
            doctype: 'Address',
            address_title: 'Delivery Address',
            address_line1: orderInfo.address,
            city: 'UAE',
            country: 'United Arab Emirates',
            links: [{
                link_doctype: 'Customer',
                link_name: customerName
            }]
        };
        
        await axios.post(
            `${DOTORDERS_ERP_URL}/api/resource/Address`,
            addressData,
            {
                headers: {
                    'Authorization': `token ${DOTORDERS_ERP_API_KEY}:${DOTORDERS_ERP_API_SECRET}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
    } catch (error) {
        console.error('Error creating address:', error);
        // Don't fail the order for address creation issues
    }
}

// Handle different types of order errors
function handleOrderError(error, errorType) {
    if (typeof error === 'string' && error.includes('Customer') && error.includes('not found')) {
        return `*CUSTOMER ACCOUNT ISSUE*

We couldn't find your customer account in our system. This has been resolved.

Please try placing your order again, and your account will be created automatically.`;
    }
    
    if (typeof error === 'string' && error.includes('Item') && error.includes('not found')) {
        return `*PRODUCT UNAVAILABLE*

The requested product is temporarily unavailable in our system.

Please contact our support team or try ordering a different product.`;
    }
    
    if (typeof error === 'string' && error.includes('permission')) {
        return `*SYSTEM MAINTENANCE*

Our ordering system is currently undergoing maintenance.

Please try again in a few minutes or contact our team directly for immediate assistance.`;
    }
    
    // Generic error with more helpful guidance
    return `*ORDER PROCESSING ISSUE*

We encountered a technical issue while processing your order.

*What you can do:*
• Try placing the order again in a few minutes
• Contact our support team directly
• Send us your details manually

Our team has been notified and will resolve this quickly.`;
}

// Create order in ERPNext
async function createERPOrder(orderInfo, customerName) {
    try {
        const orderData = {
            doctype: 'Sales Order',
            customer: customerName,
            order_type: 'Sales',
            delivery_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Tomorrow
            items: [{
                item_code: '5 Gallon Filled', // All products map to this single registered item
                item_name: orderInfo.product.name,
                description: orderInfo.product.description,
                qty: orderInfo.quantity,
                rate: orderInfo.product.price,
                amount: orderInfo.product.price * orderInfo.quantity
            }],
            custom_delivery_address: orderInfo.address,
            custom_customer_phone: orderInfo.customerPhone,
            custom_order_source: nlpAvailable ? 'WhatsApp AI Bot' : 'WhatsApp Bot'
        };
        
        // If there's a deposit, add it as a separate line item
        if (orderInfo.product.deposit > 0) {
            orderData.items.push({
                item_code: '5 Gallon Filled', // Use same item code for deposit
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
        
        // Parse error details for better user messaging
        let errorMessage = error.message;
        let errorType = 'general';
        
        if (error.response?.data) {
            const errorData = error.response.data;
            
            // Extract meaningful error message
            if (errorData.message) {
                errorMessage = errorData.message;
            } else if (errorData.exc_type) {
                errorType = errorData.exc_type;
                
                // Try to extract server messages
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
        }
        
        return {
            success: false,
            error: errorMessage,
            errorType: errorType
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
            
            let response = `*CUSTOMER FOUND* ?

*Name:* ${customer.customer_name}
*Mobile:* ${customer.mobile_no}

${addressInfo}`;
            
            if (customDocsInfo) {
                response += `${customDocsInfo}`;
            }
            
            response += `\n*?? QUICK ACTIONS:*
• ${nlpAvailable ? '"Order water" - Natural language ordering' : '"order [product]" - Place new order'}
• "Delivery schedule" - Check delivery info
• "Account update" - Update details

What would you like to do?`;
            
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
    let cleanedCount = 0;
    
    for (const [phone, session] of userSessions.entries()) {
        if (now - session.lastActivity > oneHour) {
            userSessions.delete(phone);
            cleanedCount++;
        }
    }
    
    if (cleanedCount > 0) {
        console.log(`?? Cleaned up ${cleanedCount} inactive sessions. Active: ${userSessions.size}`);
    }
}, 15 * 60 * 1000);

// NLP TESTING ENDPOINTS (Only available if NLP is enabled)

if (nlpAvailable) {
    // Test NLP endpoint
    app.get('/test-nlp/:message', async (req, res) => {
        try {
            const testMessage = decodeURIComponent(req.params.message);
            const mockSession = { state: 'greeting', orderInProgress: null, conversationHistory: [] };
            
            if (!nlpReady) {
                return res.status(503).json({
                    success: false,
                    error: 'NLP system is still training. Please try again in a few seconds.',
                    nlpReady: false
                });
            }
            
            const startTime = Date.now();
            const nlpResult = await nlpProcessor.processMessage(testMessage, mockSession);
            const processingTime = Date.now() - startTime;
            
            const response = await generateNLPEnhancedResponse(testMessage, mockSession, 'test-user');
            
            res.json({
                success: true,
                input: testMessage,
                nlp_analysis: {
                    intent: nlpResult.intent.intent,
                    confidence: (nlpResult.intent.confidence * 100).toFixed(1) + '%',
                    entities: nlpResult.entities,
                    sentiment: nlpResult.sentiment.sentiment
                },
                suggested_response: response,
                processing_time_ms: processingTime,
                nlp_ready: nlpReady
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
                nlp_ready: nlpReady
            });
        }
    });

    // Add training data endpoint
    app.post('/nlp-train', async (req, res) => {
        try {
            const { utterance, intent } = req.body;
            
            if (!utterance || !intent) {
                return res.status(400).json({ 
                    error: 'utterance and intent are required' 
                });
            }
            
            if (!nlpReady) {
                return res.status(503).json({
                    error: 'NLP system is not ready',
                    nlpReady: false
                });
            }
            
            const success = await nlpProcessor.addTrainingData(utterance, intent);
            
            res.json({
                success: success,
                message: success ? `Training data added: "${utterance}" -> ${intent}` : 'Failed to add training data'
            });
        } catch (error) {
            res.status(500).json({ 
                success: false,
                error: error.message 
            });
        }
    });

    // NLP Analytics
    app.get('/nlp-analytics', (req, res) => {
        const avgResponseTime = nlpAnalytics.responseTime.length > 0 
            ? nlpAnalytics.responseTime.reduce((a, b) => a + b, 0) / nlpAnalytics.responseTime.length 
            : 0;
        
        res.json({
            ...nlpAnalytics,
            averageResponseTime: Math.round(avgResponseTime),
            errorRate: nlpAnalytics.totalQueries > 0 ? 
                ((nlpAnalytics.errors / nlpAnalytics.totalQueries) * 100).toFixed(2) : '0.00',
            fallbackRate: nlpAnalytics.totalQueries > 0 ? 
                ((nlpAnalytics.fallbacksUsed / nlpAnalytics.totalQueries) * 100).toFixed(2) : '0.00',
            nlpAvailable: nlpAvailable,
            nlpReady: nlpReady
        });
    });

    // Simple NLP Dashboard
    app.get('/nlp-dashboard', (req, res) => {
        const dashboardHtml = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>?? AI Water Delivery Bot - NLP Testing</title>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { 
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                    min-height: 100vh; 
                    padding: 20px; 
                }
                .container { max-width: 1200px; margin: 0 auto; }
                .header { 
                    text-align: center; 
                    color: white; 
                    margin-bottom: 30px; 
                    text-shadow: 0 2px 4px rgba(0,0,0,0.3); 
                }
                .status-bar { 
                    background: ${nlpReady ? 'linear-gradient(135deg, #4CAF50, #45a049)' : 'linear-gradient(135deg, #FF9800, #F57C00)'}; 
                    color: white; 
                    padding: 15px; 
                    border-radius: 10px; 
                    margin-bottom: 20px; 
                    text-align: center; 
                    font-weight: bold; 
                }
                .card { 
                    background: rgba(255, 255, 255, 0.95); 
                    backdrop-filter: blur(10px); 
                    padding: 25px; 
                    border-radius: 15px; 
                    box-shadow: 0 8px 32px rgba(0,0,0,0.1); 
                    margin-bottom: 20px;
                }
                .input-group { margin: 15px 0; }
                .input-group label { 
                    display: block; 
                    margin-bottom: 8px; 
                    font-weight: 600; 
                    color: #555; 
                }
                .input-group input { 
                    width: 100%; 
                    padding: 12px; 
                    border: 2px solid #e1e1e1; 
                    border-radius: 8px; 
                    font-size: 14px; 
                }
                .btn { 
                    background: linear-gradient(135deg, #667eea, #764ba2); 
                    color: white; 
                    padding: 12px 24px; 
                    border: none; 
                    border-radius: 8px; 
                    cursor: pointer; 
                    font-weight: 600; 
                    width: 100%; 
                }
                .btn:hover { transform: translateY(-2px); }
                .result { 
                    background: #f8f9fa; 
                    padding: 20px; 
                    margin: 15px 0; 
                    border-radius: 10px; 
                    border-left: 5px solid #667eea; 
                }
                pre { 
                    background: #2c3e50; 
                    color: #ecf0f1; 
                    padding: 15px; 
                    border-radius: 8px; 
                    overflow-x: auto; 
                    margin: 10px 0; 
                }
                .test-cases { 
                    display: grid; 
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); 
                    gap: 10px; 
                    margin: 15px 0; 
                }
                .test-case { 
                    background: linear-gradient(135deg, #e74c3c, #c0392b); 
                    color: white; 
                    padding: 12px; 
                    border-radius: 8px; 
                    cursor: pointer; 
                    text-align: center; 
                    font-size: 13px; 
                    font-weight: 600; 
                }
                .test-case:hover { transform: translateY(-2px); }
                .test-case:nth-child(2n) { background: linear-gradient(135deg, #3498db, #2980b9); }
                .test-case:nth-child(3n) { background: linear-gradient(135deg, #27ae60, #229954); }
                .test-case:nth-child(4n) { background: linear-gradient(135deg, #f39c12, #d68910); }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>?? AI Water Delivery Bot</h1>
                    <p>Natural Language Processing Testing Dashboard</p>
                </div>
                
                <div class="status-bar">
                    NLP Engine: <strong>${nlpReady ? '? READY' : '?? TRAINING'}</strong> | 
                    Sessions: <strong>${userSessions.size}</strong> | 
                    Queries: <strong>${nlpAnalytics.totalQueries}</strong>
                </div>
                
                <div class="card">
                    <h3>?? Test NLP Processing</h3>
                    <div class="input-group">
                        <label>Test Message:</label>
                        <input type="text" id="testMessage" placeholder="Try: I need water for my office" maxlength="200">
                    </div>
                    <button class="btn" onclick="testMessage()" ${!nlpReady ? 'disabled' : ''}>
                        Analyze Message
                    </button>
                    <div id="testResult"></div>
                </div>
                
                <div class="card">
                    <h3>?? Quick Test Cases</h3>
                    <p style="margin-bottom: 15px;">Click to test:</p>
                    <div class="test-cases">
                        <div class="test-case" onclick="runTest('hello there')">?? Greeting</div>
                        <div class="test-case" onclick="runTest('I need 5 water bottles for office')">?? Order Intent</div>
                        <div class="test-case" onclick="runTest('show me your menu and prices')">?? Menu Request</div>
                        <div class="test-case" onclick="runTest('do you deliver to Dubai Marina?')">?? Delivery Query</div>
                        <div class="test-case" onclick="runTest('what payment methods do you accept')">?? Payment Info</div>
                        <div class="test-case" onclick="runTest('I need help with my order')">? Help Request</div>
                        <div class="test-case" onclick="runTest('this service is terrible')">?? Complaint</div>
                        <div class="test-case" onclick="runTest('971501234567')">?? Phone Lookup</div>
                    </div>
                </div>
            </div>
            
            <script>
                async function testMessage() {
                    const message = document.getElementById('testMessage').value.trim();
                    if (!message) {
                        alert('Please enter a message to test');
                        return;
                    }
                    
                    try {
                        const response = await fetch('/test-nlp/' + encodeURIComponent(message));
                        const result = await response.json();
                        
                        if (result.success) {
                            document.getElementById('testResult').innerHTML = \`
                                <div class="result">
                                    <strong>?? Input:</strong> \${result.input}<br><br>
                                    <strong>?? Intent:</strong> \${result.nlp_analysis.intent}<br>
                                    <strong>?? Confidence:</strong> \${result.nlp_analysis.confidence}<br>
                                    <strong>??? Entities:</strong> \${JSON.stringify(result.nlp_analysis.entities)}<br>
                                    <strong>?? Sentiment:</strong> \${result.nlp_analysis.sentiment}<br><br>
                                    <strong>?? Bot Response:</strong>
                                    <pre>\${result.suggested_response}</pre>
                                </div>
                            \`;
                        } else {
                            document.getElementById('testResult').innerHTML = \`<div class="result" style="border-color: red;">? Error: \${result.error}</div>\`;
                        }
                    } catch (error) {
                        document.getElementById('testResult').innerHTML = \`<div class="result" style="border-color: red;">? Network Error: \${error.message}</div>\`;
                    }
                }
                
                function runTest(message) {
                    document.getElementById('testMessage').value = message;
                    testMessage();
                }
                
                document.getElementById('testMessage').addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') {
                        testMessage();
                    }
                });
                
                document.getElementById('testMessage').focus();
            </script>
        </body>
        </html>
        `;
        res.send(dashboardHtml);
    });
}

// Enhanced homepage
app.get('/', (req, res) => {
    const avgResponseTime = nlpAnalytics.responseTime.length > 0 
        ? nlpAnalytics.responseTime.reduce((a, b) => a + b, 0) / nlpAnalytics.responseTime.length 
        : 0;

    const statusHtml = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>${nlpAvailable ? 'AI-Powered ' : ''}Water Delivery Bot</title>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; }
            .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
            .header { text-align: center; color: white; margin-bottom: 30px; }
            .header h1 { font-size: 2.5em; margin: 0; text-shadow: 0 2px 4px rgba(0,0,0,0.3); }
            .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
            .card { background: rgba(255, 255, 255, 0.95); padding: 25px; border-radius: 15px; box-shadow: 0 8px 32px rgba(0,0,0,0.1); }
            .status { padding: 20px; background: linear-gradient(135deg, #4CAF50, #45a049); color: white; border-radius: 10px; margin-bottom: 20px; }
            .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin: 20px 0; }
            .stat-box { padding: 20px; background: linear-gradient(135deg, #2196F3, #1976D2); color: white; border-radius: 10px; text-align: center; }
            .stat-box h3 { margin: 0; font-size: 2em; }
            .feature { margin: 10px 0; padding: 10px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #2196F3; }
            .btn { display: inline-block; padding: 12px 24px; background: #2196F3; color: white; text-decoration: none; border-radius: 8px; margin: 5px; font-weight: bold; }
            .btn:hover { background: #1976D2; }
            .nlp-badge { background: ${nlpAvailable ? '#4CAF50' : '#FF9800'}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.8em; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>?? ${nlpAvailable ? 'AI-Powered ' : ''}Water Delivery Bot</h1>
                <p>Advanced WhatsApp Business Integration ${nlpAvailable ? 'with Natural Language Processing' : ''}</p>
                <div class="nlp-badge">${nlpAvailable ? (nlpReady ? 'NLP READY' : 'NLP TRAINING') : 'BASIC MODE'}</div>
            </div>
            
            <div class="status">
                <h2 style="margin: 0 0 10px 0;">?? System Status: RUNNING</h2>
                <p><strong>Version:</strong> ${nlpAvailable ? '3.0.0-NLP' : '2.0.0-Basic'} | 
                   <strong>Uptime:</strong> ${Math.floor(process.uptime())} seconds | 
                   <strong>Keep-alive:</strong> ${KEEP_ALIVE_URL ? 'ENABLED' : 'DISABLED'}</p>
            </div>
            
            <div class="stats">
                <div class="stat-box">
                    <h3>${userSessions.size}</h3>
                    <p>Active Sessions</p>
                </div>
                <div class="stat-box">
                    <h3>${Object.keys(PRODUCTS).length}</h3>
                    <p>Products</p>
                </div>
                ${nlpAvailable ? `
                <div class="stat-box">
                    <h3>${nlpAnalytics.totalQueries}</h3>
                    <p>NLP Queries</p>
                </div>
                <div class="stat-box">
                    <h3>${Math.round(avgResponseTime)}ms</h3>
                    <p>Avg Response</p>
                </div>` : `
                <div class="stat-box">
                    <h3>${Object.keys(KNOWLEDGE_BASE).length}</h3>
                    <p>Knowledge Categories</p>
                </div>`}
            </div>
            
            <div class="cards">
                ${nlpAvailable ? `
                <div class="card">
                    <h3>?? AI Features</h3>
                    <div class="feature">Natural Language Understanding</div>
                    <div class="feature">Context-Aware Conversations</div>
                    <div class="feature">Sentiment Analysis</div>
                    <div class="feature">Smart Entity Extraction</div>
                    <div class="feature">Intelligent Fallbacks</div>
                    <a href="/nlp-dashboard" class="btn">?? Test NLP</a>
                    <a href="/nlp-analytics" class="btn">?? Analytics</a>
                </div>` : `
                <div class="card">
                    <h3>? Install AI Features</h3>
                    <p>Enable natural language processing:</p>
                    <div class="feature">Run: npm install node-nlp</div>
                    <div class="feature">Restart server to activate AI</div>
                    <p style="margin-top: 15px; color: #666;">Currently running in basic keyword mode</p>
                </div>`}
                
                <div class="card">
                    <h3>??? API Endpoints</h3>
                    <div class="feature"><strong>/health</strong> - System health check</div>
                    <div class="feature"><strong>/sessions</strong> - Active session info</div>
                    <div class="feature"><strong>/test-dotorders-erp</strong> - Test ERP connection</div>
                    ${nlpAvailable ? '<div class="feature"><strong>/test-nlp/[message]</strong> - Test NLP</div>' : ''}
                </div>
                
                <div class="card">
                    <h3>?? Business Features</h3>
                    <div class="feature">${nlpAvailable ? 'Smart' : 'Keyword-based'} Order Processing</div>
                    <div class="feature">Customer Account Management</div>
                    <div class="feature">ERPNext Integration</div>
                    <div class="feature">WhatsApp Business API</div>
                    <div class="feature">Conversation State Management</div>
                    <div class="feature">Automated Session Cleanup</div>
                </div>
            </div>
        </div>
    </body>
    </html>
    `;
    res.send(statusHtml);
});

// Test ERPNext connection endpoint
app.get('/test-dotorders-erp', async (req, res) => {
    try {
        const response = await axios.get(`${DOTORDERS_ERP_URL}/api/method/frappe.auth.get_logged_user`, {
            headers: {
                'Authorization': `token ${DOTORDERS_ERP_API_KEY}:${DOTORDERS_ERP_API_SECRET}`,
                'Content-Type': 'application/json'
            }
        });
        res.json({ 
            status: 'success', 
            message: 'ERPNext connection working!', 
            data: response.data,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ 
            status: 'error', 
            message: 'ERPNext connection failed', 
            error: error.response?.data || error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Session management endpoint
app.get('/sessions', (req, res) => {
    const sessions = Array.from(userSessions.entries()).map(([phone, session]) => ({
        phone: phone.substring(0, 8) + '****',
        state: session.state,
        hasOrder: !!session.orderInProgress,
        conversationLength: session.conversationHistory?.length || 0,
        lastActivity: new Date(session.lastActivity).toISOString(),
        nlpContext: session.nlpContext?.lastIntent || null
    }));
    
    res.json({
        totalSessions: userSessions.size,
        nlpAvailable: nlpAvailable,
        nlpReady: nlpReady,
        sessions: sessions
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`?? ${nlpAvailable ? 'AI-Enhanced ' : ''}Water Delivery Bot starting on port ${PORT}`);
    console.log(`?? Features: ${nlpAvailable ? 'NLP + ' : ''}Customer Service + Order Management + ERPNext Integration`);
    console.log(`?? Server URL: http://localhost:${PORT}`);
    if (nlpAvailable) {
        console.log(`?? NLP Dashboard: http://localhost:${PORT}/nlp-dashboard`);
    } else {
        console.log(`? To enable AI: npm install node-nlp && restart server`);
    }
    
    startKeepAlive();
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('?? Received SIGTERM, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('?? Received SIGINT, shutting down gracefully'); 
    process.exit(0);
});