import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { subscribeSync } from '../lib/sync';

export default function SyncIndicator() {
  const [status, setStatus] = useState<'ok' | 'failed'>('ok');
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () =>
      subscribeSync((s, err) => {
        setStatus(s);
        setError(err);
      }),
    [],
  );

  if (status === 'ok') return null;

  // Tap-to-reveal: surfaces the underlying Supabase error so users (and we)
  // can diagnose sync failures without leaving the app.
  const reveal = () => {
    Alert.alert('Sync failed', error ?? 'Unknown error');
  };

  return (
    <View style={s.host}>
      <Pressable onPress={reveal} style={s.pill}>
        <Ionicons name="cloud-offline-outline" size={12} color="#FF6B6B" />
        <Text style={s.text}>Saved locally — tap for details</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  host: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 100,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1F0D0D',
    borderColor: '#3A1818',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  text: { fontSize: 11, color: '#FF6B6B', fontWeight: '600' },
});
