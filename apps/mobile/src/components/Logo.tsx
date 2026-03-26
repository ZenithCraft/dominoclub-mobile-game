import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface Props {
  size?: 'sm' | 'md' | 'lg';
}

const LIME = '#4ade80';

export function Logo({ size = 'md' }: Props) {
  const fontSize  = size === 'sm' ? 15 : size === 'lg' ? 30 : 21;
  const tileW     = size === 'sm' ? 22 : size === 'lg' ? 42 : 30;
  const tileH     = size === 'sm' ? 12 : size === 'lg' ? 22 : 16;
  const pipRadius = size === 'sm' ? 1.5 : size === 'lg' ? 3 : 2;

  return (
    <View style={styles.container}>
      {/* "DOMINO" line */}
      <Text style={[styles.domino, { fontSize }]}>DOMINO</Text>

      {/* "[domino-icon] CLUB" line */}
      <View style={styles.bottomRow}>
        {/* Horizontal domino tile */}
        <View style={[styles.tile, { width: tileW, height: tileH, borderRadius: tileH * 0.25 }]}>
          <View style={styles.halfLeft}>
            <View style={[styles.pip, { width: pipRadius * 2, height: pipRadius * 2, borderRadius: pipRadius }]} />
            <View style={[styles.pip, { width: pipRadius * 2, height: pipRadius * 2, borderRadius: pipRadius }]} />
          </View>
          <View style={styles.tileDivider} />
          <View style={styles.halfRight}>
            <View style={[styles.pip, { width: pipRadius * 2, height: pipRadius * 2, borderRadius: pipRadius }]} />
            <View style={[styles.pip, { width: pipRadius * 2, height: pipRadius * 2, borderRadius: pipRadius }]} />
          </View>
        </View>

        <Text style={[styles.club, { fontSize }]}> CLUB</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  domino: {
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 4,
    lineHeight: undefined,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  tile: {
    borderWidth: 1.5,
    borderColor: LIME,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  halfLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  tileDivider: {
    width: 1,
    backgroundColor: LIME,
    alignSelf: 'stretch',
  },
  halfRight: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  pip: {
    backgroundColor: LIME,
  },
  club: {
    fontWeight: '800',
    color: LIME,
    letterSpacing: 4,
  },
});
