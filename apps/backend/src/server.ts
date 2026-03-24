import http from 'http';
import app from './app';
import { createSocketServer } from './socket';
import { prisma } from './services/prisma.service';
import { registerPixWebhook } from './services/pix.service';
import { connectRedis, disconnectRedis } from './services/redis.service';
import { config } from './config';
import { logger } from './utils/logger';

const server = http.createServer(app);

async function main() {
  // Connect Redis (optional — graceful fallback to in-memory if unavailable)
  await connectRedis();

  // Socket server must be created AFTER Redis connects so the adapter is applied
  const io = createSocketServer(server);

  // Try DB connection but don't block server startup
  prisma.$connect()
    .then(() => logger.info('Database connected'))
    .catch((err) => logger.warn('Database unavailable — running without DB', { message: err.message }));

  server.listen(config.port, () => {
    logger.info(`DominoClub backend running on port ${config.port} [${config.env}]`);
    logger.info(`API: http://localhost:${config.port}${config.apiPrefix}`);
  });

  // Register PIX webhook with Banco Inter (idempotent, safe to call on every start)
  registerPixWebhook();

  return io;
}

const gracefulShutdown = (signal: string) => {
  logger.info(`${signal} received, shutting down gracefully`);
  server.close(async () => {
    await Promise.all([prisma.$disconnect(), disconnectRedis()]);
    process.exit(0);
  });
  // Force exit if graceful shutdown takes too long
  setTimeout(() => process.exit(1), 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

main().catch((err) => {
  logger.error('Fatal startup error', { message: err.message });
  process.exit(1);
});

export { io };
