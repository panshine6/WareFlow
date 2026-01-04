import { Image, ImageStyle } from "expo-image";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleProp, View, ViewStyle, Platform } from "react-native";
import { trpc } from "@/lib/trpc";

interface CloudImageProps {
  /** 产品 ID，用于从云端获取图片 */
  productId: string;
  /** 本地图片 URI（可能为空） */
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
 * 云端图片组件
 * 
 * 功能：
 * - 如果本地有图片数据（base64 或 URL），直接显示
 * - 如果本地没有图片数据（Web 端下载时不含图片），从云端按需加载
 * - 显示加载状态
 */
export function CloudImage({
  productId,
  localUri,
  style,
  containerStyle,
  imageType = "detail",
  placeholderColor = "#f0f0f0",
}: CloudImageProps) {
  const [imageUri, setImageUri] = useState<string | null>(localUri || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  // 检测是否为电脑 Web 端
  const isDesktopWeb = Platform.OS === 'web' && 
    typeof window !== 'undefined' && 
    !/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(window.navigator?.userAgent || '');

  // 使用 tRPC 获取图片
  const imageQuery = trpc.sync.getProductImage.useQuery(
    { id: productId },
    {
      enabled: false, // 手动触发
    }
  );

  useEffect(() => {
    console.log('[CloudImage] useEffect triggered', { productId, localUri: localUri?.substring(0, 50), isDesktopWeb });
    
    // 如果本地有图片，直接使用
    if (localUri && localUri.length > 0) {
      console.log('[CloudImage] Using local URI');
      setImageUri(localUri);
      return;
    }

    // 如果是电脑 Web 端且没有本地图片，从云端加载
    if (isDesktopWeb && !localUri) {
      console.log('[CloudImage] Desktop Web without local image, loading from cloud...');
      loadImageFromCloud();
    } else {
      console.log('[CloudImage] Not loading from cloud', { isDesktopWeb, hasLocalUri: !!localUri });
    }
  }, [localUri, productId, isDesktopWeb]);

  const loadImageFromCloud = async () => {
    try {
      setLoading(true);
      setError(false);
      console.log('[CloudImage] loadImageFromCloud called for productId:', productId);
      
      const result = await imageQuery.refetch();
      console.log('[CloudImage] Query result:', { hasData: !!result.data, error: result.error });
      
      if (result.data) {
        const uri = imageType === "detail" 
          ? result.data.detailImageUri 
          : result.data.overviewImageUri;
        
        console.log('[CloudImage] Image URI from cloud:', uri?.substring(0, 100));
        
        if (uri && uri.length > 0) {
          setImageUri(uri);
          console.log('[CloudImage] Image URI set successfully');
        } else {
          console.log('[CloudImage] No image URI in response');
          setError(true);
        }
      } else {
        console.log('[CloudImage] No data in response');
        setError(true);
      }
    } catch (err) {
      console.error("[CloudImage] Failed to load image:", err);
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

export default CloudImage;
