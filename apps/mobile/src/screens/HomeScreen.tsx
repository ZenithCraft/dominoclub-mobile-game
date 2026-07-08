import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet,
  TouchableOpacity, Image, Platform, Pressable, Animated, ScrollView,
  Linking, Alert, Dimensions, useWindowDimensions,
} from 'react-native';
import { BlurModal } from '../components/BlurModal';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { colors, spacing, fonts, radius, shadows } from '../theme';
import { isTablet } from '../theme/responsive';
import { ScreenBackground } from '../components/ScreenBackground';
import { useAuthStore } from '../store/auth.store';
import { toast } from '../store/toast.store';
import { connectSocket } from '../services/socket';
import { ConsentModal } from '../components/ConsentModal';
import { AnnouncementModal } from '../components/AnnouncementModal';
import { WalletBalanceButton } from '../components/Button';
import { IconSettings, IconStar, IconLogOut, IconX, IconVolumeUp, IconMusic, IconChevronLeft, IconMenu, IconBell, IconBellOff } from '../components/Icons';
import { useSettingsStore } from '../store/settings.store';
import { setAppNotificationsEnabled } from '../services/notifications';
import { sfx } from '../services/sfx';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const isSmallPhone = !isTablet && SCREEN_W < 390;
const isShortScreen = SCREEN_H < 420;

// Target caps for user-picked images. We auto-resize / re-compress anything
// past these before the upload runs. The larger the asset that survives the
// gallery Activity round-trip, the longer Android keeps that Activity in
// memory — and that's where the stuck-portrait Dimensions bug originates.
// Caps are loose enough that any modest phone photo passes untouched, tight
// enough that an 8K wallpaper gets pulled down to a manageable size.
const MAX_AVATAR_BYTES   = 100 * 1024; // 100 KB — keeps base64 payload small enough to store in DB
const MAX_AVATAR_EDGE_PX = 320;        // longest side in pixels — plenty for a 40 px avatar circle
export async function prepareAvatarUpload(uri: string, width?: number, height?: number): Promise<string | null> {
  try {
    const FS: any = await import('expo-file-system/legacy');

    let fileBytes = 0;
    try {
      const info: any = await FS.getInfoAsync(uri, { size: true } as any);
      fileBytes = Number(info?.size) || 0;
    } catch {}

    let w = width || 0;
    let h = height || 0;
    if (!w || !h) {
      try {
        const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
          Image.getSize(uri, (W, H) => resolve({ w: W, h: H }), reject);
        });
        w = dims.w; h = dims.h;
      } catch {}
    }

    const longest = Math.max(w, h);
    const overSize = fileBytes > 0 && fileBytes > MAX_AVATAR_BYTES;
    const overDims = longest > 0 && longest > MAX_AVATAR_EDGE_PX;

    if (!overSize && !overDims) return uri;

    // Resize and/or recompress using the native ImageManipulator.
    // This runs in native code — no JS heap bitmap decode, no OOM risk.
    const actions: Parameters<typeof manipulateAsync>[1] = [];
    if (overDims) {
      actions.push({
        resize: w >= h ? { width: MAX_AVATAR_EDGE_PX } : { height: MAX_AVATAR_EDGE_PX },
      });
    }

    const result = await manipulateAsync(uri, actions, {
      compress: 0.82,
      format: SaveFormat.JPEG,
    });

    // Safety valve: if the processed file is still above the size cap
    // (e.g. a huge image with small dims that didn't need resizing),
    // reject rather than let an oversized upload through.
    try {
      const outInfo: any = await FS.getInfoAsync(result.uri, { size: true } as any);
      if (outInfo?.size && outInfo.size > MAX_AVATAR_BYTES) {
        toast.warning(`Imagem muito grande (${(outInfo.size / 1024 / 1024).toFixed(1)} MB). Escolha uma foto menor.`);
        return null;
      }
    } catch {}

    return result.uri;
  } catch {
    return uri;
  }
}

/**
 * Backwards-compat shim for the older reject-based API. The new code calls
 * prepareAvatarUpload directly; this only stays around for any external test
 * file that still imports validateAvatarLimits.
 * @deprecated use prepareAvatarUpload — it auto-resizes instead of rejecting.
 */
