import { Screen } from '../../components';
import { t } from '../../i18n';

export function HomePage() {
  return (
    <Screen title={t('home.title')}>
      <p>{t('home.welcome')}</p>
    </Screen>
  );
}
