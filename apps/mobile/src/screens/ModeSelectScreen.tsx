import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as Location from 'expo-location';
import { BlurModal } from '../components/BlurModal';
import { getIntegrityToken } from '../services/integrity';
import {
  View, Text, StyleSheet, ScrollView, useWindowDimensions,
  TouchableOpacity, ActivityIndicator, RefreshControl,
  Platform, Animated, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, fonts, radius, shadows } from '../theme';
import { isTablet } from '../theme/responsive';
import { ScreenBackground } from '../components/ScreenBackground';
import { IconUser, IconUsers, IconTrophy } from '../components/Icons';
import { useGameStore } from '../store/game.store';
import { useAuthStore } from '../store/auth.store';
import { useTournamentStore } from '../store/tournament.store';
import { connectSocket } from '../services/socket';
import { api } from '../services/api';
import { toast } from '../store/toast.store';
import { GameTopBar, GradientToggle } from './HomeScreen';
import { IconX, IconVolumeUp, IconMusic, IconChevronRight } from '../components/Icons';
import { Pressable, Image } from 'react-native';

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

// Prize = buyIn × players × (1 − houseEdge).
// Default house edge is 10% (matches HOUSE_EDGE_PERCENT env var default).
// The backend applies the live value from SystemConfig; these display figures
// match that default so the lobby is consistent with what players actually win.
const HOUSE_EDGE = 0.10;
function prize1v1(buyIn: number) { return buyIn * 2 * (1 - HOUSE_EDGE); }
function prize2v2(buyIn: number) { return buyIn * 4 * (1 - HOUSE_EDGE) / 2; } // per-team prize

const LIVRE_1V1: RoomOption[] = [
  { id: 'l1', buyIn: null, prize: 0 },
  { id: 'l2', buyIn: 2,    prize: prize1v1(2)  },
  { id: 'l3', buyIn: 10,   prize: prize1v1(10) },
  { id: 'l4', buyIn: 25,   prize: prize1v1(25) },
  { id: 'l5', buyIn: 50,   prize: prize1v1(50) },
];

const LIVRE_2V2: RoomOption[] = [
  { id: 'd1', buyIn: null, prize: 0 },
  { id: 'd2', buyIn: 2,    prize: prize2v2(2)  },
  { id: 'd3', buyIn: 10,   prize: prize2v2(10) },
  { id: 'd4', buyIn: 25,   prize: prize2v2(25) },
  { id: 'd5', buyIn: 50,   prize: prize2v2(50) },
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
  is_in_person?: boolean;
  address?: string | null;
  checkin_time?: string | null;
  banner_url?: string | null;
}

const fmtBrl = (n: number | string | null | undefined) => {
  const v = Number(n ?? 0);
  return v % 1 === 0 ? `R$ ${v}` : `R$ ${v.toFixed(1).replace('.', ',')}`;
};

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
            <Text style={[styles.playersLabel, { color: textColor }]}>Jogadores</Text>
            <Text style={[styles.playersCount, { color: textColor }]}>{queuedCount}/{modeTotal}</Text>
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
            <Text style={[styles.playersLabel, { color: textColor }]}>Jogadores</Text>
            <Text style={[styles.playersCount, { color: textColor }]}>{queuedCount}/{modeTotal}</Text>
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

// ── In-Person Tournament Card (red) ─────────────────────────────────────────

