import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, fonts, radius } from '../theme';
import { Button } from '../components/Button';
import { useGameStore } from '../store/game.store';
import { connectSocket } from '../services/socket';

type Props = {
  navigation: NativeStackNavigationProp<any>;
  route: { params?: { mode?: string } };
};

const BET_OPTIONS = [5, 10, 20, 50, 100, 200];

export function ModeSelectScreen({ navigation, route }: Props) {
  const [selectedMode, setSelectedMode] = useState<'1v1' | '2v2' | null>(
    route.params?.mode?.includes('1V1') ? '1v1' : route.params?.mode?.includes('2V2') ? '2v2' : null
  );
  const [betAmount, setBetAmount] = useState<number>(10);
  const [searching, setSearching] = useState(false);
  const { setQueueStatus } = useGameStore();

  const modeMap = {
    '1v1': 'ARENA_1V1',
    '2v2': 'TOURNAMENT_2V2',
  };

  const handleSearch = async () => {
    if (!selectedMode) return;
    setSearching(true);
    setQueueStatus('queuing');

    const socket = await connectSocket();
    socket.emit('queue:join', {
      mode: modeMap[selectedMode],
      betAmount,
    });

    socket.once('game:found', ({ gameId }: { gameId: string }) => {
      setQueueStatus('found');
      navigation.replace('Game', { gameId });
    });

    socket.once('queue:error', ({ message }: { message: string }) => {
      setSearching(false);
      setQueueStatus('idle');
      alert(message);
    });
  };

  const handleCancel = async () => {
    const socket = await connectSocket();
    socket.emit('queue:leave');
    setSearching(false);
    setQueueStatus('idle');
  };

  return (
    <View style={styles.container}>
      <View style={styles.bgPattern} pointerEvents="none">
        {Array.from({ length: 40 }).map((_, i) => <View key={i} style={styles.bgTile} />)}
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Escolha o modo</Text>
        <Text style={styles.subtitle}>Selecione como você quer jogar</Text>

        <View style={styles.modeRow}>
          <TouchableOpacity
            style={[styles.modeBtn, selectedMode === '1v1' && styles.modeBtnActive]}
            onPress={() => setSelectedMode('1v1')}
          >
            <Text style={styles.modeBtnIcon}>⚔️</Text>
            <Text style={[styles.modeBtnText, selectedMode === '1v1' && styles.modeBtnTextActive]}>
              1 vs 1
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.modeBtn, selectedMode === '2v2' && styles.modeBtnActive]}
            onPress={() => setSelectedMode('2v2')}
          >
            <Text style={styles.modeBtnIcon}>👥</Text>
            <Text style={[styles.modeBtnText, selectedMode === '2v2' && styles.modeBtnTextActive]}>
              2 vs 2
            </Text>
          </TouchableOpacity>
        </View>

        {selectedMode && (
          <>
            <Text style={styles.betTitle}>Valor da aposta</Text>
            <View style={styles.betGrid}>
              {BET_OPTIONS.map((amount) => (
                <TouchableOpacity
                  key={amount}
                  style={[styles.betBtn, betAmount === amount && styles.betBtnActive]}
                  onPress={() => setBetAmount(amount)}
                >
                  <Text style={[styles.betBtnText, betAmount === amount && styles.betBtnTextActive]}>
                    R${amount}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {searching ? (
          <View style={styles.searchingContainer}>
            <View style={styles.searchingDots}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={[styles.dot, { opacity: 0.3 + i * 0.3 }]} />
              ))}
            </View>
            <Text style={styles.searchingText}>Procurando oponente...</Text>
            <Button title="Cancelar" onPress={handleCancel} variant="ghost" size="sm" style={styles.cancelBtn} />
          </View>
        ) : (
          <Button
            title="Buscar partida"
            onPress={handleSearch}
            disabled={!selectedMode}
            style={styles.searchBtn}
          />
        )}

        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Voltar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  bgPattern: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row', flexWrap: 'wrap', overflow: 'hidden' },
  bgTile: { width: 60, height: 32, borderWidth: 1, borderColor: colors.primary, margin: 10, borderRadius: 3, opacity: 0.06 },
  card: { width: 400, backgroundColor: 'rgba(10,31,10,0.95)', borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.xxl, alignItems: 'center' },
  title: { fontSize: fonts.sizes.xxl, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.xs },
  subtitle: { fontSize: fonts.sizes.sm, color: colors.textMuted, marginBottom: spacing.xl },
  modeRow: { flexDirection: 'row', gap: spacing.lg, marginBottom: spacing.xl },
  modeBtn: { width: 130, paddingVertical: spacing.lg, borderRadius: radius.lg, borderWidth: 2, borderColor: colors.border, alignItems: 'center', gap: spacing.xs, backgroundColor: colors.bgCard },
  modeBtnActive: { borderColor: colors.primary, backgroundColor: 'rgba(74,222,128,0.15)' },
  modeBtnIcon: { fontSize: 28 },
  modeBtnText: { fontSize: fonts.sizes.xl, fontWeight: '800', color: colors.textMuted },
  modeBtnTextActive: { color: colors.primary },
  betTitle: { fontSize: fonts.sizes.md, fontWeight: '600', color: colors.textSecondary, alignSelf: 'flex-start', marginBottom: spacing.sm },
  betGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.xl },
  betBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgCard },
  betBtnActive: { borderColor: colors.primary, backgroundColor: 'rgba(74,222,128,0.15)' },
  betBtnText: { color: colors.textMuted, fontWeight: '600', fontSize: fonts.sizes.sm },
  betBtnTextActive: { color: colors.primary },
  searchBtn: { width: '100%', marginBottom: spacing.md },
  searchingContainer: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.lg },
  searchingDots: { flexDirection: 'row', gap: spacing.sm },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary },
  searchingText: { color: colors.textSecondary, fontSize: fonts.sizes.md },
  cancelBtn: {},
  backBtn: { marginTop: spacing.md },
  backText: { color: colors.textMuted, fontSize: fonts.sizes.sm },
});
