import { registerCustomElement } from 'ojs/ojvcomponent';
import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import Context = require('ojs/ojcontext');

import { routes } from '../navigation/routes';

const page = () => window.location.hash.replace(/^#\/?/, '');

/** The app: the page the address asks for (#path), from src/navigation/routes.tsx. */
export const App = registerCustomElement('app-root', () => {
  const [path, setPath] = useState(page());
  useEffect(() => {
    Context.getPageContext().getBusyContext().applicationBootstrapComplete();
    const onHash = () => setPath(page());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const show = routes[path] ?? routes[''];
  return <div id="appContainer" class="oj-web-applayout-page">{show()}</div>;
});
