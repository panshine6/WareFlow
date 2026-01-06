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
  ScrollView,
  StyleSheet,
  TouchableWithoutFeedback,
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
import { OutboundStorage } from "@/lib/outbound-storage";
import { AutoSync } from "@/lib/auto-sync";
import { SyncService } from "@/lib/sync";
import { trpc } from "@/lib/trpc";
import { APP_VERSION, APP_BUILD, APP_AUTHOR } from "@/lib/version";
import { SkuGenerator } from "@/lib/sku-generator";
import SkuGeneratorModal from "@/components/SkuGeneratorModal";
import BoxManagerModal from "@/components/BoxManagerModal";
import { downloadLearningData, getLearningStats } from "@/lib/ai-learning-storage";
import { downloadLearningData as downloadSimilarityLearningData, getLearningStats as getSimilarityLearningStats } from "@/lib/similarity-learning-storage";
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
  const [showSkuGenerator, setShowSkuGenerator] = useState(false);
  const [showBoxManager, setShowBoxManager] = useState(false);

  // 使用 tRPC 同步
  const downloadQuery = trpc.sync.download.useQuery(undefined, {
    enabled: false, // 手动触发
  });
  const downloadWithoutImagesQuery = trpc.sync.downloadWithoutImages.useQuery(undefined, {
    enabled: false, // 手动触发
  });
  const uploadMutation = trpc.sync.upload.useMutation();
  
  // 上传状态
  const [uploading, setUploading] = useState(false);
  
  // 下载提示状态
  const [showDownloadPrompt, setShowDownloadPrompt] = useState(false);
  const [cloudProductCount, setCloudProductCount] = useState(0);
  const [downloading, setDownloading] = useState(false);

  // 出库统计数据
  const [outboundStats, setOutboundStats] = useState({
    totalOutboundQuantity: 0,
    outboundSkuCount: 0,
    todayOutboundQuantity: 0,
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

  // 加载出库统计数据
  const loadOutboundStats = async () => {
    try {
      const records = await OutboundStorage.getAll();
      
      // 计算总出库数量
      let totalQuantity = 0;
      const skuSet = new Set<string>();
      let todayQuantity = 0;
      const today = new Date().toDateString();
      
      for (const record of records) {
        for (const item of record.items) {
          totalQuantity += item.quantity;
          skuSet.add(item.sku);
          
          // 检查是否是今天的记录
          const recordDate = new Date(record.timestamp).toDateString();
          if (recordDate === today) {
            todayQuantity += item.quantity;
          }
        }
      }
      
      setOutboundStats({
        totalOutboundQuantity: totalQuantity,
        outboundSkuCount: skuSet.size,
        todayOutboundQuantity: todayQuantity,
      });
    } catch (error) {
      console.error("Failed to load outbound stats:", error);
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
      loadOutboundStats();
      checkAndPromptDownload();
    }, [])
  );

  // 进入页面时检查本地和云端数据状态
  const checkAndPromptDownload = async () => {
    try {
      // 获取本地数据
      const isWeb = Platform.OS === 'web';
      const localProducts = isWeb 
        ? await ProductStorage.getAll()
        : await ProductAPI.getAll();
      
      // 如果本地有数据，不需要提示
      if (localProducts.length > 0) {
        return;
      }
      
      // 本地无数据，检查云端是否有数据
      const trpcClient = {
        sync: {
          status: {
            query: async () => {
              // 使用 downloadQuery 来获取云端数据数量
              const result = await downloadQuery.refetch();
              return { cloudCount: result.data?.products?.length || 0 };
            },
          },
        },
      };
      
      const result = await downloadQuery.refetch();
      const cloudCount = result.data?.products?.length || 0;
      
      // 如果云端有数据，提示用户下载
      if (cloudCount > 0) {
        setCloudProductCount(cloudCount);
        setShowDownloadPrompt(true);
      }
    } catch (error) {
      console.log("检查云端数据失败", error);
    }
  };
  
  // 用户确认下载云端数据
  const handleConfirmDownload = async () => {
    setDownloading(true);
    try {
      const trpcClient = {
        sync: {
          download: {
            query: async () => {
              const result = await downloadQuery.refetch();
              return result.data;
            },
          },
        },
      };
      
      const result = await SyncService.downloadFromCloud(trpcClient);
      
      if (result.success) {
        await loadProducts();
        setShowDownloadPrompt(false);
        
        const msg = `已下载 ${result.count} 个产品到本地`;
        if (Platform.OS === 'web') {
          window.alert(`下载成功\n${msg}`);
        } else {
          Alert.alert("下载成功", msg);
        }
      } else {
        const errMsg = result.error || "未知错误";
        if (Platform.OS === 'web') {
          window.alert(`下载失败\n${errMsg}`);
        } else {
          Alert.alert("下载失败", errMsg);
        }
      }
    } catch (error: any) {
      const errMsg = error.message || "网络错误";
      if (Platform.OS === 'web') {
        window.alert(`下载失败\n${errMsg}`);
      } else {
        Alert.alert("下载失败", errMsg);
      }
    } finally {
      setDownloading(false);
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
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
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

        {/* 入库统计区 - 三个卡片 */}
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

        {/* 出库统计区 - 三个卡片 */}
        <View style={styles.statsContainer}>
          <View style={[styles.statCard, styles.outboundStatCard]}>
            <ThemedText type="subtitle" style={[styles.statNumber, styles.outboundStatNumber]}>
              {outboundStats.todayOutboundQuantity}
            </ThemedText>
            <ThemedText style={styles.statLabel}>今日出库</ThemedText>
          </View>

          <View style={[styles.statCard, styles.outboundStatCard]}>
            <ThemedText type="subtitle" style={[styles.statNumber, styles.outboundStatNumber]}>
              {outboundStats.totalOutboundQuantity}
            </ThemedText>
            <ThemedText style={styles.statLabel}>总出库数</ThemedText>
          </View>

          <View style={[styles.statCard, styles.outboundStatCard]}>
            <ThemedText type="subtitle" style={[styles.statNumber, styles.outboundStatNumber]}>
              {outboundStats.outboundSkuCount}
            </ThemedText>
            <ThemedText style={styles.statLabel}>出库SKU</ThemedText>
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

        {/* SKU 生成助手按钮 */}
        <Pressable
          style={({ pressed }) => [
            styles.skuGeneratorButton,
            { opacity: pressed ? 0.8 : 1 },
          ]}
          onPress={() => setShowSkuGenerator(true)}
        >
          <View style={styles.dataSecurityContent}>
            <ThemedText style={styles.skuGeneratorIcon}>🏷️</ThemedText>
            <View style={styles.dataSecurityTextContainer}>
              <ThemedText style={styles.skuGeneratorTitle}>SKU 生成助手</ThemedText>
              <ThemedText style={styles.dataSecurityHint}>元素化生成、序列管理、自动进位</ThemedText>
            </View>
            <ThemedText style={styles.dataSecurityArrow}>›</ThemedText>
          </View>
        </Pressable>

        {/* Box 管理器按钮 */}
        <Pressable
          style={({ pressed }) => [
            styles.skuGeneratorButton,
            { opacity: pressed ? 0.8 : 1 },
          ]}
          onPress={() => setShowBoxManager(true)}
        >
          <View style={styles.dataSecurityContent}>
            <ThemedText style={styles.skuGeneratorIcon}>📦</ThemedText>
            <View style={styles.dataSecurityTextContainer}>
              <ThemedText style={styles.skuGeneratorTitle}>Box 管理器</ThemedText>
              <ThemedText style={styles.dataSecurityHint}>创建、管理储物箱，关联货架位置</ThemedText>
            </View>
            <ThemedText style={styles.dataSecurityArrow}>›</ThemedText>
          </View>
        </Pressable>

        {/* 智能功能介绍 */}
        <View style={styles.smartFeaturesSection}>
          <ThemedText style={styles.smartFeaturesTitle}>智能功能</ThemedText>
          
          <View style={styles.smartFeatureItem}>
            <ThemedText style={styles.smartFeatureIcon}>🔍</ThemedText>
            <View style={styles.smartFeatureContent}>
              <ThemedText style={styles.smartFeatureTitle}>AI 图像查重</ThemedText>
              <ThemedText style={styles.smartFeatureDesc}>自动检测重复产品，避免重复录入</ThemedText>
            </View>
          </View>

          <View style={styles.smartFeatureItem}>
            <ThemedText style={styles.smartFeatureIcon}>🔢</ThemedText>
            <View style={styles.smartFeatureContent}>
              <ThemedText style={styles.smartFeatureTitle}>AI 自动计数</ThemedText>
              <ThemedText style={styles.smartFeatureDesc}>智能识别图片中的产品数量</ThemedText>
            </View>
          </View>

          <View style={styles.smartFeatureItem}>
            <ThemedText style={styles.smartFeatureIcon}>🏷️</ThemedText>
            <View style={styles.smartFeatureContent}>
              <ThemedText style={styles.smartFeatureTitle}>条形码生成</ThemedText>
              <ThemedText style={styles.smartFeatureDesc}>自动生成条形码，支持打印标签</ThemedText>
            </View>
          </View>

          <View style={styles.smartFeatureItem}>
            <ThemedText style={styles.smartFeatureIcon}>📊</ThemedText>
            <View style={styles.smartFeatureContent}>
              <ThemedText style={styles.smartFeatureTitle}>智能 SKU 管理</ThemedText>
              <ThemedText style={styles.smartFeatureDesc}>元素化生成、序列管理、自动进位</ThemedText>
            </View>
          </View>
        </View>
      </View>
      </ScrollView>

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
              style={styles.bottomSheetItem}
              onPress={async () => {
                try {
                  const stats = await getLearningStats();
                  if (stats.totalRecords === 0) {
                    if (Platform.OS === 'web') {
                      window.alert('暂无AI学习数据\n\n请先使用AI计数功能并确认数量，系统会自动收集学习数据');
                    } else {
                      Alert.alert('暂无AI学习数据', '请先使用AI计数功能并确认数量，系统会自动收集学习数据');
                    }
                    return;
                  }
                  
                  // 显示统计信息并确认导出
                  const confirmMsg = `AI计数学习数据统计\n\n总记录数: ${stats.totalRecords}\n正确数: ${stats.correctCount}\n错误数: ${stats.incorrectCount}\n准确率: ${stats.accuracy}%\n平均偏差: ${stats.avgDeviation}\n\n是否导出学习数据文件？`;
                  
                  if (Platform.OS === 'web') {
                    if (window.confirm(confirmMsg)) {
                      await downloadLearningData();
                      window.alert('导出成功\n\n文件已保存到下载文件夹');
                    }
                  } else {
                    Alert.alert('AI计数学习数据', confirmMsg, [
                      { text: '取消', style: 'cancel' },
                      { text: '导出', onPress: async () => {
                        await downloadLearningData();
                        Alert.alert('导出成功', '文件已保存到下载文件夹');
                      }}
                    ]);
                  }
                } catch (error) {
                  console.error('[Settings] Failed to export AI learning data:', error);
                  if (Platform.OS === 'web') {
                    window.alert('导出失败\n\n请稍后重试');
                  } else {
                    Alert.alert('导出失败', '请稍后重试');
                  }
                }
              }}
            >
              <ThemedText style={styles.bottomSheetItemIcon}>🧠</ThemedText>
              <ThemedText style={styles.bottomSheetItemText}>AI计数学习数据</ThemedText>
              <ThemedText style={styles.bottomSheetItemArrow}>›</ThemedText>
            </Pressable>

            {/* AI查重学习数据 */}
            <Pressable 
              style={styles.bottomSheetItem}
              onPress={async () => {
                try {
                  const stats = await getSimilarityLearningStats();
                  
                  if (stats.totalRecords === 0) {
                    if (Platform.OS === 'web') {
                      window.alert('暂无学习数据\n\n请先在查重结果中点击"反馈"按钮收集数据');
                    } else {
                      Alert.alert('暂无学习数据', '请先在查重结果中点击"反馈"按钮收集数据');
                    }
                    return;
                  }
                  
                  // 显示统计信息并确认导出
                  const confirmMsg = `AI查重学习数据统计\n\n总记录数: ${stats.totalRecords}\n相同判断: ${stats.sameCount}\n相似判断: ${stats.similarCount}\n不同判断: ${stats.differentCount}\n平均偏差: ${stats.avgDeviation}\nAI高估率: ${stats.overEstimateRate}%\nAI低估率: ${stats.underEstimateRate}%\n\n是否导出学习数据文件？`;
                  
                  if (Platform.OS === 'web') {
                    if (window.confirm(confirmMsg)) {
                      await downloadSimilarityLearningData();
                      window.alert('导出成功\n\n文件已保存到下载文件夹');
                    }
                  } else {
                    Alert.alert('AI查重学习数据', confirmMsg, [
                      { text: '取消', style: 'cancel' },
                      { text: '导出', onPress: async () => {
                        await downloadSimilarityLearningData();
                        Alert.alert('导出成功', '文件已保存到下载文件夹');
                      }}
                    ]);
                  }
                } catch (error) {
                  console.error('[Settings] Failed to export similarity learning data:', error);
                  if (Platform.OS === 'web') {
                    window.alert('导出失败\n\n请稍后重试');
                  } else {
                    Alert.alert('导出失败', '请稍后重试');
                  }
                }
              }}
            >
              <ThemedText style={styles.bottomSheetItemIcon}>🔍</ThemedText>
              <ThemedText style={styles.bottomSheetItemText}>AI查重学习数据</ThemedText>
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
        <TouchableWithoutFeedback onPress={() => setShowDataModal(false)}>
          <View style={[styles.modalOverlay, { backgroundColor: overlayBg }]}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={[styles.bottomSheet, { backgroundColor: modalBg }]}>
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
              onPress={() => {
                console.log("[Upload] Button clicked - sync version");
                setShowDataModal(false);
                
                // 使用 setTimeout 来延迟执行异步操作
                setTimeout(async () => {
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
                      // 根据同步数量显示不同的提示
                      let msg: string;
                      const activeCount = result.activeCount || result.count;
                      if (result.count === 0) {
                        msg = `本地数据无变化，无需同步\n共 ${activeCount} 个产品`;
                      } else {
                        msg = `已同步 ${activeCount} 个产品到云端`;
                      }
                      console.log("[Upload] Success:", msg);
                      if (Platform.OS === 'web') {
                        window.alert(`同步成功\n${msg}`);
                      } else {
                        Alert.alert("同步成功", msg);
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
                }, 100);
              }}
            >
              <ThemedText style={styles.bottomSheetItemIcon}>{uploading ? "⏳" : "⬆️"}</ThemedText>
              <ThemedText style={styles.bottomSheetItemText}>{uploading ? "上传中..." : "上传到云端"}</ThemedText>
              <ThemedText style={styles.bottomSheetItemArrow}>›</ThemedText>
            </Pressable>

            <Pressable 
              style={[styles.bottomSheetItem, refreshing && styles.bottomSheetItemDisabled]}
              disabled={refreshing}
              onPress={() => {
                console.log("[Download] Button clicked - sync version");
                setShowDataModal(false);
                
                // 使用 setTimeout 来延迟执行异步操作
                setTimeout(async () => {
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
                        downloadWithoutImages: {
                          query: async () => {
                            console.log("[Download] Calling downloadWithoutImagesQuery.refetch (no images)");
                            return (await downloadWithoutImagesQuery.refetch()).data;
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
                }, 100);
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
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* 下载提示弹窗 - 本地无数据但云端有数据时显示 */}
      <Modal
        visible={showDownloadPrompt}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDownloadPrompt(false)}
      >
        <View style={[styles.modalOverlay, { backgroundColor: overlayBg }]}>
          <View style={[styles.downloadPromptContainer, { backgroundColor: modalBg }]}>
            <ThemedText style={styles.downloadPromptIcon}>☁️</ThemedText>
            <ThemedText style={styles.downloadPromptTitle}>检测到云端数据</ThemedText>
            <ThemedText style={styles.downloadPromptMessage}>
              本地暂无数据，云端有 {cloudProductCount} 个产品。{"\n"}
              建议先下载云端数据，否则 AI 对比款式功能无法正常使用。
            </ThemedText>
            <View style={styles.downloadPromptButtons}>
              <Pressable
                style={[styles.downloadPromptButton, styles.downloadPromptButtonSecondary]}
                onPress={() => setShowDownloadPrompt(false)}
                disabled={downloading}
              >
                <ThemedText style={styles.downloadPromptButtonTextSecondary}>稍后再说</ThemedText>
              </Pressable>
              <Pressable
                style={[styles.downloadPromptButton, styles.downloadPromptButtonPrimary, downloading && styles.downloadPromptButtonDisabled]}
                onPress={handleConfirmDownload}
                disabled={downloading}
              >
                {downloading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <ThemedText style={styles.downloadPromptButtonTextPrimary}>立即下载</ThemedText>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* SKU 生成助手弹窗 */}
      <SkuGeneratorModal
        visible={showSkuGenerator}
        onClose={() => setShowSkuGenerator(false)}
        onConfirm={(sku) => {
          // 复制到剪贴板或显示提示
          if (Platform.OS === 'web') {
            navigator.clipboard?.writeText(sku);
            window.alert(`SKU 已生成: ${sku}\n\n已复制到剪贴板`);
          } else {
            Alert.alert("SKU 已生成", `${sku}\n\n可在新品录入时使用`);
          }
        }}
      />

      {/* Box 管理器弹窗 */}
      <BoxManagerModal
        visible={showBoxManager}
        onClose={() => setShowBoxManager(false)}
        products={products}
        mode="manage"
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 20,
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
  outboundStatCard: {
    backgroundColor: "rgba(255, 59, 48, 0.1)",
  },
  outboundStatNumber: {
    color: "#FF3B30",
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
  skuGeneratorButton: {
    backgroundColor: "rgba(255, 149, 0, 0.1)",
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 149, 0, 0.2)",
  },
  skuGeneratorIcon: {
    fontSize: 28,
    marginRight: 12,
  },
  skuGeneratorTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FF9500",
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
  // 下载提示弹窗样式
  downloadPromptContainer: {
    width: "85%",
    maxWidth: 340,
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
  },
  downloadPromptIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  downloadPromptTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 12,
    textAlign: "center",
  },
  downloadPromptMessage: {
    fontSize: 15,
    opacity: 0.7,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  downloadPromptButtons: {
    flexDirection: "row",
    gap: 12,
  },
  downloadPromptButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  downloadPromptButtonPrimary: {
    backgroundColor: "#007AFF",
  },
  downloadPromptButtonSecondary: {
    backgroundColor: "rgba(0, 0, 0, 0.05)",
  },
  downloadPromptButtonDisabled: {
    opacity: 0.6,
  },
  downloadPromptButtonTextPrimary: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  downloadPromptButtonTextSecondary: {
    fontSize: 16,
    fontWeight: "500",
  },
  // 智能功能介绍样式
  smartFeaturesSection: {
    backgroundColor: "rgba(52, 199, 89, 0.08)",
    borderRadius: 16,
    padding: 16,
    marginTop: 12,
  },
  smartFeaturesTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#34C759",
    marginBottom: 12,
  },
  smartFeatureItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(52, 199, 89, 0.1)",
  },
  smartFeatureIcon: {
    fontSize: 20,
    marginRight: 12,
    marginTop: 2,
  },
  smartFeatureContent: {
    flex: 1,
  },
  smartFeatureTitle: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 2,
  },
  smartFeatureDesc: {
    fontSize: 13,
    opacity: 0.6,
    lineHeight: 18,
  },
});
