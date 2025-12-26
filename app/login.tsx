import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { UserStorage } from "@/lib/user-storage";

/**
 * PIN 码登录页面
 */
export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();

  const [pin, setPin] = useState("");
  const [name, setName] = useState("");
  const [isFirstUser, setIsFirstUser] = useState(false);
  const [loading, setLoading] = useState(false);

  // 检查是否是首次使用
  useState(() => {
    const checkFirstUser = async () => {
      const hasUsers = await UserStorage.hasUsers();
      setIsFirstUser(!hasUsers);
    };
    checkFirstUser();
  });

  // 处理登录
  const handleLogin = async () => {
    if (!pin.trim()) {
      Alert.alert("提示", "请输入 PIN 码");
      return;
    }

    if (pin.length < 4 || pin.length > 6) {
      Alert.alert("提示", "PIN 码必须是 4-6 位数字");
      return;
    }

    if (!/^\d+$/.test(pin)) {
      Alert.alert("提示", "PIN 码只能包含数字");
      return;
    }

    setLoading(true);

    try {
      // 查找用户
      const user = await UserStorage.findByPin(pin);

      if (!user) {
        Alert.alert("登录失败", "PIN 码不正确");
        setLoading(false);
        return;
      }

      // 设置当前用户
      await UserStorage.setCurrentUser(user);

      // 跳转到首页
      router.replace("/");
    } catch (error: any) {
      console.error("Login error:", error);
      Alert.alert("登录失败", error.message || "请重试");
    } finally {
      setLoading(false);
    }
  };

  // 处理首次创建用户
  const handleCreateFirstUser = async () => {
    if (!name.trim()) {
      Alert.alert("提示", "请输入姓名");
      return;
    }

    if (!pin.trim()) {
      Alert.alert("提示", "请输入 PIN 码");
      return;
    }

    if (pin.length < 4 || pin.length > 6) {
      Alert.alert("提示", "PIN 码必须是 4-6 位数字");
      return;
    }

    if (!/^\d+$/.test(pin)) {
      Alert.alert("提示", "PIN 码只能包含数字");
      return;
    }

    setLoading(true);

    try {
      // 创建第一个用户（管理员）
      const newUser = await UserStorage.create(name, pin);

      // 设置当前用户
      await UserStorage.setCurrentUser(newUser);

      Alert.alert("欢迎", `${name}，您已成功创建管理员账号！`, [
        {
          text: "开始使用",
          onPress: () => router.replace("/"),
        },
      ]);
    } catch (error: any) {
      console.error("Create user error:", error);
      Alert.alert("创建失败", error.message || "请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <View
        style={[
          styles.content,
          {
            paddingTop: Math.max(insets.top, 60),
            paddingBottom: Math.max(insets.bottom, 20),
          },
        ]}
      >
        <View style={styles.header}>
          <ThemedText type="title" style={styles.title}>
            {isFirstUser ? "创建管理员账号" : "操作员登录"}
          </ThemedText>
          <ThemedText style={styles.subtitle}>
            {isFirstUser
              ? "首次使用，请创建管理员账号"
              : "请输入您的 PIN 码"}
          </ThemedText>
        </View>

        <View style={styles.form}>
          {isFirstUser && (
            <>
              <ThemedText style={styles.label}>姓名</ThemedText>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor:
                      colorScheme === "dark"
                        ? "rgba(255, 255, 255, 0.1)"
                        : "rgba(0, 0, 0, 0.05)",
                    color: colorScheme === "dark" ? "#fff" : "#000",
                  },
                ]}
                value={name}
                onChangeText={setName}
                placeholder="请输入您的姓名"
                placeholderTextColor={
                  colorScheme === "dark"
                    ? "rgba(255, 255, 255, 0.4)"
                    : "rgba(0, 0, 0, 0.4)"
                }
                autoFocus
                returnKeyType="next"
              />
            </>
          )}

          <ThemedText style={styles.label}>PIN 码</ThemedText>
          <TextInput
            style={[
              styles.input,
              styles.pinInput,
              {
                backgroundColor:
                  colorScheme === "dark"
                    ? "rgba(255, 255, 255, 0.1)"
                    : "rgba(0, 0, 0, 0.05)",
                color: colorScheme === "dark" ? "#fff" : "#000",
              },
            ]}
            value={pin}
            onChangeText={setPin}
            placeholder="4-6 位数字"
            placeholderTextColor={
              colorScheme === "dark"
                ? "rgba(255, 255, 255, 0.4)"
                : "rgba(0, 0, 0, 0.4)"
            }
            keyboardType="number-pad"
            maxLength={6}
            secureTextEntry
            autoFocus={!isFirstUser}
            returnKeyType="done"
            onSubmitEditing={isFirstUser ? handleCreateFirstUser : handleLogin}
          />

          <ThemedText style={styles.hint}>
            {isFirstUser
              ? "请设置一个 4-6 位数字 PIN 码，用于登录"
              : "忘记 PIN 码？请联系管理员"}
          </ThemedText>

          <Pressable
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={isFirstUser ? handleCreateFirstUser : handleLogin}
            disabled={loading}
          >
            <ThemedText style={styles.buttonText}>
              {loading ? "处理中..." : isFirstUser ? "创建账号" : "登录"}
            </ThemedText>
          </Pressable>
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "center",
  },
  header: {
    marginBottom: 48,
    alignItems: "center",
  },
  title: {
    fontSize: 32,
    marginBottom: 12,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    opacity: 0.7,
    textAlign: "center",
  },
  form: {
    width: "100%",
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
  },
  input: {
    height: 56,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    marginBottom: 24,
  },
  pinInput: {
    fontSize: 24,
    letterSpacing: 8,
    textAlign: "center",
  },
  hint: {
    fontSize: 14,
    opacity: 0.6,
    marginBottom: 32,
    textAlign: "center",
  },
  button: {
    height: 56,
    backgroundColor: "#007AFF",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
});