function InPersonTournamentCard({ t, onPress }: { t: Tournament; onPress: () => void }) {
  const dateStr = new Date(t.starts_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });

  return (
    <TouchableOpacity style={styles.tourCard} onPress={onPress} activeOpacity={0.85}>
      <LinearGradient
        colors={['#040001', '#040001', '#7F0000']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.tourCardInner}
      >
        <Text style={[styles.tourTimerText, { color: '#fff' }]}>{dateStr}</Text>
        <Text style={[styles.tourMetaLabel, { color: 'rgba(255,255,255,0.7)' }]}>Presencial</Text>
        <Text style={styles.tourName} numberOfLines={1}>{t.name}</Text>

        <View style={styles.tourPlayersRow}>
          <IconUser size={16} color="#fff" />
          <View style={styles.tourPlayersMeta}>
            <Text style={[styles.tourPlayersLabel, { color: 'rgba(255,255,255,0.75)' }]}>Jogadores</Text>
            <Text style={styles.tourPlayersValue}>{t.current_players}/{t.max_players}</Text>
          </View>
        </View>

        <View style={[styles.tourBar, { backgroundColor: 'rgba(255,255,255,0.12)' }]}>
          <Text style={[styles.tourBarLabel, { color: '#fff' }]}>Inscrição</Text>
          <Text style={[styles.tourBarValue, { color: '#fff' }]}>R${t.entry_fee}</Text>
        </View>

        <View style={[styles.tourBar, { backgroundColor: '#7f1d1d' }]}>
          <Text style={[styles.tourBarLabel, { color: '#fff' }]}>📍 {t.address ? t.address.split(',')[0] : 'Local a confirmar'}</Text>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

// ── Main screen ─────────────────────────────────────────────────────────────

export function ModeSelectScreen({ navigation, route }: Props) {
  const mode = route.params?.mode ?? 'LIVRE';
  const isTorneio = IS_TORNEIO(mode);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isPortrait = screenHeight > screenWidth;

  const { user, refreshUser, setTokens, setUser } = useAuthStore();
  const { setQueueStatus, setLastQueue } = useGameStore();
  const setActiveTournament = useTournamentStore((s) => s.setActiveTournament);
  const activeTournament = useTournamentStore((s) => s.activeTournament);
  const [queueStats, setQueueStats] = useState<Record<string, { total: number; byBet: Record<string, number> }>>({});
  const [serverBotWaitSeconds, setServerBotWaitSeconds] = useState<number | null>(null);
  const [tournaments, setTournaments]   = useState<Tournament[]>([]);
  const [tourLoading, setTourLoading]   = useState(false);
  const [tourRefreshing, setTourRefreshing] = useState(false);
  const [confirmTour, setConfirmTour]   = useState<Tournament | null>(null);
  const [inPersonTour, setInPersonTour] = useState<Tournament | null>(null);
  const [inPersonName, setInPersonName] = useState('');
  const [inPersonCpf, setInPersonCpf]   = useState('');
  const [useAccountName, setUseAccountName] = useState(false);
  const [confirmRoom, setConfirmRoom]   = useState<{ room: RoomOption; section: '1v1' | '2v2' } | null>(null);
  const [joining, setJoining]           = useState(false);
  const [searching, setSearching]       = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [soundOn, setSoundOn]           = useState(true);
  const [musicOn, setMusicOn]           = useState(true);
  const searchPulseAnim = useRef(new Animated.Value(0)).current;
  const outerScrollRef = useRef<ScrollView>(null);
  const scrollRef1v1 = useRef<ScrollView>(null);
  const scrollRef2v2 = useRef<ScrollView>(null);
  const [section2v2Y, setSection2v2Y] = useState(0);

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
      const canAutoDevLogin = process.env.EXPO_PUBLIC_FORCE_DEV_LOGIN === 'true';

      if (!user && canAutoDevLogin) {
        try {
          // Generate a session-stable unique phone so each browser tab (incl. incognito)
          // auto-logs in as a distinct dev user. Without this, both tabs would receive
          // the same default user and matchmaking would never find a match.
          // Note: do NOT check existingToken here — an expired/invalid token would cause
          // refreshUser() to call logout() and wipe credentials, leaving the socket with
          // no token at all. Always call dev/login when user is null.
          let devPhone: string | undefined;
          if (typeof window !== 'undefined' && window.sessionStorage) {
            let stored = window.sessionStorage.getItem('dev_login_phone');
            if (!stored) {
              stored = `+5599${String(Date.now()).slice(-8)}`;
              window.sessionStorage.setItem('dev_login_phone', stored);
            }
            devPhone = stored;
          }
          const { data } = await api.post('/auth/dev/login', devPhone ? { phone: devPhone, name: `Dev ${devPhone.slice(-4)}` } : {});
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
          // Give the bot 15 extra seconds after it injects to create the match.
          // Cap at 90 s so the UI doesn't hang forever if the server is misconfigured.
          const waitMs = Math.max(30000, Math.min(90000, (botWaitSeconds + 15) * 1000));
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
      await setActiveTournament({
        tournamentId: tour.id,
        tournamentName: tour.name,
        startsAt: data.tournament?.starts_at ?? tour.starts_at,
        entryFee: Number(tour.entry_fee),
      });
      navigation.replace('TournamentWaiting', {
        tournamentId: tour.id,
        tournamentName: tour.name,
        startsAt: data.tournament?.starts_at ?? tour.starts_at,
        entryFee: Number(tour.entry_fee),
      });
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Erro ao entrar no torneio');
      setJoining(false);
    }
  };

  const handleJoinInPersonTournament = async () => {
    if (!inPersonTour) return;
    const trimmedName = (useAccountName ? (user?.name ?? inPersonName) : inPersonName).trim();
    const trimmedCpf = inPersonCpf.replace(/\D/g, '');
    if (!trimmedName) { toast.error('Informe seu nome completo'); return; }
    if (trimmedCpf.length !== 11) { toast.error('CPF inválido (11 dígitos)'); return; }
    const tour = inPersonTour;
    setJoining(true);
    try {
      await api.post(`/game/tournaments/${tour.id}/join`, {
        participantName: trimmedName,
        participantCpf: trimmedCpf,
      });
      await refreshUser();
      setInPersonTour(null);
      toast.success('Inscrição confirmada! Verifique seu e-mail.');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Erro ao comprar ingresso');
    } finally {
      setJoining(false);
    }
  };

  const rowGap = spacing.lg;
  const contentPad = spacing.xl;
  const sectionPad = spacing.xl;
  const sectionInnerWidth = Math.max(1, screenWidth - contentPad * 2 - sectionPad * 2);
  const MIN_CARD_W = 140;
  const calcW = (n: number) => Math.max(1, Math.floor((sectionInnerWidth - rowGap * (n - 1)) / n));
  const cardColumns = calcW(4) >= MIN_CARD_W ? 4 : calcW(3) >= MIN_CARD_W ? 3 : 2;
  const roomCardWidth = isPortrait ? Math.floor((sectionInnerWidth - rowGap) / 2) : calcW(cardColumns);

  return (
    <ScreenBackground style={styles.root}>
      <SafeAreaView style={styles.safe} edges={[]}>
      <GameTopBar
        user={user}
        onWallet={() => navigation.navigate('Wallet')}
        onSettings={() => setSettingsVisible(true)}
        onProfile={() => navigation.replace('Main')}
        exitVariant="back"
        onExit={() => (navigation.canGoBack?.() ? navigation.goBack() : navigation.replace('Main'))}
      />

      {/* Content */}
      <ScrollView
        ref={outerScrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { flexGrow: 1 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          isTorneio
            ? <RefreshControl refreshing={tourRefreshing} onRefresh={() => fetchTournaments(true)} tintColor="#1CBB3D" />
            : undefined
        }
      >
        {/* ── Livre mode ── */}
        {!isTorneio && (
          <>
            {/* Mode navigation pills */}
            <View style={styles.modeNavRow}>
              <TouchableOpacity
                style={styles.modeNavChip}
                onPress={() => outerScrollRef.current?.scrollTo({ y: 0, animated: true })}
                activeOpacity={0.8}
              >
                <Text style={styles.modeNavChipText}>Individual (1x1)</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modeNavChip}
                onPress={() => outerScrollRef.current?.scrollTo({ y: section2v2Y, animated: true })}
                activeOpacity={0.8}
              >
                <Text style={styles.modeNavChipText}>Duplas (2x2)</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.sectionContainer}>
              <View style={styles.sectionTitleRow}>
                <Text style={styles.sectionTitle}>Jogos individuais (1x1)</Text>
                {!isPortrait && (
                  <TouchableOpacity
                    onPress={() => scrollRef1v1.current?.scrollToEnd({ animated: true })}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
                    activeOpacity={0.7}
                  >
                    <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: fonts.sizes.xs, fontWeight: '700' }}>mais opções</Text>
                    <IconChevronRight size={16} color="rgba(255,255,255,0.45)" accessibilityLabel="Arraste para ver mais" />
                  </TouchableOpacity>
                )}
              </View>
              {isPortrait ? (
                <View style={styles.cardsGrid}>
                  {LIVRE_1V1.map((r) => {
                    const betAmount = r.buyIn ?? 0;
                    const queuedCount = queueStats['ARENA_1V1']?.byBet?.[String(betAmount)] ?? 0;
                    const modeTotal = queueStats['ARENA_1V1']?.total ?? 0;
                    return (
                      <RoomCard key={r.id} room={r} section="1v1" width={roomCardWidth} queuedCount={queuedCount} modeTotal={modeTotal} onJoin={() => setConfirmRoom({ room: r, section: '1v1' })} />
                    );
                  })}
                </View>
              ) : (
                <ScrollView ref={scrollRef1v1} horizontal showsHorizontalScrollIndicator={false} style={{ width: '100%' }} contentContainerStyle={styles.cardsRow}>
                  {LIVRE_1V1.map((r) => {
                    const betAmount = r.buyIn ?? 0;
                    const queuedCount = queueStats['ARENA_1V1']?.byBet?.[String(betAmount)] ?? 0;
                    const modeTotal = queueStats['ARENA_1V1']?.total ?? 0;
                    return (
                      <RoomCard key={r.id} room={r} section="1v1" width={roomCardWidth} queuedCount={queuedCount} modeTotal={modeTotal} onJoin={() => setConfirmRoom({ room: r, section: '1v1' })} />
                    );
                  })}
                </ScrollView>
              )}
            </View>

            <View
              style={styles.sectionContainer}
              onLayout={e => setSection2v2Y(e.nativeEvent.layout.y)}
            >
              <View style={styles.sectionTitleRow}>
                <Text style={styles.sectionTitle}>Jogos em duplas (2x2) com parceiro aleatório</Text>
                {!isPortrait && (
                  <TouchableOpacity
                    onPress={() => scrollRef2v2.current?.scrollToEnd({ animated: true })}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
                    activeOpacity={0.7}
                  >
                    <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: fonts.sizes.xs, fontWeight: '700' }}>mais opções</Text>
                    <IconChevronRight size={16} color="rgba(255,255,255,0.45)" accessibilityLabel="Arraste para ver mais" />
                  </TouchableOpacity>
                )}
              </View>
              {isPortrait ? (
                <View style={styles.cardsGrid}>
                  {LIVRE_2V2.map((r) => {
                    const betAmount = r.buyIn ?? 0;
                    const queuedCount = queueStats['RECREATIONAL_2V2']?.byBet?.[String(betAmount)] ?? 0;
                    const modeTotal = queueStats['RECREATIONAL_2V2']?.total ?? 0;
                    return (
                      <RoomCard key={r.id} room={r} section="2v2" width={roomCardWidth} queuedCount={queuedCount} modeTotal={modeTotal} onJoin={() => setConfirmRoom({ room: r, section: '2v2' })} />
                    );
                  })}
                </View>
              ) : (
                <ScrollView ref={scrollRef2v2} horizontal showsHorizontalScrollIndicator={false} style={{ width: '100%' }} contentContainerStyle={styles.cardsRow}>
                  {LIVRE_2V2.map((r) => {
                    const betAmount = r.buyIn ?? 0;
                    const queuedCount = queueStats['RECREATIONAL_2V2']?.byBet?.[String(betAmount)] ?? 0;
                    const modeTotal = queueStats['RECREATIONAL_2V2']?.total ?? 0;
                    return (
                      <RoomCard key={r.id} room={r} section="2v2" width={roomCardWidth} queuedCount={queuedCount} modeTotal={modeTotal} onJoin={() => setConfirmRoom({ room: r, section: '2v2' })} />
                    );
                  })}
                </ScrollView>
              )}
            </View>
          </>
        )}

        {/* ── Torneio mode ── */}
        {isTorneio && (
          <View style={styles.tourWrap}>
            <View style={styles.tourPanelWrap}>
              <View style={styles.tourGlow} />
              <LinearGradient
                colors={['rgba(187,255,0,0.18)', 'rgba(0,0,0,0.28)', 'rgba(28,187,61,0.12)']}
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
                  <ActivityIndicator color="#1CBB3D" />
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
                    t.is_in_person
                      ? <InPersonTournamentCard key={t.id} t={t} onPress={() => { setInPersonTour(t); setInPersonName(user?.name ?? ''); setInPersonCpf(''); setUseAccountName(!!user?.name); }} />
                      : <TournamentCard key={t.id} t={t} onJoin={() => {
                          if (activeTournament?.tournamentId === t.id) {
                            navigation.navigate('TournamentWaiting', {
                              tournamentId: t.id,
                              tournamentName: t.name,
                              startsAt: t.starts_at,
                              entryFee: Number(t.entry_fee),
                            });
                          } else {
                            setConfirmTour(t);
                          }
                        }} />
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
              colors={['rgba(34,211,238,0.14)', 'rgba(0,0,0,0.58)', 'rgba(28,187,61,0.16)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.searchCard}
            >
              <View style={styles.searchSpinnerRow}>
                <ActivityIndicator color="#1CBB3D" size="large" />
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
      <BlurModal visible={!!confirmTour} transparent animationType="fade">
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => !joining && setConfirmTour(null)}>
          <View style={styles.modalCard} onStartShouldSetResponder={() => true}>
            {confirmTour && (
              <>
                <View style={styles.modalInfoBox}>
                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>Prêmio total</Text>
                    <Text style={[styles.modalValue, { color: '#fbbf24' }]}>R$ {confirmTour.prize_pool.toLocaleString('pt-BR')}</Text>
                  </View>
                  <View style={styles.modalDivider} />
                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>Saldo atual</Text>
                    <Text style={styles.modalValue}>R$ {Number(user?.wallet?.real_balance ?? 0).toFixed(2)}</Text>
                  </View>
                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>Saldo após entrar</Text>
                    <Text style={[styles.modalValue, { color: '#1CBB3D' }]}>
                      R$ {Math.max(0, Number(user?.wallet?.real_balance ?? 0) - Number(confirmTour.entry_fee)).toFixed(2)}
                    </Text>
                  </View>
                  <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, textAlign: 'center' }}>Bônus não pode ser usado em torneios</Text>
                </View>
                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={[styles.modalBtnCancel, joining && styles.modalBtnDisabled]}
                    onPress={() => setConfirmTour(null)}
                    disabled={joining}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.modalBtnCancelText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalBtnConfirm, joining && styles.modalBtnDisabled]}
                    onPress={handleJoinTournament}
                    disabled={joining}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.modalBtnConfirmText}>{joining ? 'Confirmando...' : 'Confirmar'}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </TouchableOpacity>
      </BlurModal>

      {/* Match confirm modal */}
      <BlurModal visible={!!confirmRoom} transparent animationType="fade">
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => !searching && setConfirmRoom(null)}>
          <View style={styles.modalCard} onStartShouldSetResponder={() => true}>
            {confirmRoom && (
              <>
                <View style={styles.modalInfoBox}>
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
                        <Text style={styles.modalValue}>R$ {(Number(user?.wallet?.real_balance ?? 0) + Number(user?.wallet?.bonus_balance ?? 0)).toFixed(2)}</Text>
                      </View>
                      <View style={styles.modalRow}>
                        <Text style={styles.modalLabel}>Saldo após entrar</Text>
                        <Text style={[styles.modalValue, { color: '#1CBB3D' }]}>
                          R$ {Math.max(0, Number(user?.wallet?.real_balance ?? 0) + Number(user?.wallet?.bonus_balance ?? 0) - Number(confirmRoom.room.buyIn)).toFixed(2)}
                        </Text>
                      </View>
                    </>
                  )}
                </View>
                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={[styles.modalBtnCancel, searching && styles.modalBtnDisabled]}
                    onPress={() => setConfirmRoom(null)}
                    disabled={searching}
                    activeOpacity={0.8}
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
                    activeOpacity={0.8}
                  >
                    <Text style={styles.modalBtnConfirmText}>Confirmar</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </TouchableOpacity>
      </BlurModal>
      {/* In-person tournament modal */}
      <BlurModal visible={!!inPersonTour} transparent animationType="fade">
        <View style={styles.overlay} pointerEvents="box-none">
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => !joining && setInPersonTour(null)} />
          <ScrollView
            style={{ width: '100%' }}
            contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 24, paddingHorizontal: 20 }}
            keyboardShouldPersistTaps="handled"
            bounces={false}
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.modalCard, inPersonStyles.card]}>
              {inPersonTour && (
                <>
                  <View style={inPersonStyles.badge}>
                    <Text style={inPersonStyles.badgeText}>PRESENCIAL</Text>
                  </View>
                  <Text style={styles.modalTitle}>{inPersonTour.name}</Text>

                  {inPersonTour.address ? (
                    <View style={styles.modalRow}>
                      <Text style={styles.modalLabel}>Local</Text>
                      <Text style={[styles.modalValue, { flex: 1, textAlign: 'right' }]} numberOfLines={2}>{inPersonTour.address}</Text>
                    </View>
                  ) : null}

                  {inPersonTour.checkin_time ? (
                    <View style={styles.modalRow}>
                      <Text style={styles.modalLabel}>Check-in</Text>
                      <Text style={styles.modalValue}>
                        {new Date(inPersonTour.checkin_time).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                  ) : null}

                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>Inscrição</Text>
                    <Text style={styles.modalValue}>R$ {Number(inPersonTour.entry_fee).toFixed(2)}</Text>
                  </View>
                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>Prêmio</Text>
                    <Text style={[styles.modalValue, { color: '#fbbf24' }]}>R$ {inPersonTour.prize_pool.toLocaleString('pt-BR')}</Text>
                  </View>

                  <View style={styles.modalDivider} />

                  {/* Nome completo com toggle conta/manual */}
                  <View style={inPersonStyles.fieldRow}>
                    <Text style={inPersonStyles.fieldLabel}>Nome completo</Text>
                    {user?.name ? (
                      <View style={inPersonStyles.toggleRow}>
                        <TouchableOpacity
                          style={[inPersonStyles.toggleChip, useAccountName && inPersonStyles.toggleChipActive]}
                          onPress={() => { setUseAccountName(true); setInPersonName(user.name ?? ''); }}
                        >
                          <Text style={[inPersonStyles.toggleChipText, useAccountName && inPersonStyles.toggleChipTextActive]}>Da conta</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[inPersonStyles.toggleChip, !useAccountName && inPersonStyles.toggleChipActive]}
                          onPress={() => { setUseAccountName(false); setInPersonName(''); }}
                        >
                          <Text style={[inPersonStyles.toggleChipText, !useAccountName && inPersonStyles.toggleChipTextActive]}>Manual</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                  <TextInput
                    style={[inPersonStyles.input, useAccountName && inPersonStyles.inputLocked]}
                    value={useAccountName ? (user?.name ?? '') : inPersonName}
                    onChangeText={useAccountName ? undefined : setInPersonName}
                    placeholder="Como no documento"
                    placeholderTextColor="rgba(255,255,255,0.35)"
                    autoCorrect={false}
                    editable={!joining && !useAccountName}
                  />

                  <Text style={inPersonStyles.fieldLabel}>CPF</Text>
                  <TextInput
                    style={inPersonStyles.input}
                    value={inPersonCpf}
                    onChangeText={(v) => setInPersonCpf(v.replace(/\D/g, '').slice(0, 11))}
                    placeholder="000.000.000-00"
                    placeholderTextColor="rgba(255,255,255,0.35)"
                    keyboardType="numeric"
                    editable={!joining}
                  />

                  <View style={styles.modalActions}>
                    <TouchableOpacity
                      style={[styles.modalBtnCancel, joining && styles.modalBtnDisabled]}
                      onPress={() => setInPersonTour(null)}
                      disabled={joining}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.modalBtnCancelText}>Cancelar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[inPersonStyles.confirmBtn, joining && styles.modalBtnDisabled]}
                      onPress={handleJoinInPersonTournament}
                      disabled={joining}
                      activeOpacity={0.85}
                    >
                      <Text style={inPersonStyles.confirmBtnText}>{joining ? 'Enviando...' : 'Comprar Ingresso'}</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          </ScrollView>
        </View>
      </BlurModal>

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
    width: Platform.OS === 'web' ? 640 : (isTablet ? '75%' : 520),
    maxWidth: Platform.OS === 'web' ? 700 : (isTablet ? 780 : 560),
    backgroundColor: colors.bgCard,
    borderRadius: radius.xl,
    padding: isTablet ? 24 : SETTINGS_CARD_PAD,
    gap: isTablet ? 20 : SETTINGS_ITEM_GAP,
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

const LIME = '#1CBB3D';

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
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  sectionTitle: {
    flex: 1,
    color: '#fff',
    fontWeight: '900',
    fontSize: fonts.sizes.xl,
  },
  scrollHint: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: fonts.sizes.sm,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: -spacing.xs,
    marginBottom: spacing.sm,
  },
  modeNavRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  modeNavChip: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: radius.full,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  modeNavChipText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: fonts.sizes.sm,
  },
  cardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
    justifyContent: 'center',
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
  roomCardInner: { padding: spacing.sm, gap: spacing.xs, minHeight: 100 },
  cardTop: { flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, width: '100%' },
  playersIconWrap: { width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.18)', alignItems: 'center', justifyContent: 'center' },
  playersMeta: { flexDirection: 'column', gap: 2, alignItems: 'center' },
  playersLabel: { fontSize: fonts.sizes.sm, fontWeight: '800', textAlign: 'center', fontFamily: Platform.OS === 'web' ? ('Poppins' as any) : 'System' },
  playersCount: { fontSize: fonts.sizes.sm, fontWeight: '900', textAlign: 'center', fontFamily: Platform.OS === 'web' ? ('Poppins' as any) : 'System' },
  cardDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.18)' },
  cardDividerDark: { backgroundColor: 'rgba(17,24,39,0.14)' },
  fullBar: {
    width: '100%',
    borderRadius: radius.md,
    backgroundColor: '#E5E7EB',
    paddingVertical: 4,
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
    width: 180,
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
    width: isTablet ? 540 : 360,
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
  searchTitle: { color: '#fff', fontSize: isTablet ? fonts.sizes.xxl : fonts.sizes.xl, fontWeight: '900', textAlign: 'center' },
  searchSubtitle: { color: 'rgba(255,255,255,0.72)', fontSize: isTablet ? fonts.sizes.md : fonts.sizes.sm, fontWeight: '700', textAlign: 'center', marginTop: 6, marginBottom: 14 },
  cancelBtn: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: radius.full,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  cancelBtnText: { color: '#fff', fontWeight: '900', fontSize: isTablet ? fonts.sizes.md : fonts.sizes.sm },

  // Modal - Estilo KYC
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center' },
  modalCard: {
    width: '88%',
    maxWidth: isTablet ? 580 : 360,
    maxHeight: '88%',
    backgroundColor: '#082006',
    borderRadius: radius.xl,
    borderWidth: 2,
    borderColor: '#0F400B',
    padding: isTablet ? spacing.xxl : spacing.xl,
    gap: isTablet ? spacing.lg : spacing.md,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 8px 32px rgba(0,0,0,0.5)' } as any)
      : {
          elevation: 10,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.5,
          shadowRadius: 16,
        }),
  },
  modalHeaderIcon: { alignItems: 'center', marginBottom: spacing.sm },
  modalIcon: { fontSize: 32 },
  modalTitle: { color: '#fff', fontWeight: '800', fontSize: isTablet ? fonts.sizes.xl : fonts.sizes.lg, textAlign: 'center', marginBottom: spacing.sm },
  modalTourName: { color: '#a3c4a3', fontSize: fonts.sizes.sm, textAlign: 'center', marginBottom: spacing.sm },
  modalInfoBox: {
    backgroundColor: 'rgba(14, 41, 15, 0.6)',
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(31, 93, 24, 0.3)',
  },
  modalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalLabel: {
    color: '#a3c4a3',
    fontSize: isTablet ? fonts.sizes.md : fonts.sizes.sm,
    fontWeight: '600',
  },
  modalValue: {
    color: '#fff',
    fontWeight: '700',
    fontSize: isTablet ? fonts.sizes.md : fonts.sizes.sm,
  },
  modalDivider: { height: 1, backgroundColor: 'rgba(31, 93, 24, 0.5)', marginVertical: spacing.sm },
  modalActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },

  modalBtnDisabled: { opacity: 0.5 },
  modalBtnCancel: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#4F4E47',
    backgroundColor: '#4F4E47',
    borderRadius: radius.full,
    paddingVertical: isTablet ? 16 : 12,
    alignItems: 'center',
  },
  modalBtnCancelText: { color: '#fff', fontWeight: '700', fontSize: isTablet ? fonts.sizes.md : fonts.sizes.sm },
  modalBtnConfirm: {
    flex: 1,
    backgroundColor: '#0F400B',
    borderWidth: 2,
    borderColor: '#1F5D18',
    borderRadius: radius.full,
    paddingVertical: isTablet ? 16 : 12,
    alignItems: 'center',
  },
  modalBtnConfirmText: { color: '#fff', fontWeight: '800', fontSize: isTablet ? fonts.sizes.md : fonts.sizes.sm },
});

