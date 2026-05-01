// ============================================================
// local-embedder.test.js — 本地 Embedding 模組單元測試
// CMI-6: Task 1.3 — 驗證 local-embedder.js 正確性
// ============================================================
// 執行方式: node --test .context-db/scripts/local-embedder.test.js
// ============================================================

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import {
  MODEL_NAME,
  DIMENSIONS,
  initModel,
  generateEmbedding,
  generateEmbeddings,
} from './local-embedder.js';

// 測試超時延長（首次下載需時較久）
// node --test 預設不限制，但若有逾時設定可用此

describe('local-embedder 模組常數', () => {
  it('MODEL_NAME 應為 Xenova/all-MiniLM-L6-v2', () => {
    assert.equal(MODEL_NAME, 'Xenova/all-MiniLM-L6-v2');
  });

  it('DIMENSIONS 應為 384', () => {
    assert.equal(DIMENSIONS, 384);
  });
});

describe('local-embedder initModel()', () => {
  it('應成功初始化模型並返回 Pipeline 函式', async () => {
    const extractor = await initModel();
    assert.ok(extractor, 'extractor 不應為 null');
    assert.equal(typeof extractor, 'function', 'extractor 應為可呼叫函式');
  });

  it('多次呼叫 initModel() 應返回相同實例（快取）', async () => {
    const e1 = await initModel();
    const e2 = await initModel();
    assert.strictEqual(e1, e2, '應返回同一個 pipeline 實例');
  });
});

describe('local-embedder generateEmbedding()', () => {
  it('應返回 Float32Array', async () => {
    const vec = await generateEmbedding('Hello world');
    assert.ok(vec instanceof Float32Array, '應返回 Float32Array');
  });

  it('向量維度應為 384 (DIMENSIONS)', async () => {
    const vec = await generateEmbedding('測試中文輸入');
    assert.equal(vec.length, DIMENSIONS, `向量維度應為 ${DIMENSIONS}`);
  });

  it('向量應為正規化（L2 norm ≈ 1.0）', async () => {
    const vec = await generateEmbedding('normalize test');
    let norm = 0;
    for (const v of vec) norm += v * v;
    norm = Math.sqrt(norm);
    assert.ok(Math.abs(norm - 1.0) < 0.01, `L2 norm 應 ≈ 1.0，實際: ${norm.toFixed(4)}`);
  });

  it('相似文字的 cosine similarity 應 > 0.7', async () => {
    const vecA = await generateEmbedding('認證與登入驗證');
    const vecB = await generateEmbedding('身份驗證服務');

    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    const similarity = dot / (Math.sqrt(normA) * Math.sqrt(normB));
    assert.ok(similarity > 0.7, `相似文字 cosine similarity 應 > 0.7，實際: ${similarity.toFixed(4)}`);
  });

  it('語意不同的文字 cosine similarity 應 < 0.6', async () => {
    const vecA = await generateEmbedding('PDF 生成排隊機制');
    const vecB = await generateEmbedding('登入頁面設計');

    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    const similarity = dot / (Math.sqrt(normA) * Math.sqrt(normB));
    assert.ok(similarity < 0.6, `語意不同文字 cosine similarity 應 < 0.6，實際: ${similarity.toFixed(4)}`);
  });
});

describe('local-embedder generateEmbeddings() 批次推理', () => {
  it('應返回 Float32Array 陣列，長度與輸入一致', async () => {
    const texts = ['Hello', 'World', '測試'];
    const vecs = await generateEmbeddings(texts);
    assert.equal(vecs.length, texts.length, '返回向量數應與輸入文字數一致');
    for (const vec of vecs) {
      assert.ok(vec instanceof Float32Array, '每個向量應為 Float32Array');
      assert.equal(vec.length, DIMENSIONS, `每個向量維度應為 ${DIMENSIONS}`);
    }
  });

  it('空陣列輸入應返回空陣列', async () => {
    const vecs = await generateEmbeddings([]);
    assert.equal(vecs.length, 0, '空輸入應返回空陣列');
  });

  it('batch 推理結果應與單句推理一致（cosine similarity > 0.99）', async () => {
    const text = 'PCPT PDF 生成服務';
    const singleVec = await generateEmbedding(text);
    const batchVecs = await generateEmbeddings([text]);
    const batchVec = batchVecs[0];

    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < singleVec.length; i++) {
      dot += singleVec[i] * batchVec[i];
      normA += singleVec[i] * singleVec[i];
      normB += batchVec[i] * batchVec[i];
    }
    const similarity = dot / (Math.sqrt(normA) * Math.sqrt(normB));
    assert.ok(similarity > 0.99, `單句/批次結果應近乎相同，similarity: ${similarity.toFixed(6)}`);
  });
});
