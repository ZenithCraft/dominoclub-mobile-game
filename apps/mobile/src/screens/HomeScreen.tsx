import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ImageBackground,
  TouchableOpacity, Modal, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, fonts, radius } from '../theme';
import { useAuthStore } from '../store/auth.store';
import { connectSocket } from '../services/socket';
import { ConsentModal } from '../components/ConsentModal';

type Props = { navigation: NativeStackNavigationProp<any> };

// ─── Shared top-bar used across logged-in screens ──────────────────────────

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
          <Text style={topBar.avatarText}>{user?.name?.[0]?.toUpperCase() || '?'}</Text>
        </View>
        <View>
          <Text style={topBar.name}>{user?.name || 'Jogador'}</Text>
          <Text style={topBar.level}>Lev: {String(level).padStart(2, '0')}</Text>
        </View>
      </TouchableOpacity>

      {/* Right: balance + add + settings + exit */}
      <View style={topBar.right}>
        <TouchableOpacity style={topBar.balancePill} onPress={onWallet}>
          <Text style={topBar.balanceText}>R$ {balance.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={topBar.addBtn} onPress={onWallet}>
          <Text style={topBar.addText}>+</Text>
        </TouchableOpacity>

        <TouchableOpacity style={topBar.iconBtn} onPress={onSettings}>
          <Text style={topBar.iconText}>⚙</Text>
        </TouchableOpacity>

        <TouchableOpacity style={topBar.iconBtn} onPress={onExit}>
          <Text style={topBar.iconText}>⊣</Text>
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
    paddingVertical: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(74,222,128,0.15)',
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#4a7c4a',
    borderWidth: 2, borderColor: 'rgba(74,222,128,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: fonts.sizes.md },
  name:   { color: '#fff', fontWeight: '700', fontSize: fonts.sizes.sm },
  level:  { color: colors.textMuted, fontSize: fonts.sizes.xs },
  right:  { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  balancePill: {
    backgroundColor: '#4ade80',
    borderRadius: radius.full,
    paddingHorizontal: 12, paddingVertical: 4,
  },
  balanceText: { color: '#000', fontWeight: '700', fontSize: fonts.sizes.sm },
  addBtn: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#dc2626',
    alignItems: 'center', justifyContent: 'center',
  },
  addText: { color: '#fff', fontWeight: '800', fontSize: 14, lineHeight: 16 },
  iconBtn: {
    width: 34, height: 34, borderRadius: radius.sm,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  iconText: { color: '#fff', fontSize: 16 },
});

// ─── Main HomeScreen ────────────────────────────────────────────────────────

export function HomeScreen({ navigation }: Props) {
  const { user } = useAuthStore();
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [profileVisible, setProfileVisible]   = useState(false);
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
    useAuthStore.getState().logout().then(() => navigation.replace('Login'));
  };

  return (
    <ImageBackground
      source={require('../../assets/background.png')}
      style={styles.root}
      resizeMode="cover"
    >
      <SafeAreaView style={styles.safe}>
      <ConsentModal onAccepted={() => {}} />

      {/* Top bar */}
      <GameTopBar
        user={user}
        onSettings={() => setSettingsVisible(true)}
        onExit={handleLogout}
        onWallet={() => navigation.navigate('Wallet')}
        onProfile={() => setProfileVisible(true)}
      />

      {/* Center content */}
      <View style={styles.center}>
        <Text style={styles.title}>Escolha o modo de jogo</Text>
        <Text style={styles.subtitle}>Escolha como você quer jogar: individual ou time</Text>

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
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setSettingsVisible(false)}
        >
          <View style={styles.settingsCard} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Configurações</Text>
              <TouchableOpacity onPress={() => setSettingsVisible(false)}>
                <Text style={styles.closeBtn}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Som:</Text>
              <Switch
                value={soundOn}
                onValueChange={setSoundOn}
                trackColor={{ false: '#f97316', true: '#4ade80' }}
                thumbColor={soundOn ? '#fff' : '#fff'}
              />
            </View>

            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Música:</Text>
              <Switch
                value={musicOn}
                onValueChange={setMusicOn}
                trackColor={{ false: '#f97316', true: '#4ade80' }}
                thumbColor={musicOn ? '#fff' : '#fff'}
              />
            </View>
          </View>
        </TouchableOpacity>
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
                <Text style={styles.closeBtn}>✕</Text>
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
                <Text style={styles.profileStar}>⭐</Text>
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
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  modeBtnGrad: {
    paddingVertical: spacing.xxl,
    paddingHorizontal: 72,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 200,
    minHeight: 90,
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
    width: 340,
    backgroundColor: 'rgba(8, 20, 8, 0.96)',
    borderWidth: 1.5,
    borderColor: 'rgba(74,222,128,0.55)',
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: { fontSize: fonts.sizes.lg, fontWeight: '700', color: '#fff' },
  closeBtn:   { color: colors.textMuted, fontSize: fonts.sizes.lg, fontWeight: '700' },

  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingLabel: { fontSize: fonts.sizes.md, color: '#fff' },

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
  profileStar:  { fontSize: 18 },
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
});
