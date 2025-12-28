/**
 * Web 平台相机组件
 * 使用 HTML5 input[type=file] 实现，兼容 iOS Safari
 */
import { useRef } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { ThemedText } from "./themed-text";

interface WebCameraProps {
  onPhotoTaken: (uri: string, base64: string) => void;
  disabled?: boolean;
  buttonText?: string;
  hint?: string;
  subHint?: string;
}

export function WebCamera({
  onPhotoTaken,
  disabled = false,
  buttonText = "拍照",
  hint,
  subHint,
}: WebCameraProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (event: Event) => {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];

    if (!file) return;

    try {
      // 读取文件为 base64
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        // 移除 data:image/...;base64, 前缀
        const base64Data = result.split(",")[1];
        // 创建临时 URL 用于预览
        const uri = URL.createObjectURL(file);
        onPhotoTaken(uri, base64Data);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("[WebCamera] Failed to read file:", error);
      alert("读取照片失败，请重试");
    }

    // 清空 input，允许重复选择同一文件
    target.value = "";
  };

  const handleTakePhoto = () => {
    if (Platform.OS === "web" && fileInputRef.current) {
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

      {/* 拍照按钮 */}
      <View style={styles.buttonContainer}>
        <Pressable
          style={({ pressed }) => [
            styles.captureButton,
            { opacity: pressed || disabled ? 0.7 : 1 },
          ]}
          onPress={handleTakePhoto}
          disabled={disabled}
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
