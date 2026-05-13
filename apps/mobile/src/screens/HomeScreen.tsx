import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet,
  TouchableOpacity, Modal, Image, Platform, Pressable, Animated, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { colors, spacing, fonts, radius, shadows } from '../theme';
import { ScreenBackground } from '../components/ScreenBackground';
import { useAuthStore } from '../store/auth.store';
import { toast } from '../store/toast.store';
import { connectSocket } from '../services/socket';
import { ConsentModal } from '../components/ConsentModal';
import { WalletBalanceButton } from '../components/Button';
import { IconSettings, IconStar, IconLogOut, IconX, IconVolumeUp, IconMusic, IconChevronLeft } from '../components/Icons';

type Props = { navigation: NativeStackNavigationProp<any> };

// ─── Shared top-bar used across logged-in screens ──────────────────────────

const SETTINGS_CARD_PAD = Platform.OS === 'web' ? 24 : 16;
const SETTINGS_ITEM_GAP = Platform.OS === 'web' ? 24 : 16;

function LevelStarBadge({ level, size = 24 }: { level: string; size?: number }) {
  return (
    <View style={[styles.levelBadge, { width: size, height: size }]}>
      <Svg {...({ xmlns: 'http://www.w3.org/2000/svg' } as any)} width={size} height={size} viewBox="0 0 24 24">
        <Path
          d="M12 2l2.82 6.63L22 9.24l-5.46 4.73L18.18 21 12 17.27 5.82 21l1.64-7.03L2 9.24l7.18-.61L12 2z"
          fill="#FFD400"
        />
      </Svg>
      <Text style={[styles.levelBadgeText, { fontSize: Math.max(9, Math.round(size * 0.2)) }]}>{level}</Text>
    </View>
  );
}

export function GradientToggle({
  value,
  onValueChange,
  pressableTestID,
  accessibilityLabel,
  kind,
}: {
  value: boolean;
  onValueChange: (next: boolean) => void;
  pressableTestID?: string;
  accessibilityLabel?: string;
  kind?: 'sound' | 'music';
}) {
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    if (process.env.NODE_ENV === 'test') {
      anim.setValue(value ? 1 : 0);
      return;
    }

    const a = Animated.timing(anim, {
      toValue: value ? 1 : 0,
      duration: 160,
      useNativeDriver: false,
    });
    a.start();
    return () => a.stop();
  }, [anim, value]);

  const thumbBgColor = value ? '#EDF186' : '#FA8A28';
  const iconColor = value ? '#0a1f0a' : '#ffffff';

  const translateX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [2, 88 - 34 - 2],
  });

  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      style={toggleStyles.hit}
      testID={pressableTestID}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value }}
      hitSlop={8}
    >
      <View style={toggleStyles.track}>
        <Animated.View style={[toggleStyles.thumbWrap, { transform: [{ translateX }] }]}>
          <View style={[toggleStyles.thumb, { backgroundColor: thumbBgColor, alignItems: 'center', justifyContent: 'center' }]}>
            {kind === 'sound' ? (
              <IconVolumeUp size={18} color={iconColor} accessibilityLabel="Som" />
            ) : kind === 'music' ? (
              <IconMusic size={18} color={iconColor} accessibilityLabel="Música" />
            ) : null}
          </View>
        </Animated.View>
      </View>
    </Pressable>
  );
}

const toggleStyles = StyleSheet.create({
  hit: { width: 92, height: 44, justifyContent: 'center' },
  track: {
    width: 88,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    paddingHorizontal: 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  thumbWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    overflow: 'hidden',
  },
  thumb: { width: '100%', height: '100%' },
});

