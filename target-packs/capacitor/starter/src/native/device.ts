import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

/** True inside the Android or iOS app, false in a browser (development and tests). */
export const isNative = () => Capacitor.isNativePlatform();

/**
 * Wires the device to the web screens: the Android back button goes back a screen and leaves the app on the first one.
 * Called once from main.tsx; does nothing in a browser.
 */
export function startNative() {
  if (!isNative()) {
    return;
  }
  void App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back();
    } else {
      void App.exitApp();
    }
  });
}
