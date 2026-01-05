/**
 * SKU 生成助手弹窗组件 v2
 * 支持动态段、添加选项、历史记录和流水号管理
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  StyleSheet,
  Platform,
  useColorScheme,
  Alert,
} from "react-native";
import {
  SkuGenerator,
  SkuSegment,
  SkuSequence,
  SkuHistoryRecord,
  CodeOption,
} from "@/lib/sku-generator";

// 跨平台确认对话框
const showConfirm = (title: string, message: string, onConfirm: () => void) => {
  if (Platform.OS === "web") {
    if (window.confirm(`${title}\n${message}`)) {
      onConfirm();
    }
  } else {
    Alert.alert(title, message, [
      { text: "取消", style: "cancel" },
      { text: "确定", style: "destructive", onPress: onConfirm },
    ]);
  }
};

interface SkuGeneratorModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (sku: string) => void;
  initialSku?: string;
}

// 视图模式
type ViewMode = "generator" | "history" | "sequences";

export default function SkuGeneratorModal({
  visible,
  onClose,
  onConfirm,
  initialSku,
}: SkuGeneratorModalProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  // 视图模式
  const [viewMode, setViewMode] = useState<ViewMode>("generator");

  // 段定义
  const [segments, setSegments] = useState<SkuSegment[]>([]);
  
  // 各段选中的值
  const [segmentValues, setSegmentValues] = useState<Record<string, string>>({});
  
  // 当前展开的段
  const [expandedSegment, setExpandedSegment] = useState<string | null>(null);
  
  // 添加选项弹窗
  const [showAddOption, setShowAddOption] = useState<string | null>(null);
  const [newOptionCode, setNewOptionCode] = useState("");
  const [newOptionName, setNewOptionName] = useState("");
  
  // 添加段弹窗
  const [showAddSegment, setShowAddSegment] = useState(false);
  const [newSegmentName, setNewSegmentName] = useState("");
  const [newSegmentCodeLength, setNewSegmentCodeLength] = useState("2");

  // 生成的 SKU 预览
  const [previewSku, setPreviewSku] = useState("");
  const [nextNumber, setNextNumber] = useState(1);

  // 历史记录
  const [history, setHistory] = useState<SkuHistoryRecord[]>([]);
  
  // 序列记录
  const [sequences, setSequences] = useState<Record<string, SkuSequence>>({});

  // 调整字段顺序模式
  const [isReorderMode, setIsReorderMode] = useState(false);

  // 历史记录多选模式
  const [isHistoryEditMode, setIsHistoryEditMode] = useState(false);
  const [selectedHistorySkus, setSelectedHistorySkus] = useState<Set<string>>(new Set());
  const [showDeleteHistoryConfirm, setShowDeleteHistoryConfirm] = useState(false);

  // 加载数据
  useEffect(() => {
    if (visible) {
      loadData();
    }
  }, [visible]);

  const loadData = async () => {
    const segs = await SkuGenerator.getSegments();
    setSegments(segs);
    
    // 尝试加载上次的选择
    const lastSelection = await SkuGenerator.getLastSelection();
    
    // 初始化选中值
    const initialValues: Record<string, string> = {};
    segs.forEach(seg => {
      if (lastSelection && lastSelection[seg.id]) {
        // 使用上次的选择（如果该选项仍然存在）
        const optionExists = seg.options.some(o => o.code === lastSelection[seg.id]);
        if (optionExists) {
          initialValues[seg.id] = lastSelection[seg.id];
        } else if (seg.options.length > 0) {
          initialValues[seg.id] = seg.options[0].code;
        }
      } else if (seg.options.length > 0) {
        // 没有上次选择，默认选中第一个选项
        initialValues[seg.id] = seg.options[0].code;
      }
    });
    setSegmentValues(initialValues);
    
    // 加载历史和序列
    const hist = await SkuGenerator.getHistory();
    setHistory(hist);
    
    const seqs = await SkuGenerator.getAllSequences();
    setSequences(seqs);
  };

  // 更新 SKU 预览
  const updatePreview = useCallback(async () => {
    const allFilled = segments.every(seg => segmentValues[seg.id]);
    if (allFilled && segments.length > 0) {
      const sku = await SkuGenerator.previewSku(segmentValues, segments);
      setPreviewSku(sku);
      
      const prefix = SkuGenerator.generatePrefix(segmentValues, segments);
      const num = await SkuGenerator.getNextNumber(prefix);
      setNextNumber(num);
    } else {
      setPreviewSku("");
      setNextNumber(1);
    }
  }, [segmentValues, segments]);

  useEffect(() => {
    if (visible) {
      updatePreview();
    }
  }, [visible, updatePreview, segmentValues]);

  // 处理确认
  const handleConfirm = async () => {
    if (!previewSku) return;
    
    await SkuGenerator.confirmSku(previewSku, segmentValues);
    
    // 保存当前选择，以便下次使用
    await SkuGenerator.saveLastSelection(segmentValues);
    
    // 刷新数据
    const hist = await SkuGenerator.getHistory();
    setHistory(hist);
    const seqs = await SkuGenerator.getAllSequences();
    setSequences(seqs);
    
    onConfirm(previewSku);
    onClose();
  };

  // 添加选项到段
  const handleAddOption = async () => {
    if (!showAddOption || !newOptionCode || !newOptionName) return;
    
    const segment = segments.find(s => s.id === showAddOption);
    if (!segment) return;
    
    // 检查代码长度
    if (newOptionCode.length !== segment.codeLength) {
      Alert.alert("错误", `代码必须是 ${segment.codeLength} 位`);
      return;
    }
    
    // 检查是否重复
    if (segment.options.some(o => o.code === newOptionCode.toUpperCase())) {
      Alert.alert("错误", "该代码已存在");
      return;
    }
    
    const newOption: CodeOption = {
      code: newOptionCode.toUpperCase(),
      nameEn: newOptionName,
      nameCn: newOptionName,
      isCustom: true,
    };
    
    await SkuGenerator.addOptionToSegment(showAddOption, newOption);
    
    // 刷新段数据
    const segs = await SkuGenerator.getSegments();
    setSegments(segs);
    
    // 选中新添加的选项
    setSegmentValues(prev => ({ ...prev, [showAddOption]: newOption.code }));
    
    // 重置并关闭
    setNewOptionCode("");
    setNewOptionName("");
    setShowAddOption(null);
  };

  // 添加新段
  const handleAddSegment = async () => {
    if (!newSegmentName) return;
    
    const codeLen = parseInt(newSegmentCodeLength) || 2;
    
    const newSegment = await SkuGenerator.addSegment({
      name: newSegmentName,
      codeLength: codeLen,
      options: [],
      isRequired: false,
    });
    
    // 刷新段数据
    const segs = await SkuGenerator.getSegments();
    setSegments(segs);
    
    // 重置并关闭
    setNewSegmentName("");
    setNewSegmentCodeLength("2");
    setShowAddSegment(false);
  };

  // 删除段
  const handleDeleteSegment = async (segmentId: string) => {
    showConfirm("确认删除", "确定要删除这个段吗？", async () => {
      await SkuGenerator.deleteSegment(segmentId);
      const segs = await SkuGenerator.getSegments();
      setSegments(segs);
      
      // 移除该段的选中值
      setSegmentValues(prev => {
        const newValues = { ...prev };
        delete newValues[segmentId];
        return newValues;
      });
    });
  };

  // 删除选项
  const handleDeleteOption = async (segmentId: string, code: string) => {
    await SkuGenerator.removeOptionFromSegment(segmentId, code);
    const segs = await SkuGenerator.getSegments();
    setSegments(segs);
    
    // 如果删除的是当前选中的，清空选中
    if (segmentValues[segmentId] === code) {
      setSegmentValues(prev => {
        const newValues = { ...prev };
        delete newValues[segmentId];
        return newValues;
      });
    }
  };

  // 序列操作
  const handleResetSequence = async (prefix: string) => {
    showConfirm("确认置零", `确定要将 ${prefix} 的流水号置零吗？`, async () => {
      await SkuGenerator.resetSequence(prefix);
      const seqs = await SkuGenerator.getAllSequences();
      setSequences(seqs);
    });
  };

  const handleIncrementSequence = async (prefix: string, amount: number) => {
    await SkuGenerator.incrementSequence(prefix, amount);
    const seqs = await SkuGenerator.getAllSequences();
    setSequences(seqs);
    updatePreview();
  };

  const handleDeleteSequence = async (prefix: string) => {
    showConfirm("确认删除", `确定要删除 ${prefix} 的序列记录吗？`, async () => {
      await SkuGenerator.deleteSequence(prefix);
      const seqs = await SkuGenerator.getAllSequences();
      setSequences(seqs);
    });
  };

  // 历史记录多选相关函数
  const toggleHistorySelection = (sku: string) => {
    setSelectedHistorySkus((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(sku)) {
        newSet.delete(sku);
      } else {
        newSet.add(sku);
      }
      return newSet;
    });
  };

  const toggleSelectAllHistory = () => {
    if (selectedHistorySkus.size === history.length) {
      setSelectedHistorySkus(new Set());
    } else {
      setSelectedHistorySkus(new Set(history.map((r) => r.sku)));
    }
  };

  const exitHistoryEditMode = () => {
    setIsHistoryEditMode(false);
    setSelectedHistorySkus(new Set());
  };

  const handleDeleteSelectedHistory = async () => {
    setShowDeleteHistoryConfirm(false);
    try {
      for (const sku of selectedHistorySkus) {
        await SkuGenerator.deleteHistoryRecord(sku);
      }
      
      // 刷新历史记录
      const hist = await SkuGenerator.getHistory();
      setHistory(hist);
      
      if (Platform.OS === 'web') {
        window.alert(`已删除 ${selectedHistorySkus.size} 条 SKU 记录`);
      } else {
        Alert.alert("成功", `已删除 ${selectedHistorySkus.size} 条 SKU 记录`);
      }
      
      exitHistoryEditMode();
    } catch (error) {
      console.error("[SkuGenerator] Failed to delete history:", error);
      if (Platform.OS === 'web') {
        window.alert("删除失败，请重试");
      } else {
        Alert.alert("错误", "删除失败，请重试");
      }
    }
  };

  // 渲染段选择器
  // 移动段位置
  const handleMoveSegment = async (segmentId: string, direction: 'up' | 'down') => {
    await SkuGenerator.moveSegment(segmentId, direction);
    const segs = await SkuGenerator.getSegments();
    setSegments(segs);
  };

  const renderSegmentSelector = (segment: SkuSegment, index: number, sortedSegments: SkuSegment[]) => {
    const isExpanded = expandedSegment === segment.id;
    const selectedValue = segmentValues[segment.id];
    const selectedOption = segment.options.find(o => o.code === selectedValue);
    const isFirst = index === 0;
    const isLast = index === sortedSegments.length - 1;
    const isSerialNumber = segment.isSerialNumber;

    return (
      <View key={segment.id} style={styles.selectorContainer}>
        <View style={styles.selectorRow}>
          {/* 上下移动按钮 - 只在调整模式下显示 */}
          {isReorderMode && (
            <View style={styles.moveButtonsContainer}>
              <TouchableOpacity
                style={[styles.moveButton, isFirst && styles.moveButtonDisabled]}
                onPress={() => !isFirst && handleMoveSegment(segment.id, 'up')}
                disabled={isFirst}
              >
                <Text style={[styles.moveButtonText, isFirst && styles.moveButtonTextDisabled]}>{"\u25B2"}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.moveButton, isLast && styles.moveButtonDisabled]}
                onPress={() => !isLast && handleMoveSegment(segment.id, 'down')}
                disabled={isLast}
              >
                <Text style={[styles.moveButtonText, isLast && styles.moveButtonTextDisabled]}>{"\u25BC"}</Text>
              </TouchableOpacity>
            </View>
          )}
          
          {/* 段选择器 - 流水号段不可展开 */}
          <TouchableOpacity
            style={[
              styles.selectorHeader,
              !isReorderMode && styles.selectorHeaderFull,
              isReorderMode && styles.selectorHeaderFlex,
              isDark && styles.selectorHeaderDark,
              isExpanded && !isSerialNumber && styles.selectorHeaderExpanded,
              isSerialNumber && styles.selectorHeaderSerial,
            ]}
            onPress={() => !isSerialNumber && setExpandedSegment(isExpanded ? null : segment.id)}
            disabled={isSerialNumber}
          >
            <View style={styles.selectorHeaderLeft}>
              <Text style={[styles.selectorLabel, isDark && styles.textDark, isSerialNumber && styles.serialLabel]}>
                {segment.name}
              </Text>
              {isSerialNumber ? (
                <View style={[styles.selectedBadge, styles.serialBadge]}>
                  <Text style={styles.selectedBadgeText}>自动</Text>
                </View>
              ) : selectedValue ? (
                <View style={[styles.selectedBadge, selectedValue === '' && styles.emptyBadge]}>
                  <Text style={styles.selectedBadgeText}>{selectedValue || '无'}</Text>
                </View>
              ) : null}
            </View>
            {!isSerialNumber && (
              <Text style={[styles.selectorArrow, isDark && styles.textDark]}>
                {isExpanded ? "\u25B2" : "\u25BC"}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {isExpanded && (
          <View style={[styles.selectorContent, isDark && styles.selectorContentDark]}>
            {/* 选项网格 */}
            <View style={styles.optionsGrid}>
              {segment.options.map((option) => {
                const isEmptyOption = option.code === '';
                const isSelected = selectedValue === option.code;
                return (
                  <TouchableOpacity
                    key={option.code || 'empty'}
                    style={[
                      styles.optionButton,
                      isEmptyOption && styles.optionButtonEmpty,
                      isSelected && styles.optionButtonSelected,
                      isSelected && isEmptyOption && styles.optionButtonEmptySelected,
                    ]}
                    onPress={() => {
                      setSegmentValues(prev => ({ ...prev, [segment.id]: option.code }));
                    }}
                    onLongPress={() => {
                      if (option.isCustom) {
                        Alert.alert("删除选项", `确定要删除 ${option.code} 吗？`, [
                          { text: "取消", style: "cancel" },
                          {
                            text: "删除",
                            style: "destructive",
                            onPress: () => handleDeleteOption(segment.id, option.code),
                          },
                        ]);
                      }
                    }}
                  >
                    <Text
                      style={[
                        styles.optionCode,
                        isEmptyOption && styles.optionCodeEmpty,
                        isSelected && styles.optionTextSelected,
                      ]}
                    >
                      {isEmptyOption ? '∅' : option.code}
                    </Text>
                    <Text
                      style={[
                        styles.optionName,
                        isSelected && styles.optionTextSelected,
                      ]}
                      numberOfLines={1}
                    >
                      {option.nameCn}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              
              {/* 添加按钮 */}
              <TouchableOpacity
                style={styles.addOptionButton}
                onPress={() => setShowAddOption(segment.id)}
              >
                <Text style={styles.addOptionButtonText}>+</Text>
              </TouchableOpacity>
            </View>

            {/* 段操作（仅自定义段可删除） */}
            {segment.id.startsWith("custom_") && (
              <TouchableOpacity
                style={styles.deleteSegmentButton}
                onPress={() => handleDeleteSegment(segment.id)}
              >
                <Text style={styles.deleteSegmentButtonText}>删除此段</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  };

  // 渲染生成器视图
  const renderGeneratorView = () => (
    <>
      {/* SKU 预览 */}
      <View style={[styles.previewContainer, isDark && styles.previewContainerDark]}>
        <Text style={[styles.previewLabel, isDark && styles.textDark]}>
          生成的 SKU:
        </Text>
        <Text style={[styles.previewSku, isDark && styles.textDark]}>
          {previewSku || "请选择所有选项"}
        </Text>
        {previewSku && (
          <Text style={styles.previewHint}>
            流水号: {nextNumber.toString().padStart(4, "0")}
          </Text>
        )}
      </View>

      {/* 段选择器 - 按 order 排序 */}
      {(() => {
        const sortedSegments = [...segments].sort((a, b) => a.order - b.order);
        return sortedSegments.map((segment, index) => renderSegmentSelector(segment, index, sortedSegments));
      })()}

      {/* 操作按钮区 */}
      <View style={styles.actionButtonsRow}>
        {/* 调整顺序按钮 */}
        <TouchableOpacity
          style={[
            styles.reorderButton,
            isReorderMode && styles.reorderButtonActive,
          ]}
          onPress={() => setIsReorderMode(!isReorderMode)}
        >
          <Text style={[
            styles.reorderButtonText,
            isReorderMode && styles.reorderButtonTextActive,
          ]}>
            {isReorderMode ? "✓ 完成调整" : "↕ 调整顺序"}
          </Text>
        </TouchableOpacity>

        {/* 添加新段按钮 */}
        <TouchableOpacity
          style={[styles.addSegmentButton, isDark && styles.addSegmentButtonDark]}
          onPress={() => setShowAddSegment(true)}
        >
          <Text style={styles.addSegmentButtonText}>+ 添加新段</Text>
        </TouchableOpacity>
      </View>

      {/* SKU 格式说明 */}
      <View style={[styles.formatInfo, isDark && styles.formatInfoDark]}>
        <Text style={[styles.formatTitle, isDark && styles.textDark]}>
          SKU 格式说明
        </Text>
        <Text style={[styles.formatText, isDark && styles.textMuted]}>
          {[...segments].sort((a, b) => a.order - b.order).map(s => 
            s.isSerialNumber ? `流水号(${s.codeLength}位)` : `${s.name}(${s.codeLength}位)`
          ).join("-")}
        </Text>
        <Text style={[styles.formatHint, isDark && styles.textMuted]}>
          {isReorderMode 
            ? '点击左侧 ▲▼ 按钮可调整字段顺序（包括流水号）'
            : '选择 ∅ 可省略该字段'
          }
        </Text>
      </View>
    </>
  );

  // 渲染历史记录视图
  const renderHistoryView = () => (
    <View style={styles.historyContainer}>
      {/* 工具栏 */}
      <View style={styles.historyToolbar}>
        <Text style={[styles.sectionTitle, isDark && styles.textDark]}>
          已使用的 SKU ({history.length})
        </Text>
        {history.length > 0 && (
          <TouchableOpacity
            style={[
              styles.historyEditButton,
              isHistoryEditMode && styles.historyEditButtonActive,
            ]}
            onPress={() => {
              if (isHistoryEditMode) {
                exitHistoryEditMode();
              } else {
                setIsHistoryEditMode(true);
              }
            }}
          >
            <Text style={[
              styles.historyEditButtonText,
              isHistoryEditMode && styles.historyEditButtonTextActive,
            ]}>
              {isHistoryEditMode ? "取消" : "编辑"}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 编辑模式操作栏 */}
      {isHistoryEditMode && history.length > 0 && (
        <View style={styles.historyEditToolbar}>
          <TouchableOpacity
            style={styles.selectAllButton}
            onPress={toggleSelectAllHistory}
          >
            <View style={[
              styles.checkbox,
              selectedHistorySkus.size === history.length && styles.checkboxChecked,
            ]}>
              {selectedHistorySkus.size === history.length && (
                <Text style={styles.checkboxCheck}>✓</Text>
              )}
            </View>
            <Text style={[styles.selectAllText, isDark && styles.textDark]}>
              全选
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.deleteSelectedButton,
              selectedHistorySkus.size === 0 && styles.deleteSelectedButtonDisabled,
            ]}
            onPress={() => {
              if (selectedHistorySkus.size > 0) {
                setShowDeleteHistoryConfirm(true);
              }
            }}
            disabled={selectedHistorySkus.size === 0}
          >
            <Text style={styles.deleteSelectedButtonText}>
              删除 ({selectedHistorySkus.size})
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {history.length === 0 ? (
        <Text style={[styles.emptyText, isDark && styles.textMuted]}>
          暂无使用记录
        </Text>
      ) : (
        history.slice(0, 50).map((record, index) => (
          <TouchableOpacity
            key={record.sku}
            style={[
              styles.historyItem,
              isDark && styles.historyItemDark,
              isHistoryEditMode && selectedHistorySkus.has(record.sku) && styles.historyItemSelected,
            ]}
            onPress={() => {
              if (isHistoryEditMode) {
                toggleHistorySelection(record.sku);
              }
            }}
            onLongPress={() => {
              if (!isHistoryEditMode) {
                setIsHistoryEditMode(true);
                setSelectedHistorySkus(new Set([record.sku]));
              }
            }}
            activeOpacity={isHistoryEditMode ? 0.7 : 1}
          >
            {isHistoryEditMode && (
              <View style={styles.historyCheckboxContainer}>
                <View style={[
                  styles.checkbox,
                  selectedHistorySkus.has(record.sku) && styles.checkboxChecked,
                ]}>
                  {selectedHistorySkus.has(record.sku) && (
                    <Text style={styles.checkboxCheck}>✓</Text>
                  )}
                </View>
              </View>
            )}
            <View style={styles.historyItemLeft}>
              <Text style={[styles.historyItemSku, isDark && styles.textDark]}>
                {record.sku}
              </Text>
              <Text style={[styles.historyItemDate, isDark && styles.textMuted]}>
                {new Date(record.createdAt).toLocaleString()}
              </Text>
            </View>
            <View style={styles.historyItemRight}>
              <Text style={styles.historyItemNumber}>
                #{record.number.toString().padStart(4, "0")}
              </Text>
            </View>
          </TouchableOpacity>
        ))
      )}
    </View>
  );

  // 渲染序列管理视图
  const renderSequencesView = () => {
    const sequenceList = Object.values(sequences).sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    return (
      <View style={styles.sequencesContainer}>
        <Text style={[styles.sectionTitle, isDark && styles.textDark]}>
          流水号管理 ({sequenceList.length})
        </Text>
        {sequenceList.length === 0 ? (
          <Text style={[styles.emptyText, isDark && styles.textMuted]}>
            暂无序列记录
          </Text>
        ) : (
          sequenceList.map((seq) => (
            <View key={seq.prefix} style={[styles.sequenceItem, isDark && styles.sequenceItemDark]}>
              <View style={styles.sequenceItemHeader}>
                <Text style={[styles.sequenceItemPrefix, isDark && styles.textDark]}>
                  {seq.prefix}
                </Text>
                <Text style={styles.sequenceItemNumber}>
                  当前: {seq.lastNumber.toString().padStart(4, "0")}
                </Text>
              </View>
              <View style={styles.sequenceItemActions}>
                <TouchableOpacity
                  style={styles.sequenceActionButton}
                  onPress={() => handleIncrementSequence(seq.prefix, -1)}
                >
                  <Text style={styles.sequenceActionButtonText}>-1</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.sequenceActionButton}
                  onPress={() => handleIncrementSequence(seq.prefix, 1)}
                >
                  <Text style={styles.sequenceActionButtonText}>+1</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.sequenceActionButton, styles.sequenceActionButtonWarning]}
                  onPress={() => handleResetSequence(seq.prefix)}
                >
                  <Text style={styles.sequenceActionButtonText}>置零</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.sequenceActionButton, styles.sequenceActionButtonDanger]}
                  onPress={() => handleDeleteSequence(seq.prefix)}
                >
                  <Text style={styles.sequenceActionButtonText}>删除</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, isDark && styles.modalContentDark]}>
          {/* 标题 */}
          <View style={styles.header}>
            <Text style={[styles.title, isDark && styles.textDark]}>
              SKU 生成助手
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* 标签切换 */}
          <View style={styles.tabBar}>
            <TouchableOpacity
              style={[styles.tab, viewMode === "generator" && styles.tabActive]}
              onPress={() => setViewMode("generator")}
            >
              <Text style={[
                styles.tabText,
                viewMode === "generator" && styles.tabTextActive,
                isDark && viewMode !== "generator" && styles.textMuted
              ]}>
                生成器
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, viewMode === "history" && styles.tabActive]}
              onPress={() => setViewMode("history")}
            >
              <Text style={[
                styles.tabText,
                viewMode === "history" && styles.tabTextActive,
                isDark && viewMode !== "history" && styles.textMuted
              ]}>
                使用记录
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, viewMode === "sequences" && styles.tabActive]}
              onPress={() => setViewMode("sequences")}
            >
              <Text style={[
                styles.tabText,
                viewMode === "sequences" && styles.tabTextActive,
                isDark && viewMode !== "sequences" && styles.textMuted
              ]}>
                流水号
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {viewMode === "generator" && renderGeneratorView()}
            {viewMode === "history" && renderHistoryView()}
            {viewMode === "sequences" && renderSequencesView()}
          </ScrollView>

          {/* 底部按钮（仅生成器模式显示） */}
          {viewMode === "generator" && (
            <View style={styles.footer}>
              <TouchableOpacity
                style={[styles.cancelButton, isDark && styles.cancelButtonDark]}
                onPress={onClose}
              >
                <Text style={[styles.cancelButtonText, isDark && styles.textDark]}>
                  取消
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.confirmButton,
                  !previewSku && styles.confirmButtonDisabled,
                ]}
                onPress={handleConfirm}
                disabled={!previewSku}
              >
                <Text style={styles.confirmButtonText}>使用此 SKU</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {/* 添加选项弹窗 */}
      <Modal
        visible={!!showAddOption}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowAddOption(null)}
      >
        <View style={styles.subModalOverlay}>
          <View style={[styles.subModalContent, isDark && styles.subModalContentDark]}>
            <Text style={[styles.subModalTitle, isDark && styles.textDark]}>
              添加新选项
            </Text>
            <TextInput
              style={[styles.subModalInput, isDark && styles.subModalInputDark]}
              placeholder={`代码 (${segments.find(s => s.id === showAddOption)?.codeLength || 2}位)`}
              placeholderTextColor="#999"
              value={newOptionCode}
              onChangeText={(text) => setNewOptionCode(text.toUpperCase())}
              maxLength={segments.find(s => s.id === showAddOption)?.codeLength || 2}
              autoCapitalize="characters"
            />
            <TextInput
              style={[styles.subModalInput, isDark && styles.subModalInputDark]}
              placeholder="名称（如：玫瑰金）"
              placeholderTextColor="#999"
              value={newOptionName}
              onChangeText={setNewOptionName}
            />
            <View style={styles.subModalButtons}>
              <TouchableOpacity
                style={styles.subModalCancelButton}
                onPress={() => {
                  setShowAddOption(null);
                  setNewOptionCode("");
                  setNewOptionName("");
                }}
              >
                <Text style={styles.subModalCancelButtonText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.subModalConfirmButton,
                  (!newOptionCode || !newOptionName) && styles.subModalConfirmButtonDisabled,
                ]}
                onPress={handleAddOption}
                disabled={!newOptionCode || !newOptionName}
              >
                <Text style={styles.subModalConfirmButtonText}>添加</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 添加段弹窗 */}
      <Modal
        visible={showAddSegment}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowAddSegment(false)}
      >
        <View style={styles.subModalOverlay}>
          <View style={[styles.subModalContent, isDark && styles.subModalContentDark]}>
            <Text style={[styles.subModalTitle, isDark && styles.textDark]}>
              添加新段
            </Text>
            <TextInput
              style={[styles.subModalInput, isDark && styles.subModalInputDark]}
              placeholder="段名称（如：设计系列）"
              placeholderTextColor="#999"
              value={newSegmentName}
              onChangeText={setNewSegmentName}
            />
            <TextInput
              style={[styles.subModalInput, isDark && styles.subModalInputDark]}
              placeholder="代码长度（默认2位）"
              placeholderTextColor="#999"
              value={newSegmentCodeLength}
              onChangeText={setNewSegmentCodeLength}
              keyboardType="number-pad"
              maxLength={1}
            />
            <View style={styles.subModalButtons}>
              <TouchableOpacity
                style={styles.subModalCancelButton}
                onPress={() => {
                  setShowAddSegment(false);
                  setNewSegmentName("");
                  setNewSegmentCodeLength("2");
                }}
              >
                <Text style={styles.subModalCancelButtonText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.subModalConfirmButton,
                  !newSegmentName && styles.subModalConfirmButtonDisabled,
                ]}
                onPress={handleAddSegment}
                disabled={!newSegmentName}
              >
                <Text style={styles.subModalConfirmButtonText}>添加</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 删除历史记录确认弹窗 */}
      <Modal
        visible={showDeleteHistoryConfirm}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowDeleteHistoryConfirm(false)}
      >
        <View style={styles.subModalOverlay}>
          <View style={[styles.deleteConfirmModal, isDark && styles.subModalContentDark]}>
            <Text style={[styles.deleteConfirmTitle, isDark && styles.textDark]}>
              ❗ 确认删除
            </Text>
            <Text style={[styles.deleteConfirmMessage, isDark && styles.textMuted]}>
              您即将删除 {selectedHistorySkus.size} 条 SKU 使用记录。
            </Text>
            <View style={styles.deleteConfirmWarning}>
              <Text style={styles.deleteConfirmWarningText}>
                ⚠️ 重要警告
              </Text>
              <Text style={styles.deleteConfirmWarningDesc}>
                删除记录后，这些 SKU 编号可能会被重新生成，导致 SKU 重复。
              </Text>
              <Text style={styles.deleteConfirmWarningDesc}>
                请确认这些 SKU 已不再使用，或者对应的产品已被删除。
              </Text>
            </View>
            <View style={styles.subModalButtons}>
              <TouchableOpacity
                style={styles.subModalCancelButton}
                onPress={() => setShowDeleteHistoryConfirm(false)}
              >
                <Text style={styles.subModalCancelButtonText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.deleteConfirmButton}
                onPress={handleDeleteSelectedHistory}
              >
                <Text style={styles.deleteConfirmButtonText}>确认删除</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "90%",
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
  },
  modalContentDark: {
    backgroundColor: "#1c1c1e",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
  },
  closeButton: {
    padding: 4,
  },
  closeButtonText: {
    fontSize: 20,
    color: "#999",
  },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: "#007AFF",
  },
  tabText: {
    fontSize: 14,
    color: "#666",
  },
  tabTextActive: {
    color: "#007AFF",
    fontWeight: "600",
  },
  scrollContent: {
    padding: 16,
    maxHeight: 500,
  },
  previewContainer: {
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    alignItems: "center",
  },
  previewContainerDark: {
    backgroundColor: "#2c2c2e",
  },
  previewLabel: {
    fontSize: 14,
    color: "#666",
    marginBottom: 8,
  },
  previewSku: {
    fontSize: 22,
    fontWeight: "700",
    color: "#007AFF",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  previewHint: {
    fontSize: 12,
    color: "#999",
    marginTop: 8,
  },
  selectorContainer: {
    marginBottom: 12,
  },
  selectorRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  moveButtonsContainer: {
    flexDirection: "column",
    marginRight: 8,
    gap: 2,
  },
  moveButton: {
    width: 28,
    height: 22,
    backgroundColor: "#e8f4ff",
    borderRadius: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  moveButtonDisabled: {
    backgroundColor: "#f0f0f0",
  },
  moveButtonText: {
    fontSize: 10,
    color: "#007AFF",
    fontWeight: "600",
  },
  moveButtonTextDisabled: {
    color: "#ccc",
  },
  selectorHeaderFlex: {
    flex: 1,
  },
  selectorHeaderFull: {
    width: "100%",
  },
  selectorHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
    borderRadius: 10,
    padding: 14,
  },
  selectorHeaderDark: {
    backgroundColor: "#2c2c2e",
  },
  selectorHeaderExpanded: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  selectorHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  selectorLabel: {
    fontSize: 16,
    fontWeight: "500",
    color: "#333",
  },
  selectedBadge: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  selectedBadgeText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  selectorArrow: {
    fontSize: 12,
    color: "#666",
  },
  selectorContent: {
    backgroundColor: "#f9f9f9",
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    padding: 12,
  },
  selectorContentDark: {
    backgroundColor: "#3c3c3e",
  },
  optionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  optionButton: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 10,
    minWidth: 70,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  optionButtonSelected: {
    backgroundColor: "#007AFF",
    borderColor: "#007AFF",
  },
  optionButtonEmpty: {
    backgroundColor: "#f8f8f8",
    borderStyle: "dashed",
  },
  optionButtonEmptySelected: {
    backgroundColor: "#6c757d",
    borderColor: "#6c757d",
  },
  optionCodeEmpty: {
    fontSize: 18,
    color: "#999",
  },
  selectorHeaderSerial: {
    backgroundColor: "#e8f4ff",
  },
  serialLabel: {
    color: "#007AFF",
  },
  serialBadge: {
    backgroundColor: "#007AFF",
  },
  emptyBadge: {
    backgroundColor: "#6c757d",
    borderColor: "#007AFF",
  },
  optionCode: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  optionName: {
    fontSize: 10,
    color: "#666",
    marginTop: 2,
  },
  optionTextSelected: {
    color: "#fff",
  },
  addOptionButton: {
    backgroundColor: "#e8f4ff",
    borderRadius: 8,
    padding: 10,
    minWidth: 70,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#007AFF",
    borderStyle: "dashed",
  },
  addOptionButtonText: {
    fontSize: 24,
    fontWeight: "300",
    color: "#007AFF",
  },
  deleteSegmentButton: {
    marginTop: 12,
    paddingVertical: 8,
    alignItems: "center",
  },
  deleteSegmentButtonText: {
    fontSize: 14,
    color: "#FF3B30",
  },
  actionButtonsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  reorderButton: {
    flex: 1,
    backgroundColor: "#f5f5f5",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ddd",
  },
  reorderButtonActive: {
    backgroundColor: "#e8f4ff",
    borderColor: "#007AFF",
  },
  reorderButtonText: {
    fontSize: 14,
    color: "#666",
    fontWeight: "500",
  },
  reorderButtonTextActive: {
    color: "#007AFF",
  },
  addSegmentButton: {
    flex: 1,
    backgroundColor: "#f0f8ff",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#007AFF",
    borderStyle: "dashed",
  },
  addSegmentButtonDark: {
    backgroundColor: "#1a3a5c",
  },
  addSegmentButtonText: {
    fontSize: 14,
    color: "#007AFF",
    fontWeight: "500",
  },
  formatInfo: {
    backgroundColor: "#f0f8ff",
    borderRadius: 10,
    padding: 14,
    marginTop: 8,
  },
  formatInfoDark: {
    backgroundColor: "#1a3a5c",
  },
  formatTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 6,
  },
  formatText: {
    fontSize: 12,
    color: "#666",
  },
  formatHint: {
    fontSize: 11,
    color: "#999",
    marginTop: 6,
    fontStyle: "italic",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 12,
  },
  emptyText: {
    textAlign: "center",
    color: "#999",
    paddingVertical: 20,
  },
  historyContainer: {
    flex: 1,
  },
  historyItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  historyItemDark: {
    backgroundColor: "#2c2c2e",
  },
  historyItemLeft: {
    flex: 1,
  },
  historyItemSku: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  historyItemDate: {
    fontSize: 11,
    color: "#999",
    marginTop: 4,
  },
  historyItemRight: {
    marginLeft: 12,
  },
  historyItemNumber: {
    fontSize: 14,
    fontWeight: "600",
    color: "#007AFF",
  },
  historyItemSelected: {
    backgroundColor: "rgba(0, 122, 255, 0.15)",
    borderWidth: 2,
    borderColor: "#007AFF",
  },
  historyToolbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  historyEditButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#007AFF",
  },
  historyEditButtonActive: {
    backgroundColor: "#999",
  },
  historyEditButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  historyEditButtonTextActive: {
    color: "#fff",
  },
  historyEditToolbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 4,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0, 0, 0, 0.1)",
  },
  selectAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  selectAllText: {
    fontSize: 14,
    color: "#333",
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#ccc",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  checkboxChecked: {
    backgroundColor: "#007AFF",
    borderColor: "#007AFF",
  },
  checkboxCheck: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
  },
  deleteSelectedButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: "#FF3B30",
  },
  deleteSelectedButtonDisabled: {
    opacity: 0.5,
  },
  deleteSelectedButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  historyCheckboxContainer: {
    marginRight: 12,
    justifyContent: "center",
  },
  deleteConfirmModal: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    width: "85%",
    maxWidth: 340,
  },
  deleteConfirmTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
    textAlign: "center",
    marginBottom: 12,
  },
  deleteConfirmMessage: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginBottom: 16,
  },
  deleteConfirmWarning: {
    backgroundColor: "rgba(255, 59, 48, 0.1)",
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
  },
  deleteConfirmWarningText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FF3B30",
    marginBottom: 8,
  },
  deleteConfirmWarningDesc: {
    fontSize: 13,
    color: "#FF3B30",
    lineHeight: 18,
    marginBottom: 4,
  },
  deleteConfirmButton: {
    flex: 1,
    backgroundColor: "#FF3B30",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  deleteConfirmButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  sequencesContainer: {
    flex: 1,
  },
  sequenceItem: {
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  sequenceItemDark: {
    backgroundColor: "#2c2c2e",
  },
  sequenceItemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  sequenceItemPrefix: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  sequenceItemNumber: {
    fontSize: 14,
    fontWeight: "600",
    color: "#007AFF",
  },
  sequenceItemActions: {
    flexDirection: "row",
    gap: 8,
  },
  sequenceActionButton: {
    backgroundColor: "#e0e0e0",
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  sequenceActionButtonWarning: {
    backgroundColor: "#FF9500",
  },
  sequenceActionButtonDanger: {
    backgroundColor: "#FF3B30",
  },
  sequenceActionButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#fff",
  },
  footer: {
    flexDirection: "row",
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "#e0e0e0",
  },
  cancelButton: {
    flex: 1,
    backgroundColor: "#f5f5f5",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
  },
  cancelButtonDark: {
    backgroundColor: "#2c2c2e",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#666",
  },
  confirmButton: {
    flex: 2,
    backgroundColor: "#007AFF",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
  },
  confirmButtonDisabled: {
    backgroundColor: "#ccc",
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  textDark: {
    color: "#fff",
  },
  textMuted: {
    color: "#aaa",
  },
  // 子弹窗样式
  subModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  subModalContent: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    width: "85%",
    maxWidth: 320,
  },
  subModalContentDark: {
    backgroundColor: "#2c2c2e",
  },
  subModalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    textAlign: "center",
    marginBottom: 16,
  },
  subModalInput: {
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 12,
    color: "#333",
  },
  subModalInputDark: {
    backgroundColor: "#3c3c3e",
    color: "#fff",
  },
  subModalButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  subModalCancelButton: {
    flex: 1,
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
  },
  subModalCancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#666",
  },
  subModalConfirmButton: {
    flex: 1,
    backgroundColor: "#007AFF",
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
  },
  subModalConfirmButtonDisabled: {
    backgroundColor: "#ccc",
  },
  subModalConfirmButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
});
