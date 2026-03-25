/**
 * Module augmentation: re-declare expo-linear-gradient with a proper React
 * class-component type so TypeScript (TS2786) is satisfied under strict mode.
 *
 * The published @types bundled with expo-linear-gradient 12.x extend a base
 * that doesn't satisfy `new (props) => Component<…>`, causing TS2607/TS2786.
 * This local override replaces the problematic declaration.
 */

import * as React from 'react';
import { ViewProps } from 'react-native';

declare module 'expo-linear-gradient' {
  export interface LinearGradientPoint {
    x: number;
    y: number;
  }

  export interface LinearGradientProps extends ViewProps {
    colors: string[];
    locations?: number[] | null;
    start?: LinearGradientPoint | null;
    end?: LinearGradientPoint | null;
    dither?: boolean;
  }

  export class LinearGradient extends React.Component<LinearGradientProps> {}
}
