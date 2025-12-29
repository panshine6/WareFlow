import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { Alert } from "@/lib/alert";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { ProductAPI } from "@/lib/api-client";
import { ProductStorage } from "@/lib/storage";
import type { Product } from "@/types/product";

/**
 * 回收站页面
 */
export default function RecycleBinScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const isWeb = Platform.OS === 'web';

  useEffect(() => {
    loadProducts();
    // 自动清理超过 90 天的产品
    cleanupOldProducts();
  }, []);

  const loadProducts = async () => {
    try {
      setLoading(true);
      // Web 平台使用本地存储，原生平台使用云端 API
      const deleted = isWeb 
        ? await ProductStorage.getDeleted()
        : await ProductAPI.getDeleted();
      setProducts(deleted);
    } catch (error) {
      console.error("Failed to load deleted products:", error);
      Alert.alert("错误", "加载回收站失败");
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadProducts();
    setRefreshing(false);
  };

  const cleanupOldProducts = async () => {
    // TODO: Implement cleanup API endpoint
    // For now, we'll skip automatic cleanup
    console.log("Automatic cleanup not yet implemented");
  };

  // 恢复产品
  const handleRestore = (product: Product) => {
    // Web 平台直接使用 window.confirm
    if (isWeb) {
      const confirmed = window.confirm(`确认恢复\n\n确定要恢复产品 ${product.sku} 吗？`);
      if (confirmed) {
        ProductStorage.restore(product.id)
          .then(() => {
            window.alert("产品已恢复");
            loadProducts();
          })
          .catch((error) => {
            console.error("Failed to restore product:", error);
            window.alert("恢复产品失败: " + (error.message || "未知错误"));
          });
      }
      return;
    }

    // 原生平台使用 Alert.confirm
    Alert.confirm(
      "确认恢复",
      `确定要恢复产品 ${product.sku} 吗？`,
      async () => {
        try {
          await ProductAPI.restore(product.id);
          Alert.alert("成功", "产品已恢复");
          await loadProducts();
        } catch (error) {
          console.error("Failed to restore product:", error);
          Alert.alert("错误", "恢复产品失败");
        }
      }
    );
  };

  // 永久删除产品
  const handlePermanentDelete = (product: Product) => {
    // Web 平台直接使用 window.confirm
    if (isWeb) {
      const confirmed = window.confirm(`确认永久删除\n\n确定要永久删除产品 ${product.sku} 吗？此操作无法撤销！`);
      if (confirmed) {
        ProductStorage.permanentDelete(product.id)
          .then(() => {
            window.alert("产品已永久删除");
            loadProducts();
          })
          .catch((error) => {
            console.error("Failed to permanently delete product:", error);
            window.alert("永久删除失败: " + (error.message || "未知错误"));
          });
      }
      return;
    }

    // 原生平台使用 Alert.confirm
    Alert.confirm(
      "确认永久删除",
      `确定要永久删除产品 ${product.sku} 吗？此操作无法撤销！`,
      async () => {
        try {
          await ProductAPI.permanentDelete(product.id);
          Alert.alert("成功", "产品已永久删除");
          await loadProducts();
        } catch (error) {
          console.error("Failed to permanently delete product:", error);
          Alert.alert("错误", "永久删除失败");
        }
      }
    );
  };

  // 计算删除后剩余天数
  const getDaysRemaining = (deletedAt: string) => {
    const deleted = new Date(deletedAt);
    const now = new Date();
    const diff = 90 - Math.floor((now.getTime() - deleted.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  };

  const renderProduct = ({ item }: { item: Product }) => {
    const daysRemaining = item.deletedAt ? getDaysRemaining(item.deletedAt) : 0;

    return (
      <View
        style={[
          styles.productCard,
          { backgroundColor: Colors[colorScheme ?? "light"].background },
        ]}
      >
        <Image source={{ uri: item.detailImageUri }} style={styles.productImage} />
        <View style={styles.productInfo}>
          <ThemedText style={styles.productSku}>{item.sku}</ThemedText>
          <ThemedText style={styles.productDetails}>
            数量: {item.quantity} | 位置: {item.storageLocation}
          </ThemedText>
          <ThemedText style={styles.deletedInfo}>
            删除时间: {new Date(item.deletedAt!).toLocaleDateString("zh-CN")}
          </ThemedText>
          <ThemedText style={[styles.daysRemaining, daysRemaining < 10 && styles.daysWarning]}>
            {daysRemaining} 天后永久删除
          </ThemedText>
        </View>
        <View style={styles.actions}>
          <Pressable
            onPress={() => handleRestore(item)}
            style={[styles.actionButton, styles.restoreButton]}
          >
            <ThemedText style={styles.actionButtonText}>恢复</ThemedText>
          </Pressable>
          <Pressable
            onPress={() => handlePermanentDelete(item)}
            style={[styles.actionButton, styles.deleteButton]}
          >
            <ThemedText style={styles.actionButtonText}>永久删除</ThemedText>
          </Pressable>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View
        style={[
          styles.header,
          {
            paddingTop: Math.max(insets.top, 20),
            paddingLeft: Math.max(insets.left, 20),
            paddingRight: Math.max(insets.right, 20),
          },
        ]}
      >
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ThemedText style={styles.backButtonText}>← 返回</ThemedText>
        </Pressable>
        <ThemedText type="title" style={styles.title}>
          回收站
        </ThemedText>
        <ThemedText style={styles.subtitle}>
          已删除的产品将在 90 天后自动清理
        </ThemedText>
      </View>

      {products.length === 0 ? (
        <View style={styles.emptyContainer}>
          <ThemedText style={styles.emptyText}>回收站是空的</ThemedText>
        </View>
      ) : (
        <FlatList
          data={products}
          renderItem={renderProduct}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.listContent,
            {
              paddingBottom: Math.max(insets.bottom, 20),
              paddingLeft: Math.max(insets.left, 20),
              paddingRight: Math.max(insets.right, 20),
            },
          ]}
          refreshing={refreshing}
          onRefresh={handleRefresh}
        />
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
  header: {
    paddingBottom: 20,
    gap: 8,
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
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.7,
  },
  listContent: {
    gap: 16,
    paddingTop: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    fontSize: 16,
    lineHeight: 24,
    opacity: 0.5,
  },
  productCard: {
    flexDirection: "row",
    padding: 12,
    borderRadius: 12,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  productImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: "#f0f0f0",
  },
  productInfo: {
    flex: 1,
    gap: 4,
  },
  productSku: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "600",
  },
  productDetails: {
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.7,
  },
  deletedInfo: {
    fontSize: 12,
    lineHeight: 18,
    opacity: 0.5,
  },
  daysRemaining: {
    fontSize: 12,
    lineHeight: 18,
    color: "#34C759",
    fontWeight: "600",
  },
  daysWarning: {
    color: "#FF9500",
  },
  actions: {
    justifyContent: "center",
    gap: 8,
  },
  actionButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    minWidth: 80,
    alignItems: "center",
  },
  restoreButton: {
    backgroundColor: "#34C759",
  },
  deleteButton: {
    backgroundColor: "#FF3B30",
  },
  actionButtonText: {
    color: "#fff",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
});
