/**
 * Environment variable helpers with friendly runtime errors
 * Reads public environment variables and validates they exist
 */

interface PublicEnv {
  N8N_ANALYZE_URL: string;
  APP_URL: string;
}

/**
 * Get a public environment variable with friendly error if missing
 */
function getPublicEnv(key: string): string {
  const value = process.env[`NEXT_PUBLIC_${key}`];
  if (!value) {
    throw new Error(
      `Missing required environment variable: NEXT_PUBLIC_${key}. ` +
      `Please add it to your .env file.`
    );
  }
  return value;
}

/**
 * Get all required public environment variables
 * Throws friendly errors if any are missing
 */
export function getEnv(): PublicEnv {
  return {
    N8N_ANALYZE_URL: getPublicEnv('N8N_ANALYZE_URL'),
    APP_URL: getPublicEnv('APP_URL'),
  };
}