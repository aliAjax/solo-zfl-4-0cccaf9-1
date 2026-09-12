import type {
  SmellMemory,
  Season,
  SmellType,
  Emotion,
  FollowUpFrequency,
  FollowUpPlan,
  FollowUpLog,
} from '../utils/constants';
import { SEASONS, SMELL_TYPES, EMOTIONS } from '../utils/constants';

/** persist 的当前数据版本；旧版数据没有 version 字段，按 0 处理 */
export const CURRENT_STORE_VERSION = 2;
const MIN_STORE_VERSION = 0;

const SEASON_SET = new Set<Season>(SEASONS.map((x) => x.value));
const SMELL_TYPE_SET = new Set<SmellType>(SMELL_TYPES.map((x) => x.value));
const EMOTION_SET = new Set<Emotion>(EMOTIONS.map((x) => x.value));
const FREQUENCY_SET = new Set<FollowUpFrequency>(['none', 'weekly', 'monthly', 'yearly']);

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function isString(x: unknown): x is string {
  return typeof x === 'string';
}

function isFiniteNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

/** YYYY-MM-DD，且是真实存在的日期（防止 2 月 30 日之类） */
function isDateKey(x: unknown): x is string {
  if (typeof x !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x)) return false;
  const [y, m, d] = x.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const check = new Date(y, m - 1, d);
  return check.getFullYear() === y && check.getMonth() === m - 1 && check.getDate() === d;
}

/** ISO 时间字符串（created_at/updated_at/completed_at） */
function isIsoString(x: unknown): boolean {
  if (typeof x !== 'string' || x.trim() === '') return false;
  const t = new Date(x).getTime();
  return Number.isFinite(t);
}

function fail(indexOrMsg: number | string, field: string): never {
  const prefix = typeof indexOrMsg === 'number' ? `第 ${indexOrMsg + 1} 条档案` : indexOrMsg;
  throw new Error(`${prefix}的「${field}」字段缺失或已损坏`);
}

function validateFollowUpLog(log: unknown, index: number): asserts log is FollowUpLog {
  if (!isObject(log)) throw new Error(`回访记录第 ${index + 1} 条不是有效结构`);
  if (!isIsoString(log.completed_at)) throw new Error(`回访记录第 ${index + 1} 条缺少完成时间`);
  if (!isDateKey(log.scheduled_date)) throw new Error(`回访记录第 ${index + 1} 条的计划日期无效`);
  if (!isString(log.note)) throw new Error(`回访记录第 ${index + 1} 条的备注不是文本`);
}

function validateFollowUp(raw: unknown, memIndex: number): FollowUpPlan | null {
  if (raw === null || raw === undefined) return null;
  if (!isObject(raw)) fail(memIndex, '回访计划');

  // next_date：进行中是日期键；已结束的单次计划是 null
  let nextDate: string | null = null;
  if (raw.next_date !== null) {
    if (!isDateKey(raw.next_date)) fail(memIndex, '回访计划的下次日期');
    nextDate = raw.next_date as string;
  }

  if (!isString(raw.frequency) || !FREQUENCY_SET.has(raw.frequency as FollowUpFrequency)) {
    fail(memIndex, '回访计划的重复频率');
  }
  if (!isString(raw.note)) fail(memIndex, '回访计划备注');
  if (!Array.isArray(raw.logs)) fail(memIndex, '回访记录列表');
  if (!isIsoString(raw.created_at)) fail(memIndex, '回访计划创建时间');
  if (!isIsoString(raw.updated_at)) fail(memIndex, '回访计划更新时间');

  (raw.logs as unknown[]).forEach((l, i) => validateFollowUpLog(l, i));

  return {
    next_date: nextDate,
    frequency: raw.frequency as FollowUpFrequency,
    note: raw.note,
    logs: raw.logs as FollowUpLog[],
    created_at: raw.created_at as string,
    updated_at: raw.updated_at as string,
  };
}

function validateMemory(raw: unknown, index: number): SmellMemory {
  if (!isObject(raw)) throw new Error(`第 ${index + 1} 条气味档案不是有效结构`);

  if (!isString(raw.id) || raw.id.trim() === '') fail(index, 'ID');
  if (!isString(raw.location)) fail(index, '地点');
  if (!isString(raw.source_guess)) fail(index, '气味来源');
  if (!isFiniteNumber(raw.intensity) || raw.intensity < 1 || raw.intensity > 10) fail(index, '气味强度');
  if (!isFiniteNumber(raw.humidity) || raw.humidity < 1 || raw.humidity > 10) fail(index, '湿度');
  if (!isString(raw.season) || !SEASON_SET.has(raw.season as Season)) fail(index, '季节');
  if (!isString(raw.smell_type) || !SMELL_TYPE_SET.has(raw.smell_type as SmellType)) fail(index, '气味类型');
  if (!isString(raw.memory_text)) fail(index, '关联记忆');
  // 颜色用于内联 style 与 contrastTextColor，必须是合法 #rrggbb
  if (!isString(raw.color_association) || !/^#[0-9a-fA-F]{6}$/.test(raw.color_association)) {
    fail(index, '颜色联想');
  }
  if (!isString(raw.emotion) || !EMOTION_SET.has(raw.emotion as Emotion)) fail(index, '情绪');
  if (typeof raw.want_again !== 'boolean') fail(index, '想再闻标记');
  if (!isIsoString(raw.created_at)) fail(index, '创建时间');
  if (!isIsoString(raw.updated_at)) fail(index, '更新时间');

  // follow_up 缺省视为无计划（旧版数据）；存在则必须结构完整
  const followUp = validateFollowUp(raw.follow_up, index);

  const result: SmellMemory = {
    id: raw.id as string,
    location: raw.location as string,
    source_guess: raw.source_guess as string,
    intensity: raw.intensity as number,
    humidity: raw.humidity as number,
    season: raw.season as Season,
    smell_type: raw.smell_type as SmellType,
    memory_text: raw.memory_text as string,
    color_association: raw.color_association as string,
    emotion: raw.emotion as Emotion,
    want_again: raw.want_again as boolean,
    created_at: raw.created_at as string,
    updated_at: raw.updated_at as string,
    follow_up: followUp,
  };
  return result;
}

/**
 * 每次水合（无论版本新旧）都必须经过的整库结构校验。
 * 任何一条记录损坏都抛错，调用方据此进入恢复界面，绝不让坏数据进入页面。
 * 返回校验通过且补好 follow_up 缺省值的档案列表。
 */
export function validatePersistedState(persisted: unknown): { memories: SmellMemory[] } {
  if (!isObject(persisted) || !Array.isArray((persisted as { memories?: unknown }).memories)) {
    throw new Error('已保存的数据结构无法识别（缺少 memories 列表）');
  }
  const list = (persisted as { memories: unknown[] }).memories;
  const memories = list.map((item, i) => validateMemory(item, i));
  return { memories };
}

/**
 * 旧版（v0，无回访计划字段）→ 当前版本的字段归一化。
 * 结构校验统一由 validatePersistedState 在 merge 关口执行，这里不重复。
 * 数据异常时抛错，由调用方进入“保留原数据 + 恢复提示”流程。
 */
export function migrateMemoriesState(
  persisted: unknown,
  fromVersion: number,
): { memories: SmellMemory[] } {
  if (!Number.isInteger(fromVersion) || fromVersion < MIN_STORE_VERSION || fromVersion > CURRENT_STORE_VERSION) {
    throw new Error(`不支持的数据版本：${String(fromVersion)}`);
  }
  // 旧版记录没有 follow_up 字段，校验时会统一补成 null；其余字段原样保留
  return validatePersistedState(persisted);
}
