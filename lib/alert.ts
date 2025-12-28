import { Alert as RNAlert, Platform } from "react-native";

/**
 * 跨平台 Alert 工具
 * 在 Web 平台使用 window.alert/confirm，在原生平台使用 React Native Alert
 */
export const Alert = {
  /**
   * 显示简单的提示框
   * @param title 标题
   * @param message 消息内容
   * @param buttons 按钮配置（可选）
   */
  alert(
    title: string,
    message?: string,
    buttons?: Array<{
      text: string;
      onPress?: () => void;
      style?: "default" | "cancel" | "destructive";
    }>
  ): void {
    if (Platform.OS === "web") {
      // Web 平台：使用 window.alert
      const fullMessage = message ? `${title}\n\n${message}` : title;
      window.alert(fullMessage);
      
      // 执行第一个按钮的回调（通常是"确定"按钮）
      if (buttons && buttons.length > 0 && buttons[0].onPress) {
        buttons[0].onPress();
      }
    } else {
      // 原生平台：使用 React Native Alert
      RNAlert.alert(title, message, buttons);
    }
  },

  /**
   * 显示确认对话框（带"取消"和"确定"按钮）
   * @param title 标题
   * @param message 消息内容
   * @param onConfirm 确认回调
   * @param onCancel 取消回调（可选）
   */
  confirm(
    title: string,
    message: string,
    onConfirm: () => void | Promise<void>,
    onCancel?: () => void | Promise<void>
  ): void {
    if (Platform.OS === "web") {
      // Web 平台：使用 window.confirm
      const fullMessage = `${title}\n\n${message}`;
      const result = window.confirm(fullMessage);
      
      if (result) {
        onConfirm();
      } else if (onCancel) {
        onCancel();
      }
    } else {
      // 原生平台：使用 React Native Alert
      RNAlert.alert(title, message, [
        {
          text: "取消",
          style: "cancel",
          onPress: onCancel,
        },
        {
          text: "确定",
          onPress: onConfirm,
        },
      ]);
    }
  },

  /**
   * 显示带三个按钮的对话框
   * @param title 标题
   * @param message 消息内容
   * @param buttons 按钮配置数组
   */
  show(
    title: string,
    message: string,
    buttons: Array<{
      text: string;
      onPress?: () => void;
      style?: "default" | "cancel" | "destructive";
    }>
  ): void {
    if (Platform.OS === "web") {
      // Web 平台：简化为 confirm 或 alert
      if (buttons.length === 1) {
        // 单按钮：使用 alert
        const fullMessage = `${title}\n\n${message}`;
        window.alert(fullMessage);
        if (buttons[0].onPress) {
          buttons[0].onPress();
        }
      } else if (buttons.length === 2) {
        // 双按钮：使用 confirm
        const fullMessage = `${title}\n\n${message}`;
        const result = window.confirm(fullMessage);
        
        if (result) {
          // 确定按钮（通常是第二个）
          if (buttons[1].onPress) {
            buttons[1].onPress();
          }
        } else {
          // 取消按钮（通常是第一个）
          if (buttons[0].onPress) {
            buttons[0].onPress();
          }
        }
      } else {
        // 三个或更多按钮：降级为 alert，只执行第一个非取消按钮
        const fullMessage = `${title}\n\n${message}\n\n可选操作：${buttons.map(b => b.text).join(" / ")}`;
        window.alert(fullMessage);
        
        // 找到第一个非取消按钮并执行
        const defaultButton = buttons.find(b => b.style !== "cancel");
        if (defaultButton?.onPress) {
          defaultButton.onPress();
        }
      }
    } else {
      // 原生平台：使用 React Native Alert
      RNAlert.alert(title, message, buttons);
    }
  },
};
