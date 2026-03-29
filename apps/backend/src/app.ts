import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { antifraudMiddleware } from './middleware/antifraud.middleware';
import routes from './routes';
import type { CorsOptions } from 'cors';

const app = express();

// Trust the first proxy (ngrok / reverse proxy) so express-rate-limit
// can read X-Forwarded-For correctly.
app.set('trust proxy', 1);

// ── Health check (before rate limiting / auth) ─────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', env: config.env }));

app.use(helmet());
const corsOrigin: CorsOptions['origin'] = config.env !== 'production' ? true : config.cors.origins;
app.use(cors({ origin: corsOrigin, credentials: true }));

// Capture raw body for PIX webhook HMAC verification.
// Uses express.json's built-in `verify` callback — fires after the body
// buffer is collected but before JSON.parse, so the stream is only read once.
app.use(express.json({
  limit: '10kb',
  verify: (req: any, _res, buf) => { req.rawBody = buf.toString(); },
}));
app.use(express.urlencoded({ extended: true }));

// ── Rate limiting — tiered per route sensitivity ───────────────────────────

// Auth endpoints: tight limits to prevent brute-force / OTP abuse
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 20,
  message: { error: 'Muitas tentativas. Tente novamente em 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// PIX webhook: very loose — called by Banco Inter servers
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 500,
  message: { error: 'Too many webhook calls' },
});

// Admin: tighter than API but looser than auth
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'Too many admin requests' },
  standardHeaders: true,
  legacyHeaders: false,
});

// General API: generous for normal gameplay
const generalLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(`${config.apiPrefix}/auth`, authLimiter);
app.use(`${config.apiPrefix}/wallet/pix/webhook`, webhookLimiter);
app.use(`${config.apiPrefix}/admin`, adminLimiter);
app.use(generalLimiter);

app.use(antifraudMiddleware);
app.use(config.apiPrefix, routes);

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

export default app;
