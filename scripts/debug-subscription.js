#!/usr/bin/env node

/**
 * Subscription Debug Script
 * 
 * This script helps debug subscription issues by checking:
 * 1. Current user profile data in Supabase
 * 2. Recent webhook events from Stripe
 * 3. Environment configuration
 */

const https = require('https')
const http = require('http')

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000'

async function makeRequest(path, options = {}) {
  const url = new URL(path, BASE_URL)
  const isHttps = url.protocol === 'https:'
  const client = isHttps ? https : http
  
  return new Promise((resolve, reject) => {
    const req = client.request(url, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
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

async function checkEnvironment() {
  console.log('🔧 Environment Check')
  console.log('==================')
  
  const requiredVars = [
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY'
  ]
  
  for (const varName of requiredVars) {
    const value = process.env[varName]
    if (value) {
      const masked = varName.includes('SECRET') || varName.includes('KEY') 
        ? value.substring(0, 8) + '...' 
        : value
      console.log(`✅ ${varName}: ${masked}`)
    } else {
      console.log(`❌ ${varName}: Not set`)
    }
  }
  console.log()
}

async function checkWebhookEndpoint() {
  console.log('🔗 Webhook Endpoint Check')
  console.log('=========================')
  
  try {
    const result = await makeRequest('/api/webhooks/stripe', {
      method: 'POST',
      body: { test: 'ping' }
    })
    
    if (result.status === 400 && result.data.includes('stripe-signature')) {
      console.log('✅ Webhook endpoint is accessible and validating signatures')
    } else {
      console.log(`⚠️  Unexpected response: ${result.status} - ${result.data}`)
    }
  } catch (error) {
    console.log(`❌ Webhook endpoint error: ${error.message}`)
  }
  console.log()
}

async function checkPricesEndpoint() {
  console.log('💰 Prices Endpoint Check')
  console.log('========================')
  
  try {
    const result = await makeRequest('/api/stripe/prices')
    
    if (result.status === 200) {
      console.log('✅ Prices endpoint working')
      for (const [plan, details] of Object.entries(result.data)) {
        console.log(`   ${plan}: ${details.currency?.toUpperCase()} ${(details.unitAmount || 0) / 100}/${details.interval}`)
      }
    } else {
      console.log(`❌ Prices endpoint failed: ${result.status}`)
    }
  } catch (error) {
    console.log(`❌ Prices endpoint error: ${error.message}`)
  }
  console.log()
}

async function debugSubscription() {
  console.log('🔍 CheckPay Subscription Debug')
  console.log('==============================')
  console.log()
  
  await checkEnvironment()
  await checkWebhookEndpoint()
  await checkPricesEndpoint()
  
  console.log('📋 Next Steps for Debugging:')
  console.log('============================')
  console.log('1. Check your Supabase profiles table:')
  console.log('   SELECT id, stripe_customer_id, stripe_subscription_status, stripe_current_period_end')
  console.log('   FROM profiles WHERE stripe_customer_id IS NOT NULL;')
  console.log()
  console.log('2. Check Stripe Dashboard:')
  console.log('   - Go to Developers → Events')
  console.log('   - Look for recent checkout.session.completed events')
  console.log('   - Check if webhooks are being delivered successfully')
  console.log()
  console.log('3. Check your app logs:')
  console.log('   - Look for webhook processing logs')
  console.log('   - Check for any error messages during subscription updates')
  console.log()
  console.log('4. Test the complete flow:')
  console.log('   - Sign in to your app')
  console.log('   - Go to /pricing and start a new checkout')
  console.log('   - Use test card: 4242424242424242')
  console.log('   - Complete the checkout')
  console.log('   - Check /account/billing immediately after')
  console.log()
  console.log('5. Manual webhook test:')
  console.log('   - stripe trigger checkout.session.completed')
  console.log('   - Check if the event appears in your webhook logs')
}

// Run debug
debugSubscription().catch(console.error)
