import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { t } from '../i18n';
import { HomeScreen } from '../screens/home/HomeScreen';

/**
 * Every screen of the app and its route name. Generated screens are added here (one line each), named like the
 * Screen Model, for example FundTransfer.
 */
export type RootStackParamList = {
  Home: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function AppNavigator() {
  return (
    <Stack.Navigator initialRouteName="Home">
      <Stack.Screen name="Home" component={HomeScreen} options={{ title: t('home.title') }} />
    </Stack.Navigator>
  );
}
