import React from 'react';
import { View, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { colors, shadows } from '../theme';

interface Props {
  tile: [number, number] | null;
  selected?: boolean;
  onPress?: () => void;
  size?: 'sm' | 'md' | 'lg';
  horizontal?: boolean;
  faceDown?: boolean;
  style?: ViewStyle;
}

const PIP_POSITIONS: Record<number, [number, number][]> = {
  0: [],
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [2, 0], [0, 2], [2, 2]],
  5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
};

function PipGrid({ count, pipSize }: { count: number; pipSize: number }) {
  const positions = PIP_POSITIONS[count] || [];
  const gridSize = pipSize * 3 + 4;

  return (
    <View style={{ width: gridSize, height: gridSize, position: 'relative' }}>
      {positions.map(([col, row], i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            width: pipSize,
            height: pipSize,
            borderRadius: pipSize / 2,
            backgroundColor: colors.tilePip,
            left: col * (pipSize + 2),
            top: row * (pipSize + 2),
          }}
        />
      ))}
    </View>
  );
}

export function DominoTile({ tile, selected, onPress, size = 'md', horizontal = true, faceDown, style }: Props) {
  const dimensions = {
    sm: { w: 40, h: 22, pip: 4, pad: 3 },
    md: { w: 60, h: 32, pip: 5, pad: 5 },
    lg: { w: 80, h: 44, pip: 7, pad: 6 },
  }[size];

  const { w, h, pip, pad } = dimensions;
  const halfWidth = horizontal ? w / 2 : w;
  const halfHeight = horizontal ? h : h / 2;

  const tileStyle: ViewStyle = horizontal
    ? { width: w, height: h, flexDirection: 'row' }
    : { width: h, height: w, flexDirection: 'column' };

  const content = (
    <View
      style={[
        styles.tile,
        tileStyle,
        selected && styles.selected,
        faceDown && styles.faceDown,
        style,
      ]}
    >
      {faceDown ? (
        <View style={styles.faceDownPattern} />
      ) : tile ? (
        <>
          <View style={[styles.half, { width: halfWidth, height: halfHeight, padding: pad }]}>
            <PipGrid count={tile[0]} pipSize={pip} />
          </View>
          <View style={horizontal ? styles.dividerH : styles.dividerV} />
          <View style={[styles.half, { width: halfWidth, height: halfHeight, padding: pad }]}>
            <PipGrid count={tile[1]} pipSize={pip} />
          </View>
        </>
      ) : null}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }
  return content;
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: colors.tileBg,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.tileBorder,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.tile,
  },
  selected: {
    borderColor: colors.primary,
    borderWidth: 2,
    shadowColor: colors.primary,
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 10,
    transform: [{ translateY: -4 }],
  },
  faceDown: {
    backgroundColor: '#166534',
    borderColor: '#14532d',
  },
  faceDownPattern: {
    flex: 1,
    opacity: 0.3,
  },
  half: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dividerH: {
    width: 1,
    height: '70%',
    backgroundColor: colors.tileBorder,
  },
  dividerV: {
    width: '70%',
    height: 1,
    backgroundColor: colors.tileBorder,
  },
});
