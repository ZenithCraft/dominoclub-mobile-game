import React, { useState } from 'react';
import {
  View, Text, StyleSheet,
  KeyboardAvoidingView, Platform, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { colors, spacing, fonts, radius } from '../theme';
import { ScreenBackground } from '../components/ScreenBackground';
import { api } from '../services/api';
import { IconSmartphone } from '../components/Icons';
import { LinearGradient } from 'expo-linear-gradient';
import { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'GoogleLinkPhone'>;

export function GoogleLinkPhoneScreen({ navigation, route }: Props) {
  const { pendingToken, profile } = route.params;
  const { height: winH } = useWindowDimensions();
  const isShort = winH < 700;

  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const formatPhone = (text: string) => {
    const d = text.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 2) return d;
    if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  };

  const handleContinue = async () => {
    setError('');
    const clean = phone.replace(/\D/g, '');
    if (clean.length < 11) { setError('Digite um número de celular válido'); return; }
    const fullPhone = `+55${clean}`;

    setLoading(true);
    try {
      await api.post('/auth/otp/send', { phone: fullPhone });
      navigation.navigate('OTPVerification', { phone: fullPhone, googlePendingToken: pendingToken });
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao enviar código. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenBackground style={styles.root}>
      <SafeAreaView style={styles.safe} edges={[]}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.kav}>
          <View style={styles.center}>
            <View style={styles.panel}>
              <LinearGradient
                colors={['#BEF311', '#1CBB3D']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.iconCircle}
              >
                <IconSmartphone size={28} color="#0a1f0a" accessibilityLabel="Smartphone" />
              </LinearGradient>

              <Text style={[styles.title, isShort && styles.titleShort]}>
                {profile?.name ? `Olá, ${profile.name.split(' ')[0]}!` : 'Quase lá!'}
              </Text>
              <Text style={styles.subtitle}>
                Confirme seu número de telefone para continuar com sua conta Google
              </Text>

              <Input
                label=""
                placeholder="Número de telefone"
                value={phone}
                onChangeText={(t) => { setPhone(formatPhone(t)); setError(''); }}
                keyboardType="phone-pad"
                error={error}
                maxLength={15}
                compact
              />

              <Button
                title="Continuar"
                onPress={handleContinue}
                loading={loading}
                size="sm"
                style={styles.btn}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a1f0a' },
  safe: { flex: 1 },
  kav: { flex: 1 },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },

  panel: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: 'rgba(34, 92, 52, 0.45)',
    borderWidth: 1,
    borderColor: 'rgba(187, 255, 0, 0.16)',
    borderRadius: radius.xl,
    alignItems: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },

  iconCircle: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.xs,
  },

  title: { fontSize: fonts.sizes.lg, fontWeight: '700', color: '#ffffff', textAlign: 'center' },
  titleShort: { fontSize: fonts.sizes.md },
  subtitle: {
    fontSize: fonts.sizes.sm,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },

  btn: { width: '100%', marginTop: spacing.xs },
});
