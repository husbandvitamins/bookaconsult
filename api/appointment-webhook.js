// api/appointment-webhook.js
// Vercel Serverless Function for Shopify Appointment Tag Management

export default async function handler(req, res) {
  // Set CORS headers for frontend access
  res.setHeader('Access-Control-Allow-Origin', 'https://husbandvitamins.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Source');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      error: 'Method not allowed',
      message: 'Only POST requests are supported' 
    });
  }
  
  try {
    // Get request data
    const { 
      customer_id, 
      customer_email, 
      appointment_details,
      customer_tags_before,
      timestamp 
    } = req.body;
    
    // Validate required fields
    if (!customer_id || !customer_email) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['customer_id', 'customer_email']
      });
    }
    
    console.log(`🎯 Processing appointment for customer: ${customer_email} (ID: ${customer_id})`);
    console.log(`📋 Appointment: ${appointment_details?.event_type} with ${appointment_details?.assigned_to}`);
    
    // Update customer tags
    const result = await updateCustomerTags(customer_id, customer_tags_before);
    
    // Log success
    console.log(`✅ Successfully processed appointment for ${customer_email}`);
    
    // Return success response
    res.status(200).json({ 
      success: true,
      message: `Successfully processed appointment for ${customer_email}`,
      customer_id: customer_id,
      appointment_type: appointment_details?.event_type,
      processed_at: new Date().toISOString(),
      tags_updated: result.tags_updated,
      previous_tags: customer_tags_before,
      new_tags: result.new_tags
    });
    
  } catch (error) {
    console.error('❌ Error processing appointment:', error);
    
    // Return error response
    res.status(500).json({ 
      error: 'Failed to process appointment',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

async function updateCustomerTags(customerId, currentTagsString) {
  // Environment variables (set these in Vercel dashboard)
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
  const SHOP_DOMAIN = process.env.SHOP_DOMAIN;
  
  if (!SHOPIFY_ACCESS_TOKEN || !SHOP_DOMAIN) {
    throw new Error('Missing Shopify configuration. Please set SHOPIFY_ACCESS_TOKEN and SHOP_DOMAIN environment variables.');
  }
  
  console.log(`🔄 Updating tags for customer ${customerId}`);
  console.log(`📋 Current tags: ${currentTagsString}`);
  
  // If we have current tags from frontend, use them, otherwise fetch from Shopify
  let currentTags = currentTagsString;
  
  if (!currentTags) {
    console.log('📡 Fetching current customer data from Shopify...');
    
    // Get current customer data
    const customerResponse = await fetch(`https://${SHOP_DOMAIN}/admin/api/2024-01/customers/${customerId}.json`, {
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
        'Content-Type': 'application/json'
      }
    });
    
    if (!customerResponse.ok) {
      throw new Error(`Failed to fetch customer data: ${customerResponse.status} ${customerResponse.statusText}`);
    }
    
    const customerData = await customerResponse.json();
    currentTags = customerData.customer.tags || '';
  }
  
  // Process tags: remove 'appointment-eligible' and add 'appointment-booked'
  const tagsArray = currentTags
    .split(',')
    .map(tag => tag.trim())
    .filter(tag => tag !== '' && tag !== 'appointment-eligible'); // Remove empty and appointment-eligible
  
  // Add appointment-booked if not already present
  if (!tagsArray.includes('appointment-booked')) {
    tagsArray.push('appointment-booked');
  }
  
  const updatedTags = tagsArray.join(',');
  
  console.log(`🔄 Updating tags from: "${currentTags}" to: "${updatedTags}"`);
  
  // Update customer tags via Shopify API
  const updateResponse = await fetch(`https://${SHOP_DOMAIN}/admin/api/2024-01/customers/${customerId}.json`, {
    method: 'PUT',
    headers: {
      'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      customer: {
        id: customerId,
        tags: updatedTags
      }
    })
  });
  
  if (!updateResponse.ok) {
    const errorText = await updateResponse.text();
    throw new Error(`Failed to update customer tags: ${updateResponse.status} ${updateResponse.statusText} - ${errorText}`);
  }
  
  const updateResult = await updateResponse.json();
  
  console.log(`✅ Tags updated successfully for customer ${customerId}`);
  
  return {
    tags_updated: true,
    previous_tags: currentTags,
    new_tags: updatedTags,
    customer_data: updateResult.customer
  };
}
