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
import { SettingsStorage, ProductStorage } from "@/lib/storage";
import type { Product } from "@/types/product";

/**
 * 添加产品流程 - 步骤4：输入存储位置并完成
 * 
 * 简化版：统一使用 ProductStorage（IndexedDB/AsyncStorage）
 * 不再区分平台，所有平台都使用相同的存储方式
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

  // 完成并保存 - 使用统一的 ProductStorage
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
      const now = new Date().toISOString();
      
      // 判断是新款还是合并
      if (params.mergeToProductId) {
        // 合并到现有产品
        console.log('[AddProductLocation] Merging to existing product:', params.mergeToProductId);
        
        const existingProduct = await ProductStorage.getById(params.mergeToProductId);
        if (existingProduct) {
          await ProductStorage.update(params.mergeToProductId, {
            quantity: existingProduct.quantity + quantity,
            updatedAt: now,
          });
          console.log('[AddProductLocation] Product merged successfully');
        } else {
          throw new Error('产品不存在');
        }
        
        console.log('[AddProductLocation] Merge completed');
      } else {
        // 新产品
        const productId = Date.now().toString();
        
        console.log('[AddProductLocation] Creating new product...');
        
        const product: Product = {
          id: productId,
          detailImageUri: params.detailImageUri,
          overviewImageUri: params.overviewImageUri,
          sku: params.sku,
          quantity,
          storageLocation: location.trim(),
          operatorName,
          operatorId,
          createdAt: now,
          updatedAt: now,
          isDeleted: false,
        };
        
        await ProductStorage.add(product);
        console.log('[AddProductLocation] Product created successfully');
      }

      // 更新默认位置
      await SettingsStorage.update({ defaultLocation: location.trim() });

      // 返回主页
      if (Platform.OS === "web") {
        window.alert("产品入库成功！");
        router.replace("/(tabs)");
      } else {
        Alert.alert("成功", "产品入库成功", [
          {
            text: "确定",
            onPress: () => {
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
                      ? "rgba(255,255,255,0.1)"
                      : "rgba(0,0,0,0.05)",
                  color: colorScheme === "dark" ? "#fff" : "#000",
                },
              ]}
              value={location}
              onChangeText={setLocation}
              placeholder="例如：A区-1号柜-2层"
              placeholderTextColor={
                colorScheme === "dark"
                  ? "rgba(255,255,255,0.5)"
                  : "rgba(0,0,0,0.4)"
              }
              autoFocus={!loading}
              editable={!loading && !saving}
            />
          </View>

          <View style={styles.buttonContainer}>
            <Pressable
              style={[styles.button, styles.backButton]}
              onPress={() => router.back()}
              disabled={saving}
            >
              <ThemedText style={styles.backButtonText}>返回</ThemedText>
            </Pressable>

            <Pressable
              style={[
                styles.button,
                styles.completeButton,
                { opacity: saving ? 0.7 : 1 },
              ]}
              onPress={handleComplete}
              disabled={saving || loading}
            >
              <ThemedText style={styles.completeButtonText}>
                {saving ? "保存中..." : "完成入库"}
              </ThemedText>
            </Pressable>
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
    paddingHorizontal: 20,
    justifyContent: "space-between",
  },
  formContainer: {
    flex: 1,
    justifyContent: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 12,
  },
  hint: {
    textAlign: "center",
    opacity: 0.7,
    marginBottom: 24,
  },
  summaryCard: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: "rgba(0,122,255,0.1)",
    marginBottom: 24,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  summaryLabel: {
    opacity: 0.7,
  },
  summaryValue: {
    fontSize: 16,
  },
  input: {
    height: 56,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 18,
  },
  buttonContainer: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 20,
  },
  button: {
    flex: 1,
    height: 56,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  backButton: {
    backgroundColor: "rgba(0,0,0,0.1)",
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  completeButton: {
    backgroundColor: "#34C759",
  },
  completeButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
