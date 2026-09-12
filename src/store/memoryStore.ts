import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SmellMemory, Season, SmellType, Emotion, FollowUpFrequency, FollowUpPlan } from '../utils/constants';
import { generateId } from '../utils/helpers';
import { advanceDate } from '../utils/followUp';
import { mockMemories } from '../data/mockData';
import { safeLocalStorage } from './safeStorage';

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

interface MemoryStore {
  memories: SmellMemory[];
  addMemory: (input: MemoryInput) => void;
  updateMemory: (id: string, input: MemoryInput) => void;
  deleteMemory: (id: string) => void;
  /** 设置/更新一条气味的回访计划 */
  setFollowUp: (memoryId: string, input: FollowUpInput) => boolean;
  /** 移除回访计划（含历史记录） */
  removeFollowUp: (memoryId: string) => void;
  /** 完成一次回访：写入一条记录并推进下次日期；返回本次记录 id，重复连点返回 null */
  completeFollowUp: (memoryId: string) => string | null;
  initIfEmpty: () => void;
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

export const useMemoryStore = create<MemoryStore>()(
  persist(
    (set, get) => ({
      memories: [],
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
        // 编辑计划保留历史；新建计划从空历史开始
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
        // 计划被手动修改后，放行下一次完成
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
        // 计算与写入在同一次同步 set 中完成
        set({ memories: patchFollowUp(get().memories, memoryId, () => updated) });
        lastCompletedAt.set(memoryId, nowMs);
        return logId;
      },
      initIfEmpty: () => {
        if (get().memories.length === 0) {
          set({ memories: mockMemories });
        }
      },
    }),
    {
      name: 'scent-memory-storage',
      storage: safeLocalStorage,
      version: 2,
    },
  ),
);
