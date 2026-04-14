import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ImageBackground, TouchableOpacity,
  Platform, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, fonts, radius, backgroundCoverFix } from '../theme';
import { IconTrophy } from '../components/Icons';
import { connectSocket } from '../services/socket';
import { api } from '../services/api';
import * as Notifications from 'expo-notifications';
import { useTournamentStore } from '../store/tournament.store';
import { toast } from '../store/toast.store';

// ─── Push notification setup ─────────────────────────────────────────────────

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

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
    <ImageBackground
      source={require('../../assets/background.png')}
      style={[styles.bg, backgroundCoverFix]}
      resizeMode="cover"
    >
      <View style={styles.overlay} />
      <SafeAreaView style={styles.safe}>
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
            colors={['rgba(187,255,0,0.12)', 'rgba(0,0,0,0.45)', 'rgba(74,222,128,0.10)']}
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
                <Text style={[styles.infoValue, { color: notifEnabled ? '#4ade80' : 'rgba(255,255,255,0.75)' }]}>
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
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#0a1f0a' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  safe: { flex: 1 },
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
    backgroundColor: 'rgba(74,222,128,0.15)',
    borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 5,
    borderWidth: 1, borderColor: 'rgba(74,222,128,0.3)',
    marginBottom: spacing.lg,
  },
  statusDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: '#4ade80',
  },
  statusText: { color: '#4ade80', fontSize: fonts.sizes.sm, fontWeight: '700' },

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
    borderColor: 'rgba(74,222,128,0.35)',
    paddingVertical: 12,
    paddingHorizontal: spacing.xxl,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginBottom: spacing.md,
  },
  notifyBtnText: { color: '#4ade80', fontWeight: '800', fontSize: fonts.sizes.sm },
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
    backgroundColor: '#4ade80',
  },
  goHomeBtnText: { color: '#052e16', fontWeight: '900', fontSize: fonts.sizes.md },
});
