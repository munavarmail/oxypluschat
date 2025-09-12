// NLP Module for Water Delivery Bot

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

// Configuration
const NLP_CONFIDENCE_THRESHOLD = parseFloat(process.env.NLP_CONFIDENCE_THRESHOLD) || 0.6;
const ENABLE_NLP_ANALYTICS = process.env.ENABLE_NLP_ANALYTICS === 'true';

// NLP System Variables
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

// NLP Processor Class
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

// Initialize NLP processor
function initializeNLP() {
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
}

// Process message with NLP (used by business logic)
async function processMessageWithNLP(message, userPhone) {
    if (!nlpAvailable || !nlpReady) {
        return {
            nlpAnalysis: null,
            response: null,
            usedNLP: false
        };
    }

    const startTime = Date.now();
    
    try {
        const nlpResult = await nlpProcessor.processMessage(message, {
            userPhone: userPhone
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
        
        // Format for testing endpoint
        const analysis = {
            intent: nlpResult.intent.intent,
            confidence: (nlpResult.intent.confidence * 100).toFixed(1) + '%',
            entities: nlpResult.entities,
            sentiment: nlpResult.sentiment.sentiment
        };
        
        return {
            nlpAnalysis: analysis,
            nlpResult: nlpResult,
            usedNLP: true,
            confidence: nlpResult.intent.confidence
        };
        
    } catch (error) {
        console.error('NLP processing error:', error);
        if (ENABLE_NLP_ANALYTICS) {
            trackNLPPerformance(null, 0, Date.now() - startTime, true);
            nlpAnalytics.fallbacksUsed++;
        }
        
        return {
            nlpAnalysis: null,
            response: null,
            usedNLP: false,
            error: error.message
        };
    }
}

// Get NLP status
function getNLPStatus() {
    return {
        nlpAvailable: nlpAvailable,
        nlpReady: nlpReady,
        totalQueries: nlpAnalytics.totalQueries
    };
}

// Get NLP analytics
function getNLPAnalytics() {
    const avgResponseTime = nlpAnalytics.responseTime.length > 0 
        ? nlpAnalytics.responseTime.reduce((a, b) => a + b, 0) / nlpAnalytics.responseTime.length 
        : 0;
    
    return {
        ...nlpAnalytics,
        averageResponseTime: Math.round(avgResponseTime),
        errorRate: nlpAnalytics.totalQueries > 0 ? 
            ((nlpAnalytics.errors / nlpAnalytics.totalQueries) * 100).toFixed(2) : '0.00',
        fallbackRate: nlpAnalytics.totalQueries > 0 ? 
            ((nlpAnalytics.fallbacksUsed / nlpAnalytics.totalQueries) * 100).toFixed(2) : '0.00',
        nlpAvailable: nlpAvailable,
        nlpReady: nlpReady
    };
}

// Export functions
module.exports = {
    initializeNLP,
    processMessageWithNLP,
    getNLPStatus,
    getNLPAnalytics,
    NLP_CONFIDENCE_THRESHOLD
};