import '@/lib/polyfills';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';

import { getDb } from '@/db/db';
import { deviceId } from '@/db/meta';
import { sealAll } from '@/db/records';
import { bootInfo } from '@/lib/boot';
import { FieldProvider } from '@/state/field';

/** Runs once, before any screen reads data: open the database, make the device ID, recover crashed drafts. */
function boot() {
  getDb();
  deviceId();
  bootInfo.recoveredDrafts = sealAll();
  return true;
}

export default function RootLayout() {
  useState(boot);
  return (
    <FieldProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerTitleStyle: { fontWeight: '700' }, headerBackTitle: 'Back' }}>
        <Stack.Screen name="index" options={{ title: 'Sci-works Field' }} />
        <Stack.Screen name="person" options={{ title: 'Who is using this phone?' }} />
        <Stack.Screen name="storage" options={{ title: 'Storage check' }} />
        <Stack.Screen name="survey/new" options={{ title: 'New survey' }} />
        <Stack.Screen name="survey/[id]" options={{ title: 'Survey' }} />
        <Stack.Screen name="encounter/[id]" options={{ title: 'Animal' }} />
        <Stack.Screen name="species/[id]" options={{ title: 'Choose species' }} />
        <Stack.Screen name="handover" options={{ title: 'Hand over to HQ' }} />
      </Stack>
    </FieldProvider>
  );
}
