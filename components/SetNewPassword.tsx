import React, { useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { AppText as Text } from './AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

export default function SetNewPassword() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (password.length < 10) {
      setError('Password must be at least 10 characters.');
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    const { error: authError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (authError) setError(authError.message);
    // On success, the SIGNED_IN event fires and RootLayout routes onward.
  };

  const cancel = async () => {
    // Drop the temporary recovery session so the user lands on the sign-in screen.
    await supabase.auth.signOut();
  };

  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={s.flex}
      >
        <View style={s.brandBlock}>
          <Image source={require('../assets/joo-ios-icon.png')} style={s.brandIcon} />
          <Text style={s.tagline}>almost there — set a new password.</Text>
        </View>

        <View style={s.form}>
          <Text style={s.formTitle}>Choose a new password</Text>

          <Text style={s.label}>NEW PASSWORD</Text>
          <TextInput
            style={s.input}
            value={password}
            onChangeText={setPassword}
            placeholder="At least 10 characters"
            placeholderTextColor="#3A3A3A"
            secureTextEntry
            autoComplete="new-password"
            autoFocus
            editable={!loading}
          />

          <Text style={s.label}>CONFIRM PASSWORD</Text>
          <TextInput
            style={s.input}
            value={confirm}
            onChangeText={setConfirm}
            placeholder="Type it again"
            placeholderTextColor="#3A3A3A"
            secureTextEntry
            autoComplete="new-password"
            editable={!loading}
          />

          {error && (
            <View style={s.errorBox}>
              <Ionicons name="alert-circle-outline" size={14} color="#FF6B6B" />
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[s.primaryBtn, loading && s.primaryBtnDisabled]}
            onPress={submit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <Text style={s.primaryBtnText}>Update Password</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={s.cancelBtn} onPress={cancel} disabled={loading}>
            <Text style={s.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0D0D' },
  flex: { flex: 1 },
  brandBlock: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  brandIcon: { width: 132, height: 132, marginBottom: 14 },
  tagline: { fontSize: 14, color: '#444', textAlign: 'center', fontWeight: '500' },

  form: { paddingHorizontal: 24, paddingBottom: 36 },
  formTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 24,
    letterSpacing: -0.4,
  },

  label: { fontSize: 10, fontWeight: '700', color: '#555', letterSpacing: 1.2, marginBottom: 8 },
  input: {
    backgroundColor: '#151515',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#FFF',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#222',
    fontWeight: '500',
  },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1F0D0D',
    borderColor: '#3A1818',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  errorText: { color: '#FF6B6B', fontSize: 13, flex: 1, fontWeight: '500' },

  primaryBtn: {
    backgroundColor: '#00C896',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 6,
    shadowColor: '#00C896',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: '#000' },

  cancelBtn: { alignItems: 'center', paddingVertical: 14 },
  cancelText: { fontSize: 13, color: '#555', fontWeight: '500' },
});
