import { useRouter, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
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
import { SyncService } from "@/lib/sync";
import { trpc } from "@/lib/trpc";
import { APP_VERSION, APP_BUILD, APP_AUTHOR } from "@/lib/version";
import type { Product } from "@/types/product";

export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // 弹窗状态
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showDataModal, setShowDataModal] = useState(false);

  // 使用 tRPC 同步
  const downloadQuery = trpc.sync.download.useQuery(undefined, {
    enabled: false, // 手动触发
  });
  const uploadMutation = trpc.sync.upload.useMutation();
  
  // 上传状态
  const [uploading, setUploading] = useState(false);

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
    setShowSettingsModal(false);
    router.replace("/login");
  };

  // 统计数据
  const todayCount = products.filter((p) => {
    const today = new Date().toDateString();
    const productDate = new Date(p.createdAt).toDateString();
    return today === productDate;
  }).length;

  const totalQuantity = products.reduce((sum, p) => sum + p.quantity, 0);
  const totalSKU = products.length;

  // 获取最近入库记录（按时间倒序，取前10条）
  const recentProducts = [...products]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10);

  // 背景色
  const modalBg = colorScheme === "dark" ? "#1c1c1e" : "#fff";
  const overlayBg = "rgba(0, 0, 0, 0.5)";

  return (
    <ThemedView style={styles.container}>
      {/* 顶部区域 */}
      <View
        style={[
          styles.header,
          {
            paddingTop: Math.max(insets.top, 16),
            paddingHorizontal: 16,
          },
        ]}
      >
        {/* 顶部标题和设置按钮 */}
        <View style={styles.titleRow}>
          <ThemedText type="title" style={styles.title}>
            WareFlow
          </ThemedText>
          <Pressable 
            onPress={() => setShowSettingsModal(true)} 
            style={styles.settingsButton}
          >
            <ThemedText style={styles.settingsButtonText}>设置</ThemedText>
          </Pressable>
        </View>

        {/* 仓库状态区 - 三个卡片 */}
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

          <View style={styles.statCard}>
            <ThemedText type="subtitle" style={styles.statNumber}>
              {totalSKU}
            </ThemedText>
            <ThemedText style={styles.statLabel}>总SKU数</ThemedText>
          </View>
        </View>

        {/* 数据安全按钮 */}
        <Pressable
          style={({ pressed }) => [
            styles.dataSecurityButton,
            { opacity: pressed ? 0.8 : 1 },
          ]}
          onPress={() => setShowDataModal(true)}
        >
          <View style={styles.dataSecurityContent}>
            <ThemedText style={styles.dataSecurityIcon}>🔐</ThemedText>
            <View style={styles.dataSecurityTextContainer}>
              <ThemedText style={styles.dataSecurityTitle}>数据安全</ThemedText>
              <ThemedText style={styles.dataSecurityHint}>导出、备份、云同步、回收站</ThemedText>
            </View>
            <ThemedText style={styles.dataSecurityArrow}>›</ThemedText>
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
        ) : recentProducts.length === 0 ? (
          <View style={styles.emptyContainer}>
            <ThemedText style={styles.emptyText}>暂无入库记录</ThemedText>
            <ThemedText style={styles.emptyHint}>
              点击底部「入库」开始添加产品
            </ThemedText>
          </View>
        ) : (
          <FlatList
            data={recentProducts}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [
                  styles.productCard,
                  item.quantity === 0 && styles.productCardEmpty,
                  { opacity: pressed ? 0.7 : 1 },
                ]}
                onPress={() => router.push({ pathname: "/product-detail" as any, params: { id: item.id } })}
              >
                {item.quantity === 0 && (
                  <View style={styles.emptyBadge}>
                    <ThemedText style={styles.emptyBadgeText}>库存为0</ThemedText>
                  </View>
                )}
                <Image
                  source={{ uri: item.detailImageUri }}
                  style={[
                    styles.productImage,
                    item.quantity === 0 && styles.productImageEmpty
                  ]}
                />
                <View style={styles.productInfo}>
                  <ThemedText type="defaultSemiBold" style={[
                    styles.productSku,
                    item.quantity === 0 && styles.productSkuEmpty
                  ]}>
                    {item.sku}
                  </ThemedText>
                  <ThemedText style={[
                    styles.productDetail,
                    item.quantity === 0 && styles.productDetailEmpty
                  ]}>
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

      {/* 设置底部弹窗 */}
      <Modal
        visible={showSettingsModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSettingsModal(false)}
      >
        <Pressable 
          style={[styles.modalOverlay, { backgroundColor: overlayBg }]}
          onPress={() => setShowSettingsModal(false)}
        >
          <View style={[styles.bottomSheet, { backgroundColor: modalBg }]}>
            <View style={styles.bottomSheetHandle} />
            <ThemedText style={styles.bottomSheetTitle}>设置</ThemedText>
            
            {/* 当前用户信息 */}
            {currentUser && (
              <View style={styles.userInfoSection}>
                <ThemedText style={styles.userInfoLabel}>当前用户</ThemedText>
                <ThemedText style={styles.userInfoName}>{currentUser.name}</ThemedText>
              </View>
            )}

            {/* 设置选项 */}
            {currentUser?.isAdmin && (
              <Pressable 
                style={styles.bottomSheetItem}
                onPress={() => {
                  setShowSettingsModal(false);
                  router.push("/user-management" as any);
                }}
              >
                <ThemedText style={styles.bottomSheetItemIcon}>👥</ThemedText>
                <ThemedText style={styles.bottomSheetItemText}>多用户管理</ThemedText>
                <ThemedText style={styles.bottomSheetItemArrow}>›</ThemedText>
              </Pressable>
            )}

            <Pressable 
              style={styles.bottomSheetItem}
              onPress={() => {
                setShowSettingsModal(false);
                router.push("/feedback" as any);
              }}
            >
              <ThemedText style={styles.bottomSheetItemIcon}>💬</ThemedText>
              <ThemedText style={styles.bottomSheetItemText}>反馈与建议</ThemedText>
              <ThemedText style={styles.bottomSheetItemArrow}>›</ThemedText>
            </Pressable>

            <Pressable 
              style={[styles.bottomSheetItem, styles.logoutItem]}
              onPress={handleLogout}
            >
              <ThemedText style={styles.bottomSheetItemIcon}>🚪</ThemedText>
              <ThemedText style={[styles.bottomSheetItemText, styles.logoutText]}>登出</ThemedText>
            </Pressable>

            {/* 版本信息 */}
            <View style={styles.versionSection}>
              <ThemedText style={styles.versionText}>作者：{APP_AUTHOR}</ThemedText>
              <ThemedText style={styles.versionText}>版本：v{APP_VERSION}</ThemedText>
              <ThemedText style={styles.versionText}>Build: {APP_BUILD}</ThemedText>
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* 数据安全底部弹窗 */}
      <Modal
        visible={showDataModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDataModal(false)}
      >
        <Pressable 
          style={[styles.modalOverlay, { backgroundColor: overlayBg }]}
          onPress={() => setShowDataModal(false)}
        >
          <Pressable style={[styles.bottomSheet, { backgroundColor: modalBg }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.bottomSheetHandle} />
            <ThemedText style={styles.bottomSheetTitle}>数据安全</ThemedText>

            <Pressable 
              style={styles.bottomSheetItem}
              onPress={() => {
                setShowDataModal(false);
                router.push("/(tabs)/inventory" as any);
              }}
            >
              <ThemedText style={styles.bottomSheetItemIcon}>📊</ThemedText>
              <ThemedText style={styles.bottomSheetItemText}>导出 Excel</ThemedText>
              <ThemedText style={styles.bottomSheetItemArrow}>›</ThemedText>
            </Pressable>

            <Pressable 
              style={[styles.bottomSheetItem, uploading && styles.bottomSheetItemDisabled]}
              disabled={uploading}
              onPress={async () => {
                console.log("[Upload] Button clicked");
                setShowDataModal(false);
                setUploading(true);
                try {
                  console.log("[Upload] Starting upload...");
                  // 使用 SyncService 上传数据
                  const trpcClient = {
                    sync: {
                      upload: {
                        mutate: async (data: any) => {
                          console.log("[Upload] Calling uploadMutation.mutateAsync");
                          return uploadMutation.mutateAsync(data);
                        },
                      },
                    },
                  };
                  const result = await SyncService.uploadToCloud(trpcClient);
                  console.log("[Upload] Result:", result);
                  if (result.success) {
                    const msg = `已上传 ${result.count} 个产品到云端`;
                    console.log("[Upload] Success:", msg);
                    if (Platform.OS === 'web') {
                      window.alert(`上传成功\n${msg}`);
                    } else {
                      Alert.alert("上传成功", msg);
                    }
                  } else {
                    const errMsg = result.error || "未知错误";
                    console.log("[Upload] Failed:", errMsg);
                    if (Platform.OS === 'web') {
                      window.alert(`上传失败\n${errMsg}`);
                    } else {
                      Alert.alert("上传失败", errMsg);
                    }
                  }
                } catch (error: any) {
                  console.error("[Upload] Error:", error);
                  const errMsg = error.message || "网络错误";
                  if (Platform.OS === 'web') {
                    window.alert(`上传失败\n${errMsg}`);
                  } else {
                    Alert.alert("上传失败", errMsg);
                  }
                } finally {
                  setUploading(false);
                }
              }}
            >
              <ThemedText style={styles.bottomSheetItemIcon}>{uploading ? "⏳" : "⬆️"}</ThemedText>
              <ThemedText style={styles.bottomSheetItemText}>{uploading ? "上传中..." : "上传到云端"}</ThemedText>
              <ThemedText style={styles.bottomSheetItemArrow}>›</ThemedText>
            </Pressable>

            <Pressable 
              style={[styles.bottomSheetItem, refreshing && styles.bottomSheetItemDisabled]}
              disabled={refreshing}
              onPress={async () => {
                console.log("[Download] Button clicked");
                setShowDataModal(false);
                setRefreshing(true);
                try {
                  console.log("[Download] Starting download...");
                  // 使用 SyncService 下载数据
                  const trpcClient = {
                    sync: {
                      download: {
                        query: async () => {
                          console.log("[Download] Calling downloadQuery.refetch");
                          return (await downloadQuery.refetch()).data;
                        },
                      },
                    },
                  };
                  const result = await SyncService.downloadFromCloud(trpcClient);
                  console.log("[Download] Result:", result);
                  if (result.success) {
                    await loadProducts();
                    const msg = `已下载 ${result.count} 个产品到本地`;
                    console.log("[Download] Success:", msg);
                    if (Platform.OS === 'web') {
                      window.alert(`下载成功\n${msg}`);
                    } else {
                      Alert.alert("下载成功", msg);
                    }
                  } else {
                    const errMsg = result.error || "未知错误";
                    console.log("[Download] Failed:", errMsg);
                    if (Platform.OS === 'web') {
                      window.alert(`下载失败\n${errMsg}`);
                    } else {
                      Alert.alert("下载失败", errMsg);
                    }
                  }
                } catch (error: any) {
                  console.error("[Download] Error:", error);
                  const errMsg = error.message || "网络错误";
                  if (Platform.OS === 'web') {
                    window.alert(`下载失败\n${errMsg}`);
                  } else {
                    Alert.alert("下载失败", errMsg);
                  }
                } finally {
                  setRefreshing(false);
                }
              }}
            >
              <ThemedText style={styles.bottomSheetItemIcon}>{refreshing ? "⏳" : "⬇️"}</ThemedText>
              <ThemedText style={styles.bottomSheetItemText}>{refreshing ? "下载中..." : "从云端下载"}</ThemedText>
              <ThemedText style={styles.bottomSheetItemArrow}>›</ThemedText>
            </Pressable>

            <Pressable 
              style={styles.bottomSheetItem}
              onPress={() => {
                setShowDataModal(false);
                router.push("/recycle-bin" as any);
              }}
            >
              <ThemedText style={styles.bottomSheetItemIcon}>🗑️</ThemedText>
              <ThemedText style={styles.bottomSheetItemText}>回收站</ThemedText>
              <ThemedText style={styles.bottomSheetItemArrow}>›</ThemedText>
            </Pressable>

            <Pressable 
              style={styles.bottomSheetItem}
              onPress={() => {
                setShowDataModal(false);
                router.push("/backup" as any);
              }}
            >
              <ThemedText style={styles.bottomSheetItemIcon}>📦</ThemedText>
              <ThemedText style={styles.bottomSheetItemText}>数据备份</ThemedText>
              <ThemedText style={styles.bottomSheetItemArrow}>›</ThemedText>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
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
    paddingBottom: 16,
  },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
  },
  settingsButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "rgba(0, 0, 0, 0.05)",
    justifyContent: "center",
    alignItems: "center",
  },
  settingsButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  statsContainer: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: "rgba(0, 122, 255, 0.1)",
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
  },
  statNumber: {
    fontSize: 24,
    lineHeight: 32,
    color: "#007AFF",
    fontWeight: "700",
  },
  statLabel: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 4,
    opacity: 0.7,
  },
  dataSecurityButton: {
    backgroundColor: "rgba(52, 199, 89, 0.1)",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(52, 199, 89, 0.2)",
  },
  dataSecurityContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  dataSecurityIcon: {
    fontSize: 28,
    marginRight: 12,
  },
  dataSecurityTextContainer: {
    flex: 1,
  },
  dataSecurityTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#34C759",
  },
  dataSecurityHint: {
    fontSize: 12,
    opacity: 0.7,
    marginTop: 2,
  },
  dataSecurityArrow: {
    fontSize: 24,
    opacity: 0.5,
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
  productCardEmpty: {
    backgroundColor: "rgba(142, 142, 147, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(142, 142, 147, 0.3)",
  },
  emptyBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "#FF3B30",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    zIndex: 1,
  },
  emptyBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
  productImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: "#f0f0f0",
  },
  productImageEmpty: {
    opacity: 0.5,
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
  productSkuEmpty: {
    opacity: 0.6,
  },
  productDetail: {
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.7,
    marginBottom: 4,
  },
  productDetailEmpty: {
    color: "#FF3B30",
    opacity: 1,
    fontWeight: "600",
  },
  productTime: {
    fontSize: 12,
    lineHeight: 16,
    opacity: 0.5,
  },
  // 底部弹窗样式
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  bottomSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 40,
    maxHeight: "80%",
  },
  bottomSheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: "rgba(0, 0, 0, 0.2)",
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 16,
  },
  bottomSheetTitle: {
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 20,
  },
  userInfoSection: {
    backgroundColor: "rgba(0, 122, 255, 0.1)",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    alignItems: "center",
  },
  userInfoLabel: {
    fontSize: 12,
    opacity: 0.6,
    marginBottom: 4,
  },
  userInfoName: {
    fontSize: 18,
    fontWeight: "600",
    color: "#007AFF",
  },
  bottomSheetItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0, 0, 0, 0.1)",
  },
  bottomSheetItemIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  bottomSheetItemText: {
    flex: 1,
    fontSize: 16,
  },
  bottomSheetItemArrow: {
    fontSize: 20,
    opacity: 0.4,
  },
  bottomSheetItemDisabled: {
    opacity: 0.5,
  },
  logoutItem: {
    borderBottomWidth: 0,
    marginTop: 8,
  },
  logoutText: {
    color: "#FF3B30",
  },
  versionSection: {
    marginTop: 24,
    alignItems: "center",
  },
  versionText: {
    fontSize: 12,
    opacity: 0.5,
    marginTop: 4,
  },
});
