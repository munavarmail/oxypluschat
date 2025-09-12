// ERPNext Integration Module for Water Delivery Bot

const axios = require('axios');

// dotorders ERP Configuration
const DOTORDERS_ERP_URL = process.env.DOTORDERS_ERP_URL;
const DOTORDERS_ERP_API_KEY = process.env.DOTORDERS_ERP_API_KEY;
const DOTORDERS_ERP_API_SECRET = process.env.DOTORDERS_ERP_API_SECRET;

// Test ERP connection
async function testERPConnection() {
    try {
        const response = await axios.get(`${DOTORDERS_ERP_URL}/api/method/frappe.auth.get_logged_user`, {
            headers: {
                'Authorization': `token ${DOTORDERS_ERP_API_KEY}:${DOTORDERS_ERP_API_SECRET}`,
                'Content-Type': 'application/json'
            }
        });
        return response.data;
    } catch (error) {
        throw new Error(`ERPNext connection failed: ${error.response?.data || error.message}`);
    }
}

// Enhanced customer lookup with comprehensive information
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
• "Order water" - Natural language ordering
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

// Get customer address information
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

// Get custom documents related to customer
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

// Get specific document details
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
            custom_order_source: 'WhatsApp AI Bot'
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

// Main function to create an order (used by business logic)
async function createOrder(orderInfo) {
    try {
        // First, ensure customer exists in ERP
        const customerResult = await ensureCustomerExists(orderInfo);
        
        if (!customerResult.success) {
            return {
                success: false,
                message: `*ORDER PROCESSING ERROR*\n\n${customerResult.message}\n\nPlease try again or contact our support team for assistance.`
            };
        }
        
        // Create order in ERPNext
        const erpOrder = await createERPOrder(orderInfo, customerResult.customerName);
        
        if (erpOrder.success) {
            return {
                success: true,
                orderName: erpOrder.orderName,
                message: `*ORDER CONFIRMED* ?

*Order ID:* ${erpOrder.orderName}
*Product:* ${orderInfo.product.name}
*Total:* AED ${orderInfo.product.price + orderInfo.product.deposit}

*Next Steps:*
Our delivery team will contact you within 2 hours to schedule delivery.

*Delivery Areas:*
Dubai, Sharjah, Ajman

Thank you for choosing our AI-powered service!`
            };
        } else {
            return {
                success: false,
                message: handleOrderError(erpOrder.error, erpOrder.errorType)
            };
        }
        
    } catch (error) {
        console.error('Error processing order:', error);
        return {
            success: false,
            message: `*ORDER PROCESSING ERROR*

There was a technical issue while processing your order. Our team has been notified.

Please try again in a few minutes or contact support directly.`
        };
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

// Export functions
module.exports = {
    testERPConnection,
    getCustomerByMobile,
    createOrder,
    ensureCustomerExists,
    createERPCustomer,
    createCustomerAddress,
    createERPOrder
};