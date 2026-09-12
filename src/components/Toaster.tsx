import { useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { useToastStore } from '../store/toastStore';
import { STORAGE_ERROR_EVENT, type StorageErrorDetail } from '../store/safeStorage';

const ICONS = {
  error: AlertTriangle,
  success: CheckCircle2,
  info: Info,
};

const STYLES = {
  error: 'border-brick-400/50 bg-paper-50 text-brick-600',
  success: 'border-moss-300 bg-paper-50 text-moss-600',
  info: 'border-lavender-400/50 bg-paper-50 text-lavender-600',
};

let lastWriteErrorAt = 0;

export default function Toaster() {
  const { toasts, showToast, dismiss } = useToastStore();

  useEffect(() => {
    const onStorageError = (e: Event) => {
      const detail = (e as CustomEvent<StorageErrorDetail>).detail;
      // 连续保存失败（如循环写入）只提示一次，避免 toast 刷屏
      const now = Date.now();
      if (detail.phase === 'write' && now - lastWriteErrorAt < 4000) return;
      lastWriteErrorAt = now;

      showToast(
        detail.phase === 'write'
          ? '本地保存失败：当前浏览器可能禁用了存储或空间已满，本次修改仅在当前页面有效。'
          : '读取本地数据失败，已为你显示初始内容。',
        'error',
      );
    };
    window.addEventListener(STORAGE_ERROR_EVENT, onStorageError);
    return () => window.removeEventListener(STORAGE_ERROR_EVENT, onStorageError);
  }, [showToast]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed z-[100] left-1/2 -translate-x-1/2 top-3 sm:top-5 w-[calc(100%-1.5rem)] sm:w-auto sm:min-w-[320px] sm:max-w-[440px] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => {
        const Icon = ICONS[t.kind];
        return (
          <div
            key={t.id}
            role="alert"
            className={`pointer-events-auto flex items-start gap-2.5 px-4 py-3 rounded-2xl border-2 shadow-paper-hover backdrop-blur animate-slideDown ${STYLES[t.kind]}`}
          >
            <Icon className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="flex-1 text-sm leading-snug text-ink-800">{t.message}</p>
            <button
              onClick={() => dismiss(t.id)}
              className="shrink-0 p-0.5 rounded-md text-ink-700/50 hover:text-ink-800 hover:bg-paper-200 transition-colors"
              aria-label="关闭提示"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
