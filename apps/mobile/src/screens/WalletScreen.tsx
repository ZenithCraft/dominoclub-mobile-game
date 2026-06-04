import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { SettingsModal } from '../components/SettingsModal';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, RefreshControl, Animated, useWindowDimensions, Platform,
} from 'react-native';
import { BlurModal } from '../components/BlurModal';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { colors, spacing, fonts, radius, shadows } from '../theme';
import { ScreenBackground } from '../components/ScreenBackground';
import { IconX, IconHourglass, IconClipboard, IconQrCode, IconCheck, IconChevronLeft, IconChevronRight } from '../components/Icons';
import { Wallet, Star, ArrowUpCircle } from 'lucide-react-native';
import { api } from '../services/api';
import { useAuthStore } from '../store/auth.store';
import { useNavigation } from '@react-navigation/native';
import { GameTopBar } from './HomeScreen';

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

const DEPOSIT_PRESETS = [20, 25, 50, 100];
const POLL_INTERVAL_MS = 3000;
const PAGE_SIZE = 6;

const TYPE_LABEL: Record<string, string> = {
  DEPOSIT: 'Depósito', WITHDRAWAL: 'Saque', BET: 'Aposta',
  WIN: 'Prêmio', BONUS: 'Bônus', REFUND: 'Reembolso', FEE: 'Taxa',
};

const TYPE_COLOR: Record<string, string> = {
  DEPOSIT: '#1CBB3D', WIN: '#1CBB3D', BONUS: '#1CBB3D', REFUND: '#1CBB3D',
  WITHDRAWAL: '#f87171', BET: '#f87171', FEE: '#f87171',
};

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  COMPLETED:  { label: 'Concluído',   color: '#1CBB3D',              bg: 'rgba(28,187,61,0.15)'       },
  PENDING:    { label: 'Pendente',    color: '#fbbf24',              bg: 'rgba(251,191,36,0.15)'      },
  PROCESSING: { label: 'Processando', color: 'rgba(255,255,255,0.7)', bg: 'rgba(255,255,255,0.08)'    },
  FAILED:     { label: 'Falhou',      color: '#f87171',              bg: 'rgba(248,113,113,0.15)'     },
};

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? STATUS_META['PROCESSING'];
  return (
    <View style={[badgeStyles.wrap, { backgroundColor: m.bg }]}>
      <Text style={[badgeStyles.text, { color: m.color }]}>{m.label}</Text>
    </View>
  );
}
const badgeStyles = StyleSheet.create({
  wrap: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  text: { fontSize: 10, fontWeight: '700' },
});

// ─── Balance row ──────────────────────────────────────────────────────────────

function BalanceRow({ label, value, icon, borderColor }: { label: string; value: number; icon: React.ReactNode; borderColor: string }) {
  return (
    <View style={balStyles.row}>
      <Text style={balStyles.rowLabel}>{label}</Text>
      <View style={[balStyles.rowValueWrap, { borderColor, borderWidth: 1 }]}>
        {icon}
        <Text style={balStyles.rowValue}>
          R$ {value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
        </Text>
      </View>
    </View>
  );
}
const balStyles = StyleSheet.create({
  row: { gap: 4 },
  rowLabel: { color: 'rgba(255,255,255,0.55)', fontSize: fonts.sizes.xs, fontWeight: '600' },
  rowValueWrap: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: radius.md, paddingVertical: 8, paddingHorizontal: spacing.md,
  },
  rowValue: { color: '#fff', fontWeight: '800', fontSize: fonts.sizes.md, flex: 1 },
});

// ─── Calendar picker ──────────────────────────────────────────────────────────

const MONTH_NAMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const DAY_HEADERS = ['D','S','T','Q','Q','S','S'];

