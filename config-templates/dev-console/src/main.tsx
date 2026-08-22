// ============================================================
// main.tsx — React 18 SPA 入口
// AC-4: Vite dev server 監聽 :5174
// ============================================================
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/variables.css';
import './styles/layout.css';
import App from './App';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element not found');

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
