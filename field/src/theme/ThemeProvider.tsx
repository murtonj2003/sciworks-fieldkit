// Day or night: follows the phone's setting, plus a manual Night switch on Home that the phone remembers.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';

import { getMeta, setMeta } from '@/db/meta';

import { day, night, type Tokens } from './theme';

type Appearance = 'auto' | 'day' | 'night';

interface ThemeValue {
  t: Tokens;
  appearance: Appearance;
  /** Cycles the manual switch: follow the phone → night → day → follow the phone. */
  setAppearance: (a: Appearance) => void;
}

const Ctx = createContext<ThemeValue>({ t: day, appearance: 'auto', setAppearance: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const [appearance, setState] = useState<Appearance>(() => {
    try {
      return (getMeta('appearance') as Appearance | null) ?? 'auto';
    } catch {
      return 'auto';
    }
  });
  const setAppearance = useCallback((a: Appearance) => {
    setMeta('appearance', a);
    setState(a);
  }, []);
  const isNight = appearance === 'night' || (appearance === 'auto' && scheme === 'dark');
  const value = useMemo(() => ({ t: isNight ? night : day, appearance, setAppearance }), [isNight, appearance, setAppearance]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeValue {
  return useContext(Ctx);
}

/** Styles that depend on the tokens, rebuilt only when day/night changes. */
export function makeStyles<S extends StyleSheet.NamedStyles<S>>(build: (t: Tokens) => S) {
  const cache = new Map<string, S>();
  return function useStyles(): S {
    const { t } = useTheme();
    let s = cache.get(t.name);
    if (!s) {
      s = StyleSheet.create(build(t));
      cache.set(t.name, s);
    }
    return s;
  };
}
