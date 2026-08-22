// ============================================================
// StoryDetail.test.tsx — DVS-06 AC-8 React 組件測試
// 案例 1: Markdown 渲染  案例 2: 載入/錯誤狀態
// ============================================================
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import StoryDetail from '../StoryDetail';
import { I18nProvider } from '../../i18n/I18nProvider.js';
import type { StructuredStoryDetail } from '../../types/stories';

// ── Mock API module ──
// [bwu-12] StoryDetail.tsx:11/:74 現呼叫 fetchStoryDetail(結構化卡片渲染,DVS-07)，
// 舊 mock 目標(storyApi 另一支 legacy 匯出，已無任何 caller)命中時 vitest 直接拋
// `No "fetchStoryDetail" export is defined on the mock`（TD-DEVCONSOLE-EMERGENCE-STORYDETAIL-TEST-PREEXISTING-FAIL）。
// [bwu-12 CR M9] 此註解原逐字寫出舊函式名，使 AC3 組 1 的驗收指令(對該名稱做 grep -c，要求回 0)
// 實測回 1 —— dev tasks T2.3 與 dev_notes 皆宣稱 0，該宣稱從未被複跑。改以描述取代字面 identifier：
// 說明資訊完整保留，而該 grep 自此真正表示「本檔已無對舊 mock 目標的任何引用」。
// (本註解刻意不重述那個名稱，否則同一個 grep 又會被自己的說明文字命中。)
vi.mock('../../services/storyApi.js', () => ({
  fetchStoryDetail: vi.fn(),
}));

// ── Mock CSS / highlight.js imports ──
vi.mock('../../styles/story-detail.css', () => ({}));
vi.mock('highlight.js/styles/github-dark.css', () => ({}));

// ── Mock react-markdown to avoid ESM/jsdom compatibility issues ──
vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => (
    <div data-testid="markdown-content">{children}</div>
  ),
}));

vi.mock('remark-gfm', () => ({ default: () => null }));
vi.mock('rehype-highlight', () => ({ default: () => null }));

async function getStoryApi() {
  const mod = await import('../../services/storyApi.js');
  // [bwu-12 CR F7] `as unknown as` — BR-008 的第三項驗收是「tsc 於本行不報 TS2352」。真實模組型別
  // (`(id: string) => Promise<StructuredStoryDetail>`)與 `Mock<Procedure>` 不充分重疊,單層 `as`
  // 必報 TS2352(改 mock 目標前後皆然),依編譯器自身建議先轉 unknown。
  return mod as unknown as { fetchStoryDetail: ReturnType<typeof vi.fn> };
}

function renderStoryDetail(storyId: string) {
  // +CR(tdb 母卡收口)：補 I18nProvider wrapper。StoryDetail 內部呼叫 useI18n()，
  // 缺 Provider 時 render 直接拋錯 —— 此為 TD-DEVCONSOLE-EMERGENCE-STORYDETAIL-TEST-PREEXISTING-FAIL
  // 記載的 2 個既有失敗案例的根因。範式對齊 Dashboard.test.tsx。
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[`/stories/${storyId}`]}>
        <Routes>
          <Route path="/stories/:id" element={<StoryDetail />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe('StoryDetail 頁面', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 案例 1: 結構化卡片 + Markdown 內容區塊渲染 ──
  it('應渲染 Story 後設資料與 Markdown 內容', async () => {
    const api = await getStoryApi();

    const mockDetail: StructuredStoryDetail = {
      story_id: 'dvs-06',
      epic_id: 'epic-dvc',
      title: 'Session 時間軸 + Story 詳情',
      status: 'in-progress',
      priority: 'high',
      complexity: 'M',
      story_type: null,
      tags: null,
      sdd_spec: null,
      dependencies: null,
      discovery_source: null,
      created_at: null,
      updated_at: null,
      started_at: null,
      completed_at: null,
      create_started_at: null,
      create_completed_at: null,
      review_started_at: null,
      review_completed_at: null,
      dev_agent: null,
      review_agent: null,
      create_agent: null,
      cr_score: null,
      test_count: null,
      cr_issues_total: null,
      cr_issues_fixed: null,
      cr_issues_deferred: null,
      cr_summary: null,
      user_story: '# DVS-06\n\n## 說明\n\nSession 時間軸實作',
      background: null,
      acceptance_criteria: null,
      tasks: null,
      dev_notes: null,
      required_skills: null,
      implementation_approach: null,
      testing_strategy: null,
      file_list: null,
      affected_files: null,
      pipeline_notes: null,
      source_type: 'db',
      markdown_content: null,
      section_sources: { user_story: 'db' },
      report_content: null,
      report_path: null,
    };

    api.fetchStoryDetail.mockResolvedValue(mockDetail);

    renderStoryDetail('dvs-06');

    // 等待載入完成
    await waitFor(() => {
      expect(screen.queryByText('載入中…')).not.toBeInTheDocument();
    });

    // Story ID(header 卡 + breadcrumb 兩處皆渲染，用 getAllByText 避免多重命中拋錯)
    expect(screen.getAllByText('dvs-06').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Session 時間軸 + Story 詳情')).toBeInTheDocument();

    // 狀態 Badge — getStatusLabel() 映射 i18n 標籤（'開發中'），非原始 enum 字串
    expect(screen.getByText('開發中')).toBeInTheDocument();

    // Markdown 區域渲染（mocked，來自 ContentCard 內的 user_story 區塊）
    const mdEl = screen.getByTestId('markdown-content');
    expect(mdEl).toBeInTheDocument();
    expect(mdEl.textContent).toContain('DVS-06');

    // API 以正確 storyId 呼叫
    expect(api.fetchStoryDetail).toHaveBeenCalledWith('dvs-06');
  });

  // ── 案例 2: 載入/錯誤狀態 ──
  it('API 回傳 STORY_NOT_FOUND 時應顯示錯誤訊息', async () => {
    const api = await getStoryApi();

    // fetchStoryDetail 現行契約為 rejected Promise（storyApi.ts apiFetch 對非 2xx throw Error），
    // 非舊 API 的 resolved {error: string} 形狀；StoryDetail.tsx:76 以 .catch(err => setError(err.message)) 承接。
    api.fetchStoryDetail.mockRejectedValue(new Error('STORY_NOT_FOUND'));

    renderStoryDetail('non-existent-story');

    // 等待載入完成
    await waitFor(() => {
      expect(screen.queryByText('載入中…')).not.toBeInTheDocument();
    });

    // 應顯示錯誤訊息(現行渲染為 catch 到的 Error.message 原文)
    expect(screen.getByText('STORY_NOT_FOUND')).toBeInTheDocument();

    // 不應顯示 Markdown 區域
    expect(screen.queryByTestId('markdown-content')).not.toBeInTheDocument();
  });
});
