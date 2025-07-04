import { ValidationError } from '@/types';

// Re-export for convenience
export { ValidationError };

// Input validation utilities
export const validateRequired = (value: string | null | undefined, fieldName: string): string => {
  if (!value || value.trim() === '') {
    throw new ValidationError(`${fieldName} is required`, fieldName);
  }
  return value.trim();
};

export const validateString = (
  value: string | null | undefined,
  fieldName: string,
  options: {
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    pattern?: RegExp;
  } = {}
): string => {
  const { required = false, minLength = 0, maxLength = 1000, pattern } = options;

  if (!value || value.trim() === '') {
    if (required) {
      throw new ValidationError(`${fieldName} is required`, fieldName);
    }
    return '';
  }

  const trimmed = value.trim();

  if (trimmed.length < minLength) {
    throw new ValidationError(
      `${fieldName} must be at least ${minLength} characters long`,
      fieldName
    );
  }

  if (trimmed.length > maxLength) {
    throw new ValidationError(
      `${fieldName} must be no more than ${maxLength} characters long`,
      fieldName
    );
  }

  if (pattern && !pattern.test(trimmed)) {
    throw new ValidationError(
      `${fieldName} has an invalid format`,
      fieldName
    );
  }

  return trimmed;
};

export const validateNumber = (
  value: string | number | null | undefined,
  fieldName: string,
  options: {
    required?: boolean;
    min?: number;
    max?: number;
    integer?: boolean;
  } = {}
): number => {
  const { required = false, min = -Infinity, max = Infinity, integer = false } = options;

  if (value === null || value === undefined || value === '') {
    if (required) {
      throw new ValidationError(`${fieldName} is required`, fieldName);
    }
    return 0;
  }

  const num = typeof value === 'string' ? parseFloat(value) : value;

  if (isNaN(num)) {
    throw new ValidationError(`${fieldName} must be a valid number`, fieldName);
  }

  if (integer && !Number.isInteger(num)) {
    throw new ValidationError(`${fieldName} must be an integer`, fieldName);
  }

  if (num < min) {
    throw new ValidationError(
      `${fieldName} must be at least ${min}`,
      fieldName
    );
  }

  if (num > max) {
    throw new ValidationError(
      `${fieldName} must be no more than ${max}`,
      fieldName
    );
  }

  return num;
};

export const validateCoordinates = (
  lat: string | number | null | undefined,
  lon: string | number | null | undefined
): { lat: number; lon: number } => {
  const latitude = validateNumber(lat, 'latitude', {
    required: true,
    min: -90,
    max: 90
  });

  const longitude = validateNumber(lon, 'longitude', {
    required: true,
    min: -180,
    max: 180
  });

  return { lat: latitude, lon: longitude };
};

export const validateBusLineId = (id: string | null | undefined): string => {
  return validateString(id, 'bus line ID', {
    required: true,
    minLength: 1,
    maxLength: 100,
    pattern: /^[A-Za-z0-9_\-\+\s]+$/
  });
};

export const validateStopId = (id: string | null | undefined): string => {
  return validateString(id, 'stop ID', {
    required: true,
    minLength: 1,
    maxLength: 100,
    pattern: /^[A-Za-z0-9_\-\+\s]+$/
  });
};

export const validateSearchQuery = (query: string | null | undefined): string => {
  return validateString(query, 'search query', {
    required: false,
    minLength: 1,
    maxLength: 50,
    pattern: /^[A-Za-z0-9\s\-\+]+$/
  });
};

// Sanitization utilities
export const sanitizeString = (str: string): string => {
  return str
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .replace(/['"]/g, '') // Remove quotes
    .trim();
};

export const sanitizeSearchQuery = (query: string): string => {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s\-\+]/g, '') // Keep only alphanumeric, spaces, hyphens, and plus signs
    .trim();
};

// Type guards
export const isBusLine = (obj: unknown): obj is import('@/types').BusLine => {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'shortName' in obj &&
    'longName' in obj &&
    'description' in obj &&
    'agencyId' in obj
  );
};

export const isBusStop = (obj: unknown): obj is import('@/types').BusStop => {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'code' in obj &&
    'name' in obj &&
    'direction' in obj &&
    'sequence' in obj &&
    'lat' in obj &&
    'lon' in obj
  );
};

// Get client identifier for rate limiting
export const getClientId = (request: { headers: { get: (name: string) => string | null } }): string => {
  // Try to get real IP from various headers
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const remoteAddr = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip');
  
  if (forwarded) {
    const ips = forwarded.split(',');
    return ips[0].trim();
  }
  
  if (realIp) {
    return realIp;
  }
  
  if (remoteAddr) {
    return remoteAddr;
  }
  
  // Fallback to user agent + a random component for some differentiation
  const userAgent = request.headers.get('user-agent') || '';
  return `anonymous-${userAgent.slice(0, 20)}`;
};

// Rate limiting utilities
export const isRateLimited = (
  requests: Map<string, number[]>,
  identifier: string,
  limit: number = 60, // requests per minute
  window: number = 60000 // 1 minute in milliseconds
): boolean => {
  const now = Date.now();
  const userRequests = requests.get(identifier) || [];
  
  // Remove old requests outside the window
  const recentRequests = userRequests.filter(timestamp => now - timestamp < window);
  
  if (recentRequests.length >= limit) {
    return true;
  }
  
  // Add current request
  recentRequests.push(now);
  requests.set(identifier, recentRequests);
  
  return false;
};