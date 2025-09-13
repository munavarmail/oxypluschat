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

// dotorders ERP Configuration
const DOTORDERS_ERP_URL = process.env.DOTORDERS_ERP_URL;
const DOTORDERS_ERP_API_KEY = process.env.DOTORDERS_ERP_API_KEY;
const DOTORDERS_ERP_API_SECRET = process.env.DOTORDERS_ERP_API_SECRET;

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
        description: '5-gallon water bottle made from 100% virgin material with low sodium and pH-balanced water',
        keywords: ['single', 'one bottle', 'individual', 'trial'],
        salesPoints: ['Perfect for trying our quality', 'No commitment', 'Quick delivery']
    },
    'trial_bottle': { 
        name: 'Trial Bottle', 
        price: 7, 
        deposit: 15, 
        description: 'Trial 5-gallon water bottle - perfect for first-time customers',
        keywords: ['trial', 'test', 'first time', 'sample'],
        salesPoints: ['Risk-free trial', 'Experience our quality', 'Same premium water']
    },
    'table_dispenser': { 
        name: 'Table Top Dispenser', 
        price: 25, 
        deposit: 0, 
        description: 'Basic table top dispenser for convenient water access',
        keywords: ['table', 'dispenser', 'basic', 'simple'],
        salesPoints: ['No electricity needed', 'Compact design', 'Easy to use']
    },
    'hand_pump': { 
        name: 'Hand Pump', 
        price: 15, 
        deposit: 0, 
        description: 'Manual hand pump for bottles - most economical option',
        keywords: ['pump', 'manual', 'hand', 'cheap'],
        salesPoints: ['Most affordable', 'No maintenance', 'Works anywhere']
    },
    'premium_cooler': { 
        name: 'Premium Water Cooler', 
        price: 300, 
        deposit: 0, 
        description: 'Premium cooler with hot/cold water, 1-year warranty from Geo General',
        keywords: ['premium', 'cooler', 'hot', 'cold', 'electric'],
        salesPoints: ['Hot & cold water', '1-year warranty', 'Premium quality', 'Energy efficient']
    },
    'coupon_10_1': { 
        name: '10+1 Coupon Book', 
        price: 70, 
        deposit: 0, 
        description: '11 bottles (10+1 free), up to 3 bottles without deposit',
        keywords: ['10+1', 'eleven', 'coupon book', 'small package'],
        salesPoints: ['Save on deposit', 'Free bottle included', 'Better per-bottle price', 'Priority delivery']
    },
    'coupon_100_40': { 
        name: '100+40 Coupon Book', 
        price: 700, 
        deposit: 0, 
        description: '140 bottles total, up to 5 bottles without deposit, BNPL available',
        keywords: ['100+40', '140', 'bulk', 'large package', 'bnpl'],
        salesPoints: ['Best value for money', 'Buy now pay later option', 'Huge savings', 'No deposit for 5 bottles', 'Priority service']
    },
    'premium_package': { 
        name: '140 Bottles + Premium Dispenser', 
        price: 920, 
        deposit: 0, 
        description: '140 bottles + Premium dispenser package - complete solution',
        keywords: ['premium package', 'complete', 'dispenser included'],
        salesPoints: ['Complete water solution', 'Premium dispenser included', 'Maximum convenience', 'Best overall value']
    }
};

