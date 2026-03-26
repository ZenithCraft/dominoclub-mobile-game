import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, Alert, RefreshControl, Animated,
  ImageBackground,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { colors, spacing, fonts, radius, shadows } from '../theme';
import { api } from '../services/api';
import { useAuthStore } from '../store/auth.store';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Transaction {
  id: string;
  type: 'DEPOSIT' | 'WITHDRAWAL' | 'BET' | 'WIN' | 'BONUS' | 'REFUND' | 'FEE';
  amount: number;
  balance_after: number | null;
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'PROCESSING';
  pix_qr_code?: string;
  created_at: string;
}

type DepositStep = 'amount' | 'qr' | 'confirmed';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEPOSIT_PRESETS = [10, 25, 50, 100];
const POLL_INTERVAL_MS = 3000;

const TYPE_LABEL: Record<string, string> = {
  DEPOSIT: 'Depósito', WITHDRAWAL: 'Saque', BET: 'Aposta',
  WIN: 'Prêmio', BONUS: 'Bônus', REFUND: 'Reembolso', FEE: 'Taxa',
};

const STATUS_LABEL: Record<string, string> = {
  COMPLETED: 'Concluído', PENDING: 'Pendente',
  FAILED: 'Falhou', PROCESSING: 'Processando',
};

// ─── Coin icon ────────────────────────────────────────────────────────────────

function CoinIcon() {
  return (
    <View style={coinStyles.circle}>
      <Text style={coinStyles.text}>$</Text>
    </View>
  );
}
const coinStyles = StyleSheet.create({
  circle: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#facc15',
    alignItems: 'center', justifyContent: 'center',
  },
  text: { color: '#000', fontWeight: '900', fontSize: 12 },
});

// ─── Balance row ──────────────────────────────────────────────────────────────

