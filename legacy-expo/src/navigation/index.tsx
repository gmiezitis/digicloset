import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { TabNavigator } from './TabNavigator';
import { TryOnScreen } from '@/screens/TryOnScreen';
import { colors, typography } from '@theme';

export type RootStackParamList = {
  Main: undefined;
  TryOn: {
    garmentUri: string;
    garmentName?: string;
    category?: string;
  };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function Navigation() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: {
            backgroundColor: colors.surface,
          },
          headerTitleStyle: {
            fontSize: typography.fontSize.lg,
            fontWeight: typography.fontWeight.semibold,
            color: colors.text.primary,
          },
          headerTintColor: colors.accent.primary,
        }}
      >
        <Stack.Screen
          name="Main"
          component={TabNavigator}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="TryOn"
          component={TryOnScreen}
          options={{
            title: 'Virtual Try-On',
            headerShown: false, // TryOnScreen has its own header
            presentation: 'modal',
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export * from './TabNavigator';
