import React, { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, fonts, radius } from '../theme';
import { Button } from '../components/Button';
import { IconChevronLeft } from '../components/Icons';
import { sfx } from '../services/sfx';

type Props = {
  navigation: NativeStackNavigationProp<any>;
  route: { params?: { onAccept?: () => void; showAccept?: boolean } };
};

const LAST_UPDATED = '24 de março de 2026';

export function TermsScreen({ navigation, route }: Props) {
  const { onAccept, showAccept = false } = route.params ?? {};
  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const handleScroll = ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
    const isAtEnd = layoutMeasurement.height + contentOffset.y >= contentSize.height - 40;
    if (isAtEnd) setScrolledToEnd(true);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => { sfx.buttonClick(); navigation.goBack(); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <IconChevronLeft size={18} color={colors.textMuted} accessibilityLabel="Voltar" />
        </TouchableOpacity>
        <Text style={styles.title}>Termos de Uso</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        onScroll={handleScroll}
        scrollEventThrottle={200}
        showsVerticalScrollIndicator
      >
        <Text style={styles.updated}>Última atualização: {LAST_UPDATED}</Text>

        <Section title="1. Aceitação dos Termos">
          Ao acessar ou utilizar o DominoClub, você concorda com estes Termos de Uso. Se não concordar
          com qualquer disposição, não utilize o aplicativo.
        </Section>

        <Section title="2. Elegibilidade">
          O DominoClub é destinado exclusivamente a pessoas físicas residentes no Brasil com 18 anos
          ou mais. É proibido o uso por menores de idade. Ao utilizar o aplicativo, você declara
          ter 18 anos ou mais e residir no Brasil.
        </Section>

        <Section title="3. Natureza do Serviço">
          O DominoClub é uma plataforma de jogos de dominó com prêmios em dinheiro real via PIX.
          As partidas envolvem habilidade, mas também elemento aleatório. Perdas financeiras são
          possíveis. Jogue com responsabilidade.
        </Section>

        <Section title="4. Conta de Usuário">
          Cada usuário pode manter apenas uma conta. A criação de múltiplas contas é proibida e
          pode resultar em banimento permanente e bloqueio de saques. Você é responsável por manter
          a segurança do seu acesso.
        </Section>

        <Section title="5. Depósitos e Saques">
          Depósitos e saques são processados exclusivamente via PIX. O prazo de saque é de até 2
          dias úteis após solicitação. O DominoClub cobra uma taxa administrativa de 10% sobre o
          valor do prêmio. Valores mínimos: depósito R$20, saque R$20.
        </Section>

        <Section title="6. Jogo Responsável">
          O DominoClub apoia o jogo responsável. Caso perceba que está perdendo o controle,
          entre em contato pelo suporte para solicitar auto-exclusão temporária ou permanente.
          Recursos de ajuda: CVV 188 (crise) e Jogo Patológico (tratamento).
        </Section>

        <Section title="7. Conduta Proibida">
          São vedados: uso de bots ou automações, conluio entre jogadores, lavagem de dinheiro,
          fraude, uso de VPN para simular localização brasileira e qualquer manipulação do jogo.
          Violações resultam em banimento imediato e potencial comunicação aos órgãos competentes.
        </Section>

        <Section title="8. Propriedade Intelectual">
          Todo o conteúdo do DominoClub — logotipos, código, design — é de propriedade exclusiva
          da DominoClub Tecnologia Ltda. É proibida a reprodução sem autorização.
        </Section>

        <Section title="9. Limitação de Responsabilidade">
          O DominoClub não se responsabiliza por perdas financeiras decorrentes do uso do aplicativo,
          falhas de conectividade, ou decisões de jogo. O serviço é fornecido "como está".
        </Section>

        <Section title="10. Legislação Aplicável">
          Estes Termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o
          Foro da Comarca de São Paulo/SP para dirimir eventuais conflitos.
        </Section>

        <Section title="11. Alterações">
          O DominoClub pode atualizar estes Termos a qualquer momento. Alterações relevantes serão
          notificadas pelo aplicativo. O uso continuado após notificação constitui aceite dos novos termos.
        </Section>

        <Text style={styles.contact}>
          Dúvidas: suporte@dominoclub.com.br
        </Text>
      </ScrollView>

      {showAccept && (
        <View style={styles.acceptBar}>
          {!scrolledToEnd && (
            <Text style={styles.scrollHint}>Role até o final para aceitar</Text>
          )}
          <Button
            title="Li e aceito os Termos de Uso"
            onPress={async () => {
              await AsyncStorage.setItem(
                '@dominoclub_consent_v1',
                JSON.stringify({ acceptedAt: new Date().toISOString(), ageConfirmed: true, termsAccepted: true }),
              ).catch(() => {});
              onAccept?.();
              navigation.goBack();
            }}
            disabled={!scrolledToEnd}
            style={styles.acceptBtn}
          />
        </View>
      )}
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={sectionStyles.container}>
      <Text style={sectionStyles.title}>{title}</Text>
      <Text style={sectionStyles.body}>{children}</Text>
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  container: { marginBottom: spacing.lg },
  title: { fontSize: fonts.sizes.md, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.xs },
  body: { fontSize: fonts.sizes.sm, color: colors.textSecondary, lineHeight: 20 },
});

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
  content: { padding: spacing.xl, gap: spacing.sm },
  updated: { fontSize: fonts.sizes.xs, color: colors.textMuted, marginBottom: spacing.lg },
  contact: { fontSize: fonts.sizes.sm, color: colors.textMuted, marginTop: spacing.lg, textAlign: 'center' },
  acceptBar: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bgOverlay,
    gap: spacing.sm,
  },
  scrollHint: { color: colors.textMuted, fontSize: fonts.sizes.xs, textAlign: 'center' },
  acceptBtn: { width: '100%' },
});
