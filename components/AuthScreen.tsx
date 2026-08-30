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
import { supabase, getRedirectUrl } from '../lib/supabase';
import { glowGreen } from '../lib/glows';

type Mode = 'sign-in' | 'sign-up' | 'reset';

export default function AuthScreen() {
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  const submit = async () => {
    setError(null);

    if (mode === 'reset') {
      if (!email.trim()) {
        setError('Enter your email.');
        return;
      }
      setLoading(true);
      const { error: authError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: getRedirectUrl(),
      });
      setLoading(false);
      if (authError) setError(authError.message);
      else setResetSent(true);
      return;
    }

    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }
    if (mode === 'sign-up' && password.length < 10) {
      setError('Password must be at least 10 characters.');
      return;
    }

    setLoading(true);
    const { error: authError } =
      mode === 'sign-in'
        ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
        : await supabase.auth.signUp({ email: email.trim(), password });
    setLoading(false);
    if (authError) setError(authError.message);
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setResetSent(false);
  };

  const title =
    mode === 'sign-in'
      ? 'Welcome back'
      : mode === 'sign-up'
        ? 'Create your account'
        : 'Reset your password';

  const cta =
    mode === 'sign-in' ? 'Sign In' : mode === 'sign-up' ? 'Create Account' : 'Send reset link';

  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={s.flex}
      >
        <View style={s.brandBlock}>
          <Image source={require('../assets/joo-ios-icon.png')} style={s.brandIcon} />
          <Text style={s.tagline}>your finances, simplified.</Text>
        </View>

        <View style={s.form}>
          <Text style={s.formTitle}>{title}</Text>

          {resetSent ? (
            <View style={s.sentBox}>
              <Ionicons name="mail-outline" size={28} color="#00C896" style={glowGreen} />
              <Text style={s.sentTitle}>Check your email</Text>
              <Text style={s.sentText}>
                We sent a password reset link to{'\n'}
                <Text style={s.sentEmail}>{email.trim()}</Text>
              </Text>
              <Text style={s.sentHint}>
                Click the link to set a new password. The link expires in 1 hour.
              </Text>
              <TouchableOpacity style={s.primaryBtn} onPress={() => switchMode('sign-in')}>
                <Text style={s.primaryBtnText}>Back to sign in</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={s.label}>EMAIL</Text>
              <TextInput
                style={s.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor="#3A3A3A"
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                editable={!loading}
              />

              {mode !== 'reset' && (
                <>
                  <View style={s.passwordHeader}>
                    <Text style={s.label}>PASSWORD</Text>
                    {mode === 'sign-in' && (
                      <TouchableOpacity onPress={() => switchMode('reset')} disabled={loading}>
                        <Text style={s.forgotLink}>Forgot?</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <TextInput
                    style={s.input}
                    value={password}
                    onChangeText={setPassword}
                    placeholder={mode === 'sign-up' ? 'At least 10 characters' : '••••••••'}
                    placeholderTextColor="#3A3A3A"
                    secureTextEntry
                    autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                    editable={!loading}
                  />
                </>
              )}

              {mode === 'reset' && (
                <Text style={s.resetHelp}>
                  We'll send a link to set a new password.
                </Text>
              )}

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
                  <Text style={s.primaryBtnText}>{cta}</Text>
                )}
              </TouchableOpacity>

              {mode === 'reset' ? (
                <TouchableOpacity
                  style={s.switchBtn}
                  onPress={() => switchMode('sign-in')}
                  disabled={loading}
                >
                  <Text style={s.switchText}>
                    Remembered it? <Text style={s.switchLink}>Sign in</Text>
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={s.switchBtn}
                  onPress={() => switchMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}
                  disabled={loading}
                >
                  <Text style={s.switchText}>
                    {mode === 'sign-in' ? "Don't have an account? " : 'Already have one? '}
                    <Text style={s.switchLink}>
                      {mode === 'sign-in' ? 'Sign up' : 'Sign in'}
                    </Text>
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}
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
  tagline: { fontSize: 14, color: '#444', fontWeight: '500' },

  form: { paddingHorizontal: 24, paddingBottom: 36 },
  formTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 24,
    letterSpacing: -0.4,
  },

  label: { fontSize: 10, fontWeight: '700', color: '#555', letterSpacing: 1.2, marginBottom: 8 },
  passwordHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  forgotLink: {
    fontSize: 11,
    color: '#00C896',
    fontWeight: '600',
    letterSpacing: 0.3,
    textShadowColor: 'rgba(0, 200, 150, 0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },

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
  resetHelp: { fontSize: 12, color: '#555', marginBottom: 16, marginTop: -8, fontWeight: '500' },

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

  switchBtn: { alignItems: 'center', paddingVertical: 16 },
  switchText: { fontSize: 13, color: '#555', fontWeight: '500' },
  switchLink: {
    color: '#00C896',
    fontWeight: '600',
    textShadowColor: 'rgba(0, 200, 150, 0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },

  // "Check your email" view
  sentBox: { alignItems: 'center', paddingTop: 12 },
  sentTitle: { fontSize: 20, fontWeight: '700', color: '#FFF', marginTop: 12, marginBottom: 10, letterSpacing: -0.3 },
  sentText: { fontSize: 14, color: '#888', textAlign: 'center', lineHeight: 20, marginBottom: 8, fontWeight: '500' },
  sentEmail: { color: '#CCC', fontWeight: '600' },
  sentHint: { fontSize: 12, color: '#444', textAlign: 'center', marginBottom: 24, lineHeight: 17, fontWeight: '500' },
});
