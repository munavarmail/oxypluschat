require('dotenv').config();
const express = require('express');
const axios = require('axios');

// Import modules
const { initializeNLP, processMessageWithNLP, getNLPStatus, getNLPAnalytics } = require('./nlp');
const { getCustomerByMobile, createOrder, testERPConnection } = require('./erp');
const { 
    handleMessage, 
    getBusinessData, 
    getUserSessions, 
    cleanupSessions,
    PRODUCTS,
    KNOWLEDGE_BASE 
} = require('./business');

const app = express();
app.use(express.json());

// Configuration
const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const GRAPH_API_TOKEN = process.env.GRAPH_API_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const KEEP_ALIVE_URL = process.env.KEEP_ALIVE_URL;
const KEEP_ALIVE_INTERVAL = 25 * 60 * 1000;

// ERP Configuration Check
const DOTORDERS_ERP_URL = process.env.DOTORDERS_ERP_URL;
const DOTORDERS_ERP_API_KEY = process.env.DOTORDERS_ERP_API_KEY;
const DOTORDERS_ERP_API_SECRET = process.env.DOTORDERS_ERP_API_SECRET;

// Debug logging system
const debugLog = {
    orders: [],
    errors: [],
    connections: [],
    maxEntries: 50
};

function logDebug(category, message, data = null) {
    const entry = {
        timestamp: new Date().toISOString(),
        message,
        data,
        level: 'INFO'
    };
    
    if (!debugLog[category]) debugLog[category] = [];
    debugLog[category].unshift(entry);
    if (debugLog[category].length > debugLog.maxEntries) {
        debugLog[category] = debugLog[category].slice(0, debugLog.maxEntries);
    }
    
    console.log(`[DEBUG-${category.toUpperCase()}] ${message}`, data ? JSON.stringify(data, null, 2) : '');
}

function logError(category, message, error = null) {
    const entry = {
        timestamp: new Date().toISOString(),
        message,
        error: error ? {
            message: error.message,
            stack: error.stack,
            response: error.response?.data,
            status: error.response?.status
        } : null,
        level: 'ERROR'
    };
    
    if (!debugLog[category]) debugLog[category] = [];
    debugLog[category].unshift(entry);
    if (debugLog[category].length > debugLog.maxEntries) {
        debugLog[category] = debugLog[category].slice(0, debugLog.maxEntries);
    }
    
    console.error(`[ERROR-${category.toUpperCase()}] ${message}`, error);
}

// Initialize NLP on startup
initializeNLP();

// Startup ERP connection test
async function testERPOnStartup() {
    try {
        logDebug('connections', 'Testing ERP connection on startup...');
        const result = await testERPConnection();
        logDebug('connections', 'ERP connection successful on startup', result);
        return true;
    } catch (error) {
        logError('connections', 'ERP connection failed on startup', error);
        return false;
    }
}

