import { CameraView, useCameraPermissions } from "expo-camera";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { countProductsInImage } from "@/lib/ai-vision";
import { File } from "expo-file-system";

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

  // 拍照并识别
  const handleTakePhoto = async () => {
    if (!camera) return;

    try {
      const photo = await camera.takePictureAsync({
        quality: 0.8,
        base64: false,
      });

      if (photo) {
        setOverviewImageUri(photo.uri);
        setRecognizing(true);

        try {
          // 读取图片并转换为 Base64
          const file = new File(photo.uri);
          const arrayBuffer = await file.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          
          // 转换为 Base64
          let binary = '';
          for (let i = 0; i < uint8Array.length; i++) {
            binary += String.fromCharCode(uint8Array[i]);
          }
          const base64 = btoa(binary);

          // 调用真实的 AI 识别
          const count = await countProductsInImage(base64);

          setQuantity(count);
          setShowQuantityModal(true);
        } catch (error) {
          console.error("AI recognition error:", error);
          Alert.alert(
            "识别失败",
            "无法识别产品数量，请手动输入",
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
      console.error("Failed to take photo:", error);
      Alert.alert("拍照失败", "请重试");
    }
  };

  // 确认数量
  const handleConfirmQuantity = () => {
    if (quantity <= 0) {
      Alert.alert("提示", "请输入有效的数量");
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

  if (!permission?.granted) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>需要相机权限</ThemedText>
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
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 24,
    paddingHorizontal: 24,
  },
  modalTitle: {
    textAlign: "center",
    marginBottom: 8,
  },
  modalHint: {
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.7,
    textAlign: "center",
    marginBottom: 24,
  },
  quantityInput: {
    height: 80,
    backgroundColor: "rgba(0, 0, 0, 0.05)",
    borderRadius: 16,
    fontSize: 48,
    lineHeight: 56,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 24,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
  },
  modalButton: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  retakeButton: {
    backgroundColor: "rgba(0, 0, 0, 0.1)",
  },
  retakeButtonText: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "600",
  },
  confirmModalButton: {
    backgroundColor: "#007AFF",
  },
  confirmModalButtonText: {
    color: "#fff",
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "600",
  },
});
