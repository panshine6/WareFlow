/**
 * 快速添加产品页面
 * 简化流程：拍细节图 → 拍全景图 → 确认信息 → 保存
 * 用户操作：5 次（原来 11 次）
 */
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { UserStorage } from "@/lib/user-storage";
import { SettingsStorage, ProductStorage } from "@/lib/storage";
import { calculateAndSaveProductHash, imageToBase64, performDuplicateCheck, DuplicateCheckResult } from "@/lib/deduplication";
import { generateSystemSKU, generateLabelForPTP300BT, shareBarcodeImage } from "@/lib/barcode";
import { countProductsInImage } from "@/lib/ai-vision";
import { compressImage, base64ToDataUrl } from "@/lib/image-utils";
import type { Product, InventoryHistoryEntry } from "@/types/product";

// 流程阶段
type FlowStage = 
  | "detail_photo"      // 拍细节图
  | "overview_photo"    // 拍全景图
  | "confirm_info";     // 确认信息

// 图片压缩配置
const IMAGE_MAX_SIZE = 2048;
const IMAGE_QUALITY = 0.85;

export default function AddProductQuickScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 流程状态
  const [stage, setStage] = useState<FlowStage>("detail_photo");
  const [processing, setProcessing] = useState(false);
  const [processingText, setProcessingText] = useState("");

  // 图片数据
  const [detailImageUri, setDetailImageUri] = useState("");
  const [detailImageBase64, setDetailImageBase64] = useState("");
  const [overviewImageUri, setOverviewImageUri] = useState("");

  // 查重结果
  const [duplicateResult, setDuplicateResult] = useState<DuplicateCheckResult | null>(null);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);

  // AI 计数结果
  const [aiCount, setAiCount] = useState<number>(0);
  const [showCountModal, setShowCountModal] = useState(false);

  // 表单数据
  const [sku, setSku] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [location, setLocation] = useState("");
  const [price, setPrice] = useState(9.9);
  const [operatorName, setOperatorName] = useState("");
  const [operatorId, setOperatorId] = useState(1);

  // 合并模式
  const [mergeToProductId, setMergeToProductId] = useState<string | null>(null);

  // 保存状态
  const [saving, setSaving] = useState(false);

  // 加载默认设置
  useEffect(() => {
    const loadDefaults = async () => {
      try {
        const [settings, user] = await Promise.all([
          SettingsStorage.get(),
          UserStorage.getCurrentUser(),
        ]);

        // 设置默认值
        if (settings.defaultLocation) {
          setLocation(settings.defaultLocation);
        }
        if (settings.lastPrice !== undefined) {
          setPrice(settings.lastPrice);
        } else {
          setPrice(9.9); // 默认价格
        }
        if (user) {
          setOperatorName(user.name || "未知用户");
          setOperatorId(parseInt(user.id?.toString() || "1"));
        }
      } catch (error) {
        console.error("[QuickAdd] Failed to load defaults:", error);
      }
    };

    loadDefaults();
  }, []);

  // 处理拍照
  const handleFileChange = async (event: Event) => {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    try {
      setProcessing(true);
      
      if (stage === "detail_photo") {
        setProcessingText("正在处理细节图...");
      } else {
        setProcessingText("正在处理全景图...");
      }

      // 读取文件为 base64
      const reader = new FileReader();
      const result = await new Promise<string>((resolve, reject) => {
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const originalBase64 = result.split(",")[1];

      // 压缩图片
      const compressedBase64 = await compressImage(originalBase64, IMAGE_MAX_SIZE, IMAGE_QUALITY);
      const dataUrl = base64ToDataUrl(compressedBase64);

      if (stage === "detail_photo") {
        // 保存细节图
        setDetailImageUri(dataUrl);
        setDetailImageBase64(compressedBase64);

        // 后台查重（静默）
        setProcessingText("正在后台查重...");
        const dupResult = await performDuplicateCheck(dataUrl, compressedBase64);
        setDuplicateResult(dupResult);
        console.log("[QuickAdd] Duplicate check result:", dupResult);

        // 切换到全景图阶段
        setStage("overview_photo");
      } else if (stage === "overview_photo") {
        // 保存全景图
        setOverviewImageUri(dataUrl);

        // AI 计数（静默）
        setProcessingText("AI 正在计数...");
        try {
          const count = await countProductsInImage(compressedBase64);
          setAiCount(count);
          setQuantity(count);
          console.log("[QuickAdd] AI count:", count);
        } catch (error) {
          console.error("[QuickAdd] AI count failed:", error);
          setAiCount(1);
          setQuantity(1);
        }

        // 切换到确认信息阶段
        setStage("confirm_info");
      }
    } catch (error) {
      console.error("[QuickAdd] Failed to process photo:", error);
      alert("处理照片失败，请重试");
    } finally {
      setProcessing(false);
      setProcessingText("");
      target.value = "";
    }
  };

  // 触发拍照
  const handleTakePhoto = () => {
    if (fileInputRef.current && !processing) {
      fileInputRef.current.click();
    }
  };

  // 点击 SKU 字段 - 显示查重结果
  const handleSkuPress = () => {
    setShowDuplicateModal(true);
  };

  // 选择新建 SKU
  const handleNewSku = () => {
    setMergeToProductId(null);
    setSku(""); // 用户需要输入新 SKU
    setShowDuplicateModal(false);
  };

  // 选择合并到现有产品
  const handleMergeToProduct = (product: Product) => {
    setMergeToProductId(product.id);
    setSku(product.sku);
    setShowDuplicateModal(false);
  };

  // 点击数量字段 - 显示 AI 计数结果
  const handleQuantityPress = () => {
    setShowCountModal(true);
  };

  // 确认数量
  const handleConfirmCount = (count: number) => {
    setQuantity(count);
    setShowCountModal(false);
  };

  // 创建入库历史记录
  const createHistoryEntry = (
    productId: string,
    qty: number,
    loc: string,
    detailUri: string,
    opId: number,
    opName: string
  ): InventoryHistoryEntry => {
    const now = new Date().toISOString();
    return {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      productId,
      timestamp: now,
      operatorId: opId,
      operatorName: opName,
      quantity: qty,
      location: loc,
      detailImageUri: detailUri,
      overviewImageUri: "",
    };
  };

  // 保存产品
  const handleSave = async (printBarcode: boolean = false) => {
    // 验证必填字段
    if (!sku.trim()) {
      alert("请输入 SKU");
      return;
    }
    if (quantity <= 0) {
      alert("请输入有效的数量");
      return;
    }
    if (!location.trim()) {
      alert("请输入存储位置");
      return;
    }

    setSaving(true);

    try {
      const now = new Date().toISOString();
      const locationValue = location.trim();
      let savedProduct: Product | null = null;

      if (mergeToProductId) {
        // ========== 合并到现有产品 ==========
        console.log("[QuickAdd] Merging to existing product:", mergeToProductId);

        const existingProduct = await ProductStorage.getById(mergeToProductId);
        if (!existingProduct) {
          throw new Error("产品不存在");
        }

        const historyEntry = createHistoryEntry(
          mergeToProductId,
          quantity,
          locationValue,
          detailImageUri,
          operatorId,
          operatorName
        );

        const existingHistory = existingProduct.history || [];

        await ProductStorage.update(mergeToProductId, {
          quantity: existingProduct.quantity + quantity,
          storageLocation: locationValue,
          updatedAt: now,
          price: price,
          history: [...existingHistory, historyEntry],
        });

        savedProduct = { ...existingProduct, quantity: existingProduct.quantity + quantity };
        console.log("[QuickAdd] Product merged");
      } else {
        // ========== 新产品 ==========
        const productId = Date.now().toString();
        const systemSku = generateSystemSKU();
        console.log("[QuickAdd] Creating new product with system SKU:", systemSku);

        const historyEntry = createHistoryEntry(
          productId,
          quantity,
          locationValue,
          detailImageUri,
          operatorId,
          operatorName
        );

        let product: Product = {
          id: productId,
          detailImageUri,
          overviewImageUri: "",
          sku: sku.trim(),
          systemSku,
          quantity,
          storageLocation: locationValue,
          operatorName,
          operatorId,
          createdAt: now,
          updatedAt: now,
          isDeleted: false,
          price,
          history: [historyEntry],
        };

        // 计算 pHash
        if (Platform.OS === "web" && detailImageBase64) {
          try {
            product = await calculateAndSaveProductHash(product, detailImageBase64);
            console.log("[QuickAdd] Product pHash calculated:", product.imageHash);
          } catch (error) {
            console.warn("[QuickAdd] Failed to calculate pHash:", error);
          }
        }

        await ProductStorage.add(product);
        savedProduct = product;
        console.log("[QuickAdd] Product created");
      }

      // 更新默认设置
      await SettingsStorage.update({
        defaultLocation: locationValue,
        lastPrice: price,
      });

      // 打印条形码
      if (printBarcode && savedProduct?.systemSku) {
        try {
          const barcodeDataUrl = await generateLabelForPTP300BT(savedProduct.systemSku);
          await shareBarcodeImage(barcodeDataUrl, savedProduct.systemSku);
        } catch (error) {
          console.error("[QuickAdd] Failed to generate barcode:", error);
          alert("条形码生成失败，但产品已保存");
        }
      }

      alert("产品入库成功！");
      router.replace("/(tabs)");
    } catch (error) {
      console.error("[QuickAdd] Failed to save product:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      alert(`保存失败：${errorMessage}`);
    } finally {
      setSaving(false);
    }
  };

  // 获取阶段提示
  const getStageHint = () => {
    switch (stage) {
      case "detail_photo":
        return {
          title: "📸 拍摄细节图",
          hint: "请切换到微距模式",
          subHint: "💡 自然光下，充足光线，保持稳定",
        };
      case "overview_photo":
        return {
          title: "📷 拍摄全景图",
          hint: "请切换到普通模式",
          subHint: "💡 将产品摊开放在深色背景上",
        };
      default:
        return { title: "", hint: "", subHint: "" };
    }
  };

  const isDark = colorScheme === "dark";
  const inputBg = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)";
  const inputColor = isDark ? "#fff" : "#000";
  const placeholderColor = isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.4)";

  // 相机阶段 UI
  if (stage === "detail_photo" || stage === "overview_photo") {
    const stageHint = getStageHint();

    return (
      <ThemedView style={styles.container}>
        {/* 隐藏的文件输入 */}
        <input
          ref={fileInputRef as any}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: "none" }}
          onChange={handleFileChange as any}
        />

        <View style={[styles.cameraContainer, { paddingTop: Math.max(insets.top, 20) }]}>
          {/* 返回按钮 */}
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <ThemedText style={styles.backButtonText}>← 返回</ThemedText>
          </Pressable>

          {/* 加载遮罩 */}
          {processing && (
            <View style={styles.loadingOverlay}>
              <View style={styles.loadingCard}>
                <ActivityIndicator size="large" color="#007AFF" />
                <ThemedText style={styles.loadingText}>{processingText}</ThemedText>
              </View>
            </View>
          )}

          {/* 提示区域 */}
          <View style={styles.hintArea}>
            <ThemedText style={styles.stageTitle}>{stageHint.title}</ThemedText>
            <ThemedText style={styles.stageHint}>{stageHint.hint}</ThemedText>
            <ThemedText style={styles.stageSubHint}>{stageHint.subHint}</ThemedText>
          </View>

          {/* 已拍摄的细节图预览（仅在全景图阶段显示） */}
          {stage === "overview_photo" && detailImageUri && (
            <View style={styles.thumbnailContainer}>
              <ThemedText style={styles.thumbnailLabel}>✓ 细节图已拍摄</ThemedText>
              <Image source={{ uri: detailImageUri }} style={styles.thumbnail} />
            </View>
          )}

          {/* 拍照按钮 */}
          <View style={styles.captureArea}>
            <Pressable
              style={({ pressed }) => [
                styles.captureButton,
                { opacity: pressed || processing ? 0.7 : 1 },
              ]}
              onPress={handleTakePhoto}
              disabled={processing}
            >
              <View style={styles.captureButtonInner} />
            </Pressable>
            <ThemedText style={styles.captureLabel}>
              {stage === "detail_photo" ? "拍摄细节图" : "拍摄全景图"}
            </ThemedText>
          </View>
        </View>
      </ThemedView>
    );
  }

  // 确认信息阶段 UI
  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: Math.max(insets.top, 20),
              paddingBottom: Math.max(insets.bottom, 20) + 100,
            },
          ]}
        >
          {/* 返回按钮 */}
          <Pressable style={styles.topBackButton} onPress={() => router.back()}>
            <ThemedText style={styles.topBackButtonText}>← 返回</ThemedText>
          </Pressable>

          {/* 图片预览区 */}
          <View style={styles.imagePreviewRow}>
            <View style={styles.imagePreviewItem}>
              <ThemedText style={styles.imageLabel}>细节图</ThemedText>
              {detailImageUri ? (
                <Image source={{ uri: detailImageUri }} style={styles.previewImage} />
              ) : (
                <View style={[styles.previewImage, styles.placeholderImage]}>
                  <ThemedText style={styles.placeholderText}>未拍摄</ThemedText>
                </View>
              )}
            </View>
            <View style={styles.imagePreviewItem}>
              <ThemedText style={styles.imageLabel}>全景图</ThemedText>
              {overviewImageUri ? (
                <Image source={{ uri: overviewImageUri }} style={styles.previewImage} />
              ) : (
                <View style={[styles.previewImage, styles.placeholderImage]}>
                  <ThemedText style={styles.placeholderText}>未拍摄</ThemedText>
                </View>
              )}
            </View>
          </View>

          {/* 表单区域 */}
          <View style={styles.formSection}>
            {/* SKU */}
            <Pressable style={styles.formRow} onPress={handleSkuPress}>
              <ThemedText style={styles.formLabel}>SKU</ThemedText>
              <View style={[styles.formInput, { backgroundColor: inputBg }]}>
                <ThemedText style={[styles.formValue, !sku && styles.placeholder]}>
                  {sku || "点击查看查重结果并填写"}
                </ThemedText>
                <ThemedText style={styles.formArrow}>›</ThemedText>
              </View>
            </Pressable>

            {/* 数量 */}
            <Pressable style={styles.formRow} onPress={handleQuantityPress}>
              <ThemedText style={styles.formLabel}>数量</ThemedText>
              <View style={[styles.formInput, { backgroundColor: inputBg }]}>
                <ThemedText style={styles.formValue}>{quantity}</ThemedText>
                <ThemedText style={styles.formArrow}>›</ThemedText>
              </View>
            </Pressable>

            {/* 位置 */}
            <View style={styles.formRow}>
              <ThemedText style={styles.formLabel}>位置</ThemedText>
              <TextInput
                style={[styles.textInput, { backgroundColor: inputBg, color: inputColor }]}
                value={location}
                onChangeText={setLocation}
                placeholder="存储位置（自动填充）"
                placeholderTextColor={placeholderColor}
              />
            </View>

            {/* 价格 */}
            <View style={styles.formRow}>
              <ThemedText style={styles.formLabel}>价格</ThemedText>
              <View style={[styles.priceInputContainer, { backgroundColor: inputBg }]}>
                <ThemedText style={styles.currencySymbol}>$</ThemedText>
                <TextInput
                  style={[styles.priceInput, { color: inputColor }]}
                  value={price.toString()}
                  onChangeText={(text) => setPrice(parseFloat(text) || 0)}
                  keyboardType="decimal-pad"
                  placeholder="9.9"
                  placeholderTextColor={placeholderColor}
                />
              </View>
            </View>

            {/* 操作员 */}
            <View style={styles.formRow}>
              <ThemedText style={styles.formLabel}>操作员</ThemedText>
              <View style={[styles.formInput, { backgroundColor: inputBg }]}>
                <ThemedText style={styles.formValue}>{operatorName}</ThemedText>
              </View>
            </View>
          </View>
        </ScrollView>

        {/* 底部按钮 */}
        <View style={[styles.bottomButtons, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <Pressable
            style={[styles.saveButton, styles.saveOnlyButton, { opacity: saving ? 0.7 : 1 }]}
            onPress={() => handleSave(false)}
            disabled={saving}
          >
            <ThemedText style={styles.saveButtonText}>
              {saving ? "保存中..." : "保存"}
            </ThemedText>
          </Pressable>

          <Pressable
            style={[styles.saveButton, styles.savePrintButton, { opacity: saving ? 0.7 : 1 }]}
            onPress={() => handleSave(true)}
            disabled={saving}
          >
            <ThemedText style={styles.savePrintButtonText}>
              {saving ? "保存中..." : "保存并打印条形码"}
            </ThemedText>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* 查重结果弹窗 */}
      {showDuplicateModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ThemedText type="title" style={styles.modalTitle}>查重结果</ThemedText>

            {duplicateResult?.hasDuplicates && duplicateResult.duplicates.length > 0 ? (
              <>
                <ThemedText style={styles.modalHint}>
                  发现 {duplicateResult.duplicates.length} 个相似产品
                </ThemedText>

                <ScrollView style={styles.duplicateList}>
                  {duplicateResult.duplicates.map((dup, index) => (
                    <Pressable
                      key={dup.product.id}
                      style={styles.duplicateItem}
                      onPress={() => handleMergeToProduct(dup.product)}
                    >
                      <Image
                        source={{ uri: dup.product.detailImageUri }}
                        style={styles.duplicateImage}
                      />
                      <View style={styles.duplicateInfo}>
                        <ThemedText style={styles.duplicateSku}>{dup.product.sku}</ThemedText>
                        <ThemedText style={styles.duplicateScore}>
                          相似度: {dup.similarityScore}%
                        </ThemedText>
                        <ThemedText style={styles.duplicateNote} numberOfLines={2}>
                          {dup.analysisNote}
                        </ThemedText>
                      </View>
                      <ThemedText style={styles.mergeLabel}>合并</ThemedText>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            ) : (
              <ThemedText style={styles.modalHint}>未发现重复产品</ThemedText>
            )}

            {/* SKU 输入 */}
            <View style={styles.skuInputContainer}>
              <ThemedText style={styles.skuInputLabel}>输入新 SKU:</ThemedText>
              <TextInput
                style={[styles.skuInput, { backgroundColor: inputBg, color: inputColor }]}
                value={sku}
                onChangeText={setSku}
                placeholder="输入产品 SKU"
                placeholderTextColor={placeholderColor}
                autoFocus
              />
            </View>

            <View style={styles.modalButtons}>
              <Pressable
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowDuplicateModal(false)}
              >
                <ThemedText style={styles.cancelButtonText}>取消</ThemedText>
              </Pressable>

              <Pressable
                style={[styles.modalButton, styles.confirmButton]}
                onPress={handleNewSku}
              >
                <ThemedText style={styles.confirmButtonText}>确认新建</ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {/* AI 计数结果弹窗 */}
      {showCountModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ThemedText type="title" style={styles.modalTitle}>AI 计数结果</ThemedText>

            <ThemedText style={styles.modalHint}>
              AI 识别到的数量: {aiCount}
            </ThemedText>

            <View style={styles.countInputContainer}>
              <Pressable
                style={styles.countButton}
                onPress={() => setQuantity(Math.max(1, quantity - 1))}
              >
                <ThemedText style={styles.countButtonText}>-</ThemedText>
              </Pressable>

              <TextInput
                style={[styles.countInput, { backgroundColor: inputBg, color: inputColor }]}
                value={quantity.toString()}
                onChangeText={(text) => setQuantity(parseInt(text) || 1)}
                keyboardType="number-pad"
              />

              <Pressable
                style={styles.countButton}
                onPress={() => setQuantity(quantity + 1)}
              >
                <ThemedText style={styles.countButtonText}>+</ThemedText>
              </Pressable>
            </View>

            <View style={styles.modalButtons}>
              <Pressable
                style={[styles.modalButton, styles.confirmButton, { flex: 1 }]}
                onPress={() => handleConfirmCount(quantity)}
              >
                <ThemedText style={styles.confirmButtonText}>确认</ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },

  // 相机阶段样式
  cameraContainer: {
    flex: 1,
    backgroundColor: "#000",
  },
  backButton: {
    position: "absolute",
    top: 50,
    left: 20,
    zIndex: 10,
    padding: 12,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    borderRadius: 8,
  },
  backButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "500",
  },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  loadingCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 24,
    alignItems: "center",
    gap: 16,
    minWidth: 200,
  },
  loadingText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#000",
  },
  hintArea: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  stageTitle: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 16,
  },
  stageHint: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
  },
  stageSubHint: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 15,
    textAlign: "center",
  },
  thumbnailContainer: {
    position: "absolute",
    top: 100,
    right: 20,
    alignItems: "center",
  },
  thumbnailLabel: {
    color: "#4CD964",
    fontSize: 12,
    marginBottom: 4,
  },
  thumbnail: {
    width: 60,
    height: 60,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#4CD964",
  },
  captureArea: {
    alignItems: "center",
    paddingBottom: 50,
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  captureButtonInner: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "#fff",
    borderWidth: 4,
    borderColor: "#000",
  },
  captureLabel: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "500",
  },

  // 确认信息阶段样式
  topBackButton: {
    marginBottom: 20,
  },
  topBackButtonText: {
    fontSize: 16,
    color: "#007AFF",
  },
  imagePreviewRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 24,
  },
  imagePreviewItem: {
    flex: 1,
  },
  imageLabel: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
    textAlign: "center",
  },
  previewImage: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 12,
    backgroundColor: "#f0f0f0",
  },
  placeholderImage: {
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderText: {
    color: "#999",
    fontSize: 14,
  },

  // 表单样式
  formSection: {
    gap: 16,
  },
  formRow: {
    gap: 8,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: "600",
    opacity: 0.7,
  },
  formInput: {
    flexDirection: "row",
    alignItems: "center",
    height: 50,
    borderRadius: 10,
    paddingHorizontal: 16,
  },
  formValue: {
    flex: 1,
    fontSize: 16,
  },
  formArrow: {
    fontSize: 20,
    opacity: 0.5,
  },
  placeholder: {
    opacity: 0.5,
  },
  textInput: {
    height: 50,
    borderRadius: 10,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  priceInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    height: 50,
    borderRadius: 10,
    paddingHorizontal: 16,
  },
  currencySymbol: {
    fontSize: 18,
    fontWeight: "600",
    marginRight: 4,
  },
  priceInput: {
    flex: 1,
    fontSize: 16,
    height: 50,
  },

  // 底部按钮
  bottomButtons: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.1)",
  },
  saveButton: {
    flex: 1,
    height: 50,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  saveOnlyButton: {
    backgroundColor: "rgba(0,0,0,0.1)",
  },
  savePrintButton: {
    backgroundColor: "#34C759",
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  savePrintButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },

  // 弹窗样式
  modalOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 400,
    maxHeight: "80%",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 16,
    color: "#000",
  },
  modalHint: {
    fontSize: 14,
    textAlign: "center",
    opacity: 0.7,
    marginBottom: 16,
    color: "#000",
  },
  duplicateList: {
    maxHeight: 300,
    marginBottom: 16,
  },
  duplicateItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#f5f5f5",
    borderRadius: 10,
    marginBottom: 8,
  },
  duplicateImage: {
    width: 50,
    height: 50,
    borderRadius: 6,
  },
  duplicateInfo: {
    flex: 1,
    marginLeft: 12,
  },
  duplicateSku: {
    fontSize: 14,
    fontWeight: "600",
    color: "#000",
  },
  duplicateScore: {
    fontSize: 12,
    color: "#007AFF",
  },
  duplicateNote: {
    fontSize: 11,
    color: "#666",
  },
  mergeLabel: {
    fontSize: 14,
    color: "#007AFF",
    fontWeight: "600",
  },
  skuInputContainer: {
    marginBottom: 16,
  },
  skuInputLabel: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
    color: "#000",
  },
  skuInput: {
    height: 50,
    borderRadius: 10,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
  },
  modalButton: {
    flex: 1,
    height: 50,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: "#f0f0f0",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000",
  },
  confirmButton: {
    backgroundColor: "#007AFF",
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },

  // 计数弹窗
  countInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    marginBottom: 24,
  },
  countButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#007AFF",
    justifyContent: "center",
    alignItems: "center",
  },
  countButtonText: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
  },
  countInput: {
    width: 80,
    height: 50,
    borderRadius: 10,
    textAlign: "center",
    fontSize: 24,
    fontWeight: "bold",
  },
});
