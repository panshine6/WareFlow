import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import type { Product } from "@/types/product";

/**
 * 查重结果展示页面
 * 显示疑似重复的产品列表，用户可选择"新款"或"合并到现有款式"
 */
export default function DuplicateCheckScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    detailImageUri: string;
    sku: string;
    duplicates: string; // JSON 字符串
  }>();

  const [loading, setLoading] = useState(false);

  // 解析疑似重复产品列表
  const duplicates: Array<{
    product: Product;
    similarityScore: number;
    analysisNote: string;
  }> = params.duplicates ? JSON.parse(params.duplicates) : [];

  // 用户选择"新款"
  const handleNewProduct = () => {
    // 继续正常入库流程
    router.replace({
      pathname: "/add-product-overview" as any,
      params: {
        detailImageUri: params.detailImageUri,
        sku: params.sku,
        isNewProduct: "true",
      },
    });
  };

  // 用户选择"合并到现有款式"
  const handleMergeProduct = (existingProduct: Product) => {
    Alert.alert(
      "确认合并",
      `确定要将新入库的产品合并到 SKU: ${existingProduct.sku} 吗？`,
      [
        {
          text: "取消",
          style: "cancel",
        },
        {
          text: "确定",
          onPress: () => {
            // 跳转到全景拍照页面，传递现有产品 ID
            router.replace({
              pathname: "/add-product-overview" as any,
              params: {
                detailImageUri: params.detailImageUri,
                sku: params.sku,
                mergeToProductId: existingProduct.id,
              },
            });
          },
        },
      ],
    );
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: Math.max(insets.top, 20),
            paddingBottom: Math.max(insets.bottom, 20),
          },
        ]}
      >
        {/* 标题 */}
        <View style={styles.header}>
          <ThemedText type="title" style={styles.title}>
            发现疑似重复款式
          </ThemedText>
          <ThemedText style={styles.subtitle}>
            找到 {duplicates.length} 个相似度较高的产品，请确认是否为同款
          </ThemedText>
        </View>

        {/* 新拍摄的图片 */}
        <View style={styles.newImageContainer}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>
            新拍摄的细节图
          </ThemedText>
          <Image
            source={{ uri: params.detailImageUri }}
            style={styles.newImage}
            contentFit="cover"
          />
          <ThemedText style={styles.skuText}>SKU: {params.sku}</ThemedText>
        </View>

        {/* 疑似重复产品列表 */}
        <View style={styles.duplicatesContainer}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>
            疑似重复产品
          </ThemedText>

          {duplicates.map((item, index) => (
            <View key={item.product.id} style={styles.duplicateCard}>
              {/* 相似度标签 */}
              <View
                style={[
                  styles.similarityBadge,
                  {
                    backgroundColor:
                      item.similarityScore >= 95
                        ? "#FF3B30"
                        : item.similarityScore >= 90
                          ? "#FF9500"
                          : "#34C759",
                  },
                ]}
              >
                <ThemedText style={styles.similarityText}>
                  相似度 {item.similarityScore}%
                </ThemedText>
              </View>

              {/* 产品信息 */}
              <View style={styles.productInfo}>
                <Image
                  source={{ uri: item.product.detailImageUri }}
                  style={styles.productImage}
                  contentFit="cover"
                />
                <View style={styles.productDetails}>
                  <ThemedText style={styles.productSku}>
                    SKU: {item.product.sku}
                  </ThemedText>
                  <ThemedText style={styles.productQuantity}>
                    库存: {item.product.quantity} 件
                  </ThemedText>
                  <ThemedText style={styles.productLocation}>
                    位置: {item.product.storageLocation}
                  </ThemedText>
                  <ThemedText style={styles.analysisNote}>
                    {item.analysisNote}
                  </ThemedText>
                </View>
              </View>

              {/* 合并按钮 */}
              <Pressable
                style={styles.mergeButton}
                onPress={() => handleMergeProduct(item.product)}
              >
                <ThemedText style={styles.mergeButtonText}>
                  合并到此款式
                </ThemedText>
              </Pressable>
            </View>
          ))}
        </View>

        {/* 底部按钮 */}
        <View style={styles.bottomButtons}>
          <Pressable
            style={[styles.button, styles.cancelButton]}
            onPress={() => router.back()}
          >
            <ThemedText style={styles.cancelButtonText}>取消</ThemedText>
          </Pressable>

          <Pressable
            style={[styles.button, styles.newButton]}
            onPress={handleNewProduct}
          >
            <ThemedText style={styles.newButtonText}>确认为新款</ThemedText>
          </Pressable>
        </View>
      </ScrollView>

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      )}
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
    paddingHorizontal: 20,
  },
  header: {
    marginBottom: 24,
    alignItems: "center",
  },
  title: {
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.7,
    textAlign: "center",
  },
  newImageContainer: {
    marginBottom: 24,
    alignItems: "center",
  },
  sectionTitle: {
    marginBottom: 12,
  },
  newImage: {
    width: 200,
    height: 200,
    borderRadius: 12,
    marginBottom: 8,
  },
  skuText: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "600",
  },
  duplicatesContainer: {
    marginBottom: 24,
  },
  duplicateCard: {
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    backgroundColor: "rgba(0, 0, 0, 0.05)",
  },
  similarityBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 12,
  },
  similarityText: {
    color: "#fff",
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600",
  },
  productInfo: {
    flexDirection: "row",
    marginBottom: 12,
  },
  productImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    marginRight: 12,
  },
  productDetails: {
    flex: 1,
    justifyContent: "center",
  },
  productSku: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "600",
    marginBottom: 4,
  },
  productQuantity: {
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.7,
    marginBottom: 2,
  },
  productLocation: {
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.7,
    marginBottom: 4,
  },
  analysisNote: {
    fontSize: 13,
    lineHeight: 18,
    opacity: 0.6,
    fontStyle: "italic",
  },
  mergeButton: {
    backgroundColor: "#007AFF",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  mergeButtonText: {
    color: "#fff",
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "600",
  },
  bottomButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
  },
  button: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: "rgba(0, 0, 0, 0.1)",
  },
  cancelButtonText: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "600",
  },
  newButton: {
    backgroundColor: "#34C759",
  },
  newButtonText: {
    color: "#fff",
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "600",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
});
