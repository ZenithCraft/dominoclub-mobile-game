export class Expo {
  chunkPushNotifications(messages: any[]) { return [messages]; }
  sendPushNotificationsAsync(_chunk: any[]) { return Promise.resolve([]); }
  static isExpoPushToken(_token: string) { return true; }
}

export type ExpoPushMessage = {
  to: string;
  title?: string;
  body?: string;
  data?: Record<string, any>;
};

export default Expo;