// Enhanced ERP connection test with detailed diagnostics
app.get('/test-erp-detailed', async (req, res) => {
    const diagnostics = {
        timestamp: new Date().toISOString(),
        environment: {
            DOTORDERS_ERP_URL: DOTORDERS_ERP_URL ? 'SET' : 'MISSING',
            DOTORDERS_ERP_API_KEY: DOTORDERS_ERP_API_KEY ? `${DOTORDERS_ERP_API_KEY.substring(0, 8)}...` : 'MISSING',
            DOTORDERS_ERP_API_SECRET: DOTORDERS_ERP_API_SECRET ? `${DOTORDERS_ERP_API_SECRET.substring(0, 8)}...` : 'MISSING'
        },
        tests: []
    };

    try {
        // Test 1: Environment variables
        logDebug('connections', 'Testing ERP environment variables...');
        if (!DOTORDERS_ERP_URL || !DOTORDERS_ERP_API_KEY || !DOTORDERS_ERP_API_SECRET) {
            diagnostics.tests.push({
                name: 'Environment Variables',
                status: 'FAIL',
                message: 'Missing required environment variables'
            });
        } else {
            diagnostics.tests.push({
                name: 'Environment Variables',
                status: 'PASS',
                message: 'All required variables present'
            });
        }

        // Test 2: Basic connectivity
        logDebug('connections', 'Testing basic ERP connectivity...');
        try {
            const pingResponse = await axios.get(`${DOTORDERS_ERP_URL}/api/method/ping`, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'WhatsApp-Bot/1.0'
                }
            });
            diagnostics.tests.push({
                name: 'Basic Connectivity',
                status: 'PASS',
                message: `Server responded with status ${pingResponse.status}`
            });
        } catch (error) {
            diagnostics.tests.push({
                name: 'Basic Connectivity',
                status: 'FAIL',
                message: `Connection failed: ${error.message}`,
                error: {
                    code: error.code,
                    status: error.response?.status,
                    statusText: error.response?.statusText
                }
            });
        }

        // Test 3: Authentication
        logDebug('connections', 'Testing ERP authentication...');
        try {
            const authResponse = await axios.get(`${DOTORDERS_ERP_URL}/api/method/frappe.auth.get_logged_user`, {
                timeout: 10000,
                headers: {
                    'Authorization': `token ${DOTORDERS_ERP_API_KEY}:${DOTORDERS_ERP_API_SECRET}`,
                    'Content-Type': 'application/json'
                }
            });
            diagnostics.tests.push({
                name: 'Authentication',
                status: 'PASS',
                message: 'Authentication successful',
                user: authResponse.data.message
            });
        } catch (error) {
            diagnostics.tests.push({
                name: 'Authentication',
                status: 'FAIL',
                message: `Auth failed: ${error.message}`,
                error: {
                    status: error.response?.status,
                    data: error.response?.data
                }
            });
        }

        // Test 4: Customer API access
        logDebug('connections', 'Testing Customer API access...');
        try {
            const customerResponse = await axios.get(`${DOTORDERS_ERP_URL}/api/resource/Customer`, {
                timeout: 10000,
                headers: {
                    'Authorization': `token ${DOTORDERS_ERP_API_KEY}:${DOTORDERS_ERP_API_SECRET}`,
                    'Content-Type': 'application/json'
                },
                params: {
                    limit: 1
                }
            });
            diagnostics.tests.push({
                name: 'Customer API',
                status: 'PASS',
                message: `Customer API accessible, ${customerResponse.data.data?.length || 0} records found`
            });
        } catch (error) {
            diagnostics.tests.push({
                name: 'Customer API',
                status: 'FAIL',
                message: `Customer API failed: ${error.message}`,
                error: {
                    status: error.response?.status,
                    data: error.response?.data
                }
            });
        }

        // Test 5: Sales Order API access
        logDebug('connections', 'Testing Sales Order API access...');
        try {
            const soResponse = await axios.get(`${DOTORDERS_ERP_URL}/api/resource/Sales Order`, {
                timeout: 10000,
                headers: {
                    'Authorization': `token ${DOTORDERS_ERP_API_KEY}:${DOTORDERS_ERP_API_SECRET}`,
                    'Content-Type': 'application/json'
                },
                params: {
                    limit: 1
                }
            });
            diagnostics.tests.push({
                name: 'Sales Order API',
                status: 'PASS',
                message: `Sales Order API accessible, ${soResponse.data.data?.length || 0} records found`
            });
        } catch (error) {
            diagnostics.tests.push({
                name: 'Sales Order API',
                status: 'FAIL',
                message: `Sales Order API failed: ${error.message}`,
                error: {
                    status: error.response?.status,
                    data: error.response?.data
                }
            });
        }

        logDebug('connections', 'ERP detailed test completed', diagnostics);
        res.json(diagnostics);

    } catch (error) {
        logError('connections', 'ERP detailed test error', error);
        res.status(500).json({
            error: 'Test execution failed',
            message: error.message
        });
    }
});

