import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Platform,
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
import { APP_VERSION, APP_AUTHOR } from "@/lib/version";
import type { User } from "@/types/user";

/**
 * PIN 码登录页面
 */
export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();

  const [pin, setPin] = useState("");
  const [name, setName] = useState("");
  const [isFirstUser, setIsFirstUser] = useState<boolean | null>(null); // null = 加载中
  const [isCreateMode, setIsCreateMode] = useState(false); // 是否是创建账号模式
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<User[]>([]); // 所有用户列表
  const [selectedUser, setSelectedUser] = useState<User | null>(null); // 选中的用户

  // 跨平台的 alert 函数
  const showAlert = (title: string, message: string, onOk?: () => void) => {
    if (Platform.OS === "web") {
      window.alert(`${title}\n\n${message}`);
      if (onOk) onOk();
    } else {
      Alert.alert(title, message, [{ text: "确定", onPress: onOk }]);
    }
  };

  // 检查是否是首次使用，并加载用户列表
  useEffect(() => {
    const checkFirstUser = async () => {
      const hasUsers = await UserStorage.hasUsers();
      setIsFirstUser(!hasUsers);
      setIsCreateMode(!hasUsers); // 如果没有用户，默认进入创建模式

      if (hasUsers) {
        // 加载所有用户
        const allUsers = await UserStorage.getAll();
        setUsers(allUsers);
      }
    };
    checkFirstUser();
  }, []);

  // 处理登录
  const handleLogin = async () => {
    if (!selectedUser) {
      showAlert("提示", "请先选择要登录的账号");
      return;
    }

    if (!pin.trim()) {
      showAlert("提示", "请输入 PIN 码");
      return;
    }

    if (pin.length < 4 || pin.length > 6) {
      showAlert("提示", "PIN 码必须是 4-6 位数字");
      return;
    }

    if (!/^\d+$/.test(pin)) {
      showAlert("提示", "PIN 码只能包含数字");
      return;
    }

    setLoading(true);

    try {
      // 验证 PIN 码是否匹配选中的用户
      if (selectedUser.pin !== pin) {
        showAlert("登录失败", "PIN 码不正确");
        setLoading(false);
        return;
      }

      // 设置当前用户
      await UserStorage.setCurrentUser(selectedUser);

      // 跳转到首页
      router.replace("/");
    } catch (error: any) {
      console.error("Login error:", error);
      showAlert("登录失败", error.message || "请重试");
    } finally {
      setLoading(false);
    }
  };

  // 处理创建用户
  const handleCreateUser = async () => {
    if (!name.trim()) {
      showAlert("提示", "请输入姓名");
      return;
    }

    if (!pin.trim()) {
      showAlert("提示", "请输入 PIN 码");
      return;
    }

    if (pin.length < 4 || pin.length > 6) {
      showAlert("提示", "PIN 码必须是 4-6 位数字");
      return;
    }

    if (!/^\d+$/.test(pin)) {
      showAlert("提示", "PIN 码只能包含数字");
      return;
    }

    setLoading(true);

    try {
      // 创建用户
      const newUser = await UserStorage.create(name, pin);

      // 设置当前用户
      await UserStorage.setCurrentUser(newUser);

      const isAdmin = isFirstUser;

      if (isAdmin) {
        // 管理员账号创建成功，直接进入首页
        showAlert("欢迎", `${name}，您已成功创建管理员账号！`, () =>
          router.replace("/")
        );
      } else {
        // 普通用户注册成功，提示并切换到登录界面
        showAlert(
          "注册成功",
          `${name}，您已注册成功！请使用 PIN 码登录。`,
          async () => {
            setIsCreateMode(false);
            setName("");
            setPin("");
            setSelectedUser(null);
            // 重新加载用户列表
            const allUsers = await UserStorage.getAll();
            setUsers(allUsers);
          }
        );
      }
    } catch (error: any) {
      console.error("Create user error:", error);
      showAlert("创建失败", error.message || "请重试");
    } finally {
      setLoading(false);
    }
  };

  // 切换模式
  const toggleMode = () => {
    setIsCreateMode(!isCreateMode);
    setPin("");
    setName("");
    setSelectedUser(null);
  };

  // 选择用户
  const handleSelectUser = (user: User) => {
    setSelectedUser(user);
    setPin(""); // 清空 PIN 码
  };

  // 取消选择用户
  const handleCancelSelect = () => {
    setSelectedUser(null);
    setPin("");
  };

  // 加载中状态
  if (isFirstUser === null) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ThemedText>加载中...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  // 显示创建账号界面
  const showCreateMode = isCreateMode;

  // 渲染用户选择项
  const renderUserItem = ({ item }: { item: User }) => (
    <Pressable
      style={[
        styles.userItem,
        {
          backgroundColor:
            colorScheme === "dark"
              ? "rgba(255, 255, 255, 0.1)"
              : "rgba(0, 0, 0, 0.05)",
        },
      ]}
      onPress={() => handleSelectUser(item)}
    >
      <View style={styles.userAvatar}>
        <ThemedText style={styles.userAvatarText}>
          {item.name.charAt(0).toUpperCase()}
        </ThemedText>
      </View>
      <View style={styles.userInfo}>
        <ThemedText style={styles.userName}>{item.name}</ThemedText>
        {item.isAdmin && (
          <ThemedText style={styles.adminBadge}>管理员</ThemedText>
        )}
      </View>
    </Pressable>
  );

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
          <ThemedText type="title" style={styles.appTitle}>
            Ladybuty饰品库存管理系统
          </ThemedText>
          <ThemedText type="subtitle" style={styles.title}>
            {showCreateMode
              ? isFirstUser
                ? "创建管理员账号"
                : "创建新账号"
              : selectedUser
              ? `${selectedUser.name} 登录`
              : "操作员登录"}
          </ThemedText>
          <ThemedText style={styles.subtitle}>
            {showCreateMode
              ? isFirstUser
                ? "首次使用，请创建管理员账号"
                : "请填写您的信息"
              : selectedUser
              ? "请输入您的 PIN 码"
              : "请选择您的账号"}
          </ThemedText>
        </View>

        <View style={styles.form}>
          {showCreateMode ? (
            // 创建账号模式
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
                returnKeyType="done"
                onSubmitEditing={handleCreateUser}
              />

              <ThemedText style={styles.hint}>
                请设置一个 4-6 位数字 PIN 码，用于登录
              </ThemedText>

              <Pressable
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleCreateUser}
                disabled={loading}
              >
                <ThemedText style={styles.buttonText}>
                  {loading
                    ? "处理中..."
                    : isFirstUser
                    ? "创建账号"
                    : "注册"}
                </ThemedText>
              </Pressable>
            </>
          ) : selectedUser ? (
            // 已选择用户，显示 PIN 码输入
            <>
              {/* 显示选中的用户信息 */}
              <View
                style={[
                  styles.selectedUserCard,
                  {
                    backgroundColor:
                      colorScheme === "dark"
                        ? "rgba(255, 255, 255, 0.1)"
                        : "rgba(0, 0, 0, 0.05)",
                  },
                ]}
              >
                <View style={styles.selectedUserAvatar}>
                  <ThemedText style={styles.selectedUserAvatarText}>
                    {selectedUser.name.charAt(0).toUpperCase()}
                  </ThemedText>
                </View>
                <View style={styles.selectedUserInfo}>
                  <ThemedText style={styles.selectedUserName}>
                    {selectedUser.name}
                  </ThemedText>
                  {selectedUser.isAdmin && (
                    <ThemedText style={styles.adminBadge}>管理员</ThemedText>
                  )}
                </View>
                <Pressable
                  style={styles.changeUserButton}
                  onPress={handleCancelSelect}
                >
                  <ThemedText style={styles.changeUserText}>更换</ThemedText>
                </Pressable>
              </View>

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
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />

              <ThemedText style={styles.hint}>
                忘记 PIN 码？请联系管理员
              </ThemedText>

              <Pressable
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleLogin}
                disabled={loading}
              >
                <ThemedText style={styles.buttonText}>
                  {loading ? "处理中..." : "登录"}
                </ThemedText>
              </Pressable>
            </>
          ) : (
            // 未选择用户，显示用户列表
            <>
              <ThemedText style={styles.label}>选择账号</ThemedText>
              <FlatList
                data={users}
                renderItem={renderUserItem}
                keyExtractor={(item) => item.id.toString()}
                style={styles.userList}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                  <ThemedText style={styles.emptyText}>
                    暂无用户，请先创建账号
                  </ThemedText>
                }
              />
            </>
          )}

          {/* 切换按钮 */}
          <Pressable style={styles.switchButton} onPress={toggleMode}>
            <ThemedText style={styles.switchButtonText}>
              {showCreateMode
                ? "已有账号？点击登录"
                : "没有账号？点击创建"}
            </ThemedText>
          </Pressable>
        </View>

        {/* 底部信息：作者和版本号 */}
        <View style={styles.footer}>
          <ThemedText style={styles.footerText}>作者：{APP_AUTHOR}</ThemedText>
          <ThemedText style={styles.footerText}>版本：{APP_VERSION}</ThemedText>
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "center",
  },
  header: {
    marginBottom: 32,
    alignItems: "center",
  },
  appTitle: {
    fontSize: 24,
    marginBottom: 8,
    textAlign: "center",
    color: "#007AFF",
  },
  title: {
    fontSize: 20,
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
    flex: 1,
    maxHeight: 500,
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
  switchButton: {
    marginTop: 24,
    paddingVertical: 12,
    alignItems: "center",
  },
  switchButtonText: {
    fontSize: 16,
    color: "#007AFF",
    fontWeight: "500",
  },
  footer: {
    marginTop: 24,
    alignItems: "center",
  },
  footerText: {
    fontSize: 12,
    opacity: 0.5,
    marginBottom: 4,
  },
  // 用户列表样式
  userList: {
    maxHeight: 240,
    marginBottom: 16,
  },
  userItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  userAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#007AFF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  userAvatarText: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "700",
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 18,
    fontWeight: "600",
  },
  adminBadge: {
    fontSize: 12,
    color: "#FF9500",
    marginTop: 4,
  },
  emptyText: {
    textAlign: "center",
    opacity: 0.6,
    marginTop: 24,
  },
  // 选中用户卡片样式
  selectedUserCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
  },
  selectedUserAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#007AFF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  selectedUserAvatarText: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "700",
  },
  selectedUserInfo: {
    flex: 1,
  },
  selectedUserName: {
    fontSize: 20,
    fontWeight: "600",
  },
  changeUserButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "rgba(0, 122, 255, 0.1)",
  },
  changeUserText: {
    color: "#007AFF",
    fontSize: 14,
    fontWeight: "600",
  },
});
