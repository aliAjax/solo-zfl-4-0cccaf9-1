import { useMemo } from 'react';
import {
  CalendarClock,
  AlarmClock,
  Sun,
  CalendarDays,
  Check,
  ChevronRight,
} from 'lucide-react';
import type { SmellMemory } from '../utils/constants';
import { useMemoryStore } from '../store/memoryStore';
import { useToastStore } from '../store/toastStore';
import {
  groupFollowUps,
  formatDateKey,
  relativeDayLabel,
  isPlanActive,
} from '../utils/followUp';

interface Props {
  memories: SmellMemory[];
  onSelect: (id: string) => void;
  onAddPlan: () => void;
}

export default function FollowUpBoard({ memories, onSelect, onAddPlan }: Props) {
  const completeFollowUp = useMemoryStore((s) => s.completeFollowUp);
  const showToast = useToastStore((s) => s.showToast);

  const groups = useMemo(() => groupFollowUps(memories), [memories]);
  const totalActive = useMemo(
    () => memories.reduce((acc, m) => acc + (isPlanActive(m.follow_up) ? 1 : 0), 0),
    [memories],
  );

  const sections = [
    {
      key: 'overdue' as const,
      title: '逾期',
      icon: AlarmClock,
      tone: 'text-brick-600',
      badge: 'bg-brick-400/15 text-brick-600',
      items: groups.overdue,
    },
    {
      key: 'today' as const,
      title: '今天',
      icon: Sun,
      tone: 'text-ochre-600',
      badge: 'bg-ochre-100 text-ochre-600',
      items: groups.today,
    },
    {
      key: 'upcoming' as const,
      title: '未来',
      icon: CalendarDays,
      tone: 'text-moss-600',
      badge: 'bg-moss-100 text-moss-600',
      items: groups.upcoming,
    },
  ];

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-hand text-2xl text-moss-600 flex items-center gap-2">
          <CalendarClock className="w-5 h-5" />
          回访计划
        </h2>
        {totalActive > 0 && (
          <span className="text-xs text-ink-700/50">
            {totalActive} 个进行中 · 逾期 {groups.overdue.length}
          </span>
        )}
      </div>

      {totalActive === 0 ? (
        <div className="bg-paper-50/70 backdrop-blur rounded-3xl border-2 border-dashed border-paper-400 py-12 px-6 text-center">
          <div className="text-5xl mb-3 select-none">🕰️</div>
          <h3 className="font-serif text-xl text-ink-800 mb-1.5">还没有安排任何回访</h3>
          <p className="text-sm text-ink-700/60 max-w-sm mx-auto mb-5">
            给某段气味定个日子再来闻一次——每周、每月或每年，看看时间让味道发生了什么变化
          </p>
          <button onClick={onAddPlan} className="btn-primary !bg-moss-500 hover:!bg-moss-600">
            去安排第一次回访
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {sections.map((sec) => {
            const Icon = sec.icon;
            return (
              <div
                key={sec.key}
                className="bg-paper-50/80 backdrop-blur rounded-2xl border border-paper-300 shadow-card p-3.5 flex flex-col min-h-[120px]"
              >
                <div className="flex items-center gap-2 px-1 pb-2.5 mb-1 border-b border-paper-200">
                  <Icon className={`w-[18px] h-[18px] ${sec.tone}`} />
                  <span className={`font-serif font-semibold ${sec.tone}`}>{sec.title}</span>
                  <span className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded-full ${sec.badge}`}>
                    {sec.items.length}
                  </span>
                </div>

                {sec.items.length === 0 ? (
                  <p className="text-xs text-ink-700/40 text-center py-5">暂无安排</p>
                ) : (
                  <ul className="space-y-1.5">
                    {sec.items.map((m) => (
                      <li
                        key={m.id}
                        className="group rounded-xl border border-paper-200/80 bg-paper-50 px-3 py-2 hover:border-moss-300 hover:bg-moss-50/60 transition-colors"
                      >
                        <button
                          onClick={() => onSelect(m.id)}
                          className="w-full text-left flex items-center gap-2"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-ink-800 truncate">
                              {m.location}
                            </p>
                            <p className="text-[11px] text-ink-700/55 mt-0.5">
                              {formatDateKey(m.follow_up!.next_date as string)} ·{' '}
                              {relativeDayLabel(m.follow_up!.next_date as string)}
                            </p>
                          </div>
                          <ChevronRight className="w-4 h-4 shrink-0 text-ink-700/30 group-hover:text-moss-500 transition-colors" />
                        </button>
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <button
                            onClick={() => {
                              const logId = completeFollowUp(m.id);
                              if (logId) showToast('回访已完成，下次日期已自动安排', 'success');
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium bg-moss-500/10 text-moss-600 hover:bg-moss-500 hover:text-paper-50 transition-colors min-h-[26px]"
                          >
                            <Check className="w-3 h-3" />
                            完成回访
                          </button>
                          {m.follow_up!.note && (
                            <span className="text-[11px] text-ink-700/45 truncate flex-1">
                              📝 {m.follow_up!.note}
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
