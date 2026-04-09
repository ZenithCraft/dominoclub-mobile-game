import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as Location from 'expo-location';
import { getIntegrityToken } from '../services/integrity';
import {
  View, Text, StyleSheet, ImageBackground, ScrollView, useWindowDimensions,
  TouchableOpacity, Modal, ActivityIndicator, RefreshControl,
  Platform, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, fonts, radius, backgroundCoverFix } from '../theme';
import { IconUser, IconUsers, IconTrophy } from '../components/Icons';
import { useGameStore } from '../store/game.store';
import { useAuthStore } from '../store/auth.store';
import { connectSocket } from '../services/socket';
import { api } from '../services/api';
import { toast } from '../store/toast.store';
import { GameTopBar } from './HomeScreen';

type Props = {
  navigation: NativeStackNavigationProp<any>;
  route: { params?: { mode?: string } };
};

const IS_TORNEIO = (mode?: string) => mode === 'TORNEIO';

// ── Room data for Livre mode ────────────────────────────────────────────────

interface RoomOption {
  id: string;
  buyIn: number | null; // null = Grátis
  prize: number;
}

const LIVRE_1V1: RoomOption[] = [
  { id: 'l1', buyIn: null, prize: 0 },
  { id: 'l2', buyIn: 2,    prize: 3.8 },
  { id: 'l3', buyIn: 10,   prize: 19 },
  { id: 'l4', buyIn: 25,   prize: 47.5 },
  { id: 'l5', buyIn: 50,   prize: 95 },
];

const LIVRE_2V2: RoomOption[] = [
  { id: 'd1', buyIn: null, prize: 0 },
  { id: 'd2', buyIn: 2,    prize: 3.8 },
  { id: 'd3', buyIn: 10,   prize: 19 },
  { id: 'd4', buyIn: 25,   prize: 47.5 },
  { id: 'd5', buyIn: 50,   prize: 95 },
];

// ── Tournament data type ────────────────────────────────────────────────────

interface Tournament {
  id: string;
  name: string;
  status: string;
  entry_fee: number;
  prize_pool: number;
  max_players: number;
  current_players: number;
  starts_at: string;
}

const fmtBrl = (n: number) =>
  n % 1 === 0
    ? `R$ ${n}`
    : `R$ ${n.toFixed(1).replace('.', ',')}`;

// ── Room Card ───────────────────────────────────────────────────────────────

