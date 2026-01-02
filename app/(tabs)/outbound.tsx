import { useRouter, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { Alert } from "@/lib/alert";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { ProductStorage } from "@/lib/storage";
import { OutboundStorage } from "@/lib/outbound-storage";
import { UserStorage } from "@/lib/user-storage";
import type { Product, OutboundRecord, OutboundItem, InventoryHistoryEntry } from "@/types/product";
import { 
  getRecentInboundProducts, 
  groupByBatch, 
  exportLabelsToExcel,
  formatLabelTime,
  formatBatchTimeRange,
  type LabelItem,
  type BatchGroup,
} from "@/lib/excel-export";

// 选中的产品项
interface SelectedProduct extends Product {
  selectedQuantity: number;
  isSelected: boolean;
}

// 视图模式
type ViewMode = "search" | "history" | "labels";

/**
 * 出库管理页面
 */
export default function OutboundScreen() {
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // 视图模式
  const [viewMode, setViewMode] = useState<ViewMode>("search");

  // 搜索相关
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SelectedProduct[]>([]);
  const [searching, setSearching] = useState(false);

  // 出库信息
  const [reason, setReason] = useState("销售");
  const [destination, setDestination] = useState("发货仓");

  // 出库历史
  const [outboundHistory, setOutboundHistory] = useState<OutboundRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // 操作状态
  const [processing, setProcessing] = useState(false);

  // 确认弹窗状态
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // 标签导出相关
  const [labelItems, setLabelItems] = useState<LabelItem[]>([]);
  const [batchGroups, setBatchGroups] = useState<BatchGroup[]>([]);
  const [selectedLabelIds, setSelectedLabelIds] = useState<Set<string>>(new Set());
  const [loadingLabels, setLoadingLabels] = useState(false);

  // 当前用户
  const [currentUser, setCurrentUser] = useState<{ id: number; name: string } | null>(null);

  // 加载当前用户
  useEffect(() => {
    const loadUser = async () => {
      const user = await UserStorage.getCurrentUser();
      if (user) {
        setCurrentUser({ id: user.id, name: user.name });
      }
    };
    loadUser();
  }, []);

  // 页面获得焦点时加载出库历史或标签数据
  useFocusEffect(
    useCallback(() => {
      if (viewMode === "history") {
        loadOutboundHistory();
      } else if (viewMode === "labels") {
        loadLabelItems();
      }
    }, [viewMode])
  );

  // 加载出库历史
  const loadOutboundHistory = async () => {
    setLoadingHistory(true);
    try {
      const records = await OutboundStorage.getAll();
      // 按时间倒序排列
      records.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setOutboundHistory(records);
    } catch (error) {
      console.error("[Outbound] Failed to load history:", error);
    } finally {
      setLoadingHistory(false);
    }
  };

  // 加载最近入库的标签数据
  const loadLabelItems = async () => {
    setLoadingLabels(true);
    try {
      // 获取最近 7 天内入库的商品（168 小时）
      const items = await getRecentInboundProducts(168);
      setLabelItems(items);
      
      // 按批次分组（30 分钟内算同一批次）
      const groups = groupByBatch(items, 30);
      setBatchGroups(groups);
      
      // 默认全选
      setSelectedLabelIds(new Set(items.map(item => `${item.id}-${item.inboundTime}`)));
    } catch (error) {
      console.error("[Outbound] Failed to load label items:", error);
    } finally {
      setLoadingLabels(false);
    }
  };

  // 搜索产品（按 Box 或 SKU）
  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      Alert.alert("提示", "请输入搜索内容");
      return;
    }

    setSearching(true);
    try {
      const allProducts = await ProductStorage.getActive();
      const query = searchQuery.trim().toLowerCase();

      // 搜索匹配的产品（按 Box 位置或 SKU）
      const matched = allProducts.filter(
        (p) =>
          p.storageLocation.toLowerCase().includes(query) ||
          p.sku.toLowerCase().includes(query) ||
          p.systemSku?.toLowerCase().includes(query)
      );

      // 转换为选中状态的产品
      const selectedProducts: SelectedProduct[] = matched.map((p) => ({
        ...p,
        selectedQuantity: p.quantity,
        isSelected: false,
      }));

      setSearchResults(selectedProducts);

      if (selectedProducts.length === 0) {
        Alert.alert("提示", "未找到匹配的产品");
      }
    } catch (error) {
      console.error("[Outbound] Search failed:", error);
      Alert.alert("错误", "搜索失败，请重试");
    } finally {
      setSearching(false);
    }
  };

  // 切换产品选中状态
  const toggleProductSelection = (productId: string) => {
    setSearchResults((prev) =>
      prev.map((p) =>
        p.id === productId ? { ...p, isSelected: !p.isSelected } : p
      )
    );
  };

  // 全选/取消全选
  const toggleSelectAll = () => {
    const allSelected = searchResults.every((p) => p.isSelected);
    setSearchResults((prev) =>
      prev.map((p) => ({ ...p, isSelected: !allSelected }))
    );
  };

  // 更新出库数量
  const updateQuantity = (productId: string, quantity: number) => {
    setSearchResults((prev) =>
      prev.map((p) =>
        p.id === productId
          ? { ...p, selectedQuantity: Math.max(0, Math.min(quantity, p.quantity)) }
          : p
      )
    );
  };

  // 点击出库按钮，显示确认弹窗
  const handleOutboundClick = () => {
    const selectedProducts = searchResults.filter((p) => p.isSelected && p.selectedQuantity > 0);

    if (selectedProducts.length === 0) {
      Alert.alert("提示", "请选择要出库的产品");
      return;
    }

    if (!currentUser) {
      Alert.alert("错误", "请先登录");
      return;
    }

    // 显示自定义确认弹窗
    setShowConfirmModal(true);
  };

  // 确认出库操作
  const handleConfirmOutbound = async () => {
    setShowConfirmModal(false);
    const selectedProducts = searchResults.filter((p) => p.isSelected && p.selectedQuantity > 0);
    
    if (!currentUser) return;
    
    {
        console.log("[Outbound] ========== START OUTBOUND ==========");
        setProcessing(true);
        const updateResults: string[] = [];
        
        try {
          const now = new Date().toISOString();
          const outboundId = `OUT-${Date.now()}`;
          console.log("[Outbound] Outbound ID:", outboundId);
          console.log("[Outbound] Selected products:", selectedProducts.length);

          // 创建出库记录
          const outboundItems: OutboundItem[] = selectedProducts.map((p) => ({
            productId: p.id,
            sku: p.sku,
            systemSku: p.systemSku,
            quantity: p.selectedQuantity,
            storageLocation: p.storageLocation,
            detailImageUri: p.detailImageUri,
          }));

          const outboundRecord: OutboundRecord = {
            id: outboundId,
            timestamp: now,
            operatorId: currentUser.id,
            operatorName: currentUser.name,
            reason,
            destination,
            items: outboundItems,
          };

          // 保存出库记录
          console.log("[Outbound] Saving outbound record...");
          await OutboundStorage.add(outboundRecord);
          console.log("[Outbound] Outbound record saved");

          // 更新每个产品的库存和历史记录
          for (const product of selectedProducts) {
            console.log(`[Outbound] Processing product: ${product.sku} (ID: ${product.id})`);
            
            const existingProduct = await ProductStorage.getById(product.id);
            if (!existingProduct) {
              console.log(`[Outbound] Product not found: ${product.id}`);
              updateResults.push(`${product.sku}: 未找到产品`);
              continue;
            }

            console.log(`[Outbound] Existing product quantity: ${existingProduct.quantity}`);
            console.log(`[Outbound] Existing history count: ${existingProduct.history?.length || 0}`);

            // 创建出库历史记录
            const historyEntry: InventoryHistoryEntry = {
              id: `${product.id}-out-${Date.now()}`,
              timestamp: now,
              operatorId: currentUser.id,
              operatorName: currentUser.name,
              quantity: -product.selectedQuantity, // 负数表示出库
              location: product.storageLocation,
              detailImageUri: product.detailImageUri,
              overviewImageUri: existingProduct.overviewImageUri || "",
              type: "outbound",
              reason,
              destination,
            };

            // 更新产品
            const existingHistory = existingProduct.history || [];
            const newQuantity = Math.max(0, existingProduct.quantity - product.selectedQuantity);
            const newHistory = [...existingHistory, historyEntry];

            console.log(`[Outbound] New quantity: ${newQuantity}`);
            console.log(`[Outbound] New history count: ${newHistory.length}`);

            await ProductStorage.update(product.id, {
              quantity: newQuantity,
              history: newHistory,
              updatedAt: now,
            });

            // 验证更新是否成功
            const verifyProduct = await ProductStorage.getById(product.id);
            if (verifyProduct) {
              console.log(`[Outbound] Verify - quantity: ${verifyProduct.quantity}, history: ${verifyProduct.history?.length || 0}`);
              updateResults.push(`${product.sku}: ${existingProduct.quantity} → ${verifyProduct.quantity} (历史: ${verifyProduct.history?.length || 0}条)`);
            } else {
              updateResults.push(`${product.sku}: 验证失败`);
            }
          }

          console.log("[Outbound] ========== OUTBOUND COMPLETE ==========");

          // 显示详细结果
          Alert.alert(
            "出库成功！",
            `已出库 ${selectedProducts.length} 个产品\n\n详细结果：\n${updateResults.join("\n")}`
          );

          // 清空搜索结果
          setSearchResults([]);
          setSearchQuery("");
        } catch (error) {
          console.error("[Outbound] Failed to process outbound:", error);
          Alert.alert("错误", `出库失败：${error instanceof Error ? error.message : '未知错误'}\n\n已处理：\n${updateResults.join("\n")}`);
        } finally {
          setProcessing(false);
        }
    }
  };

  // 格式化时间
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // 计算选中的产品数量
  const selectedCount = searchResults.filter((p) => p.isSelected).length;
  const totalSelectedQuantity = searchResults
    .filter((p) => p.isSelected)
    .reduce((sum, p) => sum + p.selectedQuantity, 0);

  // 输入框样式
  const inputBg = colorScheme === "dark" ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)";
  const inputColor = colorScheme === "dark" ? "#fff" : "#000";
  const placeholderColor = colorScheme === "dark" ? "rgba(255, 255, 255, 0.4)" : "rgba(0, 0, 0, 0.4)";

  return (
    <ThemedView style={styles.container}>
      {/* 顶部标题和切换 */}
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
          出库管理
        </ThemedText>

        {/* 视图切换 */}
        <View style={styles.tabContainer}>
          <Pressable
            style={[styles.tab, viewMode === "search" && styles.tabActive]}
            onPress={() => setViewMode("search")}
          >
            <ThemedText
              style={[styles.tabText, viewMode === "search" && styles.tabTextActive]}
            >
              出库操作
            </ThemedText>
          </Pressable>
          <Pressable
            style={[styles.tab, viewMode === "history" && styles.tabActive]}
            onPress={() => {
              setViewMode("history");
              loadOutboundHistory();
            }}
          >
            <ThemedText
              style={[styles.tabText, viewMode === "history" && styles.tabTextActive]}
            >
              出库记录
            </ThemedText>
          </Pressable>
          {Platform.OS === 'web' && (
            <Pressable
              style={[styles.tab, viewMode === "labels" && styles.tabActive]}
              onPress={() => {
                setViewMode("labels");
                loadLabelItems();
              }}
            >
              <ThemedText
                style={[styles.tabText, viewMode === "labels" && styles.tabTextActive]}
              >
                🏷️ 打印标签
              </ThemedText>
            </Pressable>
          )}
        </View>
      </View>

      {viewMode === "labels" ? (
        // 标签导出视图
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
        >
          {loadingLabels ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" />
              <ThemedText style={{ marginTop: 12 }}>加载中...</ThemedText>
            </View>
          ) : labelItems.length === 0 ? (
            <View style={styles.emptyContainer}>
              <ThemedText style={styles.emptyText}>最近 7 天内没有入库记录</ThemedText>
              <ThemedText style={[styles.emptyText, { marginTop: 8, opacity: 0.6 }]}>
                入库后的商品会显示在这里，方便批量导出打印标签
              </ThemedText>
            </View>
          ) : (
            <>
              {/* 批次分组提示 */}
              {batchGroups.length > 1 && (
                <View style={styles.batchHint}>
                  <ThemedText style={styles.batchHintText}>
                    📦 检测到 {batchGroups.length} 个入库批次，同一批次内的商品已用相同颜色标记
                  </ThemedText>
                </View>
              )}

              {/* 全选/取消全选 */}
              <View style={styles.selectionHeader}>
                <Pressable
                  style={styles.selectAllButton}
                  onPress={() => {
                    if (selectedLabelIds.size === labelItems.length) {
                      setSelectedLabelIds(new Set());
                    } else {
                      setSelectedLabelIds(new Set(labelItems.map(item => `${item.id}-${item.inboundTime}`)));
                    }
                  }}
                >
                  <View
                    style={[
                      styles.checkbox,
                      selectedLabelIds.size === labelItems.length && styles.checkboxChecked,
                    ]}
                  >
                    {selectedLabelIds.size === labelItems.length && (
                      <ThemedText style={styles.checkmark}>✓</ThemedText>
                    )}
                  </View>
                  <ThemedText style={styles.selectAllText}>全选</ThemedText>
                </Pressable>
                <ThemedText style={styles.selectionStats}>
                  已选 {selectedLabelIds.size} 个，共 {labelItems.filter(item => selectedLabelIds.has(`${item.id}-${item.inboundTime}`)).reduce((sum, item) => sum + item.quantity, 0)} 张标签
                </ThemedText>
              </View>

              {/* 标签列表 */}
              {batchGroups.map((group, groupIndex) => (
                <View key={groupIndex} style={styles.batchGroup}>
                  {/* 批次标题 */}
                  <View style={[
                    styles.batchHeader,
                    { backgroundColor: `hsl(${groupIndex * 60}, 70%, 95%)` }
                  ]}>
                    <ThemedText style={styles.batchTitle}>
                      批次 {groupIndex + 1}: {formatBatchTimeRange(group)}
                    </ThemedText>
                    <ThemedText style={styles.batchCount}>
                      {group.items.length} 个商品
                    </ThemedText>
                  </View>

                  {/* 批次内的商品 */}
                  {group.items.map((item) => {
                    const itemKey = `${item.id}-${item.inboundTime}`;
                    const isSelected = selectedLabelIds.has(itemKey);
                    return (
                      <Pressable
                        key={itemKey}
                        style={[
                          styles.labelItem,
                          isSelected && styles.labelItemSelected,
                          { borderLeftColor: `hsl(${groupIndex * 60}, 70%, 50%)` }
                        ]}
                        onPress={() => {
                          const newSet = new Set(selectedLabelIds);
                          if (isSelected) {
                            newSet.delete(itemKey);
                          } else {
                            newSet.add(itemKey);
                          }
                          setSelectedLabelIds(newSet);
                        }}
                      >
                        <View style={[
                          styles.checkbox,
                          isSelected && styles.checkboxChecked,
                        ]}>
                          {isSelected && (
                            <ThemedText style={styles.checkmark}>✓</ThemedText>
                          )}
                        </View>
                        <View style={styles.labelItemInfo}>
                          <ThemedText style={styles.labelItemSku}>
                            {item.systemSku}
                          </ThemedText>
                          {item.userSku && (
                            <ThemedText style={styles.labelItemUserSku}>
                              公司SKU: {item.userSku}
                            </ThemedText>
                          )}
                          <ThemedText style={styles.labelItemMeta}>
                            数量: {item.quantity} | {formatLabelTime(item.inboundTime)}
                          </ThemedText>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ))}

              {/* 导出按钮 */}
              <Pressable
                style={[
                  styles.exportButton,
                  selectedLabelIds.size === 0 && styles.buttonDisabled,
                ]}
                onPress={() => {
                  const selectedItems = labelItems.filter(item => 
                    selectedLabelIds.has(`${item.id}-${item.inboundTime}`)
                  );
                  try {
                    exportLabelsToExcel(selectedItems);
                    Alert.alert("导出成功", `已导出 ${selectedItems.length} 个商品的标签数据，请在 NIIMBOT APP 中导入打印`);
                  } catch (error) {
                    Alert.alert("导出失败", error instanceof Error ? error.message : "未知错误");
                  }
                }}
                disabled={selectedLabelIds.size === 0}
              >
                <ThemedText style={styles.exportButtonText}>
                  📥 导出 Excel ({selectedLabelIds.size} 个商品)
                </ThemedText>
              </Pressable>

              <ThemedText style={styles.exportHint}>
                导出后请在 NIIMBOT APP 中使用「Excel 导入」功能批量打印标签
              </ThemedText>
            </>
          )}
        </ScrollView>
      ) : viewMode === "search" ? (
        // 出库操作视图
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
        >
          {/* 搜索框 */}
          <View style={styles.searchSection}>
            <TextInput
              style={[styles.searchInput, { backgroundColor: inputBg, color: inputColor }]}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="输入 Box 位置或 SKU 搜索..."
              placeholderTextColor={placeholderColor}
              onSubmitEditing={handleSearch}
              returnKeyType="search"
            />
            <Pressable
              style={[styles.searchButton, searching && styles.buttonDisabled]}
              onPress={handleSearch}
              disabled={searching}
            >
              <ThemedText style={styles.searchButtonText}>
                {searching ? "搜索中..." : "🔍 搜索"}
              </ThemedText>
            </Pressable>
          </View>

          {/* 搜索结果 */}
          {searchResults.length > 0 && (
            <>
              {/* 全选和统计 */}
              <View style={styles.selectionHeader}>
                <Pressable style={styles.selectAllButton} onPress={toggleSelectAll}>
                  <View
                    style={[
                      styles.checkbox,
                      searchResults.every((p) => p.isSelected) && styles.checkboxChecked,
                    ]}
                  >
                    {searchResults.every((p) => p.isSelected) && (
                      <ThemedText style={styles.checkmark}>✓</ThemedText>
                    )}
                  </View>
                  <ThemedText style={styles.selectAllText}>全选</ThemedText>
                </Pressable>
                <ThemedText style={styles.selectionStats}>
                  已选 {selectedCount} 个，共 {totalSelectedQuantity} 件
                </ThemedText>
              </View>

              {/* 产品列表 */}
              {searchResults.map((product) => (
                <View key={product.id} style={styles.productCard}>
                  <Pressable
                    style={styles.productCheckbox}
                    onPress={() => toggleProductSelection(product.id)}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        product.isSelected && styles.checkboxChecked,
                      ]}
                    >
                      {product.isSelected && (
                        <ThemedText style={styles.checkmark}>✓</ThemedText>
                      )}
                    </View>
                  </Pressable>

                  <Image
                    source={{ uri: product.detailImageUri }}
                    style={styles.productImage}
                  />

                  <View style={styles.productInfo}>
                    <ThemedText style={styles.productSku}>{product.sku}</ThemedText>
                    <ThemedText style={styles.productLocation}>
                      📍 {product.storageLocation}
                    </ThemedText>
                    <ThemedText style={styles.productStock}>
                      库存: {product.quantity}
                    </ThemedText>
                  </View>

                  {/* 数量调整 */}
                  <View style={styles.quantityControl}>
                    <Pressable
                      style={styles.quantityButton}
                      onPress={() =>
                        updateQuantity(product.id, product.selectedQuantity - 1)
                      }
                    >
                      <ThemedText style={styles.quantityButtonText}>-</ThemedText>
                    </Pressable>
                    <TextInput
                      style={[styles.quantityInput, { backgroundColor: inputBg, color: inputColor }]}
                      value={product.selectedQuantity.toString()}
                      onChangeText={(text) => {
                        const num = parseInt(text) || 0;
                        updateQuantity(product.id, num);
                      }}
                      keyboardType="number-pad"
                    />
                    <Pressable
                      style={styles.quantityButton}
                      onPress={() =>
                        updateQuantity(product.id, product.selectedQuantity + 1)
                      }
                    >
                      <ThemedText style={styles.quantityButtonText}>+</ThemedText>
                    </Pressable>
                  </View>
                </View>
              ))}

              {/* 出库信息 */}
              <View style={styles.outboundInfoSection}>
                <ThemedText style={styles.sectionTitle}>出库信息</ThemedText>

                <View style={styles.infoRow}>
                  <ThemedText style={styles.infoLabel}>出库原因:</ThemedText>
                  <TextInput
                    style={[styles.infoInput, { backgroundColor: inputBg, color: inputColor }]}
                    value={reason}
                    onChangeText={setReason}
                    placeholder="销售"
                    placeholderTextColor={placeholderColor}
                  />
                </View>

                <View style={styles.infoRow}>
                  <ThemedText style={styles.infoLabel}>目的地:</ThemedText>
                  <TextInput
                    style={[styles.infoInput, { backgroundColor: inputBg, color: inputColor }]}
                    value={destination}
                    onChangeText={setDestination}
                    placeholder="发货仓"
                    placeholderTextColor={placeholderColor}
                  />
                </View>
              </View>

              {/* 出库按钮 */}
              <Pressable
                style={[
                  styles.outboundButton,
                  (selectedCount === 0 || processing) && styles.buttonDisabled,
                ]}
                onPress={handleOutboundClick}
                disabled={selectedCount === 0 || processing}
              >
                <ThemedText style={styles.outboundButtonText}>
                  {processing ? "处理中..." : `📦 确认出库 (${selectedCount} 个产品)`}
                </ThemedText>
              </Pressable>
            </>
          )}
        </ScrollView>
      ) : (
        // 出库记录视图
        <View style={styles.historyContainer}>
          {loadingHistory ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" />
            </View>
          ) : outboundHistory.length === 0 ? (
            <View style={styles.emptyContainer}>
              <ThemedText style={styles.emptyText}>暂无出库记录</ThemedText>
            </View>
          ) : (
            <FlatList
              data={outboundHistory}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <View style={styles.historyCard}>
                  <View style={styles.historyHeader}>
                    <ThemedText style={styles.historyTime}>
                      {formatTime(item.timestamp)}
                    </ThemedText>
                    <ThemedText style={styles.historyOperator}>
                      {item.operatorName}
                    </ThemedText>
                  </View>

                  <View style={styles.historyInfo}>
                    <ThemedText style={styles.historyReason}>
                      原因: {item.reason}
                    </ThemedText>
                    <ThemedText style={styles.historyDestination}>
                      目的地: {item.destination}
                    </ThemedText>
                  </View>

                  <View style={styles.historyItems}>
                    {item.items.map((outItem, index) => (
                      <View key={index} style={styles.historyItem}>
                        <Image
                          source={{ uri: outItem.detailImageUri }}
                          style={styles.historyItemImage}
                        />
                        <View style={styles.historyItemInfo}>
                          <ThemedText style={styles.historyItemSku}>
                            {outItem.sku}
                          </ThemedText>
                          <ThemedText style={styles.historyItemQuantity}>
                            -{outItem.quantity} 件
                          </ThemedText>
                        </View>
                      </View>
                    ))}
                  </View>

                  <ThemedText style={styles.historyTotal}>
                    共 {item.items.length} 个产品，
                    {item.items.reduce((sum, i) => sum + i.quantity, 0)} 件
                  </ThemedText>
                </View>
              )}
              contentContainerStyle={{ paddingBottom: 100 }}
            />
          )}
        </View>
      )}
      {/* 自定义确认弹窗 */}
      <Modal
        visible={showConfirmModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowConfirmModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colorScheme === 'dark' ? '#333' : '#fff' }]}>
            <ThemedText style={styles.modalTitle}>确认出库</ThemedText>
            <ThemedText style={styles.modalMessage}>
              确定要出库 {selectedCount} 个产品吗？{"\n"}
              原因: {reason}{"\n"}
              目的地: {destination}
            </ThemedText>
            <View style={styles.modalButtons}>
              <Pressable
                style={[styles.modalButton, styles.modalCancelButton]}
                onPress={() => setShowConfirmModal(false)}
              >
                <ThemedText style={styles.modalCancelText}>取消</ThemedText>
              </Pressable>
              <Pressable
                style={[styles.modalButton, styles.modalConfirmButton]}
                onPress={handleConfirmOutbound}
              >
                <ThemedText style={styles.modalConfirmText}>确认出库</ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 16,
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "rgba(0, 0, 0, 0.05)",
    borderRadius: 8,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 6,
  },
  tabActive: {
    backgroundColor: "#007AFF",
  },
  tabText: {
    fontSize: 14,
    fontWeight: "500",
  },
  tabTextActive: {
    color: "#fff",
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 100,
  },
  searchSection: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  searchButton: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 16,
    borderRadius: 8,
    justifyContent: "center",
  },
  searchButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  selectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0, 0, 0, 0.1)",
  },
  selectAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#007AFF",
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxChecked: {
    backgroundColor: "#007AFF",
  },
  checkmark: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
  },
  selectAllText: {
    fontSize: 16,
    fontWeight: "500",
  },
  selectionStats: {
    fontSize: 14,
    opacity: 0.7,
  },
  productCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.03)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    gap: 12,
  },
  productCheckbox: {
    padding: 4,
  },
  productImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
  },
  productInfo: {
    flex: 1,
  },
  productSku: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  productLocation: {
    fontSize: 13,
    opacity: 0.7,
    marginBottom: 2,
  },
  productStock: {
    fontSize: 13,
    opacity: 0.7,
  },
  quantityControl: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  quantityButton: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: "#007AFF",
    justifyContent: "center",
    alignItems: "center",
  },
  quantityButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  quantityInput: {
    width: 50,
    height: 32,
    borderRadius: 6,
    textAlign: "center",
    fontSize: 16,
  },
  outboundInfoSection: {
    marginTop: 16,
    padding: 16,
    backgroundColor: "rgba(0, 0, 0, 0.03)",
    borderRadius: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  infoLabel: {
    width: 80,
    fontSize: 14,
  },
  infoInput: {
    flex: 1,
    height: 40,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  outboundButton: {
    backgroundColor: "#FF3B30",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 24,
  },
  outboundButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  historyContainer: {
    flex: 1,
    paddingHorizontal: 16,
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
  },
  emptyText: {
    fontSize: 16,
    opacity: 0.5,
  },
  historyCard: {
    backgroundColor: "rgba(0, 0, 0, 0.03)",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  historyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  historyTime: {
    fontSize: 14,
    fontWeight: "600",
  },
  historyOperator: {
    fontSize: 14,
    opacity: 0.7,
  },
  historyInfo: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 12,
  },
  historyReason: {
    fontSize: 13,
    opacity: 0.7,
  },
  historyDestination: {
    fontSize: 13,
    opacity: 0.7,
  },
  historyItems: {
    gap: 8,
    marginBottom: 8,
  },
  historyItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  historyItemImage: {
    width: 40,
    height: 40,
    borderRadius: 6,
  },
  historyItemInfo: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  historyItemSku: {
    fontSize: 14,
  },
  historyItemQuantity: {
    fontSize: 14,
    color: "#FF3B30",
    fontWeight: "600",
  },
  historyTotal: {
    fontSize: 13,
    opacity: 0.7,
    textAlign: "right",
  },
  // 确认弹窗样式
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "85%",
    maxWidth: 400,
    borderRadius: 16,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 16,
  },
  modalMessage: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 24,
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  modalCancelButton: {
    backgroundColor: "rgba(0, 0, 0, 0.1)",
  },
  modalConfirmButton: {
    backgroundColor: "#FF3B30",
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: "600",
  },
  modalConfirmText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  // 标签导出相关样式
  batchHint: {
    backgroundColor: "rgba(0, 122, 255, 0.1)",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  batchHintText: {
    fontSize: 14,
    color: "#007AFF",
    textAlign: "center",
  },
  batchGroup: {
    marginBottom: 16,
  },
  batchHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  batchTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  batchCount: {
    fontSize: 12,
    opacity: 0.7,
  },
  labelItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: "rgba(0, 0, 0, 0.03)",
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 4,
  },
  labelItemSelected: {
    backgroundColor: "rgba(0, 122, 255, 0.1)",
  },
  labelItemInfo: {
    flex: 1,
    marginLeft: 12,
  },
  labelItemSku: {
    fontSize: 16,
    fontWeight: "600",
    fontFamily: "monospace",
  },
  labelItemUserSku: {
    fontSize: 14,
    opacity: 0.7,
    marginTop: 2,
  },
  labelItemMeta: {
    fontSize: 12,
    opacity: 0.5,
    marginTop: 4,
  },
  exportButton: {
    backgroundColor: "#34C759",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 16,
  },
  exportButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  exportHint: {
    fontSize: 12,
    opacity: 0.5,
    textAlign: "center",
    marginTop: 12,
    marginBottom: 24,
  },
});
