import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Platform, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { WebCamera } from "@/components/web-camera";

/**
 * 添加产品流程 - 步骤1：拍摄产品细节照片
 */
export default function AddProductScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [camera, setCamera] = useState<CameraView | null>(null);

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

          <WebCamera
            hint="请拍摄产品细节照片"
            subHint="💡 建议在充足自然光（日光）下拍摄\n避免阴影和反光，保持相机稳定"
            buttonText="拍摄细节照"
            onPhotoTaken={(uri, base64) => {
              console.log("[AddProduct] Photo taken, navigating to SKU page");
              router.push({
                pathname: "/add-product-sku" as any,
                params: { 
                  detailImageUri: uri,
                  detailImageBase64: base64,
                },
              });
            }}
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

      if (photo) {
        // 导航到 SKU 输入页面，传递照片 URI 和 base64
        router.push({
          pathname: "/add-product-sku" as any,
          params: { 
            detailImageUri: photo.uri,
            detailImageBase64: photo.base64 || "",
          },
        });
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
