/**
 * 快速添加产品页面
 * 优化流程：直接打开相机拍细节图 → 直接打开相机拍全景图 → 确认信息（后台完成查重和计数）
 * 用户操作：3 次（原来 5 次）
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
import { generateSystemSKU, generateLabelForNiimbotD110, saveToPhotoAlbum } from "@/lib/barcode";
import { generateLabelForNiimbotB1 } from "@/lib/niimbot-printer";
import { countProductsInImage } from "@/lib/ai-vision";
import { scanBarcodeFromImage, detectBarcodeType, lookupProductByBarcode } from "@/lib/barcode-scanner";
import SkuGeneratorModal from "@/components/SkuGeneratorModal";
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

  // 查重结果和状态
  const [duplicateResult, setDuplicateResult] = useState<DuplicateCheckResult | null>(null);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateCheckStatus, setDuplicateCheckStatus] = useState<"pending" | "running" | "done">("pending");

  // AI 计数结果和状态
  const [aiCount, setAiCount] = useState<number>(0);
  const [showCountModal, setShowCountModal] = useState(false);
  const [countStatus, setCountStatus] = useState<"pending" | "running" | "done">("pending");

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
  
  // 打印机类型（默认使用 B1）
  const [printerType, setPrinterType] = useState<'b1' | 'd110'>('b1');
  
  // SKU 生成助手弹窗
  const [showSkuGenerator, setShowSkuGenerator] = useState(false);

  // 选中的相似产品（用于显示合并按钮）
  const [selectedSimilarProduct, setSelectedSimilarProduct] = useState<Product | null>(null);

  // 条形码扫描相关状态
  const [barcodeScanStatus, setBarcodeScanStatus] = useState<"idle" | "scanning" | "found" | "not_found">("idle");
  const [scannedBarcode, setScannedBarcode] = useState<string | null>(null);
  const [scannedProduct, setScannedProduct] = useState<Product | null>(null);
  const [showBarcodeScanResult, setShowBarcodeScanResult] = useState(false);

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

  // 进入页面时自动打开相机
  useEffect(() => {
    // 延迟一点点确保组件已挂载
    const timer = setTimeout(() => {
      if (stage === "detail_photo" && fileInputRef.current) {
        fileInputRef.current.click();
      }
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  // 后台查重（在细节图拍摄后触发）
  const runDuplicateCheckInBackground = async (dataUrl: string, base64: string) => {
    console.log("[QuickAdd] Starting background duplicate check...");
    setDuplicateCheckStatus("running");
    try {
      console.log("[QuickAdd] Calling performDuplicateCheck with dataUrl length:", dataUrl.length, "base64 length:", base64.length);
      const dupResult = await performDuplicateCheck(dataUrl, base64);
      console.log("[QuickAdd] Duplicate check completed:", JSON.stringify(dupResult, null, 2));
      setDuplicateResult(dupResult);
    } catch (error: any) {
      console.error("[QuickAdd] Duplicate check failed:", error.message, error.stack);
      // 即使失败也设置一个结果，让用户知道查重已完成
      setDuplicateResult({
        hasDuplicates: false,
        duplicates: [],
        error: error.message,
        stats: {
          totalProducts: 0,
          pHashFiltered: 0,
          aiCompared: 0,
          durationMs: 0,
        },
      });
    } finally {
      setDuplicateCheckStatus("done");
    }
  };

  // 后台条形码扫描（在细节图拍摄后触发）
  const runBarcodeScanInBackground = async (base64: string) => {
    console.log("[QuickAdd] Starting background barcode scan...");
    setBarcodeScanStatus("scanning");
    try {
      const scanResult = await scanBarcodeFromImage(base64);
      console.log("[QuickAdd] Barcode scan result:", scanResult);
      
      if (scanResult.success && scanResult.barcodeValue) {
        setScannedBarcode(scanResult.barcodeValue);
        
        // 根据条形码查找产品
        const barcodeType = detectBarcodeType(scanResult.barcodeValue);
        if (barcodeType === 'systemSku' || barcodeType === 'userSku') {
          const lookupResult = await lookupProductByBarcode(scanResult.barcodeValue);
          if (lookupResult.found && lookupResult.product) {
            setScannedProduct(lookupResult.product as Product);
            setBarcodeScanStatus("found");
            // 自动填充 SKU
            setSku(lookupResult.product.sku);
            // 显示扫描结果弹窗
            setShowBarcodeScanResult(true);
            console.log("[QuickAdd] Product found by barcode:", lookupResult.product);
          } else {
            setBarcodeScanStatus("not_found");
            console.log("[QuickAdd] No product found for barcode:", scanResult.barcodeValue);
          }
        } else {
          setBarcodeScanStatus("not_found");
        }
      } else {
        setBarcodeScanStatus("idle");
      }
    } catch (error: any) {
      console.error("[QuickAdd] Barcode scan failed:", error.message);
      setBarcodeScanStatus("idle");
    }
  };

  // 后台计数（在全景图拍摄后触发）
  const runCountInBackground = async (base64: string) => {
    setCountStatus("running");
    try {
      const count = await countProductsInImage(base64);
      setAiCount(count);
      setQuantity(count);
      console.log("[QuickAdd] AI count:", count);
    } catch (error) {
      console.error("[QuickAdd] AI count failed:", error);
      setAiCount(1);
      setQuantity(1);
    } finally {
      setCountStatus("done");
    }
  };

  // 处理拍照
  const handleFileChange = async (event: Event) => {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    try {
      setProcessing(true);
      setProcessingText("正在处理图片...");

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

        // 后台查重（不等待）
        runDuplicateCheckInBackground(dataUrl, compressedBase64);
        
        // 后台条形码扫描（不等待）
        runBarcodeScanInBackground(compressedBase64);

        // 直接切换到全景图阶段
        setStage("overview_photo");
        
        // 自动打开相机拍全景图（延迟 500ms 确保状态更新完成）
        setTimeout(() => {
          if (fileInputRef.current) {
            fileInputRef.current.click();
          }
        }, 500);
      } else if (stage === "overview_photo") {
        // 保存全景图
        setOverviewImageUri(dataUrl);

        // 后台计数（不等待）
        runCountInBackground(compressedBase64);

        // 直接切换到确认信息阶段
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

  // 选择新建 SKU（确认弹窗中输入的 SKU）
  const handleNewSku = () => {
    // 不清空 SKU，保留用户在弹窗中输入的值
    setMergeToProductId(null);
    setShowDuplicateModal(false);
  };

  // 查看相似产品详情（跳转到详情页）
  const handleViewSimilarProduct = (product: Product) => {
    // 设置选中的产品，用于返回后显示合并按钮
    setSelectedSimilarProduct(product);
    // 跳转到产品详情页
    router.push({ pathname: "/product-detail" as any, params: { id: product.id } });
  };

  // 确认合并到选中的产品
  const handleConfirmMerge = () => {
    if (selectedSimilarProduct) {
      setMergeToProductId(selectedSimilarProduct.id);
      setSku(selectedSimilarProduct.sku);
      setSelectedSimilarProduct(null);
      setShowDuplicateModal(false);
    }
  };

  // 取消合并选择
  const handleCancelMerge = () => {
    setSelectedSimilarProduct(null);
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
        console.log("[QuickAdd] ========== MERGE MODE ==========");
        console.log("[QuickAdd] Merging to existing product ID:", mergeToProductId);
        console.log("[QuickAdd] New quantity to add:", quantity);

        const existingProduct = await ProductStorage.getById(mergeToProductId);
        if (!existingProduct) {
          throw new Error("产品不存在");
        }
        
        const oldQuantity = existingProduct.quantity;
        const oldHistoryCount = existingProduct.history?.length || 0;
        console.log("[QuickAdd] Existing product found:", existingProduct.sku);
        console.log("[QuickAdd] Existing quantity:", oldQuantity);
        console.log("[QuickAdd] Existing history count:", oldHistoryCount);

        const historyEntry = createHistoryEntry(
          mergeToProductId,
          quantity,
          locationValue,
          detailImageUri,
          operatorId,
          operatorName
        );
        console.log("[QuickAdd] New history entry created:", historyEntry.id);

        const existingHistory = existingProduct.history || [];
        const newHistory = [...existingHistory, historyEntry];
        const newQuantity = oldQuantity + quantity;

        console.log("[QuickAdd] New total quantity:", newQuantity);
        console.log("[QuickAdd] New history count:", newHistory.length);

        const updateData = {
          quantity: newQuantity,
          storageLocation: locationValue,
          updatedAt: now,
          price: price,
          history: newHistory,
        };
        console.log("[QuickAdd] Update data:", JSON.stringify(updateData, null, 2));

        await ProductStorage.update(mergeToProductId, updateData);

        // 验证更新是否成功
        const verifyProduct = await ProductStorage.getById(mergeToProductId);
        const verifyQuantity = verifyProduct?.quantity;
        const verifyHistoryCount = verifyProduct?.history?.length;
        console.log("[QuickAdd] Verify after update - quantity:", verifyQuantity);
        console.log("[QuickAdd] Verify after update - history count:", verifyHistoryCount);

        // 显示详细的合并结果
        const mergeSuccess = verifyQuantity === newQuantity && verifyHistoryCount === newHistory.length;
        alert(
          `合并${mergeSuccess ? "成功" : "失败"}！\n\n` +
          `SKU: ${existingProduct.sku}\n` +
          `原数量: ${oldQuantity} → 新数量: ${verifyQuantity}\n` +
          `原历史记录: ${oldHistoryCount} 条 → 新历史记录: ${verifyHistoryCount} 条\n` +
          `本次添加: ${quantity} 件`
        );

        if (!mergeSuccess) {
          throw new Error(`合并验证失败: 期望数量=${newQuantity}, 实际=${verifyQuantity}; 期望历史=${newHistory.length}, 实际=${verifyHistoryCount}`);
        }

        savedProduct = { ...existingProduct, quantity: newQuantity };
        console.log("[QuickAdd] ========== MERGE COMPLETE ==========");
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
          // 根据打印机类型生成不同尺寸的标签
          const barcodeDataUrl = printerType === 'b1'
            ? await generateLabelForNiimbotB1(savedProduct.systemSku, savedProduct.sku)
            : await generateLabelForNiimbotD110(savedProduct.systemSku, savedProduct.sku);
          await saveToPhotoAlbum(barcodeDataUrl, savedProduct.systemSku);
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
          title: "📷 拍摄细节图",
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

          {/* 半透明提示浮层 */}
          <View style={styles.floatingHint}>
            <ThemedText style={styles.floatingHintTitle}>{stageHint.title}</ThemedText>
            <ThemedText style={styles.floatingHintText}>{stageHint.hint}</ThemedText>
            <ThemedText style={styles.floatingHintSubText}>{stageHint.subHint}</ThemedText>
          </View>

          {/* 加载遮罩 */}
          {processing && (
            <View style={styles.loadingOverlay}>
              <View style={styles.loadingCard}>
                <ActivityIndicator size="large" color="#007AFF" />
                <ThemedText style={styles.loadingText}>{processingText}</ThemedText>
              </View>
            </View>
          )}

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

          {/* 后台任务状态提示 */}
          <View style={styles.statusRow}>
            <View style={[
              styles.statusBadge,
              duplicateCheckStatus === "done" ? styles.statusBadgeDone : 
              duplicateCheckStatus === "running" ? styles.statusBadgeRunning : styles.statusBadgePending
            ]}>
              {duplicateCheckStatus === "running" && <ActivityIndicator size="small" color="#007AFF" style={styles.statusSpinner} />}
              <ThemedText style={styles.statusText}>
                {duplicateCheckStatus === "pending" ? "⏳ 查重待开始" :
                 duplicateCheckStatus === "running" ? "查重中..." : "✓ 查重已完成"}
              </ThemedText>
            </View>
            <View style={[
              styles.statusBadge,
              countStatus === "done" ? styles.statusBadgeDone : 
              countStatus === "running" ? styles.statusBadgeRunning : styles.statusBadgePending
            ]}>
              {countStatus === "running" && <ActivityIndicator size="small" color="#007AFF" style={styles.statusSpinner} />}
              <ThemedText style={styles.statusText}>
                {countStatus === "pending" ? "⏳ 计数待开始" :
                 countStatus === "running" ? "计数中..." : "✓ 计数已完成"}
              </ThemedText>
            </View>
            {barcodeScanStatus !== "idle" && (
              <View style={[
                styles.statusBadge,
                barcodeScanStatus === "found" ? styles.statusBadgeFound : 
                barcodeScanStatus === "scanning" ? styles.statusBadgeRunning : styles.statusBadgeNotFound
              ]}>
                {barcodeScanStatus === "scanning" && <ActivityIndicator size="small" color="#007AFF" style={styles.statusSpinner} />}
                <ThemedText style={styles.statusText}>
                  {barcodeScanStatus === "scanning" ? "📷 扫描中..." :
                   barcodeScanStatus === "found" ? "✓ 已识别条形码" : "⚠ 未找到条形码"}
                </ThemedText>
              </View>
            )}
          </View>

          {/* 表单 */}
          <View style={styles.formSection}>
            {/* SKU */}
            <View style={styles.formRow}>
              <ThemedText style={styles.formLabel}>SKU</ThemedText>
              <Pressable
                style={[styles.formInput, { backgroundColor: inputBg }]}
                onPress={handleSkuPress}
              >
                <ThemedText style={[styles.formValue, !sku && styles.placeholder, { color: inputColor }]}>
                  {sku || "点击选择或输入 SKU"}
                </ThemedText>
                <ThemedText style={styles.formArrow}>›</ThemedText>
              </Pressable>
            </View>

            {/* 数量 */}
            <View style={styles.formRow}>
              <ThemedText style={styles.formLabel}>数量</ThemedText>
              <Pressable
                style={[styles.formInput, { backgroundColor: inputBg }]}
                onPress={handleQuantityPress}
              >
                <ThemedText style={[styles.formValue, { color: inputColor }]}>
                  {quantity}
                </ThemedText>
                <ThemedText style={styles.formArrow}>›</ThemedText>
              </Pressable>
            </View>

            {/* 位置 */}
            <View style={styles.formRow}>
              <ThemedText style={styles.formLabel}>位置</ThemedText>
              <TextInput
                style={[styles.textInput, { backgroundColor: inputBg, color: inputColor }]}
                value={location}
                onChangeText={setLocation}
                placeholder="输入存储位置"
                placeholderTextColor={placeholderColor}
              />
            </View>

            {/* 价格 */}
            <View style={styles.formRow}>
              <ThemedText style={styles.formLabel}>价格</ThemedText>
              <View style={[styles.priceInputContainer, { backgroundColor: inputBg }]}>
                <ThemedText style={[styles.currencySymbol, { color: inputColor }]}>¥</ThemedText>
                <TextInput
                  style={[styles.priceInput, { color: inputColor }]}
                  value={price.toString()}
                  onChangeText={(text) => setPrice(parseFloat(text) || 0)}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={placeholderColor}
                />
              </View>
            </View>
          </View>
        </ScrollView>

        {/* 底部按钮 */}
        <View style={[styles.bottomButtons, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <Pressable
            style={[styles.saveButton, { opacity: saving ? 0.7 : 1 }]}
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

            {/* 调试信息 */}
            <View style={styles.debugInfo}>
              <ThemedText style={styles.debugText}>
                {duplicateResult?.stats 
                  ? `已检查 ${duplicateResult.stats.totalProducts} 个产品，AI对比 ${duplicateResult.stats.aiCompared} 个，耗时 ${(duplicateResult.stats.durationMs / 1000).toFixed(1)}s`
                  : duplicateCheckStatus === "running" 
                    ? "正在查重中..."
                    : duplicateCheckStatus === "pending"
                      ? "等待查重..."
                      : "查重完成"
                }
              </ThemedText>
              {duplicateResult?.error && (
                <ThemedText style={[styles.debugText, { color: '#FF3B30' }]}>
                  错误: {duplicateResult.error}
                </ThemedText>
              )}
            </View>

            {/* 相似产品列表 */}
            {duplicateResult?.duplicates && duplicateResult.duplicates.length > 0 ? (
              <ScrollView style={styles.matchList}>
                <ThemedText style={styles.matchListTitle}>
                  发现 {duplicateResult.duplicates.length} 个相似产品（点击查看详情）：
                </ThemedText>
                {duplicateResult.duplicates.map((dup, index) => (
                  <View key={dup.product.id}>
                    <Pressable
                      style={[
                        styles.matchItem,
                        selectedSimilarProduct?.id === dup.product.id && styles.matchItemSelected
                      ]}
                      onPress={() => handleViewSimilarProduct(dup.product)}
                    >
                      <Image
                        source={{ uri: dup.product.detailImageUri }}
                        style={styles.matchImage}
                      />
                      <View style={styles.matchInfo}>
                        <ThemedText style={styles.matchSku}>{dup.product.sku}</ThemedText>
                        <ThemedText style={styles.matchSimilarity}>
                          相似度: {dup.similarityScore}%
                        </ThemedText>
                        <ThemedText style={styles.matchQuantity}>
                          当前库存: {dup.product.quantity}
                        </ThemedText>
                      </View>
                      <ThemedText style={styles.matchArrow}>›</ThemedText>
                    </Pressable>
                    {/* 如果该产品被选中，显示合并按钮 */}
                    {selectedSimilarProduct?.id === dup.product.id && (
                      <View style={styles.mergeButtonsContainer}>
                        <Pressable
                          style={styles.cancelMergeButton}
                          onPress={handleCancelMerge}
                        >
                          <ThemedText style={styles.cancelMergeButtonText}>取消</ThemedText>
                        </Pressable>
                        <Pressable
                          style={styles.confirmMergeButton}
                          onPress={handleConfirmMerge}
                        >
                          <ThemedText style={styles.confirmMergeButtonText}>合并到此款式</ThemedText>
                        </Pressable>
                      </View>
                    )}
                  </View>
                ))}
              </ScrollView>
            ) : (
              <ThemedText style={styles.noMatchText}>
                {duplicateCheckStatus === "done" ? "未发现相似产品，这是一个新款式" : "正在查重..."}
              </ThemedText>
            )}

            {/* SKU 输入 */}
            <View style={styles.skuInputContainer}>
              <View style={styles.skuInputHeader}>
                <ThemedText style={styles.skuInputLabel}>新建 SKU：</ThemedText>
                <Pressable
                  style={styles.skuGeneratorBtn}
                  onPress={() => setShowSkuGenerator(true)}
                >
                  <ThemedText style={styles.skuGeneratorBtnText}>🏷️ 生成助手</ThemedText>
                </Pressable>
              </View>
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
              {countStatus === "done" ? `AI 识别到的数量: ${aiCount}` : "AI 正在计数..."}
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

      {/* SKU 生成助手弹窗 */}
      <SkuGeneratorModal
        visible={showSkuGenerator}
        onClose={() => setShowSkuGenerator(false)}
        onConfirm={(generatedSku) => {
          setSku(generatedSku);
          setShowSkuGenerator(false);
        }}
      />

      {/* 条形码扫描结果弹窗 */}
      {showBarcodeScanResult && scannedProduct && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ThemedText type="title" style={styles.modalTitle}>📷 条形码识别结果</ThemedText>
            
            <View style={styles.barcodeScanResultContainer}>
              <View style={styles.barcodeResultHeader}>
                <ThemedText style={styles.barcodeResultLabel}>识别到的条形码：</ThemedText>
                <ThemedText style={styles.barcodeResultValue}>{scannedBarcode}</ThemedText>
              </View>
              
              <View style={styles.barcodeProductInfo}>
                <ThemedText style={styles.barcodeProductTitle}>匹配到的产品：</ThemedText>
                <View style={styles.barcodeProductCard}>
                  {scannedProduct.detailImageUri && (
                    <Image 
                      source={{ uri: scannedProduct.detailImageUri }} 
                      style={styles.barcodeProductImage} 
                    />
                  )}
                  <View style={styles.barcodeProductDetails}>
                    <ThemedText style={styles.barcodeProductSku}>{scannedProduct.sku}</ThemedText>
                    <ThemedText style={styles.barcodeProductQuantity}>当前库存：{scannedProduct.quantity}</ThemedText>
                    <ThemedText style={styles.barcodeProductLocation}>位置：{scannedProduct.location || '未设置'}</ThemedText>
                  </View>
                </View>
              </View>
              
              <ThemedText style={styles.barcodeHint}>
                系统已自动填充 SKU，您可以继续完成入库操作
              </ThemedText>
            </View>

            <View style={styles.modalButtons}>
              <Pressable
                style={[styles.modalButton, styles.confirmButton, { flex: 1 }]}
                onPress={() => {
                  setShowBarcodeScanResult(false);
                  // 设置合并模式
                  setMergeToProductId(scannedProduct.id);
                }}
              >
                <ThemedText style={styles.confirmButtonText}>确认并继续</ThemedText>
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
  // 半透明浮层提示
  floatingHint: {
    position: "absolute",
    top: 120,
    left: 20,
    right: 20,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    zIndex: 5,
  },
  floatingHintTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 8,
  },
  floatingHintText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  floatingHintSubText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 14,
    textAlign: "center",
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
  thumbnailContainer: {
    position: "absolute",
    top: 120,
    right: 20,
    alignItems: "center",
    zIndex: 5,
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
    position: "absolute",
    bottom: 50,
    left: 0,
    right: 0,
    alignItems: "center",
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
    marginBottom: 16,
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

  // 状态提示行
  statusRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 20,
  },
  statusBadge: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  statusBadgePending: {
    backgroundColor: "rgba(0, 0, 0, 0.05)",
  },
  statusBadgeRunning: {
    backgroundColor: "rgba(0, 122, 255, 0.1)",
  },
  statusBadgeDone: {
    backgroundColor: "rgba(76, 217, 100, 0.15)",
  },
  statusBadgeFound: {
    backgroundColor: "rgba(52, 199, 89, 0.15)",
  },
  statusBadgeNotFound: {
    backgroundColor: "rgba(255, 149, 0, 0.15)",
  },
  statusSpinner: {
    marginRight: 6,
  },
  statusText: {
    fontSize: 13,
    fontWeight: "500",
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
    backgroundColor: "transparent",
  },
  saveButton: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    backgroundColor: "rgba(0, 0, 0, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  savePrintButton: {
    backgroundColor: "#34C759",
  },
  savePrintButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },

  // 弹窗样式
  modalOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 100,
  },
  modalContent: {
    width: "90%",
    maxWidth: 400,
    maxHeight: "80%",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 16,
    color: "#000",
  },
  debugInfo: {
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  debugText: {
    fontSize: 12,
    color: "#666",
  },
  matchList: {
    maxHeight: 250,
    marginBottom: 16,
  },
  matchListTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 12,
    color: "#000",
  },
  matchItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#f5f5f5",
    borderRadius: 10,
    marginBottom: 8,
  },
  matchItemSelected: {
    backgroundColor: "#e3f2fd",
    borderWidth: 2,
    borderColor: "#007AFF",
  },
  matchImage: {
    width: 50,
    height: 50,
    borderRadius: 8,
    marginRight: 12,
  },
  matchInfo: {
    flex: 1,
  },
  matchSku: {
    fontSize: 14,
    fontWeight: "600",
    color: "#000",
  },
  matchSimilarity: {
    fontSize: 12,
    color: "#007AFF",
    marginTop: 2,
  },
  matchQuantity: {
    fontSize: 12,
    color: "#666",
    marginTop: 2,
  },
  matchArrow: {
    fontSize: 20,
    color: "#999",
  },
  mergeButtonsContainer: {
    flexDirection: "row",
    gap: 8,
    marginTop: -4,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  cancelMergeButton: {
    flex: 1,
    height: 40,
    borderRadius: 8,
    backgroundColor: "#f0f0f0",
    justifyContent: "center",
    alignItems: "center",
  },
  cancelMergeButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
  },
  confirmMergeButton: {
    flex: 2,
    height: 40,
    borderRadius: 8,
    backgroundColor: "#34C759",
    justifyContent: "center",
    alignItems: "center",
  },
  confirmMergeButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  noMatchText: {
    textAlign: "center",
    color: "#666",
    marginVertical: 20,
  },
  skuInputContainer: {
    marginBottom: 16,
  },
  skuInputHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  skuInputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#000",
  },
  skuGeneratorBtn: {
    backgroundColor: "rgba(255, 149, 0, 0.15)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  skuGeneratorBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#FF9500",
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
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: "#f0f0f0",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#666",
  },
  confirmButton: {
    backgroundColor: "#007AFF",
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  modalHint: {
    textAlign: "center",
    color: "#666",
    marginBottom: 20,
  },
  countInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    marginBottom: 20,
  },
  countButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#f0f0f0",
    justifyContent: "center",
    alignItems: "center",
  },
  countButtonText: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#000",
  },
  countInput: {
    width: 80,
    height: 50,
    borderRadius: 10,
    textAlign: "center",
    fontSize: 20,
    fontWeight: "bold",
  },

  // 条形码扫描结果弹窗样式
  barcodeScanResultContainer: {
    marginBottom: 16,
  },
  barcodeResultHeader: {
    backgroundColor: "rgba(52, 199, 89, 0.1)",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  barcodeResultLabel: {
    fontSize: 13,
    color: "#666",
    marginBottom: 4,
  },
  barcodeResultValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#34C759",
    fontFamily: "monospace",
  },
  barcodeProductInfo: {
    marginBottom: 16,
  },
  barcodeProductTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
    color: "#000",
  },
  barcodeProductCard: {
    flexDirection: "row",
    backgroundColor: "#f5f5f5",
    borderRadius: 10,
    padding: 12,
  },
  barcodeProductImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 12,
  },
  barcodeProductDetails: {
    flex: 1,
    justifyContent: "center",
  },
  barcodeProductSku: {
    fontSize: 15,
    fontWeight: "600",
    color: "#000",
    marginBottom: 4,
  },
  barcodeProductQuantity: {
    fontSize: 13,
    color: "#666",
    marginBottom: 2,
  },
  barcodeProductLocation: {
    fontSize: 13,
    color: "#666",
  },
  barcodeHint: {
    fontSize: 13,
    color: "#666",
    textAlign: "center",
    fontStyle: "italic",
  },
});