function RoomCard({ room, section, onJoin, width, queuedCount, modeTotal }: { room: RoomOption; section: '1v1' | '2v2'; onJoin: () => void; width: number; queuedCount: number; modeTotal: number }) {
  const isFree = room.buyIn === null;
  const textColor = '#ffffff';
  const PlayersIcon = section === '2v2' ? IconUsers : IconUser;
  const paidColors = section === '2v2'
    ? ['#041802', '#041802', '#0E7F00']
    : ['#001A27', '#001A27', '#00A2C6'];
  return (
    <TouchableOpacity
      style={[
        styles.roomCard,
        { width },
        isFree && styles.roomCardFree,
        !isFree && (section === '2v2' ? styles.roomCardPaidGreen : styles.roomCardPaidBlue),
      ]}
      activeOpacity={0.85}
      onPress={onJoin}
    >
      {isFree ? (
        <LinearGradient
          colors={['#40573D', '#40573D', '#62895D']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.roomCardInner}
        >
          <View style={styles.cardTop}>
            <View style={styles.playersIconWrap}>
              <PlayersIcon size={18} color={textColor} />
            </View>
            <View style={styles.playersMeta}>
              <Text style={[styles.playersLabel, { color: textColor }]}>Jogadores</Text>
              <Text style={[styles.playersCount, { color: textColor }]}>{queuedCount}/{modeTotal}</Text>
            </View>
          </View>
          <View style={[styles.cardDivider, styles.cardDividerDark]} />

          <View style={styles.fullBar}>
            <Text style={styles.barLabel}>Buy in</Text>
            <Text style={styles.barValue}>{isFree ? 'Grátis' : `R$ ${room.buyIn}`}</Text>
          </View>

          <LinearGradient
            colors={['#FDD835', '#FDD835', '#FF9D00']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={[styles.fullBar, styles.prizeBar]}
          >
            <Text style={styles.prizeLabel}>Prêmio</Text>
            <Text style={styles.prizeValue}>{fmtBrl(room.prize)}</Text>
          </LinearGradient>
        </LinearGradient>
      ) : (
        <LinearGradient
          colors={paidColors}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.roomCardInner}
        >
          <View style={styles.cardTop}>
            <View style={styles.playersIconWrap}>
              <PlayersIcon size={18} color={textColor} />
            </View>
            <View style={styles.playersMeta}>
              <Text style={[styles.playersLabel, { color: textColor }]}>Jogadores</Text>
              <Text style={[styles.playersCount, { color: textColor }]}>{queuedCount}/{modeTotal}</Text>
            </View>
          </View>
          <View style={styles.cardDivider} />

          <View style={styles.fullBar}>
            <Text style={styles.barLabel}>Buy in</Text>
            <Text style={styles.barValue}>{`R$ ${room.buyIn}`}</Text>
          </View>

          <LinearGradient
            colors={['#FDD835', '#FDD835', '#FF9D00']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={[styles.fullBar, styles.prizeBar]}
          >
            <Text style={styles.prizeLabel}>Prêmio</Text>
            <Text style={styles.prizeValue}>{fmtBrl(room.prize)}</Text>
          </LinearGradient>
        </LinearGradient>
      )}
    </TouchableOpacity>
  );
}

// ── Tournament Card ─────────────────────────────────────────────────────────

function TournamentCard({ t, onJoin }: { t: Tournament; onJoin: () => void }) {
  const mins = Math.max(0, Math.round((new Date(t.starts_at).getTime() - Date.now()) / 60000));
  const timerStr = mins > 60
    ? `${Math.floor(mins / 60)}h${mins % 60}m`
    : `00:${String(mins).padStart(2, '0')}:20`;

  const isExpiring = mins < 15;

  return (
    <TouchableOpacity style={styles.tourCard} onPress={onJoin} activeOpacity={0.85}>
      <LinearGradient
        colors={['#041802', '#041802', '#0E7F00']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.tourCardInner}
      >
        <Text style={[styles.tourTimerText, isExpiring ? styles.tourTimerTextDanger : styles.tourTimerTextOk]}>
          {timerStr}
        </Text>

        <Text style={styles.tourMetaLabel}>Nome do torneio</Text>
        <Text style={styles.tourName} numberOfLines={1}>{t.name}</Text>

        <View style={styles.tourPlayersRow}>
          <IconUser size={16} color="#fff" />
          <View style={styles.tourPlayersMeta}>
            <Text style={styles.tourPlayersLabel}>Jogadores</Text>
            <Text style={styles.tourPlayersValue}>{t.current_players}/{t.max_players}</Text>
          </View>
        </View>

        <View style={[styles.tourBar, styles.tourBarGray]}>
          <Text style={styles.tourBarLabel}>Inscrição</Text>
          <Text style={styles.tourBarValue}>R${t.entry_fee}</Text>
        </View>

        <LinearGradient
          colors={['#FDD835', '#FDD835', '#FF9D00']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={[styles.tourBar, styles.tourBarGold]}
        >
          <Text style={styles.tourBarLabel}>Prêmio</Text>
          <Text style={styles.tourBarValue}>R${t.prize_pool.toLocaleString('pt-BR')}</Text>
        </LinearGradient>
      </LinearGradient>
    </TouchableOpacity>
  );
}

// ── Main screen ─────────────────────────────────────────────────────────────

export function ModeSelectScreen({ navigation, route }: Props) {
  const mode = route.params?.mode ?? 'LIVRE';
  const isTorneio = IS_TORNEIO(mode);
  const { width: screenWidth } = useWindowDimensions();

  const { user, refreshUser, setTokens, setUser } = useAuthStore();
  const { setQueueStatus, setLastQueue } = useGameStore();
  const [queueStats, setQueueStats] = useState<Record<string, { total: number; byBet: Record<string, number> }>>({});
  const [serverBotWaitSeconds, setServerBotWaitSeconds] = useState<number | null>(null);
  const [tournaments, setTournaments]   = useState<Tournament[]>([]);
  const [tourLoading, setTourLoading]   = useState(false);
  const [tourRefreshing, setTourRefreshing] = useState(false);
  const [confirmTour, setConfirmTour]   = useState<Tournament | null>(null);
  const [confirmRoom, setConfirmRoom]   = useState<{ room: RoomOption; section: '1v1' | '2v2' } | null>(null);
  const [joining, setJoining]           = useState(false);
  const [searching, setSearching]       = useState(false);
  const searchPulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (process.env.NODE_ENV === 'test') return;

    if (!searching) {
      searchPulseAnim.stopAnimation();
      searchPulseAnim.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(searchPulseAnim, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(searchPulseAnim, { toValue: 0, duration: 750, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [searchPulseAnim, searching]);

  useEffect(() => {
    (async () => {
      try {
        const s = await connectSocket();
        s.on('queue:stats', (stats: any) => setQueueStats(stats || {}));
      } catch {}
    })();
    if (isTorneio) fetchTournaments();
  }, []);

  const fetchTournaments = useCallback(async (isRefresh = false) => {
    if (isRefresh) setTourRefreshing(true); else setTourLoading(true);
    try {
      const { data } = await api.get('/game/tournaments');
      setTournaments(data.tournaments ?? []);
    } finally {
      setTourLoading(false); setTourRefreshing(false);
    }
  }, []);

  const handleJoinRoom = async (room: RoomOption, section: '1v1' | '2v2') => {
    setSearching(true);
    setQueueStatus('queuing');
    const gameMode = section === '2v2' ? 'RECREATIONAL_2V2' : 'ARENA_1V1';
    try {
      const forceDevLogin = process.env.EXPO_PUBLIC_FORCE_DEV_LOGIN === 'true';
      const canAutoDevLogin = (() => {
        if (forceDevLogin) return true;
        try {
          const base = String((api.defaults.baseURL || '')).trim();
          if (!base) return false;
          const url = new URL(base);
          const host = url.hostname;
          if (host === 'localhost' || host === '127.0.0.1') return true;
          if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
            const [a, b] = host.split('.').map((x) => Number(x));
            if (a === 10) return true;
            if (a === 192 && b === 168) return true;
            if (a === 172 && b >= 16 && b <= 31) return true;
          }
          return false;
        } catch {
          return false;
        }
      })();

      if (!user && canAutoDevLogin) {
        try {
          const { data } = await api.post('/auth/dev/login', {});
          setTokens(data.accessToken, data.refreshToken);
          setUser(data.user);
        } catch {}
      }
      const socket = await connectSocket();
      const betAmount = room.buyIn ?? 0;
      setLastQueue({ mode: gameMode as any, betAmount });
      const cleanup = () => {
        socket.off('game:found');
        socket.off('queue:error');
        socket.off('queue:joined');
      };

      const defaultWaitMs = 45000;
      let timeout: ReturnType<typeof setTimeout> | null = null;
      const setSearchTimeout = (ms: number) => {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => {
          cleanup();
          socket.emit('queue:leave');
          setSearching(false);
          setQueueStatus('idle');
          toast.warning('Ainda não encontramos uma partida. Tente novamente.');
        }, ms);
      };

      setSearchTimeout(defaultWaitMs);

      socket.once('game:found', ({ gameId }: { gameId: string }) => {
        if (timeout) clearTimeout(timeout);
        cleanup();
        setQueueStatus('found');
        navigation.replace('Game', { gameId });
      });

      socket.once('queue:error', ({ message }: { message: string }) => {
        if (timeout) clearTimeout(timeout);
        cleanup();
        setSearching(false);
        setQueueStatus('idle');
        toast.error(message);
      });

      socket.once('queue:expired', ({ message }: { message: string }) => {
        if (timeout) clearTimeout(timeout);
        cleanup();
        setSearching(false);
        setQueueStatus('idle');
        toast.warning(message);
      });

      socket.once('queue:joined', ({ botWaitSeconds }: { botWaitSeconds?: number }) => {
        if (typeof botWaitSeconds === 'number' && Number.isFinite(botWaitSeconds)) {
          setServerBotWaitSeconds(botWaitSeconds);
          const waitMs = Math.max(20000, Math.min(60000, (botWaitSeconds + 5) * 1000));
          setSearchTimeout(waitMs);
        }
      });

      // Gather integrity token and GPS in parallel — non-fatal if unavailable
      const isPaidGame = betAmount > 0;
      const [integrityPayload, gpsPosition] = await Promise.allSettled([
        isPaidGame ? getIntegrityToken() : Promise.resolve(null),
        isPaidGame
          ? Location.requestForegroundPermissionsAsync()
              .then(({ status }) =>
                status === 'granted'
                  ? Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
                  : null
              )
              .catch(() => null)
          : Promise.resolve(null),
      ]);

      const integrity = integrityPayload.status === 'fulfilled' ? integrityPayload.value : null;
      const position  = gpsPosition.status  === 'fulfilled' ? gpsPosition.value   : null;

      socket.emit('queue:join', {
        mode: gameMode,
        betAmount,
        ...(integrity ? { platform: integrity.platform, integrityToken: integrity.token } : {}),
        ...(position  ? { gps: { lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy ?? undefined } } : {}),
      });
    } catch (err: any) {
      setSearching(false);
      setQueueStatus('idle');
      toast.error(err?.message || 'Falha ao conectar no servidor');
    }
  };

  const handleJoinTournament = async () => {
    if (!confirmTour) return;
    const tour = confirmTour;
    setJoining(true);
    try {
      const { data } = await api.post(`/game/tournaments/${tour.id}/join`);
      await refreshUser();
      setConfirmTour(null);
      navigation.replace('TournamentWaiting', {
        tournamentId: tour.id,
        tournamentName: tour.name,
        startsAt: data.tournament?.starts_at ?? tour.starts_at,
        entryFee: tour.entry_fee,
      });
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Erro ao entrar no torneio');
      setJoining(false);
    }
  };

  const rowGap = spacing.lg;
  const contentPad = spacing.xl;
  const sectionPad = spacing.xl;
  const sectionInnerWidth = Math.max(1, screenWidth - contentPad * 2 - sectionPad * 2);
  const roomCardWidth = Math.max(1, Math.floor((sectionInnerWidth - rowGap * 3) / 4));

  return (
    <ImageBackground
      source={require('../../assets/background.png')}
      style={[styles.root, backgroundCoverFix]}
      resizeMode="cover"
    >
      <SafeAreaView style={styles.safe}>
      <GameTopBar
        user={user}
        onWallet={() => navigation.navigate('Wallet')}
        onSettings={() => navigation.replace('Main')}
        onProfile={() => navigation.replace('Main')}
        exitVariant="back"
        onExit={() => (navigation.canGoBack?.() ? navigation.goBack() : navigation.replace('Main'))}
      />

      {/* Content */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { flexGrow: 1 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          isTorneio
            ? <RefreshControl refreshing={tourRefreshing} onRefresh={() => fetchTournaments(true)} tintColor="#4ade80" />
            : undefined
        }
      >
        {/* ── Livre mode ── */}
        {!isTorneio && (
          <>
            <View style={styles.sectionContainer}>
              <Text style={styles.sectionTitle}>Jogos individuais (1x1)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ width: '100%' }} contentContainerStyle={styles.cardsRow}>
                {LIVRE_1V1.map((r) => {
                  const betAmount = r.buyIn ?? 0;
                  const queuedCount = queueStats['ARENA_1V1']?.byBet?.[String(betAmount)] ?? 0;
                  const modeTotal = queueStats['ARENA_1V1']?.total ?? 0;
                  return (
                    <RoomCard
                      key={r.id}
                      room={r}
                      section="1v1"
                      width={roomCardWidth}
                      queuedCount={queuedCount}
                      modeTotal={modeTotal}
                      onJoin={() => setConfirmRoom({ room: r, section: '1v1' })}
                    />
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.sectionContainer}>
              <Text style={styles.sectionTitle}>Jogos em duplas (2x2) com parceiro aleatório</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ width: '100%' }} contentContainerStyle={styles.cardsRow}>
                {LIVRE_2V2.map((r) => {
                  const betAmount = r.buyIn ?? 0;
                  const queuedCount = queueStats['RECREATIONAL_2V2']?.byBet?.[String(betAmount)] ?? 0;
                  const modeTotal = queueStats['RECREATIONAL_2V2']?.total ?? 0;
                  return (
                    <RoomCard
                      key={r.id}
                      room={r}
                      section="2v2"
                      width={roomCardWidth}
                      queuedCount={queuedCount}
                      modeTotal={modeTotal}
                      onJoin={() => setConfirmRoom({ room: r, section: '2v2' })}
                    />
                  );
                })}
              </ScrollView>
            </View>
          </>
        )}

        {/* ── Torneio mode ── */}
        {isTorneio && (
          <View style={styles.tourWrap}>
            <View style={styles.tourPanelWrap}>
              <View style={styles.tourGlow} />
              <LinearGradient
                colors={['rgba(187,255,0,0.18)', 'rgba(0,0,0,0.28)', 'rgba(74,222,128,0.12)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.tourPanel}
              >
              <View style={styles.tourHeaderRow}>
                <Text style={styles.tourTitle}>Torneios individuais (1x1)</Text>
                <View style={styles.tourCountPill}>
                  <Text style={styles.tourCountText}>{String(tournaments.length)}</Text>
                </View>
              </View>
              {tourLoading ? (
                <View style={styles.tourLoading}>
                  <ActivityIndicator color="#4ade80" />
                </View>
              ) : tournaments.length === 0 ? (
                <View style={styles.tourEmptyBox}>
                  <View style={styles.tourEmptyIcon}>
                    <IconTrophy size={22} color="#BBFF00" accessibilityLabel="Torneios" />
                  </View>
                  <Text style={styles.tourEmptyTitle}>Nenhum torneio disponível agora</Text>
                  <Text style={styles.tourEmptyHint}>Volte em instantes — novos torneios aparecem aqui</Text>
                  <TouchableOpacity style={styles.tourRefreshBtn} onPress={() => fetchTournaments(true)} activeOpacity={0.85}>
                    <Text style={styles.tourRefreshText}>Atualizar</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tourCardsRow}>
                  {tournaments.map((t) => (
                    <TournamentCard key={t.id} t={t} onJoin={() => setConfirmTour(t)} />
                  ))}
                </ScrollView>
              )}
              </LinearGradient>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Searching overlay */}
      {searching && (
        <View style={styles.searchingOverlay}>
          <View style={styles.searchWrap}>
            <Animated.View
              style={[
                styles.searchGlow,
                {
                  opacity: searchPulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.30] }),
                  transform: [{ scale: searchPulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.06] }) }],
                },
              ]}
            />
            <LinearGradient
              colors={['rgba(34,211,238,0.14)', 'rgba(0,0,0,0.58)', 'rgba(74,222,128,0.16)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.searchCard}
            >
              <View style={styles.searchSpinnerRow}>
                <ActivityIndicator color="#4ade80" size="large" />
              </View>
              <Text style={styles.searchTitle}>Procurando partida...</Text>
              <Text style={styles.searchSubtitle}>Aguardando jogadores e criando a sala</Text>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={async () => {
                  try {
                    const s = await connectSocket();
                    s.emit('queue:leave');
                  } catch {}
                  setSearching(false);
                  setQueueStatus('idle');
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
            </LinearGradient>
          </View>
        </View>
      )}

      {/* Tournament confirm modal */}
      <Modal visible={!!confirmTour} transparent animationType="fade">
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => !joining && setConfirmTour(null)}>
          <View style={styles.modalCard} onStartShouldSetResponder={() => true}>
            {confirmTour && (
              <>
                <Text style={styles.modalTitle}>Comprar entrada por R$ {confirmTour.entry_fee.toFixed(2)}?</Text>
                <Text style={styles.modalTourName}>{confirmTour.name}</Text>
                <View style={styles.modalRow}>
                  <Text style={styles.modalLabel}>Prêmio total</Text>
                  <Text style={[styles.modalValue, { color: '#fbbf24' }]}>R$ {confirmTour.prize_pool.toLocaleString('pt-BR')}</Text>
                </View>
                <View style={styles.modalDivider} />
                <View style={styles.modalRow}>
                  <Text style={styles.modalLabel}>Saldo atual</Text>
                  <Text style={styles.modalValue}>R$ {(user?.wallet?.real_balance ?? 0).toFixed(2)}</Text>
                </View>
                <View style={styles.modalRow}>
                  <Text style={styles.modalLabel}>Saldo após entrar</Text>
                  <Text style={[styles.modalValue, { color: '#4ade80' }]}>
                    R$ {Math.max(0, (user?.wallet?.real_balance ?? 0) - confirmTour.entry_fee).toFixed(2)}
                  </Text>
                </View>
                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={[styles.modalBtnCancel, joining && styles.modalBtnDisabled]}
                    onPress={() => setConfirmTour(null)}
                    disabled={joining}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.modalBtnCancelText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalBtnConfirm, joining && styles.modalBtnDisabled]}
                    onPress={handleJoinTournament}
                    disabled={joining}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.modalBtnConfirmText}>{joining ? 'Confirmando...' : 'Confirmar'}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Match confirm modal */}
      <Modal visible={!!confirmRoom} transparent animationType="fade">
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => !searching && setConfirmRoom(null)}>
          <View style={styles.modalCard} onStartShouldSetResponder={() => true}>
            {confirmRoom && (
              <>
                <Text style={styles.modalTitle}>
                  {confirmRoom.room.buyIn === null
                    ? `Entrar na partida ${confirmRoom.section === '2v2' ? '(2x2)' : '(1x1)'}?`
                    : `Comprar entrada por R$ ${confirmRoom.room.buyIn.toFixed(2)}?`}
                </Text>
                <View style={styles.modalRow}>
                  <Text style={styles.modalLabel}>Buy in</Text>
                  <Text style={styles.modalValue}>{confirmRoom.room.buyIn === null ? 'Grátis' : `R$ ${confirmRoom.room.buyIn}`}</Text>
                </View>
                <View style={styles.modalRow}>
                  <Text style={styles.modalLabel}>Prêmio</Text>
                  <Text style={[styles.modalValue, { color: '#fbbf24' }]}>{fmtBrl(confirmRoom.room.prize)}</Text>
                </View>
                {confirmRoom.room.buyIn !== null && (
                  <>
                    <View style={styles.modalDivider} />
                    <View style={styles.modalRow}>
                      <Text style={styles.modalLabel}>Saldo atual</Text>
                      <Text style={styles.modalValue}>R$ {(user?.wallet?.real_balance ?? 0).toFixed(2)}</Text>
                    </View>
                    <View style={styles.modalRow}>
                      <Text style={styles.modalLabel}>Saldo após entrar</Text>
                      <Text style={[styles.modalValue, { color: '#4ade80' }]}>
                        R$ {Math.max(0, (user?.wallet?.real_balance ?? 0) - confirmRoom.room.buyIn).toFixed(2)}
                      </Text>
                    </View>
                  </>
                )}
                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={[styles.modalBtnCancel, searching && styles.modalBtnDisabled]}
                    onPress={() => setConfirmRoom(null)}
                    disabled={searching}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.modalBtnCancelText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalBtnConfirm, searching && styles.modalBtnDisabled]}
                    onPress={async () => {
                      const r = confirmRoom;
                      setConfirmRoom(null);
                      if (!r) return;
                      await handleJoinRoom(r.room, r.section);
                    }}
                    disabled={searching}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.modalBtnConfirmText}>Confirmar</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
      </SafeAreaView>
    </ImageBackground>
  );
}

