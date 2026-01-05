/**
 * Box 管理器弹窗组件
 * 支持创建、查看、编辑、删除 Box
 * Box 代码格式: [品牌2位]-[大类2位]-[流水号4位]
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
import { BoxGenerator, BoxRecord } from "@/lib/box-generator";
import { CodeOption } from "@/lib/sku-generator";

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

// 跨平台提示
const showAlert = (title: string, message: string) => {
  if (Platform.OS === "web") {
    window.alert(`${title}\n${message}`);
  } else {
    Alert.alert(title, message);
  }
};

interface BoxManagerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect?: (boxCode: string, shelfLocation: string) => void; // 选择 Box 时的回调
  products?: Array<{ boxCode?: string }>; // 产品列表，用于统计
  mode?: "manage" | "select"; // 管理模式或选择模式
}

// 视图模式
type ViewMode = "generator" | "list";

export default function BoxManagerModal({
  visible,
  onClose,
  onSelect,
  products = [],
  mode = "manage",
}: BoxManagerModalProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  // 视图模式
  const [viewMode, setViewMode] = useState<ViewMode>("generator");

  // 品牌和大类选项
  const [brandOptions, setBrandOptions] = useState<CodeOption[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<CodeOption[]>([]);

  // 选中的值
  const [selectedBrand, setSelectedBrand] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [shelfLocation, setShelfLocation] = useState<string>("Shelf-1");

  // 预览的 Box 代码
  const [previewCode, setPreviewCode] = useState<string>("");

  // Box 列表
  const [boxes, setBoxes] = useState<BoxRecord[]>([]);

  // 编辑模式
  const [editingBox, setEditingBox] = useState<BoxRecord | null>(null);
  const [editShelfLocation, setEditShelfLocation] = useState<string>("");

  // 加载选项
  const loadOptions = useCallback(async () => {
    const brands = await BoxGenerator.getBrandOptions();
    const categories = await BoxGenerator.getCategoryOptions();
    setBrandOptions(brands);
    setCategoryOptions(categories);

    // 设置默认选中
    if (brands.length > 0 && !selectedBrand) {
      setSelectedBrand(brands[0].code);
    }
    if (categories.length > 0 && !selectedCategory) {
      setSelectedCategory(categories[0].code);
    }
  }, []);

  // 加载 Box 列表
  const loadBoxes = useCallback(async () => {
    const allBoxes = await BoxGenerator.getAllBoxes();
    // 按创建时间倒序
    allBoxes.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    setBoxes(allBoxes);
  }, []);

  // 更新预览
  const updatePreview = useCallback(async () => {
    if (selectedBrand && selectedCategory) {
      const code = await BoxGenerator.previewBoxCode(selectedBrand, selectedCategory);
      setPreviewCode(code);
    } else {
      setPreviewCode("");
    }
  }, [selectedBrand, selectedCategory]);

  // 初始化
  useEffect(() => {
    if (visible) {
      loadOptions();
      loadBoxes();
    }
  }, [visible, loadOptions, loadBoxes]);

  // 更新预览
  useEffect(() => {
    updatePreview();
  }, [selectedBrand, selectedCategory, updatePreview]);

  // 创建 Box
  const handleCreateBox = async () => {
    if (!selectedBrand || !selectedCategory) {
      showAlert("提示", "请选择品牌和大类");
      return;
    }

    const newBox = await BoxGenerator.createBox(selectedBrand, selectedCategory, shelfLocation);
    await loadBoxes();
    await updatePreview();

    if (mode === "select" && onSelect) {
      onSelect(newBox.code, newBox.shelfLocation);
      onClose();
    } else {
      showAlert("成功", `Box ${newBox.code} 已创建`);
    }
  };

  // 选择已有 Box
  const handleSelectBox = (box: BoxRecord) => {
    if (mode === "select" && onSelect) {
      onSelect(box.code, box.shelfLocation);
      onClose();
    }
  };

  // 开始编辑
  const handleStartEdit = (box: BoxRecord) => {
    setEditingBox(box);
    setEditShelfLocation(box.shelfLocation);
  };

  // 保存编辑
  const handleSaveEdit = async () => {
    if (!editingBox) return;

    await BoxGenerator.updateBox(editingBox.id, { shelfLocation: editShelfLocation });
    setEditingBox(null);
    await loadBoxes();
  };

  // 取消编辑
  const handleCancelEdit = () => {
    setEditingBox(null);
    setEditShelfLocation("");
  };

  // 删除 Box
  const handleDeleteBox = (box: BoxRecord) => {
    const productCount = BoxGenerator.getProductCountInBox(box.code, products);

    if (productCount > 0) {
      showAlert(
        "无法删除",
        `此 Box 中还有 ${productCount} 个产品，请先移除或转移这些产品后再删除。`
      );
      return;
    }

    showConfirm("确认删除", `确定要删除 Box ${box.code} 吗？`, async () => {
      await BoxGenerator.deleteBox(box.id);
      await loadBoxes();
    });
  };

  // 重置流水号为0
  const handleResetSequence = () => {
    showConfirm(
      "确认置0",
      "确定要将 Box 流水号重置为 0 吗？\n\n重置后，下一个创建的 Box 将从 0001 开始编号。",
      async () => {
        await BoxGenerator.resetSequence();
        await updatePreview();
        showAlert("成功", "Box 流水号已重置为 0");
      }
    );
  };

  // 渲染生成器视图
  const renderGeneratorView = () => (
    <>
      {/* Box 代码预览 */}
      <View style={[styles.previewSection, isDark && styles.previewSectionDark]}>
        <Text style={[styles.previewLabel, isDark && styles.textMuted]}>
          生成的 Box 代码:
        </Text>
        <Text style={[styles.previewCode, isDark && styles.textDark]}>
          {previewCode || "请选择品牌和大类"}
        </Text>
      </View>

      {/* 品牌选择 */}
      <View style={styles.selectorSection}>
        <Text style={[styles.selectorLabel, isDark && styles.textDark]}>品牌代码</Text>
        <View style={styles.optionsGrid}>
          {brandOptions.map((option) => (
            <TouchableOpacity
              key={option.code}
              style={[
                styles.optionButton,
                selectedBrand === option.code && styles.optionButtonSelected,
              ]}
              onPress={() => setSelectedBrand(option.code)}
            >
              <Text
                style={[
                  styles.optionCode,
                  selectedBrand === option.code && styles.optionTextSelected,
                ]}
              >
                {option.code}
              </Text>
              <Text
                style={[
                  styles.optionName,
                  selectedBrand === option.code && styles.optionTextSelected,
                ]}
                numberOfLines={1}
              >
                {option.nameCn}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* 大类选择 */}
      <View style={styles.selectorSection}>
        <Text style={[styles.selectorLabel, isDark && styles.textDark]}>大类代码</Text>
        <View style={styles.optionsGrid}>
          {categoryOptions.map((option) => (
            <TouchableOpacity
              key={option.code}
              style={[
                styles.optionButton,
                selectedCategory === option.code && styles.optionButtonSelected,
              ]}
              onPress={() => setSelectedCategory(option.code)}
            >
              <Text
                style={[
                  styles.optionCode,
                  selectedCategory === option.code && styles.optionTextSelected,
                ]}
              >
                {option.code}
              </Text>
              <Text
                style={[
                  styles.optionName,
                  selectedCategory === option.code && styles.optionTextSelected,
                ]}
                numberOfLines={1}
              >
                {option.nameCn}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* 货架位置 */}
      <View style={styles.selectorSection}>
        <Text style={[styles.selectorLabel, isDark && styles.textDark]}>货架位置</Text>
        <TextInput
          style={[styles.textInput, isDark && styles.textInputDark]}
          value={shelfLocation}
          onChangeText={setShelfLocation}
          placeholder="例如: Shelf-1"
          placeholderTextColor="#999"
        />
      </View>

      {/* 格式说明 */}
      <View style={[styles.formatInfo, isDark && styles.formatInfoDark]}>
        <Text style={[styles.formatTitle, isDark && styles.textDark]}>Box 格式说明</Text>
        <Text style={[styles.formatText, isDark && styles.textMuted]}>
          品牌代码(2位)-大类代码(2位)-Box-流水号(4位)
        </Text>
        <Text style={[styles.formatHint, isDark && styles.textMuted]}>
          流水号全局统一递增
        </Text>
      </View>
    </>
  );

  // 渲染列表视图
  const renderListView = () => (
    <View style={styles.listContainer}>
      {/* 置0按钮 */}
      {mode === "manage" && (
        <View style={styles.resetSection}>
          <TouchableOpacity
            style={[styles.resetButton, isDark && styles.resetButtonDark]}
            onPress={handleResetSequence}
          >
            <Text style={styles.resetButtonText}>🔄 流水号置0</Text>
          </TouchableOpacity>
          <Text style={[styles.resetHint, isDark && styles.textMuted]}>
            重置后下一个 Box 将从 0001 开始
          </Text>
        </View>
      )}

      {boxes.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyText, isDark && styles.textMuted]}>
            暂无 Box 记录
          </Text>
          <Text style={[styles.emptyHint, isDark && styles.textMuted]}>
            切换到「生成器」创建新 Box
          </Text>
        </View>
      ) : (
        boxes.map((box) => {
          const productCount = BoxGenerator.getProductCountInBox(box.code, products);
          const isEditing = editingBox?.id === box.id;

          return (
            <View
              key={box.id}
              style={[
                styles.boxItem,
                isDark && styles.boxItemDark,
                mode === "select" && styles.boxItemSelectable,
              ]}
            >
              <TouchableOpacity
                style={styles.boxItemMain}
                onPress={() => mode === "select" && handleSelectBox(box)}
                disabled={mode !== "select"}
              >
                <Text style={[styles.boxCode, isDark && styles.textDark]}>{box.code}</Text>
                <View style={styles.boxMeta}>
                  {isEditing ? (
                    <TextInput
                      style={[styles.editInput, isDark && styles.editInputDark]}
                      value={editShelfLocation}
                      onChangeText={setEditShelfLocation}
                      placeholder="货架位置"
                      placeholderTextColor="#999"
                    />
                  ) : (
                    <Text style={[styles.boxShelf, isDark && styles.textMuted]}>
                      📍 {box.shelfLocation}
                    </Text>
                  )}
                  <Text style={[styles.boxCount, isDark && styles.textMuted]}>
                    📦 {productCount} 个产品
                  </Text>
                </View>
              </TouchableOpacity>

              {mode === "manage" && (
                <View style={styles.boxActions}>
                  {isEditing ? (
                    <>
                      <TouchableOpacity
                        style={[styles.actionButton, styles.saveButton]}
                        onPress={handleSaveEdit}
                      >
                        <Text style={styles.actionButtonText}>✓</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionButton, styles.cancelButton]}
                        onPress={handleCancelEdit}
                      >
                        <Text style={styles.actionButtonText}>✕</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <>
                      <TouchableOpacity
                        style={[styles.actionButton, styles.editButton]}
                        onPress={() => handleStartEdit(box)}
                      >
                        <Text style={styles.actionButtonText}>✏️</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionButton, styles.deleteButton]}
                        onPress={() => handleDeleteBox(box)}
                      >
                        <Text style={styles.actionButtonText}>🗑️</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              )}

              {mode === "select" && (
                <View style={styles.selectIndicator}>
                  <Text style={styles.selectArrow}>→</Text>
                </View>
              )}
            </View>
          );
        })
      )}
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.modalContainer, isDark && styles.modalContainerDark]}>
          {/* 标题栏 */}
          <View style={styles.header}>
            <Text style={[styles.title, isDark && styles.textDark]}>
              {mode === "select" ? "选择 Box" : "Box 管理器"}
            </Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Tab 切换 */}
          <View style={styles.tabBar}>
            <TouchableOpacity
              style={[styles.tab, viewMode === "generator" && styles.tabActive]}
              onPress={() => setViewMode("generator")}
            >
              <Text
                style={[
                  styles.tabText,
                  viewMode === "generator" && styles.tabTextActive,
                ]}
              >
                生成器
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, viewMode === "list" && styles.tabActive]}
              onPress={() => setViewMode("list")}
            >
              <Text
                style={[styles.tabText, viewMode === "list" && styles.tabTextActive]}
              >
                Box 列表 ({boxes.length})
              </Text>
            </TouchableOpacity>
          </View>

          {/* 内容区 */}
          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {viewMode === "generator" ? renderGeneratorView() : renderListView()}
          </ScrollView>

          {/* 底部按钮 */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.footerButton, styles.cancelFooterButton]}
              onPress={onClose}
            >
              <Text style={styles.cancelFooterButtonText}>取消</Text>
            </TouchableOpacity>
            {viewMode === "generator" && (
              <TouchableOpacity
                style={[
                  styles.footerButton,
                  styles.confirmFooterButton,
                  (!selectedBrand || !selectedCategory) && styles.footerButtonDisabled,
                ]}
                onPress={handleCreateBox}
                disabled={!selectedBrand || !selectedCategory}
              >
                <Text style={styles.confirmFooterButtonText}>
                  {mode === "select" ? "创建并使用" : "创建 Box"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContainer: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "90%",
    minHeight: "60%",
  },
  modalContainerDark: {
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
    color: "#000",
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#f0f0f0",
    justifyContent: "center",
    alignItems: "center",
  },
  closeButtonText: {
    fontSize: 16,
    color: "#666",
  },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 2,
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
    marginBottom: -2,
  },
  tabText: {
    fontSize: 14,
    color: "#666",
  },
  tabTextActive: {
    color: "#007AFF",
    fontWeight: "600",
  },
  content: {
    flex: 1,
    padding: 16,
  },
  previewSection: {
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    alignItems: "center",
  },
  previewSectionDark: {
    backgroundColor: "#2c2c2e",
  },
  previewLabel: {
    fontSize: 12,
    color: "#666",
    marginBottom: 8,
  },
  previewCode: {
    fontSize: 24,
    fontWeight: "700",
    color: "#007AFF",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  selectorSection: {
    marginBottom: 20,
  },
  selectorLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 10,
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
  textInput: {
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: "#333",
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  textInputDark: {
    backgroundColor: "#2c2c2e",
    color: "#fff",
    borderColor: "#3c3c3e",
  },
  formatInfo: {
    backgroundColor: "#f0f8ff",
    borderRadius: 8,
    padding: 12,
    marginTop: 10,
  },
  formatInfoDark: {
    backgroundColor: "#1a2a3a",
  },
  formatTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  formatText: {
    fontSize: 12,
    color: "#666",
  },
  formatHint: {
    fontSize: 11,
    color: "#999",
    marginTop: 4,
  },
  listContainer: {
    flex: 1,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    color: "#666",
  },
  emptyHint: {
    fontSize: 12,
    color: "#999",
    marginTop: 8,
  },
  boxItem: {
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  boxItemDark: {
    backgroundColor: "#2c2c2e",
  },
  boxItemSelectable: {
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  boxItemMain: {
    flex: 1,
  },
  boxCode: {
    fontSize: 16,
    fontWeight: "600",
    color: "#007AFF",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  boxMeta: {
    flexDirection: "row",
    marginTop: 6,
    gap: 12,
  },
  boxShelf: {
    fontSize: 12,
    color: "#666",
  },
  boxCount: {
    fontSize: 12,
    color: "#666",
  },
  boxActions: {
    flexDirection: "row",
    gap: 8,
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  actionButtonText: {
    fontSize: 16,
  },
  editButton: {
    backgroundColor: "#e0e0e0",
  },
  deleteButton: {
    backgroundColor: "#ffebee",
  },
  saveButton: {
    backgroundColor: "#e8f5e9",
  },
  cancelButton: {
    backgroundColor: "#fff3e0",
  },
  editInput: {
    backgroundColor: "#fff",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 12,
    minWidth: 100,
    borderWidth: 1,
    borderColor: "#007AFF",
  },
  editInputDark: {
    backgroundColor: "#3c3c3e",
    color: "#fff",
  },
  selectIndicator: {
    paddingLeft: 10,
  },
  selectArrow: {
    fontSize: 18,
    color: "#007AFF",
  },
  footer: {
    flexDirection: "row",
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "#e0e0e0",
  },
  footerButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  cancelFooterButton: {
    backgroundColor: "#f0f0f0",
  },
  cancelFooterButtonText: {
    fontSize: 16,
    color: "#666",
  },
  confirmFooterButton: {
    backgroundColor: "#007AFF",
  },
  confirmFooterButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  footerButtonDisabled: {
    backgroundColor: "#ccc",
  },
  textDark: {
    color: "#fff",
  },
  textMuted: {
    color: "#999",
  },
  resetSection: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  resetButton: {
    backgroundColor: "#fff3e0",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ffb74d",
  },
  resetButtonDark: {
    backgroundColor: "#3c3c3e",
    borderColor: "#ffb74d",
  },
  resetButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#f57c00",
  },
  resetHint: {
    fontSize: 11,
    color: "#999",
    flex: 1,
    textAlign: "right",
    marginLeft: 12,
  },
});
