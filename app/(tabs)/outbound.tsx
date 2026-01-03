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
import { scanBarcodeFromImage, detectBarcodeType, lookupProductByBarcode } from "@/lib/barcode-scanner";
import { getBoxById } from "@/lib/box-storage";
import { compressImage, base64ToDataUrl } from "@/lib/image-utils";
import type { Product, OutboundRecord, OutboundItem, InventoryHistoryEntry } from "@/types/product";
import type { Box } from "@/types/box";


// 选中的产品项
interface SelectedProduct extends Product {
  selectedQuantity: number;
  isSelected: boolean;
}

// 视图模式
type ViewMode = "search" | "history";

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

  // 条形码扫描状态
  const [scanningBarcode, setScanningBarcode] = useState(false);
  const [showScanResult, setShowScanResult] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState<string | null>(null);
  const [scannedBox, setScannedBox] = useState<Box | null>(null);
  const [scannedProduct, setScannedProduct] = useState<Product | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

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

  // 页面获得焦点时加载出库历史
  useFocusEffect(
    useCallback(() => {
      if (viewMode === "history") {
        loadOutboundHistory();
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

  // 处理条形码扫描
  const handleBarcodeScan = async (event: Event) => {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    try {
      setScanningBarcode(true);

      // 读取文件为 base64
      const reader = new FileReader();
      const result = await new Promise<string>((resolve, reject) => {
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const originalBase64 = result.split(",")[1];

      // 压缩图片
      const compressedBase64 = await compressImage(originalBase64, 1024 * 1024, 0.8);

      // 调用条形码识别 API
      const scanResult = await scanBarcodeFromImage(compressedBase64);

      if (!scanResult.found || !scanResult.barcode) {
        Alert.alert("提示", "未在图片中检测到条形码，请确保图片清晰并包含条形码");
        return;
      }

      const barcode = scanResult.barcode;
      setScannedBarcode(barcode);

      // 检测条形码类型
      const barcodeType = detectBarcodeType(barcode);

      if (barcodeType === "box") {
        // Box 条形码，查找 Box 信息
        const box = await getBoxById(barcode);
        if (box) {
          setScannedBox(box);
          setScannedProduct(null);
          setShowScanResult(true);
        } else {
          Alert.alert("提示", `未找到 Box: ${barcode}`);
        }
      } else {
        // 产品条形码，查找产品信息
        const product = await lookupProductByBarcode(barcode);
        if (product) {
          setScannedProduct(product);
          setScannedBox(null);
          setShowScanResult(true);
        } else {
          Alert.alert("提示", `未找到产品: ${barcode}`);
        }
      }
    } catch (error) {
      console.error("[Outbound] Barcode scan failed:", error);
      Alert.alert("错误", "条形码识别失败，请重试");
    } finally {
      setScanningBarcode(false);
      // 清空文件输入
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // 确认扫描结果，添加到出库列表
  const handleConfirmScanResult = async () => {
    if (scannedBox) {
      // Box 出库：添加 Box 内所有产品
      const boxProducts: SelectedProduct[] = [];
      for (const item of scannedBox.items) {
        const product = await ProductStorage.getById(item.productId);
        if (product && product.quantity > 0) {
          boxProducts.push({
            ...product,
            selectedQuantity: Math.min(item.quantity, product.quantity),
            isSelected: true,
          });
        }
      }

      if (boxProducts.length > 0) {
        // 合并到现有搜索结果
        setSearchResults((prev) => {
          const existingIds = new Set(prev.map((p) => p.id));
          const newProducts = boxProducts.filter((p) => !existingIds.has(p.id));
          return [...prev, ...newProducts];
        });
        Alert.alert("成功", `已添加 Box "${scannedBox.name}" 内的 ${boxProducts.length} 个产品到出库列表`);
      } else {
        Alert.alert("提示", "Box 内没有可出库的产品");
      }
    } else if (scannedProduct) {
      // 单品出库：添加单个产品
      const existingIndex = searchResults.findIndex((p) => p.id === scannedProduct.id);
      if (existingIndex >= 0) {
        // 已存在，选中它
        setSearchResults((prev) =>
          prev.map((p, i) =>
            i === existingIndex ? { ...p, isSelected: true } : p
          )
        );
      } else {
        // 不存在，添加到列表
        setSearchResults((prev) => [
          ...prev,
          {
            ...scannedProduct,
            selectedQuantity: scannedProduct.quantity,
            isSelected: true,
          },
        ]);
      }
      Alert.alert("成功", `已添加产品 "${scannedProduct.sku}" 到出库列表`);
    }

    setShowScanResult(false);
    setScannedBarcode(null);
    setScannedBox(null);
    setScannedProduct(null);
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

        </View>
      </View>

      {viewMode === "search" ? (
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

          {/* 条形码扫描按钮 */}
          <Pressable
            style={[styles.scanButton, scanningBarcode && styles.buttonDisabled]}
            onPress={() => fileInputRef.current?.click()}
            disabled={scanningBarcode}
          >
            <ThemedText style={styles.scanButtonText}>
              {scanningBarcode ? "📷 扫描中..." : "📷 扫描条形码出库"}
            </ThemedText>
            <ThemedText style={styles.scanButtonHint}>
              支持单品条形码或 Box 条形码
            </ThemedText>
          </Pressable>

          {/* 隐藏的文件输入 */}
          {Platform.OS === "web" && (
            <input
              ref={fileInputRef as any}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: "none" }}
              onChange={(e) => handleBarcodeScan(e as any)}
            />
          )}

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

      {/* 条形码扫描结果弹窗 */}
      <Modal
        visible={showScanResult}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowScanResult(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colorScheme === 'dark' ? '#333' : '#fff' }]}>
            <ThemedText style={styles.modalTitle}>📷 条形码识别结果</ThemedText>
            
            <View style={styles.scanResultContainer}>
              <View style={styles.scanResultHeader}>
                <ThemedText style={styles.scanResultLabel}>识别到的条形码：</ThemedText>
                <ThemedText style={styles.scanResultValue}>{scannedBarcode}</ThemedText>
              </View>

              {scannedBox ? (
                <View style={styles.scanResultInfo}>
                  <ThemedText style={styles.scanResultTitle}>📦 Box 信息</ThemedText>
                  <View style={styles.boxInfoCard}>
                    <ThemedText style={styles.boxName}>{scannedBox.name}</ThemedText>
                    <ThemedText style={styles.boxLocation}>位置：{scannedBox.location}</ThemedText>
                    <ThemedText style={styles.boxItemCount}>包含 {scannedBox.items.length} 个产品</ThemedText>
                    <ThemedText style={styles.boxStatus}>状态：{scannedBox.status === 'open' ? '开放中' : '已封箱'}</ThemedText>
                  </View>
                  <ThemedText style={styles.scanResultHint}>
                    点击确认将添加 Box 内所有产品到出库列表
                  </ThemedText>
                </View>
              ) : scannedProduct ? (
                <View style={styles.scanResultInfo}>
                  <ThemedText style={styles.scanResultTitle}>🎁 产品信息</ThemedText>
                  <View style={styles.productInfoCard}>
                    {scannedProduct.detailImageUri && (
                      <Image 
                        source={{ uri: scannedProduct.detailImageUri }} 
                        style={styles.productInfoImage} 
                      />
                    )}
                    <View style={styles.productInfoDetails}>
                      <ThemedText style={styles.productInfoSku}>{scannedProduct.sku}</ThemedText>
                      <ThemedText style={styles.productInfoQuantity}>当前库存：{scannedProduct.quantity}</ThemedText>
                      <ThemedText style={styles.productInfoLocation}>位置：{scannedProduct.storageLocation || '未设置'}</ThemedText>
                    </View>
                  </View>
                  <ThemedText style={styles.scanResultHint}>
                    点击确认将添加此产品到出库列表
                  </ThemedText>
                </View>
              ) : null}
            </View>

            <View style={styles.modalButtons}>
              <Pressable
                style={[styles.modalButton, styles.modalCancelButton]}
                onPress={() => {
                  setShowScanResult(false);
                  setScannedBarcode(null);
                  setScannedBox(null);
                  setScannedProduct(null);
                }}
              >
                <ThemedText style={styles.modalCancelText}>取消</ThemedText>
              </Pressable>
              <Pressable
                style={[styles.modalButton, styles.modalConfirmButton]}
                onPress={handleConfirmScanResult}
              >
                <ThemedText style={styles.modalConfirmText}>确认添加</ThemedText>
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

  // 条形码扫描按钮样式
  scanButton: {
    backgroundColor: "rgba(52, 199, 89, 0.15)",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 2,
    borderColor: "#34C759",
    borderStyle: "dashed",
  },
  scanButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#34C759",
    marginBottom: 4,
  },
  scanButtonHint: {
    fontSize: 12,
    color: "#666",
  },

  // 条形码扫描结果弹窗样式
  scanResultContainer: {
    marginBottom: 16,
  },
  scanResultHeader: {
    backgroundColor: "rgba(52, 199, 89, 0.1)",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  scanResultLabel: {
    fontSize: 13,
    color: "#666",
    marginBottom: 4,
  },
  scanResultValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#34C759",
    fontFamily: "monospace",
  },
  scanResultInfo: {
    marginBottom: 8,
  },
  scanResultTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
  },
  boxInfoCard: {
    backgroundColor: "rgba(0, 0, 0, 0.05)",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  boxName: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  boxLocation: {
    fontSize: 14,
    color: "#666",
    marginBottom: 2,
  },
  boxItemCount: {
    fontSize: 14,
    color: "#007AFF",
    marginBottom: 2,
  },
  boxStatus: {
    fontSize: 14,
    color: "#666",
  },
  productInfoCard: {
    flexDirection: "row",
    backgroundColor: "rgba(0, 0, 0, 0.05)",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  productInfoImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 12,
  },
  productInfoDetails: {
    flex: 1,
    justifyContent: "center",
  },
  productInfoSku: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 4,
  },
  productInfoQuantity: {
    fontSize: 13,
    color: "#666",
    marginBottom: 2,
  },
  productInfoLocation: {
    fontSize: 13,
    color: "#666",
  },
  scanResultHint: {
    fontSize: 13,
    color: "#666",
    textAlign: "center",
    fontStyle: "italic",
  },
});
