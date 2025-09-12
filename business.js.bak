// Business Logic Module for Water Delivery Bot

const { processMessageWithNLP, getNLPStatus, NLP_CONFIDENCE_THRESHOLD } = require('./nlp');
const { getCustomerByMobile, createOrder } = require('./erp');

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

Just talk to me naturally - I understand context and conversation!

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

*Tell me what you need in your own words!*
Example: "I need 5 bottles for home delivery"`
    },

    coupon_info: {
        keywords: ['coupon', 'coupon book', 'what is coupon', 'benefits', 'bnpl', 'buy now pay later'],
        response: `*COUPON BOOK SYSTEM* ??

A coupon = one bottle. Give coupons to delivery person = get bottles!

*AMAZING BENEFITS:*
• ?? No bottle deposit (save AED 15/bottle)
• ? Priority delivery
• ? Out-of-schedule delivery possible
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
• FREE with coupon books
• Standard charges for individual bottles

*DELIVERY PROMISE:*
• Same-day delivery possible
• ?? SMS/WhatsApp delivery confirmations
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
        response: `*EQUIPMENT AVAILABLE* ??

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

// Conversation state management
const userSessions = new Map();

// Main message handler
async function handleMessage(userPhone, messageBody) {
    const lowerMessage = messageBody.toLowerCase().trim();
    
    // Get or create user session
    if (!userSessions.has(userPhone)) {
        userSessions.set(userPhone, {
            state: 'greeting',
            orderInProgress: null,
            customerInfo: null,
            lastActivity: Date.now(),
            conversationHistory: [],
            nlpContext: {},
            lastBotAction: null // Track what the bot last asked for
        });
    }
    
    const session = userSessions.get(userPhone);
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
    const nlpStatus = getNLPStatus();
    
    if (nlpStatus.nlpAvailable && nlpStatus.nlpReady) {
        response = await generateNLPEnhancedResponse(messageBody, session, userPhone);
    } else {
        response = await generateEnhancedResponse(messageBody, session, userPhone);
    }
    
    // Add bot response to history
    session.conversationHistory.push({
        message: response,
        timestamp: Date.now(),
        type: 'bot'
    });
    
    return response;
}

// Check if message is a confirmation (yes/no response)
function isConfirmation(message) {
    const lowerMessage = message.toLowerCase().trim();
    const yesPatterns = ['yes', 'yeah', 'yep', 'sure', 'ok', 'okay', 'confirm', 'proceed', 'continue'];
    const noPatterns = ['no', 'nah', 'nope', 'cancel', 'stop', 'abort', 'quit'];
    
    return {
        isYes: yesPatterns.some(pattern => lowerMessage.includes(pattern)),
        isNo: noPatterns.some(pattern => lowerMessage.includes(pattern)),
        isConfirmationResponse: yesPatterns.some(pattern => lowerMessage.includes(pattern)) || 
                               noPatterns.some(pattern => lowerMessage.includes(pattern))
    };
}

// NLP-Enhanced response generation
async function generateNLPEnhancedResponse(message, session, userPhone) {
    const lowerMessage = message.toLowerCase().trim();
    
    try {
        // Handle state-based responses first
        const stateResponse = await handleStateBasedResponse(message, session, userPhone);
        if (stateResponse) return stateResponse;
        
        // Handle order commands
        if (lowerMessage.startsWith('order ')) {
            return await handleOrderCommand(message, session, userPhone);
        }

        // NLP Processing for non-state messages
        let nlpResult = null;
        
        try {
            const nlpProcessing = await processMessageWithNLP(message, userPhone);
            
            if (nlpProcessing.usedNLP && nlpProcessing.confidence >= NLP_CONFIDENCE_THRESHOLD) {
                const nlpResponse = await handleNLPIntent(nlpProcessing.nlpResult, session, userPhone);
                if (nlpResponse) return nlpResponse;
            }
            
        } catch (error) {
            console.error('NLP processing error:', error);
        }
        
        // Fallback to original logic
        return await generateEnhancedResponse(message, session, userPhone);
        
    } catch (error) {
        console.error('Error in generateNLPEnhancedResponse:', error);
        return "I apologize, but I encountered a technical issue. Please try again or contact our support team.";
    }
}

// Handle state-based responses (FIXED DELIVERY SCHEDULING)
async function handleStateBasedResponse(message, session, userPhone) {
    const confirmation = isConfirmation(message);
    
    switch (session.state) {
        case 'confirming_order':
            if (confirmation.isYes) {
                return await processOrder(session, userPhone);
            } else if (confirmation.isNo) {
                session.state = 'greeting';
                session.orderInProgress = null;
                session.lastBotAction = null;
                return "Order cancelled. How else can I help you today?";
            }
            break;
            
        case 'collecting_address':
            session.orderInProgress.address = message;
            session.state = 'confirming_order';
            session.lastBotAction = 'order_confirmation';
            return await generateOrderConfirmation(session.orderInProgress);
            
        case 'scheduling_delivery':
            if (confirmation.isYes) {
                session.state = 'collecting_delivery_details';
                session.lastBotAction = 'delivery_details_request';
                return `Perfect! I'll help you schedule delivery.

