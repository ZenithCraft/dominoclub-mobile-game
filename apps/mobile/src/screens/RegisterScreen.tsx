import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Logo } from '../components/Logo';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { colors, spacing, fonts, radius } from '../theme';
import { api } from '../services/api';
import { useAuthStore } from '../store/auth.store';

type Props = {
  navigation: NativeStackNavigationProp<any>;
  route: { params?: { phone?: string } };
};

export function RegisterScreen({ navigation, route }: Props) {
  const [name, setName] = useState('');
  const [cpf, setCpf] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { refreshUser } = useAuthStore();

  const formatCPF = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!name.trim() || name.trim().length < 3) newErrors.name = 'Nome deve ter ao menos 3 caracteres';
    if (cpf && cpf.replace(/\D/g, '').length !== 11) newErrors.cpf = 'CPF inválido';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      await api.put('/auth/profile', { name, cpf: cpf.replace(/\D/g, '') || undefined });
      await refreshUser();
      navigation.replace('Main');
    } catch (err: any) {
      setErrors({ general: err.response?.data?.error || 'Erro ao salvar perfil' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.bgPattern} pointerEvents="none">
        {Array.from({ length: 60 }).map((_, i) => <View key={i} style={styles.bgTile} />)}
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.left}>
            <Logo size="lg" />
            <Text style={styles.tagline}>Bem-vindo</Text>
            <Text style={styles.subtitle}>Complete seu perfil{'\n'}para começar a jogar</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.title}>Criar conta</Text>
            <Text style={styles.subtitle2}>Preencha seus dados para continuar</Text>

            <Input
              label="Nome completo"
              placeholder="Seu nome"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              error={errors.name}
            />

            <Input
              label="CPF (opcional)"
              placeholder="000.000.000-00"
              value={cpf}
              onChangeText={(t) => setCpf(formatCPF(t))}
              keyboardType="number-pad"
              error={errors.cpf}
            />

            {errors.general ? (
              <Text style={styles.generalError}>{errors.general}</Text>
            ) : null}

            <Button title="Criar conta" onPress={handleSubmit} loading={loading} style={styles.btn} />
            <Button title="Pular por agora" onPress={() => navigation.replace('Main')} variant="ghost" style={styles.btn} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xxl, paddingVertical: spacing.xl, gap: spacing.xxl },
  bgPattern: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row', flexWrap: 'wrap', overflow: 'hidden' },
  bgTile: { width: 50, height: 28, borderWidth: 1, borderColor: colors.primary, margin: 8, borderRadius: 3, opacity: 0.06 },
  left: { flex: 1, gap: spacing.lg },
  tagline: { fontSize: fonts.sizes.xxxl, fontWeight: '800', color: colors.textPrimary, marginTop: spacing.xxl },
  subtitle: { fontSize: fonts.sizes.lg, color: colors.textSecondary, lineHeight: 26 },
  card: { width: 360, backgroundColor: 'rgba(10,31,10,0.92)', borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, padding: spacing.xxl },
  title: { fontSize: fonts.sizes.xxl, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.xs },
  subtitle2: { fontSize: fonts.sizes.sm, color: colors.textMuted, marginBottom: spacing.xl },
  btn: { width: '100%', marginTop: spacing.sm },
  generalError: { color: colors.error, fontSize: fonts.sizes.sm, marginBottom: spacing.sm, textAlign: 'center' },
});
