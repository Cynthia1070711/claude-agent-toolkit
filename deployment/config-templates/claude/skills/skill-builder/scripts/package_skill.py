#!/usr/bin/env python3
"""
Skill 打包工具 - 將 skill 打包成 .skill 檔案

用法：
    python package_skill.py <skill-path> [output-directory]

範例：
    python package_skill.py ~/skills/my-skill
    python package_skill.py ~/skills/my-skill ./dist
"""

import sys
import io
import zipfile
from pathlib import Path

# Windows console 編碼修正
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# 匯入同目錄的 quick_validate
try:
    from quick_validate import validate_skill
except ImportError:
    sys.path.insert(0, str(Path(__file__).parent))
    from quick_validate import validate_skill


def package_skill(skill_path: str | Path, output_dir: str | Path = None) -> Path | None:
    """打包 skill 為 .skill 檔案"""
    skill_path = Path(skill_path).resolve()

    if not skill_path.exists():
        print(f"[ERROR] 找不到 skill 目錄: {skill_path}")
        return None

    if not skill_path.is_dir():
        print(f"[ERROR] 路徑不是目錄: {skill_path}")
        return None

    skill_md = skill_path / "SKILL.md"
    if not skill_md.exists():
        print(f"[ERROR] 找不到 SKILL.md: {skill_path}")
        return None

    print("[CHECK] 驗證 skill 格式...")
    valid, message = validate_skill(skill_path)
    if not valid:
        print(f"[FAIL] 驗證失敗: {message}")
        print("   請先修正錯誤再打包。")
        return None
    print(f"{message}\n")

    skill_name = skill_path.name
    if output_dir:
        output_path = Path(output_dir).resolve()
        output_path.mkdir(parents=True, exist_ok=True)
    else:
        output_path = Path.cwd()

    skill_filename = output_path / f"{skill_name}.skill"

    try:
        with zipfile.ZipFile(skill_filename, 'w', zipfile.ZIP_DEFLATED) as zipf:
            file_count = 0
            for file_path in skill_path.rglob('*'):
                if file_path.is_file():
                    arcname = file_path.relative_to(skill_path.parent)
                    zipf.write(file_path, arcname)
                    print(f"  + {arcname}")
                    file_count += 1

        print(f"\n[DONE] 打包完成！")
        print(f"   檔案: {skill_filename}")
        print(f"   包含 {file_count} 個檔案")
        return skill_filename

    except Exception as e:
        print(f"[ERROR] 打包錯誤: {e}")
        return None


def main():
    if len(sys.argv) < 2:
        print("用法: python package_skill.py <skill-path> [output-directory]")
        print("\n範例:")
        print("  python package_skill.py ~/skills/my-skill")
        print("  python package_skill.py ~/skills/my-skill ./dist")
        sys.exit(1)

    skill_path = sys.argv[1]
    output_dir = sys.argv[2] if len(sys.argv) > 2 else None

    print(f"[PACK] 打包 Skill: {skill_path}")
    if output_dir:
        print(f"   輸出目錄: {output_dir}")
    print()

    result = package_skill(skill_path, output_dir)
    sys.exit(0 if result else 1)


if __name__ == "__main__":
    main()
