import { useState } from 'react';
import { CalendarClock, Check, Pencil, RotateCcw, Trash2, History } from 'lucide-react';
import type { SmellMemory } from '../utils/constants';
import { getFrequencyInfo } from '../utils/constants';
import { useMemoryStore } from '../store/memoryStore';
import { useToastStore } from '../store/toastStore';
import { formatDate } from '../utils/helpers';
import {
  formatDateKey,
  relativeDayLabel,
  daysFromToday,
  isPlanActive,
  toDateKey,
} from '../utils/followUp';

interface Props {
  memory: SmellMemory;
  onEditPlan: () => void;
}

export default function FollowUpPanel({ memory, onEditPlan }: Props) {
  const { completeFollowUp, removeFollowUp } = useMemoryStore();
  const showToast = useToastStore((s) => s.showToast);
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const plan = memory.follow_up ?? null;

  // 没有计划：空状态引导
  if (!plan) {
    return (
      <div className="mt-3 rounded-xl border border-dashed border-moss-300 bg-moss-50/60 px-4 py-3.5 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-moss-600 flex items-center gap-1.5">
            <CalendarClock className="w-4 h-4" />
            还没有回访计划
          </p>
          <p className="text-xs text-ink-700/55 mt-1">
            定个日子再来闻一次，看看这缕味道有没有变化
          </p>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onEditPlan(); }}
          className="shrink-0 inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-moss-500 hover:bg-moss-600 text-paper-50 transition-colors shadow-paper"
        >
          <CalendarClock className="w-4 h-4" />
          安排回访
        </button>
      </div>
    );
  }

  const active = isPlanActive(plan);
  const diff = active ? daysFromToday(plan.next_date as string) : null;
  const freq = getFrequencyInfo(plan.frequency);

  const handleComplete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    // 同步执行完成逻辑；store 内部有同 tick 防连点锁
    const logId = completeFollowUp(memory.id);
    // 延迟一小段时间解锁按钮，吞掉快速连点（store 同时在数据层去重）
    window.setTimeout(() => setBusy(false), 600);
    if (logId) {
      showToast(
        plan.frequency === 'none'
          ? '回访已完成，计划已结束，记录已保存'
          : '回访已完成，已自动安排好下次日期',
        'success',
      );
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('移除这条回访计划吗？历史回访记录也会一并删除。')) {
      removeFollowUp(memory.id);
      showToast('回访计划已移除', 'info');
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-moss-200 bg-moss-50/70 overflow-hidden">
      <div className="px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {active ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-hand text-lg text-moss-600 leading-none">下次回访</span>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                      diff! < 0
                        ? 'bg-brick-400/15 text-brick-600'
                        : diff === 0
                          ? 'bg-ochre-100 text-ochre-600'
                          : 'bg-moss-100 text-moss-600'
                    }`}
                  >
                    {relativeDayLabel(plan.next_date as string)}
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-paper-200 text-ink-700/80">
                    🔁 {freq.label}
                  </span>
                </div>
                <p className="text-sm text-ink-800 font-medium mt-1">
                  {formatDateKey(plan.next_date as string)}
                </p>
              </>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-hand text-lg text-moss-600 leading-none">回访已结束</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-moss-100 text-moss-600">
                  <Check className="w-3 h-3" />
                  已完成 {plan.logs.length} 次
                </span>
              </div>
            )}
            {plan.note && (
              <p className="text-[13px] text-ink-700/75 mt-1.5 leading-relaxed whitespace-pre-wrap">
                📝 {plan.note}
              </p>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {active && (
            <button
              onClick={handleComplete}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-medium bg-moss-500 hover:bg-moss-600 disabled:opacity-60 disabled:pointer-events-none text-paper-50 transition-colors shadow-paper min-h-[36px]"
            >
              <Check className="w-4 h-4" />
              {busy ? '记录中…' : '完成本次回访'}
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onEditPlan(); }}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs sm:text-sm text-moss-600 hover:bg-moss-100 transition-colors min-h-[36px]"
          >
            {active ? <Pencil className="w-4 h-4" /> : <RotateCcw className="w-4 h-4" />}
            {active ? '编辑' : '重新安排'}
          </button>
          {plan.logs.length > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowHistory((v) => !v); }}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs sm:text-sm text-ink-700/70 hover:bg-paper-200 transition-colors min-h-[36px]"
            >
              <History className="w-4 h-4" />
              回访记录（{plan.logs.length}）
            </button>
          )}
          <button
            onClick={handleRemove}
            className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl text-xs sm:text-sm text-brick-500 hover:bg-brick-500/10 transition-colors min-h-[36px] ml-auto"
          >
            <Trash2 className="w-4 h-4" />
            <span className="hidden sm:inline">移除计划</span>
          </button>
        </div>
      </div>

      {showHistory && plan.logs.length > 0 && (
        <ul className="border-t border-moss-200/80 bg-paper-50/60 px-4 py-2.5 space-y-2">
          {plan.logs.map((log, i) => (
            <li key={`${log.completed_at}-${i}`} className="text-xs sm:text-[13px] leading-relaxed">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium text-moss-600">
                  第 {plan.logs.length - i} 次 · {formatDate(log.completed_at)}
                </span>
                <span className="text-ink-700/45">
                  计划日 {formatDateKey(log.scheduled_date)}
                  {toDateKey(new Date(log.completed_at)) > log.scheduled_date
                    ? '（补回访）'
                    : ''}
                </span>
              </div>
              {log.note && <p className="text-ink-700/70 mt-0.5">📝 {log.note}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
