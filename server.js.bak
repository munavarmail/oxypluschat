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

// Initialize NLP on startup
initializeNLP();

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

// Health check endpoint
app.get('/health', (req, res) => {
    const businessData = getBusinessData();
    const nlpStatus = getNLPStatus();
    
    const healthData = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        memory: process.memoryUsage(),
        environment: process.env.NODE_ENV || 'development',
        version: nlpStatus.nlpAvailable ? '3.0.0-NLP' : '2.0.0-Basic',
        activeSessions: businessData.activeSessions,
        nlpStatus: nlpStatus.nlpAvailable ? (nlpStatus.nlpReady ? 'ready' : 'training') : 'not_available',
        nlpQueries: nlpStatus.totalQueries
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

// Handle incoming WhatsApp messages
async function handleIncomingMessage(message, phoneNumberId) {
    const from = message.from;
    const messageBody = message.text?.body;
    
    if (messageBody) {
        try {
            const response = await handleMessage(from, messageBody);
            await sendMessage(from, response, phoneNumberId);
        } catch (error) {
            console.error('Error handling message:', error);
            await sendMessage(from, "I apologize, but I encountered a technical issue. Please try again or contact our support team.", phoneNumberId);
        }
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
        console.log('Message sent successfully');
    } catch (error) {
        console.error('Error sending message:', error.response?.data || error.message);
    }
}

// NLP Testing endpoints (only if NLP is available)
const nlpStatus = getNLPStatus();
if (nlpStatus.nlpAvailable) {
    // Test NLP endpoint
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

    // NLP Analytics
    app.get('/nlp-analytics', (req, res) => {
        const analytics = getNLPAnalytics();
        res.json(analytics);
    });

    // NLP Dashboard
    app.get('/nlp-dashboard', (req, res) => {
        const dashboardHtml = generateNLPDashboard();
        res.send(dashboardHtml);
    });
}

// Test ERP connection
app.get('/test-dotorders-erp', async (req, res) => {
    try {
        const result = await testERPConnection();
        res.json({
            status: 'success',
            message: 'ERPNext connection working!',
            data: result,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: 'ERPNext connection failed',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Session management
app.get('/sessions', (req, res) => {
    const sessions = getUserSessions();
    res.json({
        totalSessions: sessions.length,
        nlpAvailable: nlpStatus.nlpAvailable,
        nlpReady: nlpStatus.nlpReady,
        sessions: sessions
    });
});

// Enhanced homepage
app.get('/', (req, res) => {
    const businessData = getBusinessData();
    const analytics = getNLPAnalytics();
    const statusHtml = generateHomepage(businessData, analytics);
    res.send(statusHtml);
});

// HTML Generation Functions
function generateHomepage(businessData, analytics) {
    const avgResponseTime = analytics.responseTime.length > 0 
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
            .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin: 20px 0; }
            .stat-box { padding: 20px; background: linear-gradient(135deg, #2196F3, #1976D2); color: white; border-radius: 10px; text-align: center; }
            .stat-box h3 { margin: 0; font-size: 2em; }
            .feature { margin: 10px 0; padding: 10px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #2196F3; }
            .btn { display: inline-block; padding: 12px 24px; background: #2196F3; color: white; text-decoration: none; border-radius: 8px; margin: 5px; font-weight: bold; }
            .btn:hover { background: #1976D2; }
            .nlp-badge { background: ${nlpStatus.nlpAvailable ? '#4CAF50' : '#FF9800'}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.8em; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>?? ${nlpStatus.nlpAvailable ? 'AI-Powered ' : ''}Water Delivery Bot</h1>
                <p>Advanced WhatsApp Business Integration ${nlpStatus.nlpAvailable ? 'with Natural Language Processing' : ''}</p>
                <div class="nlp-badge">${nlpStatus.nlpAvailable ? (nlpStatus.nlpReady ? 'NLP READY' : 'NLP TRAINING') : 'BASIC MODE'}</div>
            </div>
            
            <div class="status">
                <h2 style="margin: 0 0 10px 0;">?? System Status: RUNNING</h2>
                <p><strong>Version:</strong> ${nlpStatus.nlpAvailable ? '3.0.0-NLP' : '2.0.0-Basic'} | 
                   <strong>Uptime:</strong> ${Math.floor(process.uptime())} seconds | 
                   <strong>Keep-alive:</strong> ${KEEP_ALIVE_URL ? 'ENABLED' : 'DISABLED'}</p>
            </div>
            
            <div class="stats">
                <div class="stat-box">
                    <h3>${businessData.activeSessions}</h3>
                    <p>Active Sessions</p>
                </div>
                <div class="stat-box">
                    <h3>${Object.keys(PRODUCTS).length}</h3>
                    <p>Products</p>
                </div>
                ${nlpStatus.nlpAvailable ? `
                <div class="stat-box">
                    <h3>${analytics.totalQueries}</h3>
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
                ${nlpStatus.nlpAvailable ? `
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
                    ${nlpStatus.nlpAvailable ? '<div class="feature"><strong>/test-nlp/[message]</strong> - Test NLP</div>' : ''}
                </div>
                
                <div class="card">
                    <h3>?? Business Features</h3>
                    <div class="feature">${nlpStatus.nlpAvailable ? 'Smart' : 'Keyword-based'} Order Processing</div>
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
}

function generateNLPDashboard() {
    return `
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
                background: ${nlpStatus.nlpReady ? 'linear-gradient(135deg, #4CAF50, #45a049)' : 'linear-gradient(135deg, #FF9800, #F57C00)'}; 
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
                NLP Engine: <strong>${nlpStatus.nlpReady ? '? READY' : '?? TRAINING'}</strong> | 
                Sessions: <strong>${getBusinessData().activeSessions}</strong> | 
                Queries: <strong>${getNLPAnalytics().totalQueries}</strong>
            </div>
            
            <div class="card">
                <h3>?? Test NLP Processing</h3>
                <div class="input-group">
                    <label>Test Message:</label>
                    <input type="text" id="testMessage" placeholder="Try: I need water for my office" maxlength="200">
                </div>
                <button class="btn" onclick="testMessage()" ${!nlpStatus.nlpReady ? 'disabled' : ''}>
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
}

// Session cleanup (remove inactive sessions after 1 hour)
setInterval(() => {
    const cleaned = cleanupSessions();
    if (cleaned > 0) {
        console.log(`?? Cleaned up ${cleaned} inactive sessions. Active: ${getBusinessData().activeSessions}`);
    }
}, 15 * 60 * 1000);

// Start server
app.listen(PORT, () => {
    console.log(`?? ${nlpStatus.nlpAvailable ? 'AI-Enhanced ' : ''}Water Delivery Bot starting on port ${PORT}`);
    console.log(`?? Features: ${nlpStatus.nlpAvailable ? 'NLP + ' : ''}Customer Service + Order Management + ERPNext Integration`);
    console.log(`?? Server URL: http://localhost:${PORT}`);
    if (nlpStatus.nlpAvailable) {
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