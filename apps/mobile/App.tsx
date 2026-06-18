import React, { useEffect, useMemo, useState } from 'react';
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

  // Android: keep the system navigation bar hidden AND in "absolute" position
  // (overlay mode). The absolute position is the critical part for the
  // post-ImagePicker layout bug:
  //   - Without absolute, when the nav bar reappears for even a frame after
  //     the camera/gallery returns, Android RESIZES our window and RN's
  //     useWindowDimensions() captures the smaller height. The follow-up
  //     hide call shrinks the nav bar back to zero but RN never gets a
  //     second resize event, so every screen stays rendered at the
  //     shrunken height until cold restart.
  //   - With absolute, the nav bar OVERLAYS our content rather than pushing
  //     the layout up. The window stays full-size regardless of nav-bar
  //     visibility, so RN dimensions are stable across the picker round-trip.
  // We still hide it for the visual, and re-apply on every signal that the
  // system might have reset our preference (AppState, Dimensions change).
  useEffect(() => {
    if (Platform.OS !== 'android' || !NavigationBar) return;
    const hide = () => {
      NavigationBar!.setPositionAsync('absolute').catch(() => {});
      NavigationBar!.setVisibilityAsync('hidden').catch(() => {});
      NavigationBar!.setBehaviorAsync('overlay-swipe').catch(() => {});
    };
    hide();
    const appSub = AppState.addEventListener('change', (s) => { if (s === 'active') hide(); });
    const dimSub = Dimensions.addEventListener('change', () => hide());
    return () => { appSub.remove(); dimSub.remove(); };
  }, []);

  // Force every screen's safe-area insets to zero so the layout extends under
  // the camera notch / status bar / nav bar on all platforms (the game already
  // hides the system bars).  Components that read useSafeAreaInsets() inside
  // this subtree will see zeros, and `<SafeAreaView />` will apply no padding.
  //
  // Subscribe to Dimensions changes so the zero-frame width/height track the
  // current window. Without this, KYC's camera intent (which transiently
  // shrinks the window) would leave a stale frame in context — every screen
  // would then keep rendering at the shrunken size after the camera closes.
  const zeroInsets = useMemo(() => ({ top: 0, right: 0, bottom: 0, left: 0 }), []);
  const [win, setWin] = useState(() => Dimensions.get('window'));
  useEffect(() => {
    // Belt-and-suspenders: refresh `win` from THREE signals.
    //   1. Dimensions 'change' — the official RN signal. Most OEMs fire it
    //      when ImagePicker returns from the camera/gallery activity, but
    //      some (Samsung One UI, MIUI) drop it intermittently and leave the
    //      app rendered at the shrunken size used during the picker.
    //   2. AppState 'active' — fired when our activity is foregrounded
    //      again. Always reliable, so re-read Dimensions here as backup.
    //   3. A no-op fallback timer — covers the rare case where neither
    //      signal fires for ~1s after returning from the picker.
    const refresh = () => {
      const w = Dimensions.get('window');
      setWin((cur) => (cur.width === w.width && cur.height === w.height ? cur : w));
    };
    const dimSub = Dimensions.addEventListener('change', refresh);
    const appSub = AppState.addEventListener('change', (s) => { if (s === 'active') refresh(); });
    return () => { dimSub.remove(); appSub.remove(); };
  }, []);
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
