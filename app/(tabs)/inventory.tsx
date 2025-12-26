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
import { trpc } from "@/lib/trpc";
import type { Product } from "@/types/product";
import AsyncStorage from "@react-native-async-storage/async-storage";

const LAST_SYNC_TIME_KEY = "lastSyncTime";

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

  // 使用 tRPC mutations 和 queries
  const uploadMutation = trpc.sync.upload.useMutation();
  const downloadQuery = trpc.sync.download.useQuery(undefined, {
    enabled: false, // 手动触发
  });

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
  }, []);

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
      console.log("[Sync] Starting upload to cloud...");
      
      // 1. 获取本地所有数据
      const localProducts = await ProductStorage.getAll();
      console.log(`[Sync] Found ${localProducts.length} local products`);
      
      if (localProducts.length === 0) {
        Alert.alert("提示", "本地暂无数据可上传");
        setSyncing(false);
        return;
      }
      
      // 2. 转换数据格式（确保日期字段正确）
      const productsToUpload = localProducts.map((p) => ({
        id: p.id,
        detailImageUri: p.detailImageUri,
        overviewImageUri: p.overviewImageUri,
        sku: p.sku,
        quantity: p.quantity,
        storageLocation: p.storageLocation,
        operatorId: typeof p.operatorId === 'number' ? p.operatorId : 0,
        operatorName: p.operatorName || "",
        isDeleted: p.isDeleted ? 1 : 0,
        deletedAt: p.deletedAt ? new Date(p.deletedAt) : null,
        createdAt: new Date(p.createdAt),
        updatedAt: new Date(p.updatedAt || p.createdAt),
      }));
      
      // 3. 上传到云端
      console.log("[Sync] Uploading to cloud...");
      const result = await uploadMutation.mutateAsync({
        products: productsToUpload,
      });
      
      // 4. 更新最后同步时间
      const now = new Date().toISOString();
      await AsyncStorage.setItem(LAST_SYNC_TIME_KEY, now);
      
      console.log(`[Sync] Upload completed: ${result.count} products`);
      
      Alert.alert("上传成功", `已上传 ${result.count} 条数据到云端`);
    } catch (error: any) {
      console.error("[Sync] Upload failed:", error);
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
          onPress: async () => {
            setSyncing(true);
            try {
              console.log("[Sync] Starting download from cloud...");
              
              // 1. 从云端获取数据
              const result = await downloadQuery.refetch();
              if (!result.data) {
                throw new Error("无法获取云端数据");
              }
              
              const cloudProducts = result.data.products;
              console.log(`[Sync] Downloaded ${cloudProducts.length} products from cloud`);
              
              // 2. 转换数据格式
              const localProducts: Product[] = cloudProducts.map((p: any) => ({
                id: p.id,
                detailImageUri: p.detailImageUri,
                overviewImageUri: p.overviewImageUri,
                sku: p.sku,
                quantity: p.quantity,
                storageLocation: p.storageLocation,
                operatorId: p.operatorId,
                operatorName: p.operatorName,
                isDeleted: p.isDeleted === 1,
                deletedAt: p.deletedAt ? new Date(p.deletedAt as any).toISOString() : undefined,
                createdAt: new Date(p.createdAt).toISOString(),
                updatedAt: new Date(p.updatedAt).toISOString(),
                history: [], // 历史记录需要单独查询
              }));
              
              // 3. 清空本地数据并保存云端数据
              await AsyncStorage.removeItem("products");
              await AsyncStorage.setItem("products", JSON.stringify(localProducts));
              
              // 4. 更新最后同步时间
              const now = new Date().toISOString();
              await AsyncStorage.setItem(LAST_SYNC_TIME_KEY, now);
              
              console.log(`[Sync] Download completed: ${localProducts.length} products`);
              
              Alert.alert("下载成功", `已从云端下载 ${localProducts.length} 条数据`);
              
              // 重新加载产品列表
              await loadProducts();
            } catch (error: any) {
              console.error("[Sync] Download failed:", error);
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
