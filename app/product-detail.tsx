import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
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
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { ProductAPI } from "@/lib/api-client";
import { AutoSync } from "@/lib/auto-sync";
import { trpc } from "@/lib/trpc";
import type { Product } from "@/types/product";

/**
 * 产品详情页面
 */
export default function ProductDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editedProduct, setEditedProduct] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);

  // 使用 tRPC 同步
  const uploadMutation = trpc.sync.upload.useMutation();

  // 加载产品数据
  useEffect(() => {
    loadProduct();
  }, [params.id]);

  const loadProduct = async () => {
    try {
      setLoading(true);
      const found = await ProductAPI.getById(params.id);
      if (found) {
        setProduct(found);
        setEditedProduct(found);
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
      await ProductAPI.update(editedProduct.id, editedProduct);
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
  const handleDelete = () => {
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
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ThemedText style={styles.backButtonText}>← 返回</ThemedText>
        </Pressable>

        {/* 标题 */}
        <ThemedText type="title" style={styles.title}>
          产品详情
        </ThemedText>

        {/* 产品照片 */}
        <View style={styles.photosContainer}>
          <View style={styles.photoWrapper}>
            <ThemedText style={styles.photoLabel}>细节照片</ThemedText>
            <Image source={{ uri: product.detailImageUri }} style={styles.photo} />
          </View>
          <View style={styles.photoWrapper}>
            <ThemedText style={styles.photoLabel}>全景照片</ThemedText>
            <Image source={{ uri: product.overviewImageUri }} style={styles.photo} />
          </View>
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
              <ThemedText style={styles.value}>{product.storageLocation}</ThemedText>
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
        </View>

        {/* 历史记录 */}
        {product.history && product.history.length > 0 && (
          <View style={styles.historyContainer}>
            <ThemedText type="subtitle" style={styles.historyTitle}>
              入库历史记录
            </ThemedText>
            <ThemedText style={styles.historySubtitle}>
              共 {product.history.length} 次入库，总计 {product.quantity} 件
            </ThemedText>
            {product.history.map((entry, index) => (
              <View key={entry.id} style={styles.historyEntry}>
                <View style={styles.historyHeader}>
                  <ThemedText style={styles.historyIndex}>
                    第 {index + 1} 次入库
                  </ThemedText>
                  <ThemedText style={styles.historyDate}>
                    {new Date(entry.timestamp).toLocaleString("zh-CN")}
                  </ThemedText>
                </View>
                
                {/* 历史记录图片 */}
                <View style={styles.historyImages}>
                  <View style={styles.historyImageWrapper}>
                    <ThemedText style={styles.historyImageLabel}>细节图</ThemedText>
                    <Image
                      source={{ uri: entry.detailImageUri }}
                      style={styles.historyImage}
                    />
                  </View>
                  <View style={styles.historyImageWrapper}>
                    <ThemedText style={styles.historyImageLabel}>全景图</ThemedText>
                    <Image
                      source={{ uri: entry.overviewImageUri }}
                      style={styles.historyImage}
                    />
                  </View>
                </View>

                {/* 历史记录详情 */}
                <View style={styles.historyDetails}>
                  <View style={styles.historyDetailRow}>
                    <ThemedText style={styles.historyDetailLabel}>数量：</ThemedText>
                    <ThemedText style={styles.historyDetailValue}>
                      {entry.quantity} 件
                    </ThemedText>
                  </View>
                  <View style={styles.historyDetailRow}>
                    <ThemedText style={styles.historyDetailLabel}>位置：</ThemedText>
                    <ThemedText style={styles.historyDetailValue}>
                      {entry.location}
                    </ThemedText>
                  </View>
                  <View style={styles.historyDetailRow}>
                    <ThemedText style={styles.historyDetailLabel}>操作员：</ThemedText>
                    <ThemedText style={styles.historyDetailValue}>
                      {entry.operatorName}
                    </ThemedText>
                  </View>
                  {entry.notes && (
                    <View style={styles.historyDetailRow}>
                      <ThemedText style={styles.historyDetailLabel}>备注：</ThemedText>
                      <ThemedText style={styles.historyDetailValue}>
                        {entry.notes}
                      </ThemedText>
                    </View>
                  )}
                </View>
              </View>
            ))}
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
                onPress={handleDelete}
                style={[styles.button, styles.deleteButton]}
              >
                <ThemedText style={styles.buttonText}>删除</ThemedText>
              </Pressable>
            </>
          )}
        </View>
      </ScrollView>
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
  title: {
    marginBottom: 8,
  },
  photosContainer: {
    flexDirection: "row",
    gap: 12,
  },
  photoWrapper: {
    flex: 1,
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
    gap: 16,
    marginTop: 8,
  },
  historyTitle: {
    marginBottom: 4,
  },
  historySubtitle: {
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.7,
    marginBottom: 12,
  },
  historyEntry: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: "rgba(0, 0, 0, 0.03)",
    gap: 12,
    marginBottom: 12,
  },
  historyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  historyIndex: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "600",
  },
  historyDate: {
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.6,
  },
  historyImages: {
    flexDirection: "row",
    gap: 12,
  },
  historyImageWrapper: {
    flex: 1,
    gap: 4,
  },
  historyImageLabel: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
    opacity: 0.7,
  },
  historyImage: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: "#f0f0f0",
  },
  historyDetails: {
    gap: 8,
  },
  historyDetailRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  historyDetailLabel: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
    opacity: 0.7,
    minWidth: 70,
  },
  historyDetailValue: {
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
});
