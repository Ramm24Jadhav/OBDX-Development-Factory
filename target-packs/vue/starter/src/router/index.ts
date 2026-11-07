import { createRouter, createWebHistory } from 'vue-router';

import HomePage from '../screens/home/HomePage.vue';

/**
 * Every screen and its URL. Generated screens are added here (one line each), named like the Screen Model; a page's
 * action and done events become navigation in its route's props (onAction, onDone).
 */
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: HomePage },
  ],
});
