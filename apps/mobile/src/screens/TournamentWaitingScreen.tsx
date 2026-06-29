import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Platform, Animated, Pressable, Image, useWindowDimensions,
} from 'react-native';
import { BlurModal } from '../components/BlurModal';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, fonts, radius, shadows } from '../theme';
import { isTablet } from '../theme/responsive';
import { ScreenBackground } from '../components/ScreenBackground';
import { IconSettings, IconX } from '../components/Icons';
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

// ─── Countdown hook ───────────────────────────────────────────────────────────

function useCountdown(targetDate: Date) {
  const [remaining, setRemaining] = useState<number>(() => Math.max(0, targetDate.getTime() - Date.now()));

  // targetDate is stabilised by the caller (useRef.current) — safe dep
  useEffect(() => {
    const tick = () => setRemaining(Math.max(0, targetDate.getTime() - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Stable ref — avoids creating a new Date() on every render (which would
  // cause useCountdown's effect to re-fire → infinite update loop).
  const startsAtDate = useRef(new Date(startsAt)).current;

  const { remaining, h, m, s } = useCountdown(startsAtDate);
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const [cancelledMessage, setCancelledMessage] = useState<string | null>(null);
  const [byeRound, setByeRound] = useState<number | null>(null);
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [musicOn, setMusicOn] = useState(true);

  // Refs so the 30s interval always reads fresh values
  const remainingRef = useRef(remaining);
  const cancelledRef = useRef(cancelledMessage);
  useEffect(() => { remainingRef.current = remaining; }, [remaining]);
  useEffect(() => { cancelledRef.current = cancelledMessage; }, [cancelledMessage]);

  const { height } = useWindowDimensions();
  const compact = height < 750;

  const setActiveTournament = useTournamentStore((st) => st.setActiveTournament);
  const setNotificationsEnabled = useTournamentStore((st) => st.setNotificationsEnabled);
  const clearActiveTournament = useTournamentStore((st) => st.clearActiveTournament);

  // Pulse animation
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

  const toggleNotifications = useCallback(async () => {
    if (notifEnabled) {
      // Disable
      if (Notifications) {
        try { await Notifications.cancelAllScheduledNotificationsAsync(); } catch {}
      }
      await setNotificationsEnabled(false);
      setNotifEnabled(false);
      toast.info('Notificação desativada.');
      return;
    }

    // Enable
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
  }, [notifEnabled, startsAtDate, tournamentName]);

  const handleLeave = useCallback(async () => {
    const inProgress = byeRound != null || startsAtDate <= new Date();
    const endpoint = inProgress
      ? `/game/tournaments/${tournamentId}/withdraw`
      : `/game/tournaments/${tournamentId}/leave`;
    try {
      await api.post(endpoint);
    } catch {
      toast.warning('Não foi possível sair do torneio.');
      return;
    }
    await clearActiveTournament();
    toast.success('Você saiu do torneio.');
    navigation.replace('ModeSelect', { mode: 'TORNEIO' });
  }, [byeRound, startsAtDate, tournamentId]);

  // When countdown hits 0, poll /game/active every 2s in case we missed the
  // tournament:started socket event (race between socket emit and app listening).
  useEffect(() => {
    if (remaining > 0 || cancelledMessage) return;
    const poll = setInterval(async () => {
      try {
        const res = await api.get('/game/active');
        const gameId: string | undefined = res.data?.game?.id;
        if (gameId) {
          clearInterval(poll);
          navigation.replace('Game', { gameId });
        }
      } catch {}
    }, 2000);
    return () => clearInterval(poll);
  }, [remaining, cancelledMessage]);

  // Socket listeners for tournament events
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const socket = await connectSocket();

        socket.on('tournament:started', (data: { tournamentId: string; gameId: string; round: number; totalRounds: number }) => {
          if (!mounted || data.tournamentId !== tournamentId) return;
          navigation.replace('Game', { gameId: data.gameId });
        });

        socket.on('tournament:cancelled', (data: { tournamentId: string; refundAmount: number; reason: string }) => {
          if (!mounted || data.tournamentId !== tournamentId) return;
          setCancelledMessage(`Torneio cancelado — ${data.reason}. R$ ${data.refundAmount.toFixed(2)} reembolsado.`);
          clearActiveTournament();
        });

        socket.on('tournament:next_game', (data: { tournamentId: string; gameId: string; round: number; totalRounds: number }) => {
          if (!mounted || data.tournamentId !== tournamentId) return;
          setByeRound(null);
          navigation.replace('Game', { gameId: data.gameId });
        });

        socket.on('tournament:bye', (data: { tournamentId: string; round: number; totalRounds: number }) => {
          if (!mounted || data.tournamentId !== tournamentId) return;
          setByeRound(data.round);
          toast.success(`Rodada ${data.round}: você avançou automaticamente! Aguarde a próxima partida.`);
        });

        socket.on('tournament:withdrew', (data: { tournamentId: string }) => {
          if (!mounted || data.tournamentId !== tournamentId) return;
          clearActiveTournament();
          navigation.replace('ModeSelect', { mode: 'TORNEIO' });
        });

        socket.on('tournament:opponent_withdrew', (data: { tournamentId: string; round: number }) => {
          if (!mounted || data.tournamentId !== tournamentId) return;
          toast.info('Seu adversário saiu do torneio. Você avançou!');
        });
      } catch {}
    })();

    return () => {
      mounted = false;
      connectSocket().then((s) => {
        s.off('tournament:started');
        s.off('tournament:cancelled');
        s.off('tournament:next_game');
        s.off('tournament:bye');
        s.off('tournament:withdrew');
        s.off('tournament:opponent_withdrew');
      }).catch(() => {});
    };
  }, [tournamentId]);

  // 30-second reminder notifications while waiting
  useEffect(() => {
    if (!Notifications || Platform.OS === 'web') return;
    const id = setInterval(async () => {
      if (remainingRef.current <= 0 || cancelledRef.current) return;
      const { status } = await Notifications!.getPermissionsAsync();
      if (status !== 'granted') return;
      const total = Math.floor(remainingRef.current / 1000);
      const mm = Math.floor(total / 60);
      const ss = total % 60;
      try {
        await Notifications!.scheduleNotificationAsync({
          content: {
            title: '🏆 ' + tournamentName,
            body: `Começa em ${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}. Prepare-se!`,
            sound: true,
            data: { type: 'tournament_reminder' },
          },
          trigger: { type: Notifications!.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 1, repeats: false },
        });
      } catch {}
    }, 30_000);
    return () => clearInterval(id);
  }, [tournamentName]);

  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <ScreenBackground style={styles.bg}>
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        {/* Gear button — absolutely positioned so it doesn't shift the centroid */}
        <TouchableOpacity style={styles.gearBtn} onPress={() => setSettingsVisible(true)} accessibilityLabel="Configurações">
          <IconSettings size={22} color="#fff" accessibilityLabel="Configurações" />
        </TouchableOpacity>
        <View style={[styles.scroll, styles.centered]}>

          {/* Title */}
          <Text style={[styles.title, compact && styles.titleCompact]}>{tournamentName}</Text>
          <View style={[styles.statusPill, compact && styles.statusPillCompact]}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>
              {byeRound != null
                ? `Bye na rodada ${byeRound} — aguardando próxima`
                : 'Esperando o torneio começar'}
            </Text>
          </View>

          {/* Countdown card */}
          <LinearGradient
            colors={['rgba(187,255,0,0.12)', 'rgba(0,0,0,0.45)', 'rgba(28,187,61,0.10)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.countdownCard, compact && styles.countdownCardCompact]}
          >
            {cancelledMessage ? (
              <Text style={styles.cancelledText}>{cancelledMessage}</Text>
            ) : remaining === 0 ? (
              <Text style={styles.countdownLabel}>
                {Date.now() - startsAtDate.getTime() > 60_000
                  ? 'Aguardando próxima rodada...'
                  : 'Iniciando partida...'}
              </Text>
            ) : (
              <>
                <Text style={styles.countdownLabel}>Começa em</Text>
                <Text style={[styles.countdown, compact && styles.countdownCompact]}>
                  {h > 0 ? `${pad(h)}:` : ''}{pad(m)}:{pad(s)}
                </Text>
              </>
            )}

            <View style={styles.infoRow}>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Entrada paga</Text>
                <Text style={styles.infoValue}>R$ {Number(entryFee).toFixed(2)}</Text>
              </View>
            </View>
          </LinearGradient>

          {/* Action buttons: notification toggle + leave, side by side */}
          {!cancelledMessage && (
            <View style={[styles.actionsRow, compact && styles.actionsRowCompact]}>
              <TouchableOpacity
                style={[styles.actionBtn, notifEnabled && styles.actionBtnNotifActive]}
                onPress={toggleNotifications}
                activeOpacity={0.85}
              >
                <Text style={[styles.actionBtnText, notifEnabled && styles.actionBtnTextActive]}>
                  {notifEnabled ? '🔔 Notif ativa' : '🔕 Notificar'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnLeave]}
                onPress={handleLeave}
                activeOpacity={0.85}
              >
                <Text style={[styles.actionBtnText, styles.actionBtnTextLeave]}>Sair do torneio</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Back to lobby */}
          <TouchableOpacity
            style={[styles.backBtn, compact && styles.btnCompact]}
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
  safe: { flex: 1 },
  gearBtn: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.lg,
    zIndex: 10,
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(187,255,0,0.22)',
    alignItems: 'center', justifyContent: 'center',
  },
  scroll: { flex: 1 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    // Equal top/bottom padding so justifyContent:'center' lands at true screen midpoint.
    // paddingTop also clears the absolute gear button (top:8 + height:44 + gap ≈ 60px).
    paddingTop: 68,
    paddingBottom: 68,
    gap: spacing.sm,
  },

  title: {
    color: '#fff', fontSize: fonts.sizes.xl, fontWeight: '900',
    textAlign: 'center',
  },
  titleCompact: { fontSize: fonts.sizes.lg },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(28,187,61,0.15)',
    borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 5,
    borderWidth: 1, borderColor: 'rgba(28,187,61,0.3)',
  },
  statusPillCompact: {},
  statusDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: '#1CBB3D',
  },
  statusText: { color: '#1CBB3D', fontSize: fonts.sizes.sm, fontWeight: '700' },

  countdownCard: {
    width: '100%', maxWidth: isTablet ? 620 : 320,
    borderRadius: radius.xl, padding: spacing.lg,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', gap: spacing.md,
  },
  countdownCardCompact: { padding: spacing.md, gap: spacing.sm },
  countdownLabel: { color: 'rgba(255,255,255,0.7)', fontSize: fonts.sizes.sm, fontWeight: '600' },
  countdown: {
    color: '#fff', fontSize: 44, fontWeight: '900', letterSpacing: 2,
    ...(Platform.OS === 'web' ? ({ fontVariantNumeric: 'tabular-nums' } as any) : null),
  },
  countdownCompact: { fontSize: 32, letterSpacing: 1 },
  cancelledText: {
    color: '#fca5a5', fontSize: fonts.sizes.md, fontWeight: '700', textAlign: 'center',
  },

  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '100%' },
  infoItem: { alignItems: 'center', gap: 4 },
  infoLabel: { color: 'rgba(255,255,255,0.5)', fontSize: fonts.sizes.xs, fontWeight: '600' },
  infoValue: { color: '#fff', fontSize: fonts.sizes.md, fontWeight: '800' },

  // Two-button action row
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    width: '100%',
    maxWidth: isTablet ? 620 : 320,
  },
  actionsRowCompact: {},
  actionBtn: {
    flex: 1,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  actionBtnNotifActive: {
    borderColor: 'rgba(28,187,61,0.45)',
    backgroundColor: 'rgba(28,187,61,0.12)',
  },
  actionBtnLeave: {
    borderColor: 'rgba(239,68,68,0.45)',
    backgroundColor: 'rgba(239,68,68,0.12)',
  },
  actionBtnText: {
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '700',
    fontSize: fonts.sizes.xs,
  },
  actionBtnTextActive: { color: '#1CBB3D' },
  actionBtnTextLeave: { color: '#fecaca' },

  btnCompact: { paddingVertical: 8 },
  backBtn: {
    borderRadius: radius.full, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
    paddingVertical: 14, paddingHorizontal: spacing.xxl,
    backgroundColor: 'rgba(255,255,255,0.08)',
    width: '100%', maxWidth: isTablet ? 620 : 320, alignItems: 'center',
  },
  backBtnText: { color: '#e2e8f0', fontWeight: '700', fontSize: fonts.sizes.md },

  goHomeBtn: {
    borderRadius: radius.full,
    paddingVertical: 14, paddingHorizontal: spacing.xxl,
    backgroundColor: '#1CBB3D',
    width: '100%', maxWidth: isTablet ? 620 : 320, alignItems: 'center',
  },
  goHomeBtnText: { color: '#052e16', fontWeight: '900', fontSize: fonts.sizes.md },
});