function BalanceRow({ label, value }: { label: string; value: number }) {
  return (
    <View style={balRowStyles.row}>
      <Text style={balRowStyles.label}>{label}</Text>
      <View style={balRowStyles.right}>
        <CoinIcon />
        <Text style={balRowStyles.value}>{value.toLocaleString('pt-BR')}</Text>
      </View>
    </View>
  );
}
const balRowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(74,222,128,0.1)',
  },
  label: { color: '#fff', fontSize: fonts.sizes.sm, flex: 1 },
  right: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  value: { color: '#fff', fontWeight: '700', fontSize: fonts.sizes.sm },
});

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const isCompleted  = status === 'COMPLETED';
  const isProcessing = status === 'PROCESSING';
  return (
    <View style={[
      badgeStyles.badge,
      isCompleted  && badgeStyles.completed,
      isProcessing && badgeStyles.processing,
      !isCompleted && !isProcessing && badgeStyles.default,
    ]}>
      <Text style={[badgeStyles.text, isCompleted && badgeStyles.textDark]}>
        {STATUS_LABEL[status] ?? status}
      </Text>
    </View>
  );
}
const badgeStyles = StyleSheet.create({
  badge: { borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3 },
  completed:  { backgroundColor: '#4ade80' },
  processing: { backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  default:    { backgroundColor: 'rgba(255,255,255,0.1)' },
  text:     { color: '#fff', fontSize: fonts.sizes.xs, fontWeight: '600' },
  textDark: { color: '#000' },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export function WalletScreen() {
  const { user, refreshUser } = useAuthStore();

  const [transactions, setTransactions]   = useState<Transaction[]>([]);
  const [refreshing, setRefreshing]       = useState(false);
  const [loadError, setLoadError]         = useState(false);

  // Deposit
  const [depositModal, setDepositModal]   = useState(false);
  const [depositStep, setDepositStep]     = useState<DepositStep>('amount');
  const [depositAmount, setDepositAmount] = useState(10);
  const [customAmount, setCustomAmount]   = useState('');
  const [useCustom, setUseCustom]         = useState(false);
  const [qrCode, setQrCode]               = useState('');
  const [depositLoading, setDepositLoading] = useState(false);

  // Withdraw
  const [withdrawModal, setWithdrawModal]   = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [pixKey, setPixKey]               = useState('');
  const [withdrawLoading, setWithdrawLoading] = useState(false);

  // Polling
  const pollRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const successAnim = useRef(new Animated.Value(0)).current;

  const realBalance    = user?.wallet?.real_balance ?? 0;
  const bonusBalance   = user?.wallet?.bonus_balance ?? 0;
  const rolloverRemaining = user?.wallet?.rollover_remaining ?? 0;
  const canWithdraw    = rolloverRemaining === 0 && realBalance >= 20;

  // ── Data ────────────────────────────────────────────────────────────────────

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

  // ── Deposit polling ─────────────────────────────────────────────────────────

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const startPolling = useCallback((txId: string) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await api.get(`/wallet/transaction/${txId}`);
        if (data.status === 'COMPLETED') {
          stopPolling();
          setDepositStep('confirmed');
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
      } catch { /* keep polling silently */ }
    }, POLL_INTERVAL_MS);
  }, [successAnim, loadWallet, stopPolling]);

  useEffect(() => () => stopPolling(), []);

  // ── Deposit actions ─────────────────────────────────────────────────────────

  const effectiveAmount = useCustom ? (parseFloat(customAmount) || 0) : depositAmount;

  const handleDeposit = async () => {
    const amount = effectiveAmount;
    if (amount < 10) { Alert.alert('Valor inválido', 'O depósito mínimo é R$ 10,00'); return; }
    setDepositLoading(true);
    try {
      const { data } = await api.post('/wallet/deposit', { amount });
      setQrCode(data.qrCode);
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
    setUseCustom(false); setCustomAmount('');
    loadWallet(true);
  }, [stopPolling, loadWallet]);

  // ── Withdraw actions ────────────────────────────────────────────────────────

  const handleWithdraw = async () => {
    const amount = parseFloat(withdrawAmount.replace(',', '.'));
    if (!amount || amount < 20) { Alert.alert('Valor inválido', 'O saque mínimo é R$ 20,00'); return; }
    if (amount > realBalance)   { Alert.alert('Saldo insuficiente', `Seu saldo é R$ ${realBalance.toFixed(2)}`); return; }
    if (!pixKey.trim())         { Alert.alert('Chave PIX obrigatória', 'Informe sua chave PIX'); return; }
    setWithdrawLoading(true);
    try {
      await api.post('/wallet/withdraw', { amount, pixKey: pixKey.trim() });
      Alert.alert('Saque solicitado! ✅', 'Você receberá o valor na sua chave PIX em instantes.');
      setWithdrawModal(false);
      setWithdrawAmount(''); setPixKey('');
      await loadWallet(true);
    } catch (err: any) {
      Alert.alert('Erro no saque', err.response?.data?.error || 'Tente novamente em instantes');
    } finally {
      setWithdrawLoading(false);
    }
  };

  const today = new Date().toLocaleDateString('pt-BR');

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <ImageBackground
      source={require('../../assets/background.png')}
      style={styles.root}
      resizeMode="cover"
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Carteira</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.iconBtn}>
            <Text style={styles.iconText}>⚙</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn}>
            <Text style={styles.iconText}>⊣</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Two-column body */}
      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4ade80" />
        }
      >
        {/* ── Left panel: balances + actions ── */}
        <View style={styles.leftPanel}>
          <BalanceRow label="Saldo em conta" value={realBalance} />
          <BalanceRow label="Saldo de bônus" value={bonusBalance} />
          <BalanceRow label="Saldo disponível para saque" value={canWithdraw ? realBalance : 0} />

          <View style={styles.actionsCol}>
            <TouchableOpacity
              style={styles.withdrawBtn}
              onPress={() => {
                if (!canWithdraw) {
                  Alert.alert('Saque bloqueado',
                    rolloverRemaining > 0
                      ? `Complete o rollover de R$ ${rolloverRemaining.toFixed(2)}`
                      : 'Saldo mínimo para saque é R$ 20,00');
                } else {
                  setWithdrawModal(true);
                }
              }}
            >
              <Text style={styles.withdrawBtnText}>Sacar</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.depositBtn} onPress={() => setDepositModal(true)}>
              <LinearGradient
                colors={['#4ade80', '#16a34a']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={styles.depositBtnGrad}
              >
                <Text style={styles.depositBtnText}>+ Depositar</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Right panel: transaction table ── */}
        <View style={styles.rightPanel}>
          <View style={styles.tableTopRow}>
            <Text style={styles.tableTitle}>Histórico de transações</Text>
            <View style={styles.datePill}>
              <Text style={styles.datePillText}>{today} ▾</Text>
            </View>
          </View>

          {/* Table header */}
          <View style={styles.tableHead}>
            <Text style={[styles.thCell, { width: 32 }]}>ID</Text>
            <Text style={[styles.thCell, { width: 80 }]}>Data</Text>
            <Text style={[styles.thCell, { flex: 1 }]}>Tipo</Text>
            <Text style={[styles.thCell, { width: 70 }]}>Valor</Text>
            <Text style={[styles.thCell, { width: 90 }]}>Status</Text>
          </View>

          {/* Table rows */}
          {loadError ? (
            <TouchableOpacity style={styles.errorRow} onPress={() => loadWallet()}>
              <Text style={styles.errorText}>Erro ao carregar. Toque para tentar novamente.</Text>
            </TouchableOpacity>
          ) : transactions.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>Nenhuma transação ainda</Text>
            </View>
          ) : (
            transactions.map((tx, idx) => (
              <View key={tx.id} style={[styles.tableRow, idx % 2 === 1 && styles.tableRowAlt]}>
                <Text style={[styles.tdCell, { width: 32 }]}>{String(idx + 1).padStart(2, '0')}</Text>
                <Text style={[styles.tdCell, { width: 80 }]}>
                  {new Date(tx.created_at).toLocaleDateString('pt-BR')}
                </Text>
                <Text style={[styles.tdCell, { flex: 1 }]}>{TYPE_LABEL[tx.type] ?? tx.type}</Text>
                <Text style={[styles.tdCell, { width: 70, color: tx.amount > 0 ? '#4ade80' : '#f87171', fontWeight: '700' }]}>
                  R${Math.abs(tx.amount)}
                </Text>
                <View style={{ width: 90 }}>
                  <StatusBadge status={tx.status} />
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* ── Deposit modal — matching Deposite.png ── */}
      <Modal visible={depositModal} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.modalCard}>

            {depositStep === 'amount' && (
              <>
                <Text style={styles.modalTitle}>Depositar</Text>
                <Text style={styles.modalSubtitle}>Faça um depósito utilizando o Pix</Text>

                {/* 4 preset buttons in a row */}
                <View style={styles.presetsRow}>
                  {DEPOSIT_PRESETS.map((amt) => (
                    <TouchableOpacity
                      key={amt}
                      style={[styles.presetBtn, !useCustom && depositAmount === amt && styles.presetBtnActive]}
                      onPress={() => { setDepositAmount(amt); setUseCustom(false); }}
                    >
                      <Text style={[styles.presetText, !useCustom && depositAmount === amt && styles.presetTextActive]}>
                        R${amt}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.orText}>ou</Text>

                {/* Custom amount input */}
                <View style={styles.inputWrap}>
                  <TextInput
                    style={styles.input}
                    value={useCustom ? customAmount : ''}
                    onFocus={() => setUseCustom(true)}
                    onChangeText={setCustomAmount}
                    keyboardType="decimal-pad"
                    placeholder="Digite o valor"
                    placeholderTextColor="rgba(255,255,255,0.35)"
                  />
                </View>

                {/* Yellow PIX button */}
                <TouchableOpacity
                  style={[styles.pixBtn, depositLoading && styles.pixBtnLoading]}
                  onPress={handleDeposit}
                  disabled={depositLoading}
                >
                  <Text style={styles.pixBtnText}>
                    {depositLoading ? '⏳ Gerando...' : '⬛ Gerar Código PIX'}
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {depositStep === 'qr' && (
              <View style={styles.qrSection}>
                <Text style={styles.modalTitle}>Depositar</Text>
                <View style={styles.pollingBadge}>
                  <Text style={styles.pollingText}>⏳ Aguardando pagamento...</Text>
                </View>
                <View style={styles.qrWrap}>
                  <QRCode value={qrCode} size={160} color="#000" backgroundColor="#fff" />
                </View>
                <Text style={styles.qrAmount}>R$ {effectiveAmount.toFixed(2)}</Text>
                <TouchableOpacity
                  style={styles.copyBtn}
                  onPress={async () => {
                    await Clipboard.setStringAsync(qrCode);
                    Alert.alert('Copiado!', 'Cole no seu app de banco para pagar');
                  }}
                >
                  <Text style={styles.copyBtnText}>📋 Copiar código PIX (Copia e Cola)</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={closeDepositModal} style={styles.cancelLink}>
                  <Text style={styles.cancelLinkText}>Cancelar</Text>
                </TouchableOpacity>
              </View>
            )}

            {depositStep === 'confirmed' && (
              <Animated.View style={[styles.confirmedSection, { opacity: successAnim }]}>
                <Text style={{ fontSize: 56 }}>🎉</Text>
                <Text style={styles.confirmedTitle}>Depósito confirmado!</Text>
                <Text style={styles.confirmedAmount}>+ R$ {effectiveAmount.toFixed(2)}</Text>
                <TouchableOpacity style={styles.closeConfirmBtn} onPress={closeDepositModal}>
                  <Text style={styles.closeConfirmText}>Fechar</Text>
                </TouchableOpacity>
              </Animated.View>
            )}

            {/* Close X */}
            {depositStep !== 'confirmed' && (
              <TouchableOpacity style={styles.closeX} onPress={closeDepositModal}>
                <Text style={styles.closeXText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Withdraw modal — matching Withdraw.png ── */}
      <Modal visible={withdrawModal} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <TouchableOpacity
              style={styles.closeX}
              onPress={() => { setWithdrawModal(false); setWithdrawAmount(''); setPixKey(''); }}
            >
              <Text style={styles.closeXText}>✕</Text>
            </TouchableOpacity>

            <Text style={styles.modalTitle}>Sacar</Text>
            <Text style={styles.modalSubtitle}>Saque através do Pix</Text>

            {/* Available balance */}
            <Text style={styles.fieldLabel}>Valor disponível para saque</Text>
            <View style={styles.availablePill}>
              <CoinIcon />
              <Text style={styles.availablePillText}>{realBalance.toLocaleString('pt-BR')}</Text>
            </View>
            <Text style={styles.minNote}>Saque mínimo: R$ 20</Text>

            {/* Amount */}
            <Text style={styles.fieldLabel}>Valor do saque</Text>
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.input}
                value={withdrawAmount}
                onChangeText={setWithdrawAmount}
                keyboardType="decimal-pad"
                placeholder="Enter amount"
                placeholderTextColor="rgba(255,255,255,0.35)"
              />
            </View>

            {/* PIX key */}
            <Text style={styles.fieldLabel}>Chave Pix</Text>
            <Text style={styles.pixKeyNote}>Salvo: {pixKey || '—'} (Chave aleatória)</Text>
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.input}
                value={pixKey}
                onChangeText={setPixKey}
                placeholder="Pix key"
                placeholderTextColor="rgba(255,255,255,0.35)"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {/* Submit */}
            <TouchableOpacity
              style={[styles.submitBtn, withdrawLoading && styles.submitBtnLoading]}
              onPress={handleWithdraw}
              disabled={withdrawLoading}
            >
              <Text style={styles.submitBtnText}>
                {withdrawLoading ? 'Solicitando...' : 'Pedir Saque'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ImageBackground>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const LIME = '#4ade80';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a1f0a' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(74,222,128,0.15)',
  },
  headerTitle: { fontSize: fonts.sizes.xxl, fontWeight: '800', color: '#fff' },
  headerRight: { flexDirection: 'row', gap: spacing.sm },
  iconBtn: {
    width: 34, height: 34, borderRadius: radius.sm,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  iconText: { color: '#fff', fontSize: 16 },

  // Body
  body: {
    flexDirection: 'row',
    padding: spacing.lg,
    gap: spacing.lg,
    flexGrow: 1,
    alignItems: 'flex-start',
  },

  // Left panel
  leftPanel: {
    width: 260,
    backgroundColor: 'rgba(8, 20, 8, 0.90)',
    borderWidth: 1,
    borderColor: 'rgba(74,222,128,0.28)',
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  actionsCol: { gap: spacing.sm, marginTop: spacing.lg },
  withdrawBtn: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  withdrawBtnText: { color: '#fff', fontWeight: '600', fontSize: fonts.sizes.sm },
  depositBtn: { borderRadius: radius.md, overflow: 'hidden' },
  depositBtnGrad: { paddingVertical: 12, alignItems: 'center' },
  depositBtnText: { color: '#000', fontWeight: '700', fontSize: fonts.sizes.sm },

  // Right panel
  rightPanel: {
    flex: 1,
    backgroundColor: 'rgba(8, 20, 8, 0.90)',
    borderWidth: 1,
    borderColor: 'rgba(74,222,128,0.28)',
    borderRadius: radius.xl,
    padding: spacing.lg,
  },
  tableTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  tableTitle: { color: '#fff', fontWeight: '700', fontSize: fonts.sizes.md },
  datePill: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: radius.full,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  datePillText: { color: '#fff', fontSize: fonts.sizes.xs },

  // Table
  tableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    paddingBottom: spacing.sm,
    marginBottom: spacing.xs,
  },
  thCell: { color: 'rgba(255,255,255,0.5)', fontSize: fonts.sizes.xs, fontWeight: '600' },

  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  tableRowAlt: { backgroundColor: 'rgba(255,255,255,0.03)' },
  tdCell: { color: '#fff', fontSize: fonts.sizes.xs },

  errorRow: { padding: spacing.md, alignItems: 'center' },
  errorText: { color: colors.error, fontSize: fonts.sizes.sm },
  emptyState: { padding: spacing.xl, alignItems: 'center' },
  emptyText: { color: 'rgba(255,255,255,0.4)', fontSize: fonts.sizes.sm },

  // Modals overlay
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCard: {
    width: 360,
    backgroundColor: 'rgba(8, 20, 8, 0.97)',
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(74,222,128,0.35)',
    ...shadows.card,
  },
  closeX: { position: 'absolute', top: spacing.md, right: spacing.md, zIndex: 10 },
  closeXText: { color: 'rgba(255,255,255,0.5)', fontSize: 18, fontWeight: '700' },

  modalTitle: {
    fontSize: fonts.sizes.xl,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: fonts.sizes.sm,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    marginTop: -spacing.xs,
  },

  // Deposit: presets
  presetsRow: { flexDirection: 'row', gap: spacing.sm },
  presetBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
  },
  presetBtnActive: { backgroundColor: LIME, borderColor: LIME },
  presetText: { color: '#fff', fontWeight: '600', fontSize: fonts.sizes.sm },
  presetTextActive: { color: '#000' },

  orText: {
    textAlign: 'center',
    color: 'rgba(255,255,255,0.4)',
    fontSize: fonts.sizes.sm,
  },

  // Input
  inputWrap: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  input: {
    color: '#fff',
    fontSize: fonts.sizes.sm,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
  },

  // Yellow PIX button
  pixBtn: {
    backgroundColor: '#fbbf24',
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  pixBtnLoading: { opacity: 0.7 },
  pixBtnText: { color: '#000', fontWeight: '700', fontSize: fonts.sizes.md },

  // QR section
  qrSection: { alignItems: 'center', gap: spacing.md },
  pollingBadge: {
    backgroundColor: '#ca8a0433',
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.xs,
  },
  pollingText: { color: '#fbbf24', fontWeight: '600', fontSize: fonts.sizes.sm },
  qrWrap: { backgroundColor: '#fff', padding: spacing.md, borderRadius: radius.lg, ...shadows.card },
  qrAmount: { fontSize: fonts.sizes.xxl, fontWeight: '800', color: LIME },
  copyBtn: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  copyBtnText: { color: '#fff', fontWeight: '600', fontSize: fonts.sizes.sm },
  cancelLink: { marginTop: -spacing.xs },
  cancelLinkText: { color: 'rgba(255,255,255,0.4)', fontSize: fonts.sizes.sm },

  // Confirmed
  confirmedSection: { alignItems: 'center', gap: spacing.md },
  confirmedTitle: { color: '#fff', fontWeight: '800', fontSize: fonts.sizes.xl },
  confirmedAmount: { color: LIME, fontWeight: '800', fontSize: fonts.sizes.xxxl },
  closeConfirmBtn: {
    backgroundColor: LIME, borderRadius: radius.md,
    paddingVertical: 12, paddingHorizontal: 48, marginTop: spacing.sm,
  },
  closeConfirmText: { color: '#000', fontWeight: '700', fontSize: fonts.sizes.md },

  // Withdraw
  fieldLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: fonts.sizes.xs,
    fontWeight: '600',
    marginBottom: -spacing.xs,
  },
  availablePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: '#fbbf24',
    borderRadius: radius.full,
    paddingHorizontal: 14, paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  availablePillText: { color: '#000', fontWeight: '800', fontSize: fonts.sizes.sm },
  minNote: { color: 'rgba(255,255,255,0.4)', fontSize: fonts.sizes.xs, marginTop: -spacing.xs },
  pixKeyNote: { color: 'rgba(255,255,255,0.4)', fontSize: fonts.sizes.xs, marginTop: -spacing.xs },
  submitBtn: {
    backgroundColor: LIME, borderRadius: radius.md,
    paddingVertical: 14, alignItems: 'center', marginTop: spacing.xs,
  },
  submitBtnLoading: { opacity: 0.7 },
  submitBtnText: { color: '#000', fontWeight: '700', fontSize: fonts.sizes.md },
});
