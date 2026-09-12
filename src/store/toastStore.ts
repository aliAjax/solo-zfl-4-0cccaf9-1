import { create } from 'zustand';
import { generateId } from '../utils/helpers';

export type ToastKind = 'error' | 'success' | 'info';

export interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
}

interface ToastStore {
  toasts: Toast[];
  showToast: (message: string, kind?: ToastKind) => void;
  dismiss: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  showToast: (message, kind = 'info') => {
    const id = generateId();
    set((s) => ({ toasts: [...s.toasts, { id, message, kind }] }));
    // 错误多停留一会，确保用户能看到
    window.setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, kind === 'error' ? 5000 : 2500);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
