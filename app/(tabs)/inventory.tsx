import { useRouter, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { Alert } from "@/lib/alert";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { CloudImage } from "@/components/cloud-image";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { exportToDianxiaomiFormat } from "@/lib/excel-export";
import { ProductAPI } from "@/lib/api-client";
import { trpc } from "@/lib/trpc";
import { AutoSync } from "@/lib/auto-sync";
import { ProductStorage } from "@/lib/storage";
import { isMobileWeb, isDesktopWeb } from "@/lib/platform-detect";
import { BoxGenerator, BoxRecord } from "@/lib/box-generator";
import type { Product } from "@/types/product";

// 库存筛选类型
type StockFilter = "all" | "in_stock" | "out_of_stock";

// 排序类型
type SortType = "time_desc" | "time_asc" | "quantity_desc" | "quantity_asc";

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
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);

  // 筛选和排序状态
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [sortType, setSortType] = useState<SortType>("time_desc");
  const [showSortOptions, setShowSortOptions] = useState(false);
  
  // Box 筛选状态
  const [boxes, setBoxes] = useState<BoxRecord[]>([]);
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null); // null 表示全部
  const [showBoxFilter, setShowBoxFilter] = useState(false);

  // 使用 tRPC mutations 和 queries
  const downloadQuery = trpc.sync.download.useQuery(undefined, {
    enabled: false, // 手动触发
  });

  // 加载产品列表（Web 使用 AsyncStorage，原生使用 SQLite）
  const loadProducts = async () => {
    try {
      const isWeb = Platform.OS === 'web';
      
      // 统一使用 ProductStorage（Web 使用 IndexedDB/AsyncStorage）
      console.log('[InventoryScreen] Loading products from ProductStorage...');
      const [data, allBoxes] = await Promise.all([
        ProductStorage.getActive(),
        BoxGenerator.getAllBoxes()
      ]);
      console.log('[InventoryScreen] Loaded', data.length, 'products');
      setProducts(data);
      setBoxes(allBoxes);
    } catch (error) {
      console.error('[InventoryScreen] Failed to load products:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // 只有电脑 Web 端才启动定时同步（手机 Web 端是主操作端，不自动下载）
    if (!isDesktopWeb()) return;
    
    const interval = setInterval(() => {
      autoSyncInBackground();
    }, 300000); // 5 分钟
    return () => clearInterval(interval);
  }, []);

  // 页面获得焦点时重新加载数据
  useFocusEffect(
    useCallback(() => {
      loadProducts();
      // 只有电脑 Web 端才自动从云端下载（手机 Web 端是主操作端，不自动下载）
      if (isDesktopWeb()) {
        autoSyncOnEnter();
      }
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

  // 筛选和排序功能
  useEffect(() => {
    let result = [...products];

    // 搜索筛选（支持 SKU、位置、Box 名称）
    if (searchQuery.trim() !== "") {
      const query = searchQuery.toLowerCase();
      result = result.filter((p) =>
        p.sku.toLowerCase().includes(query) ||
        p.systemSku?.toLowerCase().includes(query) ||
        p.storageLocation.toLowerCase().includes(query) ||
        p.boxName?.toLowerCase().includes(query)
      );
    }

    // 库存状态筛选
    if (stockFilter === "in_stock") {
      result = result.filter((p) => p.quantity > 0);
    } else if (stockFilter === "out_of_stock") {
      result = result.filter((p) => p.quantity === 0);
    }

    // Box 筛选
    if (selectedBoxId !== null) {
      if (selectedBoxId === "unassigned") {
        // 筛选未关联 Box 的产品
        result = result.filter((p) => !p.boxId && !p.boxName);
      } else {
        // 筛选指定 Box 的产品（同时支持 boxId 和 boxName）
        // 找到选中的 Box 信息（BoxRecord 使用 code 字段）
        const selectedBox = boxes.find(b => b.code === selectedBoxId);
        result = result.filter((p) => 
          p.boxId === selectedBoxId || 
          p.boxName === selectedBoxId ||
          (selectedBox && (p.boxId === selectedBox.code || p.boxName === selectedBox.code))
        );
      }
    }

    // 排序
    switch (sortType) {
      case "time_desc":
        result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      case "time_asc":
        result.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        break;
      case "quantity_desc":
        result.sort((a, b) => b.quantity - a.quantity);
        break;
      case "quantity_asc":
        result.sort((a, b) => a.quantity - b.quantity);
        break;
    }

    setFilteredProducts(result);
  }, [searchQuery, products, stockFilter, sortType, selectedBoxId]);

  // 获取排序显示文本
  const getSortText = () => {
    switch (sortType) {
      case "time_desc": return "时间 ↓";
      case "time_asc": return "时间 ↑";
      case "quantity_desc": return "数量 ↓";
      case "quantity_asc": return "数量 ↑";
    }
  };

  // 输入框样式
  const inputBg = colorScheme === "dark" ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)";
  const inputColor = colorScheme === "dark" ? "#fff" : "#000";
  const placeholderColor = colorScheme === "dark" ? "rgba(255, 255, 255, 0.4)" : "rgba(0, 0, 0, 0.4)";

  return (
    <ThemedView style={styles.container}>
      {/* 顶部搜索和筛选 */}
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
              backgroundColor: inputBg,
              color: inputColor,
            },
          ]}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="搜索 SKU、位置或 Box..."
          placeholderTextColor={placeholderColor}
        />

        {/* 筛选栏 */}
        <View style={styles.filterContainer}>
          {/* 库存状态筛选 */}
          <View style={styles.stockFilterContainer}>
            <Pressable
              style={[
                styles.filterChip,
                stockFilter === "all" && styles.filterChipActive,
              ]}
              onPress={() => setStockFilter("all")}
            >
              <ThemedText
                style={[
                  styles.filterChipText,
                  stockFilter === "all" && styles.filterChipTextActive,
                ]}
              >
                全部
              </ThemedText>
            </Pressable>
            <Pressable
              style={[
                styles.filterChip,
                stockFilter === "in_stock" && styles.filterChipActive,
              ]}
              onPress={() => setStockFilter("in_stock")}
            >
              <ThemedText
                style={[
                  styles.filterChipText,
                  stockFilter === "in_stock" && styles.filterChipTextActive,
                ]}
              >
                有库存
              </ThemedText>
            </Pressable>
            <Pressable
              style={[
                styles.filterChip,
                stockFilter === "out_of_stock" && styles.filterChipActive,
              ]}
              onPress={() => setStockFilter("out_of_stock")}
            >
              <ThemedText
                style={[
                  styles.filterChipText,
                  stockFilter === "out_of_stock" && styles.filterChipTextActive,
                ]}
              >
                无库存
              </ThemedText>
            </Pressable>
          </View>

          {/* 排序按钮 */}
          <Pressable
            style={styles.sortButton}
            onPress={() => setShowSortOptions(!showSortOptions)}
          >
            <ThemedText style={styles.sortButtonText}>
              排序: {getSortText()}
            </ThemedText>
          </Pressable>
        </View>

        {/* Box 筛选栏 */}
        <View style={styles.boxFilterContainer}>
          <Pressable
            style={[
              styles.boxFilterChip,
              selectedBoxId === null && styles.boxFilterChipActive,
            ]}
            onPress={() => setSelectedBoxId(null)}
          >
            <ThemedText
              style={[
                styles.boxFilterChipText,
                selectedBoxId === null && styles.boxFilterChipTextActive,
              ]}
            >
              全部 Box
            </ThemedText>
          </Pressable>
          <Pressable
            style={[
              styles.boxFilterChip,
              selectedBoxId === "unassigned" && styles.boxFilterChipActive,
            ]}
            onPress={() => setSelectedBoxId("unassigned")}
          >
            <ThemedText
              style={[
                styles.boxFilterChipText,
                selectedBoxId === "unassigned" && styles.boxFilterChipTextActive,
              ]}
            >
              未关联
            </ThemedText>
          </Pressable>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.boxScrollView}>
            {boxes.map((box) => (
              <Pressable
                key={box.code}
                style={[
                  styles.boxFilterChip,
                  selectedBoxId === box.code && styles.boxFilterChipActive,
                ]}
                onPress={() => setSelectedBoxId(box.code)}
              >
                <ThemedText
                  style={[
                    styles.boxFilterChipText,
                    selectedBoxId === box.code && styles.boxFilterChipTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {box.code}
                </ThemedText>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* 排序选项 */}
        {showSortOptions && (
          <View style={styles.sortOptionsContainer}>
            <Pressable
              style={[
                styles.sortOption,
                sortType === "time_desc" && styles.sortOptionActive,
              ]}
              onPress={() => {
                setSortType("time_desc");
                setShowSortOptions(false);
              }}
            >
              <ThemedText
                style={[
                  styles.sortOptionText,
                  sortType === "time_desc" && styles.sortOptionTextActive,
                ]}
              >
                时间最新
              </ThemedText>
            </Pressable>
            <Pressable
              style={[
                styles.sortOption,
                sortType === "time_asc" && styles.sortOptionActive,
              ]}
              onPress={() => {
                setSortType("time_asc");
                setShowSortOptions(false);
              }}
            >
              <ThemedText
                style={[
                  styles.sortOptionText,
                  sortType === "time_asc" && styles.sortOptionTextActive,
                ]}
              >
                时间最早
              </ThemedText>
            </Pressable>
            <Pressable
              style={[
                styles.sortOption,
                sortType === "quantity_desc" && styles.sortOptionActive,
              ]}
              onPress={() => {
                setSortType("quantity_desc");
                setShowSortOptions(false);
              }}
            >
              <ThemedText
                style={[
                  styles.sortOptionText,
                  sortType === "quantity_desc" && styles.sortOptionTextActive,
                ]}
              >
                数量最多
              </ThemedText>
            </Pressable>
            <Pressable
              style={[
                styles.sortOption,
                sortType === "quantity_asc" && styles.sortOptionActive,
              ]}
              onPress={() => {
                setSortType("quantity_asc");
                setShowSortOptions(false);
              }}
            >
              <ThemedText
                style={[
                  styles.sortOptionText,
                  sortType === "quantity_asc" && styles.sortOptionTextActive,
                ]}
              >
                数量最少
              </ThemedText>
            </Pressable>
          </View>
        )}

        {/* 统计信息和导出按钮 */}
        <View style={styles.statsRow}>
          <View style={styles.statsLeft}>
            <ThemedText style={styles.statsText}>
              共 {filteredProducts.length} 个产品
            </ThemedText>
            <ThemedText style={styles.statsText}>
              总库存: {filteredProducts.reduce((sum, p) => sum + p.quantity, 0)}
            </ThemedText>
          </View>
          <Pressable
            style={[styles.exportButton, exporting && styles.exportButtonDisabled]}
            onPress={async () => {
              if (exporting || filteredProducts.length === 0) return;
              setExporting(true);
              try {
                await exportToDianxiaomiFormat(filteredProducts);
                Alert.alert("成功", `已导出 ${filteredProducts.length} 个产品`);
              } catch (error) {
                console.error("Export failed:", error);
                Alert.alert("导出失败", "请稍后重试");
              } finally {
                setExporting(false);
              }
            }}
            disabled={exporting || filteredProducts.length === 0}
          >
            <ThemedText style={styles.exportButtonText}>
              {exporting ? "导出中..." : "导出 Excel"}
            </ThemedText>
          </Pressable>
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
              {searchQuery || stockFilter !== "all" ? "未找到匹配的产品" : "暂无库存记录"}
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
                  item.quantity === 0 && styles.productCardEmpty,
                  { opacity: pressed ? 0.7 : 1 },
                ]}
                onPress={() => router.push({ pathname: "/product-detail" as any, params: { id: item.id, from: 'inventory' } })}
              >
                {item.quantity === 0 && (
                  <View style={styles.emptyBadge}>
                    <ThemedText style={styles.emptyBadgeText}>库存为0</ThemedText>
                  </View>
                )}
                <CloudImage
                  productId={item.id}
                  localUri={item.detailImageUri}
                  style={[
                    styles.productImage,
                    item.quantity === 0 && styles.productImageEmpty
                  ]}
                  imageType="detail"
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
                    数量：{item.quantity}
                  </ThemedText>
                  <ThemedText style={styles.productDetail}>
                    位置：{item.storageLocation}
                  </ThemedText>
                  <ThemedText style={styles.productDetail}>
                    Box：{item.boxName || "未关联"}
                  </ThemedText>
                  <ThemedText style={styles.productTime}>
                    {new Date(item.createdAt).toLocaleString("zh-CN")}
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
    paddingBottom: 12,
  },
  title: {
    marginBottom: 16,
  },
  searchInput: {
    height: 44,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    lineHeight: 22,
    marginBottom: 12,
  },
  filterContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  stockFilterContainer: {
    flexDirection: "row",
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "rgba(0, 0, 0, 0.05)",
  },
  filterChipActive: {
    backgroundColor: "#007AFF",
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: "500",
  },
  filterChipTextActive: {
    color: "#fff",
  },
  sortButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "rgba(0, 0, 0, 0.05)",
  },
  sortButtonText: {
    fontSize: 13,
    fontWeight: "500",
  },
  sortOptionsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
    padding: 12,
    backgroundColor: "rgba(0, 0, 0, 0.03)",
    borderRadius: 12,
  },
  sortOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "rgba(0, 0, 0, 0.05)",
  },
  sortOptionActive: {
    backgroundColor: "#007AFF",
  },
  sortOptionText: {
    fontSize: 13,
  },
  sortOptionTextActive: {
    color: "#fff",
  },
  boxFilterContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  boxScrollView: {
    flexGrow: 0,
  },
  boxFilterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "rgba(0, 0, 0, 0.05)",
    marginRight: 8,
  },
  boxFilterChipActive: {
    backgroundColor: "#34C759",
  },
  boxFilterChipText: {
    fontSize: 13,
    fontWeight: "500",
  },
  boxFilterChipTextActive: {
    color: "#fff",
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(0, 0, 0, 0.1)",
  },
  statsLeft: {
    flexDirection: "row",
    gap: 16,
  },
  statsText: {
    fontSize: 13,
    opacity: 0.6,
  },
  exportButton: {
    backgroundColor: "#34C759",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  exportButtonDisabled: {
    backgroundColor: "rgba(52, 199, 89, 0.5)",
  },
  exportButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
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
  productTime: {
    fontSize: 12,
    lineHeight: 16,
    opacity: 0.5,
    marginTop: 4,
  },
  // 库存为0的产品样式
  productCardEmpty: {
    backgroundColor: "rgba(142, 142, 147, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(142, 142, 147, 0.3)",
  },
  productImageEmpty: {
    opacity: 0.5,
  },
  productSkuEmpty: {
    opacity: 0.6,
  },
  productDetailEmpty: {
    color: "#FF3B30",
    opacity: 1,
    fontWeight: "600",
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
});