*DELIVERY SCHEDULING*

Please provide:
• Your delivery address (building name, area)
• Preferred time (morning/afternoon/evening)
• Any special instructions

Example: "Marina Plaza, Tower A, Dubai Marina. Morning delivery preferred."

What are your delivery details?`;
            } else if (confirmation.isNo) {
                session.state = 'greeting';
                session.lastBotAction = null;
                return "No problem! Is there anything else I can help you with today?";
            } else {
                // User provided address/details instead of yes/no
                session.state = 'delivery_scheduled';
                session.lastBotAction = 'delivery_confirmation';
                return await handleDeliveryScheduling(message, session, userPhone);
            }
            break;
            
        case 'collecting_delivery_details':
            return await handleDeliveryScheduling(message, session, userPhone);
            
        case 'handling_complaint':
            return await handleComplaintFollowup(message, session, userPhone);
            
        case 'awaiting_product_selection':
            return await handleProductSelection(message, session, userPhone);
    }
    
    return null; // No state-based response needed
}

// Handle delivery scheduling
async function handleDeliveryScheduling(message, session, userPhone) {
    const deliveryInfo = {
        address: message,
        timestamp: new Date().toISOString(),
        customerPhone: userPhone
    };
    
    session.state = 'greeting';
    session.lastBotAction = null;
    
    return `*DELIVERY SCHEDULED* ?

*Details Received:*
${message}

*Next Steps:*
• Our scheduling team will contact you within 2 hours
• You'll receive ?? SMS/WhatsApp confirmation
• We'll coordinate the best delivery time
• Professional uniformed delivery team assigned

*Need to place an order?*
Just tell me what products you need!

*Delivery Areas Confirmed:*
Dubai, Sharjah, Ajman (except freezones)

Is there anything else I can help you with?`;
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
            session.state = 'greeting';
            session.lastBotAction = 'greeting';
            const hour = new Date().getHours();
            let timeGreeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
            
            return `${timeGreeting}! Welcome to our AI-powered water delivery service! ??

I'm your intelligent assistant and can understand natural language. I can help you with:

• ?? *Smart Ordering* - Just tell me what you need
• ?? *Product Info* - Ask about any product naturally
• ?? *Delivery Planning* - Schedule deliveries intelligently
• ?? *Payment Options* - Flexible payment solutions
• ?? *Account Management* - Send your mobile for lookup

*How can I assist you today?*

Try saying: "I need water for my office" or "What's the cheapest option?"`;

        case 'order':
            return await handleNLPOrder(entities, session, userPhone);
            
        case 'menu':
            session.lastBotAction = 'menu_shown';
            let menuResponse = KNOWLEDGE_BASE.menu.response;
            if (entities.locations.length > 0) {
                const location = entities.locations[0].toLowerCase();
                menuResponse += `\n\n*? Great news! We deliver to ${location}*`;
            }
            return menuResponse;

        case 'delivery':
            session.state = 'scheduling_delivery';
            session.lastBotAction = 'delivery_info_request';
            return await handleDeliveryInquiry(entities, session);
            
        case 'payment':
            session.lastBotAction = 'payment_info_shown';
            let paymentResponse = KNOWLEDGE_BASE.payment.response;
            if (entities.products.some(p => p.includes('coupon'))) {
                paymentResponse += "\n\n*?? Coupon Book Special:* Buy Now Pay Later available for 100+40 book!";
            }
            return paymentResponse;

        case 'help':
            session.lastBotAction = 'help_provided';
            return await handleHelpRequest(session, entities);
            
        case 'complaint':
            return await handleComplaint(nlpResult, session, userPhone);
            
        case 'customer_lookup':
            if (entities.phone_numbers.length > 0) {
                session.lastBotAction = 'customer_lookup';
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
            session.state = 'awaiting_product_selection';
            session.lastBotAction = 'product_options_shown';
            return `I understand you're looking for "${requestedProduct}". 

Here are our available products:
${Object.entries(PRODUCTS).map(([key, product]) => 
    `• ${product.name} - AED ${product.price}${product.deposit > 0 ? ` (+${product.deposit} deposit)` : ''}`
).join('\n')}