function CalendarPicker({
  visible, value, onClose, onSelect,
}: {
  visible: boolean;
  value: string | null;
  onClose: () => void;
  onSelect: (date: string | null) => void;
}) {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const [viewYear,  setViewYear]  = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  useEffect(() => {
    if (!visible) return;
    const d = value ? new Date(value + 'T12:00:00') : today;
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }, [visible]);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth    = new Date(viewYear, viewMonth + 1, 0).getDate();
  const daysInPrev     = new Date(viewYear, viewMonth, 0).getDate();

  type Cell = { dateStr: string | null; day: number; cur: boolean };
  const cells: Cell[] = [];
  for (let i = 0; i < firstDayOfWeek; i++)
    cells.push({ dateStr: null, day: daysInPrev - firstDayOfWeek + 1 + i, cur: false });
  for (let d = 1; d <= daysInMonth; d++) {
    const mm = String(viewMonth + 1).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    cells.push({ dateStr: `${viewYear}-${mm}-${dd}`, day: d, cur: true });
  }
  while (cells.length < 42)
    cells.push({ dateStr: null, day: cells.length - firstDayOfWeek - daysInMonth + 1, cur: false });

  return (
    <BlurModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={calStyles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={calStyles.card} activeOpacity={1} onPress={() => {}}>

          {/* ── Header ── */}
          <View style={calStyles.header}>
            <TouchableOpacity style={calStyles.navBtn} onPress={prevMonth} activeOpacity={0.7}>
              <IconChevronLeft size={18} color="#fff" />
            </TouchableOpacity>
            <Text style={calStyles.monthTitle}>{MONTH_NAMES[viewMonth]} {viewYear}</Text>
            <TouchableOpacity style={calStyles.navBtn} onPress={nextMonth} activeOpacity={0.7}>
              <IconChevronRight size={18} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* ── Day headers ── */}
          <View style={calStyles.weekRow}>
            {DAY_HEADERS.map((d, i) => (
              <Text key={i} style={calStyles.dayHeader}>{d}</Text>
            ))}
          </View>

          {/* ── Grid ── */}
          <View style={calStyles.grid}>
            {cells.map((cell, i) => {
              const isSelected = cell.dateStr === value;
              const isToday    = cell.dateStr === todayStr;
              return (
                <TouchableOpacity
                  key={i}
                  style={calStyles.cell}
                  onPress={() => cell.cur && cell.dateStr && onSelect(cell.dateStr)}
                  activeOpacity={cell.cur ? 0.7 : 1}
                >
                  {isSelected && (
                    <LinearGradient
                      colors={['#BEF311', '#1CBB3D']}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                      style={calStyles.selectedBg}
                    />
                  )}
                  {isToday && !isSelected && <View style={calStyles.todayRing} />}
                  <Text style={[
                    calStyles.cellText,
                    !cell.cur   && calStyles.cellTextOther,
                    isToday  && !isSelected && calStyles.cellTextToday,
                    isSelected && calStyles.cellTextSelected,
                  ]}>
                    {cell.day}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── Footer ── */}
          <View style={calStyles.footer}>
            <TouchableOpacity onPress={() => { onSelect(null); onClose(); }} activeOpacity={0.8}>
              <Text style={calStyles.footerClear}>Limpar</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { onSelect(todayStr); onClose(); }} activeOpacity={0.8}>
              <Text style={calStyles.footerToday}>Hoje</Text>
            </TouchableOpacity>
          </View>

        </TouchableOpacity>
      </TouchableOpacity>
    </BlurModal>
  );
}

const calStyles = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: {
    width: 300,
    backgroundColor: '#0d2e10',
    borderRadius: radius.xl,
    borderWidth: 1, borderColor: 'rgba(28,187,61,0.3)',
    padding: spacing.lg,
    gap: spacing.md,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navBtn: {
    width: 32, height: 32, borderRadius: radius.sm,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  monthTitle: { color: '#fff', fontWeight: '700', fontSize: fonts.sizes.md },
  weekRow: { flexDirection: 'row' },
  dayHeader: {
    flex: 1, textAlign: 'center',
    color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '700',
    paddingBottom: 4,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: `${100 / 7}%` as any,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  selectedBg: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
    margin: 2,
  },
  todayRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
    margin: 2,
    borderWidth: 1.5,
    borderColor: '#1CBB3D',
  },
  cellText: { color: '#fff', fontSize: fonts.sizes.sm, fontWeight: '600' },
  cellTextOther:    { color: 'rgba(255,255,255,0.2)' },
  cellTextToday:    { color: '#1CBB3D', fontWeight: '800' },
  cellTextSelected: { color: '#0a1f0a', fontWeight: '900' },
  footer: {
    flexDirection: 'row', justifyContent: 'space-between',
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)',
    paddingTop: spacing.md,
  },
  footerClear: { color: '#1CBB3D', fontWeight: '700', fontSize: fonts.sizes.sm },
  footerToday: { color: '#BEF311', fontWeight: '700', fontSize: fonts.sizes.sm },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export function WalletScreen() {
  const { user, refreshUser } = useAuthStore();
  const navigation = useNavigation<any>();
  const { width: wW } = useWindowDimensions();
  const isWide = wW >= 700;
  const dateColW = isWide ? 110 : 72;
  const statusColW = isWide ? 110 : 86;

  const [transactions, setTransactions]   = useState<Transaction[]>([]);
  const [refreshing, setRefreshing]       = useState(false);
  const [loadError, setLoadError]         = useState(false);

  const [depositModal, setDepositModal]   = useState(false);
  const [depositStep, setDepositStep]     = useState<DepositStep>('amount');
  const [depositAmount, setDepositAmount] = useState(20);
  const [customAmount, setCustomAmount]   = useState('');
  const [useCustom, setUseCustom]         = useState(false);
  const [qrCode, setQrCode]               = useState('');
  const [depositLoading, setDepositLoading] = useState(false);
  const [couponCode, setCouponCode]       = useState('');

  const [withdrawModal, setWithdrawModal]   = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [pixKey, setPixKey]               = useState('');
  const [withdrawLoading, setWithdrawLoading] = useState(false);

  const [kycStatus, setKycStatus]     = useState<string | null>(null);
  const [kycChecked, setKycChecked]   = useState(false);
  const [firstWithdrawalDone, setFirstWithdrawalDone] = useState(false);

  const pollRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const successAnim = useRef(new Animated.Value(0)).current;

  const realBalance        = Number(user?.wallet?.real_balance ?? 0);
  const bonusBalance       = Number(user?.wallet?.bonus_balance ?? 0);
  const rolloverRemaining  = Number(user?.wallet?.rollover_remaining ?? 0);
  const canWithdraw        = rolloverRemaining === 0 && realBalance >= 20;

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const todayISO = new Date().toISOString().slice(0, 10);
  const [page, setPage] = useState(0);
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);

  const formatDateBR = (iso?: string | null) => {
    if (!iso) return new Date().toLocaleDateString('pt-BR');
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  };

  const filteredTransactions = useMemo(() => {
    if (!selectedDate) return transactions;
    return transactions.filter(t => new Date(t.created_at).toISOString().slice(0,10) === selectedDate);
  }, [transactions, selectedDate]);

  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / PAGE_SIZE));
  const pagedTransactions = filteredTransactions.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  useEffect(() => { setPage(0); }, [selectedDate, transactions]);

  const openDatePicker = () => setCalendarVisible(true);

  // ── Data ────────────────────────────────────────────────────────────────────

  const loadWallet = useCallback(async (silent = false) => {
    if (!silent) setLoadError(false);
    try {
      const { data } = await api.get('/wallet');
      setTransactions(data.transactions || []);
      await refreshUser();
    } catch (err: any) {
      if (err?.response?.status === 401) {
        await useAuthStore.getState().logout();
        navigation.replace('Login');
        return;
      }
      if (!silent) setLoadError(true);
    }
  }, [navigation, refreshUser]);

  useEffect(() => { loadWallet(); }, []);

  useEffect(() => {
    api.get('/kyc/status').then(({ data }) => {
      setKycStatus(data.kyc_document_status ?? null);
      setFirstWithdrawalDone(data.first_withdrawal_done ?? false);
      setKycChecked(true);
    }).catch(() => setKycChecked(true));
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadWallet();
    setRefreshing(false);
  }, [loadWallet]);

  // ── Polling ─────────────────────────────────────────────────────────────────

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
      } catch { /* silent */ }
    }, POLL_INTERVAL_MS);
  }, [successAnim, loadWallet, stopPolling]);

  useEffect(() => () => stopPolling(), []);

  // ── Deposit ─────────────────────────────────────────────────────────────────

  const effectiveAmount = useCustom ? (parseFloat(customAmount) || 0) : depositAmount;

  const handleDeposit = async () => {
    if (effectiveAmount < 20) { Alert.alert('Valor inválido', 'O depósito mínimo é R$ 20,00'); return; }
    setDepositLoading(true);
    try {
      const code = couponCode.trim();
      const { data } = await api.post('/wallet/deposit', { amount: effectiveAmount, couponCode: code || undefined });
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
    setUseCustom(false);
    setCustomAmount('');
    setCouponCode('');
    loadWallet(true);
  }, [stopPolling, loadWallet]);

  // ── Withdraw ─────────────────────────────────────────────────────────────────

  const handleWithdraw = async () => {
    const amount = parseFloat(withdrawAmount.replace(',', '.'));
    if (!amount || amount < 20)  { Alert.alert('Valor inválido', 'O saque mínimo é R$ 20,00'); return; }
    if (amount > realBalance)    { Alert.alert('Saldo insuficiente', `Seu saldo é R$ ${realBalance.toFixed(2)}`); return; }
    if (!pixKey.trim())          { Alert.alert('Chave PIX obrigatória', 'Informe sua chave PIX'); return; }
    setWithdrawLoading(true);
    try {
      await api.post('/wallet/withdraw', { amount, pixKey: pixKey.trim() });
      Alert.alert('Saque solicitado!', 'Você receberá o valor na sua chave PIX em instantes.');
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

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <ScreenBackground style={styles.root}>
      <SafeAreaView style={styles.safe}>

        <GameTopBar
          user={user}
          onWallet={() => {}}
          onSettings={() => setSettingsVisible(true)}
          onExit={() => navigation.navigate('Main')}
          onProfile={() => navigation.navigate('Main', { openModal: 'profile' })}
          exitVariant="back"
        />

        <ScrollView
          contentContainerStyle={[styles.body, isWide && styles.bodyWide]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1CBB3D" />}
        >
          {/* ── Balance panel ── */}
          <View style={[styles.leftPanel, isWide && styles.leftPanelWide]}>

            <View style={styles.balanceCard}>
              <BalanceRow label="Saldo em conta"              value={realBalance}                   icon={<Wallet size={18} color="#1CBB3D" />}              borderColor="rgba(28,187,61,0.4)" />
              <View style={styles.balanceDivider} />
              <BalanceRow label="Saldo de bônus"              value={bonusBalance}                  icon={<Star size={18} color="#facc15" />}                borderColor="rgba(250,204,21,0.4)" />
              <View style={styles.balanceDivider} />
              <BalanceRow label="Saldo disponível para saque" value={canWithdraw ? realBalance : 0} icon={<ArrowUpCircle size={18} color="rgba(255,255,255,0.6)" />} borderColor="rgba(255,255,255,0.2)" />
            </View>

            {rolloverRemaining > 0 && (
              <View style={styles.rolloverBanner}>
                <Text style={styles.rolloverText}>
                  Rollover pendente:{' '}
                  <Text style={{ color: '#fbbf24', fontWeight: '800' }}>R$ {rolloverRemaining.toFixed(2)}</Text>
                </Text>
              </View>
            )}

            {kycChecked && (kycStatus === 'APPROVED' || firstWithdrawalDone) && (
              <View style={styles.actionsCol}>
                <TouchableOpacity
                  style={styles.withdrawBtn}
                  activeOpacity={0.85}
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
                  <LinearGradient colors={['#BEF311', '#1CBB3D']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.btnGrad}>
                    <Text style={styles.withdrawBtnText}>Sacar</Text>
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity style={styles.depositBtn} activeOpacity={0.85} onPress={() => setDepositModal(true)}>
                  <LinearGradient colors={['#06b6d4', '#0284c7']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.btnGrad}>
                    <Text style={styles.depositBtnText}>+ Depositar</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            )}

            {kycChecked && !firstWithdrawalDone && kycStatus !== 'APPROVED' && (
              <View style={styles.kycBanner}>
                <Text style={styles.kycBannerText}>
                  {kycStatus === 'PENDING'
                    ? 'Documentos em análise. Aguarde até 48 horas.'
                    : kycStatus === 'REJECTED'
                    ? 'Documentos rejeitados. Envie novamente para liberar o saque.'
                    : 'Verifique sua identidade para liberar saques.'}
                </Text>
                {kycStatus !== 'PENDING' && (
                  <TouchableOpacity style={styles.kycBannerBtn} onPress={() => navigation.navigate('KYC')}>
                    <Text style={styles.kycBannerBtnText}>Verificar Conta</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>

          {/* ── Transactions panel ── */}
          <View style={styles.rightPanel}>
            <View style={styles.tableTopRow}>
              <Text style={styles.tableTitle}>Histórico de transações</Text>
              <TouchableOpacity style={styles.datePill} onPress={openDatePicker} activeOpacity={0.85}>
                <Text style={styles.datePillText}>{formatDateBR(selectedDate ?? todayISO)} ▾</Text>
              </TouchableOpacity>
            </View>

            {/* Table head */}
            <View style={styles.tableHead}>
              <Text style={[styles.thCell, styles.thDate]}>Data</Text>
              <Text style={[styles.thCell, styles.thType]}>Tipo</Text>
              <Text style={[styles.thCell, styles.thValue]}>Valor</Text>
              <Text style={[styles.thCell, styles.thStatus]}>Status</Text>
            </View>

            <View style={{ flex: 1 }}>
              {loadError ? (
                <TouchableOpacity style={styles.emptyState} onPress={() => loadWallet()}>
                  <Text style={{ color: colors.error, fontSize: fonts.sizes.sm, textAlign: 'center' }}>
                    Erro ao carregar. Toque para tentar novamente.
                  </Text>
                </TouchableOpacity>
              ) : filteredTransactions.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>Nenhuma transação encontrada.</Text>
                </View>
              ) : (
                pagedTransactions.map((tx, idx) => (
                  <View key={tx.id} style={[styles.tableRow, idx % 2 === 1 && styles.tableRowAlt]}>
                    <Text style={[styles.tdCell, styles.thDate]}>
                      {new Date(tx.created_at).toLocaleDateString('pt-BR')}
                    </Text>
                    <Text style={[styles.tdCell, styles.thType]}>{TYPE_LABEL[tx.type] ?? tx.type}</Text>
                    <Text style={[styles.tdCell, styles.thValue, { color: tx.amount > 0 ? '#1CBB3D' : '#f87171', fontWeight: '700' }]}>
                      {tx.amount > 0 ? '+' : ''}R$ {Math.abs(tx.amount).toFixed(2)}
                    </Text>
                    <View style={[styles.thStatus, { alignItems: 'center' }]}>
                      <StatusBadge status={tx.status} />
                    </View>
                  </View>
                ))
              )}
            </View>

            {totalPages > 1 && (
              <View style={styles.pagination}>
                <TouchableOpacity
                  style={[styles.pageBtn, page === 0 && styles.pageBtnDisabled]}
                  onPress={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.pageBtnText, page === 0 && styles.pageBtnTextDisabled]}>‹</Text>
                </TouchableOpacity>

                <View style={styles.pageInfo}>
                  <Text style={styles.pageInfoText}>{page + 1} / {totalPages}</Text>
                </View>

                <TouchableOpacity
                  style={[styles.pageBtn, page >= totalPages - 1 && styles.pageBtnDisabled]}
                  onPress={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.pageBtnText, page >= totalPages - 1 && styles.pageBtnTextDisabled]}>›</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </ScrollView>

        <CalendarPicker
          visible={calendarVisible}
          value={selectedDate}
          onClose={() => setCalendarVisible(false)}
          onSelect={(d) => { setSelectedDate(d); setCalendarVisible(false); }}
        />

        {/* ── Deposit modal ── */}
        <BlurModal visible={depositModal} transparent animationType="fade">
          <View style={styles.overlay}>
            <View style={styles.modalCard}>

              {depositStep === 'amount' && (
                <>
                  <Text style={styles.modalTitle}>Depositar</Text>
                  <Text style={styles.modalSubtitle}>Faça um depósito utilizando o Pix</Text>

                  <View style={styles.presetsRow}>
                    {DEPOSIT_PRESETS.map((amt) => (
                      <TouchableOpacity
                        key={amt}
                        style={[styles.presetBtn, !useCustom && depositAmount === amt && styles.presetBtnActive]}
                        onPress={() => { setDepositAmount(amt); setUseCustom(false); }}
                      >
                        {!useCustom && depositAmount === amt ? (
                          <LinearGradient colors={['#BEF311','#1CBB3D']} start={{x:0,y:0}} end={{x:1,y:1}} style={StyleSheet.absoluteFillObject} />
                        ) : null}
                        <Text style={[styles.presetText, !useCustom && depositAmount === amt && styles.presetTextActive]}>
                          R${amt}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.orText}>ou insira um valor</Text>

                  <View style={styles.inputWrap}>
                    <TextInput
                      style={styles.input}
                      value={useCustom ? customAmount : ''}
                      onFocus={() => setUseCustom(true)}
                      onChangeText={setCustomAmount}
                      keyboardType="decimal-pad"
                      placeholder="Digite o valor (mín. R$ 20)"
                      placeholderTextColor="rgba(255,255,255,0.35)"
                    />
                  </View>

                  <Text style={styles.fieldLabel}>Cupom (opcional)</Text>
                  <View style={styles.inputWrap}>
                    <TextInput
                      style={styles.input}
                      value={couponCode}
                      onChangeText={setCouponCode}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      placeholder="Ex: BEMVINDO20"
                      placeholderTextColor="rgba(255,255,255,0.35)"
                    />
                  </View>

                  <TouchableOpacity
                    style={[styles.gradBtn, (depositLoading || effectiveAmount < 20) && { opacity: 0.5 }]}
                    onPress={handleDeposit}
                    disabled={depositLoading || effectiveAmount < 20}
                  >
                    <LinearGradient colors={['#BEF311','#1CBB3D']} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.gradBtnInner}>
                      <IconQrCode size={16} color="#0a1f0a" />
                      <Text style={styles.gradBtnText}>{depositLoading ? 'Gerando...' : 'Gerar Código PIX'}</Text>
                    </LinearGradient>
                  </TouchableOpacity>

                  {useCustom && effectiveAmount < 20 && (
                    <Text style={styles.hintText}>Depósito mínimo: R$ 20,00</Text>
                  )}
                </>
              )}

              {depositStep === 'qr' && (
                <View style={styles.qrSection}>
                  <Text style={styles.modalTitle}>Aguardando pagamento</Text>
                  <View style={styles.pollingBadge}>
                    <IconHourglass size={14} color="#fbbf24" />
                    <Text style={styles.pollingText}>Escaneie o QR Code para pagar</Text>
                  </View>
                  <View style={styles.qrWrap}>
                    <QRCode value={qrCode} size={160} color="#000" backgroundColor="#fff" />
                  </View>
                  <Text style={styles.qrAmount}>R$ {effectiveAmount.toFixed(2)}</Text>
                  <TouchableOpacity
                    style={styles.gradBtn}
                    onPress={async () => {
                      await Clipboard.setStringAsync(qrCode);
                      Alert.alert('Copiado!', 'Cole no seu app de banco para pagar');
                    }}
                  >
                    <LinearGradient colors={['#BEF311','#1CBB3D']} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.gradBtnInner}>
                      <IconClipboard size={16} color="#0a1f0a" />
                      <Text style={styles.gradBtnText}>Copiar código PIX</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={closeDepositModal} style={styles.cancelLink}>
                    <Text style={styles.cancelLinkText}>Cancelar</Text>
                  </TouchableOpacity>
                </View>
              )}

              {depositStep === 'confirmed' && (
                <Animated.View style={[styles.confirmedSection, { opacity: successAnim }]}>
                  <View style={styles.confirmedIcon}>
                    <LinearGradient colors={['#BEF311','#1CBB3D']} start={{x:0,y:0}} end={{x:1,y:1}} style={StyleSheet.absoluteFillObject} />
                    <IconCheck size={28} color="#0a1f0a" />
                  </View>
                  <Text style={styles.confirmedTitle}>Depósito confirmado!</Text>
                  <Text style={styles.confirmedAmount}>+ R$ {effectiveAmount.toFixed(2)}</Text>
                  <TouchableOpacity style={styles.gradBtn} onPress={closeDepositModal}>
                    <LinearGradient colors={['#BEF311','#1CBB3D']} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.gradBtnInner}>
                      <Text style={styles.gradBtnText}>Fechar</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>
              )}

              {depositStep !== 'confirmed' && (
                <TouchableOpacity style={styles.closeX} onPress={closeDepositModal}>
                  <IconX size={16} color="rgba(255,255,255,0.6)" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </BlurModal>

        {/* ── Withdraw modal ── */}
        <BlurModal visible={withdrawModal} transparent animationType="fade">
          <View style={styles.overlay}>
            <View style={styles.modalCard}>
              <TouchableOpacity
                style={styles.closeX}
                onPress={() => { setWithdrawModal(false); setWithdrawAmount(''); setPixKey(''); }}
              >
                <IconX size={16} color="rgba(255,255,255,0.6)" />
              </TouchableOpacity>

              <Text style={styles.modalTitle}>Solicitar Saque</Text>
              <Text style={styles.modalSubtitle}>Saque via Pix em instantes</Text>

              <View style={styles.availableRow}>
                <Text style={styles.availableLabel}>Disponível para saque</Text>
                <Text style={styles.availableValue}>R$ {realBalance.toFixed(2)}</Text>
              </View>

              <Text style={styles.fieldLabel}>Valor do saque</Text>
              <View style={styles.inputWrap}>
                <TextInput
                  style={styles.input}
                  value={withdrawAmount}
                  onChangeText={setWithdrawAmount}
                  keyboardType="decimal-pad"
                  placeholder="Digite o valor (mín. R$ 20)"
                  placeholderTextColor="rgba(255,255,255,0.35)"
                />
              </View>

              <Text style={styles.fieldLabel}>Chave Pix</Text>
              <View style={styles.inputWrap}>
                <TextInput
                  style={styles.input}
                  value={pixKey}
                  onChangeText={setPixKey}
                  placeholder="CPF, e-mail, telefone ou chave aleatória"
                  placeholderTextColor="rgba(255,255,255,0.35)"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <TouchableOpacity
                style={[styles.gradBtn, withdrawLoading && { opacity: 0.6 }]}
                onPress={handleWithdraw}
                disabled={withdrawLoading}
              >
                <LinearGradient colors={['#BEF311','#1CBB3D']} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.gradBtnInner}>
                  <Text style={styles.gradBtnText}>{withdrawLoading ? 'Solicitando...' : 'Confirmar Saque'}</Text>
                </LinearGradient>
              </TouchableOpacity>

              <Text style={styles.hintText}>Saque mínimo: R$ 20,00 · Processado em instantes</Text>
            </View>
          </View>
        </BlurModal>
        <SettingsModal visible={settingsVisible} onClose={() => setSettingsVisible(false)} />
      </SafeAreaView>
    </ScreenBackground>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a1f0a' },
  safe: { flex: 1 },

  body:     { padding: spacing.lg, gap: spacing.lg, flexGrow: 1 },
  bodyWide: { flexDirection: 'row', alignItems: 'stretch' },

  // ── Left panel ──
  leftPanel:     { gap: spacing.md },
  leftPanelWide: { width: 260 },

  balanceCard: {
    backgroundColor: 'rgba(15,40,15,0.95)',
    borderRadius: radius.xl, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: spacing.lg, gap: spacing.md,
  },
  balanceDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)' },

  rolloverBanner: {
    backgroundColor: 'rgba(251,191,36,0.1)',
    borderWidth: 1, borderColor: 'rgba(251,191,36,0.3)',
    borderRadius: radius.md, padding: spacing.md,
  },
  rolloverText: { color: 'rgba(255,255,255,0.7)', fontSize: fonts.sizes.xs },

  actionsCol:   { gap: spacing.sm },
  withdrawBtn:  { borderRadius: radius.md, overflow: 'hidden' },
  depositBtn:   { borderRadius: radius.md, overflow: 'hidden' },
  btnGrad:      { paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  withdrawBtnText: {
    color: '#fff', fontWeight: '800', fontSize: fonts.sizes.md,
    textShadowColor: '#053d09', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 6,
  },
  depositBtnText: {
    color: '#fff', fontWeight: '800', fontSize: fonts.sizes.md,
    textShadowColor: '#03364f', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 6,
  },

  kycBanner: {
    backgroundColor: 'rgba(250,204,21,0.1)',
    borderWidth: 1, borderColor: 'rgba(250,204,21,0.3)',
    borderRadius: radius.md, padding: spacing.md, gap: spacing.sm,
  },
  kycBannerText: { color: '#fde68a', fontSize: fonts.sizes.xs, fontWeight: '600' },
  kycBannerBtn: {
    backgroundColor: '#facc15', borderRadius: radius.sm,
    paddingVertical: 8, alignItems: 'center',
  },
  kycBannerBtnText: { color: '#000', fontWeight: '700', fontSize: fonts.sizes.sm },

  // ── Right panel ──
  rightPanel: {
    flex: 1,
    backgroundColor: 'rgba(15,40,15,0.95)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: radius.xl, padding: spacing.lg,
    justifyContent: 'space-between',
  },
  tableTopRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: spacing.md,
  },
  tableTitle: { color: '#fff', fontWeight: '700', fontSize: fonts.sizes.sm },
  datePill: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  datePillText: { color: 'rgba(255,255,255,0.7)', fontSize: fonts.sizes.xs, fontWeight: '600' },

  tableHead: {
    flexDirection: 'row', alignItems: 'center',
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)',
    paddingBottom: spacing.sm, marginBottom: 2,
  },
  thCell:   { color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: '700', textAlign: 'center' },
  tableRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  tableRowAlt: { backgroundColor: 'rgba(255,255,255,0.02)' },
  tdCell: { color: '#fff', fontSize: fonts.sizes.xs, textAlign: 'center' },
  thDate:   { flex: 1 },
  thType:   { flex: 1 },
  thValue:  { flex: 1 },
  thStatus: { flex: 1 },

  emptyState: { paddingVertical: spacing.xl, alignItems: 'center' },
  emptyText:  { color: 'rgba(255,255,255,0.35)', fontSize: fonts.sizes.sm },

  pagination: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingTop: spacing.md, gap: spacing.sm,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)',
    marginTop: spacing.sm,
  },
  pageBtn: {
    width: 32, height: 32, borderRadius: radius.sm,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(28,187,61,0.15)',
    borderWidth: 1, borderColor: 'rgba(28,187,61,0.3)',
  },
  pageBtnDisabled: { backgroundColor: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)' },
  pageBtnText: { color: '#1CBB3D', fontWeight: '800', fontSize: 18, lineHeight: 22 },
  pageBtnTextDisabled: { color: 'rgba(255,255,255,0.2)' },
  pageInfo: {
    paddingHorizontal: spacing.md, paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: radius.sm, minWidth: 60, alignItems: 'center',
  },
  pageInfoText: { color: 'rgba(255,255,255,0.6)', fontSize: fonts.sizes.xs, fontWeight: '700' },

  // ── Modals ──
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    width: '100%', maxWidth: 360,
    backgroundColor: 'rgba(10,20,10,0.98)',
    borderRadius: radius.xl, padding: spacing.xl,
    gap: spacing.md,
    borderWidth: 1, borderColor: 'rgba(28,187,61,0.25)',
    ...shadows.card,
  },
  closeX: { position: 'absolute', top: spacing.md, right: spacing.md, zIndex: 10, padding: 4 },

  modalTitle:    { fontSize: fonts.sizes.xl, fontWeight: '800', color: '#fff', textAlign: 'center' },
  modalSubtitle: { fontSize: fonts.sizes.sm, color: 'rgba(255,255,255,0.45)', textAlign: 'center', marginTop: -spacing.xs },

  presetsRow: { flexDirection: 'row', gap: spacing.sm },
  presetBtn: {
    flex: 1, paddingVertical: 10, borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', overflow: 'hidden',
  },
  presetBtnActive: { borderColor: '#1CBB3D' },
  presetText:      { color: '#fff', fontWeight: '600', fontSize: fonts.sizes.sm },
  presetTextActive: { color: '#0a1f0a', fontWeight: '800' },

  orText: { textAlign: 'center', color: 'rgba(255,255,255,0.35)', fontSize: fonts.sizes.xs },

  fieldLabel: { color: 'rgba(255,255,255,0.6)', fontSize: fonts.sizes.xs, fontWeight: '600', marginBottom: -spacing.xs },

  inputWrap: {
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.05)',
  },
  input: {
    color: '#fff', fontSize: fonts.sizes.sm,
    paddingVertical: 12, paddingHorizontal: spacing.md,
  },

  gradBtn:      { borderRadius: radius.md, overflow: 'hidden' },
  gradBtnInner: { paddingVertical: 13, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 },
  gradBtnText:  { color: '#0a1f0a', fontWeight: '800', fontSize: fonts.sizes.md },

  hintText: { color: 'rgba(255,255,255,0.35)', fontSize: fonts.sizes.xs, textAlign: 'center', marginTop: -spacing.xs },

  qrSection: { alignItems: 'center', gap: spacing.md },
  pollingBadge: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: 'rgba(251,191,36,0.12)',
    borderRadius: radius.full, paddingHorizontal: spacing.lg, paddingVertical: 6,
    borderWidth: 1, borderColor: 'rgba(251,191,36,0.3)',
  },
  pollingText:  { color: '#fbbf24', fontWeight: '600', fontSize: fonts.sizes.sm },
  qrWrap:       { backgroundColor: '#fff', padding: spacing.md, borderRadius: radius.lg, ...shadows.card },
  qrAmount:     { color: '#1CBB3D', fontSize: fonts.sizes.xxl, fontWeight: '900' },
  cancelLink:   { marginTop: -spacing.xs },
  cancelLinkText: { color: 'rgba(255,255,255,0.35)', fontSize: fonts.sizes.sm, textAlign: 'center' },

  confirmedSection: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  confirmedIcon: {
    width: 56, height: 56, borderRadius: 28,
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
  },
  confirmedTitle:  { color: '#fff', fontWeight: '800', fontSize: fonts.sizes.xl },
  confirmedAmount: { color: '#1CBB3D', fontWeight: '900', fontSize: fonts.sizes.xxxl },

  availableRow: {
    backgroundColor: 'rgba(28,187,61,0.08)',
    borderWidth: 1, borderColor: 'rgba(28,187,61,0.2)',
    borderRadius: radius.md, padding: spacing.md,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  availableLabel: { color: 'rgba(255,255,255,0.6)', fontSize: fonts.sizes.xs, fontWeight: '600' },
  availableValue: { color: '#1CBB3D', fontWeight: '900', fontSize: fonts.sizes.lg },
});
