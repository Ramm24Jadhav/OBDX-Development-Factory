import { h, VNode } from 'preact';

import { HomePage } from '../screens/home/HomePage';

/** The app's pages by path (after #); each generated screen gets one line here. */
export const routes: Record<string, () => VNode> = {
  '': () => <HomePage />,
};
