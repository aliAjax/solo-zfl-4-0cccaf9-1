import { useEffect, useMemo, useState } from 'react';
import { X, CalendarClock } from 'lucide-react';
import { FOLLOW_UP_FREQUENCIES } from '../utils/constants';
import type { FollowUpFrequency } from '../utils/constants';
import type { FollowUpInput } from '../store/memoryStore';
import { useMemoryStore } from '../store/memoryStore';
import { dateKeyOffset } from '../utils/followUp';

interface Props {
  isOpen: boolean;
  /** 从某张卡片打开时传入；为空（看板空状态）时在弹窗内选择档案 */
  initialMemoryId?: string | null;
  onClose: () => void;
  onSubmit: (memoryId: string, input: FollowUpInput) => void;
}

export default function FollowUpModal({ isOpen, initialMemoryId, onClose, onSubmit }: Props) {
  const memories = useMemoryStore((s) => s.memories);
  const [memoryId, setMemoryId] = useState('');
  const [date, setDate] = useState(dateKeyOffset(7));
  const [frequency, setFrequency] = useState<FollowUpFrequency>('none');
  const [note, setNote] = useState('');

  const memory = useMemo(
    () => memories.find((m) => m.id === memoryId) ?? null,
    [memories, memoryId],
  );
  const existing = memory?.follow_up ?? null;

  // 打开时根据入口初始化目标档案与表单
  useEffect(() => {
    if (!isOpen) return;
    const target = initialMemoryId
      ? memories.find((m) => m.id === initialMemoryId) ?? null
      : null;
    setMemoryId(target?.id ?? '');
    setDate(target?.follow_up?.next_date ?? dateKeyOffset(7));
    setFrequency(target?.follow_up?.frequency ?? 'none');
    setNote(target?.follow_up?.note ?? '');
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
    // 只在每次打开时初始化，memories 的变化不应重置正在填写的表单
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialMemoryId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  // 已选档案后，用户在弹窗内切换档案时同步该档案的计划内容
  const handleSelectMemory = (id: string) => {
    const target = memories.find((m) => m.id === id);
    setMemoryId(id);
    setDate(target?.follow_up?.next_date ?? dateKeyOffset(7));
    setFrequency(target?.follow_up?.frequency ?? 'none');
    setNote(target?.follow_up?.note ?? '');
  };

  const quickPicks: { label: string; offset: number }[] = [
    { label: '明天', offset: 1 },
    { label: '下周', offset: 7 },
    { label: '下月', offset: 30 },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!memoryId || !date) return;
    onSubmit(memoryId, { next_date: date, frequency, note: note.trim() });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4 sm:pt-8">
      <div
        className="absolute inset-0 bg-ink-900/40 backdrop-blur-sm"
        onClick={onClose}
        style={{ animation: 'fadeIn 0.3s ease-out' }}
      />
      <div className="relative w-full sm:max-w-lg bg-paper-50 rounded-t-3xl sm:rounded-3xl shadow-2xl border border-paper-300 animate-slideDown max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-paper-200 rounded-t-3xl bg-paper-50/95 backdrop-blur">
          <div className="min-w-0">
            <h2 className="font-serif text-xl sm:text-2xl font-bold text-ink-800 flex items-center gap-2">
              <CalendarClock className="w-5 h-5 text-moss-500 shrink-0" />
              {existing ? '编辑回访计划' : '安排一次回访'}
            </h2>
            {memory && (
              <p className="text-sm text-ink-700/60 mt-0.5 font-hand truncate">
                「{memory.location}」
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-ink-700/60 hover:text-ink-800 hover:bg-paper-200 transition-colors shrink-0"
            aria-label="关闭"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {!initialMemoryId && (
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1.5">选择气味档案 *</label>
              {memories.length === 0 ? (
                <p className="text-sm text-brick-600 bg-brick-400/10 rounded-xl px-3 py-2.5">
                  还没有任何气味档案，先封存一段气味再来安排回访吧。
                </p>
              ) : (
                <select
                  required
                  value={memoryId}
                  onChange={(e) => handleSelectMemory(e.target.value)}
                  className="scent-select scent-input"
                >
                  <option value="" disabled>请选择一段气味…</option>
                  {memories.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.location}
                      {m.follow_up?.next_date ? `（已有计划）` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div className={!initialMemoryId && !memoryId ? 'opacity-50 pointer-events-none' : ''}>
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-2">下次回访日期 *</label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="scent-input"
                />
                <div className="flex gap-2 mt-2.5">
                  {quickPicks.map((q) => (
                    <button
                      key={q.label}
                      type="button"
                      onClick={() => setDate(dateKeyOffset(q.offset))}
                      className="px-3 py-1.5 rounded-full text-xs font-medium bg-paper-100 text-ink-700 border border-paper-200 hover:bg-moss-100 hover:text-moss-600 transition-colors"
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-ink-700 mb-2">重复频率</label>
                <div className="grid grid-cols-4 gap-2">
                  {FOLLOW_UP_FREQUENCIES.map((f) => (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => setFrequency(f.value)}
                      className={`py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                        frequency === f.value
                          ? 'bg-moss-500 text-paper-50 shadow-paper scale-[1.02]'
                          : 'bg-paper-100 text-ink-700 hover:bg-paper-200 border border-paper-200'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-ink-700/50 mt-2 min-h-[1rem]">
                  {frequency === 'none' && '完成这次回访后计划自动结束，只保留记录。'}
                  {frequency === 'weekly' && '完成后自动安排到 7 天后；若已逾期，会顺延到最近的未来日期。'}
                  {frequency === 'monthly' && '每月同一天回访，月末自动取当月最后一天。'}
                  {frequency === 'yearly' && '每年回访一次，像纪念某个季节的味道。'}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1.5">备注</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder="回访时想留意什么？例如：对比一下和上次的浓度差别…"
                  className="scent-textarea font-serif"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-paper-200">
            <button type="button" onClick={onClose} className="btn-secondary">
              取消
            </button>
            <button
              type="submit"
              className="btn-primary !bg-moss-500 hover:!bg-moss-600 disabled:opacity-50 disabled:pointer-events-none"
              disabled={!initialMemoryId && !memoryId}
            >
              {existing ? '保存计划' : '安排回访'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
