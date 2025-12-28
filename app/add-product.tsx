import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { WebCamera } from "@/components/web-camera";
import { Alert } from "@/lib/alert";
import { performDuplicateCheck } from "@/lib/deduplication";

/**
 * 添加产品流程 - 步骤1：拍摄产品细节照片
 */
export default function AddProductScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [camera, setCamera] = useState<CameraView | null>(null);
  const [checking, setChecking] = useState(false);

  // 处理拍照完成后的去重检查
  const handlePhotoTaken = async (uri: string, base64?: string) => {
    console.log("[AddProduct] Photo taken, starting duplicate check");
    console.log("[AddProduct] URI:", uri);
    console.log("[AddProduct] Has base64:", !!base64);
    
    setChecking(true);
    
    try {
      // 执行去重检查
      const result = await performDuplicateCheck(uri, base64);
      
      if (result.error) {
        // 去重失败，询问用户是否继续
        console.log("[AddProduct] Duplicate check failed:", result.error);
        
        const isWeb = typeof window !== 'undefined' && typeof window.confirm === 'function';
        const continueAnyway = isWeb
          ? window.confirm(`查重失败：${result.error}\n\n是否继续入库？`)
          : await new Promise<boolean>((resolve) => {
              Alert.alert(
                "查重失败",
                `${result.error}\n\n是否继续入库？`,
                [
                  { text: "Cancel", onPress: () => resolve(false), style: "cancel" },
                  { text: "OK", onPress: () => resolve(true) },
                ]
              );
            });
        
        if (!continueAnyway) {
          setChecking(false);
          return;
        }
        
        // 用户选择继续，跳转到 SKU 页面
        router.push({
          pathname: "/add-product-sku" as any,
          params: {
            detailImageUri: uri,
            detailImageBase64: base64 || "",
            isNewProduct: "true",
          },
        });
        return;
      }
      
      if (result.hasDuplicates && result.duplicates.length > 0) {
        // 发现重复产品，跳转到查重页面
        console.log("[AddProduct] Found", result.duplicates.length, "duplicates");
        router.push({
          pathname: "/duplicate-check" as any,
          params: {
            detailImageUri: uri,
            detailImageBase64: base64 || "",
            duplicates: JSON.stringify(result.duplicates.map(d => ({
              productId: d.product.id,
              sku: d.product.sku,
              similarityScore: d.similarityScore,
              analysisNote: d.analysisNote,
            }))),
          },
        });
      } else {
        // 没有重复产品，跳转到 SKU 页面
        console.log("[AddProduct] No duplicates found, proceeding to SKU page");
        router.push({
          pathname: "/add-product-sku" as any,
          params: {
            detailImageUri: uri,
            detailImageBase64: base64 || "",
            isNewProduct: "true",
          },
        });
      }
    } catch (error: any) {
      console.error("[AddProduct] Unexpected error:", error);
      Alert.alert("错误", `发生意外错误：${error.message}`);
    } finally {
      setChecking(false);
    }
  };

  // Web 平台使用 HTML5 input[type=file]
  if (Platform.OS === "web") {
    return (
      <ThemedView style={styles.container}>
        <View style={[styles.webContainer, { paddingTop: Math.max(insets.top, 20) }]}>
          {/* 返回按钮 */}
          <Pressable
            style={styles.webBackButton}
            onPress={() => router.back()}
          >
            <ThemedText style={styles.webBackButtonText}>← 返回</ThemedText>
          </Pressable>

          {/* 加载遮罩 */}
          {checking && (
            <View style={styles.loadingOverlay}>
              <View style={styles.loadingCard}>
                <ActivityIndicator size="large" color="#007AFF" />
                <ThemedText style={styles.loadingText}>正在查重，请稍候...</ThemedText>
              </View>
            </View>
          )}

          <WebCamera
            hint="请拍摄产品细节照片"
            subHint="💡 建议在充足自然光（日光）下拍摄\n避免阴影和反光，保持相机稳定"
            buttonText="拍摄细节照"
            onPhotoTaken={handlePhotoTaken}
          />
        </View>
      </ThemedView>
    );
  }

  // 原生平台使用 expo-camera
  // 请求相机权限
  if (!permission) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>正在请求相机权限...</ThemedText>
      </ThemedView>
    );
  }

  if (!permission.granted) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.permissionContainer}>
          <ThemedText type="subtitle" style={styles.permissionTitle}>
            需要相机权限
          </ThemedText>
          <ThemedText style={styles.permissionText}>
            请授予相机权限以拍摄产品照片
          </ThemedText>
          <Pressable style={styles.permissionButton} onPress={requestPermission}>
            <ThemedText style={styles.permissionButtonText}>授予权限</ThemedText>
          </Pressable>
        </View>
      </ThemedView>
    );
  }

  // 拍照处理
  const handleTakePhoto = async () => {
    if (!camera) return;

    try {
      // 根据 OpenAI Vision API 要求优化图片质量
      // 使用 90% 质量，确保细节清晰
      const photo = await camera.takePictureAsync({
        quality: 0.9,
        base64: true,
      });

      if (photo && photo.base64) {
        // 使用 Data URL 代替文件路径，确保跨设备访问
        const dataUrl = `data:image/jpeg;base64,${photo.base64}`;
        await handlePhotoTaken(dataUrl, photo.base64);
      }
    } catch (error) {
      console.error("Failed to take photo:", error);
      Alert.alert("拍照失败", "请重试");
    }
  };

  return (
    <View style={styles.container}>
      <CameraView
        ref={setCamera}
        style={styles.camera}
        facing="back"
      >
        {/* 顶部提示 */}
        <View
          style={[
            styles.topBar,
            {
              paddingTop: Math.max(insets.top, 20),
            },
          ]}
        >
          <View style={styles.hintContainer}>
            <ThemedText style={styles.hint}>请拍摄产品细节照片</ThemedText>
            <ThemedText style={styles.lightHint}>
              💡 建议在充足自然光（日光）下拍摄
            </ThemedText>
            <ThemedText style={styles.lightHint}>
              避免阴影和反光，保持相机稳定
            </ThemedText>
          </View>
        </View>

        {/* 加载遮罩 */}
        {checking && (
          <View style={styles.loadingOverlay}>
            <View style={styles.loadingCard}>
              <ActivityIndicator size="large" color="#007AFF" />
              <ThemedText style={styles.loadingText}>正在查重，请稍候...</ThemedText>
            </View>
          </View>
        )}

        {/* 底部操作栏 */}
        <View
          style={[
            styles.bottomBar,
            {
              paddingBottom: Math.max(insets.bottom, 20),
            },
          ]}
        >
          <Pressable
            style={styles.cancelButton}
            onPress={() => router.back()}
          >
            <ThemedText style={styles.cancelButtonText}>取消</ThemedText>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.captureButton,
              { opacity: pressed ? 0.7 : 1 },
            ]}
            onPress={handleTakePhoto}
            disabled={checking}
          >
            <View style={styles.captureButtonInner} />
          </Pressable>

          <View style={styles.placeholder} />
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  webContainer: {
    flex: 1,
    position: "relative",
  },
  webBackButton: {
    position: "absolute",
    top: 20,
    left: 20,
    zIndex: 10,
    padding: 12,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    borderRadius: 8,
  },
  webBackButtonText: {
    color: "#fff",
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "500",
  },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  loadingCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 24,
    alignItems: "center",
    gap: 16,
    minWidth: 200,
  },
  loadingText: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "500",
  },
  permissionContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  permissionTitle: {
    marginBottom: 12,
  },
  permissionText: {
    textAlign: "center",
    opacity: 0.7,
    marginBottom: 24,
  },
  permissionButton: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  permissionButtonText: {
    color: "#fff",
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "600",
  },
  camera: {
    flex: 1,
  },
  topBar: {
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    paddingHorizontal: 20,
    paddingBottom: 20,
    alignItems: "center",
  },
  hintContainer: {
    alignItems: "center",
    gap: 4,
  },
  hint: {
    color: "#fff",
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "600",
  },
  lightHint: {
    color: "#fff",
    fontSize: 13,
    lineHeight: 18,
    opacity: 0.9,
    textAlign: "center",
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 32,
    paddingTop: 20,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  cancelButton: {
    width: 60,
  },
  cancelButtonText: {
    color: "#fff",
    fontSize: 16,
    lineHeight: 22,
  },
  captureButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#fff",
    borderWidth: 3,
    borderColor: "#000",
  },
  placeholder: {
    width: 60,
  },
});
