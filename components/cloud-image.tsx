import { Image, ImageStyle } from "expo-image";
import React, { useEffect, useState, memo } from "react";
import { ActivityIndicator, StyleProp, View, ViewStyle, Platform } from "react-native";
import { trpc } from "@/lib/trpc";
import { ProductStorage } from "@/lib/storage";

// 调试模式开关（生产环境设为 false）
const DEBUG_MODE = false;

interface CloudImageProps {
  /** 产品 ID，用于从云端或本地 IndexedDB 获取图片 */
  productId: string;
  /** 本地图片 URI（可能为空，轻量级查询不包含图片数据） */
  localUri?: string;
  /** 图片样式 */
  style?: StyleProp<ImageStyle>;
  /** 容器样式 */
  containerStyle?: StyleProp<ViewStyle>;
  /** 图片类型：detail 或 overview */
  imageType?: "detail" | "overview";
  /** 占位符背景色 */
  placeholderColor?: string;
}

/**
 * 将 base64 字符串转换为完整的 Data URL
 * 如果已经有前缀则直接返回，否则添加 JPEG 前缀
 */
function ensureDataUrl(uri: string): string {
  if (!uri || uri.length === 0) {
    return '';
  }
  // 如果已经是 Data URL 或普通 URL，直接返回
  if (uri.startsWith('data:') || uri.startsWith('http://') || uri.startsWith('https://') || uri.startsWith('file://')) {
    return uri;
  }
  // 否则添加 JPEG Data URL 前缀（云端存储的图片都是 JPEG 格式）
  return `data:image/jpeg;base64,${uri}`;
}

/**
 * 云端图片组件
 * 
 * 功能：
 * - 如果本地有图片数据（base64 或 URL），直接显示
 * - 如果本地没有图片数据（轻量级查询），从 IndexedDB 按需加载
 * - 如果是电脑 Web 端且 IndexedDB 也没有图片，从云端加载
 * - 显示加载状态
 * 
 * 性能优化：
 * - 使用 React.memo 避免不必要的重渲染
 * - 按需加载图片，避免一次性加载所有图片数据
 * - 移除生产环境的 console.log
 */
function CloudImageComponent({
  productId,
  localUri,
  style,
  containerStyle,
  imageType = "detail",
  placeholderColor = "#f0f0f0",
}: CloudImageProps) {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [hasTriedLocalLoad, setHasTriedLocalLoad] = useState(false);

  // 检测是否为电脑 Web 端
  const isDesktopWeb = Platform.OS === 'web' && 
    typeof window !== 'undefined' && 
    !/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(window.navigator?.userAgent || '');

  // 检测是否为手机 Web 端
  const isMobileWeb = Platform.OS === 'web' && !isDesktopWeb;

  // 使用 tRPC 获取图片（仅电脑 Web 端使用）
  const imageQuery = trpc.sync.getProductImage.useQuery(
    { id: productId },
    {
      enabled: false, // 手动触发
    }
  );

  useEffect(() => {
    if (DEBUG_MODE) {
      console.log('[CloudImage] useEffect triggered', { productId, localUri: localUri?.substring(0, 50), isDesktopWeb, isMobileWeb });
    }
    
    // 如果本地有图片，直接使用（确保有正确的 Data URL 前缀）
    if (localUri && localUri.length > 0) {
      const fullUri = ensureDataUrl(localUri);
      if (DEBUG_MODE) {
        console.log('[CloudImage] Using local URI, length:', fullUri.length);
      }
      setImageUri(fullUri);
      return;
    }

    // 如果是手机 Web 端且没有本地图片数据，从 IndexedDB 按需加载
    if (isMobileWeb && !localUri && !hasTriedLocalLoad) {
      if (DEBUG_MODE) {
        console.log('[CloudImage] Mobile Web without local image, loading from IndexedDB...');
      }
      loadImageFromIndexedDB();
      return;
    }

    // 如果是电脑 Web 端且没有本地图片，从云端加载
    if (isDesktopWeb && !localUri) {
      if (DEBUG_MODE) {
        console.log('[CloudImage] Desktop Web without local image, loading from cloud...');
      }
      loadImageFromCloud();
    }
  }, [localUri, productId, isDesktopWeb, isMobileWeb, hasTriedLocalLoad]);

  // 从 IndexedDB 加载图片（手机 Web 端使用）
  const loadImageFromIndexedDB = async () => {
    try {
      setLoading(true);
      setError(false);
      setHasTriedLocalLoad(true);
      
      const imageData = await ProductStorage.getProductImage(productId);
      
      if (imageData) {
        const uri = imageType === "detail" 
          ? imageData.detailImageUri 
          : imageData.overviewImageUri;
        
        if (uri && uri.length > 0) {
          const fullUri = ensureDataUrl(uri);
          setImageUri(fullUri);
          if (DEBUG_MODE) {
            console.log('[CloudImage] Loaded from IndexedDB, length:', fullUri.length);
          }
        } else {
          setError(true);
        }
      } else {
        setError(true);
      }
    } catch (err) {
      if (DEBUG_MODE) {
        console.error("[CloudImage] Failed to load image from IndexedDB:", err);
      }
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  // 从云端加载图片（电脑 Web 端使用）
  const loadImageFromCloud = async () => {
    try {
      setLoading(true);
      setError(false);
      
      const result = await imageQuery.refetch();
      
      if (result.data) {
        const uri = imageType === "detail" 
          ? result.data.detailImageUri 
          : result.data.overviewImageUri;
        
        if (uri && uri.length > 0) {
          setImageUri(uri);
        } else {
          setError(true);
        }
      } else {
        setError(true);
      }
    } catch (err) {
      if (DEBUG_MODE) {
        console.error("[CloudImage] Failed to load image from cloud:", err);
      }
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  // 如果正在加载，显示加载指示器
  if (loading) {
    return (
      <View style={[{ backgroundColor: placeholderColor, justifyContent: "center", alignItems: "center" }, style as ViewStyle, containerStyle]}>
        <ActivityIndicator size="small" color="#007AFF" />
      </View>
    );
  }

  // 如果有图片 URI，显示图片
  if (imageUri) {
    return (
      <Image
        source={{ uri: imageUri }}
        style={style}
        contentFit="cover"
        transition={200}
        // 性能优化：降低图片质量以减少内存使用
        cachePolicy="memory-disk"
      />
    );
  }

  // 如果没有图片且出错，显示占位符
  return (
    <View style={[{ backgroundColor: placeholderColor, justifyContent: "center", alignItems: "center" }, style as ViewStyle, containerStyle]}>
      {/* 占位符 */}
    </View>
  );
}

// 使用 React.memo 优化性能，避免不必要的重渲染
export const CloudImage = memo(CloudImageComponent);

export default CloudImage;