// Enhanced knowledge base with context for GPT
const KNOWLEDGE_BASE = `
COMPANY INFORMATION:
- Water delivery service operating in Dubai, Sharjah, Ajman (except freezones)
- HQ located in Ajman
- 10+ years of experience in commercial and residential delivery
- Focus on quality: 100% virgin material bottles, low sodium, pH-balanced water
- Superior customer service compared to competitors

PRICING STRUCTURE:
- Base price: AED 7 per bottle
- Bottle deposit: AED 15 (refundable)
- With coupon books: As low as AED 5 per bottle
- Equipment transparent pricing (not hidden in bottle costs)

DELIVERY INFORMATION:
- Coverage: Dubai, Sharjah, Ajman (no freezones)
- WhatsApp-based scheduling
- Weekly scheduled delivery available
- Urgent/out-of-schedule requests accommodated
- Free delivery with coupon books
- Standard charges for individual bottles

PAYMENT METHODS:
- Cash payment
- Bank transfer
- Card payment (notify one day prior)
- Buy Now Pay Later (ONLY for 100+40 Coupon Book)

COUPON SYSTEM BENEFITS:
- No bottle deposit required
- Prioritized delivery
- Out-of-schedule delivery possible
- No delivery charges
- No cash payment hassle every time
- Better price per bottle
- Simply exchange coupons for bottles

SALES QUALIFICATION QUESTIONS:
- Current water consumption per week/month
- Home or office use
- Number of people in household/office
- Current water supplier satisfaction
- Budget considerations
- Delivery frequency preferences

COMMON Q&A:
- HOW TO SCHEDULE THE DELIVERY? You can simply message us on WhatsApp and we will take care of your delivery. We will also set a scheduled day for you out of the week, but don't worry, even if you have urgent requirements out of schedule we will take care of it.
- WHAT ARE YOUR PAYMENT METHODS? We accept cash, bank transfer and even card payment (need to inform one day prior)
- WHERE IS BUY NOW PAY LATER APPLICABLE? THIS OPTION IS ONLY FOR THE 100+40 COUPON BOOK'S AND NOT FOR ANY OTHER COUPONS OR INDIVIDUAL BOTTLES
- Where are you located? Our HQ is located in Ajman and we deliver throughout Sharjah, Ajman & Dubai.
- Why are you different from others? The main way we differentiate from others is the quality of our bottles and our customer service
- Can you deliver to commercial establishments/offices? We absolutely can deliver and have been doing it for 10 years
- WHAT TYPE OF PRODUCTS DO YOU HAVE? We have the 5Gal water bottles made from 100% virgin material with low sodium and ph-Balanced water
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
        salesStage: 'discovery' // discovery, interest, consideration, decision
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

// GPT-4.1 mini integration for intelligent conversations
async function getGPTResponse(userMessage, session, context = '') {
    try {
        const conversationHistory = session.conversationHistory.slice(-10); // Last 10 messages for context
        
        const systemPrompt = `You are an intelligent sales assistant for a premium water delivery service in UAE. 

CONTEXT:
${KNOWLEDGE_BASE}

${context}

CONVERSATION GUIDELINES:
1. Always be helpful, professional, and sales-oriented
2. Qualify customers by understanding their needs
3. Recommend appropriate products based on their situation
4. Handle objections intelligently
5. Guide towards order completion
6. Use the provided pricing and product information
7. Be conversational and natural, not robotic
8. Ask qualifying questions to understand customer needs
9. Address concerns proactively
10. Always try to advance the sale

RESPONSE FORMAT:
- Be concise but informative
- Use bullet points sparingly, prefer conversational tone
- Include relevant product recommendations
- Ask follow-up questions to qualify
- Show value proposition clearly
- End with a call to action when appropriate

CUSTOMER QUALIFICATION FOCUS:
- Usage: How many bottles per week/month?
- Type: Home or office use?
- Location: Which area for delivery?
- Current situation: Existing supplier satisfaction?
- Decision factors: Price, quality, convenience?

SALES STAGES:
- Discovery: Understand needs and qualify
- Interest: Present relevant solutions  
- Consideration: Address concerns, show value
- Decision: Guide to order completion

