import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ImageBackground, TouchableOpacity,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { colors, spacing, fonts, radius } from '../theme';
import { api } from '../services/api';

type Props = {
  navigation: NativeStackNavigationProp<any>;
  route: { params?: { token?: string } };
};

const LIME = '#4ade80';

export function SetNewPasswordScreen({ navigation, route }: Props) {
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
    <ImageBackground
      source={require('../../assets/background.png')}
      style={styles.root}
      resizeMode="cover"
    >
      <View style={styles.row}>
        {/* Left column */}
        <View style={styles.left}>
          <Text style={styles.welcome}>Bem-vindo</Text>
          <Text style={styles.subtitle}>A reserva da mesa, agora no seu celular</Text>
        </View>

        {/* Vertical divider */}
        <View style={styles.vertDivider} />

        {/* Right card */}
        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <Text style={styles.iconText}>🔒</Text>
          </View>

          <Text style={styles.cardTitle}>Resetar a senha</Text>

          <Input
            label=""
            placeholder="Enter new password"
            value={password}
            onChangeText={(t) => { setPassword(t); setError(''); }}
            secureTextEntry
          />
          <Input
            label=""
            placeholder="Re-type password"
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

          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={styles.linkText}>Já tem conta? Faça o login</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.xl,
  },

  left: {
    flex: 1,
    paddingRight: spacing.xxl,
    gap: spacing.md,
  },
  welcome: { fontSize: 38, fontWeight: '800', color: '#ffffff', letterSpacing: 0.5 },
  subtitle: { fontSize: fonts.sizes.sm, color: colors.textMuted, lineHeight: 20 },

  vertDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(74, 222, 128, 0.25)',
    marginVertical: spacing.md,
    marginRight: spacing.xxl,
  },

  card: {
    width: 320,
    backgroundColor: 'rgba(8, 22, 8, 0.80)',
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.22)',
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
  },

  iconCircle: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: LIME,
    alignItems: 'center', justifyContent: 'center',
  },
  iconText: { fontSize: 22 },

  cardTitle: { fontSize: fonts.sizes.lg, fontWeight: '700', color: '#ffffff' },

  btn: { width: '100%' },

  linkText: {
    color: colors.textMuted,
    fontSize: fonts.sizes.sm,
    marginTop: spacing.xs,
  },
});
