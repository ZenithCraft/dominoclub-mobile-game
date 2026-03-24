import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, Alert, RefreshControl, Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { colors, spacing, fonts, radius, shadows } from '../theme';
import { api } from '../services/api';
import { useAuthStore } from '../store/auth.store';
import { Button } from '../components/Button';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEPOSIT_PRESETS = [20, 30, 50, 100, 200, 500];
const POLL_INTERVAL_MS = 3000;

// ─── Types ────────────────────────────────────────────────────────────────────

interface Transaction {
  id: string;
  type: 'DEPOSIT' | 'WITHDRAWAL' | 'BET' | 'WIN' | 'BONUS' | 'REFUND' | 'FEE';
  amount: number;
  balance_after: number | null;
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'PROCESSING';
  pix_qr_code?: string;
  pix_key?: string;
  created_at: string;
}

type DepositStep = 'amount' | 'qr' | 'confirmed';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TYPE_LABEL: Record<string, string> = {
  DEPOSIT: 'Depósito', WITHDRAWAL: 'Saque', BET: 'Aposta',
  WIN: 'Prêmio', BONUS: 'Bônus', REFUND: 'Reembolso', FEE: 'Taxa',
};
const TYPE_COLOR: Record<string, string> = {
  DEPOSIT: colors.success, WITHDRAWAL: colors.error,
  BET: colors.warning, WIN: colors.gold,
};
const STATUS_LABEL: Record<string, string> = {
  COMPLETED: 'Concluído', PENDING: 'Pendente',
  FAILED: 'Falhou', PROCESSING: 'Processando',
};
const STATUS_BG: Record<string, string> = {
  COMPLETED: '#16a34a33', PENDING: '#ca8a0433',
  FAILED: '#dc262633', PROCESSING: '#3b82f633',
};
const STATUS_COLOR: Record<string, string> = {
  COMPLETED: colors.success, PENDING: colors.warning,
  FAILED: colors.error, PROCESSING: colors.info,
};

// ─── Component ────────────────────────────────────────────────────────────────

