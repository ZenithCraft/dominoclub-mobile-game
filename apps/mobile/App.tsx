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
