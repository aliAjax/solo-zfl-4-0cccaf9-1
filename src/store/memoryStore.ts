import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SmellMemory, Season, SmellType, Emotion, FollowUpFrequency, FollowUpPlan } from '../utils/constants';
import { generateId } from '../utils/helpers';
import { advanceDate } from '../utils/followUp';
import { mockMemories } from '../data/mockData';
import {
  safeLocalStorage,
  setStorageWritesBlocked,
  readRawStorage,
  STORAGE_KEY,
} from './safeStorage';
import { CURRENT_STORE_VERSION, migrateMemoriesState } from './migrations';

export interface MemoryInput {
  location: string;
  source_guess: string;
  intensity: number;
  humidity: number;
  season: Season;
  smell_type: SmellType;
  memory_text: string;
  color_association: string;
  emotion: Emotion;
  want_again: boolean;
}

export interface FollowUpInput {
  next_date: string;
  frequency: FollowUpFrequency;
  note: string;
}

export interface BootError {
  message: string;
  /** 是否因迁移失败引起（决定恢复界面的措辞与重置按钮） */
  migration: boolean;
}

interface MemoryStore {
  memories: SmellMemory[];
  /** 首次读取本地数据是否已完成（完成前界面显示加载态） */
  hydrated: boolean;
  /** 本地数据迁移/解析失败时的错误信息；非空时界面进入恢复流程 */
  bootError: BootError | null;
  addMemory: (input: MemoryInput) => void;
  updateMemory: (id: string, input: MemoryInput) => void;
  deleteMemory: (id: string) => void;
  setFollowUp: (memoryId: string, input: FollowUpInput) => boolean;
  removeFollowUp: (memoryId: string) => void;
  completeFollowUp: (memoryId: string) => string | null;
  /** 重新读取一次本地数据（用户修复后点“重试”） */
  retryHydration: () => void;
}

/**
 * 每条记忆最近一次完成回访的时间戳。
 * 去抖窗口内的重复点击（双击、多点触控、看板与卡片同时点）一律忽略，
 * 保证“连点不能多出记录”。手动重新设置计划后窗口清零。
 */
const lastCompletedAt = new Map<string, number>();
const COMPLETE_DEDUP_MS = 2000;

function patchFollowUp(memories: SmellMemory[], memoryId: string, fn: (p: FollowUpPlan) => FollowUpPlan | null): SmellMemory[] {
  return memories.map((m) => (m.id === memoryId && m.follow_up ? { ...m, follow_up: fn(m.follow_up) } : m));
}

/**
 * 水合期间可用的 setState。
 * 关键：localStorage 是同步的，zustand 会在 create() 执行过程中同步触发
 * onRehydrateStorage 回调，此刻模块底部的 useMemoryStore 常量还没完成初始化，
 * 在回调里引用 useMemoryStore.setState 会抛 undefined。
 * 所以在 store creator 执行时（一定早于水合）把 api.setState 捕获到这里。
 */
let rehydrateSet: (partial: Partial<MemoryStore>) => void = () => {};

/** 进入“恢复模式”：封锁一切本地写入并弹出恢复界面，原始数据保持不动 */
function enterBootError(message: string, migration: boolean) {
  setStorageWritesBlocked(true);
  rehydrateSet({
    hydrated: true,
    bootError: {
      message: message || '本地数据无法读取',
      migration,
    },
  });
}

