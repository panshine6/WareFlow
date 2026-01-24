import { useRouter } from 'expo-router';
import React, { useState, useEffect, useRef } from 'react';
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
import {
  exportChunks,
  downloadChunk,
  mergeChunks,
  importMergedData,
  getExportEstimate,
  validateChunk,
  exportToZip,
  downloadZip,
  importFromZip,
  type ExportProgressCallback,
  type ImportProgressCallback,
} from '@/lib/chunked-backup';

/**
 * 备份管理页面
 * 支持分片导出和合并导入数据
 */
export default function BackupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  
  // 状态
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [merging, setMerging] = useState(false);
  const [exportProgress, setExportProgress] = useState<string>('');
  const [importProgress, setImportProgress] = useState<string>('');
  const [stats, setStats] = useState<{
    totalProducts: number;
    activeProducts: number;
    deletedProducts: number;
  } | null>(null);
  const [exportEstimate, setExportEstimate] = useState<{
    totalProducts: number;
    estimatedChunks: number;
    estimatedSizePerChunk: string;
  } | null>(null);
  
  // 合并导入相关状态
  const [selectedFiles, setSelectedFiles] = useState<{ filename: string; data: string }[]>([]);
  const [showMergePanel, setShowMergePanel] = useState(false);
  
  // 文件输入引用
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 加载统计信息
  const loadStats = async () => {
    try {
      const data = await ProductStorageAdapter.getStats();
      setStats(data);
      
      // 获取导出预估信息
      const estimate = await getExportEstimate();
      setExportEstimate(estimate);
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  // 页面加载时获取统计信息
  useEffect(() => {
    loadStats();
  }, []);

  // ZIP 导出数据（推荐）
  const handleChunkedExport = async () => {
    setExporting(true);
    setExportProgress('准备导出...');
    
    try {
      const onProgress: ExportProgressCallback = (progress) => {
        setExportProgress(progress.status);
      };
      
      // 等待一下，让页面稳定
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // 导出为 ZIP 文件
      const result = await exportToZip(onProgress);
      
      if (!result.success) {
        throw new Error(result.error || '导出失败');
      }
      
      // 下载 ZIP 文件
      if (result.blob && result.filename) {
        downloadZip(result.filename, result.blob);
      }
      
      setExportProgress('');
      
      // 计算文件大小
      const fileSizeMB = result.blob ? (result.blob.size / (1024 * 1024)).toFixed(1) : '未知';
      
      // 显示完成提示
      if (Platform.OS === 'web') {
        setTimeout(() => {
          window.alert(
            `✅ 备份导出完成！\n\n` +
            `📁 文件名：${result.filename}\n` +
            `📊 文件大小：${fileSizeMB} MB\n\n` +
            `💡 下载完成后如何找到文件：\n` +
            `• iPhone：打开「文件」App → 「下载」文件夹\n` +
            `• Android：打开「下载」或「文件管理器」\n` +
            `• 电脑：查看浏览器下载列表或下载文件夹\n\n` +
            `📦 这是一个 ZIP 压缩包，导入时直接选择此文件即可`
          );
        }, 500);
      } else {
        Alert.alert('成功', `备份导出完成：${result.filename}`);
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
      setExportProgress('');
    }
  };

  // 传统单文件导出（保留兼容性）
  const handleLegacyExport = async () => {
    setExporting(true);
    setExportProgress('正在生成备份文件...');
    
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
        
        // 延迟显示提示
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
      setExportProgress('');
    }
  };

  // 选择文件进行合并
  const handleSelectFilesForMerge = () => {
    if (Platform.OS === 'web') {
      // 创建隐藏的文件输入
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json,.json';
      input.multiple = true;
      
      input.onchange = async (e: any) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        
        const newFiles: { filename: string; data: string }[] = [];
        
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          try {
            const data = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = (event) => resolve(event.target?.result as string);
              reader.onerror = reject;
              reader.readAsText(file);
            });
            
            // 验证文件
            const validation = validateChunk(data);
            if (!validation.valid) {
              window.alert(`文件 ${file.name} 无效: ${validation.error}`);
              continue;
            }
            
            newFiles.push({ filename: file.name, data });
          } catch (error) {
            console.error(`Failed to read file ${file.name}:`, error);
            window.alert(`无法读取文件 ${file.name}`);
          }
        }
        
        if (newFiles.length > 0) {
          setSelectedFiles(prev => [...prev, ...newFiles]);
          setShowMergePanel(true);
        }
      };
      
      input.click();
    } else {
      // 原生平台暂不支持多文件选择
      Alert.alert('提示', '原生平台请使用单文件导入');
    }
  };

  // 清除已选择的文件
  const handleClearSelectedFiles = () => {
    setSelectedFiles([]);
    setShowMergePanel(false);
  };

  // 移除单个已选择的文件
  const handleRemoveFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // 执行合并并导入
  const handleMergeAndImport = async () => {
    if (selectedFiles.length === 0) {
      window.alert('请先选择要合并的文件');
      return;
    }
    
    setMerging(true);
    setImportProgress('正在合并文件...');
    
    try {
      const onProgress: ImportProgressCallback = (progress) => {
        setImportProgress(progress.status);
      };
      
      // 合并分片
      const mergeResult = await mergeChunks(selectedFiles, onProgress);
      
      if (!mergeResult.success || !mergeResult.mergedData) {
        throw new Error(mergeResult.error || '合并失败');
      }
      
      setImportProgress('正在导入数据...');
      
      // 导入合并后的数据
      const importResult = await importMergedData(mergeResult.mergedData, onProgress);
      
      if (!importResult.success) {
        throw new Error(importResult.error || '导入失败');
      }
      
      // 刷新统计信息
      await loadStats();
      
      // 清除已选择的文件
      setSelectedFiles([]);
      setShowMergePanel(false);
      
      window.alert('✅ 数据导入成功！');
    } catch (error) {
      console.error('Merge and import failed:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      window.alert(`导入失败：${errorMessage}`);
    } finally {
      setMerging(false);
      setImportProgress('');
    }
  };

  // 传统单文件导入
  const handleLegacyImport = async () => {
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
          setImportProgress('正在读取文件...');
          
          try {
            const reader = new FileReader();
            reader.onload = async (event) => {
              try {
                const jsonString = event.target?.result as string;
                setImportProgress('正在导入数据...');
                await BackupAdapter.importData(jsonString);
                await loadStats();
                window.alert('数据导入成功！');
              } catch (error) {
                console.error('Import failed:', error);
                const errorMessage = error instanceof Error ? error.message : String(error);
                window.alert(`导入失败：${errorMessage}`);
              } finally {
                setImporting(false);
                setImportProgress('');
              }
            };
            reader.readAsText(file);
          } catch (error) {
            setImporting(false);
            setImportProgress('');
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
        setImportProgress('正在导入数据...');
        
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
          setImportProgress('');
        }
      }
    } catch (error) {
      console.error('Import failed:', error);
      setImporting(false);
      setImportProgress('');
    }
  };

  // 确认导入
  const confirmImport = (isLegacy: boolean = false) => {
    if (Platform.OS === 'web') {
      if (window.confirm('导入数据将覆盖当前所有数据，是否继续？')) {
        if (isLegacy) {
          handleLegacyImport();
        } else {
          handleSelectFilesForMerge();
        }
      }
    } else {
      Alert.alert(
        '确认导入',
        '导入数据将覆盖当前所有数据，是否继续？',
        [
          { text: '取消', style: 'cancel' },
          { text: '确定', onPress: isLegacy ? handleLegacyImport : handleSelectFilesForMerge },
        ]
      );
    }
  };

  // 确认合并导入
  const confirmMergeImport = () => {
    if (Platform.OS === 'web') {
      if (window.confirm(`确认导入 ${selectedFiles.length} 个分片文件？\n\n这将覆盖当前所有数据。`)) {
        handleMergeAndImport();
      }
    } else {
      Alert.alert(
        '确认导入',
        `确认导入 ${selectedFiles.length} 个分片文件？\n\n这将覆盖当前所有数据。`,
        [
          { text: '取消', style: 'cancel' },
          { text: '确定', onPress: handleMergeAndImport },
        ]
      );
    }
  };

  // ZIP 导入
  const handleZipImport = () => {
    if (Platform.OS === 'web') {
      if (!window.confirm('导入数据将覆盖当前所有数据，是否继续？')) {
        return;
      }
      
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.zip,application/zip,application/json,.json';
      
      input.onchange = async (e: any) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        setImporting(true);
        setImportProgress('正在读取文件...');
        
        try {
          // 检查文件类型
          if (file.name.endsWith('.zip') || file.type === 'application/zip') {
            // ZIP 文件
            const result = await importFromZip(file, (progress) => {
              setImportProgress(progress.status);
            });
            
            if (!result.success) {
              throw new Error(result.error || '导入失败');
            }
            
            await loadStats();
            window.alert('✅ 数据导入成功！');
          } else {
            // JSON 文件（传统格式）
            const reader = new FileReader();
            reader.onload = async (event) => {
              try {
                const jsonString = event.target?.result as string;
                setImportProgress('正在导入数据...');
                await BackupAdapter.importData(jsonString);
                await loadStats();
                window.alert('✅ 数据导入成功！');
              } catch (error) {
                console.error('Import failed:', error);
                const errorMessage = error instanceof Error ? error.message : String(error);
                window.alert(`导入失败：${errorMessage}`);
              } finally {
                setImporting(false);
                setImportProgress('');
              }
            };
            reader.readAsText(file);
            return; // 让 FileReader 处理完成
          }
        } catch (error) {
          console.error('Import failed:', error);
          const errorMessage = error instanceof Error ? error.message : String(error);
          window.alert(`导入失败：${errorMessage}`);
        } finally {
          setImporting(false);
          setImportProgress('');
        }
      };
      
      input.click();
    } else {
      Alert.alert('提示', '原生平台请使用单文件导入');
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
            • ZIP 导出：将所有数据打包成一个 ZIP 文件（推荐）
          </ThemedText>
          <ThemedText style={styles.infoText}>
            • ZIP 导入：选择 ZIP 文件，自动解压并导入
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
            {exportEstimate && exportEstimate.estimatedChunks > 1 && (
              <View style={[styles.statsRow, { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#ddd' }]}>
                <ThemedText style={styles.statsLabel}>预计分片数：</ThemedText>
                <ThemedText type="defaultSemiBold" style={styles.statsValue}>
                  {exportEstimate.estimatedChunks} 个文件
                </ThemedText>
              </View>
            )}
          </View>
        )}

        {/* 导出进度 */}
        {exportProgress && (
          <View style={styles.progressCard}>
            <ActivityIndicator color="#007AFF" style={{ marginRight: 10 }} />
            <ThemedText style={styles.progressText}>{exportProgress}</ThemedText>
          </View>
        )}

        {/* 分片导出按钮 */}
        <Pressable
          style={({ pressed }) => [
            styles.actionButton,
            {
              backgroundColor: Colors[colorScheme ?? 'light'].tint,
              opacity: pressed || exporting ? 0.7 : 1,
            },
          ]}
          onPress={handleChunkedExport}
          disabled={exporting || importing || merging}
        >
          {exporting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <ThemedText style={styles.actionButtonText}>
              📤 ZIP 导出数据（推荐）
            </ThemedText>
          )}
        </Pressable>

        {/* 传统导出按钮 */}
        <Pressable
          style={({ pressed }) => [
            styles.actionButton,
            styles.secondaryButton,
            {
              opacity: pressed || exporting ? 0.7 : 1,
            },
          ]}
          onPress={handleLegacyExport}
          disabled={exporting || importing || merging}
        >
          <ThemedText style={styles.secondaryButtonText}>
            📤 单文件导出（传统方式）
          </ThemedText>
        </Pressable>

        {/* 分隔线 */}
        <View style={styles.divider} />

        {/* 导入进度 */}
        {importProgress && (
          <View style={styles.progressCard}>
            <ActivityIndicator color="#34C759" style={{ marginRight: 10 }} />
            <ThemedText style={styles.progressText}>{importProgress}</ThemedText>
          </View>
        )}

        {/* 合并导入面板 */}
        {showMergePanel && selectedFiles.length > 0 && (
          <View style={styles.mergePanel}>
            <ThemedText style={styles.mergePanelTitle}>
              📁 已选择 {selectedFiles.length} 个文件
            </ThemedText>
            
            {selectedFiles.map((file, index) => (
              <View key={index} style={styles.fileItem}>
                <ThemedText style={styles.fileName} numberOfLines={1}>
                  {file.filename}
                </ThemedText>
                <Pressable
                  onPress={() => handleRemoveFile(index)}
                  style={styles.removeButton}
                >
                  <ThemedText style={styles.removeButtonText}>✕</ThemedText>
                </Pressable>
              </View>
            ))}
            
            <View style={styles.mergePanelButtons}>
              <Pressable
                style={[styles.panelButton, styles.addMoreButton]}
                onPress={handleSelectFilesForMerge}
              >
                <ThemedText style={styles.panelButtonText}>+ 添加更多</ThemedText>
              </Pressable>
              
              <Pressable
                style={[styles.panelButton, styles.clearButton]}
                onPress={handleClearSelectedFiles}
              >
                <ThemedText style={styles.panelButtonText}>清除</ThemedText>
              </Pressable>
            </View>
            
            <Pressable
              style={({ pressed }) => [
                styles.actionButton,
                styles.importButton,
                {
                  opacity: pressed || merging ? 0.7 : 1,
                  marginTop: 12,
                },
              ]}
              onPress={confirmMergeImport}
              disabled={merging}
            >
              {merging ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <ThemedText style={styles.actionButtonText}>
                  📥 合并并导入
                </ThemedText>
              )}
            </Pressable>
          </View>
        )}

        {/* ZIP 导入按钮 */}
        {!showMergePanel && (
          <Pressable
            style={({ pressed }) => [
              styles.actionButton,
              styles.importButton,
              {
                opacity: pressed || importing || merging ? 0.7 : 1,
              },
            ]}
            onPress={() => handleZipImport()}
            disabled={importing || exporting || merging}
          >
            {importing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={styles.actionButtonText}>
                📥 ZIP 导入（推荐）
              </ThemedText>
            )}
          </Pressable>
        )}

        {/* 传统导入按钮 */}
        <Pressable
          style={({ pressed }) => [
            styles.actionButton,
            styles.secondaryButton,
            {
              opacity: pressed || importing ? 0.7 : 1,
            },
          ]}
          onPress={() => confirmImport(true)}
          disabled={importing || exporting || merging}
        >
          <ThemedText style={styles.secondaryButtonText}>
            📥 单文件导入（传统方式）
          </ThemedText>
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
            • ZIP 备份文件包含所有数据，请妥善保存
          </ThemedText>
          <ThemedText style={styles.warningText}>
            • 导入时直接选择 ZIP 文件即可
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
  progressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#E8F4FD',
    marginBottom: 12,
  },
  progressText: {
    fontSize: 14,
    color: '#333',
    flex: 1,
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
  secondaryButton: {
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#DDD',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButtonText: {
    color: '#333',
    fontSize: 16,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: '#E0E0E0',
    marginVertical: 20,
  },
  mergePanel: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#F0FFF0',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#34C759',
  },
  mergePanelTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: '#2E7D32',
  },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 8,
  },
  fileName: {
    flex: 1,
    fontSize: 14,
  },
  removeButton: {
    padding: 4,
    marginLeft: 8,
  },
  removeButtonText: {
    color: '#FF3B30',
    fontSize: 16,
    fontWeight: '600',
  },
  mergePanelButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  panelButton: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  addMoreButton: {
    backgroundColor: '#E8F5E9',
  },
  clearButton: {
    backgroundColor: '#FFEBEE',
  },
  panelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
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
