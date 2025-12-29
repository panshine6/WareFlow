/**
 * 产品和设置存储工具
 * 
 * 此文件现在作为适配器的导出接口，保持向后兼容性
 * Web 平台使用 IndexedDB，原生平台使用 AsyncStorage
 */

import { ProductStorageAdapter, SettingsStorageAdapter } from './storage-adapter';

export const ProductStorage = ProductStorageAdapter;
export const SettingsStorage = SettingsStorageAdapter;
