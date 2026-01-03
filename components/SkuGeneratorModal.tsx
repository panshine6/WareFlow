/**
 * SKU 生成助手弹窗组件
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
} from "react-native";
import {
  SkuGenerator,
  BRAND_CODES,
  CATEGORY_CODES,
  MATERIAL_CODES,
  COLOR_CODES,
  CodeOption,
} from "@/lib/sku-generator";

interface SkuGeneratorModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (sku: string) => void;
  initialSku?: string;
}

type CodeType = "brand" | "category" | "material" | "color";

export default function SkuGeneratorModal({
  visible,
  onClose,
  onConfirm,
  initialSku,
}: SkuGeneratorModalProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  // 选中的代码
  const [selectedBrand, setSelectedBrand] = useState("LB");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedMaterial, setSelectedMaterial] = useState("");
  const [selectedColor, setSelectedColor] = useState("");

  // 自定义输入
  const [customBrand, setCustomBrand] = useState("");
  const [customCategory, setCustomCategory] = useState("");
  const [customMaterial, setCustomMaterial] = useState("");
  const [customColor, setCustomColor] = useState("");

  // 是否使用自定义输入
  const [useCustomBrand, setUseCustomBrand] = useState(false);
  const [useCustomCategory, setUseCustomCategory] = useState(false);
  const [useCustomMaterial, setUseCustomMaterial] = useState(false);
  const [useCustomColor, setUseCustomColor] = useState(false);

  // 生成的 SKU 预览
  const [previewSku, setPreviewSku] = useState("");
  const [nextNumber, setNextNumber] = useState(1);

  // 当前展开的选择器
  const [expandedSection, setExpandedSection] = useState<CodeType | null>(null);

  // 获取实际使用的代码
  const getBrand = () => (useCustomBrand ? customBrand : selectedBrand);
  const getCategory = () => (useCustomCategory ? customCategory : selectedCategory);
  const getMaterial = () => (useCustomMaterial ? customMaterial : selectedMaterial);
  const getColor = () => (useCustomColor ? customColor : selectedColor);

  // 更新 SKU 预览
  const updatePreview = useCallback(async () => {
    const brand = getBrand();
    const category = getCategory();
    const material = getMaterial();
    const color = getColor();

    if (brand && category && material && color) {
      const params = { brand, category, material, color };
      const sku = await SkuGenerator.previewSku(params);
      setPreviewSku(sku);
      
      const prefix = SkuGenerator.generatePrefix(params);
      const num = await SkuGenerator.getNextNumber(prefix);
      setNextNumber(num);
    } else {
      setPreviewSku("");
      setNextNumber(1);
    }
  }, [selectedBrand, selectedCategory, selectedMaterial, selectedColor, 
      customBrand, customCategory, customMaterial, customColor,
      useCustomBrand, useCustomCategory, useCustomMaterial, useCustomColor]);

  useEffect(() => {
    if (visible) {
      updatePreview();
    }
  }, [visible, updatePreview]);

  // 处理确认
  const handleConfirm = async () => {
    if (!previewSku) return;
    
    // 确认使用 SKU，更新序列
    await SkuGenerator.confirmSku(previewSku);
    onConfirm(previewSku);
    onClose();
  };

  // 渲染代码选择器
  const renderCodeSelector = (
    type: CodeType,
    options: CodeOption[],
    selected: string,
    setSelected: (code: string) => void,
    custom: string,
    setCustom: (code: string) => void,
    useCustom: boolean,
    setUseCustom: (use: boolean) => void,
    label: string
  ) => {
    const isExpanded = expandedSection === type;
    const currentValue = useCustom ? custom : selected;
    const currentOption = options.find((o) => o.code === selected);

    return (
      <View style={styles.selectorContainer}>
        <TouchableOpacity
          style={[
            styles.selectorHeader,
            isDark && styles.selectorHeaderDark,
            isExpanded && styles.selectorHeaderExpanded,
          ]}
          onPress={() => setExpandedSection(isExpanded ? null : type)}
        >
          <View style={styles.selectorHeaderLeft}>
            <Text style={[styles.selectorLabel, isDark && styles.textDark]}>
              {label}
            </Text>
            {currentValue ? (
              <View style={styles.selectedBadge}>
                <Text style={styles.selectedBadgeText}>{currentValue}</Text>
              </View>
            ) : null}
          </View>
          <Text style={[styles.selectorArrow, isDark && styles.textDark]}>
            {isExpanded ? "▲" : "▼"}
          </Text>
        </TouchableOpacity>

        {isExpanded && (
          <View style={[styles.selectorContent, isDark && styles.selectorContentDark]}>
            {/* 预设选项 */}
            <View style={styles.optionsGrid}>
              {options.map((option) => (
                <TouchableOpacity
                  key={option.code}
                  style={[
                    styles.optionButton,
                    selected === option.code && !useCustom && styles.optionButtonSelected,
                  ]}
                  onPress={() => {
                    setSelected(option.code);
                    setUseCustom(false);
                    updatePreview();
                  }}
                >
                  <Text
                    style={[
                      styles.optionCode,
                      selected === option.code && !useCustom && styles.optionTextSelected,
                    ]}
                  >
                    {option.code}
                  </Text>
                  <Text
                    style={[
                      styles.optionName,
                      selected === option.code && !useCustom && styles.optionTextSelected,
                    ]}
                    numberOfLines={1}
                  >
                    {option.nameCn}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* 自定义输入 */}
            <View style={styles.customInputContainer}>
              <Text style={[styles.customInputLabel, isDark && styles.textDark]}>
                自定义代码:
              </Text>
              <TextInput
                style={[
                  styles.customInput,
                  isDark && styles.customInputDark,
                  useCustom && styles.customInputActive,
                ]}
                value={custom}
                onChangeText={(text) => {
                  setCustom(text.toUpperCase().slice(0, 2));
                  setUseCustom(true);
                  updatePreview();
                }}
                placeholder="2位"
                placeholderTextColor="#999"
                maxLength={2}
                autoCapitalize="characters"
              />
            </View>
          </View>
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

          <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
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

            {/* 品牌选择 */}
            {renderCodeSelector(
              "brand",
              BRAND_CODES,
              selectedBrand,
              setSelectedBrand,
              customBrand,
              setCustomBrand,
              useCustomBrand,
              setUseCustomBrand,
              "品牌代码"
            )}

            {/* 大类选择 */}
            {renderCodeSelector(
              "category",
              CATEGORY_CODES,
              selectedCategory,
              setSelectedCategory,
              customCategory,
              setCustomCategory,
              useCustomCategory,
              setUseCustomCategory,
              "大类代码"
            )}

            {/* 材料选择 */}
            {renderCodeSelector(
              "material",
              MATERIAL_CODES,
              selectedMaterial,
              setSelectedMaterial,
              customMaterial,
              setCustomMaterial,
              useCustomMaterial,
              setUseCustomMaterial,
              "材料代码"
            )}

            {/* 颜色选择 */}
            {renderCodeSelector(
              "color",
              COLOR_CODES,
              selectedColor,
              setSelectedColor,
              customColor,
              setCustomColor,
              useCustomColor,
              setUseCustomColor,
              "颜色代码"
            )}

            {/* SKU 格式说明 */}
            <View style={[styles.formatInfo, isDark && styles.formatInfoDark]}>
              <Text style={[styles.formatTitle, isDark && styles.textDark]}>
                SKU 格式说明
              </Text>
              <Text style={[styles.formatText, isDark && styles.textMuted]}>
                品牌(2位)-大类(2位)-材料(2位)-颜色(2位)-流水号(4位)
              </Text>
              <Text style={[styles.formatExample, isDark && styles.textMuted]}>
                示例: LB-ES-CR-RE-0001 = Ladybuty 耳钉 水晶 红色 第1号
              </Text>
            </View>
          </ScrollView>

          {/* 底部按钮 */}
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
        </View>
      </View>
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
  scrollContent: {
    padding: 16,
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
    fontSize: 24,
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
    minWidth: 80,
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
    fontSize: 11,
    color: "#666",
    marginTop: 2,
  },
  optionTextSelected: {
    color: "#fff",
  },
  customInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e0e0e0",
  },
  customInputLabel: {
    fontSize: 14,
    color: "#666",
    marginRight: 10,
  },
  customInput: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  customInputDark: {
    backgroundColor: "#2c2c2e",
    color: "#fff",
  },
  customInputActive: {
    borderColor: "#007AFF",
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
    marginBottom: 4,
  },
  formatExample: {
    fontSize: 12,
    color: "#666",
    fontStyle: "italic",
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
});
