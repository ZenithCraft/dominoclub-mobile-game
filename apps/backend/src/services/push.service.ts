import Expo, { ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';
import { prisma } from './prisma.service';
import { logger } from '../utils/logger';

const expo = new Expo();

// ─── Receipt tracking ────────────────────────────────────────────────────────
// Maps ticket ID → { userId, token } so we can remove stale tokens on receipt errors.
// In-memory only — lost on restart, which is acceptable: we'll just lose one polling
// cycle. A Redis-backed store would survive restarts for high-availability setups.
interface PendingTicket {
  userId?: string;
  token: string;
  queuedAt: number;
}
const pendingTickets = new Map<string, PendingTicket>();

function storePendingTickets(tickets: ExpoPushTicket[], tokens: string[], userIds?: string[]) {
  tickets.forEach((ticket, i) => {
    if (ticket.status === 'ok') {
      pendingTickets.set(ticket.id, {
        token: tokens[i],
        userId: userIds?.[i],
        queuedAt: Date.now(),
      });
    }
  });
}

async function removeStaleToken(token: string, userId?: string) {
  try {
    if (userId) {
      await prisma.user.updateMany({
        where: { id: userId, push_token: token },
        data: { push_token: null },
      });
    } else {
      await prisma.user.updateMany({
        where: { push_token: token },
        data: { push_token: null },
      });
    }
    logger.info('[Push] Removed stale push token', { userId });
  } catch (err: any) {
    logger.warn('[Push] Failed to remove stale push token', { err: err.message });
  }
}

// Called by server.ts every 30 minutes to clear DeviceNotRegistered tokens.
export async function processPushReceipts(): Promise<void> {
  if (pendingTickets.size === 0) return;

  // Expo recommends waiting at least 15 minutes before checking receipts.
  const minAgeMs = 15 * 60 * 1000;
  const now = Date.now();
  const readyIds = [...pendingTickets.entries()]
    .filter(([, v]) => now - v.queuedAt >= minAgeMs)
    .map(([id]) => id);

  if (readyIds.length === 0) return;

  const chunks = expo.chunkPushNotificationReceiptIds(readyIds);
  for (const chunk of chunks) {
    try {
      const receipts = await expo.getPushNotificationReceiptsAsync(chunk);
      for (const [receiptId, receipt] of Object.entries(receipts)) {
        const pending = pendingTickets.get(receiptId);
        pendingTickets.delete(receiptId);
        if (!pending) continue;

        if (receipt.status === 'error') {
          logger.warn('[Push] Receipt error', { details: receipt.details, token: pending.token.slice(0, 20) });
          if ((receipt.details as any)?.error === 'DeviceNotRegistered') {
            await removeStaleToken(pending.token, pending.userId);
          }
        }
      }
    } catch (err: any) {
      logger.warn('[Push] Failed to fetch receipts chunk', { err: err.message });
    }
  }

  // Discard tickets older than 24 h (Expo only keeps them for 24 h)
  const maxAgeMs = 24 * 60 * 60 * 1000;
  for (const [id, v] of pendingTickets) {
    if (now - v.queuedAt > maxAgeMs) pendingTickets.delete(id);
  }
}

// ─── Send helpers ─────────────────────────────────────────────────────────────

async function sendChunked(messages: ExpoPushMessage[], tokens: string[], userIds?: string[]) {
  const chunks = expo.chunkPushNotifications(messages);
  let ticketOffset = 0;
  for (const chunk of chunks) {
    try {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      storePendingTickets(tickets, tokens.slice(ticketOffset, ticketOffset + chunk.length), userIds?.slice(ticketOffset, ticketOffset + chunk.length));
      ticketOffset += chunk.length;
    } catch (err: any) {
      logger.warn('[Push] Failed to send chunk', { err: err.message });
      ticketOffset += chunk.length;
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function sendPushToUsers(userIds: string[], title: string, body: string, data?: Record<string, any>) {
  const users = await prisma.user.findMany({
    where: { id: { in: userIds }, push_token: { not: null } },
    select: { id: true, push_token: true },
  });

  const valid = users.filter((u) => u.push_token && Expo.isExpoPushToken(u.push_token!));
  if (!valid.length) return;

  const tokens = valid.map((u) => u.push_token!);
  const ids    = valid.map((u) => u.id);
  const messages: ExpoPushMessage[] = tokens.map((to) => ({ to, title, body, data: data ?? {} }));

  await sendChunked(messages, tokens, ids);
}

export async function sendPushToAll(title: string, body: string, data?: Record<string, any>) {
  // Cursor-based batching — avoids loading all push tokens into memory at once.
  const BATCH = 500;
  let cursor: string | undefined;

  while (true) {
    const users = await prisma.user.findMany({
      where: { push_token: { not: null }, is_banned: false },
      select: { id: true, push_token: true },
      take: BATCH,
      orderBy: { id: 'asc' },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    if (!users.length) break;

    const valid = users.filter((u) => u.push_token && Expo.isExpoPushToken(u.push_token!));
    if (valid.length) {
      const tokens = valid.map((u) => u.push_token!);
      const ids    = valid.map((u) => u.id);
      const messages: ExpoPushMessage[] = tokens.map((to) => ({ to, title, body, data: data ?? {} }));
      await sendChunked(messages, tokens, ids);
    }

    cursor = users[users.length - 1].id;
    if (users.length < BATCH) break;
  }
}

export async function registerPushToken(userId: string, token: string): Promise<void> {
  if (!Expo.isExpoPushToken(token)) return;
  await prisma.user.update({ where: { id: userId }, data: { push_token: token } });
}
