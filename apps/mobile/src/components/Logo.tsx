import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts } from '../theme';

interface Props {
  size?: 'sm' | 'md' | 'lg';
}

export function Logo({ size = 'md' }: Props) {
  const scale = size === 'sm' ? 0.6 : size === 'lg' ? 1.5 : 1;

  return (
    <View style={styles.container}>
      {/* Domino tile icon */}
      <View style={[styles.dominoIcon, { transform: [{ scale }] }]}>
        <View style={styles.dominoTop}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.pip} />
          ))}
        </View>
        <View style={styles.dominoDivider} />
        <View style={styles.dominoBottom}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.pip} />
          ))}
        </View>
      </View>

      <View style={[styles.textContainer, { transform: [{ scale }] }]}>
        <Text style={styles.dominoText}>DOMINO</Text>
        <Text style={styles.clubText}>CLUB</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dominoIcon: {
    width: 36,
    height: 64,
    backgroundColor: colors.primary,
    borderRadius: 4,
    padding: 4,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dominoTop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
    justifyContent: 'center',
    width: '100%',
    paddingHorizontal: 2,
  },
  dominoDivider: {
    width: '80%',
    height: 1,
    backgroundColor: colors.primaryDark,
  },
  dominoBottom: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
    justifyContent: 'center',
    width: '100%',
    paddingHorizontal: 2,
  },
  pip: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.bgCard,
  },
  textContainer: {
    alignItems: 'flex-start',
  },
  dominoText: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: 2,
    lineHeight: 24,
  },
  clubText: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 2,
    lineHeight: 24,
  },
});
