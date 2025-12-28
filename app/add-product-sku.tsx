import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { Alert } from "@/lib/alert";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { SettingsStorage } from "@/lib/storage";

/**
 * 添加产品流程 - 步骤2：输入 SKU
 * 注意：去重已经在拍照后完成，这里只需要输入 SKU
 */
export default function AddProductSkuScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const params = useLocalSearchParams<{ 
    detailImageUri: string;
    detailImageBase64?: string;
    isNewProduct?: string;
  }>();

  const [sku, setSku] = useState("");
  const [loading, setLoading] = useState(true);

  // 检测是否在浏览器环境
  const isWeb = typeof window !== 'undefined' && typeof window.alert === 'function';

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

  // 确认 SKU
  const handleConfirm = async () => {
    console.log("[SKU] handleConfirm called");
    console.log("[SKU] SKU input:", sku);
    
    if (!sku.trim()) {
      console.log("[SKU] SKU is empty, showing alert");
      if (isWeb) {
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
      console.log("[SKU] SKU saved successfully");

      // 直接跳转到拍摄概览图页面
      console.log("[SKU] Navigating to add-product-overview...");
      router.push({
        pathname: "/add-product-overview" as any,
        params: {
          detailImageUri: params.detailImageUri,
          sku: sku.trim(),
          isNewProduct: params.isNewProduct || "true",
        },
      });
      console.log("[SKU] Navigation completed");
    } catch (error) {
      console.error("[SKU] Error:", error);
      const errorMessage = error instanceof Error ? error.message : "未知错误";
      
      if (isWeb) {
        window.alert(`保存失败：${errorMessage}`);
      } else {
        Alert.alert("错误", `保存失败：${errorMessage}`);
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
                  opacity: pressed || loading ? 0.6 : 1,
                },
              ]}
              onPress={handleConfirm}
              disabled={loading}
            >
              <ThemedText style={styles.buttonText}>继续</ThemedText>
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
});