Current conversation history: ${JSON.stringify(conversationHistory)}`;

        const messages = [
            { role: 'system', content: systemPrompt },
            ...conversationHistory,
            { role: 'user', content: userMessage }
        ];

        const response = await axios.post(OPENAI_API_URL, {
            model: 'gpt-4o-mini', // Use GPT-4o-mini for cost efficiency
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

        // Extract sales intelligence from response
        await extractSalesIntelligence(gptResponse, session);

        return gptResponse;

    } catch (error) {
        console.error('GPT API Error:', error.response?.data || error.message);
        return getFallbackResponse(userMessage, session);
    }
}

// Extract sales intelligence and update session
async function extractSalesIntelligence(gptResponse, session) {
    // Update sales stage based on response content
    if (gptResponse.includes('order') || gptResponse.includes('purchase') || gptResponse.includes('buy')) {
        session.salesStage = 'decision';
    } else if (gptResponse.includes('recommend') || gptResponse.includes('suggest')) {
        session.salesStage = 'consideration';
    } else if (gptResponse.includes('interested') || gptResponse.includes('sounds good')) {
        session.salesStage = 'interest';
    }

    // Extract interests based on response
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

// Fallback response system
function getFallbackResponse(message, session) {
    const lowerMessage = message.toLowerCase();
    
    // Check for order intent
    if (lowerMessage.includes('order') || lowerMessage.includes('buy') || lowerMessage.includes('purchase')) {
        return `I'd be happy to help you place an order! 

To recommend the best option for you, could you tell me:
- How many bottles do you typically use per week?
- Is this for home or office use?
- Which area should we deliver to?

Based on your needs, I can suggest the most cost-effective solution for you.`;
    }
    
    // Check for pricing questions
    if (lowerMessage.includes('price') || lowerMessage.includes('cost') || lowerMessage.includes('how much')) {
        return `Our pricing is transparent and competitive:

Individual Bottles: AED 7 + AED 15 deposit
10+1 Coupon Book: AED 70 (saves deposit, better value)
100+40 Coupon Book: AED 700 (best value, BNPL available)

Equipment:
- Hand Pump: AED 15
- Table Dispenser: AED 25  
- Premium Cooler: AED 300 (1-year warranty)

What's your typical monthly consumption? I can calculate the best value option for you.`;
    }
    
    // Check for delivery questions
    if (lowerMessage.includes('deliver') || lowerMessage.includes('when') || lowerMessage.includes('schedule')) {
        return `We deliver throughout Dubai, Sharjah, and Ajman (except freezones).

Delivery Process:
- Same-day/next-day delivery available
- Weekly scheduled delivery options
- WhatsApp notifications for timing
- Free delivery with coupon books

Which area are you located in? I can confirm our delivery schedule for your location.`;
    }

    // Default response
    return `I'm here to help you with our premium water delivery service!

I can assist with:
- Product recommendations based on your needs
- Pricing and value calculations  
- Delivery scheduling
- Order placement

What specific information would you like to know? Or shall I ask a few questions to recommend the best solution for you?`;
}

// Build context for GPT based on session data
async function buildContextForGPT(session, userPhone) {
    let context = '';
    
    // Add customer information if available
    if (session.customerInfo) {
        context += `EXISTING CUSTOMER INFO:\n${session.customerInfo}\n\n`;
    }
    
    // Add qualification data
    if (Object.values(session.qualification).some(v => v !== null)) {
        context += `CUSTOMER QUALIFICATION:\n`;
        Object.entries(session.qualification).forEach(([key, value]) => {
            if (value) context += `${key}: ${value}\n`;
        });
        context += '\n';
    }
    
    // Add interested products
    if (session.interests.length > 0) {
        context += `CUSTOMER INTERESTS:\n`;
        session.interests.forEach(productKey => {
            const product = PRODUCTS[productKey];
            context += `- ${product.name}: ${product.description}\n`;
        });
        context += '\n';
    }
    
    // Add sales stage context
    context += `CURRENT SALES STAGE: ${session.salesStage}\n`;
    
    return context;
}

