import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { useSettingsStore } from '../store/settings.store';
import { toast } from '../store/toast.store';

const isExpoGo = Constants.appOwnership === 'expo';
type NotificationsModule = typeof import('expo-notifications');
const Notifications: NotificationsModule | null =
  isExpoGo || Platform.OS === 'web'
    ? null
    : (require('expo-notifications') as NotificationsModule);

// Toggles the app-wide "allow notifications" preference from the settings
// screen. Requests OS/browser permission when turning on; cancels any
// pending scheduled notifications when turning off.
export async function setAppNotificationsEnabled(next: boolean): Promise<void> {
  if (!next) {
    if (Notifications) {
      try { await Notifications.cancelAllScheduledNotificationsAsync(); } catch {}
    }
    await useSettingsStore.getState().setNotificationsEnabled(false);
    toast.info('Notificações desativadas.');
    return;
  }

  if (Platform.OS === 'web') {
    const WebNotification = (globalThis as any)?.Notification;
    if (!WebNotification) {
      toast.warning('Notificações não suportadas neste navegador.');
      return;
    }
    try {
      const permission: string =
        WebNotification.permission === 'default'
          ? await WebNotification.requestPermission()
          : WebNotification.permission;
      if (permission !== 'granted') {
        toast.warning('Permissão de notificação não concedida.');
        return;
      }
    } catch {
      toast.warning('Não foi possível pedir permissão de notificação.');
      return;
    }
    await useSettingsStore.getState().setNotificationsEnabled(true);
    toast.success('Notificações ativadas.');
    return;
  }

  if (!Notifications) {
    toast.warning('Notificações não disponíveis neste app.');
    return;
  }
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') {
      toast.warning('Permissão de notificação não concedida.');
      return;
    }
  } catch {
    toast.warning('Não foi possível pedir permissão de notificação.');
    return;
  }
  await useSettingsStore.getState().setNotificationsEnabled(true);
  toast.success('Notificações ativadas.');
}
