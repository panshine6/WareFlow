import * as FileSystem from "expo-file-system";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import { batchCompareImages } from "@/lib/ai-vision";
import { ProductStorage, SettingsStorage } from "@/lib/storage";

/**
 * 添加产品流程 - 步骤2：输入 SKU
 */
export default function AddProductSkuScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const params = useLocalSearchParams<{ detailImageUri: string }>();

  const [sku, setSku] = useState("");
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  // 加载上次输入的 SKU
  useEffect(() => {
    const loadLastSku = async () => {
      try {
        const settings = await SettingsStorage.get();
        if (settings.lastSku) {
          setSku(settings.lastSku);
        }
      } catch (error) {
        console.error("Failed to load last SKU:", error);
      } finally {
        setLoading(false);
      }
    };

    loadLastSku();
  }, []);

  // 将图片转换为 Base64
  const imageToBase64 = async (uri: string): Promise<string> => {
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result as string;
          // 移除 "data:image/jpeg;base64," 前缀
          const base64Data = base64.split(",")[1];
          resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error("Failed to convert image to base64:", error);
      throw error;
    }
  };

  // 确认 SKU
  const handleConfirm = async () => {
    if (!sku.trim()) {
      Alert.alert("提示", "请输入 SKU");
      return;
    }

    try {
      // 保存 SKU 到设置
      await SettingsStorage.update({ lastSku: sku.trim() });

      // 开始查重流程
      setChecking(true);

      // 获取所有现有产品
      const allProducts = await ProductStorage.getAll();

      if (allProducts.length === 0) {
        // 没有现有产品，直接继续
        router.push({
          pathname: "/add-product-overview" as any,
          params: {
            detailImageUri: params.detailImageUri,
            sku: sku.trim(),
            isNewProduct: "true",
          },
        });
        return;
      }

      // 将新图片转换为 Base64
      const newImageBase64 = await imageToBase64(params.detailImageUri);

      // 将现有产品图片转换为 Base64
      const existingImages = await Promise.all(
        allProducts.map(async (product) => ({
          id: product.id,
          base64: await imageToBase64(product.detailImageUri),
        })),
      );

      // 调用 AI 批量对比（相似度阈值 90%）
      const similarResults = await batchCompareImages(
        newImageBase64,
        existingImages,
        90,
      );

      setChecking(false);

      if (similarResults.length === 0) {
        // 没有发现疑似重复，直接继续
        router.push({
          pathname: "/add-product-overview" as any,
          params: {
            detailImageUri: params.detailImageUri,
            sku: sku.trim(),
            isNewProduct: "true",
          },
        });
      } else {
        // 发现疑似重复，导航到查重结果页面
        const duplicates = similarResults.map((result) => ({
          product: allProducts.find((p) => p.id === result.id)!,
          similarityScore: result.similarityScore,
          analysisNote: result.analysisNote,
        }));

        router.push({
          pathname: "/duplicate-check" as any,
          params: {
            detailImageUri: params.detailImageUri,
            sku: sku.trim(),
            duplicates: JSON.stringify(duplicates),
          },
        });
      }
    } catch (error) {
      setChecking(false);
      console.error("Failed to check duplicates:", error);
      Alert.alert(
        "查重失败",
        "无法完成查重，是否继续入库？",
        [
          {
            text: "取消",
            style: "cancel",
          },
          {
            text: "继续",
            onPress: () => {
              router.push({
                pathname: "/add-product-overview" as any,
                params: {
                  detailImageUri: params.detailImageUri,
                  sku: sku.trim(),
                  isNewProduct: "true",
                },
              });
            },
          },
        ],
      );
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
              输入 SKU
            </ThemedText>

            <ThemedText style={styles.hint}>
              {loading
                ? "正在加载..."
                : checking
                  ? "正在查重，请稍候..."
                  : "请输入产品 SKU 编号"}
            </ThemedText>

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
              value={sku}
              onChangeText={setSku}
              placeholder="例如：ACC-2024-001"
              placeholderTextColor={
                colorScheme === "dark"
                  ? "rgba(255, 255, 255, 0.4)"
                  : "rgba(0, 0, 0, 0.4)"
              }
              autoFocus
              autoCapitalize="characters"
              returnKeyType="done"
              onSubmitEditing={handleConfirm}
            />

            <View style={styles.buttonContainer}>
              <Pressable
                style={[styles.button, styles.cancelButton]}
                onPress={() => router.back()}
              >
                <ThemedText style={styles.cancelButtonText}>取消</ThemedText>
              </Pressable>

              <Pressable
                style={[styles.button, styles.confirmButton]}
                onPress={handleConfirm}
                disabled={checking}
              >
                {checking ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <ThemedText style={styles.confirmButtonText}>确定</ThemedText>
                )}              </Pressable>
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
    backgroundColor: "#007AFF",
  },
  confirmButtonText: {
    color: "#fff",
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "600",
  },
});
