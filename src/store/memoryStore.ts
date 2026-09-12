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
  /** 首次读取本地数据是否已完成（完成前不允许写入示例数据） */
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

function enterBootError(set: (partial: Partial<MemoryStore>) => void, message: string, migration: boolean) {
  // 封锁一切写入：原始数据原封不动留在 localStorage，等用户处理
  setStorageWritesBlocked(true);
  set({
    hydrated: true,
    bootError: {
      message: message || '本地数据无法读取',
      migration,
    },
  });
}

export const useMemoryStore = create<MemoryStore>()(
  persist(
    (set, get) => ({
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
        // 只解除封锁并重置错误标记；不 setState 内存数据，
        // 否则 persist 会在重新读取前把（可能仍损坏的）原始数据覆盖掉。
        setStorageWritesBlocked(false);
        useMemoryStore.persist.rehydrate();
      },
    }),
    {
      name: STORAGE_KEY,
      storage: safeLocalStorage,
      version: CURRENT_STORE_VERSION,
      partialize: (state) => ({ memories: state.memories }),
      migrate: (persisted, fromVersion) => migrateMemoriesState(persisted, fromVersion),
      onRehydrateStorage: () => (_state, error) => {
        if (error) {
          // 迁移函数抛错 / JSON 解析失败等：保留原始数据，不做任何写入
          enterBootError(
            useMemoryStore.setState.bind(useMemoryStore),
            error instanceof Error ? error.message : '本地数据迁移失败',
            true,
          );
          return;
        }

        setStorageWritesBlocked(false);

        // 只有“浏览器里从未存过数据”（首次使用）才放示例；
        // 用户主动删光档案（持久化为空数组）后刷新必须保持空白，不能被示例覆盖。
        const hadPersistedData = readRawStorage(STORAGE_KEY) !== null;
        if (!hadPersistedData) {
          useMemoryStore.setState({ memories: mockMemories, bootError: null, hydrated: true });
        } else {
          // zustand 已合并 memories，这里只需解除错误标记
          useMemoryStore.setState({ bootError: null, hydrated: true });
        }
      },
    },
  ),
);
