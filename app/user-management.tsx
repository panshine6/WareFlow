import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
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
import type { User } from "@/types/user";

/**
 * 用户管理页面（仅管理员可访问）
 */
export default function UserManagementScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();

  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPin, setNewPin] = useState("");

  // 加载用户列表
  const loadUsers = async () => {
    try {
      const [allUsers, current] = await Promise.all([
        UserStorage.getAll(),
        UserStorage.getCurrentUser(),
      ]);
      setUsers(allUsers);
      setCurrentUser(current);

      // 检查是否是管理员
      if (!current?.isAdmin) {
        Alert.alert("权限不足", "只有管理员可以管理用户", [
          { text: "返回", onPress: () => router.back() },
        ]);
      }
    } catch (error) {
      console.error("Failed to load users:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  // 添加新用户
  const handleAddUser = async () => {
    if (!newName.trim()) {
      Alert.alert("提示", "请输入姓名");
      return;
    }

    if (!newPin.trim()) {
      Alert.alert("提示", "请输入 PIN 码");
      return;
    }

    if (newPin.length < 4 || newPin.length > 6) {
      Alert.alert("提示", "PIN 码必须是 4-6 位数字");
      return;
    }

    if (!/^\d+$/.test(newPin)) {
      Alert.alert("提示", "PIN 码只能包含数字");
      return;
    }

    try {
      await UserStorage.create(newName, newPin);
      Alert.alert("成功", `已添加操作员：${newName}`);
      setNewName("");
      setNewPin("");
      setShowAddForm(false);
      loadUsers();
    } catch (error: any) {
      Alert.alert("添加失败", error.message || "请重试");
    }
  };

  // 删除用户
  const handleDeleteUser = (user: User) => {
    if (user.isAdmin) {
      Alert.alert("提示", "无法删除管理员账号");
      return;
    }

    if (user.id === currentUser?.id) {
      Alert.alert("提示", "无法删除当前登录的账号");
      return;
    }

    Alert.alert("确认删除", `确定要删除操作员 ${user.name} 吗？`, [
      { text: "取消", style: "cancel" },
      {
        text: "删除",
        style: "destructive",
        onPress: async () => {
          try {
            await UserStorage.delete(user.id);
            Alert.alert("成功", "已删除操作员");
            loadUsers();
          } catch (error) {
            Alert.alert("删除失败", "请重试");
          }
        },
      },
    ]);
  };

  const renderUser = ({ item }: { item: User }) => (
    <View style={styles.userCard}>
      <View style={styles.userInfo}>
        <ThemedText style={styles.userName}>
          {item.name}
          {item.isAdmin && (
            <ThemedText style={styles.adminBadge}> (管理员)</ThemedText>
          )}
          {item.id === currentUser?.id && (
            <ThemedText style={styles.currentBadge}> (当前)</ThemedText>
          )}
        </ThemedText>
        <ThemedText style={styles.userId}>ID: {item.id}</ThemedText>
        <ThemedText style={styles.userPin}>PIN: {item.pin}</ThemedText>
      </View>
      {!item.isAdmin && item.id !== currentUser?.id && (
        <Pressable
          style={styles.deleteButton}
          onPress={() => handleDeleteUser(item)}
        >
          <ThemedText style={styles.deleteButtonText}>删除</ThemedText>
        </Pressable>
      )}
    </View>
  );

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>加载中...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View
        style={[
          styles.header,
          {
            paddingTop: Math.max(insets.top, 20),
          },
        ]}
      >
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <ThemedText style={styles.backButtonText}>← 返回</ThemedText>
        </Pressable>
        <ThemedText type="title" style={styles.title}>
          用户管理
        </ThemedText>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <FlatList
          data={users}
          renderItem={renderUser}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <ThemedText style={styles.listTitle}>
                操作员列表 ({users.length})
              </ThemedText>
            </View>
          }
          ListFooterComponent={
            <View style={styles.footerContainer}>
              {showAddForm ? (
                <View style={styles.addForm}>
                  <ThemedText style={styles.formTitle}>添加新操作员</ThemedText>

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
                    value={newName}
                    onChangeText={setNewName}
                    placeholder="姓名"
                    placeholderTextColor={
                      colorScheme === "dark"
                        ? "rgba(255, 255, 255, 0.4)"
                        : "rgba(0, 0, 0, 0.4)"
                    }
                  />

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
                    value={newPin}
                    onChangeText={setNewPin}
                    placeholder="PIN 码 (4-6 位数字)"
                    placeholderTextColor={
                      colorScheme === "dark"
                        ? "rgba(255, 255, 255, 0.4)"
                        : "rgba(0, 0, 0, 0.4)"
                    }
                    keyboardType="number-pad"
                    maxLength={6}
                    secureTextEntry
                  />

                  <View style={styles.formButtons}>
                    <Pressable
                      style={[styles.button, styles.cancelButton]}
                      onPress={() => {
                        setShowAddForm(false);
                        setNewName("");
                        setNewPin("");
                      }}
                    >
                      <ThemedText style={styles.cancelButtonText}>取消</ThemedText>
                    </Pressable>
                    <Pressable
                      style={[styles.button, styles.confirmButton]}
                      onPress={handleAddUser}
                    >
                      <ThemedText style={styles.confirmButtonText}>添加</ThemedText>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable
                  style={styles.addButton}
                  onPress={() => setShowAddForm(true)}
                >
                  <ThemedText style={styles.addButtonText}>+ 添加操作员</ThemedText>
                </Pressable>
              )}
            </View>
          }
        />
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0, 0, 0, 0.1)",
  },
  backButton: {
    marginBottom: 12,
  },
  backButtonText: {
    fontSize: 16,
    color: "#007AFF",
  },
  title: {
    fontSize: 28,
  },
  keyboardView: {
    flex: 1,
  },
  list: {
    paddingVertical: 20,
    paddingHorizontal: 20,
  },
  footerContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  listHeader: {
    marginBottom: 16,
  },
  listTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  userCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    backgroundColor: "rgba(0, 0, 0, 0.05)",
    borderRadius: 12,
    marginBottom: 12,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 4,
  },
  adminBadge: {
    color: "#FF9500",
    fontSize: 14,
  },
  currentBadge: {
    color: "#007AFF",
    fontSize: 14,
  },
  userId: {
    fontSize: 14,
    opacity: 0.6,
    marginBottom: 2,
  },
  userPin: {
    fontSize: 14,
    opacity: 0.6,
  },
  deleteButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#FF3B30",
    borderRadius: 8,
  },
  deleteButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  addForm: {
    padding: 20,
    backgroundColor: "rgba(0, 0, 0, 0.05)",
    borderRadius: 12,
    marginBottom: 20,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 16,
  },
  input: {
    height: 48,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  formButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  button: {
    flex: 1,
    height: 48,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: "rgba(0, 0, 0, 0.1)",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  confirmButton: {
    backgroundColor: "#007AFF",
  },
  confirmButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  addButton: {
    height: 56,
    backgroundColor: "#007AFF",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  addButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
});