export function WalletScreen() {
  const { user, refreshUser } = useAuthStore();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);

  // Deposit modal state
  const [depositModal, setDepositModal] = useState(false);
  const [depositStep, setDepositStep] = useState<DepositStep>('amount');
  const [depositAmount, setDepositAmount] = useState(50);
  const [customAmount, setCustomAmount] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [qrCode, setQrCode] = useState('');
  const [depositTxId, setDepositTxId] = useState('');
  const [depositLoading, setDepositLoading] = useState(false);

  // Withdraw modal state
  const [withdrawModal, setWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [pixKey, setPixKey] = useState('');
  const [withdrawLoading, setWithdrawLoading] = useState(false);

  // Polling
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const successAnim = useRef(new Animated.Value(0)).current;

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadWallet = useCallback(async (silent = false) => {
    if (!silent) setLoadError(false);
    try {
      const { data } = await api.get('/wallet');
      setTransactions(data.transactions || []);
      await refreshUser();
    } catch {
      if (!silent) setLoadError(true);
    }
  }, [refreshUser]);

  useEffect(() => { loadWallet(); }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadWallet();
    setRefreshing(false);
  }, [loadWallet]);

  // ── Deposit polling ───────────────────────────────────────────────────────

  const startPolling = useCallback((txId: string) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await api.get(`/wallet/transaction/${txId}`);
        if (data.status === 'COMPLETED') {
          stopPolling();
          setDepositStep('confirmed');
          // Pulse animation for success
          Animated.sequence([
            Animated.timing(successAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
            Animated.timing(successAnim, { toValue: 0.8, duration: 200, useNativeDriver: true }),
            Animated.timing(successAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
          ]).start();
          await loadWallet(true);
        } else if (data.status === 'FAILED') {
          stopPolling();
          Alert.alert('Pagamento falhou', 'O pagamento PIX não foi confirmado.');
          closeDepositModal();
        }
      } catch {
        // keep polling silently
      }
    }, POLL_INTERVAL_MS);
  }, [successAnim, loadWallet]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), []);

  // ── Deposit flow ──────────────────────────────────────────────────────────

  const effectiveDepositAmount = useCustom
    ? parseFloat(customAmount) || 0
    : depositAmount;

  const handleDeposit = async () => {
    const amount = effectiveDepositAmount;
    if (amount < 20) {
      Alert.alert('Valor inválido', 'O depósito mínimo é R$ 20,00');
      return;
    }
    setDepositLoading(true);
    try {
      const { data } = await api.post('/wallet/deposit', { amount });
      setQrCode(data.qrCode);
      setDepositTxId(data.transactionId);
      setDepositStep('qr');
      startPolling(data.transactionId);
    } catch (err: any) {
      Alert.alert('Erro', err.response?.data?.error || 'Erro ao gerar PIX');
    } finally {
      setDepositLoading(false);
    }
  };

  const closeDepositModal = useCallback(() => {
    stopPolling();
    setDepositModal(false);
    setDepositStep('amount');
    setQrCode('');
    setDepositTxId('');
    setUseCustom(false);
    setCustomAmount('');
    loadWallet(true);
  }, [stopPolling, loadWallet]);

  // ── Withdraw flow ─────────────────────────────────────────────────────────

  const rolloverRemaining = user?.wallet?.rollover_remaining ?? 0;
  const realBalance = user?.wallet?.real_balance ?? 0;
  const canWithdraw = rolloverRemaining === 0 && realBalance >= 20;

  const handleWithdraw = async () => {
    const amount = parseFloat(withdrawAmount.replace(',', '.'));
    if (!amount || amount < 20) {
      Alert.alert('Valor inválido', 'O saque mínimo é R$ 20,00');
      return;
    }
    if (amount > realBalance) {
      Alert.alert('Saldo insuficiente', `Seu saldo é R$ ${realBalance.toFixed(2)}`);
      return;
    }
    if (!pixKey.trim()) {
      Alert.alert('Chave PIX obrigatória', 'Informe sua chave PIX para receber');
      return;
    }
    setWithdrawLoading(true);
    try {
      await api.post('/wallet/withdraw', { amount, pixKey: pixKey.trim() });
      Alert.alert('Saque solicitado! ✅', 'Você receberá o valor em instantes na sua chave PIX.');
      setWithdrawModal(false);
      setWithdrawAmount('');
      setPixKey('');
      await loadWallet(true);
    } catch (err: any) {
      Alert.alert('Erro no saque', err.response?.data?.error || 'Tente novamente em instantes');
    } finally {
      setWithdrawLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Carteira</Text>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >

        {/* ── Balance Card ─────────────────────────────────────────────── */}
        <View style={styles.balanceCard}>
          <View style={styles.userRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{user?.name?.[0]?.toUpperCase() || '?'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.userName}>{user?.name || 'Jogador'}</Text>
              <Text style={styles.userPhone}>{user?.phone}</Text>
            </View>
          </View>

          <View style={styles.balanceRow}>
            <View style={styles.balanceItem}>
              <Text style={styles.balanceLabel}>Saldo real</Text>
              <Text style={styles.balanceValue}>R$ {realBalance.toFixed(2)}</Text>
            </View>
            <View style={styles.balanceDivider} />
            <View style={styles.balanceItem}>
              <Text style={styles.balanceLabel}>Bônus</Text>
              <Text style={[styles.balanceValue, { color: colors.gold }]}>
                R$ {(user?.wallet?.bonus_balance || 0).toFixed(2)}
              </Text>
            </View>
          </View>

          {/* Rollover warning */}
          {rolloverRemaining > 0 && (
            <View style={styles.rolloverRow}>
              <Text style={styles.rolloverIcon}>🔒</Text>
              <Text style={styles.rolloverText}>
                Aposte mais R$ {rolloverRemaining.toFixed(2)} em jogos para liberar o saque
              </Text>
            </View>
          )}

          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.depositBtn} onPress={() => setDepositModal(true)}>
              <LinearGradient colors={['#4ade80', '#16a34a']} style={styles.btnGradient}>
                <Text style={styles.depositBtnText}>+ Depositar</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.withdrawBtn, !canWithdraw && styles.btnDisabled]}
              onPress={() => {
                if (rolloverRemaining > 0) {
                  Alert.alert('Saque bloqueado', `Complete o rollover de R$ ${rolloverRemaining.toFixed(2)} antes de sacar.`);
                } else if (realBalance < 20) {
                  Alert.alert('Saldo insuficiente', 'Saldo mínimo para saque é R$ 20,00');
                } else {
                  setWithdrawModal(true);
                }
              }}
            >
              <Text style={[styles.withdrawBtnText, !canWithdraw && { color: colors.textMuted }]}>
                Sacar
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Transaction History ──────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>Histórico</Text>

        {loadError && (
          <TouchableOpacity style={styles.errorRow} onPress={() => loadWallet()}>
            <Text style={styles.errorText}>Erro ao carregar. Toque para tentar novamente.</Text>
          </TouchableOpacity>
        )}

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
                <View style={[styles.typeDot, { backgroundColor: TYPE_COLOR[tx.type] || colors.textMuted }]} />
                <Text style={styles.typeText}>{TYPE_LABEL[tx.type] || tx.type}</Text>
              </View>
              <Text style={[styles.amountText, { color: tx.amount > 0 ? colors.success : colors.error }]}>
                {tx.amount > 0 ? '+' : ''}R$ {Math.abs(tx.amount).toFixed(2)}
              </Text>
              <View style={[styles.statusBadge, { backgroundColor: STATUS_BG[tx.status] || colors.bgCard }]}>
                <Text style={[styles.statusText, { color: STATUS_COLOR[tx.status] || colors.textMuted }]}>
                  {STATUS_LABEL[tx.status] || tx.status}
                </Text>
              </View>
              <Text style={styles.dateText}>
                {new Date(tx.created_at).toLocaleDateString('pt-BR')}
              </Text>
            </View>
          ))}

          {transactions.length === 0 && !loadError && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>Nenhuma transação ainda</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* ── Deposit Modal ────────────────────────────────────────────────── */}
      <Modal visible={depositModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>

            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {depositStep === 'confirmed' ? '✅ Pago!' : 'Depositar via PIX'}
              </Text>
              <TouchableOpacity onPress={closeDepositModal}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Step 1: Choose amount */}
            {depositStep === 'amount' && (
              <>
                <Text style={styles.modalLabel}>Escolha o valor</Text>
                <View style={styles.presetGrid}>
                  {DEPOSIT_PRESETS.map((amt) => (
                    <TouchableOpacity
                      key={amt}
                      style={[
                        styles.presetBtn,
                        !useCustom && depositAmount === amt && styles.presetBtnActive,
                      ]}
                      onPress={() => { setDepositAmount(amt); setUseCustom(false); }}
                    >
                      <Text style={[
                        styles.presetText,
                        !useCustom && depositAmount === amt && styles.presetTextActive,
                      ]}>
                        R$ {amt}
                      </Text>
                    </TouchableOpacity>
                  ))}

                  {/* Custom amount option */}
                  <TouchableOpacity
                    style={[styles.presetBtn, useCustom && styles.presetBtnActive, { flex: 1 }]}
                    onPress={() => setUseCustom(true)}
                  >
                    <Text style={[styles.presetText, useCustom && styles.presetTextActive]}>
                      Outro
                    </Text>
                  </TouchableOpacity>
                </View>

                {useCustom && (
                  <View style={[styles.inputWrapper, { marginTop: spacing.sm }]}>
                    <Text style={styles.currencyPrefix}>R$</Text>
                    <TextInput
                      style={styles.amountInput}
                      value={customAmount}
                      onChangeText={setCustomAmount}
                      keyboardType="decimal-pad"
                      placeholder="0,00"
                      placeholderTextColor={colors.textMuted}
                      autoFocus
                    />
                  </View>
                )}

                <Text style={styles.minNote}>Mínimo R$ 20 · Máximo R$ 10.000</Text>

                <Button
                  title={`Gerar PIX • R$ ${effectiveDepositAmount.toFixed(2)}`}
                  onPress={handleDeposit}
                  loading={depositLoading}
                  style={{ marginTop: spacing.lg }}
                />
              </>
            )}

            {/* Step 2: QR Code + waiting for payment */}
            {depositStep === 'qr' && (
              <View style={styles.pixContainer}>
                <View style={styles.pollingBadge}>
                  <Text style={styles.pollingText}>⏳ Aguardando pagamento...</Text>
                </View>

                {/* Actual QR Code */}
                <View style={styles.qrWrapper}>
                  <QRCode
                    value={qrCode}
                    size={180}
                    color="#000"
                    backgroundColor="#fff"
                  />
                </View>

                <Text style={styles.pixAmountLabel}>
                  R$ {effectiveDepositAmount.toFixed(2)}
                </Text>

                <TouchableOpacity
                  style={styles.copyBtn}
                  onPress={async () => {
                    await Clipboard.setStringAsync(qrCode);
                    Alert.alert('Copiado!', 'Abra seu banco e cole o código PIX para pagar');
                  }}
                >
                  <Text style={styles.copyBtnText}>📋  Copiar código PIX (Copia e Cola)</Text>
                </TouchableOpacity>

                <Text style={styles.pixNote}>
                  O saldo será creditado automaticamente após o pagamento
                </Text>
                <Text style={styles.pixNote}>Este código expira em 1 hora</Text>

                <Button
                  title="Cancelar"
                  onPress={closeDepositModal}
                  variant="ghost"
                  size="sm"
                  style={{ marginTop: spacing.sm }}
                />
              </View>
            )}

            {/* Step 3: Payment confirmed */}
            {depositStep === 'confirmed' && (
              <Animated.View style={[styles.confirmedContainer, { opacity: successAnim }]}>
                <Text style={styles.confirmedEmoji}>🎉</Text>
                <Text style={styles.confirmedTitle}>Depósito confirmado!</Text>
                <Text style={styles.confirmedAmount}>
                  + R$ {effectiveDepositAmount.toFixed(2)}
                </Text>
                <Text style={styles.confirmedBalance}>
                  Novo saldo: R$ {(user?.wallet?.real_balance ?? 0).toFixed(2)}
                </Text>
                <Button
                  title="Fechar"
                  onPress={closeDepositModal}
                  style={{ marginTop: spacing.lg, width: '100%' }}
                />
              </Animated.View>
            )}

          </View>
        </View>
      </Modal>

      {/* ── Withdraw Modal ───────────────────────────────────────────────── */}
      <Modal visible={withdrawModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>

            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Sacar via PIX</Text>
              <TouchableOpacity onPress={() => { setWithdrawModal(false); setWithdrawAmount(''); setPixKey(''); }}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.availableRow}>
              <Text style={styles.availableLabel}>Saldo disponível</Text>
              <Text style={styles.availableValue}>R$ {realBalance.toFixed(2)}</Text>
            </View>

            <Text style={styles.modalLabel}>Valor do saque</Text>
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
              <TouchableOpacity
                onPress={() => setWithdrawAmount(realBalance.toFixed(2))}
                style={styles.maxBtn}
              >
                <Text style={styles.maxBtnText}>MAX</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.modalLabel}>Chave PIX para receber</Text>
            <View style={[styles.inputWrapper, { marginBottom: spacing.xs }]}>
              <TextInput
                style={[styles.amountInput, { flex: 1 }]}
                value={pixKey}
                onChangeText={setPixKey}
                placeholder="CPF, e-mail, celular ou chave aleatória"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <Text style={styles.pixKeyNote}>
              Certifique-se de que a chave está correta — não é possível reverter um saque
            </Text>

            <Button
              title="Solicitar saque"
              onPress={handleWithdraw}
              loading={withdrawLoading}
              style={{ marginTop: spacing.lg }}
            />
          </View>
        </View>
      </Modal>

    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: fonts.sizes.xl, fontWeight: '800', color: colors.textPrimary },

  content: { flex: 1, padding: spacing.lg },

  // Balance card
  balanceCard: {
    backgroundColor: colors.bgCard, borderRadius: radius.xl,
    padding: spacing.xl, marginBottom: spacing.xl,
    borderWidth: 1, borderColor: colors.border, ...shadows.card,
  },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#000', fontWeight: '800', fontSize: fonts.sizes.xl },
  userName: { fontSize: fonts.sizes.lg, fontWeight: '700', color: colors.textPrimary },
  userPhone: { fontSize: fonts.sizes.sm, color: colors.textMuted },

  balanceRow: { flexDirection: 'row', marginBottom: spacing.md },
  balanceItem: { flex: 1, alignItems: 'center', gap: 4 },
  balanceDivider: { width: 1, backgroundColor: colors.border },
  balanceLabel: { fontSize: fonts.sizes.xs, color: colors.textMuted },
  balanceValue: { fontSize: fonts.sizes.xl, fontWeight: '800', color: colors.primary },

  rolloverRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    backgroundColor: '#ca8a0422', borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.md,
  },
  rolloverIcon: { fontSize: 14 },
  rolloverText: { flex: 1, fontSize: fonts.sizes.xs, color: colors.warning, lineHeight: 18 },

  actionRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  depositBtn: { flex: 1, borderRadius: radius.md, overflow: 'hidden' },
  btnGradient: { paddingVertical: 13, alignItems: 'center' },
  depositBtnText: { color: '#000', fontWeight: '700', fontSize: fonts.sizes.md },
  withdrawBtn: {
    flex: 1, borderRadius: radius.md, borderWidth: 1,
    borderColor: colors.border, paddingVertical: 13, alignItems: 'center',
  },
  withdrawBtnText: { color: colors.textPrimary, fontWeight: '600', fontSize: fonts.sizes.md },
  btnDisabled: { opacity: 0.5 },

  // Transactions
  sectionTitle: { fontSize: fonts.sizes.lg, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.md },
  errorRow: { backgroundColor: '#dc262622', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md, alignItems: 'center' },
  errorText: { color: colors.error, fontSize: fonts.sizes.sm },
  transactionTable: { backgroundColor: colors.bgCard, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, marginBottom: spacing.xxxl },
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

  // Modals
  modalOverlay: { flex: 1, backgroundColor: colors.overlay80, justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: colors.bgCard,
    borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    padding: spacing.xl, paddingBottom: spacing.xxxl,
    borderTopWidth: 1, borderColor: colors.border,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  modalTitle: { fontSize: fonts.sizes.xl, fontWeight: '800', color: colors.textPrimary },
  modalClose: { fontSize: 20, color: colors.textMuted, fontWeight: '700' },
  modalLabel: { fontSize: fonts.sizes.sm, color: colors.textSecondary, marginBottom: spacing.sm, marginTop: spacing.md },
  minNote: { fontSize: fonts.sizes.xs, color: colors.textMuted, marginTop: spacing.sm, textAlign: 'center' },

  // Deposit: preset grid
  presetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  presetBtn: {
    paddingVertical: 10, paddingHorizontal: 16, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgCard,
  },
  presetBtnActive: { borderColor: colors.primary, backgroundColor: 'rgba(74,222,128,0.15)' },
  presetText: { color: colors.textMuted, fontWeight: '600', fontSize: fonts.sizes.sm },
  presetTextActive: { color: colors.primary },

  // Deposit: QR step
  pixContainer: { alignItems: 'center', gap: spacing.md },
  pollingBadge: { backgroundColor: '#ca8a0422', borderRadius: radius.full, paddingHorizontal: spacing.lg, paddingVertical: spacing.xs },
  pollingText: { color: colors.warning, fontSize: fonts.sizes.sm, fontWeight: '600' },
  qrWrapper: { backgroundColor: '#fff', padding: spacing.md, borderRadius: radius.lg, ...shadows.card },
  pixAmountLabel: { fontSize: fonts.sizes.xxl, fontWeight: '800', color: colors.primary },
  copyBtn: {
    backgroundColor: colors.bgCard, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    paddingVertical: 12, paddingHorizontal: 20, width: '100%', alignItems: 'center',
  },
  copyBtnText: { color: colors.textPrimary, fontWeight: '600', fontSize: fonts.sizes.sm },
  pixNote: { fontSize: fonts.sizes.xs, color: colors.textMuted, textAlign: 'center' },

  // Deposit: confirmed step
  confirmedContainer: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.lg },
  confirmedEmoji: { fontSize: 64 },
  confirmedTitle: { fontSize: fonts.sizes.xxl, fontWeight: '800', color: colors.textPrimary },
  confirmedAmount: { fontSize: fonts.sizes.xxxl, fontWeight: '800', color: colors.primary },
  confirmedBalance: { fontSize: fonts.sizes.md, color: colors.textSecondary },

  // Withdraw
  availableRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: spacing.lg, padding: spacing.md,
    backgroundColor: colors.bgOverlay, borderRadius: radius.md,
  },
  availableLabel: { color: colors.textMuted, fontSize: fonts.sizes.sm },
  availableValue: { color: colors.primary, fontWeight: '800', fontSize: fonts.sizes.lg },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: spacing.md, marginBottom: spacing.sm,
  },
  currencyPrefix: { color: colors.textSecondary, fontWeight: '600', marginRight: spacing.xs },
  amountInput: { paddingVertical: 14, color: colors.textPrimary, fontSize: fonts.sizes.md, flex: 1 },
  maxBtn: { paddingHorizontal: spacing.sm, paddingVertical: 4, backgroundColor: colors.primaryDark, borderRadius: radius.sm },
  maxBtnText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  pixKeyNote: { fontSize: fonts.sizes.xs, color: colors.warning, lineHeight: 17 },
});
