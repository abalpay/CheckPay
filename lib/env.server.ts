import 'server-only'

type ServerEnv = {
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_PORTAL_RETURN_URL: string;
  STRIPE_PRICE_MONTHLY?: string;
  STRIPE_PRICE_YEARLY?: string;
  STRIPE_PRICE_LOOKUP_MONTHLY?: string;
  STRIPE_PRICE_LOOKUP_YEARLY?: string;
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?: string;
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
    STRIPE_PORTAL_RETURN_URL: requireEnv('STRIPE_PORTAL_RETURN_URL'),
    STRIPE_PRICE_MONTHLY: process.env.STRIPE_PRICE_MONTHLY,
    STRIPE_PRICE_YEARLY: process.env.STRIPE_PRICE_YEARLY,
    STRIPE_PRICE_LOOKUP_MONTHLY: process.env.STRIPE_PRICE_LOOKUP_MONTHLY,
    STRIPE_PRICE_LOOKUP_YEARLY: process.env.STRIPE_PRICE_LOOKUP_YEARLY,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  }
}






