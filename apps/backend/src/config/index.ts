import dotenv from 'dotenv';
dotenv.config();

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3001', 10),
  apiPrefix: process.env.API_PREFIX || '/api/v1',
  devAuthBypass: process.env.NODE_ENV !== 'production' && process.env.DEV_AUTH_BYPASS === 'true',
  devAuthDefaultPhone: process.env.DEV_AUTH_DEFAULT_PHONE || '+5511999990001',

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
    turnTimeoutSeconds: parseInt(process.env.TURN_TIMEOUT_SECONDS || '15', 10),
    botInjectWaitSeconds: parseInt(process.env.BOT_INJECT_WAIT_SECONDS || '5', 10),
    houseEdgePercent: parseFloat(process.env.HOUSE_EDGE_PERCENT || '10'),
    disconnectGraceSeconds: parseInt(process.env.DISCONNECT_GRACE_SECONDS || '15', 10),
  },

  admin: {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || 'changeme_in_production',
    secret: process.env.ADMIN_JWT_SECRET || 'admin_secret_change_in_production_32chars',
  },

  cors: {
    origins: (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:19006,http://localhost:8081,http://localhost:8082,http://localhost:8083').split(','),
  },

  redis: {
    url: process.env.REDIS_URL || '',
  },

  integrity: {
    // Set to true in dev to accept any token without hitting Google/Apple APIs
    mockMode: process.env.INTEGRITY_MOCK_MODE === 'true' || process.env.NODE_ENV !== 'production',
    // Token value accepted in mock mode — must match what the mobile sends
    mockToken: process.env.INTEGRITY_MOCK_TOKEN || 'dev-integrity-token',
    // Whether a valid token is required before entering a paid queue
    requireForPaidGames: process.env.INTEGRITY_REQUIRE_FOR_PAID_GAMES !== 'false',
    // TTL in ms for server-issued integrity nonces (default: 2 minutes)
    nonceTtlMs: parseInt(process.env.INTEGRITY_NONCE_TTL_MS || '120000', 10),

    // Android — Play Integrity
    androidPackageName: process.env.ANDROID_PACKAGE_NAME || 'com.dominoclub.app',
    // Full JSON of the Google service account (used to get OAuth2 token for Play Integrity API)
    googleServiceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '',

    // iOS — App Attest (primary, iOS 14+) + DeviceCheck (legacy fallback)
    appleBundleId:      process.env.APPLE_BUNDLE_ID       || 'com.dominoclub.app',
    appleTeamId:        process.env.APPLE_TEAM_ID         || '',
    appleKeyId:         process.env.APPLE_KEY_ID          || '',
    appleAppAttestEnv: (process.env.APPLE_APP_ATTEST_ENV  || 'development') as 'development' | 'production',
    // PEM private key for signing DeviceCheck / App Attest JWTs
    applePrivateKey: (process.env.APPLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  },

  antifraud: {
    // Require GPS for any game with betAmount > 0
    gpsRequiredForPaidGames: process.env.GPS_REQUIRED_FOR_PAID_GAMES === 'true',
    // Maximum distance in metres between two matched players before a collusion flag is raised
    gpsCollusionDistanceM: parseInt(process.env.GPS_COLLUSION_DISTANCE_M || '100', 10),
    // GPS accuracy above this threshold is treated as low-confidence (still valid, but flagged)
    gpsMaxAccuracyM: parseInt(process.env.GPS_MAX_ACCURACY_M || '500', 10),
    // Speed thresholds for impossible movement detection
    impossibleSpeedKmh: parseInt(process.env.GPS_IMPOSSIBLE_SPEED_KMH || '900', 10),
    suspiciousSpeedKmh: parseInt(process.env.GPS_SUSPICIOUS_SPEED_KMH || '250', 10),
    // A move completed faster than this (ms) counts as suspiciously fast
    botMinMoveMs: parseInt(process.env.BOT_MIN_MOVE_MS || '800', 10),
    // If ≥ this fraction of moves are suspiciously fast, flag the player
    botSuspiciousRatio: parseFloat(process.env.BOT_SUSPICIOUS_RATIO || '0.5'),
    // Minimum consecutive fast moves before the heuristic is applied
    botMinSampleSize: parseInt(process.env.BOT_MIN_SAMPLE_SIZE || '5', 10),
    // bot_score at or above this threshold triggers a FraudLog write
    botScoreLogThreshold: parseFloat(process.env.BOT_SCORE_LOG_THRESHOLD || '0.65'),
    // Max active bound devices per user account before flagging
    maxDevicesPerAccount: parseInt(process.env.MAX_DEVICES_PER_ACCOUNT || '3', 10),
    // Per-user queue join velocity limits
    velocityQueueJoinMax:       parseInt(process.env.VELOCITY_QUEUE_JOIN_MAX       || '10',      10),
    velocityQueueJoinWindowMs:  parseInt(process.env.VELOCITY_QUEUE_JOIN_WINDOW_MS || '300000',  10),
    // Per-user withdrawal velocity limits
    velocityWithdrawMax:        parseInt(process.env.VELOCITY_WITHDRAW_MAX         || '3',       10),
    velocityWithdrawWindowMs:   parseInt(process.env.VELOCITY_WITHDRAW_WINDOW_MS   || '3600000', 10),
  },
};

// ── Production secret validation ────────────────────────────────────────────
// Fail fast if weak defaults are still in place when running in production.
if (process.env.NODE_ENV === 'production') {
  const weak = [
    ['JWT_ACCESS_SECRET', config.jwt.accessSecret, 'dev_access_secret_min_32_chars_here'],
    ['JWT_REFRESH_SECRET', config.jwt.refreshSecret, 'dev_refresh_secret_min_32_chars_here'],
    ['ADMIN_PASSWORD',    config.admin.password,     'changeme_in_production'],
    ['ADMIN_JWT_SECRET',  config.admin.secret,       'admin_secret_change_in_production_32chars'],
  ] as const;

  const bad = weak.filter(([, val, def]) => val === def || val.length < 32);
  if (bad.length > 0) {
    const names = bad.map(([name]) => name).join(', ');
    throw new Error(
      `[Config] FATAL: Weak or default secrets detected in production: ${names}. ` +
      'Set strong values (≥32 chars) in your environment before deploying.'
    );
  }
}
