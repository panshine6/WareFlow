import { Tabs, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { View, ActivityIndicator, StyleSheet, Text, Platform } from "react-native";

import { HapticTab } from "@/components/haptic-tab";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { UserStorage } from "@/lib/user-storage";

// 自定义 Tab 按钮组件 - 圆角方形样式
function CustomTabButton({ 
  children, 
  label, 
  focused, 
  color 
}: { 
  children?: React.ReactNode; 
  label: string; 
  focused: boolean; 
  color: string;
}) {
  return (
    <View style={[
      styles.tabButton,
      focused && styles.tabButtonActive,
    ]}>
      <Text style={[
        styles.tabButtonText,
        { color },
        focused && styles.tabButtonTextActive,
      ]}>
        {label}
      </Text>
    </View>
  );
}

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);

  // 检查登录状态
  useEffect(() => {
    const checkAuth = async () => {
      const currentUser = await UserStorage.getCurrentUser();
      if (!currentUser) {
        router.replace("/login");
      } else {
        setIsChecking(false);
      }
    };
    checkAuth();
  }, [router]);

  if (isChecking) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // 计算底部安全区域，Web 端需要额外空间避免误触
  const bottomPadding = Platform.OS === 'web' ? Math.max(insets.bottom, 20) : insets.bottom;
  const tabBarHeight = Platform.OS === 'web' ? 70 + bottomPadding : 65 + bottomPadding;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? "light"].tint,
        tabBarInactiveTintColor: colorScheme === "dark" ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)",
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          paddingBottom: bottomPadding,
          paddingTop: 8,
          height: tabBarHeight,
          borderTopWidth: 1,
          borderTopColor: colorScheme === "dark" ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)",
        },
        tabBarLabelStyle: {
          fontSize: 15,
          fontWeight: "600",
          marginTop: 4,
        },
        tabBarIconStyle: {
          display: "none", // 隐藏图标，只显示文字
        },
        tabBarItemStyle: {
          paddingVertical: 8,
          paddingHorizontal: 12,
          marginHorizontal: 4,
          borderRadius: 12,
          minHeight: 48,
          justifyContent: "center",
          alignItems: "center",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "首页",
          tabBarIcon: () => null,
        }}
      />
      <Tabs.Screen
        name="inbound"
        options={{
          title: "入库",
          tabBarIcon: () => null,
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          title: "库存",
          tabBarIcon: () => null,
        }}
      />
      <Tabs.Screen
        name="outbound"
        options={{
          title: "出库",
          tabBarIcon: () => null,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    minWidth: 70,
    minHeight: 44,
  },
  tabButtonActive: {
    backgroundColor: "rgba(0, 122, 255, 0.1)",
  },
  tabButtonText: {
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  tabButtonTextActive: {
    fontWeight: "700",
  },
});
