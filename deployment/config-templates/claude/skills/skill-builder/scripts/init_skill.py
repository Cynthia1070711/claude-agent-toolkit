#!/usr/bin/env python3
"""
Skill 初始化工具 - 建立新 skill 的骨架結構

用法：
    python init_skill.py <skill-name> --path <目標路徑>

範例：
    python init_skill.py api-generator --path ~/skills
    python init_skill.py sql-helper --path /mnt/skills/user
"""

import sys
import re
from datetime import date
from pathlib import Path


SKILL_TEMPLATE = """---
name: {skill_name}
description: [TODO: 詳細描述這個 skill 做什麼，以及什麼情況下應該觸發它。這是觸發機制，務必完整！]
version: 0.1.0
updated: {today_date}
---

# {skill_title}

## 概述

[TODO: 1-2 句說明這個 skill 提供什麼能力]

## 工作流程

[TODO: 描述使用這個 skill 的步驟]

## 使用範例

[TODO: 提供具體的使用範例，包含輸入和預期輸出]

## 資源

- `scripts/` - 可執行腳本
- `references/` - 參考文件
- `assets/` - 模板和資源檔案

（刪除不需要的目錄）
"""

EXAMPLE_SCRIPT = '''#!/usr/bin/env python3
"""
{skill_name} 範例腳本

這是一個佔位腳本，請替換為實際實作或刪除。
"""

def main():
    print("這是 {skill_name} 的範例腳本")
    # TODO: 加入實際邏輯

if __name__ == "__main__":
    main()
'''

EXAMPLE_REFERENCE = """# {skill_title} 參考文件

這是參考文件的佔位檔案，請替換為實際內容或刪除。

## 何時使用 references/

- API 文件
- 資料庫 schema
- 詳細工作流程指引
- 公司規範或政策
"""

EXAMPLE_ASSET = """# 資源檔案說明

這是 assets/ 目錄的佔位檔案。

assets/ 用於存放：
- 模板檔案（.pptx, .docx）
- 圖片（.png, .jpg, .svg）
- 字型（.ttf, .woff2）
- 樣板專案目錄

請替換為實際資源或刪除此目錄。
"""


def title_case(skill_name: str) -> str:
    """將 kebab-case 轉為標題格式"""
    return ' '.join(word.capitalize() for word in skill_name.split('-'))


def validate_name(name: str) -> tuple[bool, str]:
    """驗證 skill 名稱"""
    if not name:
        return False, "名稱不能為空"
    if not re.match(r'^[a-z0-9-]+$', name):
        return False, "名稱只能包含小寫字母、數字和連字號"
    if name.startswith('-') or name.endswith('-') or '--' in name:
        return False, "名稱不能以連字號開頭/結尾，也不能有連續連字號"
    if len(name) > 64:
        return False, f"名稱太長（{len(name)} 字元），最多 64 字元"
    return True, "OK"


def init_skill(skill_name: str, path: str) -> Path | None:
    """初始化新 skill"""
    
    # 驗證名稱
    valid, msg = validate_name(skill_name)
    if not valid:
        print(f"❌ 錯誤：{msg}")
        return None
    
    skill_dir = Path(path).resolve() / skill_name
    
    # 檢查是否已存在
    if skill_dir.exists():
        print(f"❌ 錯誤：目錄已存在 {skill_dir}")
        return None
    
    try:
        # 建立目錄
        skill_dir.mkdir(parents=True)
        print(f"✅ 建立目錄：{skill_dir}")
        
        # 建立 SKILL.md
        skill_title = title_case(skill_name)
        today_date = date.today().strftime('%Y-%m-%d')
        skill_md = skill_dir / 'SKILL.md'
        skill_md.write_text(
            SKILL_TEMPLATE.format(
                skill_name=skill_name,
                skill_title=skill_title,
                today_date=today_date,
            ),
            encoding='utf-8'
        )
        print("✅ 建立 SKILL.md")
        
        # 建立 scripts/
        scripts_dir = skill_dir / 'scripts'
        scripts_dir.mkdir()
        example_script = scripts_dir / 'example.py'
        example_script.write_text(
            EXAMPLE_SCRIPT.format(skill_name=skill_name),
            encoding='utf-8'
        )
        try:
            example_script.chmod(0o755)
        except OSError:
            pass  # Windows 不支援 Unix 權限，忽略
        print("✅ 建立 scripts/example.py")
        
        # 建立 references/
        refs_dir = skill_dir / 'references'
        refs_dir.mkdir()
        example_ref = refs_dir / 'reference.md'
        example_ref.write_text(
            EXAMPLE_REFERENCE.format(skill_title=skill_title),
            encoding='utf-8'
        )
        print("✅ 建立 references/reference.md")
        
        # 建立 assets/
        assets_dir = skill_dir / 'assets'
        assets_dir.mkdir()
        example_asset = assets_dir / 'README.txt'
        example_asset.write_text(EXAMPLE_ASSET, encoding='utf-8')
        print("✅ 建立 assets/README.txt")
        
        print(f"\n✅ Skill '{skill_name}' 初始化完成！")
        print(f"   位置：{skill_dir}")
        print("\n下一步：")
        print("1. 編輯 SKILL.md，完成 TODO 項目")
        print("2. 依需求修改或刪除 scripts/, references/, assets/ 中的範例檔案")
        print("3. 執行 quick_validate.py 驗證格式")
        
        return skill_dir
        
    except Exception as e:
        print(f"❌ 錯誤：{e}")
        return None


def main():
    if len(sys.argv) < 4 or sys.argv[2] != '--path':
        print("用法：python init_skill.py <skill-name> --path <目標路徑>")
        print("\nSkill 名稱規則：")
        print("  - kebab-case 格式（例：my-api-helper）")
        print("  - 僅限小寫字母、數字、連字號")
        print("  - 最長 64 字元")
        print("\n範例：")
        print("  python init_skill.py api-generator --path ~/skills")
        print("  python init_skill.py sql-helper --path /mnt/skills/user")
        sys.exit(1)
    
    skill_name = sys.argv[1]
    path = sys.argv[3]
    
    print(f"🚀 初始化 Skill：{skill_name}")
    print(f"   位置：{path}\n")
    
    result = init_skill(skill_name, path)
    sys.exit(0 if result else 1)


if __name__ == "__main__":
    main()
