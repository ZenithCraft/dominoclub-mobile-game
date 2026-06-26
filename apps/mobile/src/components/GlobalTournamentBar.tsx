import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useNavigation, useNavigationState } from '@react-navigation/native';
import { connectSocket } from '../services/socket';
import { api } from '../services/api';
import { useTournamentStore } from '../store/tournament.store';
import { toast } from '../store/toast.store';

function formatCountdown(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

async function requestWebNotificationPermission(): Promise<'granted' | 'denied' | 'default' | 'unsupported'> {
  const WebNotification = (globalThis as any)?.Notification;
  if (!WebNotification) return 'unsupported';
  const cur = WebNotification.permission as 'granted' | 'denied' | 'default';
  if (cur === 'granted' || cur === 'denied') return cur;
  try {
    return (await WebNotification.requestPermission()) as any;
  } catch {
    return 'default';
  }
}

export function GlobalTournamentBar() {
  const activeTournament = useTournamentStore((s) => s.activeTournament);
  const setNotificationsEnabled = useTournamentStore((s) => s.setNotificationsEnabled);
  const clearActiveTournament = useTournamentStore((s) => s.clearActiveTournament);
  const loadFromStorage = useTournamentStore((s) => s.loadFromStorage);

  const navigation = useNavigation<any>();
  const navigationState = useNavigationState((st) => st);
  const routeName = navigationState?.routes?.[navigationState.index]?.name;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    loadFromStorage();
  }, []);

  useEffect(() => {
    if (!activeTournament) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [activeTournament?.tournamentId]);

  const remainingMs = useMemo(() => {
    if (!activeTournament) return 0;
    const startsAt = new Date(activeTournament.startsAt).getTime();
    return Math.max(0, startsAt - now);
  }, [activeTournament, now]);

  const hiddenRoutes = new Set(['TournamentWaiting', 'Game', 'TournamentBracket', 'TournamentResult']);
  const shouldRender = !!activeTournament && !hiddenRoutes.has(routeName || '') && remainingMs > 0;

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const socket = await connectSocket();
        socket.on('tournament:started', (d: { tournamentId: string; gameId: string }) => {
          if (!mounted) return;
          if (!activeTournament || d.tournamentId !== activeTournament.tournamentId) return;
          toast.info('Torneio começou — entrando na partida...');
          navigation.replace('Game', { gameId: d.gameId });
        });

        socket.on('tournament:cancelled', async (d: { tournamentId: string; refundAmount: number; reason: string }) => {
          if (!mounted) return;
          if (!activeTournament || d.tournamentId !== activeTournament.tournamentId) return;
          toast.warning(`Torneio cancelado — ${d.reason}. Reembolso: R$ ${Number(d.refundAmount).toFixed(2)}.`);
          await clearActiveTournament();
        });

        socket.on('tournament:next_game', (d: { tournamentId: string; gameId: string }) => {
          if (!mounted) return;
          if (!activeTournament || d.tournamentId !== activeTournament.tournamentId) return;
          toast.info('Próxima rodada — entrando na partida...');
          navigation.replace('Game', { gameId: d.gameId });
        });

        socket.on('tournament:champion', async (d: { tournamentId: string; prize: number }) => {
          if (!mounted) return;
          if (!activeTournament || d.tournamentId !== activeTournament.tournamentId) return;
          await clearActiveTournament();
          navigation.replace('TournamentResult', {
            tournamentId: d.tournamentId,
            won: true,
            prize: d.prize,
            finalPosition: 1,
          });
        });

        socket.on('tournament:eliminated', async (d: { tournamentId: string; finalPosition: number; totalPlayers: number; prize: number }) => {
          if (!mounted) return;
          if (!activeTournament || d.tournamentId !== activeTournament.tournamentId) return;
          await clearActiveTournament();
          navigation.replace('TournamentResult', {
            tournamentId: d.tournamentId,
            won: false,
            prize: d.prize || 0,
            finalPosition: d.finalPosition,
            totalPlayers: d.totalPlayers,
          });
        });
      } catch {}
    })();
    return () => {
      mounted = false;
      connectSocket().then((s) => {
        s.off('tournament:started');
        s.off('tournament:cancelled');
        s.off('tournament:next_game');
        s.off('tournament:champion');
        s.off('tournament:eliminated');
      }).catch(() => {});
    };
  }, [activeTournament?.tournamentId, navigation]);

  const enableWebNotifications = async () => {
    if (!activeTournament) return;
    const perm = await requestWebNotificationPermission();
    if (perm === 'unsupported') {
      toast.warning('Notificações não suportadas neste navegador.');
      return;
    }
    if (perm !== 'granted') {
      toast.warning('Permissão de notificação não concedida.');
      return;
    }
    await setNotificationsEnabled(true);
    toast.success('Notificações ativadas.');
    const msToStart = new Date(activeTournament.startsAt).getTime() - Date.now();
    if (msToStart > 0) {
      const triggerMs = Math.max(1_000, msToStart - 10_000);
      setTimeout(() => {
        try {
          if ((globalThis as any)?.Notification?.permission !== 'granted') return;
          new (globalThis as any).Notification('Torneio vai começar!', {
            body: `${activeTournament.tournamentName} começa em instantes. Entre agora!`,
          });
        } catch {}
      }, triggerMs);
    }
  };

  const leaveTournament = async () => {
    if (!activeTournament) return;
    try {
      await api.post(`/game/tournaments/${activeTournament.tournamentId}/leave`);
    } catch {
      toast.warning('Não foi possível sair do torneio.');
      return;
    }
    await clearActiveTournament();
    toast.success('Você saiu do torneio.');
    try {
      navigation.navigate('ModeSelect', { mode: 'TORNEIO' });
    } catch {}
  };

  if (!shouldRender) return null;

  return (
    <View pointerEvents="box-none" style={styles.root}>
      <View style={styles.card}>
        <TouchableOpacity
          style={{ flex: 1 }}
          activeOpacity={0.75}
          onPress={() =>
            navigation.navigate('TournamentWaiting', {
              tournamentId: activeTournament.tournamentId,
              tournamentName: activeTournament.tournamentName,
              startsAt: activeTournament.startsAt,
              entryFee: activeTournament.entryFee,
            })
          }
        >
          <Text style={styles.title} numberOfLines={1}>{activeTournament.tournamentName}</Text>
          <Text style={styles.subtitle}>Toque para voltar · {formatCountdown(remainingMs)}</Text>
        </TouchableOpacity>
        {Platform.OS === 'web' && !activeTournament.notificationsEnabled && (
          <TouchableOpacity style={styles.btn} onPress={enableWebNotifications} activeOpacity={0.85}>
            <Text style={styles.btnText}>Notificar</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.leaveBtn} onPress={leaveTournament} activeOpacity={0.85}>
          <Text style={styles.leaveBtnText}>Sair</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    zIndex: 50,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(28,187,61,0.35)',
  },
  title: { color: '#fff', fontSize: 13, fontWeight: '800' },
  subtitle: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '600', marginTop: 2 },
  btn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#22c55e',
  },
  btnText: { color: '#052e16', fontWeight: '800', fontSize: 12 },
  leaveBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(239,68,68,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.55)',
  },
  leaveBtnText: { color: '#fecaca', fontWeight: '800', fontSize: 12 },
});
