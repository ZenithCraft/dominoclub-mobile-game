import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';

import { SplashScreen } from '../screens/SplashScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import { OTPVerificationScreen } from '../screens/OTPVerificationScreen';
import { ForgotPasswordScreen } from '../screens/ForgotPasswordScreen';
import { SetNewPasswordScreen } from '../screens/SetNewPasswordScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { ModeSelectScreen } from '../screens/ModeSelectScreen';
import { GameScreen } from '../screens/GameScreen';
import { WalletScreen } from '../screens/WalletScreen';
import { TermsScreen } from '../screens/TermsScreen';
import { PrivacyPolicyScreen } from '../screens/PrivacyPolicyScreen';
import { ResponsibleGamblingScreen } from '../screens/ResponsibleGamblingScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import { AchievementsScreen } from '../screens/AchievementsScreen';

export type RootStackParamList = {
  Splash: undefined;
  Login: undefined;
  Register: { phone?: string } | undefined;
  OTPVerification: { phone: string };
  ForgotPassword: undefined;
  SetNewPassword: { token?: string } | undefined;
  Main: undefined;
  Wallet: undefined;
  ModeSelect: { mode?: string } | undefined;
  Game: { gameId: string };
  History: undefined;
  Achievements: undefined;
  Terms: { showAccept?: boolean } | undefined;
  PrivacyPolicy: undefined;
  ResponsibleGambling: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

if (process.env.NODE_ENV !== 'production' && typeof console !== 'undefined') {
  const originalError = console.error.bind(console);
  console.error = (...args: any[]) => {
    const first = args[0];
    if (typeof first === 'string' && first.startsWith('Unexpected text node:')) {
      originalError(...args);
      return;
    }
    originalError(...args);
  };
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null; stack: string | null }
> {
  state = { error: null, stack: null };

  static getDerivedStateFromError(error: Error) {
    return { error, stack: null };
  }

  componentDidCatch(_error: Error, info: any) {
    this.setState({ stack: info?.componentStack || null });
  }

  render() {
    if (!this.state.error) return this.props.children;

    const message = String((this.state.error as any)?.message || this.state.error);
    const stack = this.state.stack || '';

    return (
      <View style={{ flex: 1, backgroundColor: '#0b0f0c', padding: 16 }}>
        <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 8 }}>
          Erro na tela
        </Text>
        <Text style={{ color: '#fca5a5', marginBottom: 12 }}>{message}</Text>
        <ScrollView style={{ flex: 1 }}>
          <Text style={{ color: '#e5e7eb', fontSize: 12 }}>{stack}</Text>
        </ScrollView>
        <TouchableOpacity
          style={{
            marginTop: 12,
            backgroundColor: '#22c55e',
            paddingVertical: 12,
            borderRadius: 10,
            alignItems: 'center',
          }}
          onPress={() => {
            if (typeof window !== 'undefined') window.location.reload();
          }}
          activeOpacity={0.85}
        >
          <Text style={{ color: '#052e16', fontWeight: '700' }}>Recarregar</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

export function AppNavigator() {
  return (
    <NavigationContainer>
      <ErrorBoundary>
        <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
          <Stack.Screen name="Splash"               component={SplashScreen} />
          <Stack.Screen name="Login"                component={LoginScreen} />
          <Stack.Screen name="Register"             component={RegisterScreen} />
          <Stack.Screen name="OTPVerification"      component={OTPVerificationScreen} />
          <Stack.Screen name="ForgotPassword"       component={ForgotPasswordScreen} />
          <Stack.Screen name="SetNewPassword"       component={SetNewPasswordScreen} />
          <Stack.Screen name="Main"                 component={HomeScreen} />
          <Stack.Screen name="Wallet"               component={WalletScreen} />
          <Stack.Screen name="ModeSelect"           component={ModeSelectScreen} />
          <Stack.Screen name="Game"                 component={GameScreen} options={{ gestureEnabled: false }} />
          <Stack.Screen name="History"              component={HistoryScreen} />
          <Stack.Screen name="Achievements"         component={AchievementsScreen} />
          <Stack.Screen name="Terms"                component={TermsScreen} />
          <Stack.Screen name="PrivacyPolicy"        component={PrivacyPolicyScreen} />
          <Stack.Screen name="ResponsibleGambling"  component={ResponsibleGamblingScreen} />
        </Stack.Navigator>
      </ErrorBoundary>
    </NavigationContainer>
  );
}
