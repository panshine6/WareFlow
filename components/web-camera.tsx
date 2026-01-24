/**
 * Web 平台相机组件
 * 使用 HTML5 input[type=file] 实现，兼容 iOS Safari
 * 拍照后自动压缩图片到 512×512 以内（与云端存储一致）
 */
import { useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from "react-native";
import { ThemedText } from "./themed-text";
import { compressImage, base64ToDataUrl } from "@/lib/image-utils";

interface WebCameraProps {
  onPhotoTaken: (uri: string, base64: string) => void;
  disabled?: boolean;
  buttonText?: string;
  hint?: string;
  subHint?: string;
}

// 图片压缩配置 - 与云端存储一致，减少本地存储占用
const IMAGE_MAX_SIZE = 512; // 最大边长（与云端一致）
const IMAGE_QUALITY = 0.6; // JPEG 质量（与云端一致）

export function WebCamera({
  onPhotoTaken,
  disabled = false,
  buttonText = "拍照",
  hint,
  subHint,
}: WebCameraProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [compressing, setCompressing] = useState(false);

  const handleFileChange = async (event: Event) => {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];

    if (!file) return;

    try {
      setCompressing(true);
      console.log("[WebCamera] Processing image:", file.name, `(${(file.size / 1024).toFixed(1)}KB)`);

      // 读取文件为 base64
      const reader = new FileReader();
      
      const result = await new Promise<string>((resolve, reject) => {
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // 提取原始 base64
      const originalBase64 = result.split(",")[1];
      console.log("[WebCamera] Original base64 length:", originalBase64.length);

      // 压缩图片到 512×512 以内（与云端一致）
      console.log("[WebCamera] Compressing image to max", IMAGE_MAX_SIZE, "px...");
      const compressedBase64 = await compressImage(originalBase64, IMAGE_MAX_SIZE, IMAGE_QUALITY);
      
      // 生成 Data URL
      const dataUrl = base64ToDataUrl(compressedBase64);
      
      console.log("[WebCamera] Compression complete, calling onPhotoTaken");
      onPhotoTaken(dataUrl, compressedBase64);
    } catch (error) {
      console.error("[WebCamera] Failed to process file:", error);
      alert("处理照片失败，请重试");
    } finally {
      setCompressing(false);
      // 清空 input，允许重复选择同一文件
      target.value = "";
    }
  };

  const handleTakePhoto = () => {
    if (Platform.OS === "web" && fileInputRef.current && !compressing) {
      fileInputRef.current.click();
    }
  };

  return (
    <View style={styles.container}>
      {/* 隐藏的文件输入 */}
      {Platform.OS === "web" && (
        <input
          ref={fileInputRef as any}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: "none" }}
          onChange={handleFileChange as any}
        />
      )}

      {/* 提示文字 */}
      {(hint || subHint) && (
        <View style={styles.hintContainer}>
          {hint && <ThemedText style={styles.hint}>{hint}</ThemedText>}
          {subHint && <ThemedText style={styles.subHint}>{subHint}</ThemedText>}
        </View>
      )}

      {/* 压缩中提示 */}
      {compressing && (
        <View style={styles.compressingContainer}>
          <ActivityIndicator size="small" color="#fff" />
          <ThemedText style={styles.compressingText}>正在处理图片...</ThemedText>
        </View>
      )}

      {/* 拍照按钮 */}
      <View style={styles.buttonContainer}>
        <Pressable
          style={({ pressed }) => [
            styles.captureButton,
            { opacity: pressed || disabled || compressing ? 0.7 : 1 },
          ]}
          onPress={handleTakePhoto}
          disabled={disabled || compressing}
        >
          <View style={styles.captureButtonInner} />
        </Pressable>
        <ThemedText style={styles.buttonText}>{buttonText}</ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
    padding: 20,
  },
  hintContainer: {
    alignItems: "center",
    marginBottom: 40,
  },
  hint: {
    color: "#fff",
    fontSize: 18,
    lineHeight: 26,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 8,
  },
  subHint: {
    color: "#fff",
    fontSize: 15,
    lineHeight: 22,
    opacity: 0.9,
    textAlign: "center",
  },
  compressingContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    gap: 8,
  },
  compressingText: {
    color: "#fff",
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.9,
  },
  buttonContainer: {
    alignItems: "center",
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  captureButtonInner: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "#fff",
    borderWidth: 4,
    borderColor: "#000",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "500",
  },
});