*Which product interests you most?*
Just tell me the name or say something like "I want the single bottle" or "Show me dispensers"`;
        }
    }
    
    session.state = 'awaiting_product_selection';
    session.lastBotAction = 'order_options_shown';
    return `I'd love to help you place an order! 

*QUICK ORDER OPTIONS:*
• "I need water bottles" - For individual bottles
• "Show me dispensers" - For water equipment  
• "I want the best deal" - For coupon books
• "Office water solution" - For bulk orders

What would work best for you?`;
}

// Handle product selection from options
async function handleProductSelection(message, session, userPhone) {
    const lowerMessage = message.toLowerCase();
    
    let selectedProductKey = null;
    let selectedProduct = null;
    
    for (const [key, product] of Object.entries(PRODUCTS)) {
        if (lowerMessage.includes(key.replace('_', ' ')) || 
            lowerMessage.includes(product.name.toLowerCase()) ||
            (key.includes('bottle') && (lowerMessage.includes('bottle') || lowerMessage.includes('water'))) ||
            (key.includes('dispenser') && lowerMessage.includes('dispenser')) ||
            (key.includes('cooler') && lowerMessage.includes('cooler')) ||
            (key.includes('coupon') && (lowerMessage.includes('coupon') || lowerMessage.includes('deal') || lowerMessage.includes('best')))) {
            selectedProduct = product;
            selectedProductKey = key;
            break;
        }
    }
    
    if (selectedProduct) {
        // Use stored quantity if available, otherwise default to 1
        const quantity = session.tempQuantity || 1;
        const orderCommand = `order ${quantity > 1 ? quantity + ' ' : ''}${selectedProductKey.replace('_', ' ')}`;
        // Clear temp quantity
        delete session.tempQuantity;
        return await handleOrderCommand(orderCommand, session, userPhone);
    } else {
        return `I'm not sure which product you're referring to. Could you be more specific?

*Available products:*
${Object.entries(PRODUCTS).map(([key, product], index) => 
    `${index + 1}. ${product.name} - AED ${product.price}${product.deposit > 0 ? ` (+${product.deposit} deposit)` : ''}`
).join('\n')}

You can say something like "I want number 1" or just the product name.`;
    }
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
        'package': 'premium_package',
        'deal': 'coupon_100_40',
        'best': 'coupon_100_40'
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
                response += "\n\n*?? DUBAI DELIVERY:*\n• Same-day delivery available\n• All areas except JAFZA\n• Premium areas: Marina, Downtown, JBR";
                break;
            case 'sharjah':
            case 'shj':
                response += "\n\n*?? SHARJAH DELIVERY:*\n• Next-day delivery standard\n• Full emirate coverage\n• Industrial areas supported";
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
    
    const nlpStatus = getNLPStatus();
    return `*I'M HERE TO HELP!* ??

*? POPULAR ACTIONS:*
• "Show menu" - Browse all products
• "Order water" - Smart ordering assistant
• "Delivery to [area]" - Area-specific info
• Send mobile number - Instant account lookup

*?? AI FEATURES:*
${nlpStatus.nlpAvailable ? '• Natural language understanding - talk normally!\n• Context awareness - I remember our conversation\n• Smart suggestions - personalized recommendations\n• Instant complaint resolution' : '• Keyword-based assistance\n• Order management\n• Customer support\n• Product information'}

What would you like help with?`;
}

// Complaint handler
async function handleComplaint(nlpResult, session, userPhone) {
    const severity = nlpResult.sentiment.sentiment === 'negative' ? 'high' : 'medium';
    
    session.state = 'handling_complaint';
    session.lastBotAction = 'complaint_handling';
    session.complaintData = {
        severity: severity,
        initialMessage: nlpResult.originalResult?.utterance,
        timestamp: new Date().toISOString(),
        sentiment: nlpResult.sentiment
    };
    
    return `I sincerely apologize for any inconvenience! ??

${severity === 'high' ? '?? *HIGH PRIORITY COMPLAINT*' : '?? *COMPLAINT LOGGED*'}

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
    session.lastBotAction = null;
    
    return `Thank you for providing those details. 

*COMPLAINT SUMMARY:*
• Priority: ${complaintData.severity.toUpperCase()}
• Details: ? Received and logged
• Reference: #CMP${Date.now().toString().slice(-6)}

*NEXT STEPS:*
1. ?? Management team notified
2. ?? We'll call you within 2 hours  
3. ?? Resolution team assigned
4. ?? Follow-up confirmation sent

We'll review and provide appropriate compensation. Thank you for your patience! ??`;
}

