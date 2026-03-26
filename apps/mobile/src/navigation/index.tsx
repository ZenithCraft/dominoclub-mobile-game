import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

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
  Terms: { showAccept?: boolean } | undefined;
  PrivacyPolicy: undefined;
  ResponsibleGambling: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function AppNavigator() {
  return (
    <NavigationContainer>
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
        <Stack.Screen name="Terms"                component={TermsScreen} />
        <Stack.Screen name="PrivacyPolicy"        component={PrivacyPolicyScreen} />
        <Stack.Screen name="ResponsibleGambling"  component={ResponsibleGamblingScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
