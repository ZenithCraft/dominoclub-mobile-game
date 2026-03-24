import { create } from 'zustand';

export type ToastType = 'error' | 'success' | 'info' | 'warning';

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastState {
  toasts: ToastItem[];
  show: (message: string, type?: ToastType, durationMs?: number) => void;
  dismiss: (id: string) => void;
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  show(message, type = 'error', durationMs = 3500) {
    const id = Math.random().toString(36).slice(2);
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => get().dismiss(id), durationMs);
  },

  dismiss(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));

// Convenience helper — usable outside React (e.g. API interceptors)
export const toast = {
  error: (msg: string) => useToastStore.getState().show(msg, 'error'),
  success: (msg: string) => useToastStore.getState().show(msg, 'success'),
  info: (msg: string) => useToastStore.getState().show(msg, 'info'),
  warning: (msg: string) => useToastStore.getState().show(msg, 'warning'),
};
