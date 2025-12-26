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
import { useAuth } from "@/hooks/use-auth";
import { ProductStorage, SettingsStorage } from "@/lib/storage";
import type { Product } from "@/types/product";

/**
 * 添加产品流程 - 步骤4：输入存储位置并完成
 */
export default function AddProductLocationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const { user } = useAuth();
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

  // 加载默认存储位置
  useEffect(() => {
    const loadDefaultLocation = async () => {
      try {
        const settings = await SettingsStorage.get();
        if (settings.defaultLocation) {
          setLocation(settings.defaultLocation);
        }
      } catch (error) {
        console.error("Failed to load default location:", error);
      } finally {
        setLoading(false);
      }
    };

    loadDefaultLocation();
  }, []);

  // 完成并保存
  const handleComplete = async () => {
    if (!location.trim()) {
      Alert.alert("提示", "请输入存储位置");
      return;
    }

    setSaving(true);

    try {
      const quantity = parseInt(params.quantity) || 0;
      const operatorName = user?.name || user?.email || "未知用户";
      const operatorId = user?.id?.toString() || "";

      // 判断是新款还是合并
      if (params.mergeToProductId) {
        // 合并到现有产品
        await ProductStorage.mergeProduct(params.mergeToProductId, {
          quantity,
          location: location.trim(),
          detailImageUri: params.detailImageUri,
          overviewImageUri: params.overviewImageUri,
          operatorId,
          operatorName,
        });
      } else {
        // 新产品，带历史记录
        const product: Omit<Product, "history"> = {
          id: Date.now().toString(),
          detailImageUri: params.detailImageUri,
          overviewImageUri: params.overviewImageUri,
          sku: params.sku,
          quantity,
          storageLocation: location.trim(),
          createdAt: new Date().toISOString(),
          operatorName,
          operatorId,
        };

        await ProductStorage.addWithHistory(product);
      }

      // 更新默认位置
      await SettingsStorage.update({ defaultLocation: location.trim() });

      // 返回主页
      Alert.alert("成功", "产品入库成功", [
        {
          text: "确定",
          onPress: () => {
            // 返回到主屏幕
            router.replace("/(tabs)");
          },
        },
      ]);
    } catch (error) {
      console.error("Failed to save product:", error);
      Alert.alert("错误", "保存失败，请重试");
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
