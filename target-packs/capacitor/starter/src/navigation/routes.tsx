import { ReactElement } from 'react';

import { HomePage } from '../screens/home/HomePage';

/** Every screen and its URL. Generated screens are added here (one line each), named like the Screen Model. */
export const routes: { path: string; element: ReactElement }[] = [
  { path: '/', element: <HomePage /> },
];