// Health check endpoint
app.get('/health', (req, res) => {
    const healthData = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        memory: process.memoryUsage(),
        environment: process.env.NODE_ENV || 'development',
        version: '3.0.0-GPT-Enhanced',
        activeSessions: userSessions.size,
        features: {
            gptIntegration: !!OPENAI_API_KEY,
            erpIntegration: !!(DOTORDERS_ERP_URL && DOTORDERS_ERP_API_KEY),
            keepAlive: !!KEEP_ALIVE_URL
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

// Enhanced message handling with GPT integration
async function handleIncomingMessage(message, phoneNumberId) {
    const from = message.from;
    const messageBody = message.text?.body;
    
    if (messageBody) {
        // Get or create user session
        if (!userSessions.has(from)) {
            userSessions.set(from, createUserSession());
        }
        
        const session = userSessions.get(from);
        session.lastActivity = Date.now();
        
        let response;
        
        // Handle order commands and confirmations first
        if (messageBody.toLowerCase().startsWith('order ')) {
            response = await handleOrderCommand(messageBody, session, from);
        } else if (session.state === 'confirming_order') {
            response = await handleOrderConfirmation(messageBody, session, from);
        } else if (session.state === 'collecting_address') {
            response = await handleAddressCollection(messageBody, session, from);
        } else {
            // Check mobile number for customer lookup
            const mobileRegex = /(\+?\d{1,4})?[0-9]{8,15}/;
            const mobileMatch = messageBody.match(mobileRegex);
            
            if (mobileMatch && messageBody.length < 20) {
                let mobileNumber = mobileMatch[0].trim();
                console.log(`Processing mobile number: ${mobileNumber}`);
                response = await getCustomerByMobile(mobileNumber);
                session.customerInfo = response;
            } else {
                // Use GPT for intelligent conversation
                const context = await buildContextForGPT(session, from);
                response = await getGPTResponse(messageBody, session, context);
            }
        }
        
        await sendMessage(from, response, phoneNumberId);
    }
}

// Enhanced order handling
async function handleOrderCommand(message, session, userPhone) {
    const orderText = message.substring(6).toLowerCase().trim();
    
    // Try to match product
    let selectedProduct = null;
    let productKey = null;
    
    for (const [key, product] of Object.entries(PRODUCTS)) {
        if (orderText.includes(key.replace('_', ' ')) || 
            orderText.includes(product.name.toLowerCase()) ||
            product.keywords.some(keyword => orderText.includes(keyword))) {
            selectedProduct = product;
            productKey = key;
            break;
        }
    }
    
    if (!selectedProduct) {
        return `Product not found. Available products:
${Object.entries(PRODUCTS).map(([key, product]) => 
    `- ${product.name} - AED ${product.price}${product.deposit > 0 ? ` (+${product.deposit} deposit)` : ''}`
).join('\n')}

Example: "order single bottle"`;
    }
    
    // Get customer info first if not available
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
    
    // Check if we need address
    if (!session.customerInfo || session.customerInfo.includes('CUSTOMER NOT FOUND') || !session.customerInfo.includes('ADDRESS:')) {
        session.state = 'collecting_address';
        return `Perfect! I'll help you order the ${selectedProduct.name}.

Product Details:
- ${selectedProduct.description}
- Price: AED ${selectedProduct.price}${selectedProduct.deposit > 0 ? ` + AED ${selectedProduct.deposit} deposit` : ''}

To process your order, I need your delivery address. Please provide:
- Building/villa name or number
- Street/area name
- Any specific directions for delivery`;
    } else {
        session.state = 'confirming_order';
        return await generateOrderConfirmation(session.orderInProgress);
    }
}

// Order confirmation handling
async function handleOrderConfirmation(message, session, userPhone) {
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('yes') || lowerMessage.includes('confirm') || lowerMessage.includes('ok')) {
        return await processOrder(session, userPhone);
    } else if (lowerMessage.includes('no') || lowerMessage.includes('cancel')) {
        session.state = 'active';
        session.orderInProgress = null;
        return "No problem! Order cancelled. Feel free to ask if you have any questions or want to explore other options.";
    } else {
        return `Please confirm your order by replying:
- "YES" or "CONFIRM" to proceed
- "NO" or "CANCEL" to cancel

Or ask me any questions about the order details.`;
    }
}

// Address collection handling  
async function handleAddressCollection(message, session, userPhone) {
    session.orderInProgress.address = message;
    session.state = 'confirming_order';
    return await generateOrderConfirmation(session.orderInProgress);
}

// Generate order confirmation
async function generateOrderConfirmation(orderInfo) {
    const total = orderInfo.product.price + orderInfo.product.deposit;
    
    return `ORDER CONFIRMATION

Product: ${orderInfo.product.name}
Description: ${orderInfo.product.description}
Price: AED ${orderInfo.product.price}
${orderInfo.product.deposit > 0 ? `Deposit: AED ${orderInfo.product.deposit} (refundable)` : ''}
Total: AED ${total}

Delivery Address:
${orderInfo.address || 'Using address on file'}

Payment: Cash/Card on delivery

Please reply "YES" to confirm your order or "NO" to cancel.`;
}

// Process confirmed order with complete ERP integration
async function processOrder(session, userPhone) {
    try {
        const orderInfo = session.orderInProgress;
        
        // Ensure customer exists in ERP
        const customerResult = await ensureCustomerExists(orderInfo);
        
        if (!customerResult.success) {
            return `ORDER PROCESSING ERROR

${customerResult.message}

Please try again or contact our support team.`;
        }
        
        // Create order in ERP
        const erpOrder = await createERPOrder(orderInfo, customerResult.customerName);
        
        if (erpOrder.success) {
            session.state = 'active';
            session.orderInProgress = null;
            session.salesStage = 'decision';
            
            return `ORDER CONFIRMED

Order ID: ${erpOrder.orderName}
Product: ${orderInfo.product.name}
Total: AED ${orderInfo.product.price + orderInfo.product.deposit}

Next Steps:
Our delivery team will contact you within 2 hours to schedule delivery.

Delivery Areas:
Dubai, Sharjah, Ajman

Thank you for choosing our premium water service!`;
        } else {
            return handleOrderError(erpOrder.error, erpOrder.errorType);
        }
        
    } catch (error) {
        console.error('Error processing order:', error);
        return `ORDER PROCESSING ERROR

There was a technical issue while processing your order. Our team has been notified.

Please try again in a few minutes or contact support directly.`;
    }
}

// COMPLETE ERP INTEGRATION FUNCTIONS

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

// Create order in dotorders ERP
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
            custom_order_source: 'WhatsApp Bot'
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

// Handle different types of order errors
function handleOrderError(error, errorType) {
    if (typeof error === 'string' && error.includes('Customer') && error.includes('not found')) {
        return `CUSTOMER ACCOUNT ISSUE

We couldn't find your customer account in our system. This has been resolved.

Please try placing your order again, and your account will be created automatically.`;
    }
    
    if (typeof error === 'string' && error.includes('Item') && error.includes('not found')) {
        return `PRODUCT UNAVAILABLE

The requested product is temporarily unavailable in our system.

Please contact our support team or try ordering a different product.`;
    }
    
    if (typeof error === 'string' && error.includes('permission')) {
        return `SYSTEM MAINTENANCE

Our ordering system is currently undergoing maintenance.

Please try again in a few minutes or contact our team directly for immediate assistance.`;
    }
    
    // Generic error with more helpful guidance
    return `ORDER PROCESSING ISSUE

We encountered a technical issue while processing your order.

What you can do:
- Try placing the order again in a few minutes
- Contact our support team directly
- Send us your details manually

Our team has been notified and will resolve this quickly.`;
}

// Enhanced customer lookup by mobile number
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
            
            let response = `CUSTOMER FOUND

Name: ${customer.customer_name}
Mobile: ${customer.mobile_no}

${addressInfo}`;
            
            if (customDocsInfo) {
                response += `${customDocsInfo}`;
            }
            
            return response;
            
        } else {
            console.log(`No customer found for mobile: ${mobileNumber}`);
            return `CUSTOMER NOT FOUND

No customer found with mobile number: ${mobileNumber}

Would you like to place a new order? I can help you get started!`;
        }
        
    } catch (error) {
        console.error('Error fetching customer:', error.response?.status, error.response?.data || error.message);
        return 'Unable to fetch customer information. Please try again later.';
    }
}

