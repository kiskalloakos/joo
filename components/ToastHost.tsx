import React, { useEffect, useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { AppText as Text } from './AppText';
import { Ionicons } from '@expo/vector-icons';
import { Toast, dismissToast, subscribeToast } from '../lib/toast';

export default function ToastHost() {
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => subscribeToast(setToast), []);

  if (!toast) return null;

  return (
    <View style={s.host} pointerEvents="box-none">
      <View style={s.toast}>
        <Text style={s.message} numberOfLines={2}>
          {toast.message}
        </Text>
        {toast.action && (
          <TouchableOpacity
            onPress={() => {
              toast.action!.onPress();
              dismissToast();
            }}
            style={s.actionBtn}
          >
            <Text style={s.actionText}>{toast.action.label}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={dismissToast} style={s.closeBtn}>
          <Ionicons name="close" size={14} color="#666" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 86, // sits above the tab bar
    alignItems: 'center',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#1A1A1A',
    borderColor: '#2C2C2C',
    borderWidth: 1,
    borderRadius: 14,
    paddingLeft: 14,
    paddingRight: 8,
    paddingVertical: 10,
    maxWidth: 540,
    width: '100%',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
  },
  message: { flex: 1, fontSize: 13, color: '#EEE', fontWeight: '500' },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#0D1F1A',
    borderWidth: 1,
    borderColor: '#1F3A30',
  },
  actionText: {
    fontSize: 12,
    color: '#00C896',
    fontWeight: '700',
    textShadowColor: 'rgba(0, 200, 150, 0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  closeBtn: { padding: 6 },
});
