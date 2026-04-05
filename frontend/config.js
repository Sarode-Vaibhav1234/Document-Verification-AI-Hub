// Configuration file for frontend API routing
// In production (Vercel), change API_BASE_URL to your Render deployment URL.
// Example: window.API_BASE_URL = 'https://document-ai-hub.onrender.com';

window.API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : 'https://document-verification-ai-hub.onrender.com';  // CHANGE THIS to your exact Render URL 
