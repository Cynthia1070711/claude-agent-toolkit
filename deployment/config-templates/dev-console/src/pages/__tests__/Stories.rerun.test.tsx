// ============================================================
// Stories.rerun.test.tsx — tdb-5 重跑徽章 DOM + 零噪音 + CSS 靜態驗證
// tdb-5-stories-rerun-visibility AC3/AC4/AC5
// ============================================================
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import StoryCard from '../../components/StoryCard';
import { I18nProvider } from '../../i18n/I18nProvider.js';
import type { Story } from '../../types/stories';

function makeStory(overrides: Partial<Story> = {}): Story {
  return {
    id: 'tdb-5-stories-rerun-visibility',
    key: 'tdb-5-stories-rerun-visibility',
    epicId: 'epic-tdb',
    title: 'Stories 看板重跑可視化',
    status: 'ready-for-dev',
    isEpic: false,
    metadata: {
      complexity: 'S',
      priority: 'P3',
      crScore: null,
      testCount: null,
      devAgent: null,
      reviewAgent: null,
      createdAgent: null,
      lastUpdated: '2026-08-02',
      comment: 'S, P3',
      rerun: null,
    },
    ...overrides,
  };
}

function renderStoryCard(story: Story) {
  return render(
    <I18nProvider>
      <MemoryRouter>
        <StoryCard story={story} onStatusChange={vi.fn()} />
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe('StoryCard 重跑徽章（tdb-5 AC3/AC4）', () => {
  it('AC3: metadata.rerun 非 null 時依固定順序渲染，textContent 與 title 皆正確', () => {
    const story = makeStory({
      metadata: { ...makeStory().metadata, rerun: { create: 2, review: 3 } },
    });
    const { container } = renderStoryCard(story);
    const badges = [...container.querySelectorAll('.dvc-badge-rerun')];
    // +CR F6：排序以 data-phase 斷言 —— 與顯示文字解耦，後續語系調整不會使此鎖失效
    expect(badges.map(b => b.getAttribute('data-phase'))).toEqual(['create', 'review']);
    // +CR F6：顯示文字走 i18n 查表（原為內部 phase key 直出）
    expect(badges.map(b => b.textContent)).toEqual(['↻建立×2', '↻審查×3']);
    expect(badges.every(b => (b.getAttribute('title') ?? '').length > 0)).toBe(true);
  });

  it('AC3: 含未知 phase（如 Mode C 的 general）依 create→dev→review→其餘字典序排列', () => {
    const story = makeStory({
      metadata: { ...makeStory().metadata, rerun: { general: 5, review: 4, create: 3, dev: 2 } },
    });
    const { container } = renderStoryCard(story);
    const badges = [...container.querySelectorAll('.dvc-badge-rerun')];
    expect(badges.map(b => b.getAttribute('data-phase'))).toEqual([
      'create', 'dev', 'review', 'general',
    ]);
    // +CR F6：general 未列於 i18n 對照表 → 原樣 fallback（與修改前行為一致）
    expect(badges.map(b => b.textContent)).toEqual([
      '↻建立×3', '↻開發×2', '↻審查×4', '↻general×5',
    ]);
  });

  it('AC4: metadata.rerun 為 null 時零 .dvc-badge-rerun 元素，既有徽章與 footer 不受影響', () => {
    const story = makeStory(); // rerun: null（預設）
    const { container } = renderStoryCard(story);
    expect(container.querySelectorAll('.dvc-badge-rerun').length).toBe(0);
    expect(container.querySelector('.dvc-badge-complexity-S')).not.toBeNull();
    expect(container.querySelector('.dvc-badge-priority-P3')).not.toBeNull();
    expect(container.querySelector('.dvc-kanban-card-footer')).not.toBeNull();
  });
});

describe('.dvc-badge-rerun CSS 靜態驗證（AC5 — 禁 getComputedStyle，KB-frontend-002）', () => {
  it('kanban.css 規則區塊只導出 --dvc-status-warning token，零 hex / rgba 字面值', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../styles/kanban.css'), 'utf-8');
    const block = src.match(/\.dvc-badge-rerun\s*\{[^}]*\}/);
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/var\(--dvc-status-warning\)/);
    expect(block![0].match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g)).toBeNull();
  });
});
