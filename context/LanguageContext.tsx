import { createContext } from 'react';

import type { SupportedLanguage } from '@/constants/config';

export const LanguageContext = createContext<SupportedLanguage>('en');
