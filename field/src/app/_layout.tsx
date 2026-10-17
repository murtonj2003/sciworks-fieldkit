import '@/lib/polyfills';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { getDb } from '@/db/db';
import { deviceId } from '@/db/meta';
import { sealAll } from '@/db/records';
import { bootInfo } from '@/lib/boot';
import { FieldProvider } from '@/state/field';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

/** Runs once, before any screen reads data: open the database, make the device ID, recover crashed drafts. */
function boot() {
  getDb();
  deviceId();
  bootInfo.recoveredDrafts = sealAll();
  return true;
}

export default function RootLayout() {
  // DEV ONLY: in the browser preview the stand-in database loads asynchronously first. Phones skip this.
  const [ready, setReady] = useState(Platform.OS !== 'web');
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('expo-sqlite') as { ready?: Promise<void> }).ready?.then(() => setReady(true));
  }, []);
  if (!ready) return null;
  return <Booted />;
}

function Booted() {
  useState(boot);
  return (
    <ThemeProvider>
      <FieldProvider>
        <Shell />
      </FieldProvider>
    </ThemeProvider>
  );
}

/** Small bar for every screen (kit `.fk-nav`): centred 17 px title, back chevron, no shadow. */
function Shell() {
  const { t } = useTheme();
  return (
    <>
      <StatusBar style={t.name === 'night' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerTitleAlign: 'center',
          headerTitleStyle: { fontSize: 17, fontWeight: '600', color: t.ink },
          headerStyle: { backgroundColor: t.ground },
          headerShadowVisible: false,
          headerTintColor: t.ink,
          headerBackTitle: 'Back',
          contentStyle: { backgroundColor: t.ground },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Fieldkit', headerShown: false }} />
        <Stack.Screen name="person" options={{ title: 'Who is using this phone?' }} />
        <Stack.Screen name="storage" options={{ title: 'Storage check' }} />
        <Stack.Screen name="survey/new" options={{ title: 'New survey' }} />
        <Stack.Screen name="survey/[id]" options={{ title: 'Survey' }} />
        <Stack.Screen name="encounter/[id]" options={{ title: 'Animal' }} />
        <Stack.Screen name="species/[id]" options={{ title: 'Species' }} />
        <Stack.Screen name="handover" options={{ title: 'Hand over to HQ' }} />
        <Stack.Screen name="form-settings" options={{ title: 'Form settings' }} />
        <Stack.Screen name="key/[id]" options={{ title: 'Scale key' }} />
        <Stack.Screen name="inbox" options={{ title: 'Corrections from HQ' }} />
      </Stack>
    </>
  );
}
