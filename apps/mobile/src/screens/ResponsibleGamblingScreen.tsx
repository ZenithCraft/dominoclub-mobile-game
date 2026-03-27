import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Linking, Alert,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, fonts, radius } from '../theme';
import { IconPhone, IconBrain, IconMessage, IconGlobe, IconTarget, IconAlert, IconPause, IconBan, IconChevronLeft } from '../components/Icons';
import { api } from '../services/api';
import { useAuthStore } from '../store/auth.store';
import { toast } from '../store/toast.store';

type Props = {
  navigation: NativeStackNavigationProp<any>;
};

const HELP_RESOURCES = [
  {
    icon: IconPhone,
    name: 'CVV — Centro de Valorização da Vida',
    desc: 'Apoio emocional e prevenção ao suicídio',
    action: 'Ligar: 188',
    onPress: () => Linking.openURL('tel:188'),
  },
  {
    icon: IconBrain,
    name: 'Jogo Patológico — ABP',
    desc: 'Associação Brasileira de Psiquiatria — tratamento especializado',
    action: 'Visitar site',
    onPress: () => Linking.openURL('https://www.abp.org.br'),
  },
  {
    icon: IconMessage,
    name: 'Alcoólicos Anônimos',
    desc: 'Grupos de apoio para dependência comportamental',
    action: 'Ligar: 0800 888 0699',
    onPress: () => Linking.openURL('tel:08008880699'),
  },
  {
    icon: IconGlobe,
    name: 'CGAP — Clínica de Jogos Patológicos',
    desc: 'IPq-FMUSP — referência nacional em tratamento',
    action: 'Visitar site',
    onPress: () => Linking.openURL('https://www.ipq.org.br'),
  },
];

const WARNING_SIGNS = [
  'Jogar além do que pode pagar',
  'Tentar recuperar perdas ("caçar o prejuízo")',
  'Mentir para familiares sobre quanto joga',
  'Negligenciar trabalho ou estudos por causa do jogo',
  'Sentir-se irritado ou ansioso quando não pode jogar',
  'Usar o jogo como fuga de problemas emocionais',
  'Pedir dinheiro emprestado para jogar',
];

