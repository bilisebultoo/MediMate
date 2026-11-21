import '@/global.css';
import { Platform } from 'react-native';

export { Colors, type ThemeColor } from './colors';
export { Fonts } from './typography';
export { Spacing } from './spacing';

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
