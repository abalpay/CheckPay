# Stripe Integration Testing Guide

## Prerequisites

### 1. Environment Setup

Create a `.env.local` file with these variables:

```bash
# Stripe Test Configuration
STRIPE_SECRET_KEY=sk_test_... # Your Stripe test secret key
STRIPE_WEBHOOK_SECRET=whsec_... # Webhook endpoint secret (set up later)
STRIPE_PORTAL_RETURN_URL=http://localhost:3000/account/billing
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_... # Your Stripe test publishable key

# Price Configuration (choose one approach)
# Option 1: Direct Price IDs
STRIPE_PRICE_MONTHLY=price_... # Monthly price ID from Stripe
STRIPE_PRICE_YEARLY=price_... # Yearly price ID from Stripe

# Option 2: Lookup Keys (recommended for flexibility)
STRIPE_PRICE_LOOKUP_MONTHLY=monthly-plan
STRIPE_PRICE_LOOKUP_YEARLY=yearly-plan
```

### 2. Stripe Dashboard Setup

1. **Create Products & Prices**:
   - Go to Stripe Dashboard → Products
   - Create a product (e.g., "CheckPay Subscription")
   - Add two recurring prices:
     - Monthly: $X/month with lookup key `monthly-plan`
     - Yearly: $Y/year with lookup key `yearly-plan`

2. **Configure Webhooks**:
   - Go to Developers → Webhooks
   - Add endpoint: `http://localhost:3000/api/webhooks/stripe`
   - Select events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
   - Copy the webhook secret to your `.env.local`

## Testing Scenarios

### 1. API Endpoints Testing

#### Test Prices API
```bash
curl http://localhost:3000/api/stripe/prices
```
**Expected**: Returns monthly and yearly price details

#### Test Checkout Creation
```bash
curl -X POST http://localhost:3000/api/stripe/checkout \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SUPABASE_JWT" \
  -d '{"plan": "monthly"}'
```
**Expected**: Returns checkout session URL

#### Test Portal Access
```bash
curl -X POST http://localhost:3000/api/stripe/portal \
  -H "Authorization: Bearer YOUR_SUPABASE_JWT"
```
**Expected**: Returns billing portal URL

### 2. User Flow Testing

#### Complete Subscription Flow
1. **Sign up/Login** to your app
2. **Navigate to pricing page** (`/pricing`)
3. **Click subscription button** for monthly or yearly plan
4. **Complete checkout** using Stripe test cards:
   - Success: `4242424242424242`
   - Decline: `4000000000000002`
   - 3D Secure: `4000002500003155`

#### Billing Management
1. **Go to account billing** (`/account/billing`)
2. **Click "Manage Billing"** button
3. **Test portal features**:
   - Update payment method
   - Cancel subscription
   - Download invoices
   - View billing history

### 3. Webhook Testing

#### Local Webhook Testing with Stripe CLI
1. **Install Stripe CLI**: `brew install stripe/stripe-cli/stripe`
2. **Login**: `stripe login`
3. **Forward events**: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
4. **Trigger test events**:
   ```bash
   stripe trigger checkout.session.completed
   stripe trigger customer.subscription.updated
   stripe trigger customer.subscription.deleted
   ```

#### Manual Webhook Testing
1. Complete a real checkout in test mode
2. Check your app logs for webhook processing
3. Verify database updates in Supabase:
   - `stripe_customer_id` populated
   - `stripe_subscription_id` set
   - `stripe_subscription_status` updated
   - `stripe_current_period_end` set

### 4. Database Verification

Check your Supabase `profiles` table after each test:

```sql
SELECT 
  id,
  stripe_customer_id,
  stripe_subscription_id,
  stripe_subscription_status,
  stripe_current_period_end,
  stripe_price_identifier
FROM profiles 
WHERE stripe_customer_id IS NOT NULL;
```

### 5. Error Scenarios

#### Test Error Handling
1. **Invalid price configuration**: Remove price IDs from env
2. **Webhook signature mismatch**: Use wrong webhook secret
3. **Network failures**: Disconnect internet during checkout
4. **Database errors**: Test with invalid Supabase credentials

#### Expected Error Responses
- `401 Unauthorized`: Missing or invalid authentication
- `404 Profile not found`: User profile doesn't exist
- `500 Internal Server Error`: Stripe API or database errors

### 6. Subscription States Testing

Test different subscription states:

1. **Active subscription**: Normal flow
2. **Cancelled subscription**: Cancel via portal, verify access
3. **Past due**: Use card that fails after initial success
4. **Trialing**: Set up trial periods in Stripe
5. **Incomplete**: Test failed payments

### 7. Test Cards Reference

| Scenario | Card Number | Expected Result |
|----------|-------------|-----------------|
| Success | 4242424242424242 | Payment succeeds |
| Decline | 4000000000000002 | Payment declined |
| 3D Secure | 4000002500003155 | Requires authentication |
| Insufficient funds | 4000000000009995 | Insufficient funds |
| Expired card | 4000000000000069 | Expired card |

### 8. Monitoring & Debugging

#### Check Logs
- **Browser Console**: Client-side errors
- **Next.js Console**: Server-side logs
- **Stripe Dashboard**: Event logs and webhook deliveries
- **Supabase Logs**: Database operation logs

#### Common Issues
1. **CORS errors**: Check origin headers in checkout
2. **Webhook failures**: Verify endpoint URL and signature
3. **Price resolution**: Ensure price IDs or lookup keys exist
4. **Authentication**: Verify JWT tokens and user sessions

## Automated Testing

### Unit Tests for Stripe Functions

Create test files for your Stripe utilities:

```typescript
// lib/stripe.test.ts
import { resolvePriceId, resolvePlanFromIdentifier } from './stripe'

describe('Stripe utilities', () => {
  it('should resolve price ID for monthly plan', async () => {
    const priceId = await resolvePriceId('monthly')
    expect(priceId).toMatch(/^price_/)
  })

  it('should resolve plan from identifier', () => {
    const plan = resolvePlanFromIdentifier('monthly-plan')
    expect(plan).toBe('monthly')
  })
})
```

### Integration Tests

Test your API endpoints with supertest:

```typescript
// app/api/stripe/checkout/route.test.ts
import { POST } from './route'

describe('/api/stripe/checkout', () => {
  it('should create checkout session for authenticated user', async () => {
    // Mock authenticated request
    const response = await POST(mockRequest)
    expect(response.status).toBe(200)
  })
})
```

## Production Checklist

Before going live:

- [ ] Switch to live Stripe keys
- [ ] Update webhook endpoints to production URLs
- [ ] Test with real payment methods
- [ ] Verify tax calculations (if applicable)
- [ ] Set up monitoring and alerts
- [ ] Test subscription lifecycle management
- [ ] Verify compliance requirements (PCI DSS, etc.)

## Troubleshooting

### Common Error Messages

1. **"Missing required environment variable"**: Check `.env.local` setup
2. **"No active Stripe price found"**: Verify price IDs/lookup keys in Stripe
3. **"Signature verification failed"**: Check webhook secret configuration
4. **"Profile not found"**: Ensure user profile exists in Supabase

### Debug Steps

1. Check environment variables are loaded
2. Verify Stripe dashboard configuration
3. Test API endpoints individually
4. Check webhook delivery logs
5. Verify database schema and permissions
