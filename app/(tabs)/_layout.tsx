import { SymbolView } from 'expo-symbols';
import { Tabs } from 'expo-router';

import { MiraDesign, shadow } from '@/constants/Design';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: MiraDesign.color.primary,
        tabBarInactiveTintColor: MiraDesign.color.muted,
        tabBarItemStyle: {
          paddingVertical: 7,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '800',
        },
        tabBarStyle: {
          backgroundColor: MiraDesign.color.surface,
          borderRadius: 34,
          borderTopWidth: 0,
          bottom: 14,
          height: 68,
          left: 18,
          position: 'absolute',
          right: 18,
          ...shadow,
        },
      }}>
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: 'house.fill', android: 'home', web: 'home' }} tintColor={color} size={27} />
          ),
        }}
      />
      <Tabs.Screen
        name="packages"
        options={{
          title: 'Packages',
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: 'bag.fill', android: 'local_mall', web: 'local_mall' }} tintColor={color} size={27} />
          ),
        }}
      />
      <Tabs.Screen
        name="agent"
        options={{
          title: 'AI',
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: 'sparkles', android: 'smart_toy', web: 'smart_toy' }} tintColor={color} size={27} />
          ),
        }}
      />
      <Tabs.Screen
        name="health"
        options={{
          title: 'Health',
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: 'heart.text.square.fill', android: 'monitor_heart', web: 'monitor_heart' }} tintColor={color} size={27} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: 'ellipsis.circle.fill', android: 'menu', web: 'menu' }} tintColor={color} size={27} />
          ),
        }}
      />
      <Tabs.Screen
        name="chatbot"
        options={{
          title: 'Chatbot',
          tabBarIcon: ({ color }) => (
            <SymbolView
              name={{
                ios: 'message.and.waveform.fill',
                android: 'chat',
                web: 'chat',
              }}
              tintColor={color}
              size={28}
            />
          ),
        }}
      />
    </Tabs>
  );
}