export function ResponsibleGamblingScreen({ navigation }: Props) {
  const { user } = useAuthStore();
  const [requesting, setRequesting] = useState(false);

  const handleSelfExclusion = (type: 'temporary' | 'permanent') => {
    const label = type === 'temporary' ? '30 dias' : 'permanente';
    const message =
      type === 'temporary'
        ? 'Você ficará impedido de jogar e fazer depósitos por 30 dias. Sua conta e saldo serão preservados.'
        : 'Sua conta será permanentemente bloqueada para jogos e depósitos. O saldo restante poderá ser sacado após o período de carência de 7 dias.';

    Alert.alert(`Auto-exclusão ${label}`, message, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Confirmar',
        style: 'destructive',
        onPress: async () => {
          setRequesting(true);
          try {
            await api.post('/auth/self-exclusion', { type });
            toast.success(
              type === 'temporary'
                ? 'Auto-exclusão de 30 dias ativada. Cuide-se!'
                : 'Auto-exclusão permanente ativada. Obrigado pela confiança.',
            );
            navigation.replace('Login');
          } catch {
            toast.error('Falha ao processar solicitação. Entre em contato pelo suporte.');
          } finally {
            setRequesting(false);
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <IconChevronLeft size={18} color={colors.textMuted} accessibilityLabel="Voltar" />
        </TouchableOpacity>
        <Text style={styles.title}>Jogo Responsável</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator>

        {/* Hero Banner */}
        <View style={styles.heroBanner}>
          <IconTarget size={32} color={colors.primary} accessibilityLabel="Alvo" />
          <Text style={styles.heroTitle}>Jogue com responsabilidade</Text>
          <Text style={styles.heroDesc}>
            O DominoClub é uma plataforma de entretenimento. Jogue pelo prazer — nunca como fonte de renda
            ou fuga de problemas. Apostar dinheiro que você não pode perder é um sinal de alerta.
          </Text>
        </View>

        {/* Spending info */}
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>Seu saldo atual</Text>
          <Text style={styles.infoValue}>
            R$ {(user?.wallet?.real_balance || 0).toFixed(2)}
          </Text>
          <Text style={styles.infoHint}>Defina limites antes de jogar. Nunca aposte mais do que está disposto a perder.</Text>
        </View>

        {/* Warning signs */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sinais de alerta</Text>
          <Text style={styles.sectionSubtitle}>Se você se identifica com algum destes comportamentos, procure ajuda:</Text>
          {WARNING_SIGNS.map((sign, i) => (
            <View key={i} style={styles.warningRow}>
              <IconAlert size={20} color={colors.warning} style={{ marginRight: 8 }} />
              <Text style={styles.warningText}>{sign}</Text>
            </View>
          ))}
        </View>

        {/* Self-exclusion */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Auto-exclusão</Text>
          <Text style={styles.sectionSubtitle}>
            Suspenda temporária ou permanentemente seu acesso ao jogo. Seu saldo é preservado.
          </Text>

          <TouchableOpacity
            style={styles.exclusionBtn}
            onPress={() => handleSelfExclusion('temporary')}
            disabled={requesting}
          >
            <View style={styles.exclusionIconContainer}>
              <IconPause size={24} color={colors.primary} accessibilityLabel="Pausa" />
            </View>
            <View style={styles.exclusionContent}>
              <Text style={styles.exclusionLabel}>Pausa de 30 dias</Text>
              <Text style={styles.exclusionDesc}>Bloqueio temporário de jogos e depósitos</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.exclusionBtn, styles.exclusionBtnDanger]}
            onPress={() => handleSelfExclusion('permanent')}
            disabled={requesting}
          >
            <View style={styles.exclusionIconContainer}>
              <IconBan size={24} color={colors.error} accessibilityLabel="Proibido" />
            </View>
            <View style={styles.exclusionContent}>
              <Text style={[styles.exclusionLabel, { color: colors.error }]}>Auto-exclusão permanente</Text>
              <Text style={styles.exclusionDesc}>Bloqueio definitivo — não pode ser revertido</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Help resources */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Precisa de ajuda?</Text>
          <Text style={styles.sectionSubtitle}>Recursos gratuitos de apoio no Brasil:</Text>
          {HELP_RESOURCES.map((r, i) => {
            const IconComponent = r.icon;
            return (
              <TouchableOpacity key={i} style={styles.resourceCard} onPress={r.onPress} activeOpacity={0.7}>
                <View style={styles.resourceIconContainer}>
                  <IconComponent size={24} color={colors.primary} accessibilityLabel={r.name} />
                </View>
                <View style={styles.resourceContent}>
                  <Text style={styles.resourceName}>{r.name}</Text>
                  <Text style={styles.resourceDesc}>{r.desc}</Text>
                  <Text style={styles.resourceAction}>{r.action}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.footer}>
          Suporte: suporte@dominoclub.com.br{'\n'}
          O DominoClub adere às diretrizes de jogo responsável do Ministério da Fazenda (Lei nº 14.790/2023).
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bgOverlay,
  },
  back: { color: colors.textMuted, fontSize: fonts.sizes.xl, fontWeight: '600' },
  title: { fontSize: fonts.sizes.lg, fontWeight: '800', color: colors.textPrimary },
  scroll: { flex: 1 },
  content: { padding: spacing.xl, gap: spacing.xl },
  heroBanner: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    gap: spacing.md,
  },
  heroIcon: { fontSize: 40 },
  heroTitle: { fontSize: fonts.sizes.xl, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' },
  heroDesc: { fontSize: fonts.sizes.sm, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  infoCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    gap: spacing.xs,
  },
  infoLabel: { fontSize: fonts.sizes.sm, color: colors.textMuted },
  infoValue: { fontSize: fonts.sizes.xxl, fontWeight: '800', color: colors.gold },
  infoHint: { fontSize: fonts.sizes.xs, color: colors.textMuted, textAlign: 'center', marginTop: spacing.xs },
  section: { gap: spacing.md },
  sectionTitle: { fontSize: fonts.sizes.lg, fontWeight: '700', color: colors.textPrimary },
  sectionSubtitle: { fontSize: fonts.sizes.sm, color: colors.textSecondary, lineHeight: 20 },
  warningRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  warningDot: { fontSize: 14, marginTop: 1 },
  warningText: { flex: 1, fontSize: fonts.sizes.sm, color: colors.textSecondary, lineHeight: 20 },
  exclusionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  exclusionBtnDanger: { borderColor: colors.error + '44' },
  exclusionIconContainer: { marginRight: spacing.md, justifyContent: 'center', alignItems: 'center' },
  exclusionContent: { flex: 1, gap: 2 },
  exclusionLabel: { fontSize: fonts.sizes.md, fontWeight: '600', color: colors.textPrimary },
  exclusionDesc: { fontSize: fonts.sizes.xs, color: colors.textMuted },
  resourceCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  resourceIconContainer: { marginTop: 2, marginRight: spacing.md, justifyContent: 'center', alignItems: 'center' },
  resourceContent: { flex: 1, gap: 2 },
  resourceName: { fontSize: fonts.sizes.md, fontWeight: '600', color: colors.textPrimary },
  resourceDesc: { fontSize: fonts.sizes.xs, color: colors.textMuted, lineHeight: 18 },
  resourceAction: { fontSize: fonts.sizes.sm, color: colors.primary, fontWeight: '600', marginTop: spacing.xs },
  footer: {
    fontSize: fonts.sizes.xs,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
    paddingBottom: spacing.xl,
  },
});
