import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import { Platform } from "react-native";
import {
  SafeAreaFrameContext,
  SafeAreaInsetsContext,
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context";
import type { EdgeInsets, Metrics, Rect } from "react-native-safe-area-context";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { trpc, createTRPCClient } from "@/lib/trpc";
import { initManusRuntime, subscribeSafeAreaInsets } from "@/lib/manus-runtime";
import { checkVersionAndClearCache } from "@/lib/cache-buster";
import { ErrorBoundary } from "@/components/error-boundary";
import { DatabaseProvider } from "@/components/database-provider";

const DEFAULT_WEB_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const DEFAULT_WEB_FRAME: Rect = { x: 0, y: 0, width: 0, height: 0 };
// Web iframe previewer cannot infer safe-area; default to zero until container sends metrics.

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const initialInsets = initialWindowMetrics?.insets ?? DEFAULT_WEB_INSETS;
  const initialFrame = initialWindowMetrics?.frame ?? DEFAULT_WEB_FRAME;

  const [insets, setInsets] = useState<EdgeInsets>(initialInsets);
  const [frame, setFrame] = useState<Rect>(initialFrame);

  // Initialize Manus runtime for cookie injection from parent container
  useEffect(() => {
    initManusRuntime();
  }, []);

  // Check version and clear cache if needed (web only)
  useEffect(() => {
    if (Platform.OS === 'web') {
      checkVersionAndClearCache();
    }
  }, []);

  const handleSafeAreaUpdate = useCallback((metrics: Metrics) => {
    setInsets(metrics.insets);
    setFrame(metrics.frame);
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const unsubscribe = subscribeSafeAreaInsets(handleSafeAreaUpdate);
    return () => unsubscribe();
  }, [handleSafeAreaUpdate]);

  // Create clients once and reuse them
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Disable automatic refetching on window focus for mobile
            refetchOnWindowFocus: false,
            // Retry failed requests once
            retry: 1,
          },
        },
      }),
  );
  const [trpcClient] = useState(() => createTRPCClient());

  const providerInitialMetrics = useMemo(
    () => initialWindowMetrics ?? { insets: initialInsets, frame: initialFrame },
    [initialFrame, initialInsets],
  );

  // 应用内容（包含 ErrorBoundary 和 DatabaseProvider）
  const content = (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
          <QueryClientProvider client={queryClient}>
            <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
              <DatabaseProvider>
                <Stack>
                  <Stack.Screen name="login" options={{ headerShown: false }} />
                  <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                  <Stack.Screen name="modal" options={{ presentation: "modal", title: "Modal" }} />
                  <Stack.Screen name="oauth/callback" options={{ headerShown: false }} />
                  <Stack.Screen name="product-detail" options={{ title: "产品详情" }} />
                  <Stack.Screen name="add-product-quick" options={{ title: "快速产品添加" }} />
                  <Stack.Screen name="add-product" options={{ title: "添加产品" }} />
                  <Stack.Screen name="add-product-sku" options={{ title: "SKU 设置" }} />
                  <Stack.Screen name="add-product-location" options={{ title: "存储位置" }} />
                  <Stack.Screen name="add-product-overview" options={{ title: "拍摄全景图" }} />
                  <Stack.Screen name="recycle-bin" options={{ title: "回收站" }} />
                  <Stack.Screen name="backup" options={{ title: "数据备份" }} />
                  <Stack.Screen name="user-management" options={{ title: "用户管理" }} />
                  <Stack.Screen name="duplicate-check" options={{ title: "查重结果" }} />
                  <Stack.Screen name="feedback" options={{ title: "意见反馈" }} />
                </Stack>
                <StatusBar style="auto" />
              </DatabaseProvider>
            </ThemeProvider>
          </QueryClientProvider>
        </trpc.Provider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );

  const shouldOverrideSafeArea = Platform.OS === "web";

  if (shouldOverrideSafeArea) {
    return (
      <SafeAreaProvider initialMetrics={providerInitialMetrics}>
        <SafeAreaFrameContext.Provider value={frame}>
          <SafeAreaInsetsContext.Provider value={insets}>{content}</SafeAreaInsetsContext.Provider>
        </SafeAreaFrameContext.Provider>
      </SafeAreaProvider>
    );
  }

  return <SafeAreaProvider initialMetrics={providerInitialMetrics}>{content}</SafeAreaProvider>;
}
