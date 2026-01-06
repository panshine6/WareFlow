/**
 * 版本检测和缓存清除模块
 * 
 * 功能：
 * 1. 检测应用版本变化（从动态 version.json 获取）
 * 2. 版本变化时自动清除浏览器缓存
 * 3. 可通过开关控制是否启用
 * 
 * 使用方法：
 * - 在应用入口调用 checkVersionAndClearCache()
 * - 调试完成后将 ENABLE_AUTO_CACHE_CLEAR 设为 false
 */

import { Platform } from 'react-native';
import { fetchVersionInfo, getVersionIdentifier } from './dynamic-version';
import { APP_VERSION, APP_BUILD } from './version';

// ============================================
// 🔧 调试开关 - 调试完成后设为 false
// ============================================
const ENABLE_AUTO_CACHE_CLEAR = true;

// 本地存储的版本键名
const VERSION_KEY = 'wareflow_app_version';
const BUILD_KEY = 'wareflow_app_build';

/**
 * 获取完整版本标识（优先使用动态版本）
 */
async function getFullVersionIdentifier(): Promise<string> {
  try {
    const dynamicVersion = await getVersionIdentifier();
    return dynamicVersion;
  } catch (error) {
    console.warn('[CacheBuster] Failed to get dynamic version, using static:', error);
    return `${APP_VERSION}-${APP_BUILD}`;
  }
}

/**
 * 清除所有浏览器缓存
 */
async function clearAllCaches(): Promise<void> {
  if (Platform.OS !== 'web') {
    console.log('[CacheBuster] Not on web platform, skipping cache clear');
    return;
  }

  console.log('[CacheBuster] Clearing all caches...');

  try {
    // 1. 清除 Service Worker 缓存
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map(cacheName => {
          console.log(`[CacheBuster] Deleting cache: ${cacheName}`);
          return caches.delete(cacheName);
        })
      );
      console.log(`[CacheBuster] Cleared ${cacheNames.length} cache(s)`);
    }

    // 2. 注销所有 Service Workers
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        registrations.map(registration => {
          console.log('[CacheBuster] Unregistering service worker');
          return registration.unregister();
        })
      );
      console.log(`[CacheBuster] Unregistered ${registrations.length} service worker(s)`);
    }

    // 3. 清除 localStorage（保留版本信息）
    const keysToKeep = [VERSION_KEY, BUILD_KEY];
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && !keysToKeep.includes(key)) {
        keysToRemove.push(key);
      }
    }
    // 注意：不清除 localStorage，因为里面有用户数据
    // keysToRemove.forEach(key => localStorage.removeItem(key));

    // 4. 清除 sessionStorage
    sessionStorage.clear();
    console.log('[CacheBuster] Cleared sessionStorage');

    console.log('[CacheBuster] All caches cleared successfully');
  } catch (error) {
    console.error('[CacheBuster] Failed to clear caches:', error);
  }
}

/**
 * 检查版本并在需要时清除缓存
 * 
 * @returns true 如果版本已更新并清除了缓存，false 否则
 */
export async function checkVersionAndClearCache(): Promise<boolean> {
  // 仅在 Web 平台执行
  if (Platform.OS !== 'web') {
    return false;
  }

  // 检查开关
  if (!ENABLE_AUTO_CACHE_CLEAR) {
    console.log('[CacheBuster] Auto cache clear is disabled');
    return false;
  }

  // 获取当前版本（优先使用动态版本）
  const currentVersion = await getFullVersionIdentifier();
  const storedVersion = localStorage.getItem(VERSION_KEY);

  console.log(`[CacheBuster] Current version: ${currentVersion}`);
  console.log(`[CacheBuster] Stored version: ${storedVersion}`);

  // 获取动态版本信息用于显示
  const versionInfo = await fetchVersionInfo();
  if (versionInfo) {
    console.log(`[CacheBuster] Build time: ${versionInfo.buildTime}`);
    console.log(`[CacheBuster] Commit hash: ${versionInfo.commitHash}`);
  }

  // 如果版本相同，不需要清除
  if (storedVersion === currentVersion) {
    console.log('[CacheBuster] Version unchanged, no action needed');
    return false;
  }

  // 版本不同，清除缓存
  console.log('[CacheBuster] Version changed! Clearing caches...');
  
  // 显示提示
  const message = storedVersion 
    ? `检测到新版本 (${storedVersion} → ${currentVersion})，正在更新...`
    : `首次加载版本 ${currentVersion}，正在初始化...`;
  
  // 在页面上显示提示（可选）
  showUpdateNotification(message);

  // 清除缓存
  await clearAllCaches();

  // 保存新版本号
  localStorage.setItem(VERSION_KEY, currentVersion);

  // 延迟后刷新页面
  setTimeout(() => {
    console.log('[CacheBuster] Reloading page...');
    window.location.reload();
  }, 1500);

  return true;
}

/**
 * 显示更新通知
 */
function showUpdateNotification(message: string): void {
  // 创建通知元素
  const notification = document.createElement('div');
  notification.id = 'cache-buster-notification';
  notification.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    z-index: 99999;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;

  notification.innerHTML = `
    <div style="
      background: white;
      padding: 32px 48px;
      border-radius: 16px;
      text-align: center;
      max-width: 400px;
    ">
      <div style="
        width: 48px;
        height: 48px;
        border: 4px solid #007AFF;
        border-top-color: transparent;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin: 0 auto 16px;
      "></div>
      <div style="
        font-size: 18px;
        font-weight: 600;
        color: #333;
        margin-bottom: 8px;
      ">正在更新应用</div>
      <div style="
        font-size: 14px;
        color: #666;
      ">${message}</div>
    </div>
    <style>
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    </style>
  `;

  document.body.appendChild(notification);
}

/**
 * 手动强制清除缓存并刷新
 * 可在控制台调用：window.forceClearCache()
 */
export async function forceClearCache(): Promise<void> {
  if (Platform.OS !== 'web') {
    console.log('[CacheBuster] Not on web platform');
    return;
  }

  console.log('[CacheBuster] Force clearing all caches...');
  
  // 清除版本记录，强制触发更新
  localStorage.removeItem(VERSION_KEY);
  
  await clearAllCaches();
  
  // 刷新页面
  window.location.reload();
}

/**
 * 获取当前版本信息（用于显示）
 */
export async function getCurrentVersionInfo() {
  const versionInfo = await fetchVersionInfo();
  if (versionInfo) {
    return {
      version: versionInfo.version,
      buildTime: versionInfo.buildTime,
      commitHash: versionInfo.commitHash,
      source: 'dynamic'
    };
  }
  return {
    version: `${APP_VERSION}-${APP_BUILD}`,
    buildTime: new Date().toISOString(),
    commitHash: 'unknown',
    source: 'static'
  };
}

// 将强制清除函数暴露到全局，方便调试
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  (window as any).forceClearCache = forceClearCache;
  (window as any).checkVersionAndClearCache = checkVersionAndClearCache;
  (window as any).getCurrentVersionInfo = getCurrentVersionInfo;
}