const LIME = '#4ade80';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a1f0a' },
  safe: { flex: 1 },

  content: { padding: spacing.xl, gap: spacing.xxl, paddingBottom: spacing.xxl },

  section: { gap: spacing.md },
  sectionContainer: {
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  sectionTitle: {
    color: '#fff',
    fontWeight: '900',
    fontSize: fonts.sizes.xl,
  },
  cardsRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: spacing.lg,
    paddingBottom: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
    ...(Platform.OS === 'web' ? ({ minWidth: '100%' } as any) : null),
  },

  // Room card
  roomCard: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  roomCardFree: {
    backgroundColor: 'transparent',
    borderColor: 'rgba(255,255,255,0.18)',
  },
  roomCardPaidBlue: {
    backgroundColor: 'transparent',
    borderColor: 'rgba(34, 211, 238, 0.30)',
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0px 6px 12px rgba(34, 211, 238, 0.22)' } as any)
      : {
          shadowColor: '#22d3ee',
          shadowOpacity: 0.22,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
          elevation: 6,
        }),
  },
  roomCardPaidGreen: {
    backgroundColor: 'transparent',
    borderColor: 'rgba(14, 127, 0, 0.38)',
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0px 6px 12px rgba(14, 127, 0, 0.22)' } as any)
      : {
          shadowColor: '#0E7F00',
          shadowOpacity: 0.22,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
          elevation: 6,
        }),
  },
  roomCardInner: { padding: spacing.lg, gap: spacing.md, minHeight: 220 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, width: '100%' },
  playersIconWrap: { width: 34, height: 34, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.18)', alignItems: 'center', justifyContent: 'center' },
  playersMeta: { flexDirection: 'column', gap: 2, alignItems: 'center' },
  playersLabel: { fontSize: fonts.sizes.sm, fontWeight: '800', textAlign: 'center', fontFamily: Platform.OS === 'web' ? ('Poppins' as any) : 'System' },
  playersCount: { fontSize: fonts.sizes.sm, fontWeight: '900', textAlign: 'center', fontFamily: Platform.OS === 'web' ? ('Poppins' as any) : 'System' },
  cardDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.18)' },
  cardDividerDark: { backgroundColor: 'rgba(17,24,39,0.14)' },
  fullBar: {
    width: '100%',
    borderRadius: radius.md,
    backgroundColor: '#E5E7EB',
    paddingVertical: 10,
    alignItems: 'center',
    gap: 2,
  },
  barLabel: { color: '#111827', fontSize: fonts.sizes.xs, fontWeight: '800' },
  barValue: { color: '#111827', fontSize: fonts.sizes.md, fontWeight: '900' },
  prizeBar: { backgroundColor: 'transparent' },
  prizeLabel: { color: '#111827', fontSize: fonts.sizes.xs, fontWeight: '800' },
  prizeValue: { color: '#111827', fontSize: fonts.sizes.md, fontWeight: '900' },

  roomRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  roomFieldLabel: { color: 'rgba(255,255,255,0.65)', fontSize: fonts.sizes.xs, fontWeight: '700', marginTop: spacing.xs },
  pill: {
    width: '100%',
    borderRadius: radius.md,
    paddingVertical: 10,
    alignItems: 'center',
    gap: 2,
  },
  pillGray: { backgroundColor: '#E5E7EB' },
  pillGold: { backgroundColor: colors.gold },
  pillText: { color: '#111827', fontWeight: '900', fontSize: fonts.sizes.md },
  pillTextGold: { color: '#111827' },

  tourWrap: { alignItems: 'center' },
  tourPanelWrap: {
    width: '100%',
    maxWidth: 980,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tourGlow: {
    position: 'absolute',
    width: 520,
    height: 240,
    borderRadius: 140,
    backgroundColor: '#BBFF00',
    opacity: 0.10,
    transform: [{ rotate: '-12deg' }],
  },
  tourPanel: {
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 22,
    padding: spacing.xl,
    gap: spacing.lg,
    backgroundColor: 'rgba(0,0,0,0.25)',
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0px 14px 28px rgba(0,0,0,0.42)' } as any) : { elevation: 8, shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 18, shadowOffset: { width: 0, height: 10 } }),
  },
  tourHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  tourTitle: { color: '#fff', fontWeight: '900', fontSize: fonts.sizes.lg },
  tourCountPill: {
    minWidth: 44,
    height: 30,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    backgroundColor: 'rgba(187, 255, 0, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(187, 255, 0, 0.20)',
  },
  tourCountText: { color: '#BBFF00', fontWeight: '900', fontSize: fonts.sizes.sm },
  tourLoading: { paddingVertical: spacing.xl, alignItems: 'center', justifyContent: 'center' },
  tourEmptyBox: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(0,0,0,0.22)',
    gap: 8,
  },
  tourEmptyIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(187, 255, 0, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(187, 255, 0, 0.18)',
    marginBottom: 2,
  },
  tourEmptyTitle: { color: '#fff', fontWeight: '900', fontSize: fonts.sizes.lg, textAlign: 'center' },
  tourEmptyHint: { color: 'rgba(255,255,255,0.70)', fontWeight: '700', fontSize: fonts.sizes.sm, textAlign: 'center' },
  tourRefreshBtn: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  tourRefreshText: { color: '#fff', fontWeight: '900', fontSize: fonts.sizes.sm },
  tourCardsRow: {
    gap: spacing.lg,
    paddingBottom: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
    ...(Platform.OS === 'web' ? ({ minWidth: '100%' } as any) : null),
  },

  tourCard: {
    width: 200,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(14, 127, 0, 0.40)',
    overflow: 'hidden',
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0px 8px 10px rgba(0,0,0,0.22)' } as any)
      : {
          shadowColor: '#000',
          shadowOpacity: 0.22,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 8 },
          elevation: 6,
        }),
  },
  tourCardInner: { padding: spacing.md, gap: spacing.sm },
  tourTimerText: { textAlign: 'center', fontWeight: '900', fontSize: fonts.sizes.xs },
  tourTimerTextDanger: { color: '#ef4444' },
  tourTimerTextOk: { color: '#22c55e' },
  tourMetaLabel: { color: 'rgba(255,255,255,0.70)', fontSize: 10, fontWeight: '700', textAlign: 'center' },
  tourName: { color: '#fff', fontWeight: '700', fontSize: fonts.sizes.sm, textAlign: 'center' },
  tourPlayersRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  tourPlayersMeta: { alignItems: 'center' },
  tourPlayersLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 10, fontWeight: '700' },
  tourPlayersValue: { color: '#fff', fontSize: fonts.sizes.sm, fontWeight: '900' },
  tourBar: { width: '100%', borderRadius: radius.md, paddingVertical: 10, alignItems: 'center', gap: 2 },
  tourBarGray: { backgroundColor: '#E5E7EB' },
  tourBarGold: { backgroundColor: 'transparent' },
  tourBarLabel: { color: '#111827', fontSize: 10, fontWeight: '800' },
  tourBarValue: { color: '#111827', fontSize: fonts.sizes.md, fontWeight: '900' },

  emptyText: { color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.xl },

  // Searching overlay
  searchingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  searchWrap: { width: '100%', alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  searchGlow: {
    position: 'absolute',
    width: 340,
    height: 340,
    borderRadius: 170,
    backgroundColor: '#22d3ee',
  },
  searchCard: {
    width: 360,
    maxWidth: '94%',
    borderRadius: radius.xl,
    paddingVertical: 22,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(0,0,0,0.35)',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0px 14px 28px rgba(0,0,0,0.50)' } as any) : { elevation: 8, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 10 } }),
  },
  searchSpinnerRow: { alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  searchTitle: { color: '#fff', fontSize: fonts.sizes.xl, fontWeight: '900', textAlign: 'center' },
  searchSubtitle: { color: 'rgba(255,255,255,0.72)', fontSize: fonts.sizes.sm, fontWeight: '700', textAlign: 'center', marginTop: 6, marginBottom: 14 },
  cancelBtn: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: radius.full,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  cancelBtnText: { color: '#fff', fontWeight: '900', fontSize: fonts.sizes.sm },

  // Modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center' },
  modalCard: {
    width: 320,
    backgroundColor: 'rgba(8,30,8,0.98)',
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(74,222,128,0.3)',
    padding: spacing.xl,
    gap: spacing.md,
  },
  modalTitle: { color: '#fff', fontWeight: '800', fontSize: fonts.sizes.xl, textAlign: 'center' },
  modalTourName: { color: colors.textMuted, fontSize: fonts.sizes.sm, textAlign: 'center' },
  modalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  modalLabel: {
    color: colors.textMuted,
    fontSize: fonts.sizes.sm,
    fontFamily: Platform.OS === 'web' ? ('Inria Sans' as any) : 'System',
  },
  modalValue: {
    color: '#fff',
    fontWeight: '700',
    fontSize: fonts.sizes.sm,
    fontFamily: Platform.OS === 'web' ? ('Inria Sans' as any) : 'System',
  },
  modalDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginVertical: spacing.xs },
  modalActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },

  modalBtnDisabled: { opacity: 0.6 },
  modalBtnCancel: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: radius.sm,
    paddingVertical: 10,
    alignItems: 'center',
  },
  modalBtnCancelText: { color: '#fff', fontWeight: '700', fontSize: fonts.sizes.sm },
  modalBtnConfirm: {
    flex: 1,
    backgroundColor: '#4ade80',
    borderRadius: radius.sm,
    paddingVertical: 10,
    alignItems: 'center',
  },
  modalBtnConfirmText: { color: '#000', fontWeight: '800', fontSize: fonts.sizes.sm },
});
