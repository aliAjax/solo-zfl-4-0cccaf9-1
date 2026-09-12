import { Component, type ErrorInfo, type ReactNode } from 'react';
import StorageRecoveryModal from './StorageRecoveryModal';
import { setStorageWritesBlocked, readRawStorage, STORAGE_KEY } from '../store/safeStorage';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  hasRaw: boolean;
}

/**
 * 根级兜底：即使有未预见的坏数据导致渲染崩溃，也不能白屏。
 * 一旦崩溃：立刻封锁本地写入（保护原始数据），并展示同一个恢复界面。
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, hasRaw: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error, hasRaw: readRawStorage(STORAGE_KEY) !== null };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 崩溃即冻结写入，避免任何后续状态把用户原始数据覆盖掉
    setStorageWritesBlocked(true);
    if (import.meta.env?.DEV) {
      console.error('[气味档案] 页面渲染异常，已进入恢复模式：', error, info.componentStack);
    }
  }

  handleReload = () => {
    // 用户可先在界面上下载/复制原始数据；修复后刷新页面重新走水合
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <StorageRecoveryModal
        message={error.message || '页面渲染时发生未知错误（可能由损坏的本地数据引起）'}
        reason="render"
        renderError
        onAfterRetry={this.handleReload}
      />
    );
  }
}
