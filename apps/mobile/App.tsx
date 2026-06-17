import React, { useEffect, useMemo } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaInsetsContext, SafeAreaFrameContext } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { Platform, AppState, Dimensions } from 'react-native';
import { AppNavigator } from './src/navigation';
import { ToastContainer } from './src/components/Toast';

// expo-navigation-bar is a native module — guard the import so the app boots
// even on a dev client where the native side hasn't been rebuilt yet.
let NavigationBar: typeof import('expo-navigation-bar') | null = null;
try { NavigationBar = require('expo-navigation-bar'); } catch { NavigationBar = null; }

SplashScreen.preventAutoHideAsync();

export default function App() {
  useEffect(() => {
    if (Platform.OS === 'web') {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href =
        'https://fonts.googleapis.com/css2?family=Inria+Sans:wght@400;600;700&family=Poppins:wght@600;700;800&display=swap';
      document.head.appendChild(link);

      document.documentElement.style.height = '100%';
      document.documentElement.style.minHeight = '100vh';
      document.documentElement.style.width = '100%';
      document.documentElement.style.backgroundColor = '#0a1f0a';
      document.body.style.height = '100%';
      document.body.style.minHeight = '100vh';
      document.body.style.width = '100%';
      document.body.style.margin = '0';
      document.body.style.backgroundColor = '#0a1f0a';

      const root = document.getElementById('root');
      if (root) {
        root.style.minHeight = '100vh';
        root.style.height = '100%';
        root.style.width = '100%';
        root.style.display = 'flex';
        root.style.flexDirection = 'column';
        root.style.backgroundColor = '#0a1f0a';
      }
    }
    SplashScreen.hideAsync();
  }, []);

  // Android: keep the system navigation bar hidden across the whole app.
  // Re-hide whenever the app returns to the foreground (the system shows it
  // again after backgrounding or after the user swipes it in).
  useEffect(() => {
    if (Platform.OS !== 'android' || !NavigationBar) return;
    const hide = () => {
      NavigationBar!.setVisibilityAsync('hidden').catch(() => {});
      NavigationBar!.setBehaviorAsync('overlay-swipe').catch(() => {});
    };
    hide();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') hide(); });
    return () => sub.remove();
  }, []);

  // Force every screen's safe-area insets to zero so the layout extends under
  // the camera notch / status bar / nav bar on all platforms (the game already
  // hides the system bars).  Components that read useSafeAreaInsets() inside
  // this subtree will see zeros, and `<SafeAreaView />` will apply no padding.
  const zeroInsets = useMemo(() => ({ top: 0, right: 0, bottom: 0, left: 0 }), []);
  const win = Dimensions.get('window');
  const zeroFrame = useMemo(() => ({ x: 0, y: 0, width: win.width, height: win.height }), [win.width, win.height]);

  return (
    <SafeAreaProvider>
      <StatusBar hidden translucent backgroundColor="transparent" />
      <SafeAreaFrameContext.Provider value={zeroFrame}>
        <SafeAreaInsetsContext.Provider value={zeroInsets}>
          <AppNavigator />
          <ToastContainer />
        </SafeAreaInsetsContext.Provider>
      </SafeAreaFrameContext.Provider>
    </SafeAreaProvider>
  );
}
