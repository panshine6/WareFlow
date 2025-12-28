import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Alert } from "@/lib/alert";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import type { Product } from "@/types/product";

interface DuplicateInfo {
  productId: string;
  sku: string;
  similarityScore: number;
  analysisNote: string;
}

/**
 * 查重结果展示页面
 * 显示疑似重复的产品列表，用户可选择"新款"或"合并到现有款式"
 */
export default function DuplicateCheckScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    detailImageUri: string;
    detailImageBase64?: string;
    duplicates: string; // JSON 字符串
  }>();

  const [loading, setLoading] = useState(false);

  // 解析疑似重复产品列表
  const duplicates: DuplicateInfo[] = params.duplicates ? JSON.parse(params.duplicates) : [];

  // 用户选择"新款"
  const handleNewProduct = () => {
    console.log("[DuplicateCheck] User chose to create new product");
    // 跳转到输入 SKU 页面
    router.replace({
      pathname: "/add-product-sku" as any,
      params: {
        detailImageUri: params.detailImageUri,
        detailImageBase64: params.detailImageBase64 || "",
        isNewProduct: "true",
      },
    });
  };

  // 用户选择"合并到现有款式"
  const handleMergeProduct = (duplicate: DuplicateInfo) => {
    console.log("[DuplicateCheck] User chose to merge to product:", duplicate.productId);
    
    Alert.confirm(
      "确认合并",
      `确定要将新入库的产品合并到 SKU: ${duplicate.sku} 吗？`,
      () => {
        // 用户点击"确定"，跳转到全景拍照页面
        console.log("[DuplicateCheck] User confirmed merge");
        router.replace({
          pathname: "/add-product-overview" as any,
          params: {
            detailImageUri: params.detailImageUri,
            mergeToProductId: duplicate.productId,
            sku: duplicate.sku,
            similarityScore: duplicate.similarityScore.toString(),
          },
        });
      },
      () => {
        // 用户点击"取消"
        console.log("[DuplicateCheck] User cancelled merge");
      }
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
        </View>

        {/* 疑似重复产品列表 */}
        <View style={styles.duplicatesContainer}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>
            疑似重复产品
          </ThemedText>

          {duplicates.map((duplicate, index) => (
            <View key={duplicate.productId} style={styles.duplicateCard}>
              {/* 相似度标签 */}
              <View
                style={[
                  styles.similarityBadge,
                  {
                    backgroundColor:
                      duplicate.similarityScore >= 95
                        ? "#FF3B30"
                        : duplicate.similarityScore >= 90
                          ? "#FF9500"
                          : "#34C759",
                  },
                ]}
              >
                <ThemedText style={styles.similarityText}>
                  相似度 {duplicate.similarityScore}%
                </ThemedText>
              </View>

              {/* 产品信息 */}
              <View style={styles.productInfo}>
                <View style={styles.productDetails}>
                  <ThemedText style={styles.productSku}>
                    SKU: {duplicate.sku}
                  </ThemedText>
                  <ThemedText style={styles.analysisNote}>
                    {duplicate.analysisNote}
                  </ThemedText>
                </View>
              </View>

              {/* 合并按钮 */}
              <Pressable
                style={styles.mergeButton}
                onPress={() => handleMergeProduct(duplicate)}
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
    marginBottom: 12,
  },
  productDetails: {
    flex: 1,
  },
  productSku: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "600",
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