const inPersonStyles = StyleSheet.create({
  card: {
    borderColor: 'rgba(185,28,28,0.55)',
    width: isTablet ? '80%' : 340,
    maxWidth: isTablet ? 580 : 380,
  },
  badge: {
    alignSelf: 'center',
    backgroundColor: '#991b1b',
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 14,
  },
  badgeText: { color: '#fca5a5', fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  fieldLabel: { color: 'rgba(255,255,255,0.6)', fontSize: fonts.sizes.xs, fontWeight: '700', marginBottom: 4 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: radius.sm,
    color: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: fonts.sizes.sm,
    marginBottom: spacing.sm,
  },
  confirmBtn: {
    flex: 1,
    backgroundColor: '#b91c1c',
    borderRadius: radius.sm,
    paddingVertical: 10,
    alignItems: 'center',
  },
  confirmBtnText: { color: '#fff', fontWeight: '800', fontSize: fonts.sizes.sm },
  fieldRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  toggleRow: { flexDirection: 'row', gap: 4 },
  toggleChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  toggleChipActive: {
    borderColor: '#b91c1c',
    backgroundColor: 'rgba(185,28,28,0.25)',
  },
  toggleChipText: { color: 'rgba(255,255,255,0.55)', fontSize: 10, fontWeight: '700' },
  toggleChipTextActive: { color: '#fca5a5' },
  inputLocked: {
    opacity: 0.6,
    borderColor: 'rgba(185,28,28,0.35)',
  },
});
