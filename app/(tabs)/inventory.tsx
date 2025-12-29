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
  TextInput,
  View,
} from "react-native";
import { Alert } from "@/lib/alert";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { exportToDianxiaomiFormat } from "@/lib/excel-export";
import { ProductAPI } from "@/lib/api-client";
import { trpc } from "@/lib/trpc";
import { AutoSync } from "@/lib/auto-sync";
import { ProductStorage } from "@/lib/storage";
import type { Product } from "@/types/product";

/**
 * 库存列表页面
 */
export default function InventoryScreen() {
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [exporting, setExporting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // 使用 tRPC mutations 和 queries
  const uploadMutation = trpc.sync.upload.useMutation();
  const downloadQuery = trpc.sync.download.useQuery(undefined, {
    enabled: false, // 手动触发
  });

  // 加载产品列表（Web 使用 AsyncStorage，原生使用 SQLite）
  const loadProducts = async () => {
    try {
      const isWeb = Platform.OS === 'web';
      
      // 统一使用 ProductStorage（Web 使用 IndexedDB/AsyncStorage）
      console.log('[InventoryScreen] Loading products from ProductStorage...');
      const data = await ProductStorage.getActive();
      console.log('[InventoryScreen] Loaded', data.length, 'products');
      setProducts(data);
      setFilteredProducts(data);
    } catch (error) {
      console.error('[InventoryScreen] Failed to load products:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // 启动定时同步（5 分钟）
    const interval = setInterval(() => {
      autoSyncInBackground();
    }, 300000); // 5 分钟
    return () => clearInterval(interval);
  }, []);

  // 页面获得焦点时重新加载数据
  useFocusEffect(
    useCallback(() => {
      loadProducts();
      loadLastSyncTime();
      autoSyncOnEnter();
    }, [])
  );

  // 加载最后同步时间
  const loadLastSyncTime = async () => {
    const time = await AutoSync.getLastSyncTime();
    setLastSyncTime(time);
  };

  // 进入页面时自动同步
  const autoSyncOnEnter = async () => {
    try {
      await AutoSync.downloadFromCloud(
        downloadQuery,
        async () => {
          await loadProducts();
          await loadLastSyncTime();
        },
        (error) => {
          console.log("自动同步失败（静默）", error);
        }
      );
    } catch (error) {
      // 静默失败，不弹窗
      console.log("自动同步失败", error);
    }
  };

  // 后台定时同步
  const autoSyncInBackground = async () => {
    try {
      const shouldSync = await AutoSync.shouldSync();
      if (!shouldSync) return;

      await AutoSync.downloadFromCloud(
        downloadQuery,
        async () => {
          await loadProducts();
          await loadLastSyncTime();
        },
        (error) => {
          console.log("后台同步失败（静默）", error);
        }
      );
    } catch (error) {
      // 静默失败
      console.log("后台同步失败", error);
    }
  };

  // 下拉刷新
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await AutoSync.downloadFromCloud(
        downloadQuery,
        async () => {
          await loadProducts();
          await loadLastSyncTime();
          Alert.alert("成功", "已同步最新数据");
        },
        (error) => {
          Alert.alert("同步失败", "请检查网络连接");
        }
      );
    } catch (error) {
      Alert.alert("同步失败", "请检查网络连接");
    } finally {
      setRefreshing(false);
    }
  };

  // 搜索功能
  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredProducts(products);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = products.filter((p) =>
        p.sku.toLowerCase().includes(query)
      );
      setFilteredProducts(filtered);
    }
  }, [searchQuery, products]);

  // 手动上传到云端
  const handleUpload = async () => {
    setSyncing(true);
    try {
      await AutoSync.uploadToCloud(
        uploadMutation,
        async () => {
          await loadLastSyncTime();
          Alert.alert("成功", "已上传到云端");
        },
        (error) => {
          Alert.alert("上传失败", "请检查网络连接");
        }
      );
    } catch (error: any) {
      console.error("[Sync] Upload failed:", error);
      Alert.alert("上传失败", "请检查网络连接");
    } finally {
      setSyncing(false);
    }
  };

  // 手动从云端下载
  const handleDownload = async () => {
    Alert.confirm(
      "确认下载",
      "下载云端数据将覆盖本地数据，确定继续吗？",
      async () => {
        setSyncing(true);
        try {
          await AutoSync.downloadFromCloud(
            downloadQuery,
            async () => {
              await loadProducts();
              await loadLastSyncTime();
              Alert.alert("成功", "已从云端下载数据");
            },
            (error) => {
              Alert.alert("下载失败", "请检查网络连接");
            }
          );
        } catch (error: any) {
          console.error("[Sync] Download failed:", error);
          Alert.alert("下载失败", "请检查网络连接");
        } finally {
          setSyncing(false);
        }
      }
    );
  };

  // 导出 Excel
  const handleExport = async () => {
    if (products.length === 0) {
      Alert.alert("提示", "暂无数据可导出");
      return;
    }

    setExporting(true);

    try {
      await exportToDianxiaomiFormat(products);
      Alert.alert("成功", "数据已导出");
    } catch (error) {
      console.error("Export error:", error);
      Alert.alert("导出失败", "请重试");
    } finally {
      setExporting(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      {/* 顶部搜索和导出 */}
      <View
        style={[
          styles.header,
          {
            paddingTop: Math.max(insets.top, 16),
            paddingHorizontal: 16,
          },
        ]}
      >
        <ThemedText type="title" style={styles.title}>
          库存管理
        </ThemedText>

        {/* 搜索框 */}
        <TextInput
          style={[
            styles.searchInput,
            {
              backgroundColor:
                colorScheme === "dark"
                  ? "rgba(255, 255, 255, 0.1)"
                  : "rgba(0, 0, 0, 0.05)",
              color: colorScheme === "dark" ? "#fff" : "#000",
            },
          ]}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="搜索 SKU..."
          placeholderTextColor={
            colorScheme === "dark"
              ? "rgba(255, 255, 255, 0.4)"
              : "rgba(0, 0, 0, 0.4)"
          }
        />

        {/* 导出按钮 */}
        <Pressable
          style={[styles.exportButton, exporting && styles.buttonDisabled]}
          onPress={handleExport}
          disabled={exporting}
        >
          <ThemedText style={styles.exportButtonText}>
            {exporting ? "导出中..." : "📊 导出 Excel"}
          </ThemedText>
        </Pressable>

        {/* 数据同步区域 */}
        <View style={styles.syncContainer}>
            <View style={styles.syncButtonsRow}>
              <Pressable
                style={[styles.syncButton, styles.uploadButton, syncing && styles.buttonDisabled]}
                onPress={handleUpload}
                disabled={syncing}
              >
                <ThemedText style={styles.syncButtonText}>
                  {syncing ? "同步中..." : "⬆️ 上传到云端"}
                </ThemedText>
              </Pressable>
              
              <Pressable
                style={[styles.syncButton, styles.downloadButton, syncing && styles.buttonDisabled]}
                onPress={handleDownload}
                disabled={syncing}
              >
                <ThemedText style={styles.syncButtonText}>
                  {syncing ? "同步中..." : "⬇️ 从云端下载"}
                </ThemedText>
              </Pressable>
            </View>
            {/* 最后同步时间 */}
            <ThemedText style={styles.syncTimeText}>
              最后同步：{AutoSync.formatSyncTime(lastSyncTime)}
            </ThemedText>
          </View>
      </View>

      {/* 产品列表 */}
      <View style={styles.listContainer}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" />
          </View>
        ) : filteredProducts.length === 0 ? (
          <View style={styles.emptyContainer}>
            <ThemedText style={styles.emptyText}>
              {searchQuery ? "未找到匹配的产品" : "暂无库存记录"}
            </ThemedText>
          </View>
        ) : (
          <FlatList
            data={filteredProducts}
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
                    数量：{item.quantity}
                  </ThemedText>
                  <ThemedText style={styles.productDetail}>
                    位置：{item.storageLocation}
                  </ThemedText>
                </View>
              </Pressable>
            )}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colorScheme === "dark" ? "#fff" : "#000"}
              />
            }
            contentContainerStyle={styles.listContent}
          />
        )}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingBottom: 16,
  },
  title: {
    marginBottom: 16,
  },
  searchInput: {
    height: 48,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    lineHeight: 22,
    marginBottom: 12,
  },
  exportButton: {
    height: 48,
    backgroundColor: "#34C759",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  exportButtonText: {
    color: "#fff",
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  listContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  listContent: {
    paddingBottom: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
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
    marginBottom: 2,
  },
  syncContainer: {
    marginTop: 16,
    marginBottom: 8,
  },
  syncTitle: {
    marginBottom: 12,
    fontSize: 16,
    fontWeight: "600",
  },
  syncStatusContainer: {
    marginBottom: 12,
  },
  syncStatusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  syncStatusText: {
    fontSize: 14,
    opacity: 0.8,
  },
  syncTimeText: {
    fontSize: 12,
    opacity: 0.6,
    marginTop: 8,
    textAlign: "center",
  },
  syncWarningText: {
    fontSize: 12,
    color: "#FF9500",
    marginTop: 6,
  },
  syncButtonsRow: {
    flexDirection: "row",
    gap: 12,
  },
  syncButton: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  uploadButton: {
    backgroundColor: "#007AFF",
  },
  downloadButton: {
    backgroundColor: "#5856D6",
  },
  syncButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
});