export function GameTopBar({
  user,
  onSettings,
  onExit,
  onWallet,
  onProfile,
  exitVariant = 'logout',
  level: levelProp,
}: {
  user: any;
  onSettings?: () => void;
  onExit?: () => void;
  onWallet?: () => void;
  onProfile?: () => void;
  exitVariant?: 'logout' | 'back';
  level?: number;
}) {
  const balance = user?.wallet?.real_balance ?? 0;
  const level   = levelProp ?? 2;

  return (
    <View style={topBar.bar}>
      {/* Left: avatar + name + level (tappable → profile) */}
      <TouchableOpacity style={topBar.left} onPress={onProfile} activeOpacity={0.75}>
        <View style={topBar.avatar}>
          {user?.avatar ? (
            <Image source={{ uri: user.avatar }} style={topBar.avatarImg} />
          ) : (
            <Text style={topBar.avatarText}>{user?.name?.[0]?.toUpperCase() || '?'}</Text>
          )}
        </View>
        <View>
          <Text style={topBar.name}>{user?.name || 'Jogador'}</Text>
          <Text style={topBar.level}>Lev: {String(level).padStart(2, '0')}</Text>
        </View>
      </TouchableOpacity>

      {/* Right: balance + add + settings + exit */}
      <View style={topBar.right}>
        <WalletBalanceButton balance={balance} onPress={onWallet} />

        <TouchableOpacity style={topBar.iconBtn} onPress={onSettings} testID="topbar-settings" accessibilityLabel="Abrir configurações">
          <IconSettings size={20} color="#fff" accessibilityLabel="Configurações" />
        </TouchableOpacity>

        <TouchableOpacity
          style={topBar.iconBtn}
          onPress={onExit}
          testID={exitVariant === 'back' ? 'topbar-back' : 'topbar-logout'}
          accessibilityLabel={exitVariant === 'back' ? 'Voltar' : 'Sair'}
        >
          {exitVariant === 'back' ? (
            <IconChevronLeft size={20} color="#fff" accessibilityLabel="Voltar" />
          ) : (
            <IconLogOut size={20} color="#fff" accessibilityLabel="Sair" />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Minimal TopBar without balance button (for KYC/Wallet screens) ─────────
export function GameTopBarMinimal({
  user,
  onSettings,
  onExit,
  onProfile,
  exitVariant = 'back',
}: {
  user: any;
  onSettings?: () => void;
  onExit?: () => void;
  onProfile?: () => void;
  exitVariant?: 'logout' | 'back';
}) {
  return (
    <View style={topBar.bar}>
      {/* Left: avatar + name + level (tappable → profile) */}
      <TouchableOpacity style={topBar.left} onPress={onProfile} activeOpacity={0.75}>
        <View style={topBar.avatar}>
          {user?.avatar ? (
            <Image source={{ uri: user.avatar }} style={topBar.avatarImg} />
          ) : (
            <Text style={topBar.avatarText}>{user?.name?.[0]?.toUpperCase() || '?'}</Text>
          )}
        </View>
        <View>
          <Text style={topBar.name}>{user?.name || 'Jogador'}</Text>
          <Text style={topBar.level}>Lev: {String(user?.level || 1).padStart(2, '0')}</Text>
        </View>
      </TouchableOpacity>

      {/* Right: settings + exit (no balance) */}
      <View style={topBar.right}>
        <TouchableOpacity style={topBar.iconBtn} onPress={onSettings} testID="topbar-settings" accessibilityLabel="Abrir configurações">
          <IconSettings size={20} color="#fff" accessibilityLabel="Configurações" />
        </TouchableOpacity>

        <TouchableOpacity
          style={topBar.iconBtn}
          onPress={onExit}
          testID={exitVariant === 'back' ? 'topbar-back' : 'topbar-logout'}
          accessibilityLabel={exitVariant === 'back' ? 'Voltar' : 'Sair'}
        >
          {exitVariant === 'back' ? (
            <IconChevronLeft size={20} color="#fff" accessibilityLabel="Voltar" />
          ) : (
            <IconLogOut size={20} color="#fff" accessibilityLabel="Sair" />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const topBar = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: 'rgba(24, 73, 18, 0.92)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(187, 255, 0, 0.18)',
    minHeight: 84,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatar: {
    width: 54, height: 54, borderRadius: 27,
    backgroundColor: '#184912',
    borderWidth: 2,
    borderColor: 'rgba(187, 255, 0, 0.35)',
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: fonts.sizes.md },
  name:   { color: '#fff', fontWeight: '700', fontSize: fonts.sizes.md },
  level:  { color: colors.textMuted, fontSize: fonts.sizes.xs },
  right:  { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  balanceWrap: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.25)',
  },
  balancePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: 14,
    paddingRight: 10,
    paddingVertical: 8,
  },
  balanceText: { color: '#0a1f0a', fontWeight: '900', fontSize: fonts.sizes.sm },
  balancePlus: {
    width: 22, height: 22,
    borderRadius: 6,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  balancePlusText: { color: '#fff', fontWeight: '900', fontSize: 14, lineHeight: 16 },
  iconBtn: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(187, 255, 0, 0.22)',
    alignItems: 'center', justifyContent: 'center',
  },
  iconText: { color: '#fff', fontSize: 16 },
});

// ─── Main HomeScreen ────────────────────────────────────────────────────────

export function HomeScreen({ navigation }: Props) {
  const { user } = useAuthStore();
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [profileVisible, setProfileVisible]   = useState(false);
  const [logoutVisible, setLogoutVisible]     = useState(false);
  const [soundOn, setSoundOn]   = useState(true);
  const [musicOn, setMusicOn]   = useState(true);
  const [onlineCount, setOnlineCount] = useState(0);
  const [profileAvatarUri, setProfileAvatarUri] = useState<string | null>(null);
  const [profileStatsLoading, setProfileStatsLoading] = useState(false);
  const [profileStats, setProfileStats] = useState({
    totalWins: 0,
    winRate: 0,
    tournamentsWon: 0,
    totalGames: 0,
  });

  useEffect(() => {
    (async () => {
      try {
        const socket = await connectSocket();
        socket.on('online:count', ({ count }: { count: number }) => setOnlineCount(count));
      } catch {}
    })();
  }, []);

  useEffect(() => {
    if (!profileVisible) return;
    setProfileAvatarUri(user?.avatar ?? null);
  }, [profileVisible, user?.avatar]);

  useEffect(() => {
    if (!profileVisible) return;
    if (process.env.NODE_ENV === 'test') return;

    let cancelled = false;

    (async () => {
      const userId = user?.id;
      if (!userId) {
        setProfileStats({ totalWins: 0, winRate: 0, tournamentsWon: 0, totalGames: 0 });
        return;
      }

      setProfileStatsLoading(true);
      try {
        const mod = await import('../services/api');
        const apiClient = mod.api;
        const games: any[] = [];
        for (let page = 1; page <= 5; page++) {
          const { data } = await apiClient.get(`/game/history?page=${page}`);
          const list = data?.games ?? [];
          games.push(...list);
          if (list.length < 10) break;
        }

        const wins = games.filter((g) => (g?.winner_id ?? g?.winnerId) === userId).length;
        const total = games.length;
        const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
        const tournamentIds = new Set<string>();
        for (const g of games) {
          const tid = g?.tournamentId ?? g?.tournament_id;
          if (tid && (g?.winner_id ?? g?.winnerId) === userId) tournamentIds.add(tid);
        }

        if (!cancelled) {
          setProfileStats({
            totalWins: wins,
            winRate,
            tournamentsWon: tournamentIds.size,
            totalGames: total,
          });
        }
      } catch {
        if (!cancelled) setProfileStats({ totalWins: 0, winRate: 0, tournamentsWon: 0, totalGames: 0 });
      } finally {
        if (!cancelled) setProfileStatsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [profileVisible, user?.id]);

  const levelValue = Math.max(1, Math.min(99, Math.floor(profileStats.totalGames / 10) + 1));
  const levelText = String(levelValue);

  const onPickProfileAvatar = async () => {
    if (process.env.NODE_ENV === 'test') return;
    try {
      const isWeb = typeof document !== 'undefined';
      if (isWeb) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = () => {
          const file = input.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = async () => {
            const uri = typeof reader.result === 'string' ? reader.result : null;
            if (!uri) return;
            setProfileAvatarUri(uri);
            const st = (useAuthStore as any).getState?.();
            if (st?.setAvatar) await st.setAvatar(uri);
            else if (st?.user && st?.setUser) st.setUser({ ...st.user, avatar: uri });
          };
          reader.readAsDataURL(file);
        };
        input.click();
        return;
      }

      const ImagePicker = await import('expo-image-picker');
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        toast.warning('Permissão para fotos negada.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });
      if (result.canceled) return;
      const uri = result.assets?.[0]?.uri;
      if (!uri) return;

      setProfileAvatarUri(uri);

      const st = (useAuthStore as any).getState?.();
      if (st?.setAvatar) await st.setAvatar(uri);
      else if (st?.user && st?.setUser) st.setUser({ ...st.user, avatar: uri });
    } catch {
      toast.error('Não foi possível abrir suas fotos.');
    }
  };

  const handleLogout = () => {
    setProfileVisible(false);
    setLogoutVisible(false);
    useAuthStore.getState().logout().then(() => navigation.replace('Login'));
  };

  return (
    <ScreenBackground style={styles.root}>
      <SafeAreaView style={styles.safe}>
      <ConsentModal onAccepted={() => {}} />

      {/* Top bar */}
      <GameTopBar
        user={user}
        onSettings={() => setSettingsVisible(true)}
        onExit={() => setLogoutVisible(true)}
        onWallet={() => navigation.navigate('Wallet')}
        onProfile={() => setProfileVisible(true)}
        level={levelValue}
      />

      {/* Center content */}
      <View style={styles.center}>
        <Text style={styles.title}>Escolha o modo de jogo</Text>
        <Text style={[styles.subtitle, { color: '#ffffff' }]}>Escolha como você quer jogar: individual ou time</Text>
        <View style={styles.modeRow}>
          {/* Livre button — cyan */}
          <TouchableOpacity
            style={styles.modeBtn}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('ModeSelect', { mode: 'LIVRE' })}
          >
            <LinearGradient
              colors={['#22d3ee', '#0891b2']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.modeBtnGrad}
            >
              <Text style={styles.modeBtnText}>Livre</Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* Torneio button — yellow/gold */}
          <TouchableOpacity
            style={styles.modeBtn}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('ModeSelect', { mode: 'TORNEIO' })}
          >
            <LinearGradient
              colors={['#fbbf24', '#d97706']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.modeBtnGrad}
            >
              <Text style={styles.modeBtnText}>Torneio</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Settings Modal (Configurações) ── */}
      <Modal visible={settingsVisible} transparent animationType="fade">
        <Pressable
          style={styles.overlay}
          onPress={() => setSettingsVisible(false)}
          testID="settings-overlay"
        >
          <Pressable
            style={styles.settingsCard}
            onPress={() => {}}
            onStartShouldSetResponder={() => true}
            testID="settings-card"
          >
            <View style={[styles.settingsTextureWrap, (Platform.OS === 'web' ? ({ pointerEvents: 'none' } as any) : null)]}>
              <Image
                source={require('../../assets/e27c2e8e377e60057010a8431706b96b0152436f.png')}
                style={styles.settingsTexture}
                resizeMode="cover"
              />
            </View>

            <View style={styles.modalHeader}>
              <View style={{ width: 26 }} />
              <Text style={styles.settingsTitle}>Configurações</Text>
              <TouchableOpacity onPress={() => setSettingsVisible(false)} accessibilityLabel="Fechar configurações">
                <IconX size={26} color="#fff" accessibilityLabel="Fechar" />
              </TouchableOpacity>
            </View>

            <View style={styles.settingItem}>
              <Text style={styles.settingLabel}>Som:</Text>
              <GradientToggle
                value={soundOn}
                onValueChange={setSoundOn}
                pressableTestID="settings-sound-toggle"
                accessibilityLabel="Som"
                kind="sound"
              />
            </View>

            <View style={styles.settingItem}>
              <Text style={styles.settingLabel}>Música:</Text>
              <GradientToggle
                value={musicOn}
                onValueChange={setMusicOn}
                pressableTestID="settings-music-toggle"
                accessibilityLabel="Música"
                kind="music"
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Profile Modal ── */}
      <Modal visible={profileVisible} transparent animationType="fade">
        <Pressable
          style={styles.overlay}
          onPress={() => setProfileVisible(false)}
        >
          <Pressable style={styles.profileCard} onPress={() => {}} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <View style={{ width: 26 }} />
              <Text style={styles.settingsTitle}>Perfil</Text>
              <TouchableOpacity onPress={() => setProfileVisible(false)}>
                <IconX size={26} color="#fff" accessibilityLabel="Fechar" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.profileScroll} contentContainerStyle={styles.profileScrollContent} showsVerticalScrollIndicator={false}>
              <View style={styles.profileBody}>
                {/* Left: avatar + info */}
                <View style={styles.profileLeft}>
                  <TouchableOpacity style={styles.profileAvatar} activeOpacity={0.85} onPress={onPickProfileAvatar}>
                    {profileAvatarUri ? (
                      <Image source={{ uri: profileAvatarUri }} style={styles.profileAvatarImg} />
                    ) : (
                      <Text style={styles.profileAvatarText}>{user?.name?.[0]?.toUpperCase() || '?'}</Text>
                    )}
                  </TouchableOpacity>
                  <Text style={styles.profileName}>{user?.name || 'Jogador'}</Text>
                  <Text style={styles.profileBadge}>Bronze</Text>
                  <View style={styles.profileStarContainer}>
                    <LevelStarBadge level={profileStatsLoading ? '--' : levelText} size={44} />
                  </View>
                  <View style={styles.xpBarBg}>
                    <View style={[styles.xpBarFill, { width: '40%' }]} />
                  </View>
                </View>

                {/* Right: stats */}
                <View style={styles.profileRight}>
                  <Text style={styles.statLabel}>Total de vitórias</Text>
                  <View style={styles.statPill}>
                    <Text style={styles.statValue}>{profileStatsLoading ? '...' : String(profileStats.totalWins)}</Text>
                  </View>

                  <Text style={styles.statLabel}>Taxa de vitória</Text>
                  <View style={styles.statPill}>
                    <Text style={styles.statValue}>{profileStatsLoading ? '...' : `${profileStats.winRate}%`}</Text>
                  </View>

                  <Text style={styles.statLabel}>Torneios ganhos</Text>
                  <View style={styles.statPill}>
                    <Text style={styles.statValue}>{profileStatsLoading ? '...' : String(profileStats.tournamentsWon)}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.profileActions}>
                <LinearGradient colors={['#BEF311', '#1CBB3D']} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.profileActionGrad}>
                  <TouchableOpacity activeOpacity={0.85} onPress={() => { setProfileVisible(false); navigation.navigate('History'); }}>
                    <Text style={styles.profileActionTextDark}>Histórico De Partidas</Text>
                  </TouchableOpacity>
                </LinearGradient>
                <LinearGradient colors={['#BEF311', '#1CBB3D']} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.profileActionGrad}>
                  <TouchableOpacity activeOpacity={0.85} onPress={() => { setProfileVisible(false); navigation.navigate('Achievements'); }}>
                    <Text style={styles.profileActionTextDark}>Conquistas</Text>
                  </TouchableOpacity>
                </LinearGradient>
                <LinearGradient colors={['#ffd700', '#ca8a04']} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.profileActionGrad}>
                  <TouchableOpacity activeOpacity={0.85} onPress={() => { setProfileVisible(false); navigation.navigate('Leaderboard'); }}>
                    <Text style={styles.profileActionTextDark}>Liga & Ranking</Text>
                  </TouchableOpacity>
                </LinearGradient>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={logoutVisible} transparent animationType="fade">
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setLogoutVisible(false)}
        >
          <View style={styles.logoutCard} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Sair</Text>
              <TouchableOpacity onPress={() => setLogoutVisible(false)}>
                <IconX size={18} color="#fff" accessibilityLabel="Fechar" />
              </TouchableOpacity>
            </View>

            <Text style={styles.logoutText}>Tem certeza que deseja sair da sua conta?</Text>

            <View style={styles.logoutActions}>
              <TouchableOpacity style={styles.logoutCancelBtn} onPress={() => setLogoutVisible(false)} activeOpacity={0.85}>
                <Text style={styles.logoutCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.logoutConfirmBtn} onPress={handleLogout} activeOpacity={0.85}>
                <Text style={styles.logoutConfirmText}>Sair</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a1f0a' },
  safe: { flex: 1 },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
    paddingHorizontal: spacing.xxl,
  },

  title: {
    fontSize: fonts.sizes.xl,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: fonts.sizes.sm,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: -spacing.md,
  },

  modeRow: {
    flexDirection: 'row',
    gap: spacing.xl,
    marginTop: spacing.xs,
  },

  modeBtn: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#BBFF00',
    backgroundColor: 'rgba(0,0,0,0.25)',
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0px 4px 8px rgba(0,0,0,0.40)' } as any)
      : {
          elevation: 6,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.4,
          shadowRadius: 8,
        }),
  },
  modeBtnGrad: {
    paddingVertical: spacing.xxxl,
    paddingHorizontal: 92,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 300,
    minHeight: 120,
    borderRadius: radius.lg - 3,
  },
  modeBtnText: {
    fontSize: fonts.sizes.xxl,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 1,
  },

  // Overlay
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Settings modal
  settingsCard: {
    width: Platform.OS === 'web' ? 640 : 520,
    backgroundColor: colors.bgCard,
    borderRadius: radius.xl,
    padding: SETTINGS_CARD_PAD,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#BBFF00',
    gap: SETTINGS_ITEM_GAP,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0px 8px 20px rgba(0,0,0,0.45)' } as any) : shadows.card),
  },
  settingsTextureWrap: {
    ...StyleSheet.absoluteFillObject,
  },
  settingsTexture: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.12,
    width: '140%',
    height: '140%',
    top: '-20%',
    left: '-20%',
    ...(Platform.OS === 'web' ? ({ objectFit: 'cover', objectPosition: 'center' } as any) : null),
  } as any,
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: { fontSize: fonts.sizes.lg, fontWeight: '700', color: '#fff' },
  settingsTitle: {
    fontSize: fonts.sizes.xxxl,
    fontWeight: '900',
    color: '#fff',
    textAlign: 'center',
    flex: 1,
    fontFamily: Platform.OS === 'web' ? ('Inria Sans' as any) : 'System',
  },
  closeBtn:   { color: colors.textMuted, fontSize: fonts.sizes.lg, fontWeight: '700' },

  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SETTINGS_CARD_PAD,
    paddingVertical: SETTINGS_ITEM_GAP,
    borderRadius: radius.lg,
    borderWidth: 0,
    overflow: 'hidden',
  },
  settingLabel: {
    fontSize: fonts.sizes.xl,
    color: '#fff',
    fontWeight: '800',
    fontFamily: Platform.OS === 'web' ? ('Inria Sans' as any) : 'System',
  },

  // Profile modal
  profileCard: {
    width: Platform.OS === 'web' ? 640 : '92%',
    maxWidth: 520,
    maxHeight: '88%',
    flex: 1,
    backgroundColor: colors.bgCard,
    borderRadius: radius.xl,
    paddingHorizontal: SETTINGS_CARD_PAD,
    paddingTop: Math.max(10, SETTINGS_CARD_PAD - 6),
    paddingBottom: Math.max(6, SETTINGS_CARD_PAD - 10),
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#BBFF00',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0px 8px 20px rgba(0,0,0,0.45)' } as any) : shadows.card),
  },
  profileScroll: {
    flex: 1,
  },
  profileScrollContent: {
    gap: Math.max(10, SETTINGS_ITEM_GAP - 6),
  },
  profileBody: {
    flexDirection: 'row',
    gap: spacing.xl,
    alignItems: 'flex-start',
  },
  profileLeft: { alignItems: 'center', gap: spacing.sm, width: 140 },
  profileAvatar: {
    width: 72, height: 72, borderRadius: 8,
    backgroundColor: '#4a7c4a',
    alignItems: 'center', justifyContent: 'center',
  },
  profileAvatarImg: { width: '100%', height: '100%' },
  profileAvatarText: { color: '#fff', fontSize: 32, fontWeight: '700' },
  profileName:  { color: '#fff', fontWeight: '700', fontSize: fonts.sizes.md, fontFamily: Platform.OS === 'web' ? ('Inria Sans' as any) : 'System' },
  profileBadge: { color: '#cd7f32', fontSize: fonts.sizes.sm, fontWeight: '600' },
  profileStarContainer: { marginBottom: spacing.sm },
  levelBadge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelBadgeText: {
    position: 'absolute',
    color: '#0a1f0a',
    fontWeight: '900',
    fontFamily: Platform.OS === 'web' ? ('Inria Sans' as any) : 'System',
  },
  xpBarBg: {
    width: '100%', height: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 3, overflow: 'hidden',
  },
  xpBarFill: { height: '100%', backgroundColor: '#4ade80', borderRadius: 3 },

  profileRight: { flex: 1, gap: spacing.sm },
  statLabel: { color: colors.textMuted, fontSize: fonts.sizes.xs },
  statPill: {
    backgroundColor: '#548C0C80',
    borderRadius: radius.sm,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignSelf: 'stretch',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.18)',
  },
  statValue: { color: '#ffffff', fontWeight: '900', fontSize: fonts.sizes.sm },

  profileActions: { gap: spacing.sm },
  profileActionGrad: {
    borderRadius: radius.sm,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.25)',
  },
  profileActionTextDark: { color: '#0a1f0a', fontWeight: '900', fontSize: fonts.sizes.sm },

  logoutCard: {
    width: 380,
    backgroundColor: 'rgba(8, 20, 8, 0.96)',
    borderWidth: 1,
    borderColor: 'rgba(187, 255, 0, 0.22)',
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  logoutText: { color: '#fff', fontSize: fonts.sizes.sm, lineHeight: 20 },
  logoutActions: { flexDirection: 'row', gap: spacing.sm },
  logoutCancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: radius.sm,
    paddingVertical: 10,
    alignItems: 'center',
  },
  logoutCancelText: { color: '#fff', fontWeight: '700', fontSize: fonts.sizes.sm },
  logoutConfirmBtn: {
    flex: 1,
    backgroundColor: '#dc2626',
    borderRadius: radius.sm,
    paddingVertical: 10,
    alignItems: 'center',
  },
  logoutConfirmText: { color: '#fff', fontWeight: '800', fontSize: fonts.sizes.sm },
});
