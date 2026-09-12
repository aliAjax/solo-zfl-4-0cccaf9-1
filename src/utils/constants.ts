export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type SmellType = 'woody' | 'floral' | 'fruity' | 'earthy' | 'spicy' | 'sweet' | 'musty' | 'fresh' | 'burnt' | 'other';
export type Emotion = 'warm' | 'nostalgic' | 'peaceful' | 'melancholy' | 'joyful' | 'uncomfortable' | 'surprising';

/** 回访频率：不重复 / 每周 / 每月 / 每年 */
export type FollowUpFrequency = 'none' | 'weekly' | 'monthly' | 'yearly';

/** 一次已完成的回访记录 */
export interface FollowUpLog {
  /** 实际完成时间 ISO */
  completed_at: string;
  /** 这次回访原本安排的日期 YYYY-MM-DD */
  scheduled_date: string;
  /** 完成时快照的备注 */
  note: string;
}

/** 气味档案的回访计划 */
export interface FollowUpPlan {
  /** 下次回访日期 YYYY-MM-DD；计划结束（不重复已完成）后为 null */
  next_date: string | null;
  frequency: FollowUpFrequency;
  /** 计划备注 */
  note: string;
  /** 完成历史，最新在最前 */
  logs: FollowUpLog[];
  /** 创建时间 ISO */
  created_at: string;
  /** 最近一次更新时间 ISO */
  updated_at: string;
}

export const FOLLOW_UP_FREQUENCIES: { value: FollowUpFrequency; label: string; short: string }[] = [
  { value: 'none', label: '不重复', short: '单次' },
  { value: 'weekly', label: '每周', short: '周' },
  { value: 'monthly', label: '每月', short: '月' },
  { value: 'yearly', label: '每年', short: '年' },
];

export function getFrequencyInfo(f: FollowUpFrequency) {
  return FOLLOW_UP_FREQUENCIES.find((x) => x.value === f)!;
}

export interface SmellMemory {
  id: string;
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
  created_at: string;
  updated_at: string;
  /** 回访计划，没有计划时为 null（兼容旧数据） */
  follow_up?: FollowUpPlan | null;
}

export const SEASONS: { value: Season; label: string; emoji: string }[] = [
  { value: 'spring', label: '春', emoji: '🌸' },
  { value: 'summer', label: '夏', emoji: '☀️' },
  { value: 'autumn', label: '秋', emoji: '🍂' },
  { value: 'winter', label: '冬', emoji: '❄️' },
];

export const SMELL_TYPES: { value: SmellType; label: string; emoji: string; color: string }[] = [
  { value: 'woody', label: '木质', emoji: '🪵', color: '#8B5A2B' },
  { value: 'floral', label: '花香', emoji: '🌺', color: '#C06C84' },
  { value: 'fruity', label: '果香', emoji: '🍑', color: '#F67280' },
  { value: 'earthy', label: '泥土', emoji: '🌱', color: '#6B8E23' },
  { value: 'spicy', label: '辛香', emoji: '🌶️', color: '#CD5C5C' },
  { value: 'sweet', label: '甜香', emoji: '🍯', color: '#D4A574' },
  { value: 'musty', label: '霉味', emoji: '🍄', color: '#8B7355' },
  { value: 'fresh', label: '清新', emoji: '🍃', color: '#7DA08C' },
  { value: 'burnt', label: '焦味', emoji: '🔥', color: '#4A3728' },
  { value: 'other', label: '其他', emoji: '✨', color: '#9B8AA6' },
];

export const EMOTIONS: { value: Emotion; label: string; emoji: string; bg: string; text: string }[] = [
  { value: 'warm', label: '温暖', emoji: '🤗', bg: 'bg-ochre-100', text: 'text-ochre-600' },
  { value: 'nostalgic', label: '怀旧', emoji: '📜', bg: 'bg-lavender-300/40', text: 'text-lavender-600' },
  { value: 'peaceful', label: '宁静', emoji: '🌊', bg: 'bg-moss-100', text: 'text-moss-600' },
  { value: 'melancholy', label: '忧郁', emoji: '🌧️', bg: 'bg-paper-300', text: 'text-ink-700' },
  { value: 'joyful', label: '愉悦', emoji: '🎉', bg: 'bg-paper-200', text: 'text-brick-500' },
  { value: 'uncomfortable', label: '不适', emoji: '😣', bg: 'bg-brick-400/20', text: 'text-brick-600' },
  { value: 'surprising', label: '惊喜', emoji: '✨', bg: 'bg-lavender-300/40', text: 'text-lavender-600' },
];

export const HUMIDITY_LABELS: Record<number, string> = {
  1: '极干',
  3: '偏干',
  5: '适中',
  7: '偏湿',
  10: '极湿',
};

export function getSeasonInfo(s: Season) {
  return SEASONS.find(x => x.value === s)!;
}
export function getSmellTypeInfo(t: SmellType) {
  return SMELL_TYPES.find(x => x.value === t)!;
}
export function getEmotionInfo(e: Emotion) {
  return EMOTIONS.find(x => x.value === e)!;
}
