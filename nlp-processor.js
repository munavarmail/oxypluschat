// nlp-processor.js - Create this as a separate file
const { NlpManager } = require('node-nlp');

class WaterDeliveryNLP {
    constructor() {
        this.manager = new NlpManager({ 
            languages: ['en'], 
            forceNER: true,
            nlu: { useNoneFeature: true }
        });
        this.isTrained = false;
        this.setupTrainingData();
    }

    setupTrainingData() {
        // GREETING INTENT
        const greetings = [
            'hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening',
            'salaam', 'salam', 'hi there', 'hey there', 'greetings'
        ];
        greetings.forEach(greeting => {
            this.manager.addDocument('en', greeting, 'greeting');
        });

        // ORDER INTENT
        const orderPhrases = [
            'I want to order %product%',
            'I need %product%',
            'Can I buy %product%',
            'I would like to purchase %product%',
            'Order %product%',
            'Get me %product%',
            'I want %quantity% %product%',
            'Buy %product%',
            'I need %quantity% bottles',
            'Order water',
            'I want water delivery',
            'Book water bottles'
        ];
        orderPhrases.forEach(phrase => {
            this.manager.addDocument('en', phrase, 'order');
        });

        // MENU INQUIRY INTENT
        const menuPhrases = [
            'show menu', 'what products', 'price list', 'what do you sell',
            'show products', 'what items', 'catalog', 'available products',
            'what can I buy', 'product list', 'services', 'offerings'
        ];
        menuPhrases.forEach(phrase => {
            this.manager.addDocument('en', phrase, 'menu');
        });

        // DELIVERY INTENT
        const deliveryPhrases = [
            'delivery information', 'when can you deliver', 'delivery areas',
            'do you deliver to %location%', 'delivery schedule', 'how long delivery',
            'when will it arrive', 'delivery time', 'shipping info',
            'can you deliver', 'delivery charges', 'delivery fee'
        ];
        deliveryPhrases.forEach(phrase => {
            this.manager.addDocument('en', phrase, 'delivery');
        });

        // PAYMENT INTENT
        const paymentPhrases = [
            'payment methods', 'how to pay', 'payment options', 'cash payment',
            'card payment', 'bank transfer', 'installment', 'pay later',
            'payment info', 'cost', 'price', 'how much'
        ];
        paymentPhrases.forEach(phrase => {
            this.manager.addDocument('en', phrase, 'payment');
        });

        // HELP INTENT
        const helpPhrases = [
            'help', 'I need help', 'assist me', 'support', 'customer service',
            'I am confused', 'I don\'t understand', 'guide me', 'how to',
            'what can you do', 'help me please'
        ];
        helpPhrases.forEach(phrase => {
            this.manager.addDocument('en', phrase, 'help');
        });

        // COMPLAINT INTENT
        const complaintPhrases = [
            'I have a problem', 'this is terrible', 'very disappointed',
            'poor service', 'bad experience', 'not satisfied', 'complaint',
            'issue with order', 'problem with delivery', 'wrong product',
            'late delivery', 'missing bottles', 'damaged product'
        ];
        complaintPhrases.forEach(phrase => {
            this.manager.addDocument('en', phrase, 'complaint');
        });

        // CUSTOMER LOOKUP INTENT (for phone numbers)
        this.manager.addDocument('en', 'my number is %phone%', 'customer_lookup');
        this.manager.addDocument('en', 'customer %phone%', 'customer_lookup');
        this.manager.addDocument('en', '%phone%', 'customer_lookup');

        // ADD NAMED ENTITIES
        // Products
        this.manager.addNamedEntityText('product', 'bottle', ['en'], [
            'bottle', 'bottles', 'water', 'water bottle', '5 gallon', 'gallon'
        ]);
        this.manager.addNamedEntityText('product', 'dispenser', ['en'], [
            'dispenser', 'water dispenser', 'cooler', 'water cooler', 'machine'
        ]);
        this.manager.addNamedEntityText('product', 'coupon', ['en'], [
            'coupon', 'coupon book', 'package', 'deal', 'book'
        ]);

        // Locations
        this.manager.addNamedEntityText('location', 'dubai', ['en'], [
            'dubai', 'dxb', 'dubai emirate'
        ]);
        this.manager.addNamedEntityText('location', 'sharjah', ['en'], [
            'sharjah', 'shj', 'sharjah emirate'
        ]);
        this.manager.addNamedEntityText('location', 'ajman', ['en'], [
            'ajman', 'ajm', 'ajman emirate'
        ]);

        // Phone numbers
        this.manager.addRegexEntity('phone', 'en', /(\+?971|0)?[0-9]{8,9}/gi);

        // Quantities
        this.manager.addRegexEntity('quantity', 'en', /\b(\d+)\b/gi);

        // ADD RESPONSES
        this.manager.addAnswer('en', 'greeting', 'Hello! Welcome to our water delivery service! How can I help you today?');
        this.manager.addAnswer('en', 'order', 'I\'d be happy to help you place an order! What product would you like?');
        this.manager.addAnswer('en', 'menu', 'Let me show you our product catalog and prices.');
        this.manager.addAnswer('en', 'delivery', 'Here\'s information about our delivery service.');
        this.manager.addAnswer('en', 'payment', 'Here are our available payment options.');
        this.manager.addAnswer('en', 'help', 'I\'m here to help! What do you need assistance with?');
        this.manager.addAnswer('en', 'complaint', 'I\'m sorry to hear about the issue. Let me help resolve this right away.');
        this.manager.addAnswer('en', 'customer_lookup', 'Let me look up your customer information.');
    }