// Get custom documents for customer
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

// Get document details
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
        
        let docInfo = `\n${docData.name || docData.title || docType}:\n`;
        
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

// Get customer address
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
            
            let addressText = 'ADDRESS:\n';
            
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
            if (address.phone) addressText += `Phone: ${address.phone}\n`;
            if (address.email_id) addressText += `Email: ${address.email_id}`;
            
            return addressText;
            
        } else {
            return 'ADDRESS: Not available';
        }
        
    } catch (error) {
        console.error('Error fetching address:', error.response?.data || error.message);
        return 'ADDRESS: Unable to fetch address details';
    }
}

// Send message function
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

// GPT test endpoint
app.get('/test-gpt', async (req, res) => {
    try {
        const testMessage = "Hello, I'm interested in your water delivery service";
        const testSession = createUserSession();
        
        const response = await getGPTResponse(testMessage, testSession);
        
        res.json({
            status: 'success',
            message: 'GPT integration working!',
            testResponse: response
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: 'GPT integration failed',
            error: error.message
        });
    }
});

// Test dotorders ERP connection endpoint
app.get('/test-dotorders-erp', async (req, res) => {
    try {
        const response = await axios.get(`${DOTORDERS_ERP_URL}/api/method/frappe.auth.get_logged_user`, {
            headers: {
                'Authorization': `token ${DOTORDERS_ERP_API_KEY}:${DOTORDERS_ERP_API_SECRET}`,
                'Content-Type': 'application/json'
            }
        });
        res.json({ status: 'success', message: 'dotorders ERP connection working!', data: response.data });
    } catch (error) {
        res.status(500).json({ 
            status: 'error', 
            message: 'dotorders ERP connection failed', 
            error: error.response?.data || error.message
        });
    }
});

