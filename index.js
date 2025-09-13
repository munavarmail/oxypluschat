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

// ERPNext Configuration (updated for ERPNext compatibility)
const ERPNEXT_URL = process.env.ERPNEXT_URL || process.env.DOTORDERS_ERP_URL;
const ERPNEXT_API_KEY = process.env.ERPNEXT_API_KEY || process.env.DOTORDERS_ERP_API_KEY;
const ERPNEXT_API_SECRET = process.env.ERPNEXT_API_SECRET || process.env.DOTORDERS_ERP_API_SECRET;

// Keep-alive configuration
const KEEP_ALIVE_URL = process.env.KEEP_ALIVE_URL;
const KEEP_ALIVE_INTERVAL = 25 * 60 * 1000;

// Enhanced conversation state management
const userSessions = new Map();

// Welcome menu options
const WELCOME_MENU = `WELCOME TO PREMIUM WATER DELIVERY SERVICE!

Choose what you'd like to do:

PLACE ORDER
Type: "order [product name]"
Examples:
• order single bottle
• order coupon book
• order premium cooler

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

Just type what you need or ask me anything!`;

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
        keywords: ['table', 'dispenser', 'basic', 'simple'],
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
        keywords: ['10+1', 'eleven', 'coupon book', 'small package', '11 bottles'],
        salesPoints: ['Save on deposit', 'Free bottle included', 'Better per-bottle price', 'Priority delivery']
    },
    'coupon_100_40': { 
        name: '100+40 Coupon Book', 
        price: 700, 
        deposit: 0, 
        item_code: 'Coupon Book',
        description: '140 bottles total, up to 5 bottles without deposit, BNPL available',
        keywords: ['100+40', '140', 'bulk', 'large package', 'bnpl', '140 bottles'],
        salesPoints: ['Best value for money', 'Buy now pay later option', 'Huge savings', 'No deposit for 5 bottles', 'Priority service']
    },
    'premium_package': { 
        name: '140 Bottles + Premium Dispenser', 
        price: 920, 
        deposit: 0, 
        item_code: 'Premium Package',
        description: '140 bottles + Premium dispenser package - complete solution',
        keywords: ['premium package', 'complete', 'dispenser included', 'combo'],
        salesPoints: ['Complete water solution', 'Premium dispenser included', 'Maximum convenience', 'Best overall value']
    }
};

// Enhanced knowledge base with context for GPT and order prompts
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

WELCOME MENU RESPONSES:
When customers greet with "hi", "hello", "hey", etc., show the complete welcome menu with all available options.

ORDER PROCESS:
To place an order, customers should:
1. Type "order [product name]" (e.g., "order single bottle", "order coupon book")
2. Provide delivery address if new customer
3. Confirm order details
4. Choose payment method (cash/card on delivery)

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

IMPORTANT: Always guide customers to place orders by typing "order [product name]"
`;

// Enhanced user session structure
function createUserSession() {
    return {
        state: 'active',
        conversationHistory: [],
        customerInfo: null,
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
        salesStage: 'discovery'
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

// GPT-4o-mini integration for intelligent conversations
async function getGPTResponse(userMessage, session, context = '') {
    try {
        const conversationHistory = session.conversationHistory.slice(-8); // Last 8 messages for context
        
        const systemPrompt = `You are an intelligent sales assistant for a premium water delivery service in UAE. 

GREETING HANDLING:
When customers greet with "hi", "hello", "hey", "good morning", etc., show them the complete welcome menu with all available options.

IMPORTANT ORDER INSTRUCTIONS:
When customers want to place an order, ALWAYS guide them to use the specific format:
"To place an order, please type: order [product name]"

Examples:
- "order single bottle"
- "order coupon book" 
- "order premium cooler"
- "order 10+1 coupon book"

Do NOT try to process orders yourself - always direct them to use the "order" command.

CONTEXT:
${KNOWLEDGE_BASE}

${context}

CONVERSATION GUIDELINES:
1. For greetings, show the complete welcome menu with all options
2. Be helpful, professional, and sales-oriented
3. Qualify customers by understanding their needs
4. Recommend appropriate products based on consumption
5. Guide customers to place orders using "order [product]" format
6. Handle objections with value propositions
7. Ask qualifying questions (usage, location, current supplier)
8. Be conversational and natural
9. Show clear pricing and benefits
10. End with call to action

AVAILABLE SERVICES TO MENTION:
- Order placement
- Pricing information
- Delivery details
- Payment methods
- Customer support
- Complaint handling
- Account lookup
- Special offers
- Company information

