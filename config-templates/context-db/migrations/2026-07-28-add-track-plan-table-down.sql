-- Rollback: TDB-1 排程層 track_plan 表 (tdb-1-track-plan-roadmap)
-- Date: 2026-07-28
-- DOWN — 移除 track_plan 表。
-- 注意:DROP TABLE 自動移除其 2 個索引(ix_track_plan_lane_seq / ix_track_plan_state),不需另 DROP INDEX。
-- 安全性:本卡新增表為 additive(零修改既有表 / tool / 執行路徑)。.context-db/phycool.db 為 gitignored,
--   DB 側回滾僅靠本檔;推進地圖 .md 凍結標頭於 Phase 7 對帳通過後才貼,回滾零資料損失。

DROP TABLE IF EXISTS track_plan;
