/**
 * 颜色选择器弹窗组件
 * 用于"同款不同色"功能，从SKU颜色库中选择颜色
 */

import React, { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
} from "react-native";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { SkuGenerator, CodeOption } from "@/lib/sku-generator";

interface ColorPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (newSku: string, colorCode: string, colorName: string) => void;
  currentSku: string; // 当前产品的完整SKU，用于生成新SKU
}

// 颜色代码到实际颜色的映射（用于显示色块）
const COLOR_MAP: Record<string, string> = {
  RE: "#FF0000", // 红色
  BL: "#0000FF", // 蓝色
  GR: "#00FF00", // 绿色
  YE: "#FFFF00", // 黄色
  BK: "#000000", // 黑色
  WH: "#FFFFFF", // 白色
  PK: "#FFC0CB", // 粉色
  OR: "#FFA500", // 橙色
  PU: "#800080", // 紫色
  PP: "#800080", // 紫色（别名）
  SV: "#C0C0C0", // 银色
  GD: "#FFD700", // 金色
  BR: "#8B4513", // 棕色
  MC: "linear-gradient(45deg, red, blue, green)", // 多色
  NT: "#D2B48C", // 原色/自然色
  YL: "#FFFF00", // 黄色（别名）
};

/**
 * 解析SKU，提取前缀（不含颜色）和当前颜色代码
 * SKU格式：LB-ED-IR-HW-0017-PK
 * 返回：{ baseSkuWithoutColor: "LB-ED-IR-HW-0017", currentColorCode: "PK" }
 */
function parseSkuForColorChange(sku: string): { baseSkuWithoutColor: string; currentColorCode: string | null } {
  const parts = sku.split("-");
  
  // SKU至少需要有2个部分
  if (parts.length < 2) {
    return { baseSkuWithoutColor: sku, currentColorCode: null };
  }
  
  // 最后一部分可能是颜色代码（2个字母）
  const lastPart = parts[parts.length - 1];
  
  // 检查最后一部分是否是颜色代码（2个大写字母，非数字）
  const isColorCode = /^[A-Z]{2}$/.test(lastPart) && !/^\d+$/.test(lastPart);
  
  if (isColorCode) {
    // 有颜色代码，去掉最后一部分
    return {
      baseSkuWithoutColor: parts.slice(0, -1).join("-"),
      currentColorCode: lastPart,
    };
  } else {
    // 没有颜色代码，整个SKU都是基础部分
    return {
      baseSkuWithoutColor: sku,
      currentColorCode: null,
    };
  }
}

/**
 * 生成新的SKU（替换颜色代码）
 */
function generateNewSkuWithColor(baseSkuWithoutColor: string, newColorCode: string): string {
  return `${baseSkuWithoutColor}-${newColorCode}`;
}

