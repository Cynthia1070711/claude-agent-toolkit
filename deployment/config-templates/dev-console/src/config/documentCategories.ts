// ============================================================
// documentCategories.ts — 文檔分類群組映射
// Party Mode 共識: 聚合細粒度 DB category 為 5-6 個 UI 群組
// ============================================================

export interface CategoryGroup {
  key: string;
  icon: string;
  dbCategories: string[];
}

// DB category → UI group 映射
export const CATEGORY_GROUPS: CategoryGroup[] = [
  {
    key: 'requirements',
    icon: '📋',
    dbCategories: ['functional-spec', 'ux-spec', 'story'],
  },
  {
    key: 'technical',
    icon: '🔧',
    dbCategories: ['tech-spec', 'architecture', 'spec'],
  },
  {
    key: 'analysis',
    icon: '📊',
    dbCategories: ['analysis', 'review', 'adr'],
  },
  {
    key: 'knowledge',
    icon: '🧠',
    dbCategories: ['knowledge-base', 'reference', 'skill'],
  },
  {
    key: 'workflow',
    icon: '⚙️',
    dbCategories: ['bmad'],
  },
  {
    key: 'other',
    icon: '📁',
    dbCategories: ['general'],
  },
];

// 反向查找：DB category → group key
export function getGroupForCategory(dbCategory: string): string {
  for (const group of CATEGORY_GROUPS) {
    if (group.dbCategories.includes(dbCategory)) return group.key;
  }
  return 'other';
}

// 根據 group key 取得所有 DB categories
export function getDbCategoriesForGroup(groupKey: string): string[] {
  const group = CATEGORY_GROUPS.find((g) => g.key === groupKey);
  return group ? group.dbCategories : [];
}
