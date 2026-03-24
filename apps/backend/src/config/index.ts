import dotenv from 'dotenv';
dotenv.config();

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3001', 10),
  apiPrefix: process.env.API_PREFIX || '/api/v1',

  db: {
    url: process.env.DATABASE_URL!,
  },

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'dev_access_secret_min_32_chars_here',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret_min_32_chars_here',
    accessExpires: process.env.JWT_ACCESS_EXPIRES || '15m',
    refreshExpires: process.env.JWT_REFRESH_EXPIRES || '7d',
  },

  inter: {
    clientId: process.env.INTER_CLIENT_ID || '96703fe2d355c5d53fa606e364f241a6c6b95664',
    clientSecret: process.env.INTER_CLIENT_SECRET || 'b6e37717d9cdbc8f3a0654eb4162e502377af7fe',
    baseUrl: process.env.INTER_BASE_URL || 'https://cdpj-sandbox.partners.uatinter.co',
    certPath: process.env.INTER_CERT_PATH || './certs/inter.crt',
    keyPath: process.env.INTER_KEY_PATH || './certs/inter.key',
    pixKey: process.env.INTER_PIX_KEY || '',
    webhookUrl: process.env.INTER_WEBHOOK_URL || '',
    webhookSecret: process.env.INTER_WEBHOOK_SECRET || '',
  },

  serpro: {
    apiKey: process.env.SERPRO_API_KEY || '',
    baseUrl: process.env.SERPRO_BASE_URL || 'https://gateway.apiserpro.serpro.gov.br',
    mockMode: process.env.SERPRO_MOCK_MODE === 'true',
  },

  otp: {
    expirySeconds: parseInt(process.env.OTP_EXPIRY_SECONDS || '300', 10),
    length: parseInt(process.env.OTP_LENGTH || '6', 10),
    maxAttempts: parseInt(process.env.OTP_MAX_ATTEMPTS || '5', 10),
    resendCooldownSeconds: parseInt(process.env.OTP_RESEND_COOLDOWN_SECONDS || '60', 10),
  },

  sms: {
    provider: (process.env.SMS_PROVIDER || 'mock') as 'mock' | 'zenvia' | 'twilio',
    apiKey: process.env.SMS_API_KEY || '',
    sender: process.env.SMS_SENDER || 'DominoClub',
    // Twilio-specific
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || '',
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || '',
    twilioFromNumber: process.env.TWILIO_FROM_NUMBER || '',
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },

  game: {
    turnTimeoutSeconds: parseInt(process.env.TURN_TIMEOUT_SECONDS || '30', 10),
    botInjectWaitSeconds: parseInt(process.env.BOT_INJECT_WAIT_SECONDS || '30', 10),
    matchmakingBetTolerance: parseFloat(process.env.MATCHMAKING_BET_TOLERANCE || '0.10'),
    houseEdgePercent: parseFloat(process.env.HOUSE_EDGE_PERCENT || '10'),
  },

  admin: {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || 'changeme_in_production',
    secret: process.env.ADMIN_JWT_SECRET || 'admin_secret_change_in_production_32chars',
  },

  cors: {
    origins: (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:19006').split(','),
  },
};
