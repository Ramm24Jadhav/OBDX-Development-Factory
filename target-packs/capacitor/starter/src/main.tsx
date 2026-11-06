import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import './components/components.css';
import { startNative } from './native/device';

startNative();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