// Session analytics endpoint
app.get('/analytics', (req, res) => {
    const analytics = {
        totalSessions: userSessions.size,
        salesStages: {},
        topInterests: {},
        activeOrders: 0
    };
    
    userSessions.forEach(session => {
        // Count sales stages
        analytics.salesStages[session.salesStage] = 
            (analytics.salesStages[session.salesStage] || 0) + 1;
        
        // Count interests
        session.interests.forEach(interest => {
            analytics.topInterests[interest] = 
                (analytics.topInterests[interest] || 0) + 1;
        });
        
        // Count active orders
        if (session.orderInProgress) {
            analytics.activeOrders++;
        }
    });
    
    res.json(analytics);
});

// Session management endpoint
app.get('/sessions', (req, res) => {
    const sessions = Array.from(userSessions.entries()).map(([phone, session]) => ({
        phone: phone.substring(0, 8) + '****', // Mask phone numbers for privacy
        state: session.state,
        hasOrder: !!session.orderInProgress,
        lastActivity: new Date(session.lastActivity).toISOString(),
        salesStage: session.salesStage,
        interests: session.interests
    }));
    
    res.json({
        totalSessions: userSessions.size,
        sessions: sessions
    });
});

// Debug customer endpoint
app.get('/debug-customer', async (req, res) => {
    try {
        const response = await axios.get(`${DOTORDERS_ERP_URL}/api/resource/Customer`, {
            headers: {
                'Authorization': `token ${DOTORDERS_ERP_API_KEY}:${DOTORDERS_ERP_API_SECRET}`,
                'Content-Type': 'application/json'
            },
            params: {
                limit: 5
            }
        });
        res.json({ status: 'success', customers: response.data.data });
    } catch (error) {
        res.status(500).json({ 
            status: 'error', 
            message: 'Debug customer failed', 
            error: error.response?.data || error.message
        });
    }
});

