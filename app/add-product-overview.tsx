import { CameraView, useCameraPermissions } from "expo-camera";
import * as FileSystem from "expo-file-system";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { Alert } from "@/lib/alert";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { WebCamera } from "@/components/web-camera";
import { countProductsInImage } from "@/lib/ai-vision";

/**
 * 添加产品流程 - 步骤3：拍摄全景照片并识别数量
 */
export default function AddProductOverviewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [permission] = useCameraPermissions();
  const params = useLocalSearchParams<{
    detailImageUri: string;
    sku: string;
    isNewProduct?: string;
    mergeToProductId?: string;
  }>();

  const [camera, setCamera] = useState<CameraView | null>(null);
  const [overviewImageUri, setOverviewImageUri] = useState<string>("");
  const [recognizing, setRecognizing] = useState(false);
  const [showQuantityModal, setShowQuantityModal] = useState(false);
  const [quantity, setQuantity] = useState<number>(0);

  // Web 平台：处理拍照和 AI 识别
  const handleWebPhotoTaken = async (uri: string, base64: string) => {
    console.log("[Overview Web] Photo taken, starting AI recognition...");
    setOverviewImageUri(uri);
    setRecognizing(true);

    try {
      console.log("[Overview Web] Calling AI recognition...");
      const count = await countProductsInImage(base64);
      console.log("[Overview Web] AI recognized count:", count);

      setQuantity(count);
      setShowQuantityModal(true);
    } catch (error) {
      console.error("[Overview Web] AI recognition error:", error);
      const errorMessage = error instanceof Error ? error.message : "未知错误";
      console.error("[Overview Web] Error details:", errorMessage);

      const manualInput = window.confirm(
        `识别失败：${errorMessage}\n\n点击"确定"手动输入数量，点击"取消"重拍`
      );
      if (manualInput) {
        setQuantity(1);
        setShowQuantityModal(true);
      } else {
        setOverviewImageUri("");
      }
    } finally {
      setRecognizing(false);
    }
  };

  // 原生平台：拍照并识别
  const handleTakePhoto = async () => {
    if (!camera) {
      console.log("[Overview] Camera not ready");
      Alert.alert("提示", "相机未就绪，请稍后重试");
      return;
    }

    console.log("[Overview] Taking photo...");

    try {
      const photo = await camera.takePictureAsync({
        quality: 0.8,
        base64: true, // 直接获取 base64，避免文件读取问题
      });

      console.log("[Overview] Photo taken:", photo ? "success" : "failed");

      if (photo) {
        setOverviewImageUri(photo.uri);
        setRecognizing(true);

        try {
          let base64Data: string;

          // 优先使用直接返回的 base64
          if (photo.base64) {
            console.log("[Overview] Using direct base64 from camera");
            base64Data = photo.base64;
          } else {
            // 备用方案：从文件读取
            console.log("[Overview] Reading base64 from file...");
            base64Data = await FileSystem.readAsStringAsync(photo.uri, {
              encoding: FileSystem.EncodingType.Base64,
            });
          }

          console.log("[Overview] Base64 length:", base64Data.length);

          // 调用真实的 AI 识别
          console.log("[Overview] Calling AI recognition...");
          const count = await countProductsInImage(base64Data);
          console.log("[Overview] AI recognized count:", count);

          setQuantity(count);
          setShowQuantityModal(true);
        } catch (error) {
          console.error("[Overview] AI recognition error:", error);
          const errorMessage = error instanceof Error ? error.message : "未知错误";
          console.error("[Overview] Error details:", errorMessage);

          Alert.show(
            "识别失败",
            `${errorMessage}\n\n请选择手动输入或重拍`,
            [
              {
                text: "手动输入",
                onPress: () => {
                  setQuantity(1);
                  setShowQuantityModal(true);
                },
              },
              {
                text: "重拍",
                onPress: () => setOverviewImageUri(""),
              },
            ]
          );
        } finally {
          setRecognizing(false);
        }
      }
    } catch (error) {
      console.error("[Overview] Failed to take photo:", error);
      const errorMessage = error instanceof Error ? error.message : "未知错误";

      Alert.alert("拍照失败", `${errorMessage}\n\n请重试`);
      setRecognizing(false);
    }
  };

  // 确认数量
  const handleConfirmQuantity = () => {
    if (quantity <= 0) {
      if (Platform.OS === "web") {
        window.alert("请输入有效的数量");
      } else {
        Alert.alert("提示", "请输入有效的数量");
      }
      return;
    }

    setShowQuantityModal(false);

    // 导航到存储位置输入页面
    router.push({
      pathname: "/add-product-location" as any,
      params: {
        detailImageUri: params.detailImageUri,
        overviewImageUri,
        sku: params.sku,
        quantity: quantity.toString(),
        isNewProduct: params.isNewProduct,
        mergeToProductId: params.mergeToProductId,
      },
    });
  };

  // Web 平台渲染
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

          {/* 加载指示器 */}
          {recognizing && (
            <View style={styles.webLoadingOverlay}>
              <ActivityIndicator color="#fff" size="large" />
              <ThemedText style={styles.webLoadingText}>
                AI 正在识别中，请稍候...
              </ThemedText>
            </View>
          )}

          {/* 相机组件 */}
          {!recognizing && !showQuantityModal && (
            <WebCamera
              hint="请将产品摊开放在深色背景上"
              subHint="确保白色标签清晰可见"
              buttonText="拍摄全景照"
              onPhotoTaken={handleWebPhotoTaken}
              disabled={recognizing}
            />
          )}

          {/* 数量确认弹窗 */}
          {showQuantityModal && (
            <View style={styles.webModalOverlay}>
              <View style={styles.webModalContent}>
                <ThemedText type="title" style={styles.modalTitle}>
                  确认数量
                </ThemedText>

                <ThemedText style={styles.modalHint}>
                  AI 识别到的数量，可手动修改
                </ThemedText>

                <TextInput
                  style={styles.webQuantityInput}
                  value={quantity.toString()}
                  onChange={(e) => {
                    const num = parseInt((e.target as HTMLInputElement).value) || 0;
                    setQuantity(num);
                  }}
                  type="number"
                  inputMode="numeric"
                />

                <View style={styles.modalButtons}>
                  <Pressable
                    style={[styles.modalButton, styles.retakeButton]}
                    onPress={() => {
                      setShowQuantityModal(false);
                      setOverviewImageUri("");
                    }}
                  >
                    <ThemedText style={styles.retakeButtonText}>重拍</ThemedText>
                  </Pressable>

                  <Pressable
                    style={[styles.modalButton, styles.confirmModalButton]}
                    onPress={handleConfirmQuantity}
                  >
                    <ThemedText style={styles.confirmModalButtonText}>
                      确认
                    </ThemedText>
                  </Pressable>
                </View>
              </View>
            </View>
          )}
        </View>
      </ThemedView>
    );
  }

  // 原生平台渲染
  if (!permission?.granted) {
    return (
      <ThemedView style={styles.container}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 20 }}>
          <ThemedText style={{ fontSize: 18, marginBottom: 12, textAlign: "center" }}>
            需要相机权限
          </ThemedText>
          <ThemedText style={{ fontSize: 14, opacity: 0.7, textAlign: "center" }}>
            请在浏览器设置中允许访问相机
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView ref={setCamera} style={styles.camera} facing="back">
        {/* 顶部提示 */}
        <View
          style={[
            styles.topBar,
            {
              paddingTop: Math.max(insets.top, 20),
            },
          ]}
        >
          <ThemedText style={styles.hint}>
            请将产品摊开放在深色背景上
          </ThemedText>
          <ThemedText style={styles.subHint}>
            确保白色标签清晰可见
          </ThemedText>
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
          <Pressable style={styles.cancelButton} onPress={() => router.back()}>
            <ThemedText style={styles.cancelButtonText}>返回</ThemedText>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.captureButton,
              { opacity: pressed ? 0.7 : 1 },
            ]}
            onPress={handleTakePhoto}
            disabled={recognizing}
          >
            {recognizing ? (
              <ActivityIndicator color="#000" size="large" />
            ) : (
              <View style={styles.captureButtonInner} />
            )}
          </Pressable>

          <View style={styles.placeholder} />
        </View>
      </CameraView>

      {/* 数量确认弹窗 */}
      <Modal
        visible={showQuantityModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowQuantityModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.keyboardView}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback>
                <View
                  style={[
                    styles.modalContent,
                    {
                      paddingBottom: Math.max(insets.bottom, 24),
                    },
                  ]}
                >
              <ThemedText type="title" style={styles.modalTitle}>
                确认数量
              </ThemedText>

              <ThemedText style={styles.modalHint}>
                AI 识别到的数量，可手动修改
              </ThemedText>

              <TextInput
                style={styles.quantityInput}
                value={quantity.toString()}
                onChangeText={(text) => {
                  const num = parseInt(text) || 0;
                  setQuantity(num);
                }}
                keyboardType="number-pad"
                selectTextOnFocus
              />

              <View style={styles.modalButtons}>
                <Pressable
                  style={[styles.modalButton, styles.retakeButton]}
                  onPress={() => {
                    Keyboard.dismiss();
                    setShowQuantityModal(false);
                    setOverviewImageUri("");
                  }}
                >
                  <ThemedText style={styles.retakeButtonText}>重拍</ThemedText>
                </Pressable>

                <Pressable
                  style={[styles.modalButton, styles.confirmModalButton]}
                  onPress={() => {
                    Keyboard.dismiss();
                    handleConfirmQuantity();
                  }}
                >
                  <ThemedText style={styles.confirmModalButtonText}>
                    确认
                  </ThemedText>
                </Pressable>
              </View>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>
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
  webLoadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 20,
  },
  webLoadingText: {
    color: "#fff",
    fontSize: 16,
    lineHeight: 24,
    marginTop: 16,
  },
  webModalOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    zIndex: 30,
  },
  webModalContent: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 400,
  },
  webQuantityInput: {
    height: 60,
    borderWidth: 2,
    borderColor: "#007AFF",
    borderRadius: 12,
    paddingHorizontal: 20,
    fontSize: 32,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 24,
    color: "#000",
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
  hint: {
    color: "#fff",
    fontSize: 16,
    lineHeight: 24,
    textAlign: "center",
  },
  subHint: {
    color: "#fff",
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.8,
    marginTop: 4,
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
  keyboardView: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 12,
    textAlign: "center",
    color: "#000",
  },
  modalHint: {
    fontSize: 15,
    marginBottom: 24,
    textAlign: "center",
    opacity: 0.7,
    color: "#000",
  },
  quantityInput: {
    height: 60,
    borderWidth: 2,
    borderColor: "#007AFF",
    borderRadius: 12,
    paddingHorizontal: 20,
    fontSize: 32,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 24,
    color: "#000",
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
  },
  modalButton: {
    flex: 1,
    height: 52,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  retakeButton: {
    backgroundColor: "#F2F2F7",
  },
  retakeButtonText: {
    color: "#000",
    fontSize: 17,
    fontWeight: "600",
  },
  confirmModalButton: {
    backgroundColor: "#007AFF",
  },
  confirmModalButtonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "600",
  },
});
