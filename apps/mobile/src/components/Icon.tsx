import React from 'react';
import { ViewStyle, StyleProp } from 'react-native';
import { LucideIcon } from 'lucide-react-native';

export interface IconProps {
  icon: LucideIcon;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
}

export function Icon({
  icon: IconComponent,
  size = 24,
  color = '#ffffff',
  style,
  accessibilityLabel,
  testID,
}: IconProps) {
  return (
    <IconComponent
      size={size}
      color={color}
      style={style}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    />
  );
}
