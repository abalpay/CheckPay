#!/usr/bin/env node

/**
 * Stripe Integration Test Script
 * 
 * This script helps you test your Stripe integration endpoints
 * Run with: node scripts/test-stripe.js
 */

const https = require('https')
const http = require('http')

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000'
const TEST_JWT = process.env.TEST_JWT // You'll need to get this from your app

async function makeRequest(path, options = {}) {
  const url = new URL(path, BASE_URL)
  const isHttps = url.protocol === 'https:'
  const client = isHttps ? https : http
  
  return new Promise((resolve, reject) => {
    const req = client.request(url, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(TEST_JWT && { 'Authorization': `Bearer ${TEST_JWT}` }),
        ...options.headers
      }
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          resolve({ status: res.statusCode, data: json })
        } catch (e) {
          resolve({ status: res.statusCode, data })
        }
      })
    })
    
    req.on('error', reject)
    
    if (options.body) {
      req.write(JSON.stringify(options.body))
    }
    
    req.end()
  })
}

async function testPricesEndpoint() {
  console.log('🧪 Testing /api/stripe/prices...')
  
  try {
    const result = await makeRequest('/api/stripe/prices')
    
    if (result.status === 200) {
      console.log('✅ Prices endpoint working')
      console.log('📊 Available plans:', Object.keys(result.data))
      
      // Validate price structure
      for (const [plan, details] of Object.entries(result.data)) {
        if (details.unitAmount && details.currency && details.interval) {
          console.log(`   ${plan}: ${details.currency.toUpperCase()} ${details.unitAmount / 100}/${details.interval}`)
        } else {
          console.log(`   ⚠️  ${plan}: Missing price details`)
        }
      }
    } else {
      console.log('❌ Prices endpoint failed:', result.status, result.data)
    }
  } catch (error) {
    console.log('❌ Prices endpoint error:', error.message)
  }
}

async function testCheckoutEndpoint() {
  console.log('\\n🧪 Testing /api/stripe/checkout...')
  
  if (!TEST_JWT) {
    console.log('⚠️  Skipping checkout test - no TEST_JWT provided')
    console.log('   Set TEST_JWT environment variable with a valid JWT token')
    return
  }
  
  try {
    const result = await makeRequest('/api/stripe/checkout', {
      method: 'POST',
      body: { plan: 'monthly' }
    })
    
    if (result.status === 200 && result.data.url) {
      console.log('✅ Checkout endpoint working')
      console.log('🔗 Checkout URL generated:', result.data.url.substring(0, 50) + '...')
    } else if (result.status === 401) {
      console.log('❌ Checkout endpoint: Unauthorized (check TEST_JWT)')
    } else {
      console.log('❌ Checkout endpoint failed:', result.status, result.data)
    }
  } catch (error) {
    console.log('❌ Checkout endpoint error:', error.message)
  }
}

async function testPortalEndpoint() {
  console.log('\\n🧪 Testing /api/stripe/portal...')
  
  if (!TEST_JWT) {
    console.log('⚠️  Skipping portal test - no TEST_JWT provided')
    return
  }
  
  try {
    const result = await makeRequest('/api/stripe/portal', {
      method: 'POST'
    })
    
    if (result.status === 200 && result.data.url) {
      console.log('✅ Portal endpoint working')
      console.log('🔗 Portal URL generated:', result.data.url.substring(0, 50) + '...')
    } else if (result.status === 401) {
      console.log('❌ Portal endpoint: Unauthorized (check TEST_JWT)')
    } else {
      console.log('❌ Portal endpoint failed:', result.status, result.data)
    }
  } catch (error) {
    console.log('❌ Portal endpoint error:', error.message)
  }
}

async function testWebhookEndpoint() {
  console.log('\\n🧪 Testing /api/webhooks/stripe...')
  
  try {
    // Test without signature (should fail)
    const result = await makeRequest('/api/webhooks/stripe', {
      method: 'POST',
      body: { type: 'test' }
    })
    
    if (result.status === 400 && result.data.includes('stripe-signature')) {
      console.log('✅ Webhook endpoint properly validates signatures')
    } else {
      console.log('⚠️  Webhook endpoint response:', result.status, result.data)
    }
  } catch (error) {
    console.log('❌ Webhook endpoint error:', error.message)
  }
}

async function runTests() {
  console.log('🚀 Starting Stripe Integration Tests')
  console.log('📍 Base URL:', BASE_URL)
  console.log('🔑 JWT Token:', TEST_JWT ? 'Provided' : 'Not provided')
  
  await testPricesEndpoint()
  await testCheckoutEndpoint()
  await testPortalEndpoint()
  await testWebhookEndpoint()
  
  console.log('\\n✨ Tests completed!')
  console.log('\\n💡 Next steps:')
  console.log('   1. Set up products and prices in Stripe Dashboard')
  console.log('   2. Configure webhook endpoints')
  console.log('   3. Test with Stripe CLI: stripe listen --forward-to localhost:3000/api/webhooks/stripe')
  console.log('   4. Test checkout flow in browser')
}

// Run tests
runTests().catch(console.error)
