import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { antifraudMiddleware } from './middleware/antifraud.middleware';
import routes from './routes';

const app = express();

app.use(helmet());
app.use(cors({ origin: config.cors.origins, credentials: true }));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

app.use(
  rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.maxRequests,
    message: { error: 'Too many requests, please try again later' },
  })
);

app.use(antifraudMiddleware);
app.use(config.apiPrefix, routes);

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

export default app;
