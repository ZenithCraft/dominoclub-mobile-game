import Expo, { ExpoPushMessage } from 'expo-server-sdk';
import { prisma } from './prisma.service';
import { logger } from '../utils/logger';

const expo = new Expo();

export async function sendPushToUsers(userIds: string[], title: string, body: string, data?: Record<string, any>) {
  const users = await prisma.user.findMany({
    where: { id: { in: userIds }, push_token: { not: null } },
    select: { push_token: true },
  });

  const messages: ExpoPushMessage[] = users
    .filter((u) => u.push_token && Expo.isExpoPushToken(u.push_token!))
    .map((u) => ({ to: u.push_token!, title, body, data: data ?? {} }));

  if (!messages.length) return;

  const chunks = expo.chunkPushNotifications(messages);
  for (const chunk of chunks) {
    try {
      await expo.sendPushNotificationsAsync(chunk);
    } catch (err: any) {
      logger.warn('[Push] Failed to send chunk', { err: err.message });
    }
  }
}

export async function sendPushToAll(title: string, body: string, data?: Record<string, any>) {
  const users = await prisma.user.findMany({
    where: { push_token: { not: null }, is_banned: false },
    select: { push_token: true },
  });

  const messages: ExpoPushMessage[] = users
    .filter((u) => u.push_token && Expo.isExpoPushToken(u.push_token!))
    .map((u) => ({ to: u.push_token!, title, body, data: data ?? {} }));

  if (!messages.length) return;

  const chunks = expo.chunkPushNotifications(messages);
  for (const chunk of chunks) {
    try {
      await expo.sendPushNotificationsAsync(chunk);
    } catch (err: any) {
      logger.warn('[Push] Failed to send chunk', { err: err.message });
    }
  }
}

export async function registerPushToken(userId: string, token: string): Promise<void> {
  if (!Expo.isExpoPushToken(token)) return;
  await prisma.user.update({ where: { id: userId }, data: { push_token: token } });
}
