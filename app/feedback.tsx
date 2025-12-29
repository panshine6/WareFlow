import { useRouter } from "expo-router";
import { useState, useEffect } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  ActivityIndicator,
} from "react-native";
import { Alert } from "@/lib/alert";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import {
  getDeviceInfo,
  sendFeedbackEmail,
  createFeedback,
} from "@/lib/feedback";
import type { FeedbackType } from "@/types/feedback";

/**
 * 用户反馈页面
 */
export default function FeedbackScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [type, setType] = useState<FeedbackType>("bug");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const feedbackTypes: { value: FeedbackType; label: string; emoji: string }[] =
    [
      { value: "bug", label: "错误报告", emoji: "🐛" },
      { value: "feature", label: "功能建议", emoji: "💡" },
      { value: "question", label: "使用问题", emoji: "❓" },
      { value: "other", label: "其他反馈", emoji: "💬" },
    ];

  const handleSubmit = async () => {
    if (!description.trim()) {
      Alert.alert("提示", "请输入反馈内容");
      return;
    }

    setSubmitting(true);

    try {
      // 获取设备信息
      const deviceInfo = await getDeviceInfo();

      // 创建反馈对象
      const feedback = createFeedback(type, description, deviceInfo);

      // 发送反馈邮件
      await sendFeedbackEmail(feedback);

      if (Platform.OS === "web") {
        window.alert("感谢反馈！\n\n您的反馈已成功提交");
        router.back();
      } else {
        Alert.alert("感谢反馈！", "您的反馈已成功提交", [
          {
            text: "确定",
            onPress: () => router.back(),
          },
        ]);
      }
    } catch (error) {
      console.error("Submit feedback error:", error);
      
      // 如果邮件发送失败，提供复制功能
      const errorMessage = error instanceof Error ? error.message : "未知错误";
      
      if (errorMessage.includes("不支持邮件功能")) {
        Alert.confirm(
          "提交失败",
          "您的设备不支持邮件功能。是否复制反馈内容到剪贴板？",
          async () => {
            const deviceInfo = await getDeviceInfo();
            const feedbackText = `
反馈类型: ${feedbackTypes.find((t) => t.value === type)?.label}
问题描述: ${description}

设备信息:
- 平台: ${deviceInfo.platform}
- 系统版本: ${deviceInfo.osVersion}
- 应用版本: ${deviceInfo.appVersion}
- 设备型号: ${deviceInfo.deviceModel}
            `.trim();

            await Clipboard.setStringAsync(feedbackText);
            Alert.alert("已复制", "反馈内容已复制到剪贴板，请通过其他方式发送给开发者");
            router.back();
          }
        );
      } else {
        Alert.alert("提交失败", "请稍后重试或联系开发者");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Math.max(insets.top, 20),
            paddingBottom: Math.max(insets.bottom, 20) + 80,
          },
        ]}
      >
        {/* 标题 */}
        <ThemedText type="title" style={styles.title}>
          反馈与建议
        </ThemedText>
        <ThemedText style={styles.subtitle}>
          遇到问题或有好的想法？告诉我们吧！
        </ThemedText>

        {/* 反馈类型选择 */}
        <View style={styles.section}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>
            反馈类型
          </ThemedText>
          <View style={styles.typeContainer}>
            {feedbackTypes.map((item) => (
              <Pressable
                key={item.value}
                style={[
                  styles.typeButton,
                  type === item.value && styles.typeButtonActive,
                ]}
                onPress={() => setType(item.value)}
              >
                <ThemedText style={styles.typeEmoji}>{item.emoji}</ThemedText>
                <ThemedText
                  style={[
                    styles.typeLabel,
                    type === item.value && styles.typeLabelActive,
                  ]}
                >
                  {item.label}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        </View>

        {/* 问题描述 */}
        <View style={styles.section}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>
            详细描述
          </ThemedText>
          <TextInput
            style={styles.textArea}
            placeholder="请详细描述您遇到的问题或建议..."
            placeholderTextColor="#999"
            multiline
            numberOfLines={8}
            value={description}
            onChangeText={setDescription}
            textAlignVertical="top"
          />
          <ThemedText style={styles.hint}>
            💡 提示：详细的描述有助于我们更快地解决问题
          </ThemedText>
        </View>
      </ScrollView>

      {/* 底部按钮 */}
      <View
        style={[
          styles.footer,
          {
            paddingBottom: Math.max(insets.bottom, 20),
          },
        ]}
      >
        <Pressable
          style={[styles.button, styles.cancelButton]}
          onPress={() => router.back()}
          disabled={submitting}
        >
          <ThemedText style={styles.cancelButtonText}>取消</ThemedText>
        </Pressable>
        <Pressable
          style={[styles.button, styles.submitButton]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <ThemedText style={styles.submitButtonText}>提交反馈</ThemedText>
          )}
        </Pressable>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  title: {
    marginBottom: 8,
  },
  subtitle: {
    color: "#666",
    marginBottom: 24,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    marginBottom: 12,
  },
  typeContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  typeButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: "#f5f5f5",
    borderWidth: 2,
    borderColor: "transparent",
  },
  typeButtonActive: {
    backgroundColor: "#E6F4FE",
    borderColor: "#007AFF",
  },
  typeEmoji: {
    fontSize: 20,
    marginRight: 8,
  },
  typeLabel: {
    fontSize: 14,
    color: "#666",
  },
  typeLabelActive: {
    color: "#007AFF",
    fontWeight: "600",
  },
  textArea: {
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    minHeight: 150,
    color: "#000",
  },
  hint: {
    fontSize: 12,
    color: "#999",
    marginTop: 8,
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    gap: 12,
    padding: 20,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e0e0e0",
  },
  button: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButton: {
    backgroundColor: "#f5f5f5",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#666",
  },
  submitButton: {
    backgroundColor: "#007AFF",
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
});
