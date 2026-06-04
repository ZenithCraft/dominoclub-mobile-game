import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Image, Platform, Pressable, Linking,
} from 'react-native';
import * as Location from 'expo-location';
import { BlurModal } from './BlurModal';
import { GradientToggle } from '../screens/HomeScreen';
import { IconX } from './Icons';
import { colors, spacing, fonts, radius, shadows } from '../theme';
import { toast } from '../store/toast.store';

const CARD_PAD = Platform.OS === 'web' ? 24 : 16;
const ITEM_GAP = Platform.OS === 'web' ? 24 : 16;

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function SettingsModal({ visible, onClose }: Props) {
  const [soundOn, setSoundOn] = useState(true);
  const [musicOn, setMusicOn] = useState(true);
  const [locationGranted, setLocationGranted] = useState<boolean | null>(null);

  return (
    <BlurModal visible={visible} transparent animationType="fade">
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={styles.card}
          onPress={() => {}}
          onStartShouldSetResponder={() => true}
        >
          <View style={styles.textureWrap} pointerEvents="none">
            <Image
              source={require('../../assets/e27c2e8e377e60057010a8431706b96b0152436f.png')}
              style={styles.texture}
              resizeMode="cover"
            />
          </View>

          <View style={styles.header}>
            <View style={{ width: 26 }} />
            <Text style={styles.title}>Configurações</Text>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Fechar configurações">
              <IconX size={26} color="#fff" />
            </TouchableOpacity>
          </View>

          <View style={styles.item}>
            <Text style={styles.label}>Som:</Text>
            <GradientToggle value={soundOn} onValueChange={setSoundOn} kind="sound" accessibilityLabel="Som" />
          </View>

          <View style={styles.item}>
            <Text style={styles.label}>Música:</Text>
            <GradientToggle value={musicOn} onValueChange={setMusicOn} kind="music" accessibilityLabel="Música" />
          </View>

          {Platform.OS !== 'web' && (
            <View style={styles.item}>
              <Text style={styles.label}>Localização:</Text>
              <TouchableOpacity
                style={styles.locationBtn}
                onPress={async () => {
                  try {
                    const { status } = await Location.getForegroundPermissionsAsync();
                    if (status === 'granted') { toast.info('Localização já está ativada'); return; }
                    const { status: ns } = await Location.requestForegroundPermissionsAsync();
                    if (ns === 'granted') { setLocationGranted(true); toast.success('Localização ativada!'); }
                    else Linking.openSettings();
                  } catch {}
                }}
              >
                <Text style={[styles.locationText, locationGranted && styles.locationGranted]}>
                  {locationGranted ? '✓ Ativada' : 'Ativar'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </Pressable>
      </Pressable>
    </BlurModal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center', justifyContent: 'center',
  },
  card: {
    width: Platform.OS === 'web' ? 640 : 440,
    maxWidth: '92%',
    backgroundColor: colors.bgCard,
    borderRadius: radius.xl,
    padding: CARD_PAD,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#BBFF00',
    gap: ITEM_GAP,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0px 8px 20px rgba(0,0,0,0.45)' } as any) : shadows.card),
  },
  textureWrap: { ...StyleSheet.absoluteFillObject },
  texture: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.12,
    width: '140%', height: '140%',
    top: '-20%', left: '-20%',
    ...(Platform.OS === 'web' ? ({ objectFit: 'cover', objectPosition: 'center' } as any) : null),
  } as any,
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: {
    fontSize: fonts.sizes.xxxl, fontWeight: '900', color: '#fff',
    textAlign: 'center', flex: 1,
    fontFamily: Platform.OS === 'web' ? ('Inria Sans' as any) : 'System',
  },
  item: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: CARD_PAD, paddingVertical: ITEM_GAP,
    borderRadius: radius.lg, overflow: 'hidden',
  },
  label: {
    fontSize: fonts.sizes.xl, color: '#fff', fontWeight: '800',
    fontFamily: Platform.OS === 'web' ? ('Inria Sans' as any) : 'System',
  },
  locationBtn: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(28,187,61,0.12)',
    borderWidth: 1, borderColor: 'rgba(28,187,61,0.3)',
  },
  locationText:    { color: colors.primary, fontWeight: '700', fontSize: fonts.sizes.sm },
  locationGranted: { color: '#1CBB3D' },
});
