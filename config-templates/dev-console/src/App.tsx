// ============================================================
// App.tsx — React Router v7 路由配置
// AC-4: Dashboard / Stories / Memory / Sprint / Settings
// DVS-07: /decisions / /cr-issues / /tech-debt
// DVS-06: /sessions / /stories/:id
// ============================================================
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { I18nProvider } from './i18n/I18nProvider';
import Layout from './components/Layout';
import Memory from './pages/Memory';
import Stories from './pages/Stories';
import Decisions from './pages/Decisions';
import CrIssues from './pages/CrIssues';
import TechDebt from './pages/TechDebt';
import Dashboard from './pages/Dashboard';
import Sprint from './pages/Sprint';
import Sessions from './pages/Sessions';
import StoryDetailPage from './pages/StoryDetail';
import System from './pages/System';
import Documents from './pages/Documents';
import Reviews from './pages/Reviews';
import ReviewDetail from './pages/ReviewDetail';
import SchemaExplorer from './pages/SchemaExplorer';
import Patterns from './pages/Patterns';
import Intentional from './pages/Intentional';
import RuleViolations from './pages/RuleViolations';
import GodNodes from './pages/GodNodes';
import Emergence from './pages/Emergence';
import Workers from './pages/Workers';
import Channel from './pages/Channel';
import Roadmap from './pages/Roadmap';

export default function App() {
  return (
    <I18nProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="stories" element={<Stories />} />
          <Route path="stories/:id" element={<StoryDetailPage />} />
          <Route path="memory" element={<Memory />} />
          <Route path="documents" element={<Documents />} />
          <Route path="sessions" element={<Sessions />} />
          <Route path="decisions" element={<Decisions />} />
          <Route path="cr-issues" element={<CrIssues />} />
          <Route path="tech-debt" element={<TechDebt />} />
          <Route path="reviews" element={<Reviews />} />
          <Route path="reviews/:reportId" element={<ReviewDetail />} />
          <Route path="sprint" element={<Sprint />} />
          <Route path="schema" element={<SchemaExplorer />} />
          <Route path="patterns" element={<Patterns />} />
          <Route path="intentional" element={<Intentional />} />
          <Route path="rule-violations" element={<RuleViolations />} />
          <Route path="god-nodes" element={<GodNodes />} />
          <Route path="emergence" element={<Emergence />} />
          <Route path="workers" element={<Workers />} />
          <Route path="workers/:runId" element={<Workers />} />
          <Route path="channel" element={<Channel />} />
          <Route path="roadmap" element={<Roadmap />} />
          <Route path="settings" element={<System />} />
        </Route>
      </Routes>
    </BrowserRouter>
    </I18nProvider>
  );
}
