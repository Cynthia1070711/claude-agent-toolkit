// ============================================================
// PCPT Context Memory DB — 本地 Embedding 模組
// CMI-6: 替換 OpenAI text-embedding-3-small → 本地 ONNX 推理
// ============================================================
// 使用 @huggingface/transformers (Transformers.js) 在 Node.js 本地執行 ONNX 推理
//
// 模型: Xenova/all-MiniLM-L6-v2 (384D)
// 首次載入: 自動下載 ~90MB 至 ~/.cache/huggingface/hub
// 推理速度: 單句 ~10-30ms (CPU)，遠優於 API 往返 100-300ms
//
// 匯出 API:
//   initModel()              → 初始化並快取模型（建議程序啟動時呼叫）
//   generateEmbedding(text)  → 單句推理，返回 Float32Array (384D)
//   generateEmbeddings(texts)→ 批次推理，返回 Float32Array[] 陣列
//   MODEL_NAME               → "Xenova/all-MiniLM-L6-v2"
//   DIMENSIONS               → 384
// ============================================================

import { pipeline } from '@huggingface/transformers';

export const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';
export const DIMENSIONS = 384;

// 模型 Pipeline 快取（單例）
let _extractor = null;
let _initPromise = null;

/**
 * 初始化並快取模型 Pipeline。
 * 首次呼叫時自動下載模型至 ~/.cache/huggingface/hub，後續使用快取。
 * 並行呼叫時只下載一次（Promise 共享）。
 *
 * @returns {Promise<Function>} Transformers.js pipeline 函式
 */
export async function initModel() {
  if (_extractor) return _extractor;

  if (!_initPromise) {
    _initPromise = pipeline('feature-extraction', MODEL_NAME, {
      dtype: 'fp32',
    }).then(p => {
      _extractor = p;
      return p;
    });
  }

  return _initPromise;
}

/**
 * 單句推理：將文字轉為 384D Embedding 向量。
 *
 * @param {string} text 輸入文字（建議 < 512 tokens）
 * @returns {Promise<Float32Array>} 384 維向量
 */
export async function generateEmbedding(text) {
  const extractor = await initModel();

  // pooling: 'mean' + normalize: true → 生成正規化句向量
  const output = await extractor(text, { pooling: 'mean', normalize: true });

  // output.data 為 Float32Array，shape [1, 384] 攤平後取第一筆
  // Transformers.js Tensor: output.dims = [1, 384]
  const data = output.data instanceof Float32Array
    ? output.data
    : new Float32Array(output.data);

  // 若 shape 為 [1, 384]，直接返回（已攤平）
  return data;
}

/**
 * 批次推理：將多個文字轉為 384D Embedding 向量陣列。
 * 返回每個文字對應一個 Float32Array (384D)。
 *
 * @param {string[]} texts 輸入文字陣列
 * @returns {Promise<Float32Array[]>} 各文字對應的 384 維向量
 */
export async function generateEmbeddings(texts) {
  if (!texts || texts.length === 0) return [];

  const extractor = await initModel();

  // 批次推理（Transformers.js 支援 string[] 輸入）
  const output = await extractor(texts, { pooling: 'mean', normalize: true });

  // output.dims = [N, 384]，output.data 為 Float32Array（長度 N * 384）
  const data = output.data instanceof Float32Array
    ? output.data
    : new Float32Array(output.data);

  // 切割為每個文字的向量
  const results = [];
  for (let i = 0; i < texts.length; i++) {
    results.push(data.slice(i * DIMENSIONS, (i + 1) * DIMENSIONS));
  }
  return results;
}
