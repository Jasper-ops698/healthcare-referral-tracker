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
const getApiBaseUrl = (): string => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  if (window.location.origin.includes('localhost')) {
    return 'http://localhost:3001';
  }
  // Production: backend runs on Render, frontend on Kimi — different domains
  return 'https://healthcare-referral-tracker.onrender.com';
};

export const API_BASE_URL = getApiBaseUrl();

// App version
export const APP_VERSION = '1.0.0-production';
