import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import { colors, fonts } from '../theme';

import { SplashScreen } from '../screens/SplashScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import { OTPVerificationScreen } from '../screens/OTPVerificationScreen';
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
  Main: undefined;
  ModeSelect: undefined;
  Game: { gameId: string };
  Terms: { showAccept?: boolean } | undefined;
  PrivacyPolicy: undefined;
  ResponsibleGambling: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.tabBarBg,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 8,
        },
        tabBarActiveTintColor: colors.tabBarActive,
        tabBarInactiveTintColor: colors.tabBarInactive,
        tabBarLabelStyle: { fontSize: fonts.sizes.xs, fontWeight: '600' },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ tabBarLabel: 'Início', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>🏠</Text> }}
      />
      <Tab.Screen
        name="Wallet"
        component={WalletScreen}
        options={{ tabBarLabel: 'Carteira', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>💰</Text> }}
      />
    </Tab.Navigator>
  );
}

export function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
        <Stack.Screen name="Splash" component={SplashScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Register" component={RegisterScreen} />
        <Stack.Screen name="OTPVerification" component={OTPVerificationScreen} />
        <Stack.Screen name="Main" component={MainTabs} />
        <Stack.Screen name="ModeSelect" component={ModeSelectScreen} />
        <Stack.Screen name="Game" component={GameScreen} options={{ gestureEnabled: false }} />
        <Stack.Screen name="Terms" component={TermsScreen} />
        <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
        <Stack.Screen name="ResponsibleGambling" component={ResponsibleGamblingScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
