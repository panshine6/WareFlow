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
import { ProductAPI } from "@/lib/api-client";
import { SettingsStorage } from "@/lib/storage";

/**
 * 添加产品流程 - 步骤2：输入 SKU
 */
export default function AddProductSkuScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const params = useLocalSearchParams<{ 
    detailImageUri: string;
    detailImageBase64?: string;
  }>();

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
      console.log("[SKU] Converting image to base64:", uri.substring(0, 50));
      const response = await fetch(uri);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result as string;
          // 移除 "data:image/jpeg;base64," 前缀
          const base64Data = base64.split(",")[1];
          console.log("[SKU] Image converted, size:", base64Data.length);
          resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error("[SKU] Failed to convert image to base64:", error);
      throw error;
    }
  };

  // 确认 SKU
  const handleConfirm = async () => {
    console.log("[SKU] handleConfirm called, SKU:", sku);
    
    if (!sku.trim()) {
      if (Platform.OS === "web") {
        window.alert("请输入 SKU");
      } else {
        Alert.alert("提示", "请输入 SKU");
      }
      return;
    }

    try {
      // 保存 SKU 到设置
      console.log("[SKU] Saving SKU to settings...");
      await SettingsStorage.update({ lastSku: sku.trim() });

      // 开始查重流程
      console.log("[SKU] Starting duplicate check...");
      setChecking(true);

      // 获取所有未删除的产品（已删除的不参与查重）
      console.log("[SKU] Loading active products from cloud...");
      const allProducts = await ProductAPI.getActive();
      console.log("[SKU] Found", allProducts.length, "active products");

      if (allProducts.length === 0) {
        // 没有现有产品，直接继续
        console.log("[SKU] No existing products, skipping duplicate check");
        setChecking(false);
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

      // 将新图片转换为 Base64（如果还没有）
      let newImageBase64: string;
      if (params.detailImageBase64) {
        console.log("[SKU] Using provided base64 data");
        newImageBase64 = params.detailImageBase64;
      } else {
        console.log("[SKU] Converting new image to base64...");
        newImageBase64 = await imageToBase64(params.detailImageUri);
      }

      // 将现有产品图片转换为 Base64
      console.log("[SKU] Converting existing images to base64...");
      const existingImages = await Promise.all(
        allProducts.map(async (product) => {
          console.log("[SKU] Converting product image:", product.id);
          return {
            id: product.id,
            base64: await imageToBase64(product.detailImageUri),
          };
        }),
      );

      // 调用 AI 批量对比（相似度阈值 90%）
      console.log("[SKU] Calling AI batch compare...");
      const similarResults = await batchCompareImages(
        newImageBase64,
        existingImages,
        90,
      );

      console.log("[SKU] Batch compare completed, found", similarResults.length, "similar products");
      setChecking(false);

      if (similarResults.length === 0) {
        // 没有发现疑似重复，直接继续
        console.log("[SKU] No duplicates found, continuing...");
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
        console.log("[SKU] Duplicates found, navigating to duplicate check page");
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
      console.error("[SKU] Failed to check duplicates:", error);
      
      const errorMessage = error instanceof Error ? error.message : "未知错误";
      console.error("[SKU] Error details:", errorMessage);
      
      if (Platform.OS === "web") {
        const continueAnyway = window.confirm(
          `查重失败：${errorMessage}\n\n是否继续入库？`
        );
        if (continueAnyway) {
          router.push({
            pathname: "/add-product-overview" as any,
            params: {
              detailImageUri: params.detailImageUri,
              sku: sku.trim(),
              isNewProduct: "true",
            },
          });
        }
      } else {
        Alert.alert(
          "查重失败",
          `${errorMessage}\n\n是否继续入库？`,
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

            <ThemedText type="default" style={styles.description}>
              请输入产品的 SKU 编号
            </ThemedText>

            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor:
                    colorScheme === "dark" ? "#1C1C1E" : "#F2F2F7",
                  color: colorScheme === "dark" ? "#FFFFFF" : "#000000",
                  borderColor: colorScheme === "dark" ? "#38383A" : "#C6C6C8",
                },
              ]}
              value={sku}
              onChangeText={setSku}
              placeholder="例如: EG-ME-0001"
              placeholderTextColor={
                colorScheme === "dark" ? "#8E8E93" : "#8E8E93"
              }
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleConfirm}
            />
          </View>

          <View style={styles.buttonContainer}>
            <Pressable
              style={({ pressed }) => [
                styles.button,
                {
                  backgroundColor: "#007AFF",
                  opacity: pressed || loading || checking ? 0.6 : 1,
                },
              ]}
              onPress={handleConfirm}
              disabled={loading || checking}
            >
              {checking ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator color="#FFFFFF" size="small" />
                  <ThemedText style={styles.buttonText}>
                    正在查重，请稍候...
                  </ThemedText>
                </View>
              ) : (
                <ThemedText style={styles.buttonText}>继续</ThemedText>
              )}
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
  },
  formContainer: {
    flex: 1,
    justifyContent: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 12,
    textAlign: "center",
  },
  description: {
    fontSize: 16,
    marginBottom: 32,
    textAlign: "center",
    opacity: 0.7,
  },
  input: {
    height: 56,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 18,
    fontWeight: "500",
  },
  buttonContainer: {
    paddingBottom: 20,
  },
  button: {
    height: 56,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
});
