# Coding Style

- 不可變性：建立新物件取代 mutation（C# record/with、TS spread）
- 檔案：200-400 行，上限 800 行；高內聚低耦合，按 feature 組織
- 函式：< 50 行，巢狀 < 4 層
- 錯誤處理：全面 try-catch，例外訊息具描述性
- 禁止：殘留 console.log、硬編碼值、直接 mutation
