import { createRoot } from 'react-dom/client';
import App from './App';
import './app.css';
import { installGlobalErrorLogging } from './services/log';

installGlobalErrorLogging();

const container = document.getElementById('root')!;
const root = createRoot(container);

root.render(<App />);
