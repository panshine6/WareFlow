import { Image } from "expo-image";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import { CloudImage } from "@/components/cloud-image";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { ProductAPI } from "@/lib/api-client";
import { ProductStorage } from "@/lib/storage";
import { Platform } from "react-native";
import { AutoSync } from "@/lib/auto-sync";
import { trpc } from "@/lib/trpc";
import type { Product } from "@/types/product";
import { generateLabelForNiimbotD110, generateSystemSKU, saveBarcodeImage, saveToPhotoAlbum } from "@/lib/barcode";
import { generateLabelForNiimbotB1 } from "@/lib/niimbot-printer";

/**
 * 产品详情页面
 */
export default function ProductDetailScreen() {

  const params = useLocalSearchParams<{ id: string; from?: string }>();
  
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editedProduct, setEditedProduct] = useState<Product | null>(null);
  const [priceText, setPriceText] = useState('0'); // 用于价格输入框显示
  const [saving, setSaving] = useState(false);
  const [printingLabel, setPrintingLabel] = useState(false);
  const [barcodePreview, setBarcodePreview] = useState<string | null>(null);
  const [isMobileDevice, setIsMobileDevice] = useState(false);

  // 使用 tRPC 同步
  const uploadMutation = trpc.sync.upload.useMutation();

  // 加载产品数据 - 使用 useFocusEffect 确保每次页面获得焦点时重新加载
  useFocusEffect(
    useCallback(() => {
      loadProduct();
    }, [params.id])
  );

  // 检测是否为移动设备（仅在 Web 平台）
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const checkMobile = () => {
        const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
        const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());
        setIsMobileDevice(isMobile);
      };
      checkMobile();
    }
  }, []);

  const loadProduct = async () => {
    try {
      setLoading(true);
      // Web 平台使用本地存储，原生平台使用 API
      const isWeb = Platform.OS === 'web';
      const found = isWeb 
        ? await ProductStorage.getById(params.id)
        : await ProductAPI.getById(params.id);
      if (found) {
        setProduct(found);
        setEditedProduct(found);
        setPriceText(found.price?.toString() || '0');
      } else {
        Alert.alert("错误", "产品不存在");
        router.back();
      }
    } catch (error) {
      console.error("Failed to load product:", error);
      Alert.alert("错误", "加载产品信息失败");
    } finally {
      setLoading(false);
    }
  };

  // 保存编辑
  const handleSave = async () => {
    if (!editedProduct) return;

    // 验证数据
    if (!editedProduct.sku.trim()) {
      Alert.alert("错误", "SKU 不能为空");
      return;
    }

    if (editedProduct.quantity < 0) {
      Alert.alert("错误", "数量不能为负数");
      return;
    }

    if (!editedProduct.storageLocation.trim()) {
      Alert.alert("错误", "存储位置不能为空");
      return;
    }

    try {
      setSaving(true);
      // Web 平台使用本地存储，原生平台使用 API
      const isWeb = Platform.OS === 'web';
      if (isWeb) {
        await ProductStorage.update(editedProduct.id, editedProduct);
      } else {
        await ProductAPI.update(editedProduct.id, editedProduct);
      }
      setProduct(editedProduct);
      setIsEditing(false);

      // 自动上传到云端（静默）
      try {
        await AutoSync.uploadToCloud(
          uploadMutation,
          () => console.log("编辑后自动上传成功"),
          (error) => console.log("自动上传失败（静默）", error)
        );
      } catch (error) {
        console.log("自动上传失败", error);
      }

      Alert.alert("成功", "产品信息已更新");
    } catch (error) {
      console.error("Failed to update product:", error);
      Alert.alert("错误", "更新产品信息失败");
    } finally {
      setSaving(false);
    }
  };

  // 取消编辑
  const handleCancel = () => {
    setEditedProduct(product);
    setIsEditing(false);
  };

  // 删除产品（移至回收站）
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  const handleDelete = async () => {
    console.log('[ProductDetail] handleDelete called');
    
    // Web 平台直接执行删除（确认已在 UI 中处理）
    if (Platform.OS === 'web') {
      if (!product) return;
      
      try {
        console.log('[ProductDetail] Deleting product:', product.id);
        await ProductStorage.softDelete(product.id);
        console.log('[ProductDetail] Product deleted successfully');
        
        // 自动上传到云端（静默）
        try {
          await AutoSync.uploadToCloud(
            uploadMutation,
            () => console.log("删除后自动上传成功"),
            (error) => console.log("自动上传失败（静默）", error)
          );
        } catch (error) {
          console.log("自动上传失败", error);
        }
        
        window.alert('产品已移至回收站');
        router.replace('/(tabs)');
      } catch (error: any) {
        console.error('[ProductDetail] Delete failed:', error);
        window.alert('删除产品失败: ' + (error.message || '未知错误'));
      }
      return;
    }
    
    // 原生平台使用 Alert.confirm
    Alert.confirm(
      "确认删除",
      "确定要删除这个产品吗？删除后可以在回收站中恢复。",
      async () => {
        try {
          if (product) {
            await ProductAPI.softDelete(product.id);

            // 自动上传到云端（静默）
            try {
              await AutoSync.uploadToCloud(
                uploadMutation,
                () => console.log("删除后自动上传成功"),
                (error) => console.log("自动上传失败（静默）", error)
              );
            } catch (error) {
              console.log("自动上传失败", error);
            }

            Alert.alert("成功", "产品已移至回收站");
            router.replace("/(tabs)");
          }
        } catch (error) {
          console.error("Failed to delete product:", error);
          Alert.alert("错误", "删除产品失败");
        }
      }
    );
  };

  if (loading) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
      </ThemedView>
    );
  }

  if (!product || !editedProduct) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ThemedText>产品不存在</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: Math.max(insets.top, 20),
            paddingBottom: Math.max(insets.bottom, 20),
            paddingLeft: Math.max(insets.left, 20),
            paddingRight: Math.max(insets.right, 20),
          },
        ]}
      >
        {/* 返回按钮 */}
        <Pressable 
          onPress={() => {
            // 根据来源页面决定返回目标
            if (params.from === 'inventory') {
              router.replace('/(tabs)/inventory');
            } else if (params.from === 'inbound') {
              router.replace('/(tabs)/inbound');
            } else if (params.from === 'outbound') {
              router.replace('/(tabs)/outbound');
            } else {
              router.back();
            }
          }} 
          style={styles.backButton}
        >
          <ThemedText style={styles.backButtonText}>← 返回</ThemedText>
        </Pressable>

        {/* 标题卡片美化 */}
        <View style={styles.titleCard}>
          <View style={styles.titleCardIcon}>
            <ThemedText style={styles.titleCardIconText}>📦</ThemedText>
          </View>
          <View style={styles.titleCardContent}>
            <ThemedText style={styles.titleCardTitle}>产品</ThemedText>
            <ThemedText style={styles.titleCardSubtitle}>{product.sku}</ThemedText>
          </View>
        </View>

        {/* 产品照片 */}
        <View style={styles.photoContainer}>
          <ThemedText style={styles.photoLabel}>产品照片</ThemedText>
          <CloudImage
            productId={product.id}
            localUri={product.detailImageUri}
            style={styles.photo}
            imageType="detail"
          />
        </View>

        {/* 产品信息 */}
        <View style={styles.infoContainer}>
          {/* SKU */}
          <View style={styles.infoRow}>
            <ThemedText style={styles.label}>SKU</ThemedText>
            {isEditing ? (
              <TextInput
                value={editedProduct.sku}
                onChangeText={(text) =>
                  setEditedProduct({ ...editedProduct, sku: text })
                }
                style={[
                  styles.input,
                  {
                    color: Colors[colorScheme ?? "light"].text,
                    borderColor: Colors[colorScheme ?? "light"].icon,
                  },
                ]}
                placeholder="输入 SKU"
                placeholderTextColor={Colors[colorScheme ?? "light"].icon}
              />
            ) : (
              <ThemedText style={styles.value}>{product.sku}</ThemedText>
            )}
          </View>

          {/* 数量 */}
          <View style={styles.infoRow}>
            <ThemedText style={styles.label}>数量</ThemedText>
            {isEditing ? (
              <TextInput
                value={editedProduct.quantity.toString()}
                onChangeText={(text) =>
                  setEditedProduct({
                    ...editedProduct,
                    quantity: parseInt(text) || 0,
                  })
                }
                style={[
                  styles.input,
                  {
                    color: Colors[colorScheme ?? "light"].text,
                    borderColor: Colors[colorScheme ?? "light"].icon,
                  },
                ]}
                placeholder="输入数量"
                placeholderTextColor={Colors[colorScheme ?? "light"].icon}
                keyboardType="number-pad"
              />
            ) : (
              <ThemedText style={styles.value}>{product.quantity}</ThemedText>
            )}
          </View>

          {/* 存储位置 */}
          <View style={styles.infoRow}>
            <ThemedText style={styles.label}>存储位置</ThemedText>
            {isEditing ? (
              <TextInput
                value={editedProduct.storageLocation}
                onChangeText={(text) =>
                  setEditedProduct({ ...editedProduct, storageLocation: text })
                }
                style={[
                  styles.input,
                  {
                    color: Colors[colorScheme ?? "light"].text,
                    borderColor: Colors[colorScheme ?? "light"].icon,
                  },
                ]}
                placeholder="输入存储位置"
                placeholderTextColor={Colors[colorScheme ?? "light"].icon}
              />
            ) : (
              <View style={styles.storageLocationRow}>
                <ThemedText style={styles.value}>{product.storageLocation}</ThemedText>
                {Platform.OS === 'web' && (
                  <Pressable
                    onPress={async () => {
                      try {
                        await navigator.clipboard.writeText(product.storageLocation);
                        Alert.alert('复制成功', `已复制存储位置: ${product.storageLocation}`);
                      } catch (error) {
                        Alert.alert('复制失败', '请手动复制');
                      }
                    }}
                    style={styles.copyButton}
                  >
                    <ThemedText style={styles.copyButtonText}>📋 复制</ThemedText>
                  </Pressable>
                )}
              </View>
            )}
          </View>

          {/* 价格 */}
          <View style={styles.infoRow}>
            <ThemedText style={styles.label}>价格</ThemedText>
            {isEditing ? (
              <TextInput
                value={priceText}
                onChangeText={(text) => {
                  // 允许输入数字和小数点
                  if (/^\d*\.?\d*$/.test(text) || text === '') {
                    setPriceText(text);
                    const num = parseFloat(text);
                    if (!isNaN(num)) {
                      setEditedProduct({
                        ...editedProduct!,
                        price: num,
                      });
                    } else if (text === '' || text === '.') {
                      setEditedProduct({
                        ...editedProduct!,
                        price: 0,
                      });
                    }
                  }
                }}
                style={[
                  styles.input,
                  {
                    color: Colors[colorScheme ?? "light"].text,
                    borderColor: Colors[colorScheme ?? "light"].icon,
                  },
                ]}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={Colors[colorScheme ?? "light"].icon}
              />
            ) : (
              <ThemedText style={styles.value}>
                ${product.price?.toFixed(2) || '0.00'}
              </ThemedText>
            )}
          </View>

          {/* Box */}
          <View style={styles.infoRow}>
            <ThemedText style={styles.label}>Box</ThemedText>
            {isEditing ? (
              <TextInput
                value={editedProduct.boxName || ''}
                onChangeText={(text) =>
                  setEditedProduct({ ...editedProduct, boxName: text })
                }
                style={[
                  styles.input,
                  {
                    color: Colors[colorScheme ?? "light"].text,
                    borderColor: Colors[colorScheme ?? "light"].icon,
                  },
                ]}
                placeholder="输入 Box 名称"
                placeholderTextColor={Colors[colorScheme ?? "light"].icon}
              />
            ) : (
              <View style={styles.storageLocationRow}>
                <ThemedText style={styles.value}>{product.boxName || '未分配'}</ThemedText>
                {Platform.OS === 'web' && product.boxName && (
                  <Pressable
                    onPress={async () => {
                      try {
                        await navigator.clipboard.writeText(product.boxName || '');
                        Alert.alert('复制成功', `已复制 Box: ${product.boxName}`);
                      } catch (error) {
                        Alert.alert('复制失败', '请手动复制');
                      }
                    }}
                    style={styles.copyButton}
                  >
                    <ThemedText style={styles.copyButtonText}>📋 复制</ThemedText>
                  </Pressable>
                )}
              </View>
            )}
          </View>

          {/* 操作员 */}
          <View style={styles.infoRow}>
            <ThemedText style={styles.label}>操作员</ThemedText>
            <ThemedText style={styles.value}>{product.operatorName}</ThemedText>
          </View>

          {/* 创建时间 */}
          <View style={styles.infoRow}>
            <ThemedText style={styles.label}>创建时间</ThemedText>
            <ThemedText style={styles.value}>
              {new Date(product.createdAt).toLocaleString("zh-CN")}
            </ThemedText>
          </View>

          {/* 系统 SKU（条形码） */}
          <View style={styles.infoRow}>
            <ThemedText style={styles.label}>系统 SKU</ThemedText>
            <ThemedText style={styles.value}>
              {product.systemSku || '未生成'}
            </ThemedText>
          </View>
        </View>

        {/* 打印标签区域 */}
        {Platform.OS === 'web' && (
          <View style={styles.printSection}>
            <ThemedText type="subtitle" style={styles.printTitle}>
              🏷️ 打印标签
            </ThemedText>
            
            {/* SKU 复制区域 - 系统 SKU 在上，内部 SKU 在下，与标签打印顺序一致 */}
            <View style={styles.skuCopySection}>
              {/* 系统 SKU */}
              <View style={styles.skuCopyRow}>
                <ThemedText style={styles.skuCopyLabel}>系统 SKU：</ThemedText>
                <ThemedText style={styles.skuCopyValue}>{product.systemSku || '未生成'}</ThemedText>
                {product.systemSku && (
                  <Pressable
                    onPress={async () => {
                      try {
                        await navigator.clipboard.writeText(product.systemSku!);
                        Alert.alert('复制成功', `已复制系统 SKU: ${product.systemSku}`);
                      } catch (error) {
                        Alert.alert('复制失败', '请手动复制');
                      }
                    }}
                    style={styles.copyButton}
                  >
                    <ThemedText style={styles.copyButtonText}>📋 复制</ThemedText>
                  </Pressable>
                )}
              </View>
              
              {/* 内部 SKU */}
              <View style={styles.skuCopyRow}>
                <ThemedText style={styles.skuCopyLabel}>内部 SKU：</ThemedText>
                <ThemedText style={styles.skuCopyValue}>{product.sku}</ThemedText>
                <Pressable
                  onPress={async () => {
                    try {
                      await navigator.clipboard.writeText(product.sku);
                      Alert.alert('复制成功', `已复制内部 SKU: ${product.sku}`);
                    } catch (error) {
                      Alert.alert('复制失败', '请手动复制');
                    }
                  }}
                  style={styles.copyButton}
                >
                  <ThemedText style={styles.copyButtonText}>📋 复制</ThemedText>
                </Pressable>
              </View>
            </View>
            
            {/* 条形码预览 */}
            {barcodePreview && (
              <View style={styles.barcodePreviewContainer}>
                <Image 
                  source={{ uri: barcodePreview }} 
                  style={styles.barcodePreviewB1}
                  contentFit="contain"
                />
              </View>
            )}
            
            {/* 生成条形码按钮 - 点击可展开/收起条形码 */}
            <Pressable
              onPress={async () => {
                // 如果已有条形码预览，点击收起
                if (barcodePreview) {
                  setBarcodePreview(null);
                  return;
                }
                
                try {
                  setPrintingLabel(true);
                  // 如果没有 systemSku，先生成一个并保存
                  let skuToUse = product.systemSku;
                  if (!skuToUse) {
                    skuToUse = generateSystemSKU();
                    // 保存到产品
                    await ProductStorage.update(product.id, { systemSku: skuToUse });
                    setProduct({ ...product, systemSku: skuToUse });
                    setEditedProduct({ ...editedProduct, systemSku: skuToUse });
                  }
                  // 生成 B1 打印机标签
                  const dataUrl = await generateLabelForNiimbotB1(skuToUse, product.sku);
                  setBarcodePreview(dataUrl);
                } catch (error) {
                  console.error('生成条形码失败:', error);
                  Alert.alert('错误', '生成条形码失败');
                } finally {
                  setPrintingLabel(false);
                }
              }}
              disabled={printingLabel}
              style={[styles.button, styles.previewButton, { marginBottom: 12 }]}
            >
              <ThemedText style={styles.buttonText}>
                {printingLabel ? '生成中...' : (barcodePreview ? '收起条形码' : '生成条形码')}
              </ThemedText>
            </Pressable>
            
            {/* 保存按钮组 */}
            {barcodePreview && (
              <View style={styles.printButtonsContainer}>
                {/* 保存到相册按钮 - 仅在移动设备上显示，避免电脑端误触导致浏览器崩溃 */}
                {isMobileDevice && (
                  <Pressable
                    onPress={async () => {
                      const skuToUse = product.systemSku || 'unknown';
                      await saveToPhotoAlbum(barcodePreview, skuToUse);
                    }}
                    style={[styles.button, styles.previewButton]}
                  >
                    <ThemedText style={styles.buttonText}>
                      📱 保存到相册
                    </ThemedText>
                  </Pressable>
                )}
                
                <Pressable
                  onPress={async () => {
                    const skuToUse = product.systemSku || 'unknown';
                    await saveBarcodeImage(barcodePreview, skuToUse);
                  }}
                  style={[styles.button, styles.saveButton, !isMobileDevice && { flex: 1 }]}
                >
                  <ThemedText style={styles.buttonText}>
                    📁 下载到文件
                  </ThemedText>
                </Pressable>
              </View>
            )}
            
            {/* 提示信息 */}
            <ThemedText style={styles.printHint}>
              标签尺寸：40mm × 30mm（适用于 NIIMBOT B1）
            </ThemedText>
          </View>
        )}

        {/* 库存操作历史记录 */}
        {product.history && product.history.length > 0 && (
          <View style={styles.historyContainer}>
            <ThemedText type="subtitle" style={styles.historyTitle}>
              📝 库存操作记录
            </ThemedText>
            <View style={styles.historySummary}>
              <ThemedText style={styles.historySummaryText}>
                共 <ThemedText style={styles.historySummaryHighlight}>{product.history.length}</ThemedText> 次操作，
                当前库存 <ThemedText style={styles.historySummaryHighlight}>{product.quantity}</ThemedText> 件
              </ThemedText>
            </View>
            {product.history.map((entry, index) => {
              const isOutbound = entry.type === 'outbound' || entry.quantity < 0;
              const displayQuantity = Math.abs(entry.quantity);
              
              return (
                <View 
                  key={entry.id || index} 
                  style={[
                    styles.historyEntry,
                    isOutbound && styles.historyEntryOutbound
                  ]}
                >
                  <View style={styles.historyHeader}>
                    <View style={[
                      styles.historyIndexBadge,
                      isOutbound && styles.historyIndexBadgeOutbound
                    ]}>
                      <ThemedText style={styles.historyIndexText}>
                        {isOutbound ? '📤 出库' : '📥 入库'}
                      </ThemedText>
                    </View>
                    <ThemedText style={styles.historyDate}>
                      {new Date(entry.timestamp).toLocaleString("zh-CN")}
                    </ThemedText>
                  </View>
                  
                  {/* 细节图片（仅入库显示） */}
                  {!isOutbound && entry.detailImageUri && (
                    <Image
                      source={{ uri: entry.detailImageUri }}
                      style={styles.historyImage}
                    />
                  )}

                  {/* 历史记录详情 */}
                  <View style={styles.historyDetails}>
                    <View style={styles.historyDetailRow}>
                      <ThemedText style={styles.historyDetailLabel}>数量</ThemedText>
                      <ThemedText style={[
                        styles.historyDetailValue,
                        isOutbound ? styles.outboundQuantity : styles.inboundQuantity
                      ]}>
                        {isOutbound ? `-${displayQuantity}` : `+${displayQuantity}`} 件
                      </ThemedText>
                    </View>
                    <View style={styles.historyDetailRow}>
                      <ThemedText style={styles.historyDetailLabel}>位置</ThemedText>
                      <ThemedText style={styles.historyDetailValue}>
                        {entry.location}
                      </ThemedText>
                    </View>
                    <View style={styles.historyDetailRow}>
                      <ThemedText style={styles.historyDetailLabel}>操作员</ThemedText>
                      <ThemedText style={styles.historyDetailValue}>
                        {entry.operatorName}
                      </ThemedText>
                    </View>
                    {/* 出库原因 */}
                    {isOutbound && entry.reason && (
                      <View style={styles.historyDetailRow}>
                        <ThemedText style={styles.historyDetailLabel}>出库原因</ThemedText>
                        <ThemedText style={styles.historyDetailValue}>
                          {entry.reason}
                        </ThemedText>
                      </View>
                    )}
                    {/* 出库目的地 */}
                    {isOutbound && entry.destination && (
                      <View style={styles.historyDetailRow}>
                        <ThemedText style={styles.historyDetailLabel}>目的地</ThemedText>
                        <ThemedText style={styles.historyDetailValue}>
                          {entry.destination}
                        </ThemedText>
                      </View>
                    )}
                    {entry.notes && (
                      <View style={styles.historyDetailRow}>
                        <ThemedText style={styles.historyDetailLabel}>备注</ThemedText>
                        <ThemedText style={styles.historyDetailValue}>
                          {entry.notes}
                        </ThemedText>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* 操作按钮 */}
        <View style={styles.actionsContainer}>
          {isEditing ? (
            <>
              <Pressable
                onPress={handleSave}
                disabled={saving}
                style={[styles.button, styles.saveButton]}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <ThemedText style={styles.buttonText}>保存</ThemedText>
                )}
              </Pressable>
              <Pressable
                onPress={handleCancel}
                disabled={saving}
                style={[styles.button, styles.cancelButton]}
              >
                <ThemedText style={[styles.buttonText, styles.cancelButtonText]}>
                  取消
                </ThemedText>
              </Pressable>
            </>
          ) : (
            <>
              <Pressable
                onPress={() => setIsEditing(true)}
                style={[styles.button, styles.editButton]}
              >
                <ThemedText style={styles.buttonText}>编辑</ThemedText>
              </Pressable>
              <Pressable
                onPress={() => setShowDeleteConfirm(true)}
                style={[styles.button, styles.deleteButton]}
              >
                <ThemedText style={styles.buttonText}>删除</ThemedText>
              </Pressable>
            </>
          )}
        </View>
      </ScrollView>
      
      {/* 删除确认对话框 */}
      {showDeleteConfirm && (
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmDialog}>
            <ThemedText style={styles.confirmTitle}>确认删除</ThemedText>
            <ThemedText style={styles.confirmMessage}>
              确定要删除这个产品吗？删除后可以在回收站中恢复。
            </ThemedText>
            <View style={styles.confirmButtons}>
              <Pressable
                onPress={() => setShowDeleteConfirm(false)}
                style={[styles.confirmButton, styles.confirmCancelButton]}
              >
                <ThemedText style={styles.confirmCancelText}>取消</ThemedText>
              </Pressable>
              <Pressable
                onPress={() => {
                  setShowDeleteConfirm(false);
                  handleDelete();
                }}
                style={[styles.confirmButton, styles.confirmDeleteButton]}
              >
                <ThemedText style={styles.confirmDeleteText}>删除</ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      )}
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    gap: 24,
  },
  backButton: {
    alignSelf: "flex-start",
  },
  backButtonText: {
    fontSize: 16,
    lineHeight: 24,
    color: "#007AFF",
  },
    // 新增标题卡片样式
  titleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#007AFF', // iOS 蓝色
    padding: 20,
    marginHorizontal: 0, // 移除水平边距，让它更宽
    marginTop: 10,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  titleCardIcon: {
    width: 50,
    height: 50,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  titleCardIconText: {
    fontSize: 28,
    color: Colors.dark.text,
  },
  titleCardContent: {
    flex: 1,
  },
  titleCardTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.dark.text,
    marginBottom: 4,
  },
  titleCardSubtitle: {
    fontSize: 14,
    color: Colors.dark.text,
    opacity: 0.7,
  },
  titleSubtitle: {
    fontSize: 14,
    color: "#666",
    fontWeight: "500",
  },
  photoContainer: {
    gap: 8,
  },
  photoLabel: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  photo: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 12,
    backgroundColor: "#f0f0f0",
  },
  infoContainer: {
    gap: 16,
  },
  infoRow: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
    opacity: 0.7,
  },
  value: {
    fontSize: 16,
    lineHeight: 24,
  },
  valueWithCopy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  storageLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inlineCopyButton: {
    padding: 4,
  },
  inlineCopyButtonText: {
    fontSize: 16,
  },
  input: {
    fontSize: 16,
    lineHeight: 24,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 8,
  },
  actionsContainer: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  editButton: {
    backgroundColor: "#007AFF",
  },
  deleteButton: {
    backgroundColor: "#FF3B30",
  },
  saveButton: {
    backgroundColor: "#34C759",
  },
  cancelButton: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#8E8E93",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "600",
  },
  cancelButtonText: {
    color: "#8E8E93",
  },
  historyContainer: {
    gap: 12,
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(0, 0, 0, 0.1)",
  },
  historyTitle: {
    marginBottom: 4,
  },
  historySummary: {
    backgroundColor: "rgba(0, 122, 255, 0.1)",
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  historySummaryText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  historySummaryHighlight: {
    fontWeight: "700",
    color: "#007AFF",
  },
  historyEntry: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: "rgba(0, 0, 0, 0.03)",
    gap: 12,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: "#34C759",
  },
  historyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  historyIndexBadge: {
    backgroundColor: "#34C759",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  historyIndexText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    color: "#fff",
  },
  historyDate: {
    fontSize: 13,
    lineHeight: 18,
    opacity: 0.6,
  },
  historyImage: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: "#f0f0f0",
    resizeMode: "contain",
  },
  historyDetails: {
    gap: 6,
    backgroundColor: "rgba(0, 0, 0, 0.02)",
    padding: 12,
    borderRadius: 8,
  },
  historyDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  historyDetailLabel: {
    fontSize: 13,
    lineHeight: 18,
    opacity: 0.6,
  },
  historyDetailValue: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
  },
  // 出库记录样式
  historyEntryOutbound: {
    borderLeftColor: "#FF3B30",
  },
  historyIndexBadgeOutbound: {
    backgroundColor: "#FF3B30",
  },
  outboundQuantity: {
    color: "#FF3B30",
    fontWeight: "700",
  },
  inboundQuantity: {
    color: "#34C759",
    fontWeight: "700",
  },
  // 打印标签相关样式
  printSection: {
    gap: 12,
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(0, 0, 0, 0.1)",
  },
  printTitle: {
    marginBottom: 4,
  },
  // SKU 复制区域样式
  skuCopySection: {
    backgroundColor: "rgba(0, 122, 255, 0.08)",
    padding: 12,
    borderRadius: 8,
    gap: 8,
    marginBottom: 8,
  },
  skuCopyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  skuCopyLabel: {
    fontSize: 13,
    fontWeight: "600",
    opacity: 0.7,
    minWidth: 70,
  },
  skuCopyValue: {
    fontSize: 14,
    fontWeight: "500",
    flex: 1,
  },
  copyButton: {
    backgroundColor: "#007AFF",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 4,
  },
  copyButtonText: {
    fontSize: 12,
    color: "#fff",
    fontWeight: "500",
  },
  barcodePreviewContainer: {
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.1)",
  },
  barcodePreview: {
    width: 304,
    height: 96,
  },
  printButtonsContainer: {
    flexDirection: "row",
    gap: 12,
  },
  previewButton: {
    backgroundColor: "#5856D6",
  },
  printButton: {
    backgroundColor: "#007AFF",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  printHint: {
    fontSize: 12,
    lineHeight: 18,
    opacity: 0.6,
    textAlign: "center",
    marginTop: 4,
  },
  printHintSuccess: {
    color: "#34C759",
    opacity: 1,
  },
  printHintWarning: {
    color: "#FF9500",
    opacity: 1,
  },
  // 打印机类型选择
  printerTypeContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  printerTypeLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
  printerTypeButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#8E8E93",
    backgroundColor: "transparent",
  },
  printerTypeButtonActive: {
    backgroundColor: "#007AFF",
    borderColor: "#007AFF",
  },
  printerTypeButtonText: {
    fontSize: 12,
    color: "#8E8E93",
  },
  printerTypeButtonTextActive: {
    color: "#fff",
  },
  barcodePreviewB1: {
    width: 400,
    height: 240,
  },
  // 直接打印区域
  directPrintSection: {
    marginTop: 16,
    padding: 16,
    backgroundColor: "rgba(0, 122, 255, 0.05)",
    borderRadius: 12,
    gap: 12,
  },
  directPrintTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  printerStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  printerStatusText: {
    fontSize: 14,
  },
  disconnectButton: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 4,
    backgroundColor: "#FF3B30",
  },
  disconnectButtonText: {
    fontSize: 12,
    color: "#fff",
  },
  connectButtonsRow: {
    flexDirection: "row",
    gap: 12,
  },
  connectButton: {
    backgroundColor: "#5856D6",
  },
  bluetoothButton: {
    backgroundColor: "#007AFF",
  },
  // 确认对话框样式
  confirmOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  confirmDialog: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    width: "85%",
    maxWidth: 320,
    gap: 16,
  },
  confirmTitle: {
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  confirmMessage: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    opacity: 0.7,
  },
  confirmButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  confirmCancelButton: {
    backgroundColor: "#E5E5EA",
  },
  confirmDeleteButton: {
    backgroundColor: "#FF3B30",
  },
  confirmCancelText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000",
  },
  confirmDeleteText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
});