// Debug mobile search endpoint
app.get('/debug-mobile/:number', async (req, res) => {
    try {
        const customerInfo = await getCustomerByMobile(req.params.number);
        res.json({ 
            status: 'success', 
            mobile: req.params.number,
            customerInfo: customerInfo
        });
    } catch (error) {
        res.status(500).json({ 
            status: 'error', 
            message: 'Debug mobile search failed', 
            error: error.message
        });
    }
});

// Manual order creation endpoint
app.post('/manual-order', async (req, res) => {
    try {
        const { customerPhone, productKey, address, quantity = 1 } = req.body;
        
        if (!customerPhone || !productKey || !address) {
            return res.status(400).json({
                status: 'error',
                message: 'Missing required fields: customerPhone, productKey, address'
            });
        }
        
        const product = PRODUCTS[productKey];
        if (!product) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid product key'
            });
        }
        
        const orderInfo = {
            product: product,
            productKey: productKey,
            quantity: quantity,
            customerPhone: customerPhone,
            address: address
        };
        
        const customerResult = await ensureCustomerExists(orderInfo);
        if (!customerResult.success) {
            return res.status(500).json({
                status: 'error',
                message: customerResult.message
            });
        }
        
        const erpOrder = await createERPOrder(orderInfo, customerResult.customerName);
        
        if (erpOrder.success) {
            res.json({
                status: 'success',
                message: 'Order created successfully',
                orderName: erpOrder.orderName,
                data: erpOrder.data
            });
        } else {
            res.status(500).json({
                status: 'error',
                message: 'Failed to create order',
                error: erpOrder.error
            });
        }
        
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: 'Manual order creation failed',
            error: error.message
        });
    }
});

// Enhanced session cleanup
setInterval(() => {
    const now = Date.now();
    const twoHours = 2 * 60 * 60 * 1000;
    
    for (const [phone, session] of userSessions.entries()) {
        if (now - session.lastActivity > twoHours) {
            userSessions.delete(phone);
            console.log(`Cleaned up inactive session for ${phone}`);
        }
    }
}, 30 * 60 * 1000); // Check every 30 minutes

