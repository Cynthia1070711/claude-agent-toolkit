-- Rollback: CCB-4 中控視窗註冊表 (ccb-4-ctrl-notify-knock)
-- Date: 2026-08-03
-- DOWN — 移除 controller_windows 表。
-- 注意:DROP TABLE 自動移除其索引(ix_controller_windows_track),不需另 DROP INDEX。
-- 安全性:無任何外鍵指向本表(SDD Spec §3.4 明列刻意不建 FK — 軌別在 ccb-1 是開放集合的自由文字),
--   故 DROP 不會孤立任何列。回滾後三個掛點因查不到 registry 列而全數靜默(BR-008),
--   等同 ccb-2 的行為 —— 這是本卡「未綁定視窗零通知」硬邊界的自然結果,非額外處置。

DROP TABLE IF EXISTS controller_windows;
