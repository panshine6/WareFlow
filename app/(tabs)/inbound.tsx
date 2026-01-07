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
import { Alert } from "@/lib/alert";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { CloudImage } from "@/components/cloud-image";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { ProductStorage } from "@/lib/storage";
import { trpc } from "@/lib/trpc";
import { SyncService } from "@/lib/sync";
import type { Product, InventoryHistoryEntry } from "@/types/product";
import { 
  getRecentInboundProducts, 
  groupByBatch, 
  exportLabelsToExcel,
  formatLabelTime,
  formatBatchTimeRange,
  type LabelItem,
  type BatchGroup,
} from "@/lib/excel-export";

// 视图模式
type ViewMode = "add" | "history" | "labels";

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

  // 标签导出相关
  const [labelItems, setLabelItems] = useState<LabelItem[]>([]);
  const [batchGroups, setBatchGroups] = useState<BatchGroup[]>([]);
  const [selectedLabelIds, setSelectedLabelIds] = useState<Set<string>>(new Set());
  const [loadingLabels, setLoadingLabels] = useState(false);

  // 同步相关
  const [refreshing, setRefreshing] = useState(false);
  const uploadMutation = trpc.sync.upload.useMutation();
  const uploadSettingsMutation = trpc.sync.uploadSettings.useMutation();
  const downloadQuery = trpc.sync.download.useQuery(undefined, { enabled: false });
  const downloadWithoutImagesQuery = trpc.sync.downloadWithoutImages.useQuery(undefined, { enabled: false });
  const downloadSettingsQuery = trpc.sync.downloadSettings.useQuery(undefined, { enabled: false });
  
  // 检测是否为移动端（手机）
  const isMobile = Platform.OS !== 'web' || (Platform.OS === 'web' && typeof window !== 'undefined' && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(window.navigator?.userAgent || ''));

  // 页面获得焦点时加载入库历史或标签数据
  useFocusEffect(
    useCallback(() => {
      if (viewMode === "history") {
        loadInboundHistory();
      } else if (viewMode === "labels") {
        loadLabelItems();
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
      console.error("[Inbound] Failed to load label items:", error);
    } finally {
      setLoadingLabels(false);
    }
  };

  // 同步按钮点击处理
  // 手机端：上传数据到云端
  // 电脑端：从云端下载数据
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (isMobile) {
        // 手机端：上传数据到云端
        const trpcClient = {
          sync: {
            upload: {
              mutate: async (data: any) => {
                return uploadMutation.mutateAsync(data);
              },
            },
            uploadSettings: {
              mutate: async (data: any) => {
                return uploadSettingsMutation.mutateAsync(data);
              },
            },
          },
        };
        const result = await SyncService.uploadToCloud(trpcClient);
        if (result.success) {
          const activeCount = result.activeCount || result.count;
          let msg: string;
          if (result.count === 0) {
            msg = `本地数据无变化，无需同步\n共 ${activeCount} 个产品`;
          } else {
            msg = `已同步 ${activeCount} 个产品和设置到云端`;
          }
          Alert.alert("上传成功", msg);
        } else {
          Alert.alert("上传失败", result.error || "未知错误");
        }
      } else {
        // 电脑端：从云端下载数据，显示选项对话框
        setRefreshing(false); // 先停止加载状态，等待用户选择
        
        Alert.alert(
          "从云端下载",
          "请选择下载方式：\n\n• 完整下载：覆盖本地所有数据（包括图片）\n• 仅同步设置：保留本地图片，只同步设置和Box数据",
          [
            {
              text: "取消",
              style: "cancel",
            },
            {
              text: "仅同步设置",
              onPress: async () => {
                setRefreshing(true);
                try {
                  const trpcClient = {
                    sync: {
                      download: {
                        query: async () => (await downloadQuery.refetch()).data,
                      },
                      downloadSettings: {
                        query: async () => (await downloadSettingsQuery.refetch()).data,
                      },
                    },
                  };
                  const result = await SyncService.downloadSettingsAndBoxesOnly(trpcClient);
                  if (result.success) {
                    Alert.alert("同步成功", "已同步设置和Box数据，本地图片已保留");
                  } else {
                    Alert.alert("同步失败", result.error || "未知错误");
                  }
                } catch (error: any) {
                  Alert.alert("同步失败", error.message || "网络错误");
                } finally {
                  setRefreshing(false);
                  if (viewMode === "history") {
                    await loadInboundHistory();
                  }
                }
              },
            },
            {
              text: "完整下载",
              style: "destructive",
              onPress: async () => {
                setRefreshing(true);
                try {
                  const trpcClient = {
                    sync: {
                      download: {
                        query: async () => (await downloadQuery.refetch()).data,
                      },
                      downloadWithoutImages: {
                        query: async () => (await downloadWithoutImagesQuery.refetch()).data,
                      },
                      downloadSettings: {
                        query: async () => (await downloadSettingsQuery.refetch()).data,
                      },
                    },
                  };
                  const result = await SyncService.downloadFromCloud(trpcClient);
                  if (result.success) {
                    Alert.alert("下载成功", `已从云端下载 ${result.count} 个产品和设置`);
                  } else {
                    Alert.alert("下载失败", result.error || "未知错误");
                  }
                } catch (error: any) {
                  Alert.alert("下载失败", error.message || "网络错误");
                } finally {
                  setRefreshing(false);
                  if (viewMode === "history") {
                    await loadInboundHistory();
                  }
                }
              },
            },
          ]
        );
        return; // 提前返回，等待用户选择
      }
      // 同步后重新加载入库历史
      if (viewMode === "history") {
        await loadInboundHistory();
      }
    } catch (error: any) {
      console.error("[Inbound] Sync failed:", error);
      Alert.alert("同步失败", error.message || "请检查网络连接后重试");
    } finally {
      setRefreshing(false);
    }
  }, [viewMode, uploadMutation, downloadQuery, isMobile]);

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
                🏷️ 批量打印
              </ThemedText>
            </Pressable>
          )}
        </View>
      </View>

      {viewMode === "labels" ? (
        // 批量打印标签视图
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
                          item.exported && styles.labelItemExported,
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
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <ThemedText style={styles.labelItemSku}>
                              {item.systemSku}
                            </ThemedText>
                            {item.exported && (
                              <View style={styles.exportedBadge}>
                                <ThemedText style={styles.exportedBadgeText}>已导出</ThemedText>
                              </View>
                            )}
                          </View>
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
                onPress={async () => {
                  const selectedItems = labelItems.filter(item => 
                    selectedLabelIds.has(`${item.id}-${item.inboundTime}`)
                  );
                  try {
                    await exportLabelsToExcel(selectedItems);
                    Alert.alert("导出成功", `已导出 ${selectedItems.length} 个商品的标签数据，请在 NIIMBOT APP 中导入打印`);
                    // 导出后刷新列表，更新已导出标记
                    await loadLabelItems();
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
      ) : viewMode === "add" ? (
        // 入库操作视图
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
        >
          {/* 添加产品按钮 */}
          <Pressable
            style={({ pressed }) => [
              styles.addButton,
              { opacity: pressed ? 0.8 : 1 },
            ]}
            onPress={() => router.push("/add-product-quick" as any)}
          >
            <ThemedText style={styles.addButtonTextSimple}>添加新产品</ThemedText>
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


        </ScrollView>
      ) : (
        // 入库记录视图
        <View style={styles.historyContainer}>
          {/* 同步按钮 */}
          <Pressable
            style={({ pressed }) => [
              styles.syncButton,
              { opacity: pressed ? 0.7 : 1 },
              refreshing && styles.syncButtonDisabled,
            ]}
            onPress={onRefresh}
            disabled={refreshing}
          >
            {refreshing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <ThemedText style={styles.syncButtonText}>
                {isMobile ? '☁️ 同步到云端' : '☁️ 从云端下载'}
              </ThemedText>
            )}
          </Pressable>

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
                  onPress={() => router.push({ pathname: "/product-detail" as any, params: { id: item.product.id, from: 'inbound' } })}
                >
                  <CloudImage
                    productId={item.product.id}
                    localUri={item.entry.detailImageUri || item.product.detailImageUri}
                    style={styles.historyImage}
                    imageType="detail"
                  />
                  <View style={styles.historyInfo}>
                    <ThemedText style={styles.historySku}>{item.product.sku}</ThemedText>
                    <ThemedText style={styles.historyLocation}>
                      📦 {item.product.boxName || 'No Box'}
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
    backgroundColor: "#007AFF",  // 天蓝色，与入库操作按钮一致
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    marginBottom: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  addButtonTextSimple: {
    color: "#fff",  // 白色文字，与天蓝色背景协调
    fontSize: 18,   // 参考入库流程标题的字号
    fontWeight: "700",  // 参考入库流程标题的字重
    textAlign: "center",
  },
  // 保留旧样式以防止其他地方引用
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
  // 批量打印标签相关样式
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
  labelItemExported: {
    opacity: 0.6,
  },
  exportedBadge: {
    backgroundColor: "#8E8E93",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  exportedBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "600",
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
  syncButton: {
    backgroundColor: "#007AFF",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    minHeight: 44,
  },
  syncButtonDisabled: {
    backgroundColor: "#999",
  },
  syncButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
