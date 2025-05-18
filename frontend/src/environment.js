// src/utils/server.js or config.js

const IS_PROD = false; // Set this to `true` when deploying to production

const server = IS_PROD
  ? "https://your-production-backend.com" // Replace with your real backend domain
  : "http://localhost:8000";

export default server;
