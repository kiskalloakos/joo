import { Stack } from 'expo-router/stack';
import { Tabs, usePathname, useRouter } from 'expo-router';
import { type ComponentProps, useEffect, useRef, useState } from 'react';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { AppText as Text } from '../../components/AppText';
import { triggerHomeMoneyAction } from '../../lib/homeHeaderActions';
import { triggerProjectsHeaderAction } from '../../lib/projectsHeaderActions';
import { triggerBusinessHeaderAction } from '../../lib/businessHeaderActions';
import { getTabVisibility, peekTabVisibility, subscribeTabVisibility, type TabVisibility } from '../../lib/tabVisibility';
import { feedback } from '../../lib/feedback';

type WebIcon = ComponentProps<typeof Ionicons>['name'];

function WebHeaderButton({ icon, label, onPress, style }: { icon: WebIcon; label: string; onPress: () => void; style?: object }) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[web.actionButton, style]}
    >
      <Ionicons name={icon} size={20} color="#00C896" />
    </TouchableOpacity>
  );
}

function WebTopNavigation({
  visibility,
  pathname,
  actions,
}: {
  visibility: TabVisibility;
  pathname: string;
  actions: Array<{ icon: WebIcon; label: string; onPress: () => void }>;
}) {
  const router = useRouter();
  const tabs = [
    { name: 'Home', href: '/', visible: true },
    { name: 'Business', href: '/business', visible: visibility.business },
    { name: 'Wealth', href: '/investments', visible: visibility.wealth },
    { name: 'Debts', href: '/debts', visible: visibility.debts },
    { name: 'Projects', href: '/projects', visible: visibility.projects },
  ];

  return (
    <View style={web.topNavLayer}>
      <View style={web.topNav}>
        {tabs.filter((tab) => tab.visible).map((tab) => {
          const active = tab.href === '/' ? pathname === '/' || pathname === '/index' : pathname === tab.href;
          return (
            <TouchableOpacity
              key={tab.href}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => router.push(tab.href as never)}
              style={[web.tab, active && web.tabActive]}
            >
              <Text style={[web.tabLabel, active && web.tabLabelActive]}>{tab.name}</Text>
            </TouchableOpacity>
          );
        })}
        <View style={web.navDivider} />
        {actions.map((action) => (
          <WebHeaderButton key={action.label} {...action} style={web.navActionButton} />
        ))}
      </View>
    </View>
  );
}

export default function TabLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const isHome = pathname === '/' || pathname === '/index';
  const isBusiness = pathname === '/business';
  const isProjects = pathname === '/projects';
  const previousPathname = useRef(pathname);
  const [visibility, setVisibility] = useState<TabVisibility>(peekTabVisibility);
  useEffect(() => {
    getTabVisibility().then(setVisibility);
    return subscribeTabVisibility(setVisibility);
  }, []);
  useEffect(() => {
    if (previousPathname.current !== pathname) feedback.select();
    previousPathname.current = pathname;
  }, [pathname]);
  const tabKey = Object.entries(visibility).filter(([, shown]) => shown).map(([name]) => name).join('-');

  // Preserve the existing web layout: its navigation belongs at the top, not
  // in a mobile-style bottom bar. Unlike NativeTabs' web fallback, this small
  // top navigator also omits sections that the profile has disabled.
  if (Platform.OS === 'web') {
    const actions = [
      { icon: 'settings-outline' as WebIcon, label: 'Settings', onPress: () => { feedback.tap(); router.push('/settings'); } },
      ...(isHome ? [
        { icon: 'remove' as WebIcon, label: 'Remove money', onPress: () => { feedback.tap(); triggerHomeMoneyAction('remove'); } },
        { icon: 'add' as WebIcon, label: 'Add money', onPress: () => { feedback.tap(); triggerHomeMoneyAction('add'); } },
      ] : []),
      ...(isBusiness ? [{ icon: 'add' as WebIcon, label: 'Add income', onPress: () => { feedback.tap(); triggerBusinessHeaderAction(); } }] : []),
      ...(isProjects ? [{ icon: 'add' as WebIcon, label: 'Add project', onPress: () => { feedback.tap(); triggerProjectsHeaderAction(); } }] : []),
    ];

    return (
      <>
        <Tabs screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}>
          <Tabs.Screen name="index" />
          <Tabs.Screen name="business" />
          <Tabs.Screen name="investments" />
          <Tabs.Screen name="debts" />
          <Tabs.Screen name="projects" />
          <Tabs.Screen name="recurrings" />
        </Tabs>
        <WebTopNavigation visibility={visibility} pathname={pathname} actions={actions} />
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTransparent: true,
          headerShadowVisible: false,
          title: '',
        }}
      />
      <NativeTabs
        key={tabKey}
        tintColor="#00C896"
        backgroundColor="transparent"
        blurEffect="none"
        shadowColor="transparent"
        disableTransparentOnScrollEdge={false}
        labelStyle={{ default: { fontFamily: 'Geist-SemiBold' }, selected: { fontFamily: 'Geist-SemiBold' } }}
      >
        <NativeTabs.Trigger name="index" disableAutomaticContentInsets>
          <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md="home" />
          <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="business" disableAutomaticContentInsets hidden={!visibility.business}>
          <NativeTabs.Trigger.Icon sf="briefcase" md="business_center" />
          <NativeTabs.Trigger.Label>Business</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="investments" disableAutomaticContentInsets hidden={!visibility.wealth}>
          <NativeTabs.Trigger.Icon sf="chart.line.uptrend.xyaxis" md="trending_up" />
          <NativeTabs.Trigger.Label>Wealth</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="debts" disableAutomaticContentInsets hidden={!visibility.debts}>
          <NativeTabs.Trigger.Icon sf="creditcard" md="credit_card" />
          <NativeTabs.Trigger.Label>Debts</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="projects" disableAutomaticContentInsets hidden={!visibility.projects}>
          <NativeTabs.Trigger.Icon sf="hammer" md="construction" />
          <NativeTabs.Trigger.Label>Projects</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button icon="gearshape" onPress={() => { feedback.tap(); router.push('/settings'); }} />
      </Stack.Toolbar>
      {isHome && (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button
            icon="minus"
            onPress={() => { feedback.tap(); triggerHomeMoneyAction('remove'); }}
          />
          <Stack.Toolbar.Button
            icon="plus"
            onPress={() => { feedback.tap(); triggerHomeMoneyAction('add'); }}
          />
        </Stack.Toolbar>
      )}
      {isBusiness && (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button icon="plus" onPress={() => { feedback.tap(); triggerBusinessHeaderAction(); }} />
        </Stack.Toolbar>
      )}
      {isProjects && (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button icon="plus" onPress={() => { feedback.tap(); triggerProjectsHeaderAction(); }} />
        </Stack.Toolbar>
      )}
    </>
  );
}

const web = StyleSheet.create({
  topNavLayer: { position: 'absolute', top: 24, left: 0, right: 0, alignItems: 'center', zIndex: 10 },
  topNav: { flexDirection: 'row', height: 40, padding: 5, borderRadius: 25, backgroundColor: '#272727', alignItems: 'center' },
  tab: { height: 30, borderRadius: 20, paddingHorizontal: 20, justifyContent: 'center' },
  tabActive: { backgroundColor: '#444' },
  tabLabel: { color: '#8B8B8B', fontSize: 15, fontFamily: 'Geist-SemiBold' },
  tabLabelActive: { color: '#00C896' },
  navDivider: { width: 1, height: 22, backgroundColor: '#444', marginHorizontal: 4 },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  navActionButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
});
