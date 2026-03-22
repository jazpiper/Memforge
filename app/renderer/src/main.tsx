import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

const rootElement = document.getElementById('root');

function applyStyles(element: HTMLElement, styles: Record<string, string>) {
  for (const [key, value] of Object.entries(styles)) {
    element.style.setProperty(key, value);
  }
}

function renderFatalError(title: string, detail: string) {
  if (!rootElement) {
    return;
  }

  const main = document.createElement('main');
  applyStyles(main, {
    'min-height': '100vh',
    display: 'grid',
    'place-items': 'center',
    background: '#0f172a',
    color: '#e2e8f0',
    padding: '24px',
    'font-family': "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
  });

  const section = document.createElement('section');
  applyStyles(section, {
    width: 'min(780px,100%)',
    border: '1px solid rgba(148,163,184,0.28)',
    'border-radius': '24px',
    background: 'rgba(15,23,42,0.96)',
    padding: '24px 28px',
    'box-shadow': '0 18px 60px rgba(15,23,42,0.45)',
  });

  const eyebrow = document.createElement('p');
  applyStyles(eyebrow, {
    margin: '0 0 8px',
    'font-size': '12px',
    'letter-spacing': '0.08em',
    'text-transform': 'uppercase',
    color: '#93c5fd',
  });
  eyebrow.textContent = 'Memforge renderer error';

  const heading = document.createElement('h1');
  applyStyles(heading, {
    margin: '0 0 12px',
    'font-size': '28px',
    'line-height': '1.2',
  });
  heading.textContent = title;

  const body = document.createElement('p');
  applyStyles(body, {
    margin: '0 0 16px',
    color: '#cbd5e1',
  });
  body.textContent = 'The app shell opened, but the renderer failed before the landing page could mount.';

  const detailBlock = document.createElement('pre');
  applyStyles(detailBlock, {
    margin: '0',
    overflow: 'auto',
    'border-radius': '16px',
    background: '#020617',
    padding: '16px',
    color: '#f8fafc',
    'white-space': 'pre-wrap',
    'word-break': 'break-word',
    font: '12px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace',
  });
  detailBlock.textContent = detail;

  section.append(eyebrow, heading, body, detailBlock);
  main.append(section);
  rootElement.replaceChildren(main);
}

window.addEventListener('error', (event) => {
  const detail = event.error instanceof Error ? event.error.stack ?? event.error.message : event.message;
  renderFatalError('Failed to start the Memforge UI.', detail || 'Unknown renderer error.');
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  const detail =
    reason instanceof Error ? reason.stack ?? reason.message : typeof reason === 'string' ? reason : JSON.stringify(reason, null, 2);
  renderFatalError('Memforge hit an unhandled promise rejection.', detail || 'Unknown rejection.');
});

try {
  ReactDOM.createRoot(rootElement!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
} catch (error) {
  const detail = error instanceof Error ? error.stack ?? error.message : String(error);
  renderFatalError('Memforge could not mount the root React tree.', detail);
}
