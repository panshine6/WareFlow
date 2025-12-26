import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { exportToDianxiaomiFormat } from "@/lib/excel-export";
import { ProductStorage } from "@/lib/storage";
import { SyncService, type SyncStatus } from "@/lib/sync";
import { trpc } from "@/lib/trpc";
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
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [dbConfigured, setDbConfigured] = useState(false);

  const trpcClient = trpc.useContext();

  // 加载产品列表
  const loadProducts = async () => {
    try {
      const data = await ProductStorage.getAll();
      setProducts(data);
      setFilteredProducts(data);
    } catch (error) {
      console.error("Failed to load products:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
    checkDatabaseAndLoadStatus();
  }, []);

  // 检查数据库配置并加载同步状态
  const checkDatabaseAndLoadStatus = async () => {
    try {
      const configured = await SyncService.isDatabaseConfigured(trpcClient);
      setDbConfigured(configured);
      if (configured) {
        await loadSyncStatus();
      }
    } catch (error) {
      console.error("Failed to check database:", error);
      setDbConfigured(false);
    }
  };

  // 加载同步状态
  const loadSyncStatus = async () => {
    try {
      const status = await SyncService.getStatus(trpcClient);
      setSyncStatus(status);
    } catch (error) {
      console.error("Failed to load sync status:", error);
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
      const result = await SyncService.uploadToCloud(trpcClient);
      if (result.success) {
        Alert.alert("上传成功", `已上传 ${result.count} 条数据到云端`);
        await loadSyncStatus();
      } else {
        Alert.alert("上传失败", result.error || "请重试");
      }
    } catch (error: any) {
      Alert.alert("上传失败", error.message || "请检查网络连接");
    } finally {
      setSyncing(false);
    }
  };

  // 手动从云端下载
  const handleDownload = async () => {
    Alert.alert(
      "确认下载",
      "下载云端数据将覆盖本地数据，确定继续吗？",
      [
        { text: "取消", style: "cancel" },
        {
          text: "确定",
          style: "destructive",
          onPress: async () => {
            setSyncing(true);
            try {
              const result = await SyncService.downloadFromCloud(trpcClient);
              if (result.success) {
                Alert.alert("下载成功", `已下载 ${result.count} 条数据到本地`);
                await loadSyncStatus();
                await loadProducts(); // 刷新列表
              } else {
                Alert.alert("下载失败", result.error || "请重试");
              }
            } catch (error: any) {
              Alert.alert("下载失败", error.message || "请检查网络连接");
            } finally {
              setSyncing(false);
            }
          },
        },
      ]
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
        {dbConfigured && (
          <View style={styles.syncContainer}>
            <ThemedText type="subtitle" style={styles.syncTitle}>
              数据同步
            </ThemedText>
            
            {syncStatus && (
              <View style={styles.syncStatusContainer}>
                <View style={styles.syncStatusRow}>
                  <ThemedText style={styles.syncStatusText}>
                    本地: {syncStatus.localCount} 条
                  </ThemedText>
                  <ThemedText style={styles.syncStatusText}>
                    云端: {syncStatus.cloudCount} 条
                  </ThemedText>
                </View>
                
                {syncStatus.lastSyncTime && (
                  <ThemedText style={styles.syncTimeText}>
                    最后同步: {new Date(syncStatus.lastSyncTime).toLocaleString('zh-CN', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </ThemedText>
                )}
                
                {!syncStatus.lastSyncTime && (
                  <ThemedText style={styles.syncTimeText}>
                    从未同步
                  </ThemedText>
                )}
                
                {syncStatus.needsSync && (
                  <ThemedText style={styles.syncWarningText}>
                    ⚠️ 本地和云端数据不一致
                  </ThemedText>
                )}
              </View>
            )}
            
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
          </View>
        )}
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
    padding: 16,
    backgroundColor: "rgba(0, 122, 255, 0.1)",
    borderRadius: 12,
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
    marginTop: 4,
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
    height: 44,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  uploadButton: {
    backgroundColor: "#007AFF",
  },
  downloadButton: {
    backgroundColor: "#5856D6",
  },
  syncButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
});
