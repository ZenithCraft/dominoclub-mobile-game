import http from 'http';
import app from './app';
import { createSocketServer } from './socket';
import { prisma } from './services/prisma.service';
import { registerPixWebhook } from './services/pix.service';
import { config } from './config';
import { logger } from './utils/logger';

const server = http.createServer(app);
const io = createSocketServer(server);

async function main() {
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
}

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
});

main();

export { io };
