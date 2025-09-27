/**
 * Server-only environment variable helpers for Stripe
 */

type ServerEnv = {
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_PRICE_ID_MONTHLY: string;
  STRIPE_PRICE_ID_YEARLY: string;
  STRIPE_PUBLISHABLE_KEY?: string;
};

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}. Please add it to your .env.local`);
  }
  return value;
}

export function getServerEnv(): ServerEnv {
  return {
    STRIPE_SECRET_KEY: requireEnv('STRIPE_SECRET_KEY'),
    STRIPE_WEBHOOK_SECRET: requireEnv('STRIPE_WEBHOOK_SECRET'),
    STRIPE_PRICE_ID_MONTHLY: requireEnv('STRIPE_PRICE_ID_MONTHLY'),
    STRIPE_PRICE_ID_YEARLY: requireEnv('STRIPE_PRICE_ID_YEARLY'),
    STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY,
  };
}






