import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { ActivityIndicator, Image, Platform, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { getLoginUrl } from "@/constants/oauth";
import { useColorScheme } from "@/hooks/use-color-scheme";

/**
 * 欢迎页面组件 - 为未登录用户显示
 */
export function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const router = useRouter();
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleLogin = async () => {
    try {
      console.log("[Auth] Login button clicked");
      setIsLoggingIn(true);
      const loginUrl = getLoginUrl();
      console.log("[Auth] Generated login URL:", loginUrl);

      // Web 平台：直接重定向
      if (Platform.OS === "web") {
        console.log("[Auth] Web platform: redirecting to OAuth in same tab...");
        window.location.href = loginUrl;
        return;
      }

      // 移动端：使用 WebBrowser 打开 OAuth
      console.log("[Auth] Opening OAuth URL in browser...");
      const result = await WebBrowser.openAuthSessionAsync(loginUrl, undefined, {
        preferEphemeralSession: false,
        showInRecents: true,
      });

      console.log("[Auth] WebBrowser result:", result);
      if (result.type === "cancel") {
        console.log("[Auth] OAuth cancelled by user");
      } else if (result.type === "dismiss") {
        console.log("[Auth] OAuth dismissed");
      } else if (result.type === "success" && result.url) {
        console.log("[Auth] OAuth session successful, navigating to callback:", result.url);
        
        // 解析回调 URL
        try {
          let url: URL;
          if (result.url.startsWith("exp://") || result.url.startsWith("exps://")) {
            const urlStr = result.url.replace(/^exp(s)?:\/\//, "http://");
            url = new URL(urlStr);
          } else {
            url = new URL(result.url);
          }

          const code = url.searchParams.get("code");
          const state = url.searchParams.get("state");
          const error = url.searchParams.get("error");

          console.log("[Auth] Extracted params from callback URL:", {
            code: code?.substring(0, 20) + "...",
            state: state?.substring(0, 20) + "...",
            error,
          });

          if (error) {
            console.error("[Auth] OAuth error in callback:", error);
            return;
          }

          if (code && state) {
            console.log("[Auth] Navigating to callback route with params...");
            router.push({
              pathname: "/oauth/callback" as any,
              params: { code, state },
            });
          } else {
            console.error("[Auth] Missing code or state in callback URL");
          }
        } catch (err) {
          console.error("[Auth] Failed to parse callback URL:", err, result.url);
          
          // 备用方案：使用正则表达式提取参数
          const codeMatch = result.url.match(/[?&]code=([^&]+)/);
          const stateMatch = result.url.match(/[?&]state=([^&]+)/);

          if (codeMatch && stateMatch) {
            const code = decodeURIComponent(codeMatch[1]);
            const state = decodeURIComponent(stateMatch[1]);
            console.log("[Auth] Fallback: extracted params via regex, navigating...");
            router.push({
              pathname: "/oauth/callback" as any,
              params: { code, state },
            });
          } else {
            console.error("[Auth] Could not extract code/state from URL");
          }
        }
      }
    } catch (error) {
      console.error("[Auth] Login error:", error);
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <ThemedView
      style={[
        styles.container,
        {
          paddingTop: Math.max(insets.top, 40),
          paddingBottom: Math.max(insets.bottom, 20),
          paddingLeft: Math.max(insets.left, 20),
          paddingRight: Math.max(insets.right, 20),
        },
      ]}
    >
      {/* 应用标题 */}
      <View style={styles.header}>
        <ThemedText type="title" style={styles.appTitle}>
          饰品入库助手
        </ThemedText>
        <ThemedText style={styles.subtitle}>智能管理您的饰品库存</ThemedText>
      </View>

      {/* 功能介绍 */}
      <View style={styles.featuresContainer}>
        <FeatureItem
          iconSource={require("@/assets/images/icon-camera.png")}
          title="微距拍照"
          description="拍摄产品细节和全景照片，完整记录产品信息"
        />
        <FeatureItem
          iconSource={require("@/assets/images/icon-ai.png")}
          title="AI 识别"
          description="智能识别产品数量，自动统计库存"
        />
        <FeatureItem
          iconSource={require("@/assets/images/icon-excel.png")}
          title="Excel 导出"
          description="一键导出店小秘格式表格，图片自动嵌入"
        />
        <FeatureItem
          iconSource={require("@/assets/images/icon-operator.png")}
          title="操作员记录"
          description="自动记录入库操作员，方便追溯和管理"
        />
      </View>

      {/* 登录按钮 */}
      <View style={styles.loginContainer}>
        <Pressable
          onPress={handleLogin}
          disabled={isLoggingIn}
          style={[styles.loginButton, isLoggingIn && styles.loginButtonDisabled]}
        >
          {isLoggingIn ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <ThemedText style={styles.loginButtonText}>登录开始使用</ThemedText>
          )}
        </Pressable>
        <ThemedText style={styles.loginHint}>使用 Manus 账号登录</ThemedText>
      </View>
    </ThemedView>
  );
}

/**
 * 功能介绍项组件
 */
function FeatureItem({
  iconSource,
  title,
  description,
}: {
  iconSource: any;
  title: string;
  description: string;
}) {
  return (
    <View style={styles.featureItem}>
      <Image source={iconSource} style={styles.featureIcon} />
      <View style={styles.featureContent}>
        <ThemedText style={styles.featureTitle}>{title}</ThemedText>
        <ThemedText style={styles.featureDescription}>{description}</ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    alignItems: "center",
    marginBottom: 48,
  },
  appTitle: {
    marginBottom: 12,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    opacity: 0.7,
    textAlign: "center",
  },
  featuresContainer: {
    flex: 1,
    gap: 24,
  },
  featureItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
  },
  featureIcon: {
    width: 48,
    height: 48,
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "600",
    marginBottom: 4,
  },
  featureDescription: {
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.7,
  },
  loginContainer: {
    alignItems: "center",
    gap: 12,
    marginTop: 32,
  },
  loginButton: {
    backgroundColor: "#007AFF",
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 12,
    minWidth: 200,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  loginButtonDisabled: {
    opacity: 0.6,
  },
  loginButtonText: {
    color: "#fff",
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "600",
  },
  loginHint: {
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.6,
  },
});
