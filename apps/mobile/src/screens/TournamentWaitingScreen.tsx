import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Platform, Animated, Pressable, Image,
} from 'react-native';
import { BlurModal } from '../components/BlurModal';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, fonts, radius, shadows } from '../theme';
import { ScreenBackground } from '../components/ScreenBackground';
import { IconTrophy, IconSettings, IconX } from '../components/Icons';
import { GradientToggle } from './HomeScreen';
import { connectSocket } from '../services/socket';
import { api } from '../services/api';
import Constants from 'expo-constants';
import { useTournamentStore } from '../store/tournament.store';
import { toast } from '../store/toast.store';

const isExpoGo = Constants.appOwnership === 'expo';

type NotificationsModule = typeof import('expo-notifications');
const Notifications: NotificationsModule | null = isExpoGo
  ? null
  : (require('expo-notifications') as NotificationsModule);

// ─── Push notification setup ─────────────────────────────────────────────────

if (Notifications) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

async function scheduleTournamentNotification(startsAt: Date, tournamentName: string) {
  try {
    const msToStart = startsAt.getTime() - Date.now();
    if (msToStart <= 0) return;
    const notifyBeforeMs = 10_000;
    const triggerMs = Math.max(1_000, msToStart - notifyBeforeMs);

    if (Platform.OS === 'web') {
      const WebNotification = (globalThis as any)?.Notification;
      if (!WebNotification) return;
      if (WebNotification.permission !== 'granted') return;
      setTimeout(() => {
        try {
          if ((globalThis as any)?.Notification?.permission !== 'granted') return;
          new (globalThis as any).Notification('Torneio vai começar!', {
            body: `${tournamentName} começa em instantes. Entre agora!`,
          });
        } catch {}
      }, triggerMs);
      return;
    }

    if (!Notifications) return;
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '🏆 Torneio vai começar!',
        body: `${tournamentName} começa em instantes. Entre agora!`,
        sound: true,
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: Math.floor(triggerMs / 1000), repeats: false },
    });
  } catch {}
}

// ─── Round label helper ───────────────────────────────────────────────────────

function roundLabel(round: number, totalRounds: number): string {
  const fromEnd = totalRounds - round;
  if (fromEnd === 0) return 'Final';
  if (fromEnd === 1) return 'Semifinal';
  if (fromEnd === 2) return 'Quartas de final';
  return `Rodada ${round}`;
}

// ─── Countdown hook ───────────────────────────────────────────────────────────

