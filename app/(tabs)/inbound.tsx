import { useRouter, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { ProductStorage } from "@/lib/storage";
import type { Product, InventoryHistoryEntry } from "@/types/product";

// 视图模式
type ViewMode = "add" | "history";

/**
 * 入库管理页面
 */
export default function InboundScreen() {
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // 视图模式
  const [viewMode, setViewMode] = useState<ViewMode>("add");

  // 入库历史
  const [inboundHistory, setInboundHistory] = useState<{
    product: Product;
    entry: InventoryHistoryEntry;
  }[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // 页面获得焦点时加载入库历史
  useFocusEffect(
    useCallback(() => {
      if (viewMode === "history") {
        loadInboundHistory();
      }
    }, [viewMode])
  );

  // 加载入库历史
  const loadInboundHistory = async () => {
    setLoadingHistory(true);
    try {
      const products = await ProductStorage.getActive();
      
      // 收集所有入库记录
      const allInboundRecords: {
        product: Product;
        entry: InventoryHistoryEntry;
      }[] = [];

      for (const product of products) {
        // 添加初始入库记录（产品创建时）
        allInboundRecords.push({
          product,
          entry: {
            id: `${product.id}-initial`,
            timestamp: product.createdAt,
            operatorId: product.operatorId || 1,
            operatorName: product.operatorName || "未知",
            quantity: product.initialQuantity || product.quantity,
            location: product.storageLocation,
            detailImageUri: product.detailImageUri,
            overviewImageUri: product.overviewImageUri || "",
            type: "inbound",
          },
        });

        // 添加历史记录中的入库记录
        if (product.history) {
          for (const entry of product.history) {
            if (entry.type === "inbound" && entry.quantity > 0) {
              allInboundRecords.push({
                product,
                entry,
              });
            }
          }
        }
      }

      // 按时间倒序排列
      allInboundRecords.sort(
        (a, b) => new Date(b.entry.timestamp).getTime() - new Date(a.entry.timestamp).getTime()
      );

      setInboundHistory(allInboundRecords);
    } catch (error) {
      console.error("[Inbound] Failed to load history:", error);
    } finally {
      setLoadingHistory(false);
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
          入库管理
        </ThemedText>

        {/* 视图切换 */}
        <View style={styles.tabContainer}>
          <Pressable
            style={[styles.tab, viewMode === "add" && styles.tabActive]}
            onPress={() => setViewMode("add")}
          >
            <ThemedText
              style={[styles.tabText, viewMode === "add" && styles.tabTextActive]}
            >
              入库操作
            </ThemedText>
          </Pressable>
          <Pressable
            style={[styles.tab, viewMode === "history" && styles.tabActive]}
            onPress={() => {
              setViewMode("history");
              loadInboundHistory();
            }}
          >
            <ThemedText
              style={[styles.tabText, viewMode === "history" && styles.tabTextActive]}
            >
              入库记录
            </ThemedText>
          </Pressable>
        </View>
      </View>

      {viewMode === "add" ? (
        // 入库操作视图
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
        >
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
              <ThemedText style={styles.addButtonIcon}>📦</ThemedText>
              <View style={styles.addButtonTextContainer}>
                <ThemedText style={styles.addButtonText}>添加新产品</ThemedText>
                <ThemedText style={styles.addButtonHint}>拍照 → 填写信息 → 保存</ThemedText>
              </View>
            </View>
          </Pressable>

          {/* 入库流程说明 */}
          <View style={styles.guideSection}>
            <ThemedText style={styles.guideTitle}>入库流程</ThemedText>
            
            <View style={styles.guideStep}>
              <View style={styles.guideStepNumber}>
                <ThemedText style={styles.guideStepNumberText}>1</ThemedText>
              </View>
              <View style={styles.guideStepContent}>
                <ThemedText style={styles.guideStepTitle}>拍摄细节图</ThemedText>
                <ThemedText style={styles.guideStepDesc}>拍摄产品的细节照片，用于查重和展示</ThemedText>
              </View>
            </View>

            <View style={styles.guideStep}>
              <View style={styles.guideStepNumber}>
                <ThemedText style={styles.guideStepNumberText}>2</ThemedText>
              </View>
              <View style={styles.guideStepContent}>
                <ThemedText style={styles.guideStepTitle}>拍摄全景图</ThemedText>
                <ThemedText style={styles.guideStepDesc}>拍摄产品全景，AI 自动计数</ThemedText>
              </View>
            </View>

            <View style={styles.guideStep}>
              <View style={styles.guideStepNumber}>
                <ThemedText style={styles.guideStepNumberText}>3</ThemedText>
              </View>
              <View style={styles.guideStepContent}>
                <ThemedText style={styles.guideStepTitle}>填写信息</ThemedText>
                <ThemedText style={styles.guideStepDesc}>确认 SKU、数量、价格、位置</ThemedText>
              </View>
            </View>

            <View style={styles.guideStep}>
              <View style={styles.guideStepNumber}>
                <ThemedText style={styles.guideStepNumberText}>4</ThemedText>
              </View>
              <View style={styles.guideStepContent}>
                <ThemedText style={styles.guideStepTitle}>保存并打印</ThemedText>
                <ThemedText style={styles.guideStepDesc}>保存产品信息，可选打印条形码标签</ThemedText>
              </View>
            </View>
          </View>

          {/* 功能特点 */}
          <View style={styles.featuresSection}>
            <ThemedText style={styles.featuresTitle}>智能功能</ThemedText>
            
            <View style={styles.featureItem}>
              <ThemedText style={styles.featureIcon}>🔍</ThemedText>
              <View style={styles.featureContent}>
                <ThemedText style={styles.featureTitle}>AI 图像查重</ThemedText>
                <ThemedText style={styles.featureDesc}>自动检测重复产品，避免重复录入</ThemedText>
              </View>
            </View>

            <View style={styles.featureItem}>
              <ThemedText style={styles.featureIcon}>🔢</ThemedText>
              <View style={styles.featureContent}>
                <ThemedText style={styles.featureTitle}>AI 自动计数</ThemedText>
                <ThemedText style={styles.featureDesc}>智能识别图片中的产品数量</ThemedText>
              </View>
            </View>

            <View style={styles.featureItem}>
              <ThemedText style={styles.featureIcon}>🏷️</ThemedText>
              <View style={styles.featureContent}>
                <ThemedText style={styles.featureTitle}>条形码生成</ThemedText>
                <ThemedText style={styles.featureDesc}>自动生成条形码，支持打印标签</ThemedText>
              </View>
            </View>
          </View>
        </ScrollView>
      ) : (
        // 入库记录视图
        <View style={styles.historyContainer}>
          {loadingHistory ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" />
            </View>
          ) : inboundHistory.length === 0 ? (
            <View style={styles.emptyContainer}>
              <ThemedText style={styles.emptyText}>暂无入库记录</ThemedText>
            </View>
          ) : (
            <FlatList
              data={inboundHistory}
              keyExtractor={(item, index) => `${item.product.id}-${item.entry.id}-${index}`}
              renderItem={({ item }) => (
                <Pressable
                  style={({ pressed }) => [
                    styles.historyCard,
                    { opacity: pressed ? 0.7 : 1 },
                  ]}
                  onPress={() => router.push({ pathname: "/product-detail" as any, params: { id: item.product.id } })}
                >
                  <Image
                    source={{ uri: item.entry.detailImageUri || item.product.detailImageUri }}
                    style={styles.historyImage}
                  />
                  <View style={styles.historyInfo}>
                    <ThemedText style={styles.historySku}>{item.product.sku}</ThemedText>
                    <ThemedText style={styles.historyLocation}>
                      📍 {item.entry.location || item.product.storageLocation}
                    </ThemedText>
                    <ThemedText style={styles.historyTime}>
                      {formatTime(item.entry.timestamp)}
                    </ThemedText>
                  </View>
                  <View style={styles.historyQuantity}>
                    <ThemedText style={styles.historyQuantityText}>
                      +{item.entry.quantity}
                    </ThemedText>
                    <ThemedText style={styles.historyOperator}>
                      {item.entry.operatorName}
                    </ThemedText>
                  </View>
                </Pressable>
              )}
              contentContainerStyle={styles.historyListContent}
            />
          )}
        </View>
      )}
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
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  tabActive: {
    backgroundColor: "#007AFF",
  },
  tabText: {
    fontSize: 15,
    fontWeight: "600",
    opacity: 0.7,
  },
  tabTextActive: {
    color: "#fff",
    opacity: 1,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  addButton: {
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    marginBottom: 24,
  },
  addButtonContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  addButtonIcon: {
    fontSize: 40,
    marginRight: 16,
  },
  addButtonTextContainer: {
    flex: 1,
  },
  addButtonText: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "700",
  },
  addButtonHint: {
    color: "rgba(255, 255, 255, 0.8)",
    fontSize: 14,
    marginTop: 4,
  },
  guideSection: {
    backgroundColor: "rgba(0, 0, 0, 0.03)",
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  guideTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 16,
  },
  guideStep: {
    flexDirection: "row",
    marginBottom: 16,
  },
  guideStepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#007AFF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  guideStepNumberText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  guideStepContent: {
    flex: 1,
  },
  guideStepTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },
  guideStepDesc: {
    fontSize: 13,
    opacity: 0.6,
  },
  featuresSection: {
    backgroundColor: "rgba(52, 199, 89, 0.1)",
    borderRadius: 16,
    padding: 20,
  },
  featuresTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 16,
    color: "#34C759",
  },
  featureItem: {
    flexDirection: "row",
    marginBottom: 16,
  },
  featureIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 2,
  },
  featureDesc: {
    fontSize: 13,
    opacity: 0.6,
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
  historyListContent: {
    paddingBottom: 16,
  },
  historyCard: {
    flexDirection: "row",
    backgroundColor: "rgba(0, 0, 0, 0.03)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    alignItems: "center",
  },
  historyImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
  },
  historyInfo: {
    flex: 1,
    marginLeft: 12,
  },
  historySku: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  historyLocation: {
    fontSize: 13,
    opacity: 0.7,
    marginBottom: 2,
  },
  historyTime: {
    fontSize: 12,
    opacity: 0.5,
  },
  historyQuantity: {
    alignItems: "flex-end",
  },
  historyQuantityText: {
    fontSize: 20,
    fontWeight: "700",
    color: "#34C759",
  },
  historyOperator: {
    fontSize: 12,
    opacity: 0.5,
    marginTop: 4,
  },
});
