import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import { colors, spacing, fonts, radius, shadows } from '../theme';
import { api } from '../services/api';
import { useAuthStore } from '../store/auth.store';
import { Button } from '../components/Button';

const DEPOSIT_PRESETS = [20, 30, 50, 100, 200, 500];

interface Transaction {
  id: string;
  type: string;
  amount: number;
  balance_after: number | null;
  status: string;
  pix_qr_code?: string;
  created_at: string;
}

export function WalletScreen() {
  const { user, refreshUser } = useAuthStore();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [depositModal, setDepositModal] = useState(false);
  const [withdrawModal, setWithdrawModal] = useState(false);
  const [depositAmount, setDepositAmount] = useState(50);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [pixKey, setPixKey] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadWallet();
  }, []);

  const loadWallet = async () => {
    try {
      const { data } = await api.get('/wallet');
      setTransactions(data.transactions || []);
      refreshUser();
    } catch {}
  };

  const handleDeposit = async () => {
    setLoading(true);
    try {
      const { data } = await api.post('/wallet/deposit', { amount: depositAmount });
      setQrCode(data.qrCode);
    } catch (err: any) {
      Alert.alert('Erro', err.response?.data?.error || 'Erro ao gerar PIX');
    } finally {
      setLoading(false);
    }
  };

  const handleWithdraw = async () => {
    const amount = parseFloat(withdrawAmount);
    if (!amount || amount < 20) { Alert.alert('Erro', 'Valor mínimo R$20'); return; }
    if (!pixKey) { Alert.alert('Erro', 'Informe sua chave PIX'); return; }

    setLoading(true);
    try {
      await api.post('/wallet/withdraw', { amount, pixKey });
      Alert.alert('Sucesso', 'Saque solicitado! Você receberá em instantes.');
      setWithdrawModal(false);
      loadWallet();
    } catch (err: any) {
      Alert.alert('Erro', err.response?.data?.error || 'Erro ao solicitar saque');
    } finally {
      setLoading(false);
    }
  };

  const typeLabel = (type: string) => ({ DEPOSIT: 'Depósito', WITHDRAWAL: 'Saque', BET: 'Aposta', WIN: 'Prêmio', BONUS: 'Bônus', REFUND: 'Reembolso', FEE: 'Taxa' }[type] || type);
  const typeColor = (type: string) => ({ DEPOSIT: colors.success, WITHDRAWAL: colors.error, BET: colors.warning, WIN: colors.gold }[type] || colors.textMuted);
  const statusBg = (status: string) => ({ COMPLETED: '#16a34a33', PENDING: '#ca8a0433', FAILED: '#dc262633' }[status] || colors.bgCard);
  const statusColor = (status: string) => ({ COMPLETED: colors.success, PENDING: colors.warning, FAILED: colors.error }[status] || colors.textMuted);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Carteira</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.iconBtn}>
            <Text>⚙️</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn}>
            <Text>▶</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.content}>
        {/* User + Balance Card */}
        <View style={styles.balanceCard}>
          <View style={styles.userRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{user?.name?.[0]?.toUpperCase() || '?'}</Text>
            </View>
            <View>
              <Text style={styles.userName}>{user?.name || 'Jogador'}</Text>
              <Text style={styles.userPhone}>{user?.phone}</Text>
            </View>
            <TouchableOpacity style={styles.editBtn}>
              <Text style={styles.editIcon}>✎</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.balanceRow}>
            <View style={styles.balanceItem}>
              <Text style={styles.balanceLabel}>Saldo real</Text>
              <Text style={styles.balanceValue}>R$ {(user?.wallet?.real_balance || 0).toFixed(2)}</Text>
            </View>
            <View style={styles.balanceDivider} />
            <View style={styles.balanceItem}>
              <Text style={styles.balanceLabel}>Bônus</Text>
              <Text style={[styles.balanceValue, { color: colors.gold }]}>
                R$ {(user?.wallet?.bonus_balance || 0).toFixed(2)}
              </Text>
            </View>
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.depositBtn} onPress={() => setDepositModal(true)}>
              <LinearGradient colors={['#4ade80', '#16a34a']} style={styles.depositBtnGradient}>
                <Text style={styles.depositBtnText}>Depositar</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity style={styles.withdrawBtn} onPress={() => setWithdrawModal(true)}>
              <Text style={styles.withdrawBtnText}>Sacar</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Transactions */}
        <Text style={styles.sectionTitle}>Histórico de transações</Text>
        <View style={styles.transactionTable}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Tipo</Text>
            <Text style={styles.tableHeaderCell}>Valor</Text>
            <Text style={styles.tableHeaderCell}>Status</Text>
            <Text style={[styles.tableHeaderCell, { flex: 1.5 }]}>Data</Text>
          </View>

          {transactions.map((tx) => (
            <View key={tx.id} style={styles.tableRow}>
              <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={[styles.typeDot, { backgroundColor: typeColor(tx.type) }]} />
                <Text style={styles.typeText}>{typeLabel(tx.type)}</Text>
              </View>
              <Text style={[styles.amountText, { color: tx.amount > 0 ? colors.success : colors.error }]}>
                {tx.amount > 0 ? '+' : ''}R$ {Math.abs(tx.amount).toFixed(2)}
              </Text>
              <View style={[styles.statusBadge, { backgroundColor: statusBg(tx.status) }]}>
                <Text style={[styles.statusText, { color: statusColor(tx.status) }]}>
                  {tx.status === 'COMPLETED' ? 'Concluído' : tx.status === 'PENDING' ? 'Pendente' : 'Falhou'}
                </Text>
              </View>
              <Text style={styles.dateText}>
                {new Date(tx.created_at).toLocaleDateString('pt-BR')}
              </Text>
            </View>
          ))}

          {transactions.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>Nenhuma transação ainda</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Deposit Modal */}
      <Modal visible={depositModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Depositar</Text>
              <TouchableOpacity onPress={() => { setDepositModal(false); setQrCode(''); }}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {qrCode ? (
              <View style={styles.pixContainer}>
                <View style={styles.qrPlaceholder}>
                  <Text style={styles.qrIcon}>📱</Text>
                  <Text style={styles.qrLabel}>QR Code PIX</Text>
                </View>
                <TouchableOpacity style={styles.copyBtn} onPress={() => { Clipboard.setStringAsync(qrCode); Alert.alert('Copiado!', 'Código PIX copiado'); }}>
                  <Text style={styles.copyBtnText}>📋 Copiar código PIX</Text>
                </TouchableOpacity>
                <Text style={styles.pixNote}>Abra seu banco e cole o código para pagar</Text>
                <Button title="Fechar" onPress={() => { setDepositModal(false); setQrCode(''); loadWallet(); }} variant="ghost" size="sm" />
              </View>
            ) : (
              <>
                <Text style={styles.modalLabel}>Escolha o valor</Text>
                <View style={styles.presetGrid}>
                  {DEPOSIT_PRESETS.map((amt) => (
                    <TouchableOpacity
                      key={amt}
                      style={[styles.presetBtn, depositAmount === amt && styles.presetBtnActive]}
                      onPress={() => setDepositAmount(amt)}
                    >
                      <Text style={[styles.presetText, depositAmount === amt && styles.presetTextActive]}>
                        R$ {amt}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Button title={`Gerar PIX • R$ ${depositAmount}`} onPress={handleDeposit} loading={loading} style={{ marginTop: spacing.lg }} />
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Withdraw Modal */}
      <Modal visible={withdrawModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Sacar</Text>
              <TouchableOpacity onPress={() => setWithdrawModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.availableRow}>
              <Text style={styles.availableLabel}>Saldo disponível</Text>
              <Text style={styles.availableValue}>R$ {(user?.wallet?.real_balance || 0).toFixed(2)}</Text>
            </View>

            <Text style={styles.modalLabel}>Valor</Text>
            <View style={styles.inputWrapper}>
              <Text style={styles.currencyPrefix}>R$</Text>
              <TextInput
                style={styles.amountInput}
                value={withdrawAmount}
                onChangeText={setWithdrawAmount}
                keyboardType="decimal-pad"
                placeholder="0,00"
                placeholderTextColor={colors.textMuted}
              />
            </View>

            <Text style={styles.modalLabel}>Chave PIX</Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={[styles.amountInput, { flex: 1 }]}
                value={pixKey}
                onChangeText={setPixKey}
                placeholder="CPF, e-mail, celular ou chave aleatória"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
              />
            </View>

            <Button title="Solicitar saque" onPress={handleWithdraw} loading={loading} style={{ marginTop: spacing.lg }} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { fontSize: fonts.sizes.xl, fontWeight: '800', color: colors.textPrimary },
  headerActions: { flexDirection: 'row', gap: spacing.sm },
  iconBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.bgCard, alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1, padding: spacing.lg },
  balanceCard: { backgroundColor: colors.bgCard, borderRadius: radius.xl, padding: spacing.xl, marginBottom: spacing.xl, borderWidth: 1, borderColor: colors.border, ...shadows.card },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#000', fontWeight: '800', fontSize: fonts.sizes.xl },
  userName: { fontSize: fonts.sizes.lg, fontWeight: '700', color: colors.textPrimary },
  userPhone: { fontSize: fonts.sizes.sm, color: colors.textMuted },
  editBtn: { marginLeft: 'auto', padding: spacing.sm },
  editIcon: { color: colors.textSecondary, fontSize: 16 },
  balanceRow: { flexDirection: 'row', marginBottom: spacing.lg },
  balanceItem: { flex: 1, alignItems: 'center', gap: 4 },
  balanceDivider: { width: 1, backgroundColor: colors.border },
  balanceLabel: { fontSize: fonts.sizes.xs, color: colors.textMuted },
  balanceValue: { fontSize: fonts.sizes.xl, fontWeight: '800', color: colors.primary },
  actionRow: { flexDirection: 'row', gap: spacing.md },
  depositBtn: { flex: 1, borderRadius: radius.md, overflow: 'hidden' },
  depositBtnGradient: { paddingVertical: 12, alignItems: 'center' },
  depositBtnText: { color: '#000', fontWeight: '700', fontSize: fonts.sizes.md },
  withdrawBtn: { flex: 1, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingVertical: 12, alignItems: 'center' },
  withdrawBtnText: { color: colors.textPrimary, fontWeight: '600', fontSize: fonts.sizes.md },
  sectionTitle: { fontSize: fonts.sizes.lg, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.md },
  transactionTable: { backgroundColor: colors.bgCard, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  tableHeader: { flexDirection: 'row', padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.bgOverlay },
  tableHeaderCell: { flex: 1, fontSize: fonts.sizes.xs, color: colors.textMuted, fontWeight: '600', textTransform: 'uppercase' },
  tableRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border + '44' },
  typeDot: { width: 8, height: 8, borderRadius: 4 },
  typeText: { fontSize: fonts.sizes.sm, color: colors.textPrimary, fontWeight: '500' },
  amountText: { flex: 1, fontSize: fonts.sizes.sm, fontWeight: '700' },
  statusBadge: { flex: 1, borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start' },
  statusText: { fontSize: fonts.sizes.xs, fontWeight: '600' },
  dateText: { flex: 1.5, fontSize: fonts.sizes.xs, color: colors.textMuted },
  emptyState: { padding: spacing.xl, alignItems: 'center' },
  emptyText: { color: colors.textMuted, fontSize: fonts.sizes.sm },
  modalOverlay: { flex: 1, backgroundColor: colors.overlay80, justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.bgCard, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.xl, borderTopWidth: 1, borderColor: colors.border },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  modalTitle: { fontSize: fonts.sizes.xl, fontWeight: '800', color: colors.textPrimary },
  modalClose: { fontSize: 20, color: colors.textMuted, fontWeight: '700' },
  modalLabel: { fontSize: fonts.sizes.sm, color: colors.textSecondary, marginBottom: spacing.sm, marginTop: spacing.md },
  presetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  presetBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgCard },
  presetBtnActive: { borderColor: colors.primary, backgroundColor: 'rgba(74,222,128,0.15)' },
  presetText: { color: colors.textMuted, fontWeight: '600', fontSize: fonts.sizes.sm },
  presetTextActive: { color: colors.primary },
  pixContainer: { alignItems: 'center', gap: spacing.lg },
  qrPlaceholder: { width: 180, height: 180, backgroundColor: '#fff', borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  qrIcon: { fontSize: 64 },
  qrLabel: { fontSize: fonts.sizes.sm, color: '#000', fontWeight: '600' },
  copyBtn: { backgroundColor: colors.bgCard, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingVertical: 12, paddingHorizontal: 20 },
  copyBtnText: { color: colors.textPrimary, fontWeight: '600' },
  pixNote: { fontSize: fonts.sizes.xs, color: colors.textMuted, textAlign: 'center' },
  availableRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg, padding: spacing.md, backgroundColor: colors.bgOverlay, borderRadius: radius.md },
  availableLabel: { color: colors.textMuted, fontSize: fonts.sizes.sm },
  availableValue: { color: colors.primary, fontWeight: '800', fontSize: fonts.sizes.lg },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  currencyPrefix: { color: colors.textSecondary, fontWeight: '600', marginRight: spacing.xs },
  amountInput: { paddingVertical: 14, color: colors.textPrimary, fontSize: fonts.sizes.md },
});