export default function ColorPickerModal({
  visible,
  onClose,
  onSelect,
  currentSku,
}: ColorPickerModalProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const [colorOptions, setColorOptions] = useState<CodeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [parsedSku, setParsedSku] = useState<{ baseSkuWithoutColor: string; currentColorCode: string | null }>({
    baseSkuWithoutColor: "",
    currentColorCode: null,
  });

  // 解析当前SKU
  useEffect(() => {
    if (currentSku) {
      const parsed = parseSkuForColorChange(currentSku);
      setParsedSku(parsed);
      console.log("[ColorPickerModal] Parsed SKU:", parsed);
    }
  }, [currentSku]);

  // 加载颜色选项
  useEffect(() => {
    const loadColors = async () => {
      try {
        setLoading(true);
        const segments = await SkuGenerator.getSegments();
        const colorSegment = segments.find(s => s.id === "color" || s.name === "颜色代码");
        if (colorSegment) {
          // 过滤掉空值选项和当前颜色
          const options = colorSegment.options.filter(
            o => o.code !== "" && o.code !== parsedSku.currentColorCode
          );
          setColorOptions(options);
          console.log("[ColorPickerModal] Loaded color options:", options.length);
        }
      } catch (error) {
        console.error("[ColorPickerModal] Failed to load colors:", error);
      } finally {
        setLoading(false);
      }
    };

    if (visible) {
      loadColors();
    }
  }, [visible, parsedSku.currentColorCode]);

  // 获取颜色的显示色值
  const getColorValue = (code: string): string => {
    return COLOR_MAP[code] || "#808080"; // 默认灰色
  };

  // 生成预览SKU
  const getPreviewSku = (colorCode: string): string => {
    return generateNewSkuWithColor(parsedSku.baseSkuWithoutColor, colorCode);
  };

  // 处理颜色选择
  const handleColorSelect = (option: CodeOption) => {
    const newSku = generateNewSkuWithColor(parsedSku.baseSkuWithoutColor, option.code);
    console.log("[ColorPickerModal] Selected color:", option.code, "New SKU:", newSku);
    onSelect(newSku, option.code, option.nameCn);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.container, isDark && styles.containerDark]}>
          <View style={styles.header}>
            <Text style={[styles.title, isDark && styles.textDark]}>
              选择颜色 - 同款不同色
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.skuInfoContainer}>
            <Text style={[styles.skuInfoLabel, isDark && styles.subtitleDark]}>
              原 SKU:
            </Text>
            <Text style={[styles.skuInfoValue, isDark && styles.textDark]}>
              {currentSku}
            </Text>
          </View>

          {parsedSku.currentColorCode && (
            <View style={styles.currentColorContainer}>
              <Text style={[styles.currentColorLabel, isDark && styles.subtitleDark]}>
                当前颜色:
              </Text>
              <View
                style={[
                  styles.currentColorSwatch,
                  { backgroundColor: getColorValue(parsedSku.currentColorCode) },
                  parsedSku.currentColorCode === "WH" && styles.colorSwatchBorder,
                ]}
              />
              <Text style={[styles.currentColorCode, isDark && styles.textDark]}>
                {parsedSku.currentColorCode}
              </Text>
            </View>
          )}

          <Text style={[styles.selectHint, isDark && styles.subtitleDark]}>
            选择新颜色，将生成同款式不同颜色的新 SKU:
          </Text>

          {loading ? (
            <View style={styles.loadingContainer}>
              <Text style={[styles.loadingText, isDark && styles.textDark]}>
                加载颜色库...
              </Text>
            </View>
          ) : (
            <ScrollView style={styles.colorList} showsVerticalScrollIndicator={false}>
              {colorOptions.map((option) => (
                <TouchableOpacity
                  key={option.code}
                  style={[styles.colorItem, isDark && styles.colorItemDark]}
                  onPress={() => handleColorSelect(option)}
                >
                  <View
                    style={[
                      styles.colorSwatch,
                      { backgroundColor: getColorValue(option.code) },
                      option.code === "WH" && styles.colorSwatchBorder,
                    ]}
                  />
                  <View style={styles.colorInfo}>
                    <Text style={[styles.colorCode, isDark && styles.textDark]}>
                      {option.code}
                    </Text>
                    <Text style={[styles.colorName, isDark && styles.subtitleDark]}>
                      {option.nameCn} / {option.nameEn}
                    </Text>
                  </View>
                  <View style={styles.previewSkuContainer}>
                    <Text style={[styles.previewSkuLabel, isDark && styles.subtitleDark]}>
                      新 SKU:
                    </Text>
                    <Text style={[styles.previewSku, isDark && styles.textDark]}>
                      {getPreviewSku(option.code)}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}

              {colorOptions.length === 0 && (
                <Text style={[styles.emptyText, isDark && styles.subtitleDark]}>
                  没有可用的颜色选项
                </Text>
              )}
            </ScrollView>
          )}

          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelButtonText}>取消</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  container: {
    backgroundColor: "#fff",
    borderRadius: 16,
    width: "90%",
    maxWidth: 420,
    maxHeight: "85%",
    padding: 20,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
      },
      android: {
        elevation: 5,
      },
      web: {
        boxShadow: "0 4px 20px rgba(0, 0, 0, 0.15)",
      },
    }),
  },
  containerDark: {
    backgroundColor: "#1c1c1e",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#000",
  },
  textDark: {
    color: "#fff",
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    fontSize: 20,
    color: "#666",
  },
  skuInfoContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  skuInfoLabel: {
    fontSize: 13,
    color: "#666",
    marginRight: 8,
  },
  skuInfoValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#000",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  currentColorContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  currentColorLabel: {
    fontSize: 13,
    color: "#666",
    marginRight: 8,
  },
  currentColorSwatch: {
    width: 20,
    height: 20,
    borderRadius: 4,
    marginRight: 6,
  },
  currentColorCode: {
    fontSize: 14,
    fontWeight: "600",
    color: "#000",
  },
  selectHint: {
    fontSize: 13,
    color: "#666",
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  subtitleDark: {
    color: "#999",
  },
  loadingContainer: {
    padding: 40,
    alignItems: "center",
  },
  loadingText: {
    fontSize: 14,
    color: "#666",
  },
  colorList: {
    maxHeight: 350,
  },
  colorItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#f5f5f5",
    marginBottom: 8,
  },
  colorItemDark: {
    backgroundColor: "#2c2c2e",
  },
  colorSwatch: {
    width: 36,
    height: 36,
    borderRadius: 8,
    marginRight: 12,
  },
  colorSwatchBorder: {
    borderWidth: 1,
    borderColor: "#ddd",
  },
  colorInfo: {
    flex: 1,
  },
  colorCode: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000",
  },
  colorName: {
    fontSize: 12,
    color: "#666",
    marginTop: 2,
  },
  previewSkuContainer: {
    alignItems: "flex-end",
  },
  previewSkuLabel: {
    fontSize: 10,
    color: "#888",
    marginBottom: 2,
  },
  previewSku: {
    fontSize: 12,
    color: "#007AFF",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontWeight: "600",
  },
  emptyText: {
    textAlign: "center",
    padding: 20,
    color: "#666",
  },
  cancelButton: {
    marginTop: 16,
    padding: 14,
    borderRadius: 10,
    backgroundColor: "#f0f0f0",
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#666",
  },
});
