import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Platform } from 'react-native';
import { initDatabase } from '@/lib/database-init';

interface DatabaseContextType {
  isReady: boolean;
  error: Error | null;
  retry: () => void;
}

const DatabaseContext = createContext<DatabaseContextType>({
  isReady: false,
  error: null,
  retry: () => {},
});

export const useDatabaseReady = () => useContext(DatabaseContext);

interface Props {
  children: ReactNode;
}

/**
 * 数据库初始化提供者
 * 确保数据库初始化完成后再渲染子组件
 * 提供友好的加载和错误状态
 */
export function DatabaseProvider({ children }: Props) {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [retryCount, setRetryCount] = useState(0);

  const initializeDatabase = async () => {
    setIsInitializing(true);
    setError(null);

    try {
      // 添加超时机制
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('数据库初始化超时，请刷新页面重试')), 15000);
      });

      await Promise.race([initDatabase(), timeoutPromise]);
      
      setIsReady(true);
      console.log('[DatabaseProvider] Database initialized successfully');
    } catch (err: any) {
      console.error('[DatabaseProvider] Database initialization failed:', err);
      setError(err);
      setIsReady(false);
    } finally {
      setIsInitializing(false);
    }
  };

  useEffect(() => {
    initializeDatabase();
  }, [retryCount]);

  const retry = () => {
    setRetryCount(prev => prev + 1);
  };

  const handleRefresh = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  // 显示加载状态
  if (isInitializing) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>正在初始化数据库...</Text>
        <Text style={styles.hint}>首次加载可能需要几秒钟</Text>
      </View>
    );
  }

  // 显示错误状态
  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContent}>
          <Text style={styles.emoji}>⚠️</Text>
          <Text style={styles.title}>数据库初始化失败</Text>
          <Text style={styles.message}>{error.message}</Text>
          
          <View style={styles.buttonContainer}>
            <Pressable style={styles.button} onPress={retry}>
              <Text style={styles.buttonText}>重试</Text>
            </Pressable>
            
            {Platform.OS === 'web' && (
              <Pressable style={[styles.button, styles.refreshButton]} onPress={handleRefresh}>
                <Text style={styles.buttonText}>刷新页面</Text>
              </Pressable>
            )}
          </View>

          <Text style={styles.troubleshoot}>
            故障排除建议：{'\n'}
            • 关闭其他使用此应用的标签页{'\n'}
            • 清理浏览器缓存后重试{'\n'}
            • 如果问题持续，请联系技术支持
          </Text>
        </View>
      </View>
    );
  }

  return (
    <DatabaseContext.Provider value={{ isReady, error, retry }}>
      {children}
    </DatabaseContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#333',
  },
  hint: {
    marginTop: 8,
    fontSize: 12,
    color: '#999',
  },
  errorContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    maxWidth: 400,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  emoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  refreshButton: {
    backgroundColor: '#34C759',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  troubleshoot: {
    fontSize: 12,
    color: '#999',
    textAlign: 'left',
    lineHeight: 20,
  },
});

export default DatabaseProvider;
