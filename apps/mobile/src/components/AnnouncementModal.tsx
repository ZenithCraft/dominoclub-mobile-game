import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, ScrollView, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { BlurModal } from './BlurModal';
import { IconX, IconBell } from './Icons';
import { colors, spacing, fonts, radius, shadows } from '../theme';
import { isTablet } from '../theme/responsive';
import { api } from '../services/api';
import { connectSocket } from '../services/socket';
import { sfx } from '../services/sfx';

interface Announcement {
  id: string;
  title: string;
  body: string | null;
  banner_url: string | null;
  countdown_end: string | null;
}

const SEEN_STORAGE_KEY = '@dominoclub_seen_announcements';

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
// Each is marked seen — both locally (AsyncStorage, so it never resurfaces on
// this device even across app restarts) and server-side (for admin stats) —
// the moment it's displayed. New announcements arrive two ways: a catch-up
// fetch whenever this screen regains focus, and an instant push over the
// existing game socket the moment an admin publishes one.
export function AnnouncementModal() {
  const [queue, setQueue] = useState<Announcement[]>([]);
  const dismissing = useRef(false);
  const seenIds = useRef<Set<string> | null>(null); // null until loaded from storage

  const persistSeen = useCallback(async () => {
    try {
      await AsyncStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify([...(seenIds.current ?? [])]));
    } catch {}
  }, []);

  const enqueueUnseen = useCallback((items: Announcement[]) => {
    if (!seenIds.current || !items.length) return;
    const fresh = items.filter((a) => !seenIds.current!.has(a.id));
    if (!fresh.length) return;
    fresh.forEach((a) => {
      seenIds.current!.add(a.id);
      api.post(`/game/announcements/${a.id}/seen`).catch(() => {});
    });
    persistSeen();
    setQueue((prev) => [...prev, ...fresh]);
  }, [persistSeen]);

  const checkForAnnouncements = useCallback(() => {
    api.get('/game/announcements')
      .then(({ data }) => enqueueUnseen(data?.announcements ?? []))
      .catch(() => {});
  }, [enqueueUnseen]);

  // Load the persisted seen-set once, then do the initial check.
  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(SEEN_STORAGE_KEY)
      .then((raw) => {
        if (!mounted) return;
        seenIds.current = new Set(raw ? JSON.parse(raw) : []);
        checkForAnnouncements();
      })
      .catch(() => {
        if (mounted) { seenIds.current = new Set(); checkForAnnouncements(); }
      });
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // HomeScreen stays mounted in the navigator stack once visited, so this is
  // the catch-up path for anything published while the screen wasn't focused.
  useFocusEffect(
    useCallback(() => {
      if (seenIds.current) checkForAnnouncements();
    }, [checkForAnnouncements])
  );

  // Live push: an admin publishing an announcement broadcasts 'announcement:new'
  // over the same socket the game already uses. Re-run the normal fetch rather
  // than trusting the broadcast payload directly, since the list endpoint alone
  // applies the target-league filter for the current user.
  useEffect(() => {
    let s: Awaited<ReturnType<typeof connectSocket>> | null = null;
    let cancelled = false;
    connectSocket()
      .then((sock) => {
        if (cancelled) return;
        s = sock;
        sock.on('announcement:new', checkForAnnouncements);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      s?.off('announcement:new', checkForAnnouncements);
    };
  }, [checkForAnnouncements]);

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
                <IconBell size={24} color="#0a1f0a" accessibilityLabel="Aviso" />
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
    maxWidth: isTablet ? 560 : 420,
    maxHeight: '62%',
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
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  closeX: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    zIndex: 1,
    width: 28,
    height: 28,
    borderRadius: 14,
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
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  title: {
    color: colors.textPrimary,
    fontSize: fonts.sizes.lg,
    fontWeight: '900',
    textAlign: 'center',
  },
  body: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.sm,
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: spacing.sm,
  },
  countdownBox: {
    alignItems: 'center',
    backgroundColor: 'rgba(251,191,36,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.3)',
    borderRadius: radius.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xs,
  },
  countdownLabel: { color: 'rgba(255,255,255,0.6)', fontSize: fonts.sizes.xs },
  countdownValue: { color: colors.warning, fontWeight: '800', fontSize: fonts.sizes.lg, marginTop: 2 },
  okBtnWrap: {
    width: '100%',
    marginTop: spacing.sm,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  okBtn: {
    width: '100%',
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  okBtnText: { color: colors.textOnPrimary, fontWeight: '800', fontSize: fonts.sizes.md },
});
