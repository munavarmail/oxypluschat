
app.get('/test-nlp/:message', async (req, res) => {
    try {
        const testMessage = decodeURIComponent(req.params.message);
        const mockSession = { state: 'greeting', orderInProgress: null };
        
        console.log(`?? Testing NLP with message: "${testMessage}"`);
        
        const nlpResult = await nlpProcessor.processMessage(testMessage, mockSession);
        const response = await generateEnhancedResponse(testMessage, mockSession, 'test-user');
        
        res.json({
            success: true,
            input: testMessage,
            nlp_analysis: {
                intent: nlpResult.intent.intent,
                confidence: nlpResult.intent.confidence,
                entities: nlpResult.entities,
                sentiment: nlpResult.sentiment.sentiment
            },
            suggested_response: response,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('NLP test error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Batch test multiple phrases
app.post('/test-nlp-batch', async (req, res) => {
    const { messages } = req.body;
    
    if (!Array.isArray(messages)) {
        return res.status(400).json({ error: 'messages must be an array' });
    }
    
    const results = [];
    
    for (const message of messages) {
        try {
            const mockSession = { state: 'greeting', orderInProgress: null };
            const nlpResult = await nlpProcessor.processMessage(message, mockSession);
            
            results.push({
                message,
                intent: nlpResult.intent.intent,
                confidence: nlpResult.intent.confidence,
                entities: nlpResult.entities,
                sentiment: nlpResult.sentiment.sentiment
            });
        } catch (error) {
            results.push({
                message,
                error: error.message
            });
        }
    }
    
    res.json({
        success: true,
        total_messages: messages.length,
        results
    });
});

// NLP model statistics
app.get('/nlp-stats', async (req, res) => {
    try {
        const stats = nlpProcessor.getModelStats();
        
        res.json({
            model_info: stats,
            active_sessions: userSessions.size,
            server_uptime: process.uptime(),
            memory_usage: process.memoryUsage(),
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add training data dynamically
app.post('/nlp-train', async (req, res) => {
    try {
        const { utterance, intent } = req.body;
        
        if (!utterance || !intent) {
            return res.status(400).json({ 
                error: 'utterance and intent are required' 
            });
        }
        
        await nlpProcessor.addTrainingData(utterance, intent);
        
        res.json({
            success: true,
            message: `Added training data: "${utterance}" -> ${intent}`,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// NLP Analytics Dashboard
app.get('/nlp-dashboard', (req, res) => {
    const dashboardHtml = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>NLP Testing Dashboard</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
            .container { max-width: 1200px; margin: 0 auto; }
            .test-section { background: white; padding: 20px; margin: 20px 0; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .input-group { margin: 15px 0; }
            .input-group label { display: block; margin-bottom: 5px; font-weight: bold; }
            .input-group input, .input-group textarea { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px; }
            .btn { background: #007bff; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; }
            .btn:hover { background: #0056b3; }
            .result { background: #f8f9fa; padding: 15px; margin: 10px 0; border-radius: 5px; border-left: 4px solid #007bff; }
            .intent { font-weight: bold; color: #28a745; }
            .confidence { color: #17a2b8; }
            .entities { color: #fd7e14; }
            .test-cases { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; }
            .test-case { background: #e9ecef; padding: 10px; border-radius: 5px; cursor: pointer; text-align: center; }
            .test-case:hover { background: #dee2e6; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>?? NLP Testing Dashboard</h1>
            
            <div class="test-section">
                <h2>Quick Test</h2>
                <div class="input-group">
                    <label>Test Message:</label>
                    <input type="text" id="testMessage" placeholder="Enter a message to test...">
                </div>
                <button class="btn" onclick="testMessage()">Test NLP</button>
                <div id="testResult"></div>
            </div>
            
            <div class="test-section">
                <h2>Pre-built Test Cases</h2>
                <p>Click any test case to run it:</p>
                <div class="test-cases">
                    <div class="test-case" onclick="runTest('hello there')">Greeting</div>
                    <div class="test-case" onclick="runTest('I want to order water')">Order Intent</div>
                    <div class="test-case" onclick="runTest('show me the menu')">Menu Request</div>
                    <div class="test-case" onclick="runTest('do you deliver to dubai')">Delivery Query</div>
                    <div class="test-case" onclick="runTest('how can I pay')">Payment Info</div>
                    <div class="test-case" onclick="runTest('I need help')">Help Request</div>
                    <div class="test-case" onclick="runTest('this service is terrible')">Complaint</div>
                    <div class="test-case" onclick="runTest('971501234567')">Phone Number</div>
                    <div class="test-case" onclick="runTest('I need 5 bottles urgently')">Complex Order</div>
                    <div class="test-case" onclick="runTest('can you deliver 10 gallons to sharjah tomorrow')">Complex Delivery</div>
                </div>
            </div>
            
            <div class="test-section">
                <h2>Batch Testing</h2>
                <div class="input-group">
                    <label>Multiple Messages (one per line):</label>
                    <textarea id="batchMessages" rows="6" placeholder="hello
I want water
show menu
delivery to dubai"></textarea>
                </div>
                <button class="btn" onclick="batchTest()">Run Batch Test</button>
                <div id="batchResults"></div>
            </div>
            
            <div class="test-section">
                <h2>Add Training Data</h2>
                <div class="input-group">
                    <label>New Utterance:</label>
                    <input type="text" id="newUtterance" placeholder="I want aqua bottles">
                </div>
                <div class="input-group">
                    <label>Intent:</label>
                    <select id="newIntent">
                        <option value="greeting">greeting</option>
                        <option value="order">order</option>
                        <option value="menu">menu</option>
                        <option value="delivery">delivery</option>
                        <option value="payment">payment</option>
                        <option value="help">help</option>
                        <option value="complaint">complaint</option>
                    </select>
                </div>
                <button class="btn" onclick="addTrainingData()">Add Training Data</button>
                <div id="trainingResult"></div>
            </div>
        </div>
        
        <script>
            async function testMessage() {
                const message = document.getElementById('testMessage').value;
                if (!message) {
                    alert('Please enter a message to test');
                    return;
                }
                
                try {
                    const response = await fetch('/test-nlp/' + encodeURIComponent(message));
                    const result = await response.json();
                    
                    document.getElementById('testResult').innerHTML = \`
                        <div class="result">
                            <strong>Input:</strong> \${result.input}<br>
                            <strong>Intent:</strong> <span class="intent">\${result.nlp_analysis.intent}</span><br>
                            <strong>Confidence:</strong> <span class="confidence">\${(result.nlp_analysis.confidence * 100).toFixed(1)}%</span><br>
                            <strong>Entities:</strong> <span class="entities">\${JSON.stringify(result.nlp_analysis.entities)}</span><br>
                            <strong>Sentiment:</strong> \${result.nlp_analysis.sentiment}<br>
                            <strong>Bot Response:</strong> <pre>\${result.suggested_response}</pre>
                        </div>
                    \`;
                } catch (error) {
                    document.getElementById('testResult').innerHTML = \`<div class="result" style="border-color: red;">Error: \${error.message}</div>\`;
                }
            }
            
            function runTest(message) {
                document.getElementById('testMessage').value = message;
                testMessage();
            }
            
            async function batchTest() {
                const messages = document.getElementById('batchMessages').value.split('\\n').filter(m => m.trim());
                
                if (messages.length === 0) {
                    alert('Please enter some messages to test');
                    return;
                }
                
                try {
                    const response = await fetch('/test-nlp-batch', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ messages })
                    });
                    
                    const result = await response.json();
                    
                    let html = '<h3>Batch Test Results:</h3>';
                    result.results.forEach(r => {
                        html += \`
                            <div class="result">
                                <strong>\${r.message}</strong><br>
                                Intent: <span class="intent">\${r.intent || 'ERROR'}</span> 
                                (Confidence: <span class="confidence">\${r.confidence ? (r.confidence * 100).toFixed(1) + '%' : 'N/A'}</span>)
                                \${r.error ? '<br><span style="color: red;">Error: ' + r.error + '</span>' : ''}
                            </div>
                        \`;
                    });
                    
                    document.getElementById('batchResults').innerHTML = html;
                } catch (error) {
                    document.getElementById('batchResults').innerHTML = \`<div class="result" style="border-color: red;">Error: \${error.message}</div>\`;
                }
            }
            
            async function addTrainingData() {
                const utterance = document.getElementById('newUtterance').value;
                const intent = document.getElementById('newIntent').value;
                
                if (!utterance) {
                    alert('Please enter an utterance');
                    return;
                }
                
                try {
                    const response = await fetch('/nlp-train', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ utterance, intent })
                    });
                    
                    const result = await response.json();
                    
                    document.getElementById('trainingResult').innerHTML = \`
                        <div class="result" style="border-color: green;">
                            \${result.message}
                        </div>
                    \`;
                    
                    document.getElementById('newUtterance').value = '';
                } catch (error) {
                    document.getElementById('trainingResult').innerHTML = \`<div class="result" style="border-color: red;">Error: \${error.message}</div>\`;
                }
            }
            
            // Auto-focus on the test input
            document.getElementById('testMessage').focus();
            
            // Enter key to test
            document.getElementById('testMessage').addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    testMessage();
                }
            });
        </script>
    </body>
    </html>
    `;
    
    res.send(dashboardHtml);
});

// Performance monitoring
let nlpAnalytics = {
    totalQueries: 0,
    intentDistribution: {},
    averageConfidence: 0,
    responseTime: [],
    errors: 0
};

function trackNLPPerformance(intent, confidence, responseTime, hasError = false) {
    nlpAnalytics.totalQueries++;
    
    if (hasError) {
        nlpAnalytics.errors++;
        return;
    }
    
    // Track intent distribution
    if (!nlpAnalytics.intentDistribution[intent]) {
        nlpAnalytics.intentDistribution[intent] = 0;
    }
    nlpAnalytics.intentDistribution[intent]++;
    
    // Track average confidence
    const totalConfidence = nlpAnalytics.averageConfidence * (nlpAnalytics.totalQueries - 1) + confidence;
    nlpAnalytics.averageConfidence = totalConfidence / nlpAnalytics.totalQueries;
    
    // Track response times (keep last 100)
    nlpAnalytics.responseTime.push(responseTime);
    if (nlpAnalytics.responseTime.length > 100) {
        nlpAnalytics.responseTime.shift();
    }
}

app.get('/nlp-analytics', (req, res) => {
    const avgResponseTime = nlpAnalytics.responseTime.length > 0 
        ? nlpAnalytics.responseTime.reduce((a, b) => a + b, 0) / nlpAnalytics.responseTime.length 
        : 0;
    
    res.json({
        ...nlpAnalytics,
        averageResponseTime: avgResponseTime,
        errorRate: nlpAnalytics.totalQueries > 0 ? (nlpAnalytics.errors / nlpAnalytics.totalQueries * 100).toFixed(2) : 0,
        timestamp: new Date().toISOString()
    });
});

// Integration wrapper for performance tracking
const originalProcessMessage = nlpProcessor.processMessage;
nlpProcessor.processMessage = async function(message, context) {
    const startTime = Date.now();
    
    try {
        const result = await originalProcessMessage.call(this, message, context);
        const responseTime = Date.now() - startTime;
        
        trackNLPPerformance(
            result.intent.intent,
            result.intent.confidence,
            responseTime,
            false
        );
        
        return result;
    } catch (error) {
        const responseTime = Date.now() - startTime;
        trackNLPPerformance(null, 0, responseTime, true);
        throw error;
    }
};