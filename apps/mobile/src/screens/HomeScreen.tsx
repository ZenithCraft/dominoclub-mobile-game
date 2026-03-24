import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, fonts, radius, shadows } from '../theme';
import { useAuthStore } from '../store/auth.store';
import { connectSocket, getSocket } from '../services/socket';
import { Logo } from '../components/Logo';

type Props = { navigation: NativeStackNavigationProp<any> };

const GAME_MODES = [
  { id: 'ARENA_1V1', label: 'Arena 1v1', icon: '⚔️', desc: 'Sit & Go', color: '#16a34a', betRange: 'R$5-R$500' },
  { id: 'CUP_1V1', label: 'Copa 1v1', icon: '🏆', desc: 'Eliminatória', color: '#ca8a04', betRange: 'R$10-R$200' },
  { id: 'TOURNAMENT_2V2', label: 'Torneio 2x2', icon: '🎯', desc: 'Duplas rotativas', color: '#7c3aed', betRange: 'R$20 entrada' },
  { id: 'RECREATIONAL_2V2', label: 'Recreativo 2x2', icon: '🎲', desc: 'Apostas baixas', color: '#0891b2', betRange: 'R$1-R$20' },
];

export function HomeScreen({ navigation }: Props) {
  const { user } = useAuthStore();
  const [onlineCount, setOnlineCount] = useState(0);
  const [profileModal, setProfileModal] = useState(false);
  const [settingsModal, setSettingsModal] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [musicEnabled, setMusicEnabled] = useState(true);

  useEffect(() => {
    connectSocket().then((socket) => {
      socket.on('online:count', ({ count }: { count: number }) => setOnlineCount(count));
    });
  }, []);

  const handleModeSelect = (modeId: string) => {
    navigation.navigate('ModeSelect', { mode: modeId });
  };

  return (
    <View style={styles.container}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <Logo size="sm" />
        <View style={styles.onlineIndicator}>
          <View style={styles.onlineDot} />
          <Text style={styles.onlineText}>Jogadores online: {onlineCount}</Text>
        </View>
        <View style={styles.topActions}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => setSettingsModal(true)}>
            <Text style={styles.iconText}>⚙️</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn}>
            <Text style={styles.iconText}>🔔</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Game mode grid */}
        <Text style={styles.sectionTitle}>Escolha o modo de jogo</Text>
        <View style={styles.modesGrid}>
          {GAME_MODES.map((mode) => (
            <TouchableOpacity
              key={mode.id}
              onPress={() => handleModeSelect(mode.id)}
              activeOpacity={0.8}
              style={styles.modeCardWrapper}
            >
              <LinearGradient
                colors={[mode.color + '33', mode.color + '11']}
                style={styles.modeCard}
              >
                <View style={[styles.modeIconBg, { backgroundColor: mode.color + '22' }]}>
                  <Text style={styles.modeIcon}>{mode.icon}</Text>
                </View>
                <Text style={styles.modeLabel}>{mode.label}</Text>
                <Text style={styles.modeDesc}>{mode.desc}</Text>
                <View style={[styles.modeBadge, { backgroundColor: mode.color + '33' }]}>
                  <Text style={[styles.modeBetRange, { color: mode.color }]}>{mode.betRange}</Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          ))}
        </View>

        {/* Upcoming tournaments */}
        <Text style={styles.sectionTitle}>Torneios em breve</Text>
        <View style={styles.tournamentCard}>
          <Text style={styles.tournamentIcon}>🏆</Text>
          <View style={styles.tournamentInfo}>
            <Text style={styles.tournamentName}>Copa Dominó Noturna</Text>
            <Text style={styles.tournamentMeta}>Hoje 20:00 · R$20 entrada · Prêmio: R$500</Text>
          </View>
          <TouchableOpacity style={styles.joinBtn}>
            <Text style={styles.joinBtnText}>Entrar</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Bottom player bar */}
      <View style={styles.playerBar}>
        <TouchableOpacity style={styles.avatarBtn} onPress={() => setProfileModal(true)}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user?.name?.[0]?.toUpperCase() || '?'}</Text>
          </View>
          <View>
            <Text style={styles.playerName}>{user?.name || 'Jogador'}</Text>
            <Text style={styles.playerStatus}>● Online</Text>
          </View>
        </TouchableOpacity>

        <View style={styles.balanceInfo}>
          <Text style={styles.balanceLabel}>Saldo</Text>
          <Text style={styles.balanceValue}>
            R$ {(user?.wallet?.real_balance || 0).toFixed(2)}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.playBtn}
          onPress={() => navigation.navigate('ModeSelect', {})}
        >
          <LinearGradient colors={['#4ade80', '#16a34a']} style={styles.playBtnGradient}>
            <Text style={styles.playBtnText}>JOGAR</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Settings Modal */}
      <Modal visible={settingsModal} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setSettingsModal(false)}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Settings</Text>
              <TouchableOpacity onPress={() => setSettingsModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Som:</Text>
              <TouchableOpacity
                style={[styles.toggle, soundEnabled && styles.toggleOn]}
                onPress={() => setSoundEnabled(!soundEnabled)}
              >
                <View style={[styles.toggleThumb, soundEnabled && styles.toggleThumbOn]} />
              </TouchableOpacity>
            </View>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Música:</Text>
              <TouchableOpacity
                style={[styles.toggle, musicEnabled && styles.toggleOn]}
                onPress={() => setMusicEnabled(!musicEnabled)}
              >
                <View style={[styles.toggleThumb, musicEnabled && styles.toggleThumbOn]} />
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Profile Modal */}
      <Modal visible={profileModal} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setProfileModal(false)}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Profile</Text>
              <TouchableOpacity onPress={() => setProfileModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.profileContent}>
              <View style={styles.profileAvatar}>
                <Text style={styles.profileAvatarText}>{user?.name?.[0]?.toUpperCase() || '?'}</Text>
              </View>
              <Text style={styles.profileName}>{user?.name || 'Jogador'}</Text>
              <View style={styles.xpBar}>
                <View style={[styles.xpFill, { width: '60%' }]} />
              </View>
              <Text style={styles.xpLabel}>Nível 3 · 600 XP</Text>
            </View>
            <TouchableOpacity style={styles.logoutBtn} onPress={() => {
              setProfileModal(false);
              useAuthStore.getState().logout().then(() => navigation.replace('Login'));
            }}>
              <Text style={styles.logoutText}>Sair</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bgOverlay,
    gap: spacing.lg,
  },
  onlineIndicator: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  onlineText: { color: colors.textSecondary, fontSize: fonts.sizes.sm },
  topActions: { flexDirection: 'row', gap: spacing.sm },
  iconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.bgCard, alignItems: 'center', justifyContent: 'center' },
  iconText: { fontSize: 16 },
  content: { padding: spacing.lg, gap: spacing.lg },
  sectionTitle: { fontSize: fonts.sizes.lg, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.sm },
  modesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  modeCardWrapper: { width: '47%' },
  modeCard: { borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: spacing.sm, minHeight: 120 },
  modeIconBg: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  modeIcon: { fontSize: 24 },
  modeLabel: { fontSize: fonts.sizes.md, fontWeight: '700', color: colors.textPrimary },
  modeDesc: { fontSize: fonts.sizes.xs, color: colors.textMuted },
  modeBadge: { borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 3, alignSelf: 'flex-start' },
  modeBetRange: { fontSize: fonts.sizes.xs, fontWeight: '600' },
  tournamentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  tournamentIcon: { fontSize: 32 },
  tournamentInfo: { flex: 1 },
  tournamentName: { fontSize: fonts.sizes.md, fontWeight: '700', color: colors.textPrimary },
  tournamentMeta: { fontSize: fonts.sizes.xs, color: colors.textMuted, marginTop: 2 },
  joinBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 8, paddingHorizontal: 16 },
  joinBtnText: { color: colors.textOnPrimary, fontWeight: '700', fontSize: fonts.sizes.sm },
  playerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bgOverlay,
    gap: spacing.md,
  },
  avatarBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: fonts.sizes.lg, fontWeight: '700', color: colors.textOnPrimary },
  playerName: { fontSize: fonts.sizes.md, fontWeight: '700', color: colors.textPrimary },
  playerStatus: { fontSize: fonts.sizes.xs, color: colors.primary },
  balanceInfo: { flex: 1, alignItems: 'center' },
  balanceLabel: { fontSize: fonts.sizes.xs, color: colors.textMuted },
  balanceValue: { fontSize: fonts.sizes.lg, fontWeight: '800', color: colors.gold },
  playBtn: { borderRadius: radius.md, overflow: 'hidden' },
  playBtnGradient: { paddingVertical: 12, paddingHorizontal: 28 },
  playBtnText: { color: colors.textOnPrimary, fontWeight: '800', fontSize: fonts.sizes.md, letterSpacing: 1 },
  modalOverlay: { flex: 1, backgroundColor: colors.overlay80, alignItems: 'center', justifyContent: 'center' },
  modalCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.xl,
    padding: spacing.xl,
    width: 300,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  modalTitle: { fontSize: fonts.sizes.lg, fontWeight: '700', color: colors.textPrimary },
  modalClose: { fontSize: fonts.sizes.lg, color: colors.textMuted, fontWeight: '700' },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm },
  settingLabel: { fontSize: fonts.sizes.md, color: colors.textPrimary },
  toggle: { width: 48, height: 26, borderRadius: 13, backgroundColor: colors.bgOverlay, borderWidth: 1, borderColor: colors.border, padding: 2 },
  toggleOn: { backgroundColor: colors.primaryDark, borderColor: colors.primary },
  toggleThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.textMuted },
  toggleThumbOn: { backgroundColor: colors.primary, transform: [{ translateX: 22 }] },
  profileContent: { alignItems: 'center', paddingVertical: spacing.md, gap: spacing.md },
  profileAvatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  profileAvatarText: { fontSize: 32, fontWeight: '700', color: colors.textOnPrimary },
  profileName: { fontSize: fonts.sizes.xl, fontWeight: '700', color: colors.textPrimary },
  xpBar: { width: '100%', height: 8, backgroundColor: colors.bgOverlay, borderRadius: 4, overflow: 'hidden' },
  xpFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 4 },
  xpLabel: { fontSize: fonts.sizes.sm, color: colors.textMuted },
  logoutBtn: { marginTop: spacing.lg, alignItems: 'center', padding: spacing.sm },
  logoutText: { color: colors.error, fontWeight: '600' },
});