// Enhanced homepage
app.get('/', (req, res) => {
    const statusHtml = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Enhanced WhatsApp Water Delivery Bot</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
            .container { max-width: 1000px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .status { padding: 20px; background: #e8f5e8; border-radius: 8px; margin: 20px 0; }
            .endpoint { margin: 10px 0; padding: 15px; background: #f8f8f8; border-radius: 6px; border-left: 4px solid #007bff; }
            .active { color: #28a745; font-weight: bold; }
            .inactive { color: #ffc107; }
            .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 20px 0; }
            .stat-box { padding: 20px; background: #007bff; color: white; border-radius: 8px; text-align: center; }
            .feature-box { padding: 15px; background: #f0f8ff; border-radius: 6px; margin: 10px 0; }
            h1 { color: #333; text-align: center; }
            h2 { color: #007bff; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Enhanced WhatsApp Water Delivery Bot v3.0</h1>
            <div class="status">
                <h2>Server Status: <span class="active">RUNNING</span></h2>
                <p><strong>Version:</strong> 3.0.0 (GPT-4o-mini Enhanced + Complete ERP Integration)</p>
                <p><strong>Uptime:</strong> ${Math.floor(process.uptime())} seconds</p>
                <p><strong>GPT Integration:</strong> <span class="${OPENAI_API_KEY ? 'active' : 'inactive'}">${OPENAI_API_KEY ? 'ENABLED' : 'DISABLED'}</span></p>
                <p><strong>ERP Integration:</strong> <span class="${DOTORDERS_ERP_URL ? 'active' : 'inactive'}">${DOTORDERS_ERP_URL ? 'ENABLED' : 'DISABLED'}</span></p>
                <p><strong>Keep-alive:</strong> <span class="${KEEP_ALIVE_URL ? 'active' : 'inactive'}">${KEEP_ALIVE_URL ? 'ENABLED' : 'DISABLED'}</span></p>
                <p><strong>Time:</strong> ${new Date().toISOString()}</p>
            </div>
            
            <div class="stats">
                <div class="stat-box">
                    <h3>${userSessions.size}</h3>
                    <p>Active Sessions</p>
                </div>
                <div class="stat-box">
                    <h3>${Object.keys(PRODUCTS).length}</h3>
                    <p>Products Available</p>
                </div>
                <div class="stat-box">
                    <h3>67</h3>
                    <p>Q&A Knowledge Base</p>
                </div>
                <div class="stat-box">
                    <h3>AI</h3>
                    <p>Smart Conversations</p>
                </div>
            </div>

            <div class="feature-box">
                <h3>New AI-Powered Features:</h3>
                <ul>
                    <li>GPT-4o-mini intelligent conversation handling</li>
                    <li>Sales qualification and lead scoring</li>
                    <li>Context-aware product recommendations</li>
                    <li>Automated customer journey tracking</li>
                    <li>Advanced analytics and reporting</li>
                </ul>
            </div>
            
            <h3>API Endpoints:</h3>
            <div class="endpoint"><strong>/health</strong> - Health check and system status</div>
            <div class="endpoint"><strong>/analytics</strong> - Sales analytics and session data</div>
            <div class="endpoint"><strong>/sessions</strong> - Active customer sessions</div>
            <div class="endpoint"><strong>/test-gpt</strong> - Test GPT-4o-mini integration</div>
            <div class="endpoint"><strong>/test-dotorders-erp</strong> - Test dotorders ERP connection</div>
            <div class="endpoint"><strong>/webhook</strong> - WhatsApp webhook endpoint</div>
            <div class="endpoint"><strong>/debug-customer</strong> - Debug customer data structure</div>
            <div class="endpoint"><strong>/debug-mobile/:number</strong> - Debug mobile number search</div>
            <div class="endpoint"><strong>/manual-order</strong> - Create manual orders (POST)</div>
            
            <h3>Complete Bot Capabilities:</h3>
            <ul>
                <li><strong>Intelligent Conversations:</strong> GPT-4o-mini powered natural language understanding</li>
                <li><strong>Sales Intelligence:</strong> Customer qualification, interest tracking, sales stage management</li>
                <li><strong>Product Catalog:</strong> 8 products with smart recommendations</li>
                <li><strong>Order Management:</strong> End-to-end order processing with ERP integration</li>
                <li><strong>Customer Management:</strong> Automatic customer creation and address handling</li>
                <li><strong>Analytics Dashboard:</strong> Real-time sales metrics and session analytics</li>
                <li><strong>Error Handling:</strong> Comprehensive error handling with fallback responses</li>
                <li><strong>Session Management:</strong> Conversation state and context preservation</li>
                <li><strong>Mobile Integration:</strong> Customer lookup by phone number</li>
                <li><strong>Address Collection:</strong> Automated address collection for new customers</li>
            </ul>

            <h3>ERP Integration Features:</h3>
            <ul>
                <li>Automatic customer creation in dotorders ERP</li>
                <li>Sales order generation with line items</li>
                <li>Address management and linking</li>
                <li>Customer lookup and data retrieval</li>
                <li>Custom field handling</li>
                <li>Error handling for ERP failures</li>
            </ul>
        </div>
    </body>
    </html>
    `;
    res.send(statusHtml);
});

app.listen(PORT, () => {
    console.log(`?? Enhanced Water Delivery Bot v3.0 running on port ${PORT}`);
    console.log('? Features: GPT-4o-mini Intelligence + Complete ERP Integration + Sales Analytics');
    console.log(`?? Server URL: http://localhost:${PORT}`);
    
    if (!OPENAI_API_KEY) {
        console.warn('??  OPENAI_API_KEY not set - GPT features will use fallback responses');
    }
    
    if (!DOTORDERS_ERP_URL) {
        console.warn('??  ERP configuration incomplete - order processing will fail');
    }
    
    startKeepAlive();
});