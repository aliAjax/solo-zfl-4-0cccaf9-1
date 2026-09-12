import { createJSONStorage, type StateStorage } from 'zustand/middleware';

/** 本地保存失败时派发的事件，由全局 Toaster 监听并提示 */
export const STORAGE_ERROR_EVENT = 'scent-archive:storage-error';

export interface StorageErrorDetail {
  phase: 'read' | 'write';
  message: string;
}

function emitStorageError(detail: StorageErrorDetail) {
  try {
    window.dispatchEvent(new CustomEvent(STORAGE_ERROR_EVENT, { detail }));
  } catch {
    // 极端环境下连事件都无法派发，保持静默不影响内存状态
  }
}

/**
 * 包一层 try/catch 的 localStorage：
 * - 写入失败（隐私模式 / 配额超限 / 被禁用）时给出提示，但本次内存状态仍然生效；
 * - 读取失败时提示并回退到初始空状态，避免整页崩溃。
 */
function createSafeLocalStorage(): StateStorage {
  return {
    getItem: (name) => {
      try {
        return window.localStorage.getItem(name);
      } catch (err) {
        emitStorageError({
          phase: 'read',
          message: err instanceof Error ? err.message : '无法读取本地存储',
        });
        return null;
      }
    },
    setItem: (name, value) => {
      try {
        window.localStorage.setItem(name, value);
      } catch (err) {
        emitStorageError({
          phase: 'write',
          message: err instanceof Error ? err.message : '本地存储空间不足或已被禁用',
        });
      }
    },
    removeItem: (name) => {
      try {
        window.localStorage.removeItem(name);
      } catch (err) {
        emitStorageError({
          phase: 'write',
          message: err instanceof Error ? err.message : '无法写入本地存储',
        });
      }
    },
  };
}

export const safeLocalStorage = createJSONStorage(createSafeLocalStorage);
