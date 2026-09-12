import type { FollowUpFrequency, FollowUpPlan, SmellMemory } from './constants';

/** 本地时区下的 YYYY-MM-DD */
export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 今天的日期键 */
export function todayKey(): string {
  return toDateKey(new Date());
}

/** 距今 offset 天的日期键（负数表示过去） */
export function dateKeyOffset(offsetDays: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return toDateKey(d);
}

/** 把 YYYY-MM-DD 解析为本地日期（避免 UTC 偏移） */
export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** 日期键转中文显示 */
export function formatDateKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return `${y}年${m}月${d}日`;
}

/** 与今天相差的整天数：负数=已过去，0=今天，正数=未来 */
export function daysFromToday(key: string): number {
  const target = parseDateKey(key);
  const today = parseDateKey(todayKey());
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

/** 相对描述：逾期3天 / 今天 / 明天 / 3天后 */
export function relativeDayLabel(key: string): string {
  const diff = daysFromToday(key);
  if (diff === 0) return '今天';
  if (diff === -1) return '昨天';
  if (diff === 1) return '明天';
  if (diff < 0) return `逾期 ${-diff} 天`;
  return `${diff} 天后`;
}

/** 月份推进时处理月末溢出（1月31日 + 1月 → 2月28/29日） */
function addMonths(base: Date, count: number): Date {
  const year = base.getFullYear();
  const month = base.getMonth() + count;
  const day = base.getDate();
  const firstOfTarget = new Date(year, month, 1);
  const lastDay = new Date(
    firstOfTarget.getFullYear(),
    firstOfTarget.getMonth() + 1,
    0,
  ).getDate();
  return new Date(year, month, Math.min(day, lastDay));
}

/**
 * 按频率推进一次日期。
 * 若推进结果仍不在今天之后（长期逾期的周期计划），继续向前推进到下一个未来日期。
 * 每次都从原始计划日加 n 个周期，避免月末钳制复合后日期漂移（1/31→2/28→3/28）。
 */
export function advanceDate(
  dateKey: string,
  frequency: FollowUpFrequency,
  completedAt = new Date(),
): string | null {
  if (frequency === 'none') return null;

  const base = parseDateKey(dateKey);
  const tomorrow = new Date(
    completedAt.getFullYear(),
    completedAt.getMonth(),
    completedAt.getDate() + 1,
  );

  const stepN = (n: number): Date => {
    switch (frequency) {
      case 'weekly':
        return new Date(base.getFullYear(), base.getMonth(), base.getDate() + 7 * n);
      case 'monthly':
        return addMonths(base, n);
      case 'yearly':
        return addMonths(base, 12 * n);
      default:
        return base;
    }
  };

  for (let n = 1; n < 1000; n += 1) {
    const next = stepN(n);
    if (next >= tomorrow) return toDateKey(next);
  }
  return null;
}

/** 计划是否仍在跟踪中（有下次日期） */
export function isPlanActive(plan: FollowUpPlan | null | undefined): boolean {
  return !!plan && plan.next_date !== null;
}

export type FollowUpGroup = 'overdue' | 'today' | 'upcoming';

/** 计算一条带计划的记忆所属分组 */
export function planGroup(plan: FollowUpPlan): FollowUpGroup {
  const diff = daysFromToday(plan.next_date as string);
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  return 'upcoming';
}

export interface GroupedFollowUp {
  overdue: SmellMemory[];
  today: SmellMemory[];
  upcoming: SmellMemory[];
}

/** 取所有跟踪中的计划，按 逾期 / 今天 / 未来 分组；组内按日期升序（逾期最久的排最前） */
export function groupFollowUps(memories: SmellMemory[]): GroupedFollowUp {
  const groups: GroupedFollowUp = { overdue: [], today: [], upcoming: [] };
  for (const m of memories) {
    if (!isPlanActive(m.follow_up)) continue;
    groups[planGroup(m.follow_up)].push(m);
  }
  const byDateAsc = (a: SmellMemory, b: SmellMemory) =>
    (a.follow_up!.next_date as string).localeCompare(b.follow_up!.next_date as string);
  groups.overdue.sort(byDateAsc);
  groups.today.sort(byDateAsc);
  groups.upcoming.sort(byDateAsc);
  return groups;
}

export function countActiveFollowUps(memories: SmellMemory[]): number {
  return memories.reduce((acc, m) => acc + (isPlanActive(m.follow_up) ? 1 : 0), 0);
}

/** 频率的按钮文本 */
export function frequencyLabel(f: FollowUpFrequency): string {
  switch (f) {
    case 'none':
      return '不重复';
    case 'weekly':
      return '每周';
    case 'monthly':
      return '每月';
    case 'yearly':
      return '每年';
  }
}
