import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  NativeScrollEvent, NativeSyntheticEvent, Animated, Alert,
} from 'react-native';
import { BlurModal } from './BlurModal';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, spacing, fonts, radius } from '../theme';
import { isTablet } from '../theme/responsive';
import { IconShieldAlert } from './Icons';
import { sfx } from '../services/sfx';

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
  const [ageScrolledToEnd, setAgeScrolledToEnd] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scrollIndicatorAnim = useRef(new Animated.Value(0)).current;
  const termsIndicatorAnim = useRef(new Animated.Value(0)).current;

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
    const progress = contentSize.height > layoutMeasurement.height
      ? contentOffset.y / (contentSize.height - layoutMeasurement.height)
      : 1;
    Animated.timing(termsIndicatorAnim, {
      toValue: progress,
      duration: 80,
      useNativeDriver: false,
    }).start();
    const isAtEnd = layoutMeasurement.height + contentOffset.y >= contentSize.height - 40;
    if (isAtEnd) setScrolledToEnd(true);
  };

  const handleAgeScroll = ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
    const progress = contentSize.height > layoutMeasurement.height
      ? contentOffset.y / (contentSize.height - layoutMeasurement.height)
      : 1;
    Animated.timing(scrollIndicatorAnim, {
      toValue: progress,
      duration: 80,
      useNativeDriver: false,
    }).start();
    const isAtEnd = layoutMeasurement.height + contentOffset.y >= contentSize.height - 40;
    if (isAtEnd) setAgeScrolledToEnd(true);
  };

  const handleAgeConfirm = (confirmed: boolean) => {
    sfx.buttonClick();
    if (!confirmed) return;
    setAgeConfirmed(true);
    setStep('terms');
    setScrolledToEnd(false);
  };

  const handleAccept = async () => {
    sfx.buttonClick();
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
    <BlurModal visible transparent animationType="none" statusBarTranslucent>
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        <View style={styles.card}>

          {/* Age verification step */}
          {step === 'age' && (
            <View style={styles.scrollWrapper}>
              <ScrollView
                style={styles.ageScroll}
                contentContainerStyle={styles.ageScrollContent}
                showsVerticalScrollIndicator={false}
                onScroll={handleAgeScroll}
                scrollEventThrottle={16}
              >
                <View style={styles.iconContainer}>
                  <IconShieldAlert size={56} color="#1F5D18" accessibilityLabel="Aviso de idade" />
                </View>
                <Text style={styles.cardTitle}>Verificação de Idade</Text>
                <Text style={styles.cardBody}>
                  O DominoClub é uma plataforma de jogos de habilidade com prêmios em dinheiro real.{'\n\n'}
                  O acesso é <Text style={styles.bold}>exclusivo para maiores de 18 anos</Text> residentes no Brasil.{'\n\n'}
                  O uso por menores de 18 anos é estritamente proibido e sujeito a penalidades legais.
                </Text>

                <View style={styles.ageButtons}>
                  {!ageScrolledToEnd && (
                    <Text style={styles.scrollHint}>Role para baixo para continuar</Text>
                  )}
                  <TouchableOpacity
                    style={[styles.ageBtn, !ageScrolledToEnd && styles.ageBtnDisabled]}
                    onPress={() => handleAgeConfirm(true)}
                    disabled={!ageScrolledToEnd}
                  >
                    <Text style={styles.ageBtnText}>Tenho 18 anos ou mais</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.ageBtn, styles.ageBtnSecondary]}
                    onPress={() => {
                      sfx.buttonClick();
                      Alert.alert(
                        'Acesso Restrito',
                        'O DominoClub é exclusivo para maiores de 18 anos. O uso por menores é proibido por lei.',
                      );
                    }}
                  >
                    <Text style={[styles.ageBtnText, styles.ageBtnTextSecondary]}>Não tenho 18 anos</Text>
                  </TouchableOpacity>
                  <Text style={styles.legalNote}>
                    Ao continuar, você declara sob responsabilidade legal ter 18 anos ou mais.
                  </Text>
                </View>
              </ScrollView>

              <View style={styles.customScrollTrack}>
                <Animated.View
                  style={[
                    styles.customScrollThumb,
                    {
                      height: scrollIndicatorAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['10%', '100%'],
                      }),
                      top: scrollIndicatorAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0%', '90%'],
                      }),
                    },
                  ]}
                />
              </View>
            </View>
          )}

          {/* Terms step */}
          {step === 'terms' && (
            <View style={styles.scrollWrapper}>
              <ScrollView
                style={styles.ageScroll}
                contentContainerStyle={styles.ageScrollContent}
                showsVerticalScrollIndicator={false}
                onScroll={handleScroll}
                scrollEventThrottle={16}
              >
                <Text style={styles.cardTitle}>Termos de Uso</Text>
                {!scrolledToEnd && (
                  <Text style={styles.scrollHint}>Role até o final para continuar</Text>
                )}

                <TermsSummarySection title="1. Natureza do Serviço">
                  O DominoClub é uma plataforma de dominó com prêmios em dinheiro real via PIX. Perdas financeiras são possíveis.
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

                <View style={styles.ageButtons}>
                  <TouchableOpacity
                    style={[styles.ageBtn, !scrolledToEnd && styles.ageBtnDisabled]}
                    onPress={handleAccept}
                    disabled={!scrolledToEnd}
                  >
                    <Text style={styles.ageBtnText}>Li e aceito os Termos</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>

              <View style={styles.customScrollTrack}>
                <Animated.View
                  style={[
                    styles.customScrollThumb,
                    {
                      height: termsIndicatorAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['10%', '100%'],
                      }),
                      top: termsIndicatorAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0%', '90%'],
                      }),
                    },
                  ]}
                />
              </View>
            </View>
          )}
        </View>
      </Animated.View>
    </BlurModal>
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
    paddingHorizontal: spacing.xl,
    paddingVertical: 48,
  },
  card: {
    backgroundColor: '#082006',
    borderRadius: radius.xl,
    padding: spacing.xl,
    width: '100%',
    maxWidth: isTablet ? 740 : 420,
    maxHeight: isTablet ? 860 : 520,
    flex: 1,
    borderWidth: 2,
    borderColor: '#0F400B',
  },
  ageStep: {
    gap: spacing.lg,
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontSize: fonts.sizes.xl, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' },
  cardBody: { fontSize: fonts.sizes.md, color: colors.textPrimary, lineHeight: 24, textAlign: 'center' },
  bold: { fontWeight: '700', color: colors.textPrimary },
  ageButtons: { gap: spacing.md, marginTop: spacing.xl },
  ageBtn: {
    backgroundColor: '#0F400B',
    borderRadius: radius.full,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  ageBtnSecondary: { backgroundColor: '#4F4E47', borderWidth: 0 },
  ageBtnText: { fontSize: fonts.sizes.md, fontWeight: '700', color: '#ffffff' },
  ageBtnTextSecondary: { color: '#ffffff' },
  legalNote: { fontSize: fonts.sizes.xs, color: colors.textMuted, textAlign: 'center', lineHeight: 16 },
  scrollWrapper: {
    flex: 1,
    flexDirection: 'row',
  },
  ageScroll: { flex: 1 },
  ageScrollContent: { gap: spacing.md, paddingBottom: spacing.sm, paddingRight: spacing.sm },
  customScrollTrack: {
    width: 4,
    backgroundColor: '#0F400B',
    borderRadius: 2,
    marginLeft: spacing.xs,
    overflow: 'hidden',
  },
  customScrollThumb: {
    width: 4,
    backgroundColor: '#1F5D18',
    borderRadius: 2,
    position: 'absolute',
    left: 0,
    right: 0,
  },
  ageBtnDisabled: { opacity: 0.35 },
  scrollHint: { fontSize: fonts.sizes.xs, color: colors.textMuted, textAlign: 'center' },
  termsFooter: {
    fontSize: fonts.sizes.xs,
    color: colors.textMuted,
    lineHeight: 16,
    marginTop: spacing.lg,
    textAlign: 'center',
  },
});