// Original enhanced response generation (fallback)
async function generateEnhancedResponse(message, session, userPhone) {
    const lowerMessage = message.toLowerCase().trim();
    
    // Handle state-based responses first
    const stateResponse = await handleStateBasedResponse(message, session, userPhone);
    if (stateResponse) return stateResponse;
    
    // Handle order commands
    if (lowerMessage.startsWith('order ')) {
        return await handleOrderCommand(message, session, userPhone);
    }
    
    // Check mobile number for customer lookup
    const mobileRegex = /(\+?\d{1,4})?[0-9]{8,15}/;
    const mobileMatch = message.match(mobileRegex);
    
    if (mobileMatch && lowerMessage.length < 20) {
        let mobileNumber = mobileMatch[0].trim();
        console.log(`Processing mobile number: ${mobileNumber}`);
        session.lastBotAction = 'customer_lookup';
        return await getCustomerByMobile(mobileNumber);
    }
    
    // Check knowledge base
    for (const [category, info] of Object.entries(KNOWLEDGE_BASE)) {
        if (info.keywords.some(keyword => lowerMessage.includes(keyword))) {
            session.lastBotAction = category;
            if (category === 'delivery') {
                session.state = 'scheduling_delivery';
            }
            return info.response;
        }
    }
    
    // Enhanced fallback
    if (lowerMessage.includes('help')) {
        session.lastBotAction = 'help_provided';
        const nlpStatus = getNLPStatus();
        return `*HOW I CAN HELP* ??

${nlpStatus.nlpAvailable ? '• Talk to me naturally - I understand context!' : '• Type "menu" - See all products'}
• Type "order [product]" - Place an order
• Send mobile number - Get customer details
• Ask about delivery, pricing, coupons

*Example queries:*
${nlpStatus.nlpAvailable ? '• "I need water for 20 people"\n• "What\'s the most economical option?"\n• "Can you deliver to Marina tomorrow?"' : '• "order single bottle"\n• "order coupon book"\n• "order dispenser"'}

What would you like to do?`;
    }
    
    return `I understand you're asking about: "${message}"

I can help you with:
- Product orders - Just tell me what you need naturally
- Product information - Type "menu"
- Delivery information - Ask about delivery
- Payment options - Ask about payment

*Just talk to me in your own words - I understand natural language!*

What specific information do you need?`;
}

// Handle order commands
async function handleOrderCommand(message, session, userPhone) {
    const orderText = message.substring(6).toLowerCase().trim(); // Remove "order "
    
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
        session.state = 'awaiting_product_selection';
        session.lastBotAction = 'product_options_shown';
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
        session.lastBotAction = 'address_request';
        return `*ORDER STARTED*

Product: ${selectedProduct.name}
Price: AED ${selectedProduct.price}${selectedProduct.deposit > 0 ? ` (+${selectedProduct.deposit} deposit)` : ''}

*Please provide your delivery address:*
Include building name, area, and any specific directions.`;
    } else {
        session.state = 'confirming_order';
        session.lastBotAction = 'order_confirmation';
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
        const result = await createOrder(orderInfo);
        
        if (result.success) {
            session.state = 'greeting';
            session.orderInProgress = null;
            session.lastBotAction = null;
            return result.message;
        } else {
            return result.message;
        }
        
    } catch (error) {
        console.error('Error processing order:', error);
        return `*ORDER PROCESSING ERROR*

There was a technical issue while processing your order. Our team has been notified.

Please try again in a few minutes or contact support directly.`;
    }
}

// Get business data for dashboard
function getBusinessData() {
    return {
        activeSessions: userSessions.size,
        productsCount: Object.keys(PRODUCTS).length,
        knowledgeBaseCount: Object.keys(KNOWLEDGE_BASE).length
    };
}

// Get user sessions for API
function getUserSessions() {
    return Array.from(userSessions.entries()).map(([phone, session]) => ({
        phone: phone.substring(0, 8) + '****',
        state: session.state,
        hasOrder: !!session.orderInProgress,
        conversationLength: session.conversationHistory?.length || 0,
        lastActivity: new Date(session.lastActivity).toISOString(),
        nlpContext: session.nlpContext?.lastIntent || null,
        lastBotAction: session.lastBotAction || null
    }));
}

// Session cleanup (remove inactive sessions after 1 hour)
function cleanupSessions() {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    let cleanedCount = 0;
    
    for (const [phone, session] of userSessions.entries()) {
        if (now - session.lastActivity > oneHour) {
            userSessions.delete(phone);
            cleanedCount++;
        }
    }
    
    return cleanedCount;
}

// Export functions and constants
module.exports = {
    handleMessage,
    getBusinessData,
    getUserSessions,
    cleanupSessions,
    PRODUCTS,
    KNOWLEDGE_BASE,
    handleOrderCommand,
    generateOrderConfirmation,
    processOrder
};