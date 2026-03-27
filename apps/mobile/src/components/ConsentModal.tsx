import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity,
  NativeScrollEvent, NativeSyntheticEvent, Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, spacing, fonts, radius } from '../theme';
import { IconShieldAlert } from './Icons';

const CONSENT_KEY = '@dominoclub_consent_v1';

type ConsentData = {
  acceptedAt: string;
  ageConfirmed: boolean;
  termsAccepted: boolean;
};

type Props = {
  onAccepted: () => void;
};

export function ConsentModal({ onAccepted }: Props) {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState<'age' | 'terms'>('age');
  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    AsyncStorage.getItem(CONSENT_KEY).then((raw) => {
      if (!raw) {
        setVisible(true);
        Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
      } else {
        onAccepted();
      }
    });
  }, []);

  const handleScroll = ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
    const isAtEnd = layoutMeasurement.height + contentOffset.y >= contentSize.height - 40;
    if (isAtEnd) setScrolledToEnd(true);
  };

  const handleAgeConfirm = (confirmed: boolean) => {
    if (!confirmed) return; // do nothing — can't proceed without confirming age
    setAgeConfirmed(true);
    setStep('terms');
    setScrolledToEnd(false);
  };

  const handleAccept = async () => {
    const consent: ConsentData = {
      acceptedAt: new Date().toISOString(),
      ageConfirmed: true,
      termsAccepted: true,
    };
    await AsyncStorage.setItem(CONSENT_KEY, JSON.stringify(consent));
    Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      setVisible(false);
      onAccepted();
    });
  };

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent>
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        <View style={styles.card}>

          {/* Age verification step */}
          {step === 'age' && (
            <>
              <View style={styles.iconContainer}>
                <IconShieldAlert size={48} color={colors.primary} accessibilityLabel="Aviso de idade" />
              </View>
              <Text style={styles.cardTitle}>Verificação de Idade</Text>
              <Text style={styles.cardBody}>
                O DominoClub é uma plataforma de jogos com apostas em dinheiro real.{'\n\n'}
                O acesso é <Text style={styles.bold}>exclusivo para maiores de 18 anos</Text> residentes no Brasil,
                conforme exigido pela Lei nº 14.790/2023.
              </Text>

              <View style={styles.ageButtons}>
                <TouchableOpacity
                  style={styles.ageBtn}
                  onPress={() => handleAgeConfirm(true)}
                >
                  <Text style={styles.ageBtnText}>Tenho 18 anos ou mais</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.ageBtn, styles.ageBtnSecondary]}
                  onPress={() => {
                    // Cannot proceed — just ignore. In production, this would close the app.
                  }}
                >
                  <Text style={[styles.ageBtnText, styles.ageBtnTextSecondary]}>Não tenho 18 anos</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.legalNote}>
                Ao continuar, você declara sob responsabilidade legal ter 18 anos ou mais.
              </Text>
            </>
          )}

          {/* Terms step */}
          {step === 'terms' && (
            <>
              <Text style={styles.cardTitle}>Termos de Uso</Text>
              <Text style={styles.scrollHint}>Role até o final para continuar</Text>

              <ScrollView
                style={styles.termsScroll}
                contentContainerStyle={styles.termsContent}
                onScroll={handleScroll}
                scrollEventThrottle={200}
                showsVerticalScrollIndicator
              >
                <TermsSummarySection title="1. Natureza do Serviço">
                  O DominoClub é uma plataforma de dominó com apostas em dinheiro real via PIX. Perdas financeiras são possíveis.
                </TermsSummarySection>

                <TermsSummarySection title="2. Conta Única">
                  Cada pessoa pode ter apenas uma conta. Múltiplas contas resultam em banimento permanente.
                </TermsSummarySection>

                <TermsSummarySection title="3. Depósitos e Saques">
                  Processados exclusivamente via PIX. Taxa de 10% sobre prêmios. Mínimo: R$20. Prazo de saque: até 2 dias úteis.
                </TermsSummarySection>

                <TermsSummarySection title="4. Jogo Responsável">
                  O uso do serviço implica compromisso com o jogo responsável. Auto-exclusão disponível a qualquer momento.
                </TermsSummarySection>

                <TermsSummarySection title="5. Conduta">
                  Bots, conluio, VPNs e fraudes são proibidos e resultam em banimento imediato.
                </TermsSummarySection>

                <TermsSummarySection title="6. Privacidade (LGPD)">
                  Seus dados são tratados conforme a Lei nº 13.709/2018. Você pode solicitar exclusão dos dados a qualquer momento.
                </TermsSummarySection>

                <Text style={styles.termsFooter}>
                  Ao aceitar, você confirma que leu e concorda com os Termos de Uso e a Política de Privacidade completos,
                  disponíveis no menu Configurações do aplicativo.
                </Text>
              </ScrollView>

              <TouchableOpacity
                style={[styles.acceptBtn, !scrolledToEnd && styles.acceptBtnDisabled]}
                onPress={handleAccept}
                disabled={!scrolledToEnd}
              >
                <Text style={styles.acceptBtnText}>Li e aceito os Termos</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </Animated.View>
    </Modal>
  );
}

function TermsSummarySection({ title, children }: { title: string; children: string }) {
  return (
    <View style={tStyles.container}>
      <Text style={tStyles.title}>{title}</Text>
      <Text style={tStyles.body}>{children}</Text>
    </View>
  );
}

const tStyles = StyleSheet.create({
  container: { marginBottom: spacing.md },
  title: { fontSize: fonts.sizes.sm, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },
  body: { fontSize: fonts.sizes.xs, color: colors.textSecondary, lineHeight: 18 },
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.xl,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 420,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.lg,
  },
  iconContainer: {
    marginBottom: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontSize: fonts.sizes.xl, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' },
  cardBody: { fontSize: fonts.sizes.sm, color: colors.textSecondary, lineHeight: 22, textAlign: 'center' },
  bold: { fontWeight: '700', color: colors.textPrimary },
  ageButtons: { gap: spacing.sm },
  ageBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  ageBtnSecondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  ageBtnText: { fontSize: fonts.sizes.md, fontWeight: '700', color: colors.textOnPrimary },
  ageBtnTextSecondary: { color: colors.textMuted },
  legalNote: { fontSize: fonts.sizes.xs, color: colors.textMuted, textAlign: 'center', lineHeight: 16 },
  scrollHint: { fontSize: fonts.sizes.xs, color: colors.textMuted, textAlign: 'center' },
  termsScroll: { maxHeight: 280, borderRadius: radius.md, backgroundColor: colors.bgOverlay },
  termsContent: { padding: spacing.lg },
  termsFooter: {
    fontSize: fonts.sizes.xs,
    color: colors.textMuted,
    lineHeight: 16,
    marginTop: spacing.lg,
    textAlign: 'center',
  },
  acceptBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  acceptBtnDisabled: { opacity: 0.4 },
  acceptBtnText: { fontSize: fonts.sizes.md, fontWeight: '700', color: colors.textOnPrimary },
});
