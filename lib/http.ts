/**
 * HTTP utilities with timeout, retries, and normalized error handling
 * No external dependencies, browser-compatible
 */

interface HttpError {
  field?: string;
  message: string;
  status?: number;
}

interface FetchOptions extends RequestInit {
  timeout?: number;
  retries?: number;
}

/**
 * Create an AbortController that times out after specified milliseconds
 */
function createTimeoutController(timeoutMs: number): AbortController {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller;
}

/**
 * Normalize various error types into a consistent HttpError format
 * Strips stack traces and other sensitive data for UI consumption
 */
function normalizeError(error: unknown, status?: number): HttpError {
  if (error instanceof Error) {
    if (error.name === 'AbortError') {
      return {
        message: 'Request timed out. Please try again.',
        status: 408,
      };
    }
    return {
      message: error.message || 'An unexpected error occurred',
      status,
    };
  }
  
  if (typeof error === 'string') {
    return { message: error, status };
  }
  
  return {
    message: 'An unexpected error occurred',
    status,
  };
}

/**
 * Fetch JSON with timeout and retry logic
 * Returns parsed JSON on success, throws normalized HttpError on failure
 */
export async function fetchJSON<T = any>(
  url: string, 
  options: FetchOptions = {}
): Promise<T> {
  const { timeout = 20000, retries = 2, ...fetchOptions } = options;
  
  let lastError: unknown;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = createTimeoutController(timeout);
      
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
      
      const data = await response.json();
      return data;
      
    } catch (error) {
      lastError = error;
      
      // Don't retry on client errors (4xx)
      if (error instanceof Error && error.message.includes('HTTP 4')) {
        break;
      }
      
      // Don't retry on the last attempt
      if (attempt === retries) {
        break;
      }
      
      // Wait before retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }
  
  throw normalizeError(lastError);
}

/**
 * POST multipart form data with timeout and retry logic
 * Returns parsed JSON on success, throws normalized HttpError on failure
 */
export async function postMultipart<T = any>(
  url: string, 
  formData: FormData,
  options: FetchOptions = {}
): Promise<T> {
  return fetchJSON<T>(url, {
    ...options,
    method: 'POST',
    body: formData,
    headers: {
      // Don't set Content-Type header - let browser set it with boundary for multipart
      ...options.headers,
    },
  });
}