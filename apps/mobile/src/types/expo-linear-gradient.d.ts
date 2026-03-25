/**
 * Ambient module override for expo-linear-gradient.
 *
 * The types bundled with v12.x extend a non-React-compatible base class,
 * causing TS2607/TS2786 under strict mode.  Declaring the module here
 * (with NO top-level imports — moving them inside the block so this file
 * stays a script, not a module) fully replaces the package's type declaration.
 */
declare module 'expo-linear-gradient' {
  import * as React from 'react';
  import { ViewProps } from 'react-native';

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

  export const LinearGradient: React.ComponentType<LinearGradientProps>;
}