function useCountdown(targetDate: Date | null) {
  const [remaining, setRemaining] = useState<number>(0);

  useEffect(() => {
    if (!targetDate) return;
    const tick = () => setRemaining(Math.max(0, targetDate.getTime() - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetDate]);

  const h = Math.floor(remaining / 3_600_000);
  const m = Math.floor((remaining % 3_600_000) / 60_000);
  const s = Math.floor((remaining % 60_000) / 1_000);

  return { remaining, h, m, s };
}

// ─── Screen ───────────────────────────────────────────────────────────────────

type Props = {
  navigation: NativeStackNavigationProp<any>;
  route: { params: { tournamentId: string; tournamentName: string; startsAt: string; entryFee: number } };
};

export function TournamentWaitingScreen({ navigation, route }: Props) {
  const { tournamentId, tournamentName, startsAt, entryFee } = route.params;
  const startsAtDate = new Date(startsAt);
  const { remaining, h, m, s } = useCountdown(startsAtDate);
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const [cancelledMessage, setCancelledMessage] = useState<string | null>(null);
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [musicOn, setMusicOn] = useState(true);

  const setActiveTournament = useTournamentStore((st) => st.setActiveTournament);
  const setNotificationsEnabled = useTournamentStore((st) => st.setNotificationsEnabled);
  const clearActiveTournament = useTournamentStore((st) => st.clearActiveTournament);

  // Pulse animation for trophy icon
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  useEffect(() => {
    setActiveTournament({ tournamentId, tournamentName, startsAt, entryFee });
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const WebNotification = (globalThis as any)?.Notification;
    if (WebNotification?.permission === 'granted') {
      setNotifEnabled(true);
      setNotificationsEnabled(true);
    }
  }, []);

  const enableNotifications = useCallback(async () => {
    if (notifEnabled) return;
    if (Platform.OS === 'web') {
      const WebNotification = (globalThis as any)?.Notification;
      if (!WebNotification) {
        toast.warning('Notificações não suportadas neste navegador.');
        return;
      }
      try {
        const permission: any =
          WebNotification.permission === 'default'
            ? await WebNotification.requestPermission()
            : WebNotification.permission;
        if (permission !== 'granted') {
          toast.warning('Permissão de notificação não concedida.');
          return;
        }
      } catch {
        toast.warning('Não foi possível pedir permissão de notificação.');
        return;
      }
    }

    await scheduleTournamentNotification(startsAtDate, tournamentName);
    await setNotificationsEnabled(true);
    setNotifEnabled(true);
    toast.success('Notificação ativada.');
  }, [notifEnabled, startsAt, tournamentName]);

  // Socket listeners for tournament events
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const socket = await connectSocket();

        socket.on('tournament:started', (data: { tournamentId: string; gameId: string; round: number; totalRounds: number }) => {
          if (!mounted || data.tournamentId !== tournamentId) return;
          clearActiveTournament();
          navigation.replace('Game', { gameId: data.gameId });
        });

        socket.on('tournament:cancelled', (data: { tournamentId: string; refundAmount: number; reason: string }) => {
          if (!mounted || data.tournamentId !== tournamentId) return;
          setCancelledMessage(`Torneio cancelado — ${data.reason}. R$ ${data.refundAmount.toFixed(2)} reembolsado.`);
          clearActiveTournament();
        });

        socket.on('tournament:next_game', (data: { tournamentId: string; gameId: string; round: number; totalRounds: number }) => {
          if (!mounted || data.tournamentId !== tournamentId) return;
          clearActiveTournament();
          navigation.replace('Game', { gameId: data.gameId });
        });
      } catch {}
    })();

    return () => {
      mounted = false;
      connectSocket().then((s) => {
        s.off('tournament:started');
        s.off('tournament:cancelled');
        s.off('tournament:next_game');
      }).catch(() => {});
    };
  }, [tournamentId]);

  const trophyScale = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] });
  const trophyOpacity = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] });

  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <ScreenBackground style={styles.bg}>
      <SafeAreaView style={styles.safe} edges={[]}>
        <View style={styles.topBar}>
          <View style={{ flex: 1 }} />
          <TouchableOpacity style={styles.gearBtn} onPress={() => setSettingsVisible(true)} accessibilityLabel="Configurações">
            <IconSettings size={22} color="#fff" accessibilityLabel="Configurações" />
          </TouchableOpacity>
        </View>
        <View style={styles.centered}>

          {/* Trophy */}
          <Animated.View style={{ transform: [{ scale: trophyScale }], opacity: trophyOpacity, marginBottom: spacing.lg }}>
            <View style={styles.trophyCircle}>
              <IconTrophy size={40} color="#fbbf24" accessibilityLabel="Torneio" />
            </View>
          </Animated.View>

          {/* Title */}
          <Text style={styles.title}>{tournamentName}</Text>
          <View style={styles.statusPill}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>Esperando o torneio começar</Text>
          </View>

          {/* Countdown */}
          <LinearGradient
            colors={['rgba(187,255,0,0.12)', 'rgba(0,0,0,0.45)', 'rgba(28,187,61,0.10)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.countdownCard}
          >
            {cancelledMessage ? (
              <Text style={styles.cancelledText}>{cancelledMessage}</Text>
            ) : remaining === 0 ? (
              <Text style={styles.countdownLabel}>Iniciando partida...</Text>
            ) : (
              <>
                <Text style={styles.countdownLabel}>Começa em</Text>
                <Text style={styles.countdown}>
                  {h > 0 ? `${pad(h)}:` : ''}{pad(m)}:{pad(s)}
                </Text>
              </>
            )}

            <View style={styles.infoRow}>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Entrada paga</Text>
                <Text style={styles.infoValue}>R$ {entryFee.toFixed(2)}</Text>
              </View>
              <View style={styles.infoDivider} />
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Notificação</Text>
                <Text style={[styles.infoValue, { color: notifEnabled ? '#1CBB3D' : 'rgba(255,255,255,0.75)' }]}>
                  {notifEnabled ? 'Ativa' : 'Desativada'}
                </Text>
              </View>
            </View>
          </LinearGradient>

          {!cancelledMessage && !notifEnabled && (
            <TouchableOpacity style={styles.notifyBtn} onPress={enableNotifications} activeOpacity={0.85}>
              <Text style={styles.notifyBtnText}>Ativar notificação</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.leaveBtn}
            onPress={async () => {
              try {
                await api.post(`/game/tournaments/${tournamentId}/leave`);
              } catch {
                toast.warning('Não foi possível sair do torneio.');
                return;
              }
              await clearActiveTournament();
              toast.success('Você saiu do torneio.');
              navigation.replace('ModeSelect', { mode: 'TORNEIO' });
            }}
            activeOpacity={0.85}
          >
            <Text style={styles.leaveBtnText}>Sair do torneio</Text>
          </TouchableOpacity>

          {/* Back button */}
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.replace('ModeSelect', { mode: 'TORNEIO' })}
            activeOpacity={0.85}
          >
            <Text style={styles.backBtnText}>Voltar para a sala</Text>
          </TouchableOpacity>

          {cancelledMessage && (
            <TouchableOpacity
              style={styles.goHomeBtn}
              onPress={() => navigation.replace('Main')}
              activeOpacity={0.85}
            >
              <Text style={styles.goHomeBtnText}>Ir para o início</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Settings modal ── */}
        <BlurModal visible={settingsVisible} transparent animationType="fade">
          <Pressable style={settingsStyles.overlay} onPress={() => setSettingsVisible(false)} testID="settings-overlay">
            <Pressable style={settingsStyles.card} onPress={() => {}} onStartShouldSetResponder={() => true} testID="settings-card">
              <View style={[settingsStyles.textureWrap, (Platform.OS === 'web' ? ({ pointerEvents: 'none' } as any) : null)]}>
                <Image
                  source={require('../../assets/e27c2e8e377e60057010a8431706b96b0152436f.png')}
                  style={settingsStyles.texture}
                  resizeMode="cover"
                />
              </View>
              <View style={settingsStyles.header}>
                <View style={{ width: 26 }} />
                <Text style={settingsStyles.title}>Configurações</Text>
                <TouchableOpacity onPress={() => setSettingsVisible(false)} accessibilityLabel="Fechar configurações">
                  <IconX size={26} color="#fff" accessibilityLabel="Fechar" />
                </TouchableOpacity>
              </View>
              <View style={settingsStyles.row}>
                <Text style={settingsStyles.label}>Som:</Text>
                <GradientToggle value={soundOn} onValueChange={setSoundOn} pressableTestID="settings-sound-toggle" accessibilityLabel="Som" kind="sound" />
              </View>
              <View style={settingsStyles.row}>
                <Text style={settingsStyles.label}>Música:</Text>
                <GradientToggle value={musicOn} onValueChange={setMusicOn} pressableTestID="settings-music-toggle" accessibilityLabel="Música" kind="music" />
              </View>
            </Pressable>
          </Pressable>
        </BlurModal>

      </SafeAreaView>
    </ScreenBackground>
  );
}

const SETTINGS_CARD_PAD = Platform.OS === 'web' ? 24 : 16;
const SETTINGS_ITEM_GAP = Platform.OS === 'web' ? 24 : 16;

const settingsStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center' },
  card: {
    width: Platform.OS === 'web' ? 640 : 520,
    backgroundColor: colors.bgCard,
    borderRadius: radius.xl,
    padding: SETTINGS_CARD_PAD,
    gap: SETTINGS_ITEM_GAP,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#BBFF00',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0px 8px 20px rgba(0,0,0,0.45)' } as any) : shadows.card),
  },
  textureWrap: { ...StyleSheet.absoluteFillObject },
  texture: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.12,
    width: '140%',
    height: '140%',
    top: '-20%' as any,
    left: '-20%' as any,
    ...(Platform.OS === 'web' ? ({ objectFit: 'cover', objectPosition: 'center' } as any) : null),
  } as any,
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: {
    fontSize: fonts.sizes.xxxl,
    fontWeight: '900',
    color: '#fff',
    textAlign: 'center',
    flex: 1,
    fontFamily: Platform.OS === 'web' ? ('Inria Sans' as any) : 'System',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SETTINGS_CARD_PAD,
    paddingVertical: SETTINGS_ITEM_GAP,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  label: {
    fontSize: fonts.sizes.xl,
    color: '#fff',
    fontWeight: '800',
    fontFamily: Platform.OS === 'web' ? ('Inria Sans' as any) : 'System',
  },
});

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#0a1f0a' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  safe: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  gearBtn: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(187,255,0,0.22)',
    alignItems: 'center', justifyContent: 'center',
  },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },

  trophyCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(251,191,36,0.15)',
    borderWidth: 2, borderColor: 'rgba(251,191,36,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },

  title: {
    color: '#fff', fontSize: fonts.sizes.xl, fontWeight: '900',
    textAlign: 'center', marginBottom: spacing.xs,
  },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(28,187,61,0.15)',
    borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 5,
    borderWidth: 1, borderColor: 'rgba(28,187,61,0.3)',
    marginBottom: spacing.lg,
  },
  statusDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: '#1CBB3D',
  },
  statusText: { color: '#1CBB3D', fontSize: fonts.sizes.sm, fontWeight: '700' },

  countdownCard: {
    width: '100%', maxWidth: 300,
    borderRadius: radius.xl, padding: spacing.lg,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', gap: spacing.md,
    marginBottom: spacing.lg,
  },
  countdownLabel: { color: 'rgba(255,255,255,0.7)', fontSize: fonts.sizes.sm, fontWeight: '600' },
  countdown: {
    color: '#fff', fontSize: 44, fontWeight: '900', letterSpacing: 2,
    ...(Platform.OS === 'web' ? ({ fontVariantNumeric: 'tabular-nums' } as any) : null),
  },
  cancelledText: {
    color: '#fca5a5', fontSize: fonts.sizes.md, fontWeight: '700', textAlign: 'center',
  },

  infoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, width: '100%' },
  infoItem: { flex: 1, alignItems: 'center', gap: 4 },
  infoDivider: { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.15)' },
  infoLabel: { color: 'rgba(255,255,255,0.5)', fontSize: fonts.sizes.xs, fontWeight: '600' },
  infoValue: { color: '#fff', fontSize: fonts.sizes.md, fontWeight: '800' },

  notifyBtn: {
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(28,187,61,0.35)',
    paddingVertical: 12,
    paddingHorizontal: spacing.xxl,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginBottom: spacing.md,
  },
  notifyBtnText: { color: '#1CBB3D', fontWeight: '800', fontSize: fonts.sizes.sm },
  leaveBtn: {
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.55)',
    paddingVertical: 12,
    paddingHorizontal: spacing.xxl,
    backgroundColor: 'rgba(239,68,68,0.18)',
    marginBottom: spacing.md,
  },
  leaveBtnText: { color: '#fecaca', fontWeight: '800', fontSize: fonts.sizes.sm },

  backBtn: {
    borderRadius: radius.full, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
    paddingVertical: 14, paddingHorizontal: spacing.xxl,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginBottom: spacing.md,
  },
  backBtnText: { color: '#e2e8f0', fontWeight: '700', fontSize: fonts.sizes.md },

  goHomeBtn: {
    borderRadius: radius.full,
    paddingVertical: 14, paddingHorizontal: spacing.xxl,
    backgroundColor: '#1CBB3D',
  },
  goHomeBtnText: { color: '#052e16', fontWeight: '900', fontSize: fonts.sizes.md },
});
