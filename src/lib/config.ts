/**
 * System Configuration Constants
 */

// Primary admin — cannot be deleted or demoted
export const PRIMARY_ADMIN_EMAIL = 'bkitib@gmail.com';

// Check if a user is the primary admin
export const isPrimaryAdmin = (email: string): boolean => {
  return email === PRIMARY_ADMIN_EMAIL;
};

// Server API base URL
// When frontend + backend are on the same domain (Render unified hosting),
// use relative URLs so API calls go to the same origin.
// When they're on different domains (e.g., Kimi frontend + Render backend),
// use the absolute backend URL.
const getApiBaseUrl = (): string => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  if (window.location.origin.includes('localhost')) {
    return 'http://localhost:3001';
  }
  // Detect unified hosting (frontend served by Express from same domain)
  // If the current page was served from the API server, use relative URLs
  if (window.location.pathname.startsWith('/api/')) {
    return '';
  }
  // Render unified hosting: frontend + backend on same domain
  // The Express server serves both API and static dist/ files
  if (window.location.hostname.includes('onrender.com')) {
    return ''; // relative URLs — same domain
  }
  // Fallback for any other unified deployment
  return '';
};

export const API_BASE_URL = getApiBaseUrl();

// App version
export const APP_VERSION = '1.0.0-production';
