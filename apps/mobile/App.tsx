import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { Platform } from 'react-native';
import { AppNavigator } from './src/navigation';
import { ToastContainer } from './src/components/Toast';

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

  return (
    <SafeAreaProvider>
      <StatusBar style="light" backgroundColor="#0a1f0a" />
      <AppNavigator />
      <ToastContainer />
    </SafeAreaProvider>
  );
}
