import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { BlurModal } from './BlurModal';
import { IconX, IconBell } from './Icons';
import { colors, spacing, fonts, radius, shadows } from '../theme';
import { isTablet } from '../theme/responsive';
import { api } from '../services/api';
import { sfx } from '../services/sfx';

interface Announcement {
  id: string;
  title: string;
  body: string | null;
  banner_url: string | null;
  countdown_end: string | null;
}

function useCountdown(target: string | null) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!target) { setLabel(null); return; }

    const tick = () => {
      const ms = new Date(target).getTime() - Date.now();
      if (ms <= 0) { setLabel('00:00:00'); return; }
      const totalSeconds = Math.floor(ms / 1000);
      const h = Math.floor(totalSeconds / 3600);
      const m = Math.floor((totalSeconds % 3600) / 60);
      const s = totalSeconds % 60;
      const pad = (n: number) => String(n).padStart(2, '0');
      setLabel(`${pad(h)}:${pad(m)}:${pad(s)}`);
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);

  return label;
}

// Shows active announcements/promos to the logged-in player, one at a time.
// Each one is marked as seen (for the max_shows-per-user limit) the moment
// it's displayed, and never shown again for the rest of this app session —
// even though HomeScreen re-checks for new announcements every time it
// regains focus, already-shown ones are skipped via shownIds.
export function AnnouncementModal() {
  const [queue, setQueue] = useState<Announcement[]>([]);
  const dismissing = useRef(false);
  const shownIds = useRef<Set<string>>(new Set());

  // HomeScreen stays mounted in the navigator stack once visited, so a plain
  // mount-only effect would only ever fetch once per app session and miss
  // announcements created (or become eligible) after that. Re-check every
  // time this screen regains focus instead.
  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      api.get('/game/announcements')
        .then(({ data }) => {
          if (!mounted) return;
          const fresh: Announcement[] = (data?.announcements ?? []).filter(
            (a: Announcement) => !shownIds.current.has(a.id)
          );
          if (!fresh.length) return;
          fresh.forEach((a) => {
            shownIds.current.add(a.id);
            api.post(`/game/announcements/${a.id}/seen`).catch(() => {});
          });
          setQueue((prev) => [...prev, ...fresh]);
        })
        .catch(() => {});
      return () => { mounted = false; };
    }, [])
  );

  const current = queue[0];
  const countdown = useCountdown(current?.countdown_end ?? null);

  const dismiss = () => {
    if (!current || dismissing.current) return;
    dismissing.current = true;
    sfx.buttonClick();
    setQueue((prev) => prev.slice(1));
    dismissing.current = false;
  };

  if (!current) return null;

  return (
    <BlurModal visible transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.textureWrap} pointerEvents="none">
            <Image
              source={require('../../assets/e27c2e8e377e60057010a8431706b96b0152436f.png')}
              style={styles.texture}
              resizeMode="cover"
            />
          </View>

          <TouchableOpacity style={styles.closeX} onPress={dismiss} accessibilityLabel="Fechar aviso">
            <IconX size={16} color="rgba(255,255,255,0.7)" accessibilityLabel="Fechar" />
          </TouchableOpacity>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {current.banner_url ? (
              <Image source={{ uri: current.banner_url }} style={styles.banner} resizeMode="cover" />
            ) : (
              <LinearGradient
                colors={['#BEF311', '#1CBB3D']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.iconCircle}
              >
                <IconBell size={30} color="#0a1f0a" accessibilityLabel="Aviso" />
              </LinearGradient>
            )}

            <Text style={styles.title}>{current.title}</Text>
            {current.body ? <Text style={styles.body}>{current.body}</Text> : null}

            {countdown && (
              <View style={styles.countdownBox}>
                <Text style={styles.countdownLabel}>Termina em</Text>
                <Text style={styles.countdownValue}>{countdown}</Text>
              </View>
            )}

            <TouchableOpacity style={styles.okBtnWrap} onPress={dismiss} activeOpacity={0.85}>
              {Platform.OS === 'web' ? (
                <View style={[styles.okBtn, { backgroundImage: 'linear-gradient(114.864deg, rgb(190, 243, 17), rgb(28, 187, 61))' } as any]}>
                  <Text style={styles.okBtnText}>Entendido</Text>
                </View>
              ) : (
                <LinearGradient
                  colors={['#BEF311', '#1CBB3D']}
                  start={{ x: 0, y: 0.268 }}
                  end={{ x: 1, y: 0.732 }}
                  style={styles.okBtn}
                >
                  <Text style={styles.okBtnText}>Entendido</Text>
                </LinearGradient>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </BlurModal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: isTablet ? 580 : 460,
    minHeight: 360,
    maxHeight: '88%',
    backgroundColor: colors.bgCard,
    borderRadius: radius.xl,
    borderWidth: 3,
    borderColor: '#BBFF00',
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0px 8px 24px rgba(0,0,0,0.5)' } as any) : shadows.card),
  },
  textureWrap: { ...StyleSheet.absoluteFillObject },
  texture: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.12,
    width: '140%',
    height: '140%',
    top: '-20%',
    left: '-20%',
    ...(Platform.OS === 'web' ? ({ objectFit: 'cover', objectPosition: 'center' } as any) : null),
  } as any,
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  closeX: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    zIndex: 1,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  banner: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: radius.md,
    marginBottom: spacing.xs,
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  title: {
    color: colors.textPrimary,
    fontSize: fonts.sizes.xl,
    fontWeight: '900',
    textAlign: 'center',
  },
  body: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.sm,
    textAlign: 'center',
    lineHeight: 21,
    paddingHorizontal: spacing.sm,
  },
  countdownBox: {
    alignItems: 'center',
    backgroundColor: 'rgba(251,191,36,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.3)',
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.xs,
  },
  countdownLabel: { color: 'rgba(255,255,255,0.6)', fontSize: fonts.sizes.xs },
  countdownValue: { color: colors.warning, fontWeight: '800', fontSize: fonts.sizes.xl, marginTop: 2 },
  okBtnWrap: {
    width: '100%',
    marginTop: spacing.lg,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  okBtn: {
    width: '100%',
    paddingVertical: spacing.md + 2,
    alignItems: 'center',
  },
  okBtnText: { color: colors.textOnPrimary, fontWeight: '800', fontSize: fonts.sizes.md },
});
