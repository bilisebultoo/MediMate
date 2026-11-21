export const Colors = {
  light: {
    text: '#173D35',
    background: '#F7FAF9',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#E8F5EE',
    textSecondary: '#71817C',
    border: '#E4ECE8',
    accent: '#287A65',
    danger: '#B04444',
  },
  dark: {
    text: '#E8F1ED',
    background: '#101A17',
    backgroundElement: '#1B2A25',
    backgroundSelected: '#294238',
    textSecondary: '#A8B7B0',
    border: '#36483F',
    accent: '#70C5A7',
    danger: '#F08A8A',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;
