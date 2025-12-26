import * as Device from "expo-device";
import * as MailComposer from "expo-mail-composer";
import { Platform } from "react-native";
import Constants from "expo-constants";
import type { Feedback, DeviceInfo } from "@/types/feedback";

/**
 * 获取设备信息
 */
export async function getDeviceInfo(): Promise<DeviceInfo> {
  return {
    platform: Platform.OS,
    osVersion: Platform.Version.toString(),
    appVersion: Constants.expoConfig?.version || "1.0.0",
    deviceModel: Device.modelName || "Unknown",
  };
}

/**
 * 发送反馈邮件
 */
export async function sendFeedbackEmail(feedback: Feedback): Promise<boolean> {
  try {
    // 检查邮件功能是否可用
    const isAvailable = await MailComposer.isAvailableAsync();
    if (!isAvailable) {
      throw new Error("设备不支持邮件功能");
    }

    // 准备邮件内容
    const subject = `[饰品入库助手] ${getFeedbackTypeLabel(feedback.type)} - ${new Date().toLocaleDateString()}`;
    
    const body = `
反馈类型: ${getFeedbackTypeLabel(feedback.type)}
提交时间: ${new Date(feedback.createdAt).toLocaleString("zh-CN")}

问题描述:
${feedback.description}

---
设备信息:
- 平台: ${feedback.deviceInfo.platform}
- 系统版本: ${feedback.deviceInfo.osVersion}
- 应用版本: ${feedback.deviceInfo.appVersion}
- 设备型号: ${feedback.deviceInfo.deviceModel}

${feedback.logs && feedback.logs.length > 0 ? `\n日志信息:\n${feedback.logs.join("\n")}` : ""}
    `.trim();

    // 发送邮件
    const options: MailComposer.MailComposerOptions = {
      recipients: ["feedback@manus.im"], // 反馈邮箱
      subject,
      body,
      isHtml: false,
    };

    // 如果有截图，添加附件
    if (feedback.screenshotUri) {
      options.attachments = [feedback.screenshotUri];
    }

    const result = await MailComposer.composeAsync(options);
    return result.status === MailComposer.MailComposerStatus.SENT;
  } catch (error) {
    console.error("Failed to send feedback email:", error);
    throw error;
  }
}

/**
 * 获取反馈类型的中文标签
 */
function getFeedbackTypeLabel(type: Feedback["type"]): string {
  const labels = {
    bug: "错误报告",
    feature: "功能建议",
    question: "使用问题",
    other: "其他反馈",
  };
  return labels[type];
}

/**
 * 创建反馈对象
 */
export function createFeedback(
  type: Feedback["type"],
  description: string,
  deviceInfo: DeviceInfo,
  screenshotUri?: string,
  logs?: string[]
): Feedback {
  return {
    id: Date.now().toString(),
    type,
    description,
    screenshotUri,
    deviceInfo,
    logs,
    createdAt: new Date().toISOString(),
  };
}
