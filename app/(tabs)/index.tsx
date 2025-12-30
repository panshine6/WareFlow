import { useRouter, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { WelcomeScreen } from "@/components/welcome-screen";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { UserStorage } from "@/lib/user-storage";
import { ProductAPI } from "@/lib/api-client";
import { ProductStorage } from "@/lib/storage";
import { AutoSync } from "@/lib/auto-sync";
import { trpc } from "@/lib/trpc";
import { APP_VERSION, APP_BUILD } from "@/lib/version";
import type { Product } from "@/types/product";

export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // 使用 tRPC 同步
  const downloadQuery = trpc.sync.download.useQuery(undefined, {
    enabled: false, // 手动触发
  });

  // 加载产品列表（Web 使用 AsyncStorage，原生使用 SQLite）
  const loadProducts = async () => {
    try {
      const isWeb = Platform.OS === 'web';
      const data = isWeb 
        ? await ProductStorage.getActive()
        : await ProductAPI.getActive();
      setProducts(data);
    } catch (error) {
      console.error("Failed to load products:", error);
    } finally {
      setLoading(false);
    }
  };

  // 下拉刷新（从云端同步）
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await AutoSync.downloadFromCloud(
        downloadQuery,
        async () => {
          await loadProducts();
        },
        (error) => {
          console.log("同步失败", error);
        }
      );
    } catch (error) {
      console.log("同步失败", error);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadCurrentUser();
  }, []);

  // 页面获得焦点时重新加载数据
  useFocusEffect(
    useCallback(() => {
      loadProducts();
      autoSyncOnEnter();
    }, [])
  );

  // 进入页面时自动同步
  const autoSyncOnEnter = async () => {
    try {
      await AutoSync.downloadFromCloud(
        downloadQuery,
        async () => {
          await loadProducts();
        },
        (error) => {
          console.log("自动同步失败（静默）", error);
        }
      );
    } catch (error) {
      console.log("自动同步失败", error);
    }
  };

  // 加载当前用户
  const loadCurrentUser = async () => {
    const user = await UserStorage.getCurrentUser();
    setCurrentUser(user);
  };

  // 登出
  const handleLogout = async () => {
    await UserStorage.logout();
    router.replace("/login");
  };

  // 统计数据
  const todayCount = products.filter((p) => {
    const today = new Date().toDateString();
    const productDate = new Date(p.createdAt).toDateString();
    return today === productDate;
  }).length;

  const totalQuantity = products.reduce((sum, p) => sum + p.quantity, 0);

  // 跳过登录检查 - 直接显示主界面
  // 注释：如果将来需要登录功能，取消下面的注释
  /*
  // 如果正在加载认证状态，显示加载指示器
  if (authLoading) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
      </ThemedView>
    );
  }

  // 如果未登录，显示欢迎页面
  if (!isAuthenticated) {
    return <WelcomeScreen />;
  }
  */

  return (
    <ThemedView style={styles.container}>
      {/* 顶部统计卡片 */}
      <View
        style={[
          styles.header,
          {
            paddingTop: Math.max(insets.top, 16),
            paddingHorizontal: 16,
          },
        ]}
      >
         {/* 顶部标题和用户名 */}
      <View style={styles.titleRow}>
        <ThemedText type="title" style={styles.title}>
          Ladybuty饰品库存管理系统
        </ThemedText>
        {currentUser && (
          <View style={styles.userContainer}>
            <ThemedText style={styles.userName}>
              {currentUser.name}
            </ThemedText>
            {currentUser.isAdmin && (
              <Pressable onPress={() => router.push("/user-management" as any)} style={styles.manageButton}>
                <ThemedText style={styles.manageButtonText}>管理</ThemedText>
              </Pressable>
            )}
            <Pressable onPress={handleLogout} style={styles.logoutButton}>
              <ThemedText style={styles.logoutButtonText}>登出</ThemedText>
            </Pressable>
          </View>
        )}
      </View>

        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <ThemedText type="subtitle" style={styles.statNumber}>
              {todayCount}
            </ThemedText>
            <ThemedText style={styles.statLabel}>今日入库</ThemedText>
          </View>

          <View style={styles.statCard}>
            <ThemedText type="subtitle" style={styles.statNumber}>
              {totalQuantity}
            </ThemedText>
            <ThemedText style={styles.statLabel}>总库存</ThemedText>
          </View>
        </View>

        {/* 添加产品按钮 */}
        <Pressable
          style={({ pressed }) => [
            styles.addButton,
            {
              backgroundColor: Colors[colorScheme ?? "light"].tint,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
          onPress={() => router.push("/add-product-quick" as any)}
        >
          <View style={styles.addButtonContent}>
            <View style={styles.addButtonTextContainer}>
              <ThemedText style={styles.addButtonText}>添加产品</ThemedText>
              <ThemedText style={styles.addButtonHint}>点击开始录入</ThemedText>
            </View>
          </View>
        </Pressable>
      </View>

      {/* 最近入库记录列表 */}
      <View style={styles.listContainer}>
        <ThemedText type="subtitle" style={styles.listTitle}>
          最近入库记录
        </ThemedText>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" />
          </View>
        ) : products.length === 0 ? (
          <View style={styles.emptyContainer}>
            <ThemedText style={styles.emptyText}>暂无入库记录</ThemedText>
            <ThemedText style={styles.emptyHint}>
              点击上方按钮开始添加产品
            </ThemedText>
          </View>
        ) : (
          <FlatList
            data={products}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [
                  styles.productCard,
                  { opacity: pressed ? 0.7 : 1 },
                ]}
                onPress={() => router.push({ pathname: "/product-detail" as any, params: { id: item.id } })}
              >
                <Image
                  source={{ uri: item.detailImageUri }}
                  style={styles.productImage}
                />
                <View style={styles.productInfo}>
                  <ThemedText type="defaultSemiBold" style={styles.productSku}>
                    {item.sku}
                  </ThemedText>
                  <ThemedText style={styles.productDetail}>
                    数量：{item.quantity} | 位置：{item.storageLocation}
                  </ThemedText>
                  <ThemedText style={styles.productTime}>
                    {new Date(item.createdAt).toLocaleString("zh-CN")}
                  </ThemedText>
                </View>
              </Pressable>
            )}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            contentContainerStyle={styles.listContent}
          />
        )}
      </View>

      {/* 底部按钮区 */}
      <View style={styles.bottomActions}>
        <Pressable 
          style={styles.actionButton}
          onPress={() => router.push("/recycle-bin" as any)}
        >
          <ThemedText style={styles.actionButtonText}>🗑️ 回收站</ThemedText>
        </Pressable>
        <Pressable 
          style={styles.actionButton}
          onPress={() => router.push("/backup" as any)}
        >
          <ThemedText style={styles.actionButtonText}>📦 数据备份</ThemedText>
        </Pressable>
        <Pressable 
          style={styles.actionButton}
          onPress={() => router.push("/feedback" as any)}
        >
          <ThemedText style={styles.actionButtonText}>💬 反馈与建议</ThemedText>
        </Pressable>
      </View>

      {/* 版权标识 */}
      <View style={styles.copyrightContainer}>
        <ThemedText style={styles.copyrightText}>作者：潘章杰（By Manus）</ThemedText>
        <ThemedText style={styles.versionText}>版本：v{APP_VERSION}</ThemedText>
        <ThemedText style={styles.versionText}>Build: {APP_BUILD}</ThemedText>
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
  header: {
    paddingBottom: 24,
  },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    flex: 1,
  },
  userContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  userName: {
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.8,
    fontWeight: "500",
  },
  manageButton: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: "rgba(0, 122, 255, 0.1)",
  },
  manageButtonText: {
    color: "#007AFF",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
  },
  logoutButton: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: "rgba(255, 59, 48, 0.1)",
  },
  logoutButtonText: {
    color: "#FF3B30",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
  },
  statsContainer: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: "rgba(0, 122, 255, 0.1)",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  statNumber: {
    fontSize: 32,
    lineHeight: 40,
    color: "#007AFF",
  },
  statLabel: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
    opacity: 0.7,
  },
  addButton: {
    height: 72,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  addButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  addButtonTextContainer: {
    alignItems: "center",
  },
  addButtonText: {
    color: "#fff",
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "700",
  },
  addButtonHint: {
    color: "rgba(255, 255, 255, 0.8)",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  listContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  listTitle: {
    marginBottom: 12,
  },
  listContent: {
    paddingBottom: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    lineHeight: 24,
    opacity: 0.5,
  },
  emptyHint: {
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.4,
    marginTop: 8,
  },
  productCard: {
    flexDirection: "row",
    backgroundColor: "rgba(0, 0, 0, 0.05)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  productImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: "#f0f0f0",
  },
  productInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: "center",
  },
  productSku: {
    fontSize: 16,
    lineHeight: 22,
    marginBottom: 4,
  },
  productDetail: {
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.7,
    marginBottom: 4,
  },
  productTime: {
    fontSize: 12,
    lineHeight: 16,
    opacity: 0.5,
  },
  bottomActions: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "rgba(0, 0, 0, 0.05)",
    borderRadius: 12,
    alignItems: "center",
  },
  actionButtonText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
    opacity: 0.7,
  },
  copyrightContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    alignItems: "center",
  },
  copyrightText: {
    fontSize: 12,
    lineHeight: 18,
    opacity: 0.5,
  },
  versionText: {
    fontSize: 11,
    lineHeight: 16,
    opacity: 0.4,
    marginTop: 2,
  },
});
