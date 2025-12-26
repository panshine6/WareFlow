/**
 * 反馈类型定义
 */

export type FeedbackType = "bug" | "feature" | "question" | "other";

export interface Feedback {
  id: string;
  type: FeedbackType;
  description: string;
  screenshotUri?: string;
  deviceInfo: DeviceInfo;
  logs?: string[];
  createdAt: string;
}

export interface DeviceInfo {
  platform: string;
  osVersion: string;
  appVersion: string;
  deviceModel?: string;
}
