import { Stack } from 'expo-router/stack';
import { usePathname, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { triggerHomeMoneyAction } from '../../lib/homeHeaderActions';
import { triggerProjectsHeaderAction } from '../../lib/projectsHeaderActions';
import { triggerRevenueHeaderAction } from '../../lib/revenueHeaderActions';
import { getTabVisibility, peekTabVisibility, subscribeTabVisibility, type TabVisibility } from '../../lib/tabVisibility';

export default function TabLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const isHome = pathname === '/' || pathname === '/index';
  const isRevenue = pathname === '/revenue';
  const isProjects = pathname === '/projects';
  const [visibility, setVisibility] = useState<TabVisibility>(peekTabVisibility);
  useEffect(() => {
    getTabVisibility().then(setVisibility);
    return subscribeTabVisibility(setVisibility);
  }, []);
  const tabKey = Object.entries(visibility).filter(([, shown]) => shown).map(([name]) => name).join('-');

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
        <NativeTabs.Trigger name="investments" disableAutomaticContentInsets hidden={!visibility.wealth}>
          <NativeTabs.Trigger.Icon sf="chart.line.uptrend.xyaxis" md="trending_up" />
          <NativeTabs.Trigger.Label>Wealth</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="debts" disableAutomaticContentInsets hidden={!visibility.debts}>
          <NativeTabs.Trigger.Icon sf="creditcard" md="credit_card" />
          <NativeTabs.Trigger.Label>Debts</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="revenue" disableAutomaticContentInsets hidden={!visibility.revenue}>
          <NativeTabs.Trigger.Icon sf="arrow.down.circle" md="arrow_downward" />
          <NativeTabs.Trigger.Label>Revenue</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="projects" disableAutomaticContentInsets hidden={!visibility.projects}>
          <NativeTabs.Trigger.Icon sf="hammer" md="construction" />
          <NativeTabs.Trigger.Label>Projects</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button icon="gearshape" onPress={() => router.push('/settings')} />
      </Stack.Toolbar>
      {isHome && (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button
            icon="minus"
            onPress={() => triggerHomeMoneyAction('remove')}
          />
          <Stack.Toolbar.Button
            icon="plus"
            onPress={() => triggerHomeMoneyAction('add')}
          />
        </Stack.Toolbar>
      )}
      {isRevenue && (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button icon="plus" onPress={triggerRevenueHeaderAction} />
        </Stack.Toolbar>
      )}
      {isProjects && (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button icon="plus" onPress={triggerProjectsHeaderAction} />
        </Stack.Toolbar>
      )}
    </>
  );
}
