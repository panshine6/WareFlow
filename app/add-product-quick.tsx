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
import { countProductsInImage, CountResult } from "@/lib/ai-vision";
import { scanBarcodeFromImage, detectBarcodeType, lookupProductByBarcode } from "@/lib/barcode-scanner";
import SkuGeneratorModal from "@/components/SkuGeneratorModal";
import BoxManagerModal from "@/components/BoxManagerModal";
import ColorPickerModal from "@/components/ColorPickerModal";
import { compressImage, base64ToDataUrl } from "@/lib/image-utils";
import type { Product, InventoryHistoryEntry } from "@/types/product";
import { getAllBoxes, createBox, deleteBox } from "@/lib/box-storage";
import type { Box } from "@/types/box";
import { BoxGenerator, BoxRecord } from "@/lib/box-generator";
import { saveLearningRecord } from "@/lib/ai-learning-storage";
import { scanForDuplicateSKUs } from "@/lib/sku-duplicate-check";
import { saveLearningRecord as saveSimilarityLearningRecord } from "@/lib/similarity-learning-storage";

// 流程阶段
type FlowStage = 
  | "detail_photo"      // 拍细节图
  | "overview_photo"    // 拍全景图
  | "confirm_info"      // 确认信息
  | "confirm";          // 确认信息（别名）

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
  const [overviewImageBase64, setOverviewImageBase64] = useState("");  // 用于保存AI学习数据

  // 查重结果和状态
  const [duplicateResult, setDuplicateResult] = useState<DuplicateCheckResult | null>(null);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateCheckStatus, setDuplicateCheckStatus] = useState<"pending" | "running" | "done" | "cancelled">("pending");
  const duplicateCheckCancelledRef = useRef(false); // 用于取消查重

  // AI 计数结果和状态
  const [aiCount, setAiCount] = useState<number>(0);
  const [aiCountResult, setAiCountResult] = useState<CountResult | null>(null);  // 完整的计数结果
  const [showCountModal, setShowCountModal] = useState(false);
  const [countStatus, setCountStatus] = useState<"pending" | "running" | "done">("pending");

  // 表单数据
  const [sku, setSku] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [location, setLocation] = useState("");
  const [price, setPrice] = useState(7.9);
  const [priceText, setPriceText] = useState("7.9"); // 用于输入框显示
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

  // Box 相关状态
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [selectedBox, setSelectedBox] = useState<Box | null>(null);
  const [showBoxPicker, setShowBoxPicker] = useState(false);
  const [newBoxName, setNewBoxName] = useState("");
  const [showBoxManager, setShowBoxManager] = useState(false);

  // AI学习数据保存状态
  const [aiLearningSaved, setAiLearningSaved] = useState(false);

  // 查重反馈相关状态
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackDuplicate, setFeedbackDuplicate] = useState<{
    product: Product;
    similarityScore: number;
    analysisNote: string;
    scores?: number[];
    confidence?: 'high' | 'medium' | 'low';
  } | null>(null);
  const [userSimilarityScore, setUserSimilarityScore] = useState(50);
  const [userJudgment, setUserJudgment] = useState<'same' | 'similar' | 'different'>('different');

  // 同款不同色颜色选择器状态
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [colorPickerTargetProduct, setColorPickerTargetProduct] = useState<Product | null>(null);

  // 手动搜索产品相关状态
  const [manualSearchQuery, setManualSearchQuery] = useState("");
  const [manualSearchResults, setManualSearchResults] = useState<Product[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [showManualSearch, setShowManualSearch] = useState(false);
  const [showProductDropdown, setShowProductDropdown] = useState(false); // 显示产品下拉列表

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
          setPriceText(settings.lastPrice.toString());
        } else {
          setPrice(7.9); // 默认价格
          setPriceText("7.9");
        }
        if (user) {
          setOperatorName(user.name || "未知用户");
          setOperatorId(parseInt(user.id?.toString() || "1"));
        }

        // 加载 Box 列表（使用 BoxGenerator，因为 Box 是通过 BoxGenerator 创建的）
        const boxRecords = await BoxGenerator.getAllBoxes();
        console.log("[QuickAdd] Loaded box records from BoxGenerator:", boxRecords.length);
        
        // 将 BoxRecord 转换为 Box 类型，以便与现有代码兼容
        const convertedBoxes: Box[] = boxRecords.map(record => ({
          id: record.code, // 使用 code 作为 id
          name: record.code,
          location: record.shelfLocation,
          status: 'open' as const,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
          operatorId: 0,
          operatorName: '',
          items: [],
        }));
        setBoxes(convertedBoxes);
        
        // 设置上次选择的 Box 为默认值
        // 使用 lastBoxName 匹配，因为 name/code 是稳定的标识符（如 LB-ED-Box-0001）
        if (settings.lastBoxName) {
          const lastBox = convertedBoxes.find(b => b.name === settings.lastBoxName);
          if (lastBox) {
            setSelectedBox(lastBox);
            console.log("[QuickAdd] Restored last selected box by name:", lastBox.name);
          } else {
            console.log("[QuickAdd] Last box not found in boxes:", settings.lastBoxName, "Available:", convertedBoxes.map(b => b.name));
          }
        } else if (settings.lastBoxId) {
          // 向后兼容：尝试用 id 匹配
          const lastBox = convertedBoxes.find(b => b.id === settings.lastBoxId);
          if (lastBox) {
            setSelectedBox(lastBox);
            console.log("[QuickAdd] Restored last selected box by id:", lastBox.name);
          }
        }

        // 加载所有产品（用于手动搜索）
        const products = await ProductStorage.getActive();
        setAllProducts(products);
        console.log("[QuickAdd] Loaded", products.length, "products for manual search");
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
    duplicateCheckCancelledRef.current = false; // 重置取消标志
    setDuplicateCheckStatus("running");
    try {
      console.log("[QuickAdd] Calling performDuplicateCheck with dataUrl length:", dataUrl.length, "base64 length:", base64.length);
      const dupResult = await performDuplicateCheck(dataUrl, base64);
      
      // 检查是否已取消
      if (duplicateCheckCancelledRef.current) {
        console.log("[QuickAdd] Duplicate check was cancelled, ignoring result");
        return;
      }
      
      console.log("[QuickAdd] Duplicate check completed:", JSON.stringify(dupResult, null, 2));
      setDuplicateResult(dupResult);
      setDuplicateCheckStatus("done");
    } catch (error: any) {
      // 检查是否已取消
      if (duplicateCheckCancelledRef.current) {
        console.log("[QuickAdd] Duplicate check was cancelled during error");
        return;
      }
      
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
      setDuplicateCheckStatus("done");
    }
  };

  // 取消查重，转为人工识别
  const handleCancelDuplicateCheck = () => {
    console.log("[QuickAdd] User cancelled duplicate check");
    duplicateCheckCancelledRef.current = true;
    setDuplicateCheckStatus("cancelled");
    setDuplicateResult({
      hasDuplicates: false,
      duplicates: [],
      error: "用户取消查重，转为人工识别",
      stats: {
        totalProducts: 0,
        pHashFiltered: 0,
        aiCompared: 0,
        durationMs: 0,
      },
    });
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
      const result = await countProductsInImage(base64);
      setAiCountResult(result);
      setAiCount(result.count);
      setQuantity(result.count);
      console.log("[QuickAdd] AI count result:", result);
    } catch (error) {
      console.error("[QuickAdd] AI count failed:", error);
      setAiCountResult(null);
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
        
        // 重置 AI 学习数据保存状态（新产品流程开始）
        setAiLearningSaved(false);

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
        setOverviewImageBase64(compressedBase64);  // 保存base64用于AI学习数据

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
  const handleNewSku = async () => {
    // 保存查重学习数据：用户选择新建，说明认为所有 AI 结果都是“不同”
    if (duplicateResult?.duplicates && duplicateResult.duplicates.length > 0) {
      try {
        const newImageBase64 = detailImageBase64 || (detailImageUri.startsWith('data:') 
          ? detailImageUri.split(',')[1] 
          : await imageToBase64(detailImageUri));
        
        // 为每个 AI 结果保存学习数据
        for (const dup of duplicateResult.duplicates) {
          const existingImageBase64 = dup.product.detailImageUri.startsWith('data:')
            ? dup.product.detailImageUri.split(',')[1]
            : await imageToBase64(dup.product.detailImageUri);
          
          await saveSimilarityLearningRecord({
            newImageBase64,
            existingImageBase64,
            existingProductSku: dup.product.sku,
            aiSimilarityScore: dup.similarityScore,
            aiScores: dup.scores || [dup.similarityScore],
            aiConfidence: dup.confidence || 'medium',
            aiAnalysisNote: dup.analysisNote || '',
            userSimilarityScore: 0, // 用户认为不相似
            userJudgment: 'different',
          });
        }
        console.log('[QuickAdd] Saved similarity learning data for new SKU:', duplicateResult.duplicates.length, 'records');
      } catch (error) {
        console.error('[QuickAdd] Failed to save similarity learning data:', error);
      }
    }
    
    // 不清空 SKU，保留用户在弹窗中输入的值
    setMergeToProductId(null);
    setShowDuplicateModal(false);
  };

  // 选择相似产品（只选中，不跳转）
  const handleViewSimilarProduct = (product: Product) => {
    // 如果已经选中同一个产品，则取消选择
    if (selectedSimilarProduct?.id === product.id) {
      setSelectedSimilarProduct(null);
    } else {
      setSelectedSimilarProduct(product);
    }
  };

  // 跳转到产品详情页
  const handleGoToProductDetail = (product: Product) => {
    router.push({ pathname: "/product-detail" as any, params: { id: product.id } });
  };

  // 确认合并到选中的产品
  const handleConfirmMerge = async () => {
    if (selectedSimilarProduct) {
      // 保存查重学习数据：用户选择合并，说明认为是“相同”产品
      try {
        const newImageBase64 = detailImageBase64 || (detailImageUri.startsWith('data:') 
          ? detailImageUri.split(',')[1] 
          : await imageToBase64(detailImageUri));
        const existingImageBase64 = selectedSimilarProduct.detailImageUri.startsWith('data:')
          ? selectedSimilarProduct.detailImageUri.split(',')[1]
          : await imageToBase64(selectedSimilarProduct.detailImageUri);
        
        // 查找该产品在 AI 结果中的相似度
        const aiResult = duplicateResult?.duplicates?.find(d => d.product.id === selectedSimilarProduct.id);
        
        await saveSimilarityLearningRecord({
          newImageBase64,
          existingImageBase64,
          existingProductSku: selectedSimilarProduct.sku,
          aiSimilarityScore: aiResult?.similarityScore || 0,
          aiScores: aiResult?.scores || [aiResult?.similarityScore || 0],
          aiConfidence: aiResult?.confidence || 'medium',
          aiAnalysisNote: aiResult?.analysisNote || '手动选择',
          userSimilarityScore: 100, // 用户认为完全相同
          userJudgment: 'same',
        });
        console.log('[QuickAdd] Saved similarity learning data for merge:', selectedSimilarProduct.sku);
      } catch (error) {
        console.error('[QuickAdd] Failed to save similarity learning data:', error);
      }
      
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

  // 手动搜索产品
  const handleManualSearch = (query: string) => {
    setManualSearchQuery(query);
    if (query.trim() === "") {
      // 没有输入时，显示最近添加的产品（按时间排序）
      const recentProducts = [...allProducts]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 20); // 默认显示最近20个
      setManualSearchResults(recentProducts);
      return;
    }
    // 按 SKU 搜索，不区分大小写
    const results = allProducts.filter(p => 
      p.sku.toLowerCase().includes(query.toLowerCase())
    ).slice(0, 20); // 最多显示 20 个结果
    setManualSearchResults(results);
  };

  // 点击输入框时显示下拉列表
  const handleSearchInputFocus = () => {
    setShowProductDropdown(true);
    // 如果没有输入，显示最近的产品
    if (manualSearchQuery.trim() === "") {
      const recentProducts = [...allProducts]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 20);
      setManualSearchResults(recentProducts);
    }
  };

  // 手动选择产品（用于合并或同款不同色）
  const handleManualSelectProduct = (product: Product) => {
    setSelectedSimilarProduct(product);
    setShowManualSearch(false);
    setManualSearchQuery("");
    setManualSearchResults([]);
  };

  // 同款不同色 - 打开颜色选择器
  const handleSameStyleDifferentColor = (product: Product) => {
    console.log('[QuickAdd] Same style different color for product:', product.sku);
    setColorPickerTargetProduct(product);
    setShowColorPicker(true);
  };

  // 同款不同色 - 颜色选择完成
  const handleColorSelected = async (newSku: string, colorCode: string, colorName: string) => {
    console.log('[QuickAdd] Color selected:', { newSku, colorCode, colorName });
    
    // 保存查重学习数据：用户选择同款不同色，说明认为是“相似”产品
    if (colorPickerTargetProduct) {
      try {
        const newImageBase64 = detailImageBase64 || (detailImageUri.startsWith('data:') 
          ? detailImageUri.split(',')[1] 
          : await imageToBase64(detailImageUri));
        const existingImageBase64 = colorPickerTargetProduct.detailImageUri.startsWith('data:')
          ? colorPickerTargetProduct.detailImageUri.split(',')[1]
          : await imageToBase64(colorPickerTargetProduct.detailImageUri);
        
        // 查找该产品在 AI 结果中的相似度
        const aiResult = duplicateResult?.duplicates?.find(d => d.product.id === colorPickerTargetProduct.id);
        
        await saveSimilarityLearningRecord({
          newImageBase64,
          existingImageBase64,
          existingProductSku: colorPickerTargetProduct.sku,
          aiSimilarityScore: aiResult?.similarityScore || 0,
          aiScores: aiResult?.scores || [aiResult?.similarityScore || 0],
          aiConfidence: aiResult?.confidence || 'medium',
          aiAnalysisNote: aiResult?.analysisNote || '手动选择',
          userSimilarityScore: 85, // 用户认为相似（同款不同色）
          userJudgment: 'similar',
        });
        console.log('[QuickAdd] Saved similarity learning data for same style different color:', colorPickerTargetProduct.sku);
      } catch (error) {
        console.error('[QuickAdd] Failed to save similarity learning data:', error);
      }
    }
    
    // 设置新的 SKU
    setSku(newSku);
    // 关闭颜色选择器
    setShowColorPicker(false);
    setColorPickerTargetProduct(null);
    // 关闭查重弹窗，回到信息确认页面
    setShowDuplicateModal(false);
    setSelectedSimilarProduct(null);
    // 不设置 mergeToProductId，因为这是新产品
    setMergeToProductId(null);
  };

  // 点击数量字段 - 显示 AI 计数结果
  const handleQuantityPress = () => {
    setShowCountModal(true);
  };

  // 确认数量（同时保存AI学习数据）
  const handleConfirmCount = async (count: number) => {
    setQuantity(count);
    setShowCountModal(false);
    
    // 保存AI学习数据（如果有全景图和AI计数结果，且尚未保存）
    // 注意：aiCount >= 0 而不是 > 0，因为 AI 返回 0 也是有效结果
    // 使用 countStatus === 'done' 来判断 AI 是否已经完成计数
    if (overviewImageBase64 && countStatus === 'done' && !aiLearningSaved) {
      try {
        await saveLearningRecord({
          imageBase64: overviewImageBase64,
          aiCount: aiCount,
          aiCounts: aiCountResult?.counts,
          aiConfidence: aiCountResult?.confidence,
          userCount: count,
        });
        setAiLearningSaved(true);  // 标记已保存
        console.log('[QuickAdd] AI learning data saved on count confirm:', { aiCount, userCount: count });
      } catch (error) {
        console.error('[QuickAdd] Failed to save AI learning data:', error);
        // 不影响主流程，静默失败
      }
    }
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
    if (!selectedBox) {
      alert("请选择 Box");
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
          // Box 信息
          boxId: selectedBox?.id,
          boxName: selectedBox?.name,
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
        lastBoxId: selectedBox?.id,
        lastBoxName: selectedBox?.name,
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

      // 保存AI学习数据（如果有全景图和AI计数结果，且尚未保存）
      // 注意：使用 countStatus === 'done' 来判断 AI 是否已经完成计数
      if (overviewImageBase64 && countStatus === 'done' && !aiLearningSaved) {
        try {
          await saveLearningRecord({
            imageBase64: overviewImageBase64,
            aiCount: aiCount,
            aiCounts: aiCountResult?.counts,
            aiConfidence: aiCountResult?.confidence,
            userCount: quantity,
          });
          setAiLearningSaved(true);  // 标记已保存
          console.log('[QuickAdd] AI learning data saved on product save:', { aiCount, userCount: quantity });
        } catch (error) {
          console.error('[QuickAdd] Failed to save AI learning data:', error);
          // 不影响主流程，静默失败
        }
      }

      // 扫描 SKU 重复（后台执行，不阻塞）
      scanForDuplicateSKUs().then(duplicates => {
        if (duplicates.length > 0) {
          console.log(`[QuickAdd] Found ${duplicates.length} duplicate SKUs`);
        }
      }).catch(err => {
        console.error("[QuickAdd] SKU duplicate scan failed:", err);
      });

      alert("产品入库成功！");
      router.replace("/(tabs)/inbound");
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

          {/* 跳过按钮 - 仅在全景图阶段显示，放在右下角防止误触 */}
          {stage === "overview_photo" && (
            <Pressable
              style={({ pressed }) => [
                styles.skipButtonCorner,
                { opacity: pressed ? 0.7 : 1 },
              ]}
              onPress={() => {
                // 跳过全景图，数量默认为1
                setQuantity(1);
                setStage("confirm");
              }}
              disabled={processing}
            >
              <ThemedText style={styles.skipButtonText}>跳过此步 →</ThemedText>
              <ThemedText style={styles.skipButtonHint}>已手动点数 / 仅查重</ThemedText>
            </Pressable>
          )}
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
              duplicateCheckStatus === "cancelled" ? styles.statusBadgeCancelled :
              duplicateCheckStatus === "running" ? styles.statusBadgeRunning : styles.statusBadgePending
            ]}>
              {duplicateCheckStatus === "running" && <ActivityIndicator size="small" color="#007AFF" style={styles.statusSpinner} />}
              <ThemedText style={styles.statusText}>
                {duplicateCheckStatus === "pending" ? "⏳ 查重待开始" :
                 duplicateCheckStatus === "running" ? "查重中..." : 
                 duplicateCheckStatus === "cancelled" ? "❌ 已取消查重" : "✓ 查重已完成"}
              </ThemedText>
              {/* 查重进行中时显示取消按钮 */}
              {duplicateCheckStatus === "running" && (
                <Pressable
                  style={styles.cancelCheckButton}
                  onPress={handleCancelDuplicateCheck}
                >
                  <ThemedText style={styles.cancelCheckButtonText}>取消</ThemedText>
                </Pressable>
              )}
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
                <ThemedText style={[styles.currencySymbol, { color: inputColor }]}>$</ThemedText>
                <TextInput
                  style={[styles.priceInput, { color: inputColor }]}
                  value={priceText}
                  onChangeText={(text) => {
                    // 允许输入数字和小数点
                    if (/^\d*\.?\d*$/.test(text) || text === '') {
                      setPriceText(text);
                      const num = parseFloat(text);
                      if (!isNaN(num)) {
                        setPrice(num);
                      } else if (text === '' || text === '.') {
                        setPrice(0);
                      }
                    }
                  }}
                  onBlur={() => {
                    // 失去焦点时格式化显示
                    if (priceText === '' || priceText === '.') {
                      setPriceText('0');
                      setPrice(0);
                    }
                  }}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={placeholderColor}
                />
              </View>
            </View>

            {/* Box 选择 */}
            <View style={styles.formRow}>
              <ThemedText style={styles.formLabel}>Box</ThemedText>
              <View style={styles.boxSelectRow}>
                <Pressable
                  style={[styles.formInput, styles.boxSelectInput, { backgroundColor: inputBg }]}
                  onPress={() => setShowBoxPicker(true)}
                >
                  <ThemedText style={[styles.formValue, !selectedBox && styles.placeholder, { color: inputColor }]}>
                    {selectedBox ? selectedBox.name : "点击选择 Box"}
                  </ThemedText>
                  <ThemedText style={styles.formArrow}>›</ThemedText>
                </Pressable>
                <Pressable
                  style={styles.boxManagerButton}
                  onPress={() => setShowBoxManager(true)}
                >
                  <ThemedText style={styles.boxManagerButtonText}>+</ThemedText>
                </Pressable>
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

            {/* AI 查重结果区域 */}
            {duplicateResult?.duplicates && duplicateResult.duplicates.length > 0 && (
              <View style={styles.aiResultSection}>
                <ThemedText style={styles.matchListTitle}>
                  AI 发现 {Math.min(duplicateResult.duplicates.length, 5)} 个相似产品（点击选择）：
                </ThemedText>
                <ScrollView style={styles.aiResultList} nestedScrollEnabled={true}>
                  {duplicateResult.duplicates
                    .slice()
                    .sort((a, b) => b.similarityScore - a.similarityScore)
                    .slice(0, 5)
                    .map((dup, index) => {
                      const getSimilarityBgColor = (score: number) => {
                        if (score >= 85) return '#d4edda';
                        if (score >= 75) return '#fff3cd';
                        return '#f5f5f5';
                      };
                      const bgColor = getSimilarityBgColor(dup.similarityScore);
                      
                      return (
                        <Pressable
                          key={dup.product.id}
                          style={[
                            styles.matchItem,
                            { backgroundColor: bgColor },
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
                            <ThemedText style={[
                              styles.matchSimilarity,
                              dup.similarityScore >= 85 && { color: '#155724', fontWeight: '700' },
                              dup.similarityScore >= 75 && dup.similarityScore < 85 && { color: '#856404', fontWeight: '600' }
                            ]}>
                              相似度: {dup.similarityScore}%
                              {dup.similarityScore >= 85 && ' 🟢'}
                              {dup.similarityScore >= 75 && dup.similarityScore < 85 && ' 🟡'}
                            </ThemedText>
                            <ThemedText style={styles.matchQuantity}>
                              库存: {dup.product.quantity}
                            </ThemedText>
                          </View>
                          <ThemedText style={styles.matchArrow}>›</ThemedText>
                        </Pressable>
                      );
                    })}
                </ScrollView>
              </View>
            )}

            {/* 手动搜索区域 - 与 AI 查重结果同级 */}
            <View style={styles.manualSearchSection}>
              <ThemedText style={styles.manualSearchTitle}>
                🔍 手动搜索现有产品：
              </ThemedText>
              <TextInput
                style={[styles.manualSearchInput, { backgroundColor: inputBg, color: inputColor }]}
                value={manualSearchQuery}
                onChangeText={handleManualSearch}
                onFocus={handleSearchInputFocus}
                placeholder="点击浏览库存，或输入 SKU 筛选..."
                placeholderTextColor={placeholderColor}
              />
              {/* 产品下拉列表 - 点击输入框后显示 */}
              {showProductDropdown && manualSearchResults.length > 0 && (
                <View style={styles.productDropdownContainer}>
                  <ScrollView 
                    style={styles.productDropdownList}
                    nestedScrollEnabled={true}
                    showsVerticalScrollIndicator={true}
                  >
                    {manualSearchResults.map((product) => (
                      <View key={product.id} style={styles.dropdownProductItem}>
                        <Pressable
                          style={[
                            styles.dropdownProductRow,
                            selectedSimilarProduct?.id === product.id && styles.dropdownProductRowSelected
                          ]}
                          onPress={() => handleManualSelectProduct(product)}
                        >
                          <Image
                            source={{ uri: product.detailImageUri }}
                            style={styles.dropdownProductImage}
                          />
                          <ThemedText style={styles.dropdownProductSku}>{product.sku}</ThemedText>
                        </Pressable>
                        {/* 每个产品下方显示操作按钮 */}
                        <View style={styles.dropdownActionButtons}>
                          <Pressable
                            style={styles.dropdownSameStyleButton}
                            onPress={() => handleSameStyleDifferentColor(product)}
                          >
                            <ThemedText style={styles.dropdownButtonText}>同款不同色</ThemedText>
                          </Pressable>
                          <Pressable
                            style={styles.dropdownMergeButton}
                            onPress={() => {
                              setSelectedSimilarProduct(product);
                              handleConfirmMerge();
                            }}
                          >
                            <ThemedText style={styles.dropdownButtonText}>合并到此款</ThemedText>
                          </Pressable>
                        </View>
                      </View>
                    ))}
                  </ScrollView>
                  {/* 关闭下拉列表按钮 */}
                  <Pressable
                    style={styles.closeDropdownButton}
                    onPress={() => setShowProductDropdown(false)}
                  >
                    <ThemedText style={styles.closeDropdownButtonText}>收起列表</ThemedText>
                  </Pressable>
                </View>
              )}
            </View>

            {/* 如果没有 AI 结果也没有搜索结果，显示提示 */}
            {(!duplicateResult?.duplicates || duplicateResult.duplicates.length === 0) && 
             !showProductDropdown && (
              <ThemedText style={styles.noMatchText}>
                {duplicateCheckStatus === "done" 
                  ? "AI 未发现相似产品，可以手动搜索或直接新建" 
                  : duplicateCheckStatus === "running"
                    ? "正在查重..."
                    : "等待查重..."}
              </ThemedText>
            )}

            {/* 选中产品后显示操作按钮 */}
            {selectedSimilarProduct && (
              <View style={styles.selectedProductActions}>
                <View style={styles.selectedProductInfo}>
                  <Pressable onPress={() => handleGoToProductDetail(selectedSimilarProduct)}>
                    <Image
                      source={{ uri: selectedSimilarProduct.detailImageUri }}
                      style={styles.selectedProductImage}
                    />
                  </Pressable>
                  <View style={styles.selectedProductText}>
                    <ThemedText style={styles.selectedProductSku}>已选择: {selectedSimilarProduct.sku}</ThemedText>
                    <ThemedText style={styles.selectedProductQuantity}>库存: {selectedSimilarProduct.quantity}</ThemedText>
                    <Pressable 
                      style={styles.viewDetailLink}
                      onPress={() => handleGoToProductDetail(selectedSimilarProduct)}
                    >
                      <ThemedText style={styles.viewDetailLinkText}>查看详情 ›</ThemedText>
                    </Pressable>
                  </View>
                </View>
                <View style={styles.mergeButtonsContainer}>
                  <Pressable
                    style={styles.cancelMergeButton}
                    onPress={handleCancelMerge}
                  >
                    <ThemedText style={styles.cancelMergeButtonText}>取消选择</ThemedText>
                  </Pressable>
                  <Pressable
                    style={styles.sameStyleButton}
                    onPress={() => handleSameStyleDifferentColor(selectedSimilarProduct)}
                  >
                    <ThemedText style={styles.sameStyleButtonText}>同款不同色</ThemedText>
                  </Pressable>
                  <Pressable
                    style={styles.confirmMergeButton}
                    onPress={handleConfirmMerge}
                  >
                    <ThemedText style={styles.confirmMergeButtonText}>合并到此款</ThemedText>
                  </Pressable>
                </View>
              </View>
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

      {/* 查重反馈弹窗 */}
      {showFeedbackModal && feedbackDuplicate && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ThemedText type="title" style={styles.modalTitle}>查重反馈</ThemedText>
            
            {/* 显示对比的两张图片 */}
            <View style={styles.feedbackImageCompare}>
              <View style={styles.feedbackImageContainer}>
                <ThemedText style={styles.feedbackImageLabel}>新图片</ThemedText>
                <Image source={{ uri: detailImageUri }} style={styles.feedbackImage} />
              </View>
              <ThemedText style={styles.feedbackVs}>VS</ThemedText>
              <View style={styles.feedbackImageContainer}>
                <ThemedText style={styles.feedbackImageLabel}>库存图片</ThemedText>
                <Image source={{ uri: feedbackDuplicate.product.detailImageUri }} style={styles.feedbackImage} />
              </View>
            </View>
            
            {/* AI 结果 */}
            <View style={styles.feedbackAiResult}>
              <ThemedText style={styles.feedbackAiLabel}>AI 判断：</ThemedText>
              <ThemedText style={styles.feedbackAiScore}>
                相似度 {feedbackDuplicate.similarityScore}%
                {feedbackDuplicate.scores && ` (三次: ${feedbackDuplicate.scores.join(', ')})`}
              </ThemedText>
              {feedbackDuplicate.analysisNote && (
                <ThemedText style={styles.feedbackAiNote}>💬 {feedbackDuplicate.analysisNote}</ThemedText>
              )}
            </View>
            
            {/* 用户判断 */}
            <View style={styles.feedbackUserSection}>
              <ThemedText style={styles.feedbackSectionTitle}>您的判断：</ThemedText>
              
              {/* 判断按钮 */}
              <View style={styles.feedbackJudgmentButtons}>
                <Pressable
                  style={[
                    styles.feedbackJudgmentButton,
                    userJudgment === 'same' && styles.feedbackJudgmentButtonActive
                  ]}
                  onPress={() => {
                    setUserJudgment('same');
                    setUserSimilarityScore(95);
                  }}
                >
                  <ThemedText style={[
                    styles.feedbackJudgmentText,
                    userJudgment === 'same' && styles.feedbackJudgmentTextActive
                  ]}>✅ 相同</ThemedText>
                </Pressable>
                <Pressable
                  style={[
                    styles.feedbackJudgmentButton,
                    userJudgment === 'similar' && styles.feedbackJudgmentButtonActive
                  ]}
                  onPress={() => {
                    setUserJudgment('similar');
                    setUserSimilarityScore(75);
                  }}
                >
                  <ThemedText style={[
                    styles.feedbackJudgmentText,
                    userJudgment === 'similar' && styles.feedbackJudgmentTextActive
                  ]}>🟡 相似</ThemedText>
                </Pressable>
                <Pressable
                  style={[
                    styles.feedbackJudgmentButton,
                    userJudgment === 'different' && styles.feedbackJudgmentButtonActive
                  ]}
                  onPress={() => {
                    setUserJudgment('different');
                    setUserSimilarityScore(30);
                  }}
                >
                  <ThemedText style={[
                    styles.feedbackJudgmentText,
                    userJudgment === 'different' && styles.feedbackJudgmentTextActive
                  ]}>❌ 不同</ThemedText>
                </Pressable>
              </View>
              
              {/* 相似度滑块 */}
              <View style={styles.feedbackSliderContainer}>
                <ThemedText style={styles.feedbackSliderLabel}>
                  您认为的相似度: {userSimilarityScore}%
                </ThemedText>
                <View style={styles.feedbackSliderRow}>
                  <ThemedText style={styles.feedbackSliderMin}>0%</ThemedText>
                  <TextInput
                    style={[styles.feedbackSliderInput, { backgroundColor: inputBg, color: inputColor }]}
                    value={userSimilarityScore.toString()}
                    onChangeText={(text) => {
                      const val = parseInt(text) || 0;
                      setUserSimilarityScore(Math.min(100, Math.max(0, val)));
                    }}
                    keyboardType="number-pad"
                    maxLength={3}
                  />
                  <ThemedText style={styles.feedbackSliderMax}>100%</ThemedText>
                </View>
              </View>
            </View>
            
            {/* 按钮 */}
            <View style={styles.modalButtons}>
              <Pressable
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setShowFeedbackModal(false);
                  setFeedbackDuplicate(null);
                }}
              >
                <ThemedText style={styles.cancelButtonText}>取消</ThemedText>
              </Pressable>
              <Pressable
                style={[styles.modalButton, styles.confirmButton]}
                onPress={async () => {
                  try {
                    // 保存学习数据
                    const newImageBase64 = detailImageUri.startsWith('data:') 
                      ? detailImageUri.split(',')[1] 
                      : await imageToBase64(detailImageUri);
                    const existingImageBase64 = feedbackDuplicate.product.detailImageUri.startsWith('data:')
                      ? feedbackDuplicate.product.detailImageUri.split(',')[1]
                      : await imageToBase64(feedbackDuplicate.product.detailImageUri);
                    
                    await saveSimilarityLearningRecord({
                      newImageBase64,
                      existingImageBase64,
                      existingProductSku: feedbackDuplicate.product.sku,
                      aiSimilarityScore: feedbackDuplicate.similarityScore,
                      aiScores: feedbackDuplicate.scores || [feedbackDuplicate.similarityScore],
                      aiConfidence: feedbackDuplicate.confidence || 'medium',
                      aiAnalysisNote: feedbackDuplicate.analysisNote,
                      userSimilarityScore,
                      userJudgment,
                    });
                    
                    alert('反馈已保存，感谢您的贡献！');
                    setShowFeedbackModal(false);
                    setFeedbackDuplicate(null);
                  } catch (error) {
                    console.error('Failed to save feedback:', error);
                    alert('保存失败，请重试');
                  }
                }}
              >
                <ThemedText style={styles.confirmButtonText}>提交反馈</ThemedText>
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

            {countStatus === "done" ? (
              <>
                <ThemedText style={styles.modalHint}>
                  AI 识别到的数量: {aiCount}
                </ThemedText>
                
                {/* 置信度指示器 */}
                {aiCountResult && (
                  <View style={[
                    styles.confidenceBadge,
                    aiCountResult.confidence === 'high' ? styles.confidenceHigh :
                    aiCountResult.confidence === 'medium' ? styles.confidenceMedium : styles.confidenceLow
                  ]}>
                    <ThemedText style={styles.confidenceText}>
                      {aiCountResult.confidence === 'high' ? '✓ 高置信度' :
                       aiCountResult.confidence === 'medium' ? '⚠ 中置信度' : '❗ 低置信度'}
                    </ThemedText>
                  </View>
                )}
                
                {/* 多次计数结果 */}
                {aiCountResult?.counts && aiCountResult.counts.length > 1 && (
                  <View style={styles.countsDetail}>
                    <ThemedText style={styles.countsDetailTitle}>
                      多次计数结果: {aiCountResult.counts.join(', ')}
                    </ThemedText>
                    {aiCountResult.message && (
                      <ThemedText style={styles.countsDetailMessage}>
                        {aiCountResult.message}
                      </ThemedText>
                    )}
                  </View>
                )}
                
                {/* 低置信度警告 */}
                {aiCountResult?.confidence !== 'high' && (
                  <View style={styles.warningBox}>
                    <ThemedText style={styles.warningText}>
                      ⚠️ AI 计数可能不准确，请手动确认数量
                    </ThemedText>
                  </View>
                )}
              </>
            ) : (
              <View style={styles.countingProgress}>
                <ActivityIndicator size="small" color="#007AFF" />
                <ThemedText style={styles.modalHint}>
                  AI 正在多次计数中...
                </ThemedText>
              </View>
            )}

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

      {/* 同款不同色颜色选择器 */}
      <ColorPickerModal
        visible={showColorPicker}
        onClose={() => {
          setShowColorPicker(false);
          setColorPickerTargetProduct(null);
        }}
        onSelect={handleColorSelected}
        currentSku={colorPickerTargetProduct?.sku || ''}
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
                    <ThemedText style={styles.barcodeProductLocation}>位置：{scannedProduct.storageLocation || '未设置'}</ThemedText>
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

      {/* Box 选择弹窗 */}
      {showBoxPicker && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ThemedText type="title" style={styles.modalTitle}>📦 选择 Box</ThemedText>
            
            <ScrollView style={styles.boxList}>
              {/* 现有 Box 列表 */}
              {boxes.map((box) => (
                <View
                  key={box.id}
                  style={[
                    styles.boxItem,
                    selectedBox?.id === box.id && styles.boxItemSelected
                  ]}
                >
                  <Pressable
                    style={styles.boxItemContent}
                    onPress={() => {
                      setSelectedBox(box);
                      setShowBoxPicker(false);
                    }}
                  >
                    <ThemedText style={styles.boxItemName}>{box.name}</ThemedText>
                    <ThemedText style={styles.boxItemHint}>
                      {box.location || '未设置位置'} · {box.items?.length || 0} 件产品
                    </ThemedText>
                  </Pressable>
                  <Pressable
                    style={styles.boxDeleteButton}
                    onPress={async () => {
                      if (confirm(`确定要删除 Box "${box.name}" 吗？`)) {
                        try {
                          await deleteBox(box.id);
                          setBoxes(boxes.filter(b => b.id !== box.id));
                          if (selectedBox?.id === box.id) {
                            setSelectedBox(null);
                          }
                        } catch (error) {
                          console.error('[QuickAdd] Failed to delete box:', error);
                          alert('删除 Box 失败');
                        }
                      }
                    }}
                  >
                    <ThemedText style={styles.boxDeleteButtonText}>🗑️</ThemedText>
                  </Pressable>
                </View>
              ))}

              {/* 新建 Box */}
              <View style={styles.newBoxContainer}>
                <ThemedText style={styles.newBoxLabel}>新建 Box：</ThemedText>
                <ThemedText style={styles.newBoxFormatHint}>格式：品牌-大类-Box-流水号，例如：LB-RF-Box-1</ThemedText>
                <View style={styles.newBoxInputRow}>
                  <TextInput
                    style={[styles.newBoxInput, { backgroundColor: inputBg, color: inputColor }]}
                    value={newBoxName}
                    onChangeText={setNewBoxName}
                    placeholder="例如：LB-RF-Box-1"
                    placeholderTextColor={placeholderColor}
                  />
                  <Pressable
                    style={[styles.newBoxButton, !newBoxName && styles.newBoxButtonDisabled]}
                    onPress={async () => {
                      if (!newBoxName.trim()) return;
                      try {
                        const newBox = await createBox({
                          prefix: newBoxName.trim(),
                          location: location || '',
                          operatorId,
                          operatorName,
                        });
                        setBoxes([newBox, ...boxes]);
                        setSelectedBox(newBox);
                        setNewBoxName('');
                        setShowBoxPicker(false);
                      } catch (error) {
                        console.error('[QuickAdd] Failed to create box:', error);
                        alert('创建 Box 失败');
                      }
                    }}
                    disabled={!newBoxName.trim()}
                  >
                    <ThemedText style={styles.newBoxButtonText}>创建</ThemedText>
                  </Pressable>
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalButtons}>
              <Pressable
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowBoxPicker(false)}
              >
                <ThemedText style={styles.cancelButtonText}>关闭</ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {/* Box 管理器弹窗 */}
      <BoxManagerModal
        visible={showBoxManager}
        onClose={() => setShowBoxManager(false)}
        mode="select"
        onSelect={(boxCode, shelfLocation) => {
          // 创建一个 Box 对象用于显示
          // 使用 boxCode 作为 id 和 name，以便后续匹配
          const newBox: Box = {
            id: boxCode, // 使用 boxCode 作为 id，与 box-storage 中的逻辑一致
            name: boxCode,
            location: shelfLocation,
            status: 'open',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            operatorId,
            operatorName,
            items: [],
          };
          setSelectedBox(newBox);
          // 自动填充货架位置
          if (shelfLocation) {
            setLocation(shelfLocation);
          }
        }}
      />
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
    bottom: 120,
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
  skipButton: {
    marginTop: 30,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
    alignItems: "center",
  },
  skipButtonCorner: {
    position: "absolute",
    bottom: 40,
    right: 20,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
    alignItems: "center",
    zIndex: 10,
  },
  skipButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  skipButtonHint: {
    color: "rgba(255, 255, 255, 0.6)",
    fontSize: 12,
    marginTop: 4,
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
  statusBadgeCancelled: {
    backgroundColor: "rgba(255, 59, 48, 0.15)",
  },
  statusSpinner: {
    marginRight: 6,
  },
  statusText: {
    fontSize: 13,
    fontWeight: "500",
  },
  cancelCheckButton: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: "#FF3B30",
    borderRadius: 4,
  },
  cancelCheckButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
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
  boxSelectRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  boxSelectInput: {
    flex: 1,
  },
  boxManagerButton: {
    width: 50,
    height: 50,
    borderRadius: 10,
    backgroundColor: "#007AFF",
    justifyContent: "center",
    alignItems: "center",
  },
  boxManagerButtonText: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "600",
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
  // AI 查重结果区域样式
  aiResultSection: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  aiResultList: {
    maxHeight: 200,
  },
  matchListTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
    color: "#000",
  },
  matchLegend: {
    fontSize: 11,
    color: "#666",
    marginBottom: 12,
    textAlign: "center",
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
  matchAnalysisNote: {
    fontSize: 11,
    color: "#555",
    marginTop: 4,
    fontStyle: "italic",
    lineHeight: 16,
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
  sameStyleButton: {
    flex: 1.5,
    height: 40,
    borderRadius: 8,
    backgroundColor: "#FF9500",
    justifyContent: "center",
    alignItems: "center",
  },
  sameStyleButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#fff",
  },
  confirmMergeButton: {
    flex: 1.5,
    height: 40,
    borderRadius: 8,
    backgroundColor: "#34C759",
    justifyContent: "center",
    alignItems: "center",
  },
  confirmMergeButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#fff",
  },
  noMatchText: {
    textAlign: "center",
    color: "#666",
    marginVertical: 20,
  },
  // 手动搜索区域样式
  manualSearchSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#e0e0e0",
  },
  manualSearchTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  manualSearchInput: {
    height: 44,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  // 产品下拉列表样式
  productDropdownContainer: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    backgroundColor: "#fff",
    overflow: "hidden",
  },
  productDropdownList: {
    maxHeight: 350, // 约显示5个产品
  },
  dropdownProductItem: {
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  dropdownProductRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
  },
  dropdownProductRowSelected: {
    backgroundColor: "#e6f2ff",
    borderRadius: 6,
  },
  dropdownProductImage: {
    width: 50,
    height: 50,
    borderRadius: 6,
    marginRight: 10,
  },
  dropdownProductSku: {
    fontSize: 14,
    fontWeight: "500",
    color: "#333",
    flex: 1,
  },
  dropdownActionButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 6,
  },
  dropdownSameStyleButton: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "#FF9500",
    borderRadius: 4,
  },
  dropdownMergeButton: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "#34C759",
    borderRadius: 4,
  },
  dropdownButtonText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
  },
  closeDropdownButton: {
    paddingVertical: 10,
    backgroundColor: "#f5f5f5",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#ddd",
  },
  closeDropdownButtonText: {
    color: "#666",
    fontSize: 13,
    fontWeight: "500",
  },
  // 选中产品操作区域样式
  selectedProductActions: {
    marginTop: 16,
    padding: 12,
    backgroundColor: "#f0f8ff",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#007AFF",
  },
  selectedProductInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  selectedProductImage: {
    width: 50,
    height: 50,
    borderRadius: 8,
    marginRight: 12,
  },
  selectedProductText: {
    flex: 1,
  },
  selectedProductSku: {
    fontSize: 15,
    fontWeight: "600",
    color: "#007AFF",
  },
  selectedProductQuantity: {
    fontSize: 13,
    color: "#666",
    marginTop: 2,
  },
  viewDetailLink: {
    marginTop: 4,
  },
  viewDetailLinkText: {
    fontSize: 13,
    color: "#007AFF",
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

  // 计数置信度样式
  confidenceBadge: {
    alignSelf: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 12,
  },
  confidenceHigh: {
    backgroundColor: "rgba(52, 199, 89, 0.15)",
  },
  confidenceMedium: {
    backgroundColor: "rgba(255, 149, 0, 0.15)",
  },
  confidenceLow: {
    backgroundColor: "rgba(255, 59, 48, 0.15)",
  },
  confidenceText: {
    fontSize: 13,
    fontWeight: "600",
  },
  countsDetail: {
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  countsDetailTitle: {
    fontSize: 13,
    color: "#666",
    textAlign: "center",
  },
  countsDetailMessage: {
    fontSize: 12,
    color: "#888",
    textAlign: "center",
    marginTop: 4,
  },
  warningBox: {
    backgroundColor: "rgba(255, 149, 0, 0.1)",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 149, 0, 0.3)",
  },
  warningText: {
    fontSize: 13,
    color: "#FF9500",
    textAlign: "center",
    fontWeight: "500",
  },
  countingProgress: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 16,
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

  // Box 选择弹窗样式
  boxList: {
    maxHeight: 300,
    marginBottom: 16,
  },
  boxItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#f5f5f5",
    borderRadius: 10,
    marginBottom: 8,
  },
  boxItemSelected: {
    backgroundColor: "#e3f2fd",
    borderWidth: 2,
    borderColor: "#2196F3",
  },
  boxItemContent: {
    flex: 1,
  },
  boxItemName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000",
    marginBottom: 4,
  },
  boxItemHint: {
    fontSize: 13,
    color: "#666",
  },
  boxDeleteButton: {
    padding: 8,
    marginLeft: 8,
  },
  boxDeleteButtonText: {
    fontSize: 18,
  },
  newBoxContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#e0e0e0",
  },
  newBoxLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#000",
    marginBottom: 4,
  },
  newBoxFormatHint: {
    fontSize: 12,
    color: "#888",
    marginBottom: 8,
    fontStyle: "italic",
  },
  newBoxInputRow: {
    flexDirection: "row",
    gap: 8,
  },
  newBoxInput: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  newBoxButton: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: "#2196F3",
    justifyContent: "center",
    alignItems: "center",
  },
  newBoxButtonDisabled: {
    backgroundColor: "#ccc",
  },
  newBoxButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },

  // 查重反馈按钮样式
  feedbackButton: {
    marginTop: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: "rgba(0, 122, 255, 0.1)",
    borderRadius: 4,
    alignSelf: "flex-start",
  },
  feedbackButtonText: {
    fontSize: 11,
    color: "#007AFF",
  },

  // 查重反馈弹窗样式
  feedbackImageCompare: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    gap: 8,
  },
  feedbackImageContainer: {
    alignItems: "center",
  },
  feedbackImageLabel: {
    fontSize: 12,
    color: "#666",
    marginBottom: 4,
  },
  feedbackImage: {
    width: 100,
    height: 100,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  feedbackVs: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#999",
  },
  feedbackAiResult: {
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  feedbackAiLabel: {
    fontSize: 13,
    color: "#666",
    marginBottom: 4,
  },
  feedbackAiScore: {
    fontSize: 16,
    fontWeight: "600",
    color: "#007AFF",
    marginBottom: 4,
  },
  feedbackAiNote: {
    fontSize: 12,
    color: "#888",
  },
  feedbackUserSection: {
    marginBottom: 16,
  },
  feedbackSectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#000",
    marginBottom: 12,
  },
  feedbackJudgmentButtons: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  feedbackJudgmentButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#f0f0f0",
    alignItems: "center",
  },
  feedbackJudgmentButtonActive: {
    backgroundColor: "#007AFF",
  },
  feedbackJudgmentText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#333",
  },
  feedbackJudgmentTextActive: {
    color: "#fff",
  },
  feedbackSliderContainer: {
    marginBottom: 8,
  },
  feedbackSliderLabel: {
    fontSize: 13,
    color: "#666",
    marginBottom: 8,
    textAlign: "center",
  },
  feedbackSliderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  feedbackSliderMin: {
    fontSize: 12,
    color: "#999",
  },
  feedbackSliderMax: {
    fontSize: 12,
    color: "#999",
  },
  feedbackSliderInput: {
    width: 80,
    height: 40,
    borderRadius: 8,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "600",
  },
});
