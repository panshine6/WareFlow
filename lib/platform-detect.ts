import { Platform } from "react-native";

/**
 * 平台检测工具
 * 用于区分不同的运行环境
 */

/**
 * 检测是否为 Web 平台
 */
export const isWeb = Platform.OS === 'web';

/**
 * 检测是否为手机 Web 端（通过 User Agent）
 */
export const isMobileWeb = (): boolean => {
  if (!isWeb) return false;
  if (typeof window === 'undefined' || !window.navigator) return false;
  
  const userAgent = window.navigator.userAgent || '';
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
};

/**
 * 检测是否为电脑 Web 端
 */
export const isDesktopWeb = (): boolean => {
  return isWeb && !isMobileWeb();
};

/**
 * 检测是否为原生 App（iOS/Android）
 */
export const isNativeApp = Platform.OS === 'ios' || Platform.OS === 'android';

/**
 * 获取当前平台类型
 */
export type PlatformType = 'mobile-web' | 'desktop-web' | 'native-app';

export const getPlatformType = (): PlatformType => {
  if (isNativeApp) return 'native-app';
  if (isMobileWeb()) return 'mobile-web';
  return 'desktop-web';
};
