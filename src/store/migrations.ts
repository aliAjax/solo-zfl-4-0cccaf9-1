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

/** 数据无法进入页面的原因，决定恢复界面的措辞 */
export type DataErrorReason =
  | 'parse' // 本地 JSON 无法解析
  | 'migrate' // 旧版本升级失败
  | 'validate' // 当前版本数据结构/字段损坏
  | 'render'; // 页面渲染崩溃（兜底）

/** 带原因的数据错误，恢复界面据此显示与实际情况一致的提示 */
export class DataIntegrityError extends Error {
  reason: DataErrorReason;
  constructor(reason: DataErrorReason, message: string) {
    super(message);
    this.name = 'DataIntegrityError';
    this.reason = reason;
  }
}

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

function daysInMonth(year: number, month1: number): number {
  return new Date(year, month1, 0).getDate();
}

/**
 * 严格校验“日历日”是否真实存在，绝不使用 new Date(str) 判断——
 * 因为 JS 会把 2026-02-30 静默归一化成 3 月 2 日，把非闰年的 02-29 归一化成 3 月 1 日。
 */
function isValidCalendarDay(year: number, month1: number, day: number): boolean {
  if (!Number.isInteger(year) || year < 1000 || year > 9999) return false;
  if (!Number.isInteger(month1) || month1 < 1 || month1 > 12) return false;
  if (!Number.isInteger(day) || day < 1) return false;
  return day <= daysInMonth(year, month1);
}

/** YYYY-MM-DD 且日期真实存在（拒绝 2 月 30 日、非闰年 2 月 29 日） */
function isDateKey(x: unknown): x is string {
  if (typeof x !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(x);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  return isValidCalendarDay(year, month, day);
}

/**
 * 严格的 ISO 8601 日期时间校验。
 * 接受：
 *   2025-01-01T00:00:00.000Z
 *   2025-01-01T08:00:00+08:00 / …+0800 / …Z
 *   2025-01-01T00:00:00（无时区，按本地时间解释，Date 可解析）
 *   2025-01-01（仅日期）
 * 每个数字字段单独验证范围并核对真实日历日，避免 Date 的自动归一化放坏值过关。
 */
function isIsoDateTime(x: unknown): boolean {
  if (typeof x !== 'string' || x.trim() === '') return false;

  // 仅日期形式：交给 isDateKey 的严格日历校验
  if (/^\d{4}-\d{2}-\d{2}$/.test(x)) return isDateKey(x);

  const m = x.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:?\d{2})?$/,
  );
  if (!m) return false;

  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = Number(m[6]);

  if (hour > 23 || minute > 59 || second > 59) return false; // 闰秒等极端值不接受
  if (!isValidCalendarDay(year, month, day)) return false;

  // 显式时区偏移也要在合法范围
  if (m[8] && m[8] !== 'Z') {
    const tz = m[8].replace(':', '');
    const tzH = Number(tz.slice(1, 3));
    const tzM = Number(tz.slice(3, 5));
    if (tzH > 23 || tzM > 59) return false;
  }

  // 最后用 Date 兜底（确保没有其它语义问题），但不能只靠它
  const t = new Date(x).getTime();
  return Number.isFinite(t);
}

function fail(indexOrMsg: number | string, field: string): never {
  const prefix = typeof indexOrMsg === 'number' ? `第 ${indexOrMsg + 1} 条档案` : indexOrMsg;
  throw new DataIntegrityError('validate', `${prefix}的「${field}」字段缺失或已损坏`);
}

function validateFollowUpLog(log: unknown, index: number): asserts log is FollowUpLog {
  if (!isObject(log)) throw new DataIntegrityError('validate', `回访记录第 ${index + 1} 条不是有效结构`);
  if (!isIsoDateTime(log.completed_at)) {
    throw new DataIntegrityError('validate', `回访记录第 ${index + 1} 条的完成时间不是有效日期时间（如 2 月 30 日这类非法日期不被接受）`);
  }
  if (!isDateKey(log.scheduled_date)) {
    throw new DataIntegrityError('validate', `回访记录第 ${index + 1} 条的计划日期无效或不存在`);
  }
  if (!isString(log.note)) throw new DataIntegrityError('validate', `回访记录第 ${index + 1} 条的备注不是文本`);
}

function validateFollowUp(raw: unknown, memIndex: number): FollowUpPlan | null {
  if (raw === null || raw === undefined) return null;
  if (!isObject(raw)) fail(memIndex, '回访计划');

  // next_date：进行中是日期键；已结束的单次计划是 null
  let nextDate: string | null = null;
  if (raw.next_date !== null) {
    if (!isDateKey(raw.next_date)) fail(memIndex, '回访计划的下次日期（日期不存在）');
    nextDate = raw.next_date as string;
  }

  if (!isString(raw.frequency) || !FREQUENCY_SET.has(raw.frequency as FollowUpFrequency)) {
    fail(memIndex, '回访计划的重复频率');
  }
  if (!isString(raw.note)) fail(memIndex, '回访计划备注');
  if (!Array.isArray(raw.logs)) fail(memIndex, '回访记录列表');
  if (!isIsoDateTime(raw.created_at)) fail(memIndex, '回访计划创建时间');
  if (!isIsoDateTime(raw.updated_at)) fail(memIndex, '回访计划更新时间');

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
  if (!isObject(raw)) {
    throw new DataIntegrityError('validate', `第 ${index + 1} 条气味档案不是有效结构`);
  }

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
  if (!isIsoDateTime(raw.created_at)) fail(index, '创建时间（日期不存在或格式不正确）');
  if (!isIsoDateTime(raw.updated_at)) fail(index, '更新时间（日期不存在或格式不正确）');

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
 * 任何一条记录损坏都抛出带原因的 DataIntegrityError，
 * 调用方据此进入恢复界面，绝不让坏数据进入页面。
 */
export function validatePersistedState(persisted: unknown): { memories: SmellMemory[] } {
  if (!isObject(persisted) || !Array.isArray((persisted as { memories?: unknown }).memories)) {
    throw new DataIntegrityError('validate', '已保存的数据结构无法识别（缺少 memories 列表）');
  }
  const list = (persisted as { memories: unknown[] }).memories;
  const memories = list.map((item, i) => validateMemory(item, i));
  return { memories };
}

/**
 * 旧版（v0，无回访计划字段）→ 当前版本。
 * 结构校验统一由 validatePersistedState 在 merge 关口执行；这里负责区分“升级失败”原因。
 */
export function migrateMemoriesState(
  persisted: unknown,
  fromVersion: number,
): { memories: SmellMemory[] } {
  if (!Number.isInteger(fromVersion) || fromVersion < MIN_STORE_VERSION || fromVersion > CURRENT_STORE_VERSION) {
    throw new DataIntegrityError('migrate', `不支持的数据版本：${String(fromVersion)}`);
  }
  try {
    // 旧版记录没有 follow_up 字段，校验时统一补成 null；其余字段原样保留
    return validatePersistedState(persisted);
  } catch (e) {
    // 升级路径里的字段损坏要明确告诉用户是“升级失败”，而不是笼统的数据异常
    if (e instanceof DataIntegrityError) {
      throw new DataIntegrityError('migrate', e.message);
    }
    throw new DataIntegrityError('migrate', e instanceof Error ? e.message : '旧版数据升级失败');
  }
}
