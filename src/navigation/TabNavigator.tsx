import React from 'react';
import { View, Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import {
  HomeScreen,
  ClosetScreen,
  OutfitBuilderScreen,
  AddItemScreen,
  PlannerScreen,
  StyleStatsScreen,
} from '@/screens';
import { colors, typography } from '@theme';

export type TabParamList = {
  Home: undefined;
  Closet: undefined;
  Builder: undefined;
  Add: undefined;
  Planner: undefined;
  Stats: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();

export function TabNavigator() {
  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={{
        tabBarActiveTintColor: colors.accent.primary,
        tabBarInactiveTintColor: colors.text.tertiary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          paddingTop: 8,
          paddingBottom: Platform.OS === 'android' ? 20 : 8,
          height: Platform.OS === 'android' ? 90 : 60,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: typography.fontWeight.medium,
          paddingBottom: 2,
        },
        headerStyle: {
          backgroundColor: colors.surface,
          borderBottomColor: colors.border,
          borderBottomWidth: 1,
        },
        headerTitleStyle: {
          fontSize: typography.fontSize.lg,
          fontWeight: typography.fontWeight.semibold,
          color: colors.text.primary,
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Closet"
        component={ClosetScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="shirt-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Builder"
        component={OutfitBuilderScreen}
        options={{
          title: 'Outfits',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="layers-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Add"
        component={AddItemScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="add-circle" size={size + 8} color={color} />
          ),
          tabBarLabel: '',
        }}
      />
      <Tab.Screen
        name="Planner"
        component={PlannerScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Stats"
        component={StyleStatsScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="stats-chart" size={size} color={color} />
          ),
          title: 'Stats',
        }}
      />
    </Tab.Navigator>
  );
}

