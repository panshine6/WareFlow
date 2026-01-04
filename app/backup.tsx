import { useRouter } from 'expo-router';
import React, { useState, useEffect } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Paths, File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { BackupAdapter, ProductStorageAdapter } from '@/lib/storage-adapter';

/**
 * 备份管理页面
 * 支持导出和导入数据
 */
export default function BackupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [stats, setStats] = useState<{
    totalProducts: number;
    activeProducts: number;
    deletedProducts: number;
  } | null>(null);

  // 加载统计信息
  const loadStats = async () => {
    try {
      const data = await ProductStorageAdapter.getStats();
      setStats(data);
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  // 页面加载时获取统计信息
  useEffect(() => {
    loadStats();
  }, []);

  // 导出数据
  const handleExport = async () => {
    setExporting(true);
    try {
      // 生成备份数据
      const jsonString = await BackupAdapter.exportData();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const filename = `ladybuty-backup-${timestamp}.json`;

      if (Platform.OS === 'web') {
        // Web 平台：使用浏览器下载
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        // 计算文件大小（MB）
        const fileSizeMB = (blob.size / (1024 * 1024)).toFixed(1);
        
        // 延迟显示提示，让用户有时间完成下载操作
        setTimeout(() => {
          window.alert(
            `✅ 备份文件已开始下载！\n\n` +
            `📁 文件名：${filename}\n` +
            `📊 文件大小：${fileSizeMB} MB\n\n` +
            `⏳ 如果文件较大，根据网络情况可能需要 2-3 分钟完成下载。\n\n` +
            `💡 下载完成后如何找到文件：\n` +
            `• iPhone：打开「文件」App → 「下载」文件夹\n` +
            `• Android：打开「下载」或「文件管理器」\n` +
            `• 电脑：查看浏览器下载列表或下载文件夹`
          );
        }, 3000);
      } else {
        // 原生平台：使用文件系统
        const file = new File(Paths.cache, filename);
        await file.create();
        await file.write(jsonString);

        // 分享文件
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(file.uri, {
            mimeType: 'application/json',
            dialogTitle: '保存备份文件',
            UTI: 'public.json',
          });
        } else {
          Alert.alert('成功', `备份文件已保存到：${file.uri}`);
        }
      }
    } catch (error) {
      console.error('Export failed:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (Platform.OS === 'web') {
        window.alert(`导出失败：${errorMessage}`);
      } else {
        Alert.alert('错误', `导出失败：${errorMessage}`);
      }
    } finally {
      setExporting(false);
    }
  };

  // 导入数据
  const handleImport = async () => {
    try {
      if (Platform.OS === 'web') {
        // Web 平台：使用文件选择器
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json,.json';
        input.onchange = async (e: any) => {
          const file = e.target.files?.[0];
          if (!file) return;

          setImporting(true);
          try {
            const reader = new FileReader();
            reader.onload = async (event) => {
              try {
                const jsonString = event.target?.result as string;
                await BackupAdapter.importData(jsonString);
                await loadStats();
                window.alert('数据导入成功！');
              } catch (error) {
                console.error('Import failed:', error);
                const errorMessage = error instanceof Error ? error.message : String(error);
                window.alert(`导入失败：${errorMessage}`);
              } finally {
                setImporting(false);
              }
            };
            reader.readAsText(file);
          } catch (error) {
            setImporting(false);
            console.error('Import failed:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            window.alert(`导入失败：${errorMessage}`);
          }
        };
        input.click();
      } else {
        // 原生平台：使用文档选择器
        const result = await DocumentPicker.getDocumentAsync({
          type: 'application/json',
          copyToCacheDirectory: true,
        });

        if (result.canceled) {
          return;
        }

        setImporting(true);
        try {
          const fileUri = result.assets[0].uri;
          const file = new File(fileUri);
          const jsonString = await file.text();

          await BackupAdapter.importData(jsonString);
          await loadStats();
          Alert.alert('成功', '数据导入成功！');
        } catch (error) {
          console.error('Import failed:', error);
          const errorMessage = error instanceof Error ? error.message : String(error);
          Alert.alert('错误', `导入失败：${errorMessage}`);
        } finally {
          setImporting(false);
        }
      }
    } catch (error) {
      console.error('Import failed:', error);
      setImporting(false);
    }
  };

  // 确认导入
  const confirmImport = () => {
    if (Platform.OS === 'web') {
      if (window.confirm('导入数据将覆盖当前所有数据，是否继续？')) {
        handleImport();
      }
    } else {
      Alert.alert(
        '确认导入',
        '导入数据将覆盖当前所有数据，是否继续？',
        [
          { text: '取消', style: 'cancel' },
          { text: '确定', onPress: handleImport },
        ]
      );
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
            paddingBottom: Math.max(insets.bottom, 20),
          },
        ]}
      >
        {/* 返回按钮 */}
        <Pressable
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <ThemedText style={styles.backButtonText}>← 返回</ThemedText>
        </Pressable>

        {/* 标题 */}
        <ThemedText type="title" style={styles.title}>
          数据备份与恢复
        </ThemedText>

        {/* 说明 */}
        <View style={styles.infoCard}>
          <ThemedText style={styles.infoTitle}>📦 备份说明</ThemedText>
          <ThemedText style={styles.infoText}>
            • 导出：将所有产品数据导出为 JSON 文件
          </ThemedText>
          <ThemedText style={styles.infoText}>
            • 导入：从 JSON 文件恢复数据（会覆盖现有数据）
          </ThemedText>
          <ThemedText style={styles.infoText}>
            • 建议定期备份数据到 iCloud Drive 或其他云存储
          </ThemedText>
        </View>

        {/* 统计信息 */}
        {stats && (
          <View style={styles.statsCard}>
            <ThemedText style={styles.statsTitle}>📊 当前数据统计</ThemedText>
            <View style={styles.statsRow}>
              <ThemedText style={styles.statsLabel}>总产品数：</ThemedText>
              <ThemedText type="defaultSemiBold" style={styles.statsValue}>
                {stats.totalProducts}
              </ThemedText>
            </View>
            <View style={styles.statsRow}>
              <ThemedText style={styles.statsLabel}>活跃产品：</ThemedText>
              <ThemedText type="defaultSemiBold" style={styles.statsValue}>
                {stats.activeProducts}
              </ThemedText>
            </View>
            <View style={styles.statsRow}>
              <ThemedText style={styles.statsLabel}>回收站：</ThemedText>
              <ThemedText type="defaultSemiBold" style={styles.statsValue}>
                {stats.deletedProducts}
              </ThemedText>
            </View>
          </View>
        )}

        {/* 导出按钮 */}
        <Pressable
          style={({ pressed }) => [
            styles.actionButton,
            {
              backgroundColor: Colors[colorScheme ?? 'light'].tint,
              opacity: pressed || exporting ? 0.7 : 1,
            },
          ]}
          onPress={handleExport}
          disabled={exporting}
        >
          {exporting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <ThemedText style={styles.actionButtonText}>
              📤 导出数据
            </ThemedText>
          )}
        </Pressable>

        {/* 导入按钮 */}
        <Pressable
          style={({ pressed }) => [
            styles.actionButton,
            styles.importButton,
            {
              opacity: pressed || importing ? 0.7 : 1,
            },
          ]}
          onPress={confirmImport}
          disabled={importing}
        >
          {importing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <ThemedText style={styles.actionButtonText}>
              📥 导入数据
            </ThemedText>
          )}
        </Pressable>

        {/* 警告信息 */}
        <View style={styles.warningCard}>
          <ThemedText style={styles.warningTitle}>⚠️ 注意事项</ThemedText>
          <ThemedText style={styles.warningText}>
            • 导入数据会覆盖当前所有数据，请谨慎操作
          </ThemedText>
          <ThemedText style={styles.warningText}>
            • 导入前建议先导出当前数据作为备份
          </ThemedText>
          <ThemedText style={styles.warningText}>
            • 备份文件包含所有产品图片（Base64 格式），文件可能较大
          </ThemedText>
        </View>
      </ScrollView>
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
  backButton: {
    marginBottom: 20,
  },
  backButtonText: {
    fontSize: 16,
    color: '#007AFF',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  infoCard: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#F0F8FF',
    marginBottom: 20,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 4,
  },
  statsCard: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
    marginBottom: 20,
  },
  statsTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  statsLabel: {
    fontSize: 14,
  },
  statsValue: {
    fontSize: 14,
  },
  actionButton: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  importButton: {
    backgroundColor: '#34C759',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  warningCard: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#FFF3CD',
    marginTop: 20,
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: '#856404',
  },
  warningText: {
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 4,
    color: '#856404',
  },
});
