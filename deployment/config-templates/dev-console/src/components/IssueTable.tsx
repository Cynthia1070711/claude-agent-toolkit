// ============================================================
// IssueTable.tsx — CR Issue 表格元件
// DVS-07 AC-4: Story、Severity、Dimension、摘要、Resolution、檔案
// ============================================================
import type { CrIssue, CrSeverity, CrResolution } from '../types/cr-issues.js';

interface IssueTableProps {
  items: CrIssue[];
}

const SEVERITY_CLASS: Record<CrSeverity, string> = {
  critical: 'badge--critical',
  high: 'badge--high',
  medium: 'badge--medium',
  low: 'badge--low',
};

const RESOLUTION_CLASS: Record<CrResolution, string> = {
  fixed: 'badge--fixed',
  deferred: 'badge--deferred',
  wont_fix: 'badge--wontfix',
  pending: 'badge--pending',
};

const RESOLUTION_LABEL: Record<CrResolution, string> = {
  fixed: 'Fixed',
  deferred: 'Deferred',
  wont_fix: "Won't Fix",
  pending: 'Pending',
};

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '…' : text;
}

export default function IssueTable({ items }: IssueTableProps) {
  if (items.length === 0) {
    return <p className="cr-table__empty">無符合條件的 CR Issue</p>;
  }

  return (
    <div className="cr-table-wrapper">
      <table className="cr-table">
        <thead>
          <tr>
            <th>Story</th>
            <th>Code</th>
            <th>Severity</th>
            <th>Dimension</th>
            <th>摘要</th>
            <th>Resolution</th>
            <th>檔案</th>
          </tr>
        </thead>
        <tbody>
          {items.map((issue) => (
            <tr key={issue.id}>
              <td className="cr-table__story">{issue.story_id}</td>
              <td className="cr-table__code">{issue.issue_code}</td>
              <td>
                <span className={`badge ${SEVERITY_CLASS[issue.severity]}`}>
                  {issue.severity.toUpperCase()}
                </span>
              </td>
              <td className="cr-table__category">{issue.dimension ?? '—'}</td>
              <td className="cr-table__desc">{truncate(issue.summary, 100)}</td>
              <td>
                <span className={`badge ${RESOLUTION_CLASS[issue.resolution]}`}>
                  {RESOLUTION_LABEL[issue.resolution]}
                </span>
              </td>
              <td className="cr-table__file">
                {issue.file_path ? (
                  <span title={issue.file_path}>
                    {truncate(issue.file_path.split('/').pop() ?? issue.file_path, 30)}
                  </span>
                ) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
