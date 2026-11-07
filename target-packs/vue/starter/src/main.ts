import { createApp } from 'vue';

import App from './App.vue';
import saved from './component-style.json';
import './components/components.css';
import './components/looks.css';
import { router } from './router';
import { ComponentStyle, applyStyle } from './style';

// The design, motion, mode and brand of the factory's component style (component-style.json)
applyStyle(document.documentElement, saved.defaults as ComponentStyle);
createApp(App).use(router).mount('#app');
