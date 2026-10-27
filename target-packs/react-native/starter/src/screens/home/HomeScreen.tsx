import { Text } from 'react-native';

import { Screen, theme } from '../../components';
import { t } from '../../i18n';

export function HomeScreen() {
  return (
    <Screen title={t('home.title')}>
      <Text style={{ fontSize: theme.font.input, color: theme.colors.text }}>{t('home.welcome')}</Text>
    </Screen>
  );
}
