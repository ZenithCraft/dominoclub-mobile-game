import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { SettingsModal } from '../components/SettingsModal';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Pressable,
  TextInput, Alert, RefreshControl, Animated, Dimensions, Platform,
} from 'react-native';
import { BlurModal } from '../components/BlurModal';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { colors, spacing, fonts, radius, shadows } from '../theme';
import { isTablet } from '../theme/responsive';
import { ScreenBackground } from '../components/ScreenBackground';
import { IconX, IconHourglass, IconClipboard, IconQrCode, IconCheck, IconChevronLeft, IconChevronRight } from '../components/Icons';
import { Wallet, Star, ArrowUpCircle } from 'lucide-react-native';
import Svg, { Circle, Line, Path, G } from 'react-native-svg';
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
  DEPOSIT: 'Depósito', WITHDRAWAL: 'Saque', BET: 'Entrada',
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

// ─── Info icon (SVG) ─────────────────────────────────────────────────────────

function WithdrawInfoIcon({ size = 20, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="10" stroke={color} strokeWidth="1.8" />
      <Line x1="12" y1="8" x2="12" y2="8" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
      <Line x1="12" y1="12" x2="12" y2="16" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </Svg>
  );
}

type BulletIconType = 'clock' | 'key' | 'coin' | 'refresh' | 'shield';
function WithdrawBulletIcon({ type, size = 13 }: { type: BulletIconType; size?: number }) {
  const c = 'rgba(28,187,61,0.9)';
  const s = size;
  if (type === 'clock') return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none" style={{ marginTop: 2 }}>
      <Circle cx="12" cy="12" r="10" stroke={c} strokeWidth="2" />
      <Path d="M12 7v5l3 3" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
  if (type === 'key') return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none" style={{ marginTop: 2 }}>
      <Circle cx="8" cy="9" r="5" stroke={c} strokeWidth="2" />
      <Path d="M13 14l7-7" stroke={c} strokeWidth="2" strokeLinecap="round" />
      <Path d="M18 13l2-2" stroke={c} strokeWidth="2" strokeLinecap="round" />
      <Path d="M20 15l2-2" stroke={c} strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
  if (type === 'coin') return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none" style={{ marginTop: 2 }}>
      <Circle cx="12" cy="12" r="10" stroke={c} strokeWidth="2" />
      <Path d="M12 7v1m0 8v1M9 12c0-1.66 1.34-3 3-3s3 1.34 3 3-1.34 3-3 3" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
    </Svg>
  );
  if (type === 'refresh') return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none" style={{ marginTop: 2 }}>
      <Path d="M2 12C2 6.477 6.477 2 12 2c3.5 0 6.572 1.756 8.418 4.418" stroke={c} strokeWidth="2" strokeLinecap="round" />
      <Path d="M22 12c0 5.523-4.477 10-10 10-3.5 0-6.572-1.756-8.418-4.418" stroke={c} strokeWidth="2" strokeLinecap="round" />
      <Path d="M18 2l2.418 4.418L16 6" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none" style={{ marginTop: 2 }}>
      <Path d="M12 2l3 7h7l-6 4.5 2.3 7L12 17l-6.3 3.5L8 13.5 2 9h7z" stroke={c} strokeWidth="1.8" strokeLinejoin="round" />
    </Svg>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function WalletScreen() {
  const { user, refreshUser } = useAuthStore();
  const navigation = useNavigation<any>();
  // Use physical screen width so that minimize/restore transients don't flip layout.
  const [stableW, setStableW] = useState(() => Dimensions.get('screen').width);
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ screen: s }) => setStableW(s.width));
    return () => sub.remove();
  }, []);
  const isWide = stableW >= 700;
  const isTabletLocal = stableW >= 768;
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
  const [couponState, setCouponState]     = useState<'idle' | 'validating' | 'valid' | 'not_found' | 'used'>('idle');
  const [couponValidating, setCouponValidating] = useState(false);

  const [withdrawModal, setWithdrawModal]     = useState(false);
  const [withdrawStep, setWithdrawStep]       = useState<'form' | 'submitted'>('form');
  const [withdrawAmount, setWithdrawAmount]   = useState('');
  const [pixKey, setPixKey]                   = useState('');
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [withdrawInfoVisible, setWithdrawInfoVisible] = useState(false);
  const withdrawSuccessAnim = useRef(new Animated.Value(0)).current;

  const [rolloverModal, setRolloverModal] = useState(false);

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
    setCouponState('idle');
    loadWallet(true);
  }, [stopPolling, loadWallet]);

  const handleCouponChange = (text: string) => {
    setCouponCode(text);
    setCouponState('idle');
  };

  const handleValidateCoupon = async () => {
    const code = couponCode.trim();
    if (!code) return;
    setCouponValidating(true);
    try {
      const { data } = await api.get(`/wallet/coupon/validate?code=${encodeURIComponent(code)}`);
      setCouponState(data.status);
    } catch {
      setCouponState('not_found');
    } finally {
      setCouponValidating(false);
    }
  };

  // ── Withdraw ─────────────────────────────────────────────────────────────────

  const closeWithdrawModal = useCallback(() => {
    setWithdrawModal(false);
    setWithdrawStep('form');
    setWithdrawAmount('');
    setPixKey('');
    setWithdrawInfoVisible(false);
    withdrawSuccessAnim.setValue(0);
    loadWallet(true);
  }, [loadWallet, withdrawSuccessAnim]);

  const handleWithdraw = async () => {
    const amount = parseFloat(withdrawAmount.replace(',', '.'));
    if (!amount || amount < 20)  { Alert.alert('Valor inválido', 'O saque mínimo é R$ 20,00'); return; }
    if (amount > realBalance)    { Alert.alert('Saldo insuficiente', `Seu saldo é R$ ${realBalance.toFixed(2)}`); return; }
    if (!pixKey.trim())          { Alert.alert('Chave PIX obrigatória', 'Informe sua chave PIX'); return; }
    setWithdrawLoading(true);
    try {
      await api.post('/wallet/withdraw', { amount, pixKey: pixKey.trim() });
      setWithdrawStep('submitted');
      Animated.sequence([
        Animated.timing(withdrawSuccessAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(withdrawSuccessAnim, { toValue: 0.85, duration: 180, useNativeDriver: true }),
        Animated.timing(withdrawSuccessAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start();
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
      <SafeAreaView style={styles.safe} edges={[]}>

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
              <TouchableOpacity style={styles.rolloverBanner} activeOpacity={0.8} onPress={() => setRolloverModal(true)}>
                <View style={styles.rolloverBannerRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rolloverText}>
                      Rollover pendente:{' '}
                      <Text style={{ color: '#fbbf24', fontWeight: '800' }}>R$ {rolloverRemaining.toFixed(2)}</Text>
                    </Text>
                    <Text style={styles.rolloverSubText}>Toque para entender como funciona</Text>
                  </View>
                  <Svg width={22} height={22} viewBox="0 0 24 24">
                    <Circle cx="12" cy="12" r="10" stroke="#fbbf24" strokeWidth="1.8" fill="none" />
                    <Line x1="12" y1="11" x2="12" y2="17" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" />
                    <Circle cx="12" cy="7.5" r="1.2" fill="#fbbf24" />
                  </Svg>
                </View>
              </TouchableOpacity>
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
              {(['Data', 'Tipo', 'Valor', 'Status'] as const).map(label => (
                <Text key={label} style={[styles.thCell, label === 'Data' ? styles.thDate : label === 'Tipo' ? styles.thType : label === 'Valor' ? styles.thValue : styles.thStatus, isTabletLocal && { fontSize: 14, paddingVertical: 4 }]}>{label}</Text>
              ))}
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
                  <View key={tx.id} style={[styles.tableRow, idx % 2 === 1 && styles.tableRowAlt, isTabletLocal && { paddingVertical: 14 }]}>
                    <Text style={[styles.tdCell, styles.thDate, isTabletLocal && { fontSize: fonts.sizes.sm }]}>
                      {new Date(tx.created_at).toLocaleDateString('pt-BR')}
                    </Text>
                    <Text style={[styles.tdCell, styles.thType, isTabletLocal && { fontSize: fonts.sizes.sm }]}>{TYPE_LABEL[tx.type] ?? tx.type}</Text>
                    <Text style={[styles.tdCell, styles.thValue, { color: tx.amount > 0 ? '#1CBB3D' : '#f87171', fontWeight: '700' }, isTabletLocal && { fontSize: fonts.sizes.sm }]}>
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
          <Pressable style={styles.overlay} onPress={closeDepositModal}>
            <Pressable style={styles.modalCard} onPress={() => {}} onStartShouldSetResponder={() => true}>

              {depositStep === 'amount' && (
                <ScrollView
                  style={styles.qrScroll}
                  contentContainerStyle={styles.amountSection}
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                  keyboardShouldPersistTaps="handled"
                >
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
                  <View style={styles.couponRow}>
                    <View style={[styles.inputWrap, { flex: 1 }]}>
                      <TextInput
                        style={styles.input}
                        value={couponCode}
                        onChangeText={handleCouponChange}
                        autoCapitalize="characters"
                        autoCorrect={false}
                        placeholder="Ex: BEMVINDO20"
                        placeholderTextColor="rgba(255,255,255,0.35)"
                      />
                    </View>
                    {couponCode.trim().length > 0 && couponState !== 'valid' && (
                      <TouchableOpacity
                        style={[styles.couponValidateBtn, couponValidating && { opacity: 0.6 }]}
                        onPress={handleValidateCoupon}
                        disabled={couponValidating}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.couponValidateBtnText}>
                          {couponValidating ? '...' : 'Validar'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {couponState === 'valid' && (
                    <View style={[styles.couponBadge, styles.couponBadgeValid]}>
                      <IconCheck size={13} color="#1CBB3D" />
                      <Text style={[styles.couponBadgeText, { color: '#1CBB3D' }]}>Cupom aprovado</Text>
                    </View>
                  )}
                  {couponState === 'not_found' && (
                    <View style={[styles.couponBadge, styles.couponBadgeError]}>
                      <IconX size={13} color="#f87171" />
                      <Text style={[styles.couponBadgeText, { color: '#f87171' }]}>Cupom inexistente</Text>
                    </View>
                  )}
                  {couponState === 'used' && (
                    <View style={[styles.couponBadge, styles.couponBadgeWarning]}>
                      <IconX size={13} color="#fbbf24" />
                      <Text style={[styles.couponBadgeText, { color: '#fbbf24' }]}>Cupom já utilizado</Text>
                    </View>
                  )}

                  <TouchableOpacity
                    style={[styles.gradBtn, (depositLoading || effectiveAmount < 20 || (couponCode.trim().length > 0 && couponState !== 'valid')) && { opacity: 0.5 }]}
                    onPress={handleDeposit}
                    disabled={depositLoading || effectiveAmount < 20 || (couponCode.trim().length > 0 && couponState !== 'valid')}
                  >
                    <LinearGradient colors={['#BEF311','#1CBB3D']} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.gradBtnInner}>
                      <IconQrCode size={16} color="#0a1f0a" />
                      <Text style={styles.gradBtnText}>{depositLoading ? 'Gerando...' : 'Gerar Código PIX'}</Text>
                    </LinearGradient>
                  </TouchableOpacity>

                  {useCustom && effectiveAmount < 20 && (
                    <Text style={styles.hintText}>Depósito mínimo: R$ 20,00</Text>
                  )}
                </ScrollView>
              )}

              {depositStep === 'qr' && (
                <ScrollView
                  style={styles.qrScroll}
                  contentContainerStyle={styles.qrSection}
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                >
                  <Text style={styles.modalTitle}>Aguardando pagamento</Text>
                  <View style={styles.pollingBadge}>
                    <IconHourglass size={14} color="#fbbf24" />
                    <Text style={styles.pollingText}>Escaneie o QR Code para pagar</Text>
                  </View>
                  <View style={styles.qrWrap}>
                    <QRCode value={qrCode} size={140} color="#000" backgroundColor="#fff" />
                  </View>
                  <Text style={styles.qrAmount}>R$ {effectiveAmount.toFixed(2)}</Text>
                  <TouchableOpacity
                    style={[styles.gradBtn, { alignSelf: 'stretch' }]}
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
                  <TouchableOpacity onPress={closeDepositModal} style={[styles.gradBtn, styles.cancelBtn, { alignSelf: 'stretch' }]}>
                    <View style={styles.cancelBtnInner}>
                      <Text style={styles.cancelBtnText}>Cancelar</Text>
                    </View>
                  </TouchableOpacity>
                </ScrollView>
              )}

              {depositStep === 'confirmed' && (
                <Animated.View style={[styles.confirmedSection, { opacity: successAnim }]}>
                  <View style={styles.confirmedIcon}>
                    <LinearGradient colors={['#BEF311','#1CBB3D']} start={{x:0,y:0}} end={{x:1,y:1}} style={StyleSheet.absoluteFillObject} />
                    <IconCheck size={28} color="#0a1f0a" />
                  </View>
                  <Text style={styles.confirmedTitle}>Depósito confirmado!</Text>
                  <Text style={styles.confirmedAmount}>+ R$ {effectiveAmount.toFixed(2)}</Text>
                  <TouchableOpacity style={[styles.gradBtn, { alignSelf: 'stretch' }]} onPress={closeDepositModal}>
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
            </Pressable>
          </Pressable>
        </BlurModal>

        {/* ── Rollover info modal ── */}
        <BlurModal visible={rolloverModal} transparent animationType="fade">
          <View style={styles.overlay}>
            <View style={[styles.modalCard, { gap: 0, padding: 0 }]}>
              <TouchableOpacity style={styles.closeX} onPress={() => setRolloverModal(false)}>
                <IconX size={16} color="rgba(255,255,255,0.6)" />
              </TouchableOpacity>

              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ padding: spacing.xl, gap: spacing.md }}
                keyboardShouldPersistTaps="handled"
              >
                <View style={styles.rolloverModalHeader}>
                  <Svg width={isTablet ? 54 : 38} height={isTablet ? 54 : 38} viewBox="0 0 24 24">
                    <Circle cx="12" cy="12" r="10" stroke="#fbbf24" strokeWidth="1.6" fill="rgba(251,191,36,0.12)" />
                    <Line x1="12" y1="11" x2="12" y2="17" stroke="#fbbf24" strokeWidth="2.2" strokeLinecap="round" />
                    <Circle cx="12" cy="7.5" r="1.3" fill="#fbbf24" />
                  </Svg>
                  <Text style={styles.rolloverModalTitle}>O que é Rollover?</Text>
                </View>

                <View style={styles.rolloverAmountBox}>
                  <Text style={styles.rolloverAmountLabel}>Valor pendente</Text>
                  <Text style={styles.rolloverAmountValue}>R$ {rolloverRemaining.toFixed(2)}</Text>
                </View>

                <View style={styles.rolloverInfoList}>
                  <View style={styles.rolloverInfoItem}>
                    <Text style={styles.rolloverInfoDot}>•</Text>
                    <Text style={styles.rolloverInfoText}>
                      O rollover é um requisito de apostas aplicado ao <Text style={{ color: '#fbbf24' }}>bônus recebido</Text>. Você precisa apostá-lo antes de sacar.
                    </Text>
                  </View>
                  <View style={styles.rolloverInfoItem}>
                    <Text style={styles.rolloverInfoDot}>•</Text>
                    <Text style={styles.rolloverInfoText}>
                      Cada partida jogada abate o valor apostado do seu rollover restante.
                    </Text>
                  </View>
                  <View style={styles.rolloverInfoItem}>
                    <Text style={styles.rolloverInfoDot}>•</Text>
                    <Text style={styles.rolloverInfoText}>
                      Quando o rollover chegar a <Text style={{ color: '#4ade80' }}>R$ 0,00</Text>, o saque será liberado automaticamente.
                    </Text>
                  </View>
                  <View style={styles.rolloverInfoItem}>
                    <Text style={styles.rolloverInfoDot}>•</Text>
                    <Text style={styles.rolloverInfoText}>
                      Partidas canceladas ou encerradas antes do fim <Text style={{ color: 'rgba(255,255,255,0.5)' }}>não contam</Text>.
                    </Text>
                  </View>
                </View>

                <TouchableOpacity style={styles.rolloverModalBtn} onPress={() => setRolloverModal(false)}>
                  <LinearGradient colors={['#fbbf24', '#f59e0b']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.rolloverModalBtnGrad}>
                    <Text style={styles.rolloverModalBtnText}>Entendido</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </BlurModal>

        {/* ── Withdraw modal ── */}
        <BlurModal visible={withdrawModal} transparent animationType="fade">
          <Pressable style={styles.overlay} onPress={closeWithdrawModal}>
            <Pressable style={styles.modalCard} onPress={() => {}} onStartShouldSetResponder={() => true}>

              {withdrawStep === 'form' && (
                <ScrollView
                  style={styles.qrScroll}
                  contentContainerStyle={styles.amountSection}
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                  keyboardShouldPersistTaps="handled"
                >
                  {/* Title row — title centered, info button absolute-right */}
                  <View style={styles.withdrawTitleRow}>
                    <Text style={styles.modalTitle}>Solicitar Saque</Text>
                    <TouchableOpacity
                      style={styles.withdrawInfoBtn}
                      onPress={() => setWithdrawInfoVisible(v => !v)}
                      activeOpacity={0.75}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <WithdrawInfoIcon
                        size={isTablet ? 26 : 20}
                        color={withdrawInfoVisible ? '#1CBB3D' : 'rgba(255,255,255,0.55)'}
                      />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.modalSubtitle}>Saque via Pix em instantes</Text>

                  {/* Info panel */}
                  {withdrawInfoVisible && (
                    <View style={styles.withdrawInfoPanel}>
                      <Text style={styles.withdrawInfoTitle}>Como funciona o saque?</Text>
                      {([
                        { icon: 'clock',   text: 'Processado em instantes após a solicitação' },
                        { icon: 'key',     text: 'O valor é enviado para a chave Pix informada' },
                        { icon: 'coin',    text: 'Saque mínimo de R$ 20,00' },
                        { icon: 'refresh', text: 'Rollover pendente bloqueia o saque — finalize-o jogando primeiro' },
                        { icon: 'shield',  text: 'Apenas saques via Pix são aceitos no momento' },
                      ] as const).map(({ icon, text }, i) => (
                        <View key={i} style={styles.withdrawInfoItem}>
                          <WithdrawBulletIcon type={icon} size={isTablet ? 16 : 13} />
                          <Text style={styles.withdrawInfoText}>{text}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Available balance */}
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
                </ScrollView>
              )}

              {withdrawStep === 'submitted' && (
                <Animated.View style={[styles.confirmedSection, { opacity: withdrawSuccessAnim }]}>
                  <View style={[styles.confirmedIcon, styles.withdrawConfirmedIcon]}>
                    <LinearGradient colors={['#facc15','#f59e0b']} start={{x:0,y:0}} end={{x:1,y:1}} style={StyleSheet.absoluteFillObject} />
                    <IconCheck size={28} color="#1a0a00" />
                  </View>
                  <Text style={styles.confirmedTitle}>Saque solicitado!</Text>
                  <Text style={[styles.confirmedAmount, styles.withdrawConfirmedAmount]}>
                    − R$ {parseFloat(withdrawAmount.replace(',', '.')).toFixed(2)}
                  </Text>
                  <View style={styles.withdrawSubmittedInfo}>
                    <Text style={styles.withdrawSubmittedText}>
                      O valor será transferido para sua chave Pix em instantes.
                    </Text>
                  </View>
                  <TouchableOpacity style={[styles.gradBtn, { alignSelf: 'stretch' }]} onPress={closeWithdrawModal}>
                    <LinearGradient colors={['#BEF311','#1CBB3D']} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.gradBtnInner}>
                      <Text style={styles.gradBtnText}>Fechar</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>
              )}

              {withdrawStep !== 'submitted' && (
                <TouchableOpacity style={styles.closeX} onPress={closeWithdrawModal}>
                  <IconX size={16} color="rgba(255,255,255,0.6)" />
                </TouchableOpacity>
              )}
            </Pressable>
          </Pressable>
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
  rolloverBannerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rolloverText: { color: 'rgba(255,255,255,0.7)', fontSize: fonts.sizes.xs },
  rolloverSubText: { color: 'rgba(251,191,36,0.6)', fontSize: fonts.sizes.xs - 1, marginTop: 2 },

  rolloverModalHeader: { alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  rolloverModalTitle: { color: '#fbbf24', fontWeight: '800', fontSize: isTablet ? fonts.sizes.xl : fonts.sizes.lg, textAlign: 'center' },
  rolloverAmountBox: {
    backgroundColor: 'rgba(251,191,36,0.08)', borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.25)', borderRadius: radius.md,
    paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
    alignItems: 'center', marginBottom: spacing.md,
  },
  rolloverAmountLabel: { color: 'rgba(255,255,255,0.5)', fontSize: isTablet ? fonts.sizes.sm : fonts.sizes.xs, marginBottom: 2 },
  rolloverAmountValue: { color: '#fbbf24', fontWeight: '800', fontSize: isTablet ? fonts.sizes.xxxl : fonts.sizes.xxl },
  rolloverInfoList: { gap: spacing.sm, marginBottom: spacing.lg },
  rolloverInfoItem: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  rolloverInfoDot: { color: '#fbbf24', fontWeight: '700', fontSize: fonts.sizes.sm, lineHeight: 20 },
  rolloverInfoText: { color: 'rgba(255,255,255,0.7)', fontSize: isTablet ? fonts.sizes.md : fonts.sizes.sm, flex: 1, lineHeight: isTablet ? 26 : 20 },
  rolloverModalBtn: { borderRadius: radius.md, overflow: 'hidden' },
  rolloverModalBtnGrad: { paddingVertical: 13, alignItems: 'center' },
  rolloverModalBtnText: { color: '#000', fontWeight: '800', fontSize: isTablet ? fonts.sizes.lg : fonts.sizes.md },

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
  thCell:   { color: 'rgba(255,255,255,0.45)', fontSize: isTablet ? 13 : 10, fontWeight: '700', textAlign: 'center' },
  tableRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: isTablet ? 13 : 9,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  tableRowAlt: { backgroundColor: 'rgba(255,255,255,0.02)' },
  tdCell: { color: '#fff', fontSize: isTablet ? fonts.sizes.sm : fonts.sizes.xs, textAlign: 'center' },
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
    width: '100%', maxWidth: isTablet ? 680 : 360,
    maxHeight: '90%',
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

  couponRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  couponValidateBtn: {
    backgroundColor: 'rgba(28,187,61,0.15)',
    borderWidth: 1, borderColor: 'rgba(28,187,61,0.4)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: 12,
  },
  couponValidateBtnText: { color: '#1CBB3D', fontWeight: '700', fontSize: fonts.sizes.sm },
  couponBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 6,
    marginTop: -spacing.xs,
  },
  couponBadgeValid:   { backgroundColor: 'rgba(28,187,61,0.10)',  borderWidth: 1, borderColor: 'rgba(28,187,61,0.25)'  },
  couponBadgeError:   { backgroundColor: 'rgba(248,113,113,0.10)', borderWidth: 1, borderColor: 'rgba(248,113,113,0.25)' },
  couponBadgeWarning: { backgroundColor: 'rgba(251,191,36,0.10)',  borderWidth: 1, borderColor: 'rgba(251,191,36,0.25)'  },
  couponBadgeText: { fontSize: fonts.sizes.xs, fontWeight: '700' },

  qrScroll: { flexGrow: 0 },
  amountSection: { gap: spacing.md, paddingBottom: spacing.sm },
  qrSection: { alignItems: 'center', gap: spacing.md, paddingBottom: spacing.sm },
  pollingBadge: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: 'rgba(251,191,36,0.12)',
    borderRadius: radius.full, paddingHorizontal: spacing.lg, paddingVertical: 6,
    borderWidth: 1, borderColor: 'rgba(251,191,36,0.3)',
  },
  pollingText:  { color: '#fbbf24', fontWeight: '600', fontSize: fonts.sizes.sm },
  qrWrap:       { backgroundColor: '#fff', padding: spacing.md, borderRadius: radius.lg, ...shadows.card },
  qrAmount:     { color: '#1CBB3D', fontSize: fonts.sizes.xxl, fontWeight: '900' },
  cancelBtn:       { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  cancelBtnInner:  { paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  cancelBtnText:   { color: 'rgba(255,255,255,0.6)', fontWeight: '700', fontSize: fonts.sizes.md },

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

  // ── Withdraw modal ──
  withdrawTitleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  withdrawInfoBtn: {
    position: 'absolute', right: 0,
    width: isTablet ? 40 : 32, height: isTablet ? 40 : 32,
    borderRadius: isTablet ? 20 : 16,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  withdrawInfoPanel: {
    backgroundColor: 'rgba(28,187,61,0.06)',
    borderRadius: radius.md,
    borderWidth: 1, borderColor: 'rgba(28,187,61,0.18)',
    padding: isTablet ? spacing.lg : spacing.md,
    gap: isTablet ? spacing.md : spacing.sm,
  },
  withdrawInfoTitle: {
    color: '#1CBB3D', fontWeight: '800', fontSize: isTablet ? fonts.sizes.md : fonts.sizes.sm,
    marginBottom: 2,
  },
  withdrawInfoItem: { flexDirection: 'row', alignItems: 'flex-start', gap: isTablet ? 10 : spacing.sm },
  withdrawInfoBullet: { fontSize: isTablet ? fonts.sizes.md : fonts.sizes.sm, lineHeight: 20, width: isTablet ? 26 : 22 },
  withdrawInfoText: {
    color: 'rgba(255,255,255,0.75)', fontSize: isTablet ? fonts.sizes.sm : fonts.sizes.xs,
    fontWeight: '500', flex: 1, lineHeight: isTablet ? 22 : 18,
  },
  withdrawConfirmedIcon: { backgroundColor: 'transparent' },
  withdrawConfirmedAmount: { color: '#fbbf24' },
  withdrawSubmittedInfo: {
    backgroundColor: 'rgba(251,191,36,0.08)',
    borderWidth: 1, borderColor: 'rgba(251,191,36,0.2)',
    borderRadius: radius.md, padding: spacing.md,
    alignSelf: 'stretch',
  },
  withdrawSubmittedText: {
    color: 'rgba(255,255,255,0.6)', fontSize: fonts.sizes.xs,
    fontWeight: '500', textAlign: 'center', lineHeight: 18,
  },
});
