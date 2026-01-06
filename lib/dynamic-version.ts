/**
 * 动态版本检测模块
 * 
 * 从 public/version.json 获取版本信息
 * 该文件由 GitHub Actions 在每次推送时自动生成
 */

export interface VersionInfo {
  version: string;
  buildTime: string;
  commitHash: string;
}

// 缓存版本信息
let cachedVersion: VersionInfo | null = null;

/**
 * 获取动态版本信息
 * 从 /version.json 获取由 CI/CD 生成的版本号
 */
export async function fetchVersionInfo(): Promise<VersionInfo | null> {
  // 如果已缓存，直接返回
  if (cachedVersion) {
    return cachedVersion;
  }

  try {
    // 添加时间戳避免缓存
    const timestamp = Date.now();
    const response = await fetch(`/version.json?t=${timestamp}`, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });

    if (!response.ok) {
      console.warn('[DynamicVersion] Failed to fetch version.json:', response.status);
      return null;
    }

    const data = await response.json();
    cachedVersion = {
      version: data.version || 'unknown',
      buildTime: data.buildTime || new Date().toISOString(),
      commitHash: data.commitHash || 'unknown'
    };

    console.log('[DynamicVersion] Fetched version:', cachedVersion);
    return cachedVersion;
  } catch (error) {
    console.warn('[DynamicVersion] Error fetching version.json:', error);
    return null;
  }
}

/**
 * 获取版本标识符（用于缓存比较）
 */
export async function getVersionIdentifier(): Promise<string> {
  const versionInfo = await fetchVersionInfo();
  if (versionInfo) {
    return versionInfo.version;
  }
  // 回退到静态版本
  const { APP_VERSION, APP_BUILD } = await import('./version');
  return `${APP_VERSION}-${APP_BUILD}`;
}

/**
 * 清除版本缓存（用于强制重新获取）
 */
export function clearVersionCache(): void {
  cachedVersion = null;
}
