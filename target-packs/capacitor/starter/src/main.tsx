import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import saved from './component-style.json';
import './components/components.css';
import './components/looks.css';
import { startNative } from './native/device';
import { ComponentStyle, applyStyle } from './style';

startNative();
// The design, motion, mode and brand of the factory's component style (component-style.json)
applyStyle(document.documentElement, saved.defaults as ComponentStyle);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
