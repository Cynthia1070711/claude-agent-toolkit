# PPTX(PowerPoint Presentation)Guide

> 蒸餾自 Anthropic skills-main pptx SKILL.md

## 工作流選擇

| 任務 | 工具 |
|---|---|
| 從零創建 | pptxgenjs(Node)或 python-pptx |
| 讀取 / 提取 | markitdown + scripts/pptx/thumbnail.py |
| 編輯既有 | Unpack → 編輯 → Clean → Pack |
| 轉 PDF / 圖像 | LibreOffice + Poppler |

## pptxgenjs 範例

```bash
npm install pptxgenjs
```

```js
import pptxgen from 'pptxgenjs';

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE';   // 16:9

pres.defineSlideMaster({
  title: 'MASTER',
  background: { color: 'FFFFFF' },
  slideNumber: { x: '95%', y: '95%', fontSize: 10, color: '999999' },
});

const slide = pres.addSlide({ masterName: 'MASTER' });
slide.addText('Slide 標題', {
  x: 0.5, y: 1, w: 9, h: 1,
  fontSize: 36, bold: true, color: '1F2937', fontFace: 'Inter'
});
slide.addShape(pres.ShapeType.rect, {
  x: 0.5, y: 3.5, w: 4, h: 2,
  fill: { color: 'F3F4F6' }, line: { color: 'E5E7EB', width: 1 },
});
slide.addImage({ path: 'chart.png', x: 5, y: 3.5, w: 4, h: 2 });

await pres.writeFile({ fileName: 'output.pptx' });
```

## 設計標準

### Spacing
- Slide margin ≥ 0.5"(36 pt)
- 元素間距 ≥ 0.25"(18 pt)
- Title font ≥ 32pt / Body ≥ 18pt / Caption ≥ 12pt
- Line-height 1.2-1.4

### 11 條 Avoid 清單(AI-slop)
- ❌ Lorem ipsum / xxxx / placeholder 文字
- ❌ Stock photo 微笑商務人士
- ❌ 過度漸層 / chrome 反光
- ❌ Comic Sans / Papyrus / Impact
- ❌ WordArt / 3D 文字效果
- ❌ 過多 bullet(每 slide ≤ 5)
- ❌ 紫色漸層 + 白底(經典 AI slop)
- ❌ Logo 過大(> 1" 高,除非 title slide)
- ❌ 文字溢出 slide 邊界
- ❌ 圖示尺寸不一致
- ❌ 同 slide 字體 ≥ 3 種

## 編輯既有(Unpack 工作流)

```bash
py scripts/pptx/office/unpack.py input.pptx ./unpacked/
# 編輯 unpacked/ppt/slides/slide1.xml
py scripts/pptx/clean.py ./unpacked/   # 移除殘留標籤
py scripts/pptx/office/pack.py ./unpacked/ output.pptx
py scripts/pptx/office/validate.py output.pptx
```

## 讀取(markitdown)

```bash
py -m markitdown input.pptx > output.md
```

或 thumbnail:
```bash
py scripts/pptx/thumbnail.py input.pptx --output thumbs/
```

## Visual QA Loop(Iron Law)

```
1. Generate(pptxgenjs / 編輯 OOXML)
2. soffice --headless --convert-to pdf output.pptx
3. pdftoppm -jpeg output.pdf thumb
4. Subagent 視覺檢查(用 Task tool 啟動 fresh subagent)
5. 識別問題(重疊 / 溢位 / 對齊 / 殘留)
6. 修復 → 重驗(至少 1 次完整 cycle)
```

### Subagent 檢查 prompt 範本
```
請檢查附圖 PPTX 截圖,回報以下(file:line):
1. 文字是否溢出 slide 邊界?
2. 元素是否重疊?
3. 圖示尺寸是否一致?
4. 是否有 placeholder 殘留(xxxx / lorem / TODO)?
5. 配色是否符合 palette?
6. 字體是否 ≤ 2 種?
7. Title font ≥ 32pt?
```

## 轉換

```bash
# .pptx → .pdf
soffice --headless --convert-to pdf --outdir ./out input.pptx

# .pdf → .jpg
pdftoppm -jpeg -r 150 ./out/input.pdf ./thumbs/slide
```

## Content QA

```bash
py -m markitdown output.pptx | grep -iE 'xxxx|lorem|ipsum|TODO|placeholder'
```

## Common Pitfalls

- ❌ 跳過 visual QA loop 直接交付 → 殘留 placeholder / 溢出 / 重疊
- ❌ 一份簡報 ≥ 3 種字體 → 視覺混亂
- ❌ 紫漸層 + Inter + 白底 → 標準 AI slop
- ❌ 不用 Master Slide 統一 → 每 slide 各自為政
