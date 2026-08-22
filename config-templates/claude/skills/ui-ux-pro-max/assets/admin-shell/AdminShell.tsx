// AdminShell.tsx — 後台應用殼層（slot 注入合約）
// 蒸餾自 Materio VerticalLayout.jsx:10-26（MIT © 2022 ThemeSelection）+ Adminator _shell.scss（MIT © 2018 Aigars Silkalns）
// 取「神」（slot 解耦佈局合約）捨「形」（MUI/jQuery）。PhyCool 用：BackOffice / DevConsole 後台頁。
// 配套樣式：admin-shell.css。完整說明見 references/16-admin-app-shell.md。
import React from 'react';

interface AdminShellProps {
  /** 側欄 slot；傳 null → 全寬無側欄（auth / error 頁適用） */
  sidebar?: React.ReactNode;
  /** 頂列 slot */
  topbar?: React.ReactNode;
  /** 頁尾 slot */
  footer?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * 後台殼層。4 個可選 slot，各自可為 null。
 * 頁面只組裝 slot，不重複寫 chrome（神：佈局與內容解耦）。
 */
export function AdminShell({ sidebar, topbar, footer, children }: AdminShellProps) {
  return (
    <div className="admin-shell">
      {sidebar && <aside className="admin-shell__sidebar">{sidebar}</aside>}
      <div className="admin-shell__main">
        {topbar && <header className="admin-shell__topbar">{topbar}</header>}
        <main className="admin-shell__content">{children}</main>
        {footer && <footer className="admin-shell__footer">{footer}</footer>}
      </div>
    </div>
  );
}

// 多層 sidebar 縮排（神：Materio menuItemStyles.js:50-68 level-based 公式）
export const navIndent = (level: number): string =>
  `calc(1.5rem + 2.5rem * ${Math.max(0, level - 1)})`;
