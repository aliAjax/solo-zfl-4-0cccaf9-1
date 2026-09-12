import type { PersistStorage } from 'zustand/middleware';
import { DataIntegrityError } from './migrations';

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
 * 数据处于“不可写入”状态时置位（如迁移失败后保护旧数据）。
 * 封锁期间所有 setItem/removeItem 都不会触碰 localStorage，
 * 避免应用后续任何状态变化把原始数据覆盖掉。
 */
let writesBlocked = false;

export function setStorageWritesBlocked(blocked: boolean) {
  writesBlocked = blocked;
}

export function isStorageWritesBlocked() {
  return writesBlocked;
}

/** 直接读取持久化键的原始字符串（供恢复界面展示/下载），读不到返回 null */
export function readRawStorage(name: string): string | null {
  try {
    return window.localStorage.getItem(name);
  } catch {
    return null;
  }
}

/**
 * 强制清除一个持久化键（无视写入封锁）。
 * 仅用于恢复界面“已备份后重置”，调用方必须先把原始数据交给用户保存。
 */
export function forceClearStorage(name: string): boolean {
  try {
    window.localStorage.removeItem(name);
    writesBlocked = false;
    return true;
  } catch (err) {
    emitStorageError({
      phase: 'write',
      message: err instanceof Error ? err.message : '无法清除本地存储',
    });
    return false;
  }
}

/**
 * 自定义持久化存储（不使用 zustand 的 createJSONStorage），目的是把
 * “本地 JSON 无法解析”明确标记为 parse 原因，让恢复提示与真实原因一致。
 *
 * - 读取损坏的 JSON：抛 DataIntegrityError('parse')，由水合错误分支进入恢复界面；
 * - 写入失败（隐私模式 / 配额超限 / 被禁用）：提示但内存状态仍生效；
 * - 写入被封锁时静默拒绝，保护迁移失败用户的原始数据。
 */
/**
 * 自定义持久化存储（不使用 zustand 的 createJSONStorage），目的是把
 * “本地 JSON 无法解析”明确标记为 parse 原因，让恢复提示与真实原因一致。
 * 这里读到的内容尚未经过结构校验，因此以最宽松的形状声明，校验在 merge 关口统一进行。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const safeLocalStorage: PersistStorage<any> = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getItem: (name): any => {
    let raw: string | null;
    try {
      raw = window.localStorage.getItem(name);
    } catch (err) {
      emitStorageError({
        phase: 'read',
        message: err instanceof Error ? err.message : '无法读取本地存储',
      });
      return null;
    }
    if (raw === null) return null;
    try {
      return JSON.parse(raw);
    } catch {
      throw new DataIntegrityError('parse', '本地数据不是合法的 JSON 格式，可能已被损坏或被其他程序改写');
    }
  },
  setItem: (name, value) => {
    if (writesBlocked) return;
    try {
      window.localStorage.setItem(name, JSON.stringify(value));
    } catch (err) {
      emitStorageError({
        phase: 'write',
        message: err instanceof Error ? err.message : '本地存储空间不足或已被禁用',
      });
    }
  },
  removeItem: (name) => {
    if (writesBlocked) return;
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

export const STORAGE_KEY = 'scent-memory-storage';