export const useMemoryStore = create<MemoryStore>()(
  persist(
    (set, get, api) => {
      rehydrateSet = api.setState as (partial: Partial<MemoryStore>) => void;

      return {
        memories: [],
        hydrated: false,
        bootError: null,

        addMemory: (input) => {
          const now = new Date().toISOString();
          const newMem: SmellMemory = {
            id: generateId(),
            ...input,
            created_at: now,
            updated_at: now,
          };
          set({ memories: [newMem, ...get().memories] });
        },
        updateMemory: (id, input) => {
          set({
            memories: get().memories.map((m) =>
              m.id === id
                ? { ...m, ...input, updated_at: new Date().toISOString() }
                : m,
            ),
          });
        },
        deleteMemory: (id) => {
          lastCompletedAt.delete(id);
          set({ memories: get().memories.filter((m) => m.id !== id) });
        },
        setFollowUp: (memoryId, input) => {
          const target = get().memories.find((m) => m.id === memoryId);
          if (!target || !input.next_date) return false;

          const now = new Date().toISOString();
          const existing = target.follow_up;
          const plan: FollowUpPlan = {
            next_date: input.next_date,
            frequency: input.frequency,
            note: input.note,
            logs: existing?.logs ?? [],
            created_at: existing?.created_at ?? now,
            updated_at: now,
          };
          set({
            memories: get().memories.map((m) =>
              m.id === memoryId ? { ...m, follow_up: plan } : m,
            ),
          });
          lastCompletedAt.delete(memoryId);
          return true;
        },
        removeFollowUp: (memoryId) => {
          lastCompletedAt.delete(memoryId);
          set({
            memories: get().memories.map((m) =>
              m.id === memoryId ? { ...m, follow_up: null } : m,
            ),
          });
        },
        completeFollowUp: (memoryId) => {
          const target = get().memories.find((m) => m.id === memoryId);
          const plan = target?.follow_up;
          if (!target || !plan || !plan.next_date) return null;

          // 防连点：去抖窗口内的重复完成一律忽略，保证只产生一条记录
          const nowMs = Date.now();
          const lastMs = lastCompletedAt.get(memoryId);
          if (lastMs !== undefined && nowMs - lastMs < COMPLETE_DEDUP_MS) return null;

          const now = new Date();
          const logId = generateId();
          const log = {
            completed_at: now.toISOString(),
            scheduled_date: plan.next_date,
            note: plan.note,
          };
          const nextDate = advanceDate(plan.next_date, plan.frequency, now);
          const updated: FollowUpPlan = {
            ...plan,
            next_date: nextDate,
            logs: [log, ...plan.logs],
            updated_at: now.toISOString(),
          };
          set({ memories: patchFollowUp(get().memories, memoryId, () => updated) });
          lastCompletedAt.set(memoryId, nowMs);
          return logId;
        },

        retryHydration: () => {
          // 只解除封锁并重新读取；不预先 setState 内存数据，
          // 否则 persist 会在重新读取前把（可能仍损坏的）原始数据覆盖掉。
          setStorageWritesBlocked(false);
          useMemoryStore.persist.rehydrate();
        },
      };
    },
    {
      name: STORAGE_KEY,
      storage: safeLocalStorage,
      version: CURRENT_STORE_VERSION,
      partialize: (state) => ({ memories: state.memories }),
      migrate: (persisted, fromVersion) => migrateMemoriesState(persisted, fromVersion),
      onRehydrateStorage: () => (_state, error) => {
        if (error) {
          const message = error instanceof Error ? error.message : '本地数据迁移失败';
          // zustand 的水合失败（catch）分支不会像成功分支那样在回调后用 get()
          // 回写状态；首次 create() 仍会用初始 configResult 覆盖 store。
          // 因此推迟到当前同步水合栈结束后再进入恢复模式，避免被覆盖。
          // 微任务早于 React 首次渲染，用户不会看到中间的加载态。
          queueMicrotask(() => enterBootError(message, true));
          return;
        }

        setStorageWritesBlocked(false);

        // 只有“浏览器里从未存过数据”（首次使用）才放示例；
        // 用户主动删光档案（持久化为空数组）后刷新必须保持空白，不能被示例覆盖。
        const hadPersistedData = readRawStorage(STORAGE_KEY) !== null;
        if (!hadPersistedData) {
          rehydrateSet({ memories: mockMemories, bootError: null, hydrated: true });
        } else {
          // zustand 已完成 memories 合并，这里只需解除加载/错误态
          rehydrateSet({ bootError: null, hydrated: true });
        }
      },
    },
  ),
);
