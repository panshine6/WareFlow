import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { UserStorage } from "@/lib/user-storage";
import { ProductAPI } from "@/lib/api-client";
import { SettingsStorage } from "@/lib/storage";
import { ProductStorage } from "@/lib/storage";
import { ProductRepository } from "@/lib/product-repository";
import { HistoryRepository } from "@/lib/history-repository";
import { AutoSync } from "@/lib/auto-sync";
import { trpc } from "@/lib/trpc";
import type { Product } from "@/types/product";

/**
 * 添加产品流程 - 步骤4：输入存储位置并完成
 */
export default function AddProductLocationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const params = useLocalSearchParams<{
    detailImageUri: string;
    overviewImageUri: string;
    sku: string;
    quantity: string;
    isNewProduct?: string;
    mergeToProductId?: string;
  }>();

  const [location, setLocation] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // 使用 tRPC 同步
  const uploadMutation = trpc.sync.upload.useMutation();

  // 加载默认存储位置和当前用户
  useEffect(() => {
    const loadData = async () => {
      try {
        const [settings, user] = await Promise.all([
          SettingsStorage.get(),
          UserStorage.getCurrentUser(),
        ]);
        if (settings.defaultLocation) {
          setLocation(settings.defaultLocation);
        }
        setCurrentUser(user);
      } catch (error) {
        console.error("Failed to load data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // 完成并保存
  const handleComplete = async () => {
    if (!location.trim()) {
      if (Platform.OS === "web") {
        window.alert("请输入存储位置");
      } else {
        Alert.alert("提示", "请输入存储位置");
      }
      return;
    }

    setSaving(true);

    try {
      const quantity = parseInt(params.quantity) || 0;
      const operatorName = currentUser?.name || "未知用户";
      const operatorId = parseInt(currentUser?.id?.toString() || "1");

      // 判断平台：Web 使用 AsyncStorage，原生使用 SQLite
      const isWeb = Platform.OS === 'web';
      
      // 判断是新款还是合并
      if (params.mergeToProductId) {
        // 合并到现有产品
        console.log('[AddProductLocation] Merging to existing product:', params.mergeToProductId);
        
        if (isWeb) {
          // Web 平台：使用 AsyncStorage
          const existingProduct = await ProductStorage.getById(params.mergeToProductId);
          if (existingProduct) {
            await ProductStorage.update(params.mergeToProductId, {
              quantity: existingProduct.quantity + quantity,
              updatedAt: new Date().toISOString(),
            });
          }
        } else {
          // 原生平台：使用 SQLite
          const productRepo = new ProductRepository();
          const historyRepo = new HistoryRepository();
          
          // 1. 合并到 SQLite
          await productRepo.merge(params.mergeToProductId, quantity);
          
          // 2. 添加历史记录到 SQLite
          const historyId = Date.now().toString();
          await historyRepo.create({
            id: historyId,
            productId: params.mergeToProductId,
            timestamp: new Date().toISOString(),
            operatorId,
            operatorName,
            quantity,
            location: location.trim(),
            detailImageUri: params.detailImageUri,
            overviewImageUri: params.overviewImageUri,
          });
          
          // 3. 删除全景图（释放空间）
          console.log('[AddProductLocation] Deleting overview images to save space...');
          await historyRepo.deleteOverviewImage(historyId);
        }
        
        // 4. 同步到云端（后台，静默失败）
        try {
          await ProductAPI.merge(params.mergeToProductId, {
            quantity,
            location: location.trim(),
            detailImageUri: params.detailImageUri,
            overviewImageUri: params.overviewImageUri, // 临时上传，用于 AI 计数
            operatorId,
            operatorName,
          });
          console.log('[AddProductLocation] Cloud sync completed');
        } catch (error) {
          console.log('[AddProductLocation] Cloud sync failed (silent):', error);
          // 静默失败，不影响用户体验，数据已保存到本地
        }
        
        console.log('[AddProductLocation] Merge completed');
      } else {
        // 新产品，带历史记录
        const productId = Date.now().toString();
        const product: Omit<Product, "history" | "createdAt" | "updatedAt"> = {
          id: productId,
          detailImageUri: params.detailImageUri,
          overviewImageUri: params.overviewImageUri,
          sku: params.sku,
          quantity,
          storageLocation: location.trim(),
          operatorName,
          operatorId,
        };

        if (isWeb) {
          // Web 平台：使用 AsyncStorage
          console.log('[AddProductLocation] Saving to AsyncStorage (Web platform)...');
          await ProductStorage.add({
            ...product,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isDeleted: false,
          });
        } else {
          // 原生平台：使用 SQLite
          const productRepo = new ProductRepository();
          const historyRepo = new HistoryRepository();
          
          // 1. 保存到 SQLite（包含全景图）
          console.log('[AddProductLocation] Saving to SQLite...');
          await productRepo.create(product);
          
          // 2. 添加历史记录到 SQLite
          const historyId = Date.now().toString() + '_history';
          await historyRepo.create({
            id: historyId,
            productId,
            timestamp: new Date().toISOString(),
            operatorId,
            operatorName,
            quantity,
            location: location.trim(),
            detailImageUri: params.detailImageUri,
            overviewImageUri: params.overviewImageUri,
          });
          
          // 3. 删除全景图（释放空间）
          console.log('[AddProductLocation] Deleting overview images to save space...');
          await productRepo.deleteOverviewImage(productId);
          await historyRepo.deleteOverviewImage(historyId);
          console.log('[AddProductLocation] Overview images deleted');
        }
        
        // 4. 同步到云端（后台，静默失败）
        try {
          console.log('[AddProductLocation] Syncing to cloud (detail image only)...');
          const historyId = Date.now().toString() + '_history';
          await ProductAPI.create(product);
          await ProductAPI.addHistory({
            id: historyId,
            productId,
            operatorId,
            operatorName,
            quantity,
            location: location.trim(),
            detailImageUri: params.detailImageUri,
            overviewImageUri: params.overviewImageUri, // 临时上传，用于 AI 计数
          });
          console.log('[AddProductLocation] Cloud sync completed');
        } catch (error) {
          console.log('[AddProductLocation] Cloud sync failed (silent):', error);
          // 静默失败，不影响用户体验，数据已保存到本地
        }
        console.log('[AddProductLocation] Product created successfully');
      }

      // 更新默认位置
      await SettingsStorage.update({ defaultLocation: location.trim() });

      // 自动上传到云端（静默）
      try {
        await AutoSync.uploadToCloud(
          uploadMutation,
          () => {
            console.log("自动上传成功");
          },
          (error) => {
            console.log("自动上传失败（静默）", error);
          }
        );
      } catch (error) {
        // 静默失败，不影响用户体验
        console.log("自动上传失败", error);
      }

      // 返回主页
      if (Platform.OS === "web") {
        window.alert("产品入库成功！");
        router.replace("/(tabs)");
      } else {
        Alert.alert("成功", "产品入库成功", [
          {
            text: "确定",
            onPress: () => {
              // 返回到主屏幕
              router.replace("/(tabs)");
            },
          },
        ]);
      }
    } catch (error) {
      console.error("[AddProductLocation] Failed to save product:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[AddProductLocation] Error details:", errorMessage);
      
      if (Platform.OS === "web") {
        window.alert(`保存失败：${errorMessage}`);
      } else {
        Alert.alert("错误", `保存失败：${errorMessage}`);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <View
          style={[
            styles.content,
            {
              paddingTop: Math.max(insets.top, 20),
              paddingBottom: Math.max(insets.bottom, 20),
            },
          ]}
        >
          <View style={styles.formContainer}>
            <ThemedText type="title" style={styles.title}>
              存储位置
            </ThemedText>

            <ThemedText style={styles.hint}>
              {loading ? "正在加载..." : "请输入产品存储位置"}
            </ThemedText>

            {/* 产品信息摘要 */}
            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <ThemedText style={styles.summaryLabel}>SKU:</ThemedText>
                <ThemedText type="defaultSemiBold" style={styles.summaryValue}>
                  {params.sku}
                </ThemedText>
              </View>
              <View style={styles.summaryRow}>
                <ThemedText style={styles.summaryLabel}>数量:</ThemedText>
                <ThemedText type="defaultSemiBold" style={styles.summaryValue}>
                  {params.quantity}
                </ThemedText>
              </View>
            </View>

            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor:
                    colorScheme === "dark"
                      ? "rgba(255, 255, 255, 0.1)"
                      : "rgba(0, 0, 0, 0.05)",
                  color: colorScheme === "dark" ? "#fff" : "#000",
                },
              ]}
              value={location}
              onChangeText={setLocation}
              placeholder="例如：A区-01-03"
              placeholderTextColor={
                colorScheme === "dark"
                  ? "rgba(255, 255, 255, 0.4)"
                  : "rgba(0, 0, 0, 0.4)"
              }
              autoFocus
              autoCapitalize="characters"
              returnKeyType="done"
              onSubmitEditing={handleComplete}
            />

            <View style={styles.buttonContainer}>
              <Pressable
                style={[styles.button, styles.cancelButton]}
                onPress={() => router.back()}
                disabled={saving}
              >
                <ThemedText style={styles.cancelButtonText}>返回</ThemedText>
              </Pressable>

              <Pressable
                style={[
                  styles.button,
                  styles.confirmButton,
                  saving && styles.buttonDisabled,
                ]}
                onPress={handleComplete}
                disabled={saving}
              >
                <ThemedText style={styles.confirmButtonText}>
                  {saving ? "保存中..." : "完成"}
                </ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  formContainer: {
    width: "100%",
  },
  title: {
    marginBottom: 12,
    textAlign: "center",
  },
  hint: {
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.7,
    textAlign: "center",
    marginBottom: 24,
  },
  summaryCard: {
    backgroundColor: "rgba(0, 122, 255, 0.1)",
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.7,
  },
  summaryValue: {
    fontSize: 16,
    lineHeight: 22,
  },
  input: {
    height: 56,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 18,
    lineHeight: 24,
    marginBottom: 24,
  },
  buttonContainer: {
    flexDirection: "row",
    gap: 12,
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
  confirmButton: {
    backgroundColor: "#34C759",
  },
  confirmButtonText: {
    color: "#fff",
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
