import { useState } from 'react';
import { ShieldAlert, Download, Copy, RotateCcw, Trash2, Check, ChevronDown } from 'lucide-react';
import { useMemoryStore } from '../store/memoryStore';
import { useToastStore } from '../store/toastStore';
import {
  STORAGE_KEY,
  readRawStorage,
  forceClearStorage,
} from '../store/safeStorage';

interface Props {
  message: string;
  migration: boolean;
}

function downloadBackup(raw: string) {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const blob = new Blob([raw], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `气味档案备份-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function StorageRecoveryModal({ message, migration }: Props) {
  const retryHydration = useMemoryStore((s) => s.retryHydration);
  const showToast = useToastStore((s) => s.showToast);
  const [showRaw, setShowRaw] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [copied, setCopied] = useState(false);

  const raw = readRawStorage(STORAGE_KEY);

  const handleCopy = async () => {
    if (!raw) return;
    try {
      await navigator.clipboard.writeText(raw);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // 剪贴板权限被拒时回退到选中原文，方便手动复制
      setShowRaw(true);
      showToast('无法自动复制，请手动选中下面的原文复制', 'info');
    }
  };

  const handleDownload = () => {
    if (!raw) {
      showToast('没有可备份的原始数据', 'error');
      return;
    }
    downloadBackup(raw);
    showToast('备份文件已下载', 'success');
  };

  const handleReset = () => {
    // 二次确认 + 先自动下载备份，尽量保证用户原数据可找回
    if (!confirmReset) {
      if (raw) downloadBackup(raw);
      setConfirmReset(true);
      return;
    }
    if (raw && !forceClearStorage(STORAGE_KEY)) {
      showToast('清除失败，请手动清理浏览器本地存储', 'error');
      return;
    }
    retryHydration();
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 overflow-y-auto">
      <div className="absolute inset-0 bg-ink-900/50 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg bg-paper-50 rounded-3xl shadow-2xl border-2 border-brick-400/40 animate-slideDown my-8">
        <div className="px-6 pt-6 pb-4 border-b border-paper-200">
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-11 h-11 rounded-2xl bg-brick-400/15 flex items-center justify-center">
              <ShieldAlert className="w-6 h-6 text-brick-600" />
            </div>
            <div className="min-w-0">
              <h2 className="font-serif text-xl sm:text-2xl font-bold text-ink-800">
                {migration ? '旧版气味档案升级失败' : '本地档案读取失败'}
              </h2>
              <p className="text-sm text-ink-700/70 mt-1 leading-relaxed">
                别担心，你的原始数据<strong className="text-brick-600">没有被修改或覆盖</strong>，
                仍完整保存在浏览器里。当前已暂停一切写入来保护它。
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div className="rounded-xl bg-brick-400/10 border border-brick-400/30 px-4 py-3">
            <p className="text-xs font-medium text-brick-600 mb-0.5">失败原因</p>
            <p className="text-sm text-ink-800 break-all">{message}</p>
          </div>

          <div>
            <p className="text-sm text-ink-700/80 leading-relaxed">
              建议先把原始数据备份出来，再尝试重新加载；如果你在另一个标签页或工具里手动修复了数据，点重试即可。
            </p>
          </div>

          {raw && (
            <div>
              <button
                onClick={() => setShowRaw((v) => !v)}
                className="inline-flex items-center gap-1 text-sm text-ochre-600 hover:text-ochre-700 font-medium"
              >
                <ChevronDown className={`w-4 h-4 transition-transform ${showRaw ? 'rotate-180' : ''}`} />
                {showRaw ? '收起' : '查看'}原始数据
              </button>
              {showRaw && (
                <pre className="mt-2 max-h-44 overflow-auto rounded-xl bg-ink-900/90 text-paper-100 text-xs leading-relaxed p-3 whitespace-pre-wrap break-all">
                  {raw}
                </pre>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button onClick={handleDownload} className="btn-primary justify-center">
              <Download className="w-4 h-4" />
              下载备份文件
            </button>
            <button onClick={handleCopy} className="btn-secondary justify-center" disabled={!raw}>
              {copied ? <Check className="w-4 h-4 text-moss-500" /> : <Copy className="w-4 h-4" />}
              {copied ? '已复制' : '复制原始数据'}
            </button>
            <button onClick={retryHydration} className="btn-secondary justify-center sm:col-span-2 !bg-moss-100 !border-moss-300 !text-moss-600 hover:!bg-moss-200">
              <RotateCcw className="w-4 h-4" />
              我已处理好，重试加载
            </button>
          </div>

          <div className="pt-3 border-t border-paper-200">
            {!confirmReset ? (
              <button
                onClick={handleReset}
                className="inline-flex items-center gap-1.5 text-xs text-ink-700/50 hover:text-brick-600 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                数据无法恢复？放弃旧档案并重置（会先自动下载备份）
              </button>
            ) : (
              <div className="rounded-xl bg-brick-400/10 border border-brick-400/30 px-4 py-3">
                <p className="text-sm text-ink-800 mb-2.5">
                  备份文件应已开始下载。确认要<strong className="text-brick-600">永久清除</strong>本地档案并以空库重新开始吗？此操作不可撤销。
                </p>
                <div className="flex gap-2.5">
                  <button
                    onClick={handleReset}
                    className="btn-danger !px-4 !py-2 text-sm"
                  >
                    确认清除并重置
                  </button>
                  <button
                    onClick={() => setConfirmReset(false)}
                    className="btn-secondary !px-4 !py-2 text-sm"
                  >
                    再想想
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
