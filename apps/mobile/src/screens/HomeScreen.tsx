import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ImageBackground,
  TouchableOpacity, Modal, Image, Platform, Pressable, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, fonts, radius, shadows, backgroundCoverFix } from '../theme';
import { useAuthStore } from '../store/auth.store';
import { connectSocket } from '../services/socket';
import { ConsentModal } from '../components/ConsentModal';
import { IconSettings, IconStar, IconLogOut, IconX, IconVolumeUp, IconMusic } from '../components/Icons';

type Props = { navigation: NativeStackNavigationProp<any> };

// ─── Shared top-bar used across logged-in screens ──────────────────────────

const SETTINGS_CARD_PAD = Platform.OS === 'web' ? 24 : 16;
const SETTINGS_ITEM_GAP = Platform.OS === 'web' ? 24 : 16;

function GradientToggle({
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
    outputRange: [3, 88 - 34 - 3],
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
    paddingHorizontal: 3,
    backgroundColor: 'rgba(255,255,255,0.12)',
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
}: {
  user: any;
  onSettings?: () => void;
  onExit?: () => void;
  onWallet?: () => void;
  onProfile?: () => void;
}) {
  const balance = user?.wallet?.real_balance ?? 0;
  const level   = 2; // TODO: pull from user profile

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
        <TouchableOpacity style={topBar.balanceWrap} onPress={onWallet} activeOpacity={0.85}>
          <LinearGradient
            colors={['#BEF311', '#1CBB3D']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={topBar.balancePill}
          >
            <Text style={topBar.balanceText}>R$ {balance.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</Text>
            <View style={topBar.balancePlus}>
              <Text style={topBar.balancePlusText}>+</Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity style={topBar.iconBtn} onPress={onSettings} testID="topbar-settings" accessibilityLabel="Abrir configurações">
          <IconSettings size={20} color="#fff" accessibilityLabel="Configurações" />
        </TouchableOpacity>

        <TouchableOpacity style={topBar.iconBtn} onPress={onExit} testID="topbar-logout" accessibilityLabel="Sair">
          <IconLogOut size={20} color="#fff" accessibilityLabel="Sair" />
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

  useEffect(() => {
    connectSocket().then((socket) => {
      socket.on('online:count', ({ count }: { count: number }) => setOnlineCount(count));
    });
  }, []);

  const handleLogout = () => {
    setProfileVisible(false);
    setLogoutVisible(false);
    useAuthStore.getState().logout().then(() => navigation.replace('Login'));
  };

  return (
    <ImageBackground
      source={require('../../assets/background.png')}
      style={[styles.root, backgroundCoverFix]}
      resizeMode="cover"
    >
      <SafeAreaView style={styles.safe}>
      <ConsentModal onAccepted={() => {}} />

      {/* Top bar */}
      <GameTopBar
        user={user}
        onSettings={() => setSettingsVisible(true)}
        onExit={() => setLogoutVisible(true)}
        onWallet={() => navigation.navigate('Wallet')}
        onProfile={() => setProfileVisible(true)}
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
            <View pointerEvents="none" style={styles.settingsTextureWrap}>
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
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setProfileVisible(false)}
        >
          <View style={styles.profileCard} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Perfil</Text>
              <TouchableOpacity onPress={() => setProfileVisible(false)}>
                <IconX size={18} color="#fff" accessibilityLabel="Fechar" />
              </TouchableOpacity>
            </View>

            <View style={styles.profileBody}>
              {/* Left: avatar + info */}
              <View style={styles.profileLeft}>
                <View style={styles.profileAvatar}>
                  <Text style={styles.profileAvatarText}>{user?.name?.[0]?.toUpperCase() || '?'}</Text>
                </View>
                <Text style={styles.profileName}>{user?.name || 'Jogador'}</Text>
                <Text style={styles.profileBadge}>Bronze</Text>
                <View style={styles.profileStarContainer}>
                  <IconStar size={24} color={colors.gold} />
                </View>
                <View style={styles.xpBarBg}>
                  <View style={[styles.xpBarFill, { width: '40%' }]} />
                </View>
              </View>

              {/* Right: stats */}
              <View style={styles.profileRight}>
                <Text style={styles.statLabel}>Total de vitórias</Text>
                <View style={styles.statBox}><Text style={styles.statValue}>250</Text></View>

                <Text style={styles.statLabel}>Taxa de vitória</Text>
                <View style={styles.statBox}><Text style={styles.statValue}>63%</Text></View>

                <Text style={styles.statLabel}>Torneios ganhos</Text>
                <View style={styles.statBox}><Text style={styles.statValue}>123</Text></View>
              </View>
            </View>

            <View style={styles.profileActions}>
              <TouchableOpacity style={styles.profileActionBtn}>
                <Text style={styles.profileActionText}>Histórico De Partidas</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.profileActionBtn}>
                <Text style={styles.profileActionText}>Conquistas</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
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
    </ImageBackground>
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
    marginTop: spacing.lg,
  },

  modeBtn: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#BBFF00',
    backgroundColor: 'rgba(0,0,0,0.25)',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
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
    ...shadows.card,
  },
  settingsTextureWrap: {
    ...StyleSheet.absoluteFillObject,
  },
  settingsTexture: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.06,
    transform: [{ scale: 1.08 }],
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
    fontFamily: Platform.OS === 'web' ? ('Poppins' as any) : 'System',
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
  },
  settingLabel: {
    fontSize: fonts.sizes.xl,
    color: '#fff',
    fontWeight: '800',
    fontFamily: Platform.OS === 'web' ? ('Poppins' as any) : 'System',
  },

  // Profile modal
  profileCard: {
    width: 500,
    backgroundColor: 'rgba(8, 20, 8, 0.96)',
    borderWidth: 1,
    borderColor: 'rgba(74,222,128,0.35)',
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.lg,
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
  profileAvatarText: { color: '#fff', fontSize: 32, fontWeight: '700' },
  profileName:  { color: '#fff', fontWeight: '700', fontSize: fonts.sizes.md },
  profileBadge: { color: '#cd7f32', fontSize: fonts.sizes.sm, fontWeight: '600' },
  profileStarContainer: { marginBottom: spacing.sm },
  xpBarBg: {
    width: '100%', height: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 3, overflow: 'hidden',
  },
  xpBarFill: { height: '100%', backgroundColor: '#4ade80', borderRadius: 3 },

  profileRight: { flex: 1, gap: spacing.sm },
  statLabel: { color: colors.textMuted, fontSize: fonts.sizes.xs },
  statBox: {
    backgroundColor: '#4ade80',
    borderRadius: radius.sm,
    paddingVertical: 4,
    paddingHorizontal: 10,
    alignSelf: 'stretch',
  },
  statValue: { color: '#000', fontWeight: '700', fontSize: fonts.sizes.sm },

  profileActions: { gap: spacing.sm },
  profileActionBtn: {
    borderWidth: 1,
    borderColor: '#4ade80',
    borderRadius: radius.sm,
    paddingVertical: 10,
    alignItems: 'center',
  },
  profileActionText: { color: '#4ade80', fontWeight: '600', fontSize: fonts.sizes.sm },

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
