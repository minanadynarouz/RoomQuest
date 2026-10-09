import type { Theme } from '@roomquest/schema';
import { Color } from '@iwsdk/core';

/**
 * 4-theme toy palette (Architecture §7, X-03).
 * Hex colours are baked into vertex colours; pieces share one
 * MeshStandardMaterial({ vertexColors: true }).
 */
export interface ToyPaletteHex {
  primary: number;
  secondary: number;
  accent: number;
  dark: number;
}

export interface ToyPalette {
  primary: Color;
  secondary: Color;
  accent: Color;
  dark: Color;
}

export const THEME_PALETTES: Record<Theme, ToyPaletteHex> = {
  forest: {
    primary: 0x3d6b4f,
    secondary: 0xc4a35a,
    accent: 0xe8d48a,
    dark: 0x2a4030,
  },
  desert: {
    primary: 0xd4a574,
    secondary: 0xc45c26,
    accent: 0xf0e6d0,
    dark: 0x6b3a20,
  },
  snow: {
    primary: 0xe8f0f8,
    secondary: 0x7ba3c4,
    accent: 0xffd97a,
    dark: 0x4a6278,
  },
  sky: {
    primary: 0x7ec8e3,
    secondary: 0xf7f3e8,
    accent: 0xffc857,
    dark: 0x3d5a80,
  },
};

export function paletteFor(theme: Theme): ToyPalette {
  const hex = THEME_PALETTES[theme];
  return {
    primary: new Color(hex.primary),
    secondary: new Color(hex.secondary),
    accent: new Color(hex.accent),
    dark: new Color(hex.dark),
  };
}
