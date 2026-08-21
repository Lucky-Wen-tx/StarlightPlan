"""
全局配置模块
- 笔记存储根目录、回收站目录、资源目录
- 服务端口配置
- 启动时目录初始化
"""
import os

# ── 路径配置 ──────────────────────────────────────────────
# 笔记根目录：所有 .md 笔记文件存放在此目录下
NOTES_ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "notes")

# 回收站目录：删除的笔记移入此处，支持恢复
RECYCLE_DIR = os.path.join(NOTES_ROOT, ".recycle")

# 资源目录：上传的图片等静态资源存储在此
ASSETS_DIR = os.path.join(NOTES_ROOT, "assets")

# 置顶状态文件：记录被置顶的笔记 ID 列表
# 以 . 开头命名，list_notes 扫描时天然忽略，不会被当作笔记
PINNED_FILE = os.path.join(NOTES_ROOT, ".pinned.json")

# ── 回收站容量配置 ───────────────────────────────────────
# 回收站最多保留的笔记数量；超出后自动永久删除删除时间最早的笔记。
# 注意：前端 SettingsDialog 中的 RECYCLE_MAX_ITEMS 需与此保持一致。
RECYCLE_MAX_ITEMS = 99

# ── 服务配置 ──────────────────────────────────────────────
# FastAPI 服务监听端口
PORT = 8000

# 服务监听地址（0.0.0.0 允许外部访问）
HOST = "0.0.0.0"


def init_directories() -> None:
    """
    初始化应用所需的目录结构：
    - notes/           → 笔记根目录
    - notes/.recycle/  → 回收站目录
    - notes/assets/    → 上传资源目录

    若目录已存在则跳过，不会抛出异常。
    """
    for directory in [NOTES_ROOT, RECYCLE_DIR, ASSETS_DIR]:
        os.makedirs(directory, exist_ok=True)
