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
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { OperatorSyncService } from "@/lib/operator-sync";
import { APP_VERSION, APP_AUTHOR } from "@/lib/version";
import { trpc } from "@/lib/trpc";
import type { User } from "@/types/user";

// 操作员类型
interface Operator {
  id: number;
  name: string;
  isAdmin: number;
  isActive: number;
  createdAt: string;
  lastLoginAt: string | null;
}

/**
 * PIN 码登录页面（云端账户版本）
 */
export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const trpcClient = trpc.useUtils().client;

  const [pin, setPin] = useState("");
  const [name, setName] = useState("");
  const [isFirstUser, setIsFirstUser] = useState<boolean | null>(null); // null = 加载中
  const [isCreateMode, setIsCreateMode] = useState(false); // 是否是创建账号模式
  const [loading, setLoading] = useState(false);
  const [operators, setOperators] = useState<Operator[]>([]); // 操作员列表
  const [selectedOperator, setSelectedOperator] = useState<Operator | null>(null); // 选中的操作员
  const [isOffline, setIsOffline] = useState(false); // 是否离线模式
  const [offlineDaysRemaining, setOfflineDaysRemaining] = useState(0); // 离线有效期剩余天数

  // 跨平台的 alert 函数
  const showAlert = (title: string, message: string, onOk?: () => void) => {
    if (Platform.OS === "web") {
      window.alert(`${title}\n\n${message}`);
      if (onOk) onOk();
    } else {
      Alert.alert(title, message, [{ text: "确定", onPress: onOk }]);
    }
  };

  // 检查是否是首次使用，并加载操作员列表
  useEffect(() => {
    const checkAndLoad = async () => {
      try {
        // 获取操作员列表
        const { operators: ops, isOffline: offline } = await OperatorSyncService.getOperators(trpcClient);
        
        setIsOffline(offline);
        setOperators(ops);
        
        // 如果没有操作员，说明是首次使用
        const hasOperators = ops.length > 0;
        setIsFirstUser(!hasOperators);
        setIsCreateMode(!hasOperators);
        
        // 如果离线，获取剩余有效期
        if (offline) {
          const days = await OperatorSyncService.getOfflineValidityDaysRemaining();
          setOfflineDaysRemaining(days);
        }
      } catch (error) {
        console.error("Failed to load operators:", error);
        // 尝试使用缓存
        const cached = await OperatorSyncService.getCachedOperators();
        if (cached.length > 0) {
          setOperators(cached.map(op => ({
            id: op.id,
            name: op.name,
            isAdmin: op.isAdmin ? 1 : 0,
            isActive: 1,
            createdAt: op.cachedAt,
            lastLoginAt: null,
          })));
          setIsOffline(true);
          setIsFirstUser(false);
          const days = await OperatorSyncService.getOfflineValidityDaysRemaining();
          setOfflineDaysRemaining(days);
        } else {
          setIsFirstUser(true);
          setIsCreateMode(true);
        }
      }
    };
    
    checkAndLoad();
  }, []);

  // 处理登录
  const handleLogin = async () => {
    if (!selectedOperator) {
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
      // 使用云端登录（自动处理离线情况）
      const result = await OperatorSyncService.cloudLogin(trpcClient, selectedOperator.name, pin);
      
      if (!result.success) {
        showAlert("登录失败", result.error || "请重试");
        setLoading(false);
        return;
      }

      // 显示离线提示
      if (result.isOffline) {
        showAlert("离线登录", `您当前处于离线模式，剩余有效期 ${offlineDaysRemaining} 天`, () => {
          router.replace("/");
        });
      } else {
        // 跳转到首页
        router.replace("/");
      }
    } catch (error: any) {
      console.error("Login error:", error);
      showAlert("登录失败", error.message || "请重试");
    } finally {
      setLoading(false);
    }
  };

  // 处理创建管理员账户
  const handleCreateAdmin = async () => {
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
      // 创建管理员账户
      const result = await OperatorSyncService.initAdminAccount(trpcClient, name, pin);
      
      if (!result.success) {
        showAlert("创建失败", result.error || "请重试");
        setLoading(false);
        return;
      }

      // 登录
      const loginResult = await OperatorSyncService.cloudLogin(trpcClient, name, pin);
      
      if (loginResult.success) {
        showAlert("欢迎", `${name}，您已成功创建管理员账号！`, () => {
          router.replace("/");
        });
      } else {
        // 创建成功但登录失败，切换到登录界面
        showAlert("创建成功", "请使用 PIN 码登录", async () => {
          setIsCreateMode(false);
          setName("");
          setPin("");
          // 重新加载操作员列表
          const { operators: ops } = await OperatorSyncService.getOperators(trpcClient);
          setOperators(ops);
          setIsFirstUser(false);
        });
      }
    } catch (error: any) {
      console.error("Create admin error:", error);
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
    setSelectedOperator(null);
  };

  // 选择操作员
  const handleSelectOperator = (operator: Operator) => {
    setSelectedOperator(operator);
    setPin(""); // 清空 PIN 码
  };

  // 取消选择操作员
  const handleCancelSelect = () => {
    setSelectedOperator(null);
    setPin("");
  };

  // 加载中状态
  if (isFirstUser === null) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <ThemedText style={styles.loadingText}>正在连接服务器...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  // 显示创建账号界面
  const showCreateMode = isCreateMode;

  // 渲染操作员选择项
  const renderOperatorItem = ({ item }: { item: Operator }) => (
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
      onPress={() => handleSelectOperator(item)}
    >
      <View style={styles.userAvatar}>
        <ThemedText style={styles.userAvatarText}>
          {item.name.charAt(0).toUpperCase()}
        </ThemedText>
      </View>
      <View style={styles.userInfo}>
        <ThemedText style={styles.userName}>{item.name}</ThemedText>
        {item.isAdmin === 1 && (
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
        {/* 离线提示 */}
        {isOffline && (
          <View style={styles.offlineBanner}>
            <ThemedText style={styles.offlineBannerText}>
              📡 离线模式 · 剩余 {offlineDaysRemaining} 天
            </ThemedText>
          </View>
        )}

        <View style={styles.header}>
          <ThemedText type="title" style={styles.appTitle}>
            Ladybuty饰品库存管理系统
          </ThemedText>
          <ThemedText type="subtitle" style={styles.title}>
            {showCreateMode
              ? "创建管理员账号"
              : selectedOperator
              ? `${selectedOperator.name} 登录`
              : "操作员登录"}
          </ThemedText>
          <ThemedText style={styles.subtitle}>
            {showCreateMode
              ? "首次使用，请创建管理员账号"
              : selectedOperator
              ? "请输入您的 PIN 码"
              : "请选择您的账号"}
          </ThemedText>
        </View>

        <View style={styles.form}>
          {showCreateMode ? (
            // 创建管理员账号模式
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
                onSubmitEditing={handleCreateAdmin}
              />

              <ThemedText style={styles.hint}>
                请设置一个 4-6 位数字 PIN 码，用于登录
              </ThemedText>

              <Pressable
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleCreateAdmin}
                disabled={loading}
              >
                <ThemedText style={styles.buttonText}>
                  {loading ? "处理中..." : "创建账号"}
                </ThemedText>
              </Pressable>

              {isOffline && (
                <ThemedText style={styles.offlineHint}>
                  ⚠️ 首次使用需要联网创建账户
                </ThemedText>
              )}
            </>
          ) : selectedOperator ? (
            // 已选择操作员，显示 PIN 码输入
            <>
              {/* 显示选中的操作员信息 */}
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
                    {selectedOperator.name.charAt(0).toUpperCase()}
                  </ThemedText>
                </View>
                <View style={styles.selectedUserInfo}>
                  <ThemedText style={styles.selectedUserName}>
                    {selectedOperator.name}
                  </ThemedText>
                  {selectedOperator.isAdmin === 1 && (
                    <ThemedText style={styles.adminBadge}>管理员</ThemedText>
                  )}
                </View>
                <Pressable
                  style={styles.changeUserButton}
                  onPress={handleCancelSelect}
                >
                  <ThemedText style={styles.changeUserButtonText}>
                    更换
                  </ThemedText>
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
                placeholder="请输入 PIN 码"
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

              <Pressable
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleLogin}
                disabled={loading}
              >
                <ThemedText style={styles.buttonText}>
                  {loading ? "登录中..." : "登录"}
                </ThemedText>
              </Pressable>
            </>
          ) : (
            // 显示操作员列表
            <>
              <FlatList
                data={operators}
                renderItem={renderOperatorItem}
                keyExtractor={(item) => item.id.toString()}
                style={styles.userList}
                contentContainerStyle={styles.userListContent}
                ListEmptyComponent={
                  <View style={styles.emptyList}>
                    <ThemedText style={styles.emptyListText}>
                      暂无操作员账号
                    </ThemedText>
                  </View>
                }
              />

              {/* 如果没有操作员，显示创建按钮 */}
              {operators.length === 0 && (
                <Pressable
                  style={styles.button}
                  onPress={() => setIsCreateMode(true)}
                >
                  <ThemedText style={styles.buttonText}>
                    创建管理员账号
                  </ThemedText>
                </Pressable>
              )}
            </>
          )}
        </View>

        {/* 底部信息 */}
        <View style={styles.footer}>
          <ThemedText style={styles.footerText}>
            {APP_VERSION} · {APP_AUTHOR}
          </ThemedText>
          {isOffline && (
            <ThemedText style={styles.footerOfflineText}>
              离线模式
            </ThemedText>
          )}
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
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    opacity: 0.7,
  },
  offlineBanner: {
    backgroundColor: "#FF9500",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 16,
    alignItems: "center",
  },
  offlineBannerText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  header: {
    marginBottom: 32,
  },
  appTitle: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 16,
    textAlign: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    opacity: 0.7,
    textAlign: "center",
  },
  form: {
    flex: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
  },
  input: {
    height: 48,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    marginBottom: 16,
  },
  pinInput: {
    letterSpacing: 8,
    textAlign: "center",
    fontSize: 24,
  },
  hint: {
    fontSize: 12,
    opacity: 0.6,
    marginBottom: 24,
    textAlign: "center",
  },
  offlineHint: {
    fontSize: 14,
    color: "#FF9500",
    marginTop: 16,
    textAlign: "center",
  },
  button: {
    height: 48,
    backgroundColor: "#007AFF",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  userList: {
    flex: 1,
    marginBottom: 16,
  },
  userListContent: {
    paddingBottom: 16,
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
    fontWeight: "bold",
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
    fontWeight: "bold",
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
    backgroundColor: "rgba(0, 122, 255, 0.1)",
    borderRadius: 8,
  },
  changeUserButtonText: {
    color: "#007AFF",
    fontSize: 14,
    fontWeight: "600",
  },
  emptyList: {
    padding: 32,
    alignItems: "center",
  },
  emptyListText: {
    fontSize: 16,
    opacity: 0.6,
  },
  footer: {
    paddingVertical: 16,
    alignItems: "center",
  },
  footerText: {
    fontSize: 12,
    opacity: 0.5,
  },
  footerOfflineText: {
    fontSize: 12,
    color: "#FF9500",
    marginTop: 4,
  },
});
