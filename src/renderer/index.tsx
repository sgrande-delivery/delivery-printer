import { createRoot } from 'react-dom/client';
import App from './App';
import './app.css';
import { applyTheme } from './providers/theme';
import { installGlobalErrorLogging } from './services/log';

installGlobalErrorLogging();

// Before the first render: the main process already knows the theme, and waiting for the provider's
// round trip would paint the first frame in light.
if (window.electron.initialTheme) {
  applyTheme(window.electron.initialTheme);
}

const container = document.getElementById('root')!;
const root = createRoot(container);

root.render(<App />);
