import { h } from 'preact';

import { Screen } from '../../components/index';
import { t } from '../../i18n/index';

/** The first page; the generated screens go beside it in src/screens and into src/navigation/routes.tsx. */
export function HomePage() {
  return (
    <Screen title={t('home.title')}>
      <p data-testid="home-welcome">{t('home.welcome')}</p>
    </Screen>
  );
}
