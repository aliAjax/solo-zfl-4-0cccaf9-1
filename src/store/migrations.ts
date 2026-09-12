import type { SmellMemory } from '../utils/constants';

/** persist 的当前数据版本；旧版数据没有 version 字段，按 0 处理 */
export const CURRENT_STORE_VERSION = 2;
const MIN_STORE_VERSION = 0;

/** 校验一条档案是否保留了原有核心字段，避免迁移出残缺数据 */
function looksLikeMemory(x: unknown): x is SmellMemory {
  if (typeof x !== 'object' || x === null) return false;
  const m = x as Record<string, unknown>;
  return (
    typeof m.id === 'string' &&
    typeof m.location === 'string' &&
    typeof m.created_at === 'string'
  );
}

/**
 * 旧版（v0，无回访计划字段）→ v2：
 * 只给每条档案补上 follow_up: null，其余字段原样保留（内容、顺序、id 都不变）。
 * 已经在新结构上的记录保持其回访计划不动。
 * 数据异常时抛错，由调用方进入“保留原数据 + 恢复提示”流程，绝不用空数据覆盖。
 */
export function migrateMemoriesState(
  persisted: unknown,
  fromVersion: number,
): { memories: SmellMemory[] } {
  if (fromVersion < MIN_STORE_VERSION || fromVersion > CURRENT_STORE_VERSION) {
    throw new Error(`不支持的数据版本：${fromVersion}`);
  }

  // zustand 传给 migrate 的是 state 对象；兼容直接存数组或包了一层的情况
  const state =
    persisted && typeof persisted === 'object' && Array.isArray((persisted as { memories?: unknown }).memories)
      ? (persisted as { memories: unknown })
      : Array.isArray(persisted)
        ? { memories: persisted }
        : null;

  if (!state) {
    throw new Error('已保存的数据结构无法识别');
  }

  const list = state.memories;
  if (!Array.isArray(list)) {
    throw new Error('已保存的气味档案不是列表格式');
  }

  const memories = list.map((item, i) => {
    if (!looksLikeMemory(item)) {
      throw new Error(`第 ${i + 1} 条档案数据已损坏，缺少必要字段`);
    }
    const m = item as SmellMemory;
    // 旧版数据没有 follow_up 字段；若已存在（重复迁移/部分新数据）则保持不变
    return 'follow_up' in m ? m : { ...m, follow_up: null };
  });

  return { memories };
}
