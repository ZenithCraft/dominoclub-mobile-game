import React, { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  NativeScrollEvent, NativeSyntheticEvent, Alert,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, fonts, radius } from '../theme';
import { api } from '../services/api';
import { useAuthStore } from '../store/auth.store';
import { toast } from '../store/toast.store';

type Props = {
  navigation: NativeStackNavigationProp<any>;
};

const LAST_UPDATED = '24 de março de 2026';

export function PrivacyPolicyScreen({ navigation }: Props) {
  const { logout } = useAuthStore();
  const [deleting, setDeleting] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const handleDeleteAccount = () => {
    Alert.alert(
      'Excluir Conta',
      'Tem certeza? Esta ação é irreversível. Seus dados serão removidos permanentemente e seu saldo restante será perdido.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir minha conta',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await api.delete('/auth/account');
              toast.success('Conta excluída com sucesso.');
              await logout();
              navigation.replace('Login');
            } catch {
              toast.error('Falha ao excluir conta. Tente novamente.');
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  const handleDataExport = async () => {
    try {
      await api.post('/auth/data-export');
      toast.success('Seus dados serão enviados para o e-mail cadastrado em até 48h.');
    } catch {
      toast.error('Falha ao solicitar exportação. Tente novamente.');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Política de Privacidade</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator
      >
        <Text style={styles.updated}>Última atualização: {LAST_UPDATED}</Text>

        <Section title="1. Responsável pelo Tratamento">
          DominoClub Tecnologia Ltda., inscrita no CNPJ sob o nº XX.XXX.XXX/0001-XX, com sede em São Paulo/SP,
          é a controladora dos seus dados pessoais, nos termos da Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018).
        </Section>

        <Section title="2. Dados Coletados">
          Coletamos os seguintes dados pessoais:{'\n\n'}
          • Nome completo{'\n'}
          • CPF{'\n'}
          • Número de celular{'\n'}
          • Chave PIX{'\n'}
          • Localização (somente para verificação geográfica){'\n'}
          • Foto de perfil (opcional){'\n'}
          • Dados de jogo e histórico de transações financeiras
        </Section>

        <Section title="3. Finalidade do Tratamento">
          Seus dados são utilizados para:{'\n\n'}
          • Criação e gestão da sua conta{'\n'}
          • Verificação de identidade e conformidade regulatória{'\n'}
          • Processamento de depósitos e saques via PIX{'\n'}
          • Prevenção à fraude e lavagem de dinheiro{'\n'}
          • Confirmação de localização no território brasileiro{'\n'}
          • Comunicações sobre sua conta e partidas
        </Section>

        <Section title="4. Base Legal">
          O tratamento dos seus dados se baseia em:{'\n\n'}
          • Execução de contrato — necessário para operar o serviço{'\n'}
          • Cumprimento de obrigação legal — KYC, anti-fraude, COAF{'\n'}
          • Legítimo interesse — segurança da plataforma{'\n'}
          • Consentimento — comunicações de marketing (revogável)
        </Section>

        <Section title="5. Compartilhamento de Dados">
          Não vendemos seus dados. Podemos compartilhá-los com:{'\n\n'}
          • Banco Inter — processamento PIX{'\n'}
          • Serpro — validação de CPF{'\n'}
          • Provedor de SMS — envio de OTP{'\n'}
          • Autoridades competentes — quando exigido por lei
        </Section>

        <Section title="6. Retenção de Dados">
          Seus dados são retidos enquanto a conta estiver ativa. Após exclusão, dados financeiros são mantidos por 5 anos
          para fins de conformidade fiscal e regulatória (Lei nº 9.613/1998). Demais dados são excluídos em até 30 dias.
        </Section>

        <Section title="7. Seus Direitos (LGPD — Art. 18)">
          Você tem direito a:{'\n\n'}
          • Confirmação e acesso aos seus dados{'\n'}
          • Correção de dados incompletos ou desatualizados{'\n'}
          • Portabilidade dos dados (exportação){'\n'}
          • Exclusão dos dados tratados com base em consentimento{'\n'}
          • Revogação do consentimento a qualquer momento{'\n'}
          • Oposição ao tratamento em caso de descumprimento da LGPD{'\n\n'}
          Use os botões abaixo para exercer seus direitos.
        </Section>

        <Section title="8. Segurança">
          Adotamos medidas técnicas e organizacionais para proteger seus dados: criptografia em trânsito (TLS 1.3),
          hash de senhas com bcrypt, autenticação multifator via SMS OTP e armazenamento seguro de certificados mTLS.
        </Section>

        <Section title="9. Cookies e Dados de Uso">
          O aplicativo não utiliza cookies de terceiros. Coletamos dados de uso anonimizados para melhoria do serviço.
          Não realizamos perfilamento para fins de marketing sem consentimento explícito.
        </Section>

        <Section title="10. Contato e DPO">
          Para exercer seus direitos ou esclarecer dúvidas sobre privacidade, entre em contato:{'\n\n'}
          E-mail: privacidade@dominoclub.com.br{'\n'}
          Encarregado de Dados (DPO): dpo@dominoclub.com.br{'\n'}
          ANPD: www.gov.br/anpd
        </Section>

        {/* LGPD Action Buttons */}
        <View style={styles.lgpdSection}>
          <Text style={styles.lgpdTitle}>Exercer Direitos LGPD</Text>

          <TouchableOpacity style={styles.lgpdBtn} onPress={handleDataExport}>
            <Text style={styles.lgpdBtnIcon}>📤</Text>
            <View style={styles.lgpdBtnContent}>
              <Text style={styles.lgpdBtnLabel}>Exportar meus dados</Text>
              <Text style={styles.lgpdBtnDesc}>Receba uma cópia dos seus dados por e-mail em até 48h</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.lgpdBtn, styles.lgpdBtnDanger]}
            onPress={handleDeleteAccount}
            disabled={deleting}
          >
            <Text style={styles.lgpdBtnIcon}>🗑️</Text>
            <View style={styles.lgpdBtnContent}>
              <Text style={[styles.lgpdBtnLabel, styles.lgpdBtnLabelDanger]}>
                {deleting ? 'Excluindo...' : 'Excluir minha conta'}
              </Text>
              <Text style={styles.lgpdBtnDesc}>Remove sua conta e dados pessoais permanentemente</Text>
            </View>
          </TouchableOpacity>
        </View>

        <Text style={styles.contact}>
          privacidade@dominoclub.com.br
        </Text>
      </ScrollView>
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
  lgpdSection: {
    marginTop: spacing.xl,
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.xl,
  },
  lgpdTitle: { fontSize: fonts.sizes.md, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.sm },
  lgpdBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  lgpdBtnDanger: { borderColor: colors.error + '44' },
  lgpdBtnIcon: { fontSize: 24 },
  lgpdBtnContent: { flex: 1, gap: 2 },
  lgpdBtnLabel: { fontSize: fonts.sizes.md, fontWeight: '600', color: colors.textPrimary },
  lgpdBtnLabelDanger: { color: colors.error },
  lgpdBtnDesc: { fontSize: fonts.sizes.xs, color: colors.textMuted },
});