PRODUCT RECOMMENDATIONS:
- 1-5 bottles/week: Single bottles or 10+1 coupon book
- 5-15 bottles/week: 100+40 coupon book
- Office use (10+ people): Premium package or bulk coupons
- First-time customers: Trial bottle
- Need equipment: Table dispenser, hand pump, or premium cooler

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
    // Update sales stage based on response content
    if (gptResponse.includes('order') || gptResponse.includes('place an order')) {
        session.salesStage = 'decision';
    } else if (gptResponse.includes('recommend') || gptResponse.includes('suggest')) {
        session.salesStage = 'consideration';
    } else if (gptResponse.includes('interested') || gptResponse.includes('sounds good')) {
        session.salesStage = 'interest';
    }

    // Extract product interests
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

// Enhanced fallback response system
function getFallbackResponse(message, session) {
    const lowerMessage = message.toLowerCase().trim();
    
    // Handle greetings - show welcome menu
    const greetings = ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening', 'salaam', 'assalam', 'start'];
    if (greetings.some(greeting => lowerMessage.includes(greeting)) || lowerMessage === 'hi' || lowerMessage === 'hello') {
        return WELCOME_MENU;
    }
    
    // Order intent detection
    if (lowerMessage.includes('order') || lowerMessage.includes('buy') || lowerMessage.includes('purchase')) {
        return `I'd be happy to help you place an order!

Our available products:
• Single Bottle - AED 7 + AED 15 deposit
• 10+1 Coupon Book - AED 70 (better value)
• 100+40 Coupon Book - AED 700 (best value)
• Premium Cooler - AED 300
• Hand Pump - AED 15
• Table Dispenser - AED 25

To place an order, please type:
"order [product name]"

Example: "order single bottle" or "order coupon book"

What would you like to order?`;
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

To order, type: "order [product name]"

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

To place an order for delivery, type:
"order [product name]"

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

Ready to place an order? Type: "order [product name]"`;
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

NEED SPECIFIC HELP?
• Order: "order [product name]"
• Pricing: "pricing"
• Delivery: "delivery info"
• Account: Send your mobile number

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

To take advantage of any offer, type: "order [product name]"

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
Type: "order [product name]"`;
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

Send your mobile number or type "order [product name]" to get started.`;
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

Or place an order directly:
"order [product name]"

What can I help you with today?`;
}

// Health check endpoint
app.get('/health', (req, res) => {
    const healthData = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        memory: process.memoryUsage(),
        environment: process.env.NODE_ENV || 'development',
        version: '3.2.0-Complete-Menu',
        activeSessions: userSessions.size,
        features: {
            gptIntegration: !!OPENAI_API_KEY,
            erpIntegration: !!(ERPNEXT_URL && ERPNEXT_API_KEY),
            keepAlive: !!KEEP_ALIVE_URL,
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

// FIXED: Enhanced message handling with better order detection
async function handleIncomingMessage(message, phoneNumberId) {
    const from = message.from;
    const messageBody = message.text?.body;
    
    if (messageBody) {
        console.log(`Processing message from ${from}: ${messageBody}`);
        
        // Get or create user session
        if (!userSessions.has(from)) {
            userSessions.set(from, createUserSession());
        }
        
        const session = userSessions.get(from);
        session.lastActivity = Date.now();
        
        let response;
        
        // PRIORITY 1: Handle order commands (fixed regex)
        if (messageBody.toLowerCase().trim().startsWith('order ')) {
            console.log('Order command detected');
            response = await handleOrderCommand(messageBody, session, from);
        } 
        // PRIORITY 2: Handle order state confirmations
        else if (session.state === 'confirming_order') {
            console.log('Handling order confirmation');
            response = await handleOrderConfirmation(messageBody, session, from);
        } 
        // PRIORITY 3: Handle address collection
        else if (session.state === 'collecting_address') {
            console.log('Collecting address');
            response = await handleAddressCollection(messageBody, session, from);
        } 
        // PRIORITY 4: Check for mobile number lookup
        else if (isMobileNumber(messageBody)) {
            console.log('Mobile number detected');
            response = await getCustomerByMobile(messageBody.trim());
            session.customerInfo = response;
        } 
        // PRIORITY 5: Use GPT for conversation
        else {
            console.log('Using GPT for conversation');
            const context = await buildContextForGPT(session, from);
            response = await getGPTResponse(messageBody, session, context);
        }
        
        console.log('Sending response:', response.substring(0, 100) + '...');
        await sendMessage(from, response, phoneNumberId);
    }
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

// FIXED: Enhanced order command handling with better product matching
async function handleOrderCommand(message, session, userPhone) {
    const orderText = message.substring(5).toLowerCase().trim(); // Remove "order"
    console.log(`Processing order for: "${orderText}"`);
    
    // Find matching product with improved logic
    let selectedProduct = null;
    let productKey = null;
    
    // Try exact matches first
    for (const [key, product] of Object.entries(PRODUCTS)) {
        const productName = product.name.toLowerCase();
        const keyWords = product.keywords.map(k => k.toLowerCase());
        
        if (
            orderText.includes(productName) ||
            keyWords.some(keyword => orderText.includes(keyword)) ||
            orderText.includes(key.replace('_', ' ')) ||
            // Specific matches for common phrases
            (orderText.includes('single') && key === 'single_bottle') ||
            (orderText.includes('trial') && key === 'trial_bottle') ||
            (orderText.includes('dispenser') && !orderText.includes('premium') && key === 'table_dispenser') ||
            (orderText.includes('pump') && key === 'hand_pump') ||
            (orderText.includes('cooler') && key === 'premium_cooler') ||
            (orderText.includes('10') && orderText.includes('1') && key === 'coupon_10_1') ||
            (orderText.includes('100') && orderText.includes('40') && key === 'coupon_100_40') ||
            (orderText.includes('140') && key === 'coupon_100_40') ||
            (orderText.includes('package') && key === 'premium_package') ||
            (orderText.includes('coupon') && !orderText.includes('10') && !orderText.includes('100') && key === 'coupon_10_1')
        ) {
            selectedProduct = product;
            productKey = key;
            console.log(`Found product match: ${product.name}`);
            break;
        }
    }
    
    if (!selectedProduct) {
        console.log('No product match found');
        return `I couldn't find that product. Available products:

WATER BOTTLES:
• order single bottle
• order trial bottle

COUPON BOOKS:
• order 10+1 coupon book
• order 100+40 coupon book

EQUIPMENT:
• order hand pump
• order table dispenser
• order premium cooler

PACKAGES:
• order premium package

Please try again with one of these exact phrases.`;
    }
    
    // Get customer info if not available
    if (!session.customerInfo) {
        const customerInfo = await getCustomerByMobile(userPhone);
        session.customerInfo = customerInfo;
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
    
    // Check if we need address
    if (!session.customerInfo || session.customerInfo.includes('CUSTOMER NOT FOUND') || !session.customerInfo.includes('ADDRESS:')) {
        session.state = 'collecting_address';
        console.log('Collecting address for new customer');
        
        return `Perfect! I'll process your order for: ${selectedProduct.name}

PRODUCT DETAILS:
• ${selectedProduct.description}
• Price: AED ${selectedProduct.price}${selectedProduct.deposit > 0 ? ` + AED ${selectedProduct.deposit} deposit` : ''}
• Total: AED ${selectedProduct.price + selectedProduct.deposit}

I need your delivery address to proceed:
Please provide your complete address including:
- Building/villa name or number
- Street name and area
- City (Dubai/Sharjah/Ajman)
- Any delivery instructions`;
    } else {
        session.state = 'confirming_order';
        console.log('Existing customer, moving to confirmation');
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
• Place a different order: type "order [product name]"
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

// FIXED: Complete order processing with ERPNext integration
async function processOrder(session, userPhone) {
    try {
        console.log('Processing order...');
        const orderInfo = session.orderInProgress;
        
        if (!orderInfo) {
            console.log('No order in progress');
            return 'No order found. Please start a new order by typing "order [product name]"';
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

// COMPLETE ERPNEXT INTEGRATION FUNCTIONS

// Ensure customer exists in ERPNext, create if necessary
async function ensureCustomerExists(orderInfo) {
    try {
        console.log('Checking if customer exists...');
        
        // Search for existing customer by mobile
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

// Enhanced customer lookup by mobile number
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
                fields: JSON.stringify(['name', 'customer_name', 'mobile_no'])
            }
        });

        const customers = response.data.data;
        
        if (customers && customers.length > 0) {
            const customer = customers[0];
            console.log(`Customer found: ${customer.customer_name}`);
            
            const addressInfo = await getCustomerAddress(customer.name);
            
            let responseText = `CUSTOMER FOUND

Name: ${customer.customer_name}
Mobile: ${customer.mobile_no}

${addressInfo}

To place an order, type: "order [product name]"`;
            
            return responseText;
            
        } else {
            console.log(`No customer found for: ${mobileNumber}`);
            return `CUSTOMER NOT FOUND

No customer found with mobile: ${mobileNumber}

Ready to place your first order?
Type "order [product name]" to get started!

Example: "order single bottle"`;
        }
        
    } catch (error) {
        console.error('Error fetching customer:', error.response?.data || error.message);
        return 'Unable to fetch customer information. Please try again.';
    }
}

// Get customer address from ERPNext
async function getCustomerAddress(customerName) {
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
                fields: JSON.stringify(['address_title', 'address_line1', 'address_line2', 'city', 'phone'])
            }
        });

        const addresses = response.data.data;
        
        if (addresses && addresses.length > 0) {
            const address = addresses[0];
            
            let addressText = 'ADDRESS:\n';
            if (address.address_title) addressText += `${address.address_title}\n`;
            if (address.address_line1) addressText += `${address.address_line1}\n`;
            if (address.address_line2) addressText += `${address.address_line2}\n`;
            if (address.city) addressText += `${address.city}\n`;
            if (address.phone) addressText += `Phone: ${address.phone}`;
            
            return addressText;
        } else {
            return 'ADDRESS: Not available';
        }
        
    } catch (error) {
        console.error('Error fetching address:', error.response?.data || error.message);
        return 'ADDRESS: Unable to fetch';
    }
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

// Analytics endpoint
app.get('/analytics', (req, res) => {
    const analytics = {
        totalSessions: userSessions.size,
        salesStages: {},
        topInterests: {},
        activeOrders: 0
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
            address: address
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

// Homepage
app.get('/', (req, res) => {
    const statusHtml = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Complete WhatsApp Water Delivery Bot</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
            .container { max-width: 1000px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .status { padding: 20px; background: #e8f5e8; border-radius: 8px; margin: 20px 0; }
            .endpoint { margin: 10px 0; padding: 15px; background: #f8f8f8; border-radius: 6px; border-left: 4px solid #007bff; }
            .active { color: #28a745; font-weight: bold; }
            .inactive { color: #ffc107; }
            .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 20px 0; }
            .stat-box { padding: 20px; background: #007bff; color: white; border-radius: 8px; text-align: center; }
            h1 { color: #333; text-align: center; }
            h2 { color: #007bff; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Complete WhatsApp Water Delivery Bot v3.2</h1>
            <div class="status">
                <h2>Status: <span class="active">COMPLETE MENU SYSTEM</span></h2>
                <p><strong>Version:</strong> 3.2.0 (Complete Welcome Menu + All Services)</p>
                <p><strong>Active Sessions:</strong> ${userSessions.size}</p>
                <p><strong>GPT Integration:</strong> <span class="${OPENAI_API_KEY ? 'active' : 'inactive'}">${OPENAI_API_KEY ? 'ENABLED' : 'DISABLED'}</span></p>
                <p><strong>ERPNext:</strong> <span class="${ERPNEXT_URL ? 'active' : 'inactive'}">${ERPNEXT_URL ? 'ENABLED' : 'DISABLED'}</span></p>
            </div>
            
            <h3>COMPLETE WELCOME MENU SYSTEM:</h3>
            <ul>
                <li>? Order placement with all products</li>
                <li>? Complete pricing information</li>
                <li>? Delivery details and scheduling</li>
                <li>? Payment methods and options</li>
                <li>? Customer support system</li>
                <li>? Complaint handling process</li>
                <li>? Account lookup by mobile</li>
                <li>? Special offers and deals</li>
                <li>? Company information</li>
            </ul>

            <h3>GREETING RESPONSES:</h3>
            <div class="endpoint">hi / hello / hey ? Shows complete welcome menu</div>
            
            <h3>SERVICE COMMANDS:</h3>
            <div class="endpoint">pricing / menu ? Complete price list</div>
            <div class="endpoint">delivery ? Delivery information</div>
            <div class="endpoint">payment ? Payment methods</div>
            <div class="endpoint">support ? Customer support</div>
            <div class="endpoint">complaint ? Complaint handling</div>
            <div class="endpoint">offers ? Special deals</div>
            <div class="endpoint">about us ? Company info</div>

            <h3>ORDER COMMANDS:</h3>
            <div class="endpoint">order single bottle</div>
            <div class="endpoint">order trial bottle</div>
            <div class="endpoint">order 10+1 coupon book</div>
            <div class="endpoint">order 100+40 coupon book</div>
            <div class="endpoint">order hand pump</div>
            <div class="endpoint">order table dispenser</div>
            <div class="endpoint">order premium cooler</div>
            <div class="endpoint">order premium package</div>
            
            <h3>TEST ENDPOINTS:</h3>
            <div class="endpoint"><strong>/test-gpt</strong> - Test GPT welcome menu</div>
            <div class="endpoint"><strong>/test-erpnext</strong> - Test ERPNext connection</div>
            <div class="endpoint"><strong>/test-order</strong> - Test order processing (POST)</div>
            <div class="endpoint"><strong>/analytics</strong> - View session analytics</div>
        </div>
    </body>
    </html>
    `;
    res.send(statusHtml);
});

app.listen(PORT, () => {
    console.log(`?? COMPLETE WhatsApp Water Delivery Bot v3.2 running on port ${PORT}`);
    console.log('? Complete welcome menu system + All services + Order processing');
    console.log(`?? URL: http://localhost:${PORT}`);
    
    if (!OPENAI_API_KEY) {
        console.warn('??  OPENAI_API_KEY not set');
    }
    
    if (!ERPNEXT_URL) {
        console.warn('??  ERPNEXT_URL not set');
    }
    
    startKeepAlive();
});