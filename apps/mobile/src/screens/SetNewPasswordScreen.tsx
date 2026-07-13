import React, { useState } from 'react';
import {
  View, Text, StyleSheet,
  TouchableOpacity, KeyboardAvoidingView, Platform,
  useWindowDimensions, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { colors, spacing, fonts, radius } from '../theme';
import { ScreenBackground } from '../components/ScreenBackground';
import { IconLock } from '../components/Icons';
import { api } from '../services/api';
import { sfx } from '../services/sfx';

type Props = {
  navigation: NativeStackNavigationProp<any>;
  route: { params?: { token?: string } };
};

const LIME = '#1CBB3D';

export function SetNewPasswordScreen({ navigation, route }: Props) {
  const { width: winW } = useWindowDimensions();
  const isWide = winW >= 768;
  const panelMaxW = Math.min(winW * 0.92, 960);
  const rightW = isWide ? Math.max(280, Math.min(420, winW * 0.40)) : '100%';
  const welcomeSize = winW < 480 ? 28 : winW < 768 ? 34 : 38;

  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  const handleSave = async () => {
    if (!password || password.length < 6) { setError('A senha deve ter ao menos 6 caracteres'); return; }
    if (password !== confirm) { setError('As senhas não coincidem'); return; }
    setLoading(true); setError('');
    try {
      await api.post('/auth/reset-password', { token: route.params?.token, password });
      navigation.replace('Login');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao redefinir senha.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenBackground style={styles.root}>
      <SafeAreaView style={styles.safe} edges={[]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.kav}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
          {/* ONE frosted-glass panel */}
          <View style={[styles.panel, isWide ? { width: panelMaxW, flexDirection: 'row' } : { width: '100%', flexDirection: 'column' }]}>
            {/* Left column */}
            <View style={[styles.left, !isWide && styles.leftMobile]}>
              <Text style={[styles.welcome, { fontSize: welcomeSize }]}>Bem-vindo</Text>
              <Text style={styles.subtitle}>A reserva da mesa, agora no seu celular</Text>
            </View>

            {/* Vertical divider */}
            <View style={[styles.vertDivider, !isWide && { display: 'none' }]} />

            {/* Right column — form */}
            <View style={[styles.right, { width: rightW }]}>
              <View style={styles.iconCircle}>
                <IconLock size={24} color={colors.textOnPrimary} accessibilityLabel="Senha" />
              </View>

              <Text style={styles.cardTitle}>Resetar a senha</Text>

              <Input
                label=""
                placeholder="Nova senha"
                value={password}
                onChangeText={(t) => { setPassword(t); setError(''); }}
                secureTextEntry
              />
              <Input
                label=""
                placeholder="Confirmar senha"
                value={confirm}
                onChangeText={(t) => { setConfirm(t); setError(''); }}
                secureTextEntry
                error={error}
              />

              <Button
                title="Salvar"
                onPress={handleSave}
                loading={loading}
                style={styles.btn}
              />

              <TouchableOpacity onPress={() => { sfx.buttonClick(); navigation.navigate('Login'); }}>
                <Text style={styles.linkText}>Já tem conta? Faça o login</Text>
              </TouchableOpacity>
            </View>
          </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a1f0a' },
  safe: { flex: 1 },
  kav: { flex: 1 },
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
  },

  panel: {
    backgroundColor: 'rgba(8, 20, 8, 0.88)',
    borderWidth: 1,
    borderColor: 'rgba(28, 187, 61, 0.28)',
    borderRadius: radius.xl,
    overflow: 'hidden',
  },

  leftMobile: { width: '100%' },
  left: {
    flex: 1,
    padding: spacing.xl,
    justifyContent: 'center',
    gap: spacing.md,
  },
  welcome: { fontSize: 38, fontWeight: '800', color: '#ffffff', letterSpacing: 0.5 },
  subtitle: { fontSize: fonts.sizes.sm, color: colors.textMuted, lineHeight: 20 },

  vertDivider: {
    width: 1,
    backgroundColor: 'rgba(28, 187, 61, 0.25)',
    marginVertical: spacing.xl,
  },

  right: {
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
  },

  iconCircle: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#1CBB3D',
    alignItems: 'center', justifyContent: 'center',
  },
  iconText: { fontSize: 24 },

  cardTitle: { fontSize: fonts.sizes.lg, fontWeight: '700', color: '#ffffff' },

  btn: { width: '100%' },

  linkText: {
    color: colors.textMuted,
    fontSize: fonts.sizes.sm,
    marginTop: spacing.xs,
  },
});