// Test order creation directly
app.post('/test-order-creation', async (req, res) => {
    try {
        const testOrderData = req.body || {
            product: PRODUCTS.single_bottle,
            productKey: 'single_bottle',
            quantity: 1,
            customerPhone: '+971501234567',
            address: 'Test Address, Dubai Marina, Dubai'
        };

        logDebug('orders', 'Testing order creation', testOrderData);

        const result = await createOrder(testOrderData);
        
        logDebug('orders', 'Order creation test result', result);

        res.json({
            success: true,
            testData: testOrderData,
            result: result,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logError('orders', 'Order creation test failed', error);
        res.status(500).json({
            success: false,
            error: error.message,
            stack: error.stack
        });
    }
});

// Enhanced webhook to receive messages with detailed logging
app.post('/webhook', (req, res) => {
    const body = req.body;
    
    logDebug('webhook', 'Received webhook', {
        object: body.object,
        entryCount: body.entry?.length
    });
    
    if (body.object === 'whatsapp_business_account') {
        body.entry.forEach(entry => {
            const changes = entry.changes;
            changes.forEach(change => {
                if (change.field === 'messages') {
                    const messages = change.value.messages;
                    if (messages) {
                        messages.forEach(message => {
                            logDebug('messages', 'Processing incoming message', {
                                from: message.from,
                                type: message.type,
                                hasText: !!message.text?.body
                            });
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

// Enhanced message handling with detailed logging
async function handleIncomingMessage(message, phoneNumberId) {
    const from = message.from;
    const messageBody = message.text?.body;
    
    if (messageBody) {
        try {
            logDebug('messages', 'Handling message', {
                from: from,
                message: messageBody,
                phoneNumberId: phoneNumberId
            });

            const response = await handleMessage(from, messageBody);
            
            logDebug('messages', 'Generated response', {
                from: from,
                responseLength: response.length,
                containsOrder: response.includes('ORDER')
            });

            await sendMessage(from, response, phoneNumberId);
            
            logDebug('messages', 'Message handling completed successfully', {
                from: from
            });

        } catch (error) {
            logError('messages', 'Message handling failed', error);
            await sendMessage(from, "I apologize, but I encountered a technical issue. Please try again or contact our support team.", phoneNumberId);
        }
    }
}

// Enhanced message sending with logging
async function sendMessage(to, message, phoneNumberId) {
    try {
        logDebug('messages', 'Sending WhatsApp message', {
            to: to,
            messageLength: message.length,
            phoneNumberId: phoneNumberId
        });

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
        
        logDebug('messages', 'Message sent successfully', { to: to });
    } catch (error) {
        logError('messages', 'Failed to send message', error);
    }
}

// Debug logs endpoint
app.get('/debug-logs', (req, res) => {
    const category = req.query.category;
    const limit = parseInt(req.query.limit) || 20;
    
    if (category && debugLog[category]) {
        res.json({
            category: category,
            entries: debugLog[category].slice(0, limit)
        });
    } else {
        res.json({
            categories: Object.keys(debugLog),
            summary: Object.keys(debugLog).reduce((acc, key) => {
                acc[key] = debugLog[key].length;
                return acc;
            }, {}),
            recentErrors: debugLog.errors?.slice(0, 5) || []
        });
    }
});

// Debug dashboard
app.get('/debug-dashboard', (req, res) => {
    const dashboardHtml = generateDebugDashboard();
    res.send(dashboardHtml);
});

function generateDebugDashboard() {
    const recentOrders = debugLog.orders?.slice(0, 5) || [];
    const recentErrors = debugLog.errors?.slice(0, 5) || [];
    const recentConnections = debugLog.connections?.slice(0, 5) || [];
    
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <title>ERPNext Debug Dashboard</title>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; background: #f5f5f5; }
            .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 20px; border-radius: 10px; margin-bottom: 20px; }
            .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
            .card { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .status { padding: 10px; border-radius: 5px; margin: 5px 0; }
            .success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
            .error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
            .warning { background: #fff3cd; color: #856404; border: 1px solid #ffeaa7; }
            .btn { display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 5px; margin: 5px; }
            .btn:hover { background: #0056b3; }
            .log-entry { background: #f8f9fa; border-left: 4px solid #007bff; padding: 10px; margin: 5px 0; border-radius: 3px; }
            .log-entry.error { border-left-color: #dc3545; }
            .log-time { font-size: 0.8em; color: #666; }
            pre { background: #2c3e50; color: white; padding: 15px; border-radius: 5px; overflow-x: auto; }
        </style>
        <meta http-equiv="refresh" content="30">
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>ERPNext Integration Debug Dashboard</h1>
                <p>Real-time monitoring of ERP sync operations</p>
            </div>
            
            <div class="cards">
                <div class="card">
                    <h3>System Status</h3>
                    <div class="status ${DOTORDERS_ERP_URL ? 'success' : 'error'}">
                        ERP URL: ${DOTORDERS_ERP_URL ? 'Configured' : 'Missing'}
                    </div>
                    <div class="status ${DOTORDERS_ERP_API_KEY ? 'success' : 'error'}">
                        API Key: ${DOTORDERS_ERP_API_KEY ? 'Configured' : 'Missing'}
                    </div>
                    <div class="status ${DOTORDERS_ERP_API_SECRET ? 'success' : 'error'}">
                        API Secret: ${DOTORDERS_ERP_API_SECRET ? 'Configured' : 'Missing'}
                    </div>
                    <a href="/test-erp-detailed" class="btn">Test ERP Connection</a>
                    <a href="/test-order-creation" class="btn">Test Order Creation</a>
                </div>
                
                <div class="card">
                    <h3>Recent Orders (${debugLog.orders?.length || 0})</h3>
                    ${recentOrders.map(entry => `
                        <div class="log-entry">
                            <div class="log-time">${new Date(entry.timestamp).toLocaleString()}</div>
                            <div>${entry.message}</div>
                            ${entry.data ? `<pre>${JSON.stringify(entry.data, null, 2).substring(0, 200)}...</pre>` : ''}
                        </div>
                    `).join('') || '<p>No order logs yet</p>'}
                </div>
                
                <div class="card">
                    <h3>Recent Errors (${debugLog.errors?.length || 0})</h3>
                    ${recentErrors.map(entry => `
                        <div class="log-entry error">
                            <div class="log-time">${new Date(entry.timestamp).toLocaleString()}</div>
                            <div><strong>${entry.message}</strong></div>
                            ${entry.error ? `<pre>${JSON.stringify(entry.error, null, 2).substring(0, 300)}...</pre>` : ''}
                        </div>
                    `).join('') || '<p>No errors logged</p>'}
                </div>
                
                <div class="card">
                    <h3>Connection Tests (${debugLog.connections?.length || 0})</h3>
                    ${recentConnections.map(entry => `
                        <div class="log-entry ${entry.level === 'ERROR' ? 'error' : ''}">
                            <div class="log-time">${new Date(entry.timestamp).toLocaleString()}</div>
                            <div>${entry.message}</div>
                            ${entry.data ? `<pre>${JSON.stringify(entry.data, null, 2).substring(0, 200)}...</pre>` : ''}
                        </div>
                    `).join('') || '<p>No connection logs yet</p>'}
                </div>
            </div>
            
            <div class="card" style="margin-top: 20px;">
                <h3>Quick Actions</h3>
                <a href="/debug-logs" class="btn">View All Logs</a>
                <a href="/debug-logs?category=orders" class="btn">Order Logs</a>
                <a href="/debug-logs?category=errors" class="btn">Error Logs</a>
                <a href="/sessions" class="btn">Active Sessions</a>
                <a href="/health" class="btn">Health Check</a>
            </div>
        </div>
    </body>
    </html>
    `;
}

// Keep-alive functions (unchanged)
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

// Enhanced health check with ERP status
app.get('/health', async (req, res) => {
    const businessData = getBusinessData();
    const nlpStatus = getNLPStatus();
    
    let erpStatus = 'unknown';
    try {
        await testERPConnection();
        erpStatus = 'connected';
    } catch (error) {
        erpStatus = 'disconnected';
        logError('health', 'ERP health check failed', error);
    }
    
    const healthData = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        memory: process.memoryUsage(),
        environment: process.env.NODE_ENV || 'development',
        version: nlpStatus.nlpAvailable ? '3.0.0-NLP' : '2.0.0-Basic',
        activeSessions: businessData.activeSessions,
        nlpStatus: nlpStatus.nlpAvailable ? (nlpStatus.nlpReady ? 'ready' : 'training') : 'not_available',
        nlpQueries: nlpStatus.totalQueries,
        erpStatus: erpStatus,
        debugLogCounts: {
            orders: debugLog.orders?.length || 0,
            errors: debugLog.errors?.length || 0,
            connections: debugLog.connections?.length || 0
        }
    };
    
    logDebug('health', 'Health check performed', { erpStatus, activeSessions: businessData.activeSessions });
    res.status(200).json(healthData);
});

// Webhook verification (unchanged)
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

// All other existing endpoints remain the same...
const nlpStatus = getNLPStatus();
if (nlpStatus.nlpAvailable) {
    app.get('/test-nlp/:message', async (req, res) => {
        try {
            const testMessage = decodeURIComponent(req.params.message);
            
            if (!nlpStatus.nlpReady) {
                return res.status(503).json({
                    success: false,
                    error: 'NLP system is still training. Please try again in a few seconds.',
                    nlpReady: false
                });
            }
            
            const startTime = Date.now();
            const result = await processMessageWithNLP(testMessage, 'test-user');
            const processingTime = Date.now() - startTime;
            
            res.json({
                success: true,
                input: testMessage,
                nlp_analysis: result.nlpAnalysis,
                suggested_response: result.response,
                processing_time_ms: processingTime,
                nlp_ready: nlpStatus.nlpReady
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
                nlp_ready: nlpStatus.nlpReady
            });
        }
    });

    app.get('/nlp-analytics', (req, res) => {
        const analytics = getNLPAnalytics();
        res.json(analytics);
    });
}

app.get('/test-dotorders-erp', async (req, res) => {
    try {
        const result = await testERPConnection();
        logDebug('connections', 'Manual ERP test successful', result);
        res.json({
            status: 'success',
            message: 'ERPNext connection working!',
            data: result,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logError('connections', 'Manual ERP test failed', error);
        res.status(500).json({
            status: 'error',
            message: 'ERPNext connection failed',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

app.get('/sessions', (req, res) => {
    const sessions = getUserSessions();
    res.json({
        totalSessions: sessions.length,
        nlpAvailable: nlpStatus.nlpAvailable,
        nlpReady: nlpStatus.nlpReady,
        sessions: sessions
    });
});

app.get('/', (req, res) => {
    const businessData = getBusinessData();
    const analytics = getNLPAnalytics();
    const statusHtml = generateHomepage(businessData, analytics);
    res.send(statusHtml);
});

function generateHomepage(businessData, analytics) {
    const avgResponseTime = analytics.responseTime?.length > 0 
        ? analytics.responseTime.reduce((a, b) => a + b, 0) / analytics.responseTime.length 
        : 0;

    return `
    <!DOCTYPE html>
    <html>
    <head>
        <title>${nlpStatus.nlpAvailable ? 'AI-Powered ' : ''}Water Delivery Bot</title>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; }
            .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
            .header { text-align: center; color: white; margin-bottom: 30px; }
            .header h1 { font-size: 2.5em; margin: 0; text-shadow: 0 2px 4px rgba(0,0,0,0.3); }
            .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
            .card { background: rgba(255, 255, 255, 0.95); padding: 25px; border-radius: 15px; box-shadow: 0 8px 32px rgba(0,0,0,0.1); }
            .status { padding: 20px; background: linear-gradient(135deg, #4CAF50, #45a049); color: white; border-radius: 10px; margin-bottom: 20px; }
            .debug-status { padding: 15px; background: linear-gradient(135deg, #FF9800, #F57C00); color: white; border-radius: 8px; margin-bottom: 15px; text-align: center; }
            .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin: 20px 0; }
            .stat-box { padding: 20px; background: linear-gradient(135deg, #2196F3, #1976D2); color: white; border-radius: 10px; text-align: center; }
            .stat-box h3 { margin: 0; font-size: 2em; }
            .feature { margin: 10px 0; padding: 10px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #2196F3; }
            .btn { display: inline-block; padding: 12px 24px; background: #2196F3; color: white; text-decoration: none; border-radius: 8px; margin: 5px; font-weight: bold; }
            .btn:hover { background: #1976D2; }
            .btn.debug { background: #FF5722; }
            .btn.debug:hover { background: #D84315; }
            .nlp-badge { background: ${nlpStatus.nlpAvailable ? '#4CAF50' : '#FF9800'}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.8em; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>${nlpStatus.nlpAvailable ? 'AI-Powered ' : ''}Water Delivery Bot</h1>
                <p>Advanced WhatsApp Business Integration with ERPNext</p>
                <div class="nlp-badge">${nlpStatus.nlpAvailable ? (nlpStatus.nlpReady ? 'NLP READY' : 'NLP TRAINING') : 'BASIC MODE'}</div>
            </div>
            
            <div class="debug-status">
                <strong>DEBUG MODE ENABLED</strong> - Enhanced logging and monitoring active
            </div>
            
            <div class="status">
                <h2 style="margin: 0 0 10px 0;">System Status: RUNNING</h2>
                <p><strong>Version:</strong> ${nlpStatus.nlpAvailable ? '3.0.0-NLP-DEBUG' : '2.0.0-Basic-DEBUG'} | 
                   <strong>Uptime:</strong> ${Math.floor(process.uptime())} seconds | 
                   <strong>Debug Logs:</strong> ${debugLog.orders?.length || 0} orders, ${debugLog.errors?.length || 0} errors</p>
            </div>
            
            <div class="stats">
                <div class="stat-box">
                    <h3>${businessData.activeSessions}</h3>
                    <p>Active Sessions</p>
                </div>
                <div class="stat-box">
                    <h3>${debugLog.orders?.length || 0}</h3>
                    <p>Order Attempts</p>
                </div>
                <div class="stat-box">
                    <h3>${debugLog.errors?.length || 0}</h3>
                    <p>Errors Logged</p>
                </div>
                <div class="stat-box">
                    <h3>${Object.keys(PRODUCTS).length}</h3>
                    <p>Products</p>
                </div>
            </div>
            
            <div class="cards">
                <div class="card">
                    <h3>Debug Tools</h3>
                    <div class="feature">Real-time ERP monitoring</div>
                    <div class="feature">Order flow tracking</div>
                    <div class="feature">Error logging system</div>
                    <div class="feature">Connection diagnostics</div>
                    <a href="/debug-dashboard" class="btn debug">Debug Dashboard</a>
                    <a href="/test-erp-detailed" class="btn debug">Test ERP</a>
                </div>
                
                <div class="card">
                    <h3>API Endpoints</h3>
                    <div class="feature"><strong>/debug-dashboard</strong> - Real-time debugging</div>
                    <div class="feature"><strong>/test-erp-detailed</strong> - ERP diagnostics</div>
                    <div class="feature"><strong>/test-order-creation</strong> - Test orders</div>
                    <div class="feature"><strong>/debug-logs</strong> - View logs</div>
                    <div class="feature"><strong>/health</strong> - System health</div>
                </div>
                
                <div class="card">
                    <h3>Business Features</h3>
                    <div class="feature">Quantity-aware Order Processing</div>
                    <div class="feature">Enhanced Customer Management</div>
                    <div class="feature">ERPNext Sales Order Integration</div>
                    <div class="feature">WhatsApp Business API</div>
                    <div class="feature">Conversation State Management</div>
                    <div class="feature">Automated Error Recovery</div>
                </div>
            </div>
        </div>
    </body>
    </html>
    `;
}

// Session cleanup with logging
setInterval(() => {
    const cleaned = cleanupSessions();
    if (cleaned > 0) {
        logDebug('sessions', `Cleaned up ${cleaned} inactive sessions. Active: ${getBusinessData().activeSessions}`);
    }
}, 15 * 60 * 1000);

// Start server
app.listen(PORT, async () => {
    console.log(`Enhanced Water Delivery Bot with DEBUG MODE starting on port ${PORT}`);
    console.log(`Features: ${nlpStatus.nlpAvailable ? 'NLP + ' : ''}Customer Service + Order Management + ERPNext Integration + Debug Tools`);
    console.log(`Server URL: http://localhost:${PORT}`);
    console.log(`Debug Dashboard: http://localhost:${PORT}/debug-dashboard`);
    console.log(`ERP Test: http://localhost:${PORT}/test-erp-detailed`);
    
    // Test ERP connection on startup
    await testERPOnStartup();
    
    startKeepAlive();
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down gracefully'); 
    process.exit(0);
});