export async function validateAvatarLimits(uri: string, _width?: number, _height?: number): Promise<boolean> {
  // Auto-allow; the actual resize is done by the caller via prepareAvatarUpload.
  // Kept as a no-op so any stale import path keeps building.
  return Promise.resolve(uri ? true : false);
}

type Props = { navigation: NativeStackNavigationProp<any>; route?: any };

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
  kind?: 'sound' | 'music' | 'notifications';
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
            ) : kind === 'notifications' ? (
              value ? (
                <IconBell size={18} color={iconColor} accessibilityLabel="Notificações" />
              ) : (
                <IconBellOff size={18} color={iconColor} accessibilityLabel="Notificações" />
              )
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
  // Use physical screen dimensions for portrait detection — window dimensions
  // can transiently change on Android after minimize/restore (stuck-portrait bug),
  // but the physical screen size only changes on actual device rotation.
  const [tbPortrait, setTbPortrait] = useState(() => {
    const s = Dimensions.get('screen');
    return s.height >= s.width;
  });
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ screen: s }) => {
      setTbPortrait(s.height >= s.width);
    });
    return () => sub.remove();
  }, []);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const balance = (Number(user?.wallet?.real_balance ?? 0) + Number(user?.wallet?.bonus_balance ?? 0));
  const level   = levelProp ?? 2;

  return (
    <View style={topBar.bar}>
      {/* Left: avatar + name + level (tappable → profile) */}
      <TouchableOpacity style={topBar.left} onPress={() => { sfx.buttonClick(); onProfile?.(); }} activeOpacity={0.75}>
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

      {tbPortrait ? (
        /* Portrait: hamburger menu button + dropdown */
        <View>
          <TouchableOpacity style={topBar.iconBtn} onPress={() => { sfx.buttonClick(); setMenuOpen(v => !v); }} accessibilityLabel="Menu">
            <LinearGradient colors={['#BEF311', '#1CBB3D']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={topBar.iconBtnGrad}>
              <IconMenu size={20} color="#0a1f0a" />
            </LinearGradient>
          </TouchableOpacity>

          <BlurModal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
            <TouchableOpacity style={topBar.menuBackdrop} activeOpacity={1} onPress={() => setMenuOpen(false)}>
              <View style={topBar.menuDropdown} onStartShouldSetResponder={() => true}>

                <TouchableOpacity style={topBar.menuItem} activeOpacity={0.8} onPress={() => { sfx.buttonClick(); setMenuOpen(false); onWallet?.(); }}>
                  <WalletBalanceButton balance={balance} onPress={() => { sfx.buttonClick(); setMenuOpen(false); onWallet?.(); }} />
                </TouchableOpacity>

                <View style={topBar.menuDivider} />

                <TouchableOpacity style={topBar.menuItem} activeOpacity={0.8} onPress={() => { sfx.buttonClick(); setMenuOpen(false); onSettings?.(); }}>
                  <IconSettings size={20} color="#fff" />
                  <Text style={topBar.menuItemText}>Configurações</Text>
                </TouchableOpacity>

                <TouchableOpacity style={topBar.menuItem} activeOpacity={0.8} onPress={() => { sfx.buttonClick(); setMenuOpen(false); onExit?.(); }}>
                  {exitVariant === 'back' ? (
                    <IconChevronLeft size={20} color="#fff" />
                  ) : (
                    <IconLogOut size={20} color="#fff" />
                  )}
                  <Text style={topBar.menuItemText}>{exitVariant === 'back' ? 'Voltar' : 'Sair'}</Text>
                </TouchableOpacity>

              </View>
            </TouchableOpacity>
          </BlurModal>
        </View>
      ) : (
        /* Landscape / tablet: full right bar */
        <View style={topBar.right}>
          <WalletBalanceButton balance={balance} onPress={onWallet} height={isTablet ? 48 : 36} />

          <TouchableOpacity style={topBar.iconBtn} onPress={() => { sfx.buttonClick(); onSettings?.(); }} testID="topbar-settings" accessibilityLabel="Abrir configurações">
            <LinearGradient colors={['#BEF311', '#1CBB3D']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={topBar.iconBtnGrad}>
              <IconSettings size={isTablet ? 22 : 18} color="#0a1f0a" strokeWidth={2.5} accessibilityLabel="Configurações" />
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={topBar.iconBtn}
            onPress={() => { sfx.buttonClick(); onExit?.(); }}
            testID={exitVariant === 'back' ? 'topbar-back' : 'topbar-logout'}
            accessibilityLabel={exitVariant === 'back' ? 'Voltar' : 'Sair'}
          >
            <LinearGradient colors={['#BEF311', '#1CBB3D']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={topBar.iconBtnGrad}>
              {exitVariant === 'back' ? (
                <IconChevronLeft size={isTablet ? 22 : 18} color="#0a1f0a" strokeWidth={2.5} accessibilityLabel="Voltar" />
              ) : (
                <IconLogOut size={isTablet ? 22 : 18} color="#0a1f0a" strokeWidth={2.5} accessibilityLabel="Sair" />
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}
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
      <TouchableOpacity style={topBar.left} onPress={() => { sfx.buttonClick(); onProfile?.(); }} activeOpacity={0.75}>
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
        <TouchableOpacity style={topBar.iconBtn} onPress={() => { sfx.buttonClick(); onSettings?.(); }} testID="topbar-settings" accessibilityLabel="Abrir configurações">
          <LinearGradient colors={['#BEF311', '#1CBB3D']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={topBar.iconBtnGrad}>
            <IconSettings size={20} color="#0a1f0a" accessibilityLabel="Configurações" />
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity
          style={topBar.iconBtn}
          onPress={() => { sfx.buttonClick(); onExit?.(); }}
          testID={exitVariant === 'back' ? 'topbar-back' : 'topbar-logout'}
          accessibilityLabel={exitVariant === 'back' ? 'Voltar' : 'Sair'}
        >
          <LinearGradient colors={['#BEF311', '#1CBB3D']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={topBar.iconBtnGrad}>
            {exitVariant === 'back' ? (
              <IconChevronLeft size={20} color="#0a1f0a" accessibilityLabel="Voltar" />
            ) : (
              <IconLogOut size={20} color="#0a1f0a" accessibilityLabel="Sair" />
            )}
          </LinearGradient>
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
    paddingHorizontal: isTablet ? spacing.xl : spacing.md,
    paddingVertical: isTablet ? spacing.lg : spacing.xs,
    backgroundColor: 'rgb(24, 73, 18)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(187, 255, 0, 0.18)',
    minHeight: isTablet ? 90 : 60,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatar: {
    width: isTablet ? 60 : 40,
    height: isTablet ? 60 : 40,
    borderRadius: isTablet ? 30 : 20,
    backgroundColor: '#184912',
    borderWidth: 2,
    borderColor: '#1CBB3D',
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: isTablet ? fonts.sizes.lg : fonts.sizes.sm },
  name:   { color: '#fff', fontWeight: '700', fontSize: isTablet ? fonts.sizes.lg : fonts.sizes.sm },
  level:  { color: colors.textMuted, fontSize: isTablet ? fonts.sizes.sm : fonts.sizes.xs },
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
    width: isTablet ? 48 : 36,
    height: isTablet ? 48 : 36,
    borderRadius: isTablet ? 13 : 10,
    overflow: 'hidden',
  },
  iconBtnGrad: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: { color: '#fff', fontSize: 16 },

  menuBackdrop: { flex: 1 },
  menuDropdown: {
    position: 'absolute',
    top: isTablet ? 90 : 60,
    right: spacing.lg,
    backgroundColor: '#112d0f',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(187,255,0,0.18)',
    padding: spacing.sm,
    minWidth: 200,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 8px 24px rgba(0,0,0,0.55)' } as any)
      : { elevation: 12, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } }),
  },
  menuDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginVertical: spacing.xs },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.md },
  menuItemText: { color: '#fff', fontSize: fonts.sizes.sm, fontWeight: '600' },
});

// ─── Main HomeScreen ────────────────────────────────────────────────────────

export function HomeScreen({ navigation, route }: Props) {
  const { height: windowH } = useWindowDimensions();
  const dynShortScreen = windowH < 420;
  const { user } = useAuthStore();
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [profileVisible, setProfileVisible]   = useState(false);
  const [logoutVisible, setLogoutVisible]     = useState(false);
  const [musicOn, setMusicOn]   = useState(true);
  const [locationGranted, setLocationGranted]         = useState<boolean | null>(null);
  const [locationBlockerVisible, setLocationBlockerVisible] = useState(false);
  const notificationsEnabled = useSettingsStore((s) => s.notificationsEnabled);
  const soundOn = useSettingsStore((s) => s.soundOn);
  const setSoundOn = useSettingsStore((s) => s.setSoundOn);
  useEffect(() => { useSettingsStore.getState().loadFromStorage(); }, []);
  const [onlineCount, setOnlineCount] = useState(0);
  const [profileAvatarUri, setProfileAvatarUri] = useState<string | null>(null);
  const [profileRank, setProfileRank] = useState<string>('BRONZE');
  const [profileStatsLoading, setProfileStatsLoading] = useState(false);
  const [profileStats, setProfileStats] = useState({
    totalWins: 0,
    winRate: 0,
    tournamentsWon: 0,
    totalGames: 0,
  });

  // Handle openModal param from other screens (settings/profile)
  useEffect(() => {
    const openModal = route?.params?.openModal;
    if (openModal === 'settings') {
      setSettingsVisible(true);
      navigation.setParams?.({ openModal: undefined });
    } else if (openModal === 'profile') {
      setProfileVisible(true);
      navigation.setParams?.({ openModal: undefined });
    }
  }, [route?.params?.openModal]);

  useEffect(() => {
    let sock: any;
    (async () => {
      try {
        sock = await connectSocket();
        sock.on('online:count', ({ count }: { count: number }) => setOnlineCount(count));
      } catch {}
    })();
    return () => { if (sock) sock.off('online:count'); };
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') { setLocationGranted(true); return; }
    Location.getForegroundPermissionsAsync()
      .then(({ status }) => setLocationGranted(status === 'granted'))
      .catch(() => setLocationGranted(true));
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

        const didWin = (g: any) => {
          if ((g?.winner_id ?? g?.winnerId) === userId) return true;
          if (g?.winning_team != null && Array.isArray(g?.players)) {
            const myTeam = g.players.find((p: any) => p.userId === userId)?.team;
            return myTeam != null && myTeam === g.winning_team;
          }
          return false;
        };

        const wins = games.filter(didWin).length;
        const total = games.length;
        const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
        const tournamentIds = new Set<string>();
        for (const g of games) {
          const tid = g?.tournamentId ?? g?.tournament_id;
          if (tid && didWin(g)) tournamentIds.add(tid);
        }

        let rank = 'BRONZE';
        try {
          const { data: leagueData } = await apiClient.get('/game/me/league');
          rank = leagueData?.rank ?? 'BRONZE';
        } catch { /* league fetch is non-critical */ }

        if (!cancelled) {
          setProfileRank(rank);
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
            try {
              const { api } = await import('../services/api');
              await api.put('/auth/profile', { avatar: uri });
            } catch {}
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
        mediaTypes: 'images',
        quality: 0.85,
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      const pickedUri = asset?.uri;
      if (!pickedUri) return;

      const uri = await prepareAvatarUpload(pickedUri, asset?.width, asset?.height);
      if (!uri) return; // image too large — toast already shown by prepareAvatarUpload

      setProfileAvatarUri(uri);

      const st = (useAuthStore as any).getState?.();
      if (st?.setAvatar) await st.setAvatar(uri);
      else if (st?.user && st?.setUser) st.setUser({ ...st.user, avatar: uri });

      // Upload to server so the avatar persists across devices and is visible to other players
      try {
        const FS: any = await import('expo-file-system/legacy');
        const b64: string = await FS.readAsStringAsync(uri, { encoding: 'base64' });
        const dataUri = `data:image/jpeg;base64,${b64}`;
        const { api } = await import('../services/api');
        await api.put('/auth/profile', { avatar: dataUri });
      } catch {
        // Silent fail — avatar already saved locally; server sync can retry on next open
      }
    } catch {
      toast.error('Não foi possível abrir suas fotos.');
    }
  };

  const handlePlayPress = async (mode: string) => {
    try {
      const raw = await AsyncStorage.getItem('@dominoclub_consent_v1');
      if (!raw) {
        Alert.alert(
          'Termos de Uso',
          'Para jogar, você precisa aceitar os Termos de Uso e confirmar sua maioridade.',
          [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Ver Termos', onPress: () => navigation.navigate('Terms', { showAccept: true }) },
          ],
        );
        return;
      }
    } catch {}

    if (!user?.cpf_verified || !user?.phone_verified) {
      Alert.alert(
        'Verificação necessária',
        'Você precisa verificar sua identidade (KYC) antes de buscar partidas. O processo leva menos de 2 minutos.',
        [
          { text: 'Agora não', style: 'cancel' },
          { text: 'Verificar agora', onPress: () => navigation.navigate('KYC') },
        ],
      );
      return;
    }

    if (Platform.OS !== 'web') {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') {
          const { status: newStatus } = await Location.requestForegroundPermissionsAsync();
          if (newStatus !== 'granted') {
            setLocationBlockerVisible(true);
            return;
          }
          setLocationGranted(true);
        }
      } catch {}
    }

    navigation.navigate('ModeSelect', { mode });
  };

  const handleLogout = () => {
    setProfileVisible(false);
    setLogoutVisible(false);
    useAuthStore.getState().logout().then(() => navigation.replace('Login'));
  };

  return (
    <ScreenBackground style={styles.root}>
      <SafeAreaView style={styles.safe} edges={[]}>
      <ConsentModal onAccepted={() => {}} />
      <AnnouncementModal />

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
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.center} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Escolha o modo de jogo</Text>
        <Text style={[styles.subtitle, { color: '#ffffff' }]}>Escolha como você quer jogar: individual ou time</Text>
        <View style={styles.modeRow}>
          {/* Livre button — cyan */}
          <TouchableOpacity
            style={[styles.modeBtn, styles.modeBtnLivre]}
            activeOpacity={0.85}
            onPress={() => { sfx.buttonClick(); handlePlayPress('LIVRE'); }}
          >
            <LinearGradient
              colors={['#22d3ee', '#0891b2']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.modeBtnGrad, isTablet && { minHeight: 130 }]}
            >
              <Text style={styles.modeBtnTextLivre}>Livre</Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* Torneio button — yellow/gold */}
          <TouchableOpacity
            style={[styles.modeBtn, styles.modeBtnTorneio]}
            activeOpacity={0.85}
            onPress={() => { sfx.buttonClick(); handlePlayPress('TORNEIO'); }}
          >
            <LinearGradient
              colors={['#fbbf24', '#d97706']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.modeBtnGrad, isTablet && { minHeight: 130 }]}
            >
              <Text style={styles.modeBtnTextTorneio}>Torneio</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* ── Settings Modal (Configurações) ── */}
      <BlurModal visible={settingsVisible} transparent animationType="fade">
        <Pressable
          style={styles.overlay}
          onPress={() => setSettingsVisible(false)}
          testID="settings-overlay"
        >
          <Pressable
            style={[styles.settingsCard, { maxHeight: Math.min(styles.settingsCard.maxHeight as number, Math.round(windowH * 0.85)) }]}
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
              <TouchableOpacity onPress={() => { sfx.buttonClick(); setSettingsVisible(false); }} accessibilityLabel="Fechar configurações">
                <IconX size={26} color="#fff" accessibilityLabel="Fechar" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flexGrow: 1, flexShrink: 1, minHeight: 0 }} contentContainerStyle={{ gap: SETTINGS_ITEM_GAP }} showsVerticalScrollIndicator={false}>
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

              <View style={styles.settingItem}>
                <Text style={styles.settingLabel}>Notificações:</Text>
                <GradientToggle
                  value={notificationsEnabled}
                  onValueChange={setAppNotificationsEnabled}
                  pressableTestID="settings-notifications-toggle"
                  accessibilityLabel="Notificações"
                  kind="notifications"
                />
              </View>

              {Platform.OS !== 'web' && (
                <View style={styles.settingItem}>
                  <Text style={styles.settingLabel}>Localização:</Text>
                  <TouchableOpacity
                    style={styles.locationBtn}
                    onPress={async () => {
                      sfx.buttonClick();
                      try {
                        const { status } = await Location.getForegroundPermissionsAsync();
                        if (status === 'granted') {
                          toast.info('Localização já está ativada');
                          return;
                        }
                        const { status: ns } = await Location.requestForegroundPermissionsAsync();
                        if (ns === 'granted') {
                          setLocationGranted(true);
                          toast.success('Localização ativada!');
                        } else {
                          Linking.openSettings();
                        }
                      } catch {}
                    }}
                    accessibilityLabel="Ativar localização"
                  >
                    <Text style={[styles.locationBtnText, locationGranted ? styles.locationBtnGranted : null]}>
                      {locationGranted ? '✓ Ativada' : 'Ativar'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </BlurModal>

      {/* ── Profile Modal ── */}
      <BlurModal visible={profileVisible} transparent animationType="fade" onRequestClose={() => setProfileVisible(false)}>
        <View style={styles.profileOverlay}>
          {/* Overlay touch area to close - only outside the card */}
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setProfileVisible(false)} />

          {/* Card container - centered and non-touchable */}
          <View style={styles.profileCardWrapper} pointerEvents="box-none">
            <View style={[styles.profileCard, { height: Math.round(windowH * 0.82) }]} pointerEvents="auto">
              <View style={styles.modalHeader}>
                <View style={{ width: 26 }} />
                <Text style={styles.settingsTitle}>Perfil</Text>
                <TouchableOpacity onPress={() => { sfx.buttonClick(); setProfileVisible(false); }} activeOpacity={0.7}>
                  <IconX size={26} color="#fff" accessibilityLabel="Fechar" />
                </TouchableOpacity>
              </View>

              <ScrollView
                style={styles.profileScroll}
                contentContainerStyle={styles.profileScrollContent}
                showsVerticalScrollIndicator={true}
                bounces={true}
                overScrollMode="always"
              >
                <View style={styles.profileBody}>
                  {/* Left: avatar + info */}
                  <View style={styles.profileLeft}>
                    <TouchableOpacity style={styles.profileAvatar} activeOpacity={0.85} onPress={() => { sfx.buttonClick(); onPickProfileAvatar(); }}>
                      {profileAvatarUri ? (
                        <Image source={{ uri: profileAvatarUri }} style={styles.profileAvatarImg} />
                      ) : (
                        <Text style={styles.profileAvatarText}>{user?.name?.[0]?.toUpperCase() || '?'}</Text>
                      )}
                    </TouchableOpacity>
                    <Text style={styles.profileName}>{user?.name || 'Jogador'}</Text>
                    <Text style={styles.profileBadge}>{profileStatsLoading ? '...' : ({
                      BRONZE: 'Bronze', SILVER: 'Prata', GOLD: 'Ouro',
                      PLATINUM: 'Platina', DIAMOND: 'Diamante',
                    }[profileRank] ?? 'Bronze')}</Text>
                    <View style={styles.profileStarContainer}>
                      <LevelStarBadge level={profileStatsLoading ? '--' : levelText} size={44} />
                    </View>
                    <View style={styles.xpBarBg}>
                      <View style={[styles.xpBarFill, { width: `${Math.round((profileStats.totalGames % 10) / 10 * 100)}%` as any }]} />
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
                  {[{colors: ['#BEF311','#1CBB3D'] as [string,string], label:'Histórico De Partidas', route:'History'},{colors: ['#BEF311','#1CBB3D'] as [string,string], label:'Conquistas', route:'Achievements'},{colors: ['#ffd700','#ca8a04'] as [string,string], label:'Liga & Ranking', route:'Leaderboard'}].map(({colors: gc, label, route}) => (
                    <LinearGradient key={route} colors={gc} start={{x:0,y:0}} end={{x:1,y:1}} style={[styles.profileActionGrad, dynShortScreen && { paddingVertical: 4 }]}>
                      <TouchableOpacity activeOpacity={0.85} onPress={() => { sfx.buttonClick(); setProfileVisible(false); navigation.navigate(route as any); }}>
                        <Text style={[styles.profileActionTextDark, dynShortScreen && { fontSize: fonts.sizes.xs }]}>{label}</Text>
                      </TouchableOpacity>
                    </LinearGradient>
                  ))}
                </View>
              </ScrollView>
            </View>
          </View>
        </View>
      </BlurModal>

      <BlurModal visible={locationBlockerVisible} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={[styles.logoutCard, styles.locationCard]} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Localização necessária</Text>
              <TouchableOpacity onPress={() => { sfx.buttonClick(); setLocationBlockerVisible(false); }}>
                <IconX size={18} color="#fff" accessibilityLabel="Fechar" />
              </TouchableOpacity>
            </View>
            <Text style={styles.logoutText}>
              Para jogar, precisamos acessar sua localização. Ative a permissão nas configurações do dispositivo.
            </Text>
            <View style={styles.logoutActions}>
              <TouchableOpacity style={styles.logoutCancelBtn} onPress={() => { sfx.buttonClick(); setLocationBlockerVisible(false); }} activeOpacity={0.85}>
                <Text style={styles.logoutCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.logoutConfirmBtn}
                onPress={() => { sfx.buttonClick(); setLocationBlockerVisible(false); Linking.openSettings(); }}
                activeOpacity={0.85}
              >
                <Text style={styles.logoutConfirmText}>Configurações</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </BlurModal>

      <BlurModal visible={logoutVisible} transparent animationType="fade">
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setLogoutVisible(false)}
        >
          <View style={styles.logoutCard} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Sair</Text>
              <TouchableOpacity onPress={() => { sfx.buttonClick(); setLogoutVisible(false); }}>
                <IconX size={18} color="#fff" accessibilityLabel="Fechar" />
              </TouchableOpacity>
            </View>

            <Text style={styles.logoutText}>Tem certeza que deseja sair da sua conta?</Text>

            <View style={styles.logoutActions}>
              <TouchableOpacity style={styles.logoutCancelBtn} onPress={() => { sfx.buttonClick(); setLogoutVisible(false); }} activeOpacity={0.85}>
                <Text style={styles.logoutCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.logoutConfirmBtn} onPress={() => { sfx.buttonClick(); handleLogout(); }} activeOpacity={0.85}>
                <Text style={styles.logoutConfirmText}>Sair</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </BlurModal>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a1f0a' },
  safe: { flex: 1 },

  center: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: isSmallPhone ? spacing.md : spacing.xl,
    paddingHorizontal: isSmallPhone ? spacing.lg : spacing.xxl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
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
    gap: spacing.md,
    marginTop: spacing.xs,
    width: '100%',
  },

  modeBtn: {
    flex: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 3,
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
    paddingVertical: isSmallPhone ? spacing.md : (isShortScreen ? spacing.sm : spacing.lg),
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    minHeight: isSmallPhone ? 72 : (isShortScreen ? 64 : 88),
    borderRadius: radius.lg - 3,
  },
  modeBtnLivre: {
    borderColor: '#0e7490', // darker cyan
  },
  modeBtnTorneio: {
    borderColor: '#92400e', // darker yellow/gold
  },
  modeBtnText: {
    fontSize: isSmallPhone ? fonts.sizes.md : fonts.sizes.xl,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 1,
  },
  modeBtnTextLivre: {
    fontSize: isSmallPhone ? fonts.sizes.md : fonts.sizes.xl,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 1,
    textShadowColor: '#0e7490',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  modeBtnTextTorneio: {
    fontSize: isSmallPhone ? fonts.sizes.md : fonts.sizes.xl,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 1,
    textShadowColor: '#92400e',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },

  // Overlay
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Profile overlay (separate to handle different layout)
  profileOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    position: 'relative',
  },

  // Settings modal
  settingsCard: {
    width: Platform.OS === 'web' ? (isTablet ? '78%' : 640) : (isTablet ? '78%' : Math.min(440, SCREEN_W * 0.92)),
    maxWidth: isTablet ? 860 : 480,
    maxHeight: Platform.OS === 'web' ? (isTablet ? 700 : 600) : Math.round(SCREEN_H * 0.85),
    backgroundColor: colors.bgCard,
    borderRadius: radius.xl,
    padding: isTablet ? 24 : SETTINGS_CARD_PAD,
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
  locationBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(28,187,61,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(28,187,61,0.3)',
  },
  locationBtnText: { color: colors.primary, fontWeight: '700', fontSize: fonts.sizes.sm },
  locationBtnGranted: { color: '#1CBB3D' },

  // Profile modal
  profileCardWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
  },
  profileCard: {
    width: Platform.OS === 'web' ? (isTablet ? '82%' : 640) : (isTablet ? '82%' : '92%'),
    maxWidth: isTablet ? 960 : 520,
    maxHeight: Platform.OS === 'web' ? (isTablet ? 860 : 600) : (isTablet ? Math.round(SCREEN_H * 0.88) : Math.round(SCREEN_H * 0.80)),
    backgroundColor: colors.bgCard,
    borderRadius: radius.xl,
    padding: isTablet ? 24 : SETTINGS_CARD_PAD,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#BBFF00',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0px 8px 20px rgba(0,0,0,0.45)' } as any) : shadows.card),
  },
  profileScroll: {
    flex: 1,
    width: '100%',
  },
  profileScrollContent: {
    gap: Math.max(10, SETTINGS_ITEM_GAP - 6),
    paddingVertical: 8,
    paddingBottom: 20,
  },
  profileBody: {
    flexDirection: 'row',
    gap: spacing.xl,
    alignItems: 'flex-start',
  },
  profileLeft: { alignItems: 'center', gap: spacing.sm, width: isSmallPhone ? 110 : (isTablet ? 160 : 140) },
  profileAvatar: {
    width: isSmallPhone ? 52 : (isTablet ? 90 : 72),
    height: isSmallPhone ? 52 : (isTablet ? 90 : 72),
    borderRadius: 8,
    backgroundColor: '#4a7c4a',
    alignItems: 'center', justifyContent: 'center',
  },
  profileAvatarImg: { width: '100%', height: '100%' },
  profileAvatarText: { color: '#fff', fontSize: isSmallPhone ? 22 : (isTablet ? 40 : 32), fontWeight: '700' },
  profileName:  { color: '#fff', fontWeight: '700', fontSize: isSmallPhone ? fonts.sizes.sm : fonts.sizes.md, fontFamily: Platform.OS === 'web' ? ('Inria Sans' as any) : 'System' },
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
  xpBarFill: { height: '100%', backgroundColor: '#1CBB3D', borderRadius: 3 },

  profileRight: { flex: 1, gap: spacing.sm },
  statLabel: { color: colors.textMuted, fontSize: isTablet ? fonts.sizes.sm : fonts.sizes.xs },
  statPill: {
    backgroundColor: '#548C0C80',
    borderRadius: radius.sm,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignSelf: 'stretch',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.18)',
  },
  statValue: { color: '#ffffff', fontWeight: '900', fontSize: isTablet ? fonts.sizes.md : fonts.sizes.sm },

  profileActions: { gap: spacing.sm },
  profileActionGrad: {
    borderRadius: radius.sm,
    paddingVertical: isSmallPhone ? 12 : 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.25)',
  },
  profileActionTextDark: { color: '#0a1f0a', fontWeight: '900', fontSize: isSmallPhone ? fonts.sizes.xs : fonts.sizes.sm },

  logoutCard: {
    width: isTablet ? '70%' : Math.min(360, SCREEN_W * 0.90),
    maxWidth: isTablet ? 760 : 420,
    backgroundColor: 'rgba(8, 20, 8, 0.96)',
    borderWidth: 1,
    borderColor: 'rgba(187, 255, 0, 0.22)',
    borderRadius: radius.xl,
    padding: isTablet ? spacing.xxl : spacing.xl,
    gap: isTablet ? spacing.xl : spacing.lg,
  },
  // Override applied on top of logoutCard for the "Localização necessária"
  // dialog so it stays compact: the body is two sentences and two buttons,
  // doesn't need the full logoutCard padding/gap budget. Caps height at 60%
  // of the viewport so it can't overflow on short screens.
  locationCard: {
    maxHeight: Math.round(SCREEN_H * 0.60),
    padding: spacing.lg,
    gap: spacing.md,
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