    async trainModel() {
        if (!this.isTrained) {
            console.log('Training NLP model...');
            await this.manager.train();
            this.isTrained = true;
            console.log('? NLP model trained successfully!');
        }
    }

    async processMessage(message, context = {}) {
        if (!this.isTrained) {
            await this.trainModel();
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
                    score: result.sentiment?.score || 0
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
            quantities: []
        };

        entities.forEach(entity => {
            switch(entity.entity) {
                case 'product':
                    extracted.products.push(entity.resolution?.value || entity.utteranceText);
                    break;
                case 'location':
                    extracted.locations.push(entity.resolution?.value || entity.utteranceText);
                    break;
                case 'phone':
                    extracted.phone_numbers.push(entity.utteranceText);
                    break;
                case 'quantity':
                    const qty = parseInt(entity.utteranceText);
                    if (!isNaN(qty)) {
                        extracted.quantities.push({ number: qty, unit: 'unit' });
                    }
                    break;
            }
        });

        return extracted;
    }

    fallbackResult(message) {
        return {
            intent: { intent: 'unknown', confidence: 0 },
            entities: { products: [], locations: [], phone_numbers: [], quantities: [] },
            sentiment: { sentiment: 'neutral', score: 0 },
            answer: 'I understand you need assistance. How can I help you?'
        };
    }

    // Add training data dynamically
    async addTrainingData(utterance, intent) {
        this.manager.addDocument('en', utterance, intent);
        await this.manager.train();
        console.log(`? Added training data: "${utterance}" -> ${intent}`);
    }

    // Get model statistics
    getModelStats() {
        return {
            isTrained: this.isTrained,
            languages: this.manager.settings.languages,
            intents: this.manager.nluManager?.domainManagers?.en?.intentDomains || {}
        };
    }
}

module.exports = WaterDeliveryNLP;


// INTEGRATION INTO YOUR EXISTING CHATBOT
// Add this to your main chatbot file:

/*
// At the top of your main file
const WaterDeliveryNLP = require('./nlp-processor');

// Initialize NLP (add this after your existing initializations)
const nlpProcessor = new WaterDeliveryNLP();

// Enhanced generateEnhancedResponse function (replace your existing one)
async function generateEnhancedResponse(message, session, userPhone) {
    const lowerMessage = message.toLowerCase().trim();
    
    // Keep existing direct command handling
    if (lowerMessage.startsWith('order ')) {
        return await handleOrderCommand(message, session, userPhone);
    }
    
    if (session.state === 'confirming_order' && (lowerMessage.includes('yes') || lowerMessage.includes('confirm'))) {
        return await processOrder(session, userPhone);
    }
    
    if (session.state === 'confirming_order' && (lowerMessage.includes('no') || lowerMessage.includes('cancel'))) {
        session.state = 'greeting';
        session.orderInProgress = null;
        return "Order cancelled. How else can I help you today?";
    }
    
    if (session.state === 'collecting_address') {
        session.orderInProgress.address = message;
        session.state = 'confirming_order';
        return await generateOrderConfirmation(session.orderInProgress);
    }
    
    // NEW: NLP Processing
    try {
        const nlpResult = await nlpProcessor.processMessage(message, session);
        
        console.log('?? NLP Analysis:', {
            intent: nlpResult.intent.intent,
            confidence: nlpResult.intent.confidence.toFixed(2),
            entities: nlpResult.entities
        });
        
        // Use NLP results for high-confidence intents
        if (nlpResult.intent.confidence > 0.6) {
            const response = await handleNLPIntent(nlpResult, session, userPhone);
            if (response) return response;
        }
        
    } catch (error) {
        console.error('NLP error:', error);
    }
    
    // Fallback to existing keyword-based logic
    const mobileRegex = /(\+?\d{1,4})?[0-9]{8,15}/;
    const mobileMatch = message.match(mobileRegex);
    
    if (mobileMatch && lowerMessage.length < 20) {
        let mobileNumber = mobileMatch[0].trim();
        return await getCustomerByMobile(mobileNumber);
    }
    
    for (const [category, info] of Object.entries(KNOWLEDGE_BASE)) {
        if (info.keywords.some(keyword => lowerMessage.includes(keyword))) {
            return info.response;
        }
    }
    
    return `I understand you're asking about: "${message}"

*I can help you with:*
• ?? Product orders - "order water bottles"
• ?? Product menu - "show menu"  
• ?? Delivery info - "delivery areas"
• ?? Payment options - "payment methods"
• ?? Account lookup - Send your mobile number

*What would you like to know?*`;
}

// NLP Intent Handler
async function handleNLPIntent(nlpResult, session, userPhone) {
    const { intent, entities, sentiment } = nlpResult;
    
    switch (intent.intent) {
        case 'greeting':
            return KNOWLEDGE_BASE.greetings.response;
            
        case 'order':
            if (entities.products.length > 0) {
                const product = entities.products[0];
                let orderCommand = `order ${product}`;
                
                if (entities.quantities.length > 0) {
                    orderCommand = `order ${entities.quantities[0].number} ${product}`;
                }
                
                return await handleOrderCommand(orderCommand, session, userPhone);
            }
            return "I'd love to help you place an order! What product would you like? Type 'menu' to see all options.";
            
        case 'menu':
            return KNOWLEDGE_BASE.menu.response;
            
        case 'delivery':
            return KNOWLEDGE_BASE.delivery.response;
            
        case 'payment':
            return KNOWLEDGE_BASE.payment.response;
            
        case 'help':
            return KNOWLEDGE_BASE.greetings.response.replace('Hello!', 'I\'m here to help!');
            
        case 'complaint':
            session.state = 'handling_complaint';
            return `I sincerely apologize for any inconvenience! ??

I'm here to resolve this immediately. Please tell me:
• What specific problem occurred?
• When did this happen?
• Your order details (if applicable)

I'll escalate this to our management team right away.`;
            
        case 'customer_lookup':
            if (entities.phone_numbers.length > 0) {
                return await getCustomerByMobile(entities.phone_numbers[0]);
            }
            break;
    }
    
    return null;
}
*/