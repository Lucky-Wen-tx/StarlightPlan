"""
笔记核心业务逻辑
- 笔记的列表、读取、新建、更新操作
- 删除到回收站、从回收站恢复、永久删除
- Markdown 文件导入、图片上传
- 路径安全校验：所有文件操作限制在笔记根目录内，防止路径穿越攻击
- 文件名校验：自动过滤 Windows 非法字符
- 标题存储：使用 YAML frontmatter 的 title 字段（兼容旧格式 # 一级标题兜底）
"""
import os
import re
import shutil
import threading
import json
import uuid
from datetime import datetime

from config import NOTES_ROOT, RECYCLE_DIR, ASSETS_DIR, PINNED_FILE
from schemas import NoteCreate, NoteUpdate, NoteSummary, NoteDetail

# ── 常量 ──────────────────────────────────────────────────
# Windows 文件名非法字符正则
_WINDOWS_ILLEGAL_RE = re.compile(r'[<>:"/\\|?*]')

# YAML frontmatter 正则（匹配文件开头 ---\n...\n--- 块）
_FRONTMATTER_RE = re.compile(r'^---\s*\n(.*?)\n---\s*\n', re.DOTALL)

# 允许上传的图片 MIME 类型
_ALLOWED_IMAGE_TYPES = {
    "image/jpeg", "image/png", "image/gif",
    "image/webp", "image/bmp", "image/svg+xml",
}
# 允许上传的图片扩展名
_ALLOWED_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg"}


# ═══════════════════════════════════════════════════════════
# 内部工具函数
# ═══════════════════════════════════════════════════════════

def _sanitize_filename(name: str) -> str:
    """
    过滤文件名中的非法字符，生成安全、URL 友好的文件名：
    1. Windows 非法字符（< > : " / \\ | ? *）→ 替换为下划线
    2. 空白字符（空格、Tab 等）→ 替换为连字符
    3. 去除首尾的 . （防止创建隐藏文件）和空白
    """
    cleaned = _WINDOWS_ILLEGAL_RE.sub("_", name).strip()
    # 将空白字符（空格、Tab 等）替换为连字符，使 URL 更干净
    cleaned = re.sub(r'\s+', '-', cleaned)
    # 去除首尾的 .（防止创建隐藏文件）
    cleaned = cleaned.strip(".")
    return cleaned


def _resolve_safe_path(base_dir: str, filename: str) -> str:
    """
    路径安全校验核心函数。
    拼接 base_dir 与 filename，规范化路径后校验：
    - 结果路径必须在 base_dir 子树内（防止 ../ 路径穿越）
    - 返回规范化后的绝对路径

    注意：此函数不对文件名做 sanitize（如空格→连字符），
    因为读取/更新/删除操作的 note_id 来自文件系统自身的列表，
    已是实际文件名。sanitize 仅在创建笔记时调用。

    Raises:
        PermissionError: 当路径试图逃逸出允许的目录范围时
    """
    # 拼接并规范化路径
    raw_path = os.path.join(base_dir, filename)
    resolved = os.path.realpath(os.path.normpath(raw_path))

    # 确保 resolved 是 base_dir 的子路径（或就是 base_dir 本身）
    base_resolved = os.path.realpath(base_dir)
    if not (resolved == base_resolved or resolved.startswith(base_resolved + os.sep)):
        raise PermissionError(
            f"路径访问被拒绝：'{filename}' 超出了允许的目录范围"
        )

    return resolved


def _find_in_recycle(note_id: str) -> str:
    """
    在回收站中查找笔记文件。
    先精确匹配 note_id.md，若不存在则模糊匹配以 note_id 开头的文件
    （处理带时间戳后缀的回收文件，如 "foo_20260727120000.md"）。

    Returns:
        回收站中匹配文件的绝对路径

    Raises:
        FileNotFoundError: 回收站中未找到匹配的笔记
    """
    # 路径安全检查（防止 ../ 穿越），不对文件名做 sanitize
    exact_path = _resolve_safe_path(RECYCLE_DIR, f"{note_id}.md")

    if os.path.isfile(exact_path):
        return exact_path

    # 模糊匹配：处理带时间戳后缀的回收文件
    if os.path.isdir(RECYCLE_DIR):
        for entry in os.listdir(RECYCLE_DIR):
            if entry.startswith(note_id) and entry.endswith(".md"):
                file_path = _resolve_safe_path(RECYCLE_DIR, entry)
                if os.path.isfile(file_path):
                    return file_path

    raise FileNotFoundError(f"回收站中未找到笔记: {note_id}")


def _read_file_metadata(file_path: str) -> dict[str, datetime]:
    """读取文件的创建时间和最后修改时间"""
    stat = os.stat(file_path)
    return {
        "created_at": datetime.fromtimestamp(stat.st_ctime),
        "updated_at": datetime.fromtimestamp(stat.st_mtime),
    }


# ═══════════════════════════════════════════════════════════
# Frontmatter 工具函数
# ═══════════════════════════════════════════════════════════

def _parse_frontmatter(content: str) -> tuple[dict[str, str], str]:
    """
    解析 YAML frontmatter。
    返回 (metadata_dict, body_content)。
    若文件不以 frontmatter 开头，返回 ({}, content)。
    """
    match = _FRONTMATTER_RE.match(content)
    if match:
        metadata: dict[str, str] = {}
        for line in match.group(1).strip().split('\n'):
            if ':' in line:
                key, _, value = line.partition(':')
                # 去除首尾空白和引号
                metadata[key.strip()] = value.strip().strip('"').strip("'")
        return metadata, content[match.end():]
    return {}, content


def _build_frontmatter(title: str) -> str:
    """构建仅包含 title 字段的 frontmatter 块"""
    return f"---\ntitle: {title}\n---\n\n"


def _strip_frontmatter(content: str) -> str:
    """去除 frontmatter，返回正文部分"""
    _, body = _parse_frontmatter(content)
    return body


def _extract_title(file_path: str, fallback: str) -> str:
    """
    从 .md 文件中提取显示标题：
    1. 优先从 frontmatter 的 title 字段读取
    2. 兜底：旧格式正文第一个 # 一级标题
    3. 最后回退：使用 fallback（通常为文件名）
    """
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
        metadata, body = _parse_frontmatter(content)
        if 'title' in metadata and metadata['title']:
            return metadata['title']
        # 旧格式兜底：正文第一个 # 一级标题
        for line in body.split('\n'):
            stripped = line.strip()
            if stripped.startswith("# ") and not stripped.startswith("## "):
                return stripped[2:].strip()
    except (OSError, UnicodeDecodeError):
        pass
    return fallback


def _extract_title_from_content(content: str, fallback: str) -> str:
    """同 _extract_title，但从内容字符串而非文件路径提取"""
    metadata, body = _parse_frontmatter(content)
    if 'title' in metadata and metadata['title']:
        return metadata['title']
    for line in body.split('\n'):
        stripped = line.strip()
        if stripped.startswith("# ") and not stripped.startswith("## "):
            return stripped[2:].strip()
    return fallback


def _strip_first_heading(text: str) -> str:
    """
    移除正文开头的第一个 # 一级标题行及紧随的空行。
    用于旧格式笔记迁移到 frontmatter 时清理正文中的旧标题。
    """
    lines = text.split('\n')
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith("# ") and not stripped.startswith("## "):
            # 移除标题行及其后连续空行
            j = i + 1
            while j < len(lines) and lines[j].strip() == '':
                j += 1
            return '\n'.join(lines[:i] + lines[j:])
    return text


# ═══════════════════════════════════════════════════════════
# 置顶状态存储
# ═══════════════════════════════════════════════════════════
# 置顶状态持久化到 notes/.pinned.json（格式 {"pinned_ids": [...]}）。
# - 原子写入：先写 .tmp 再 os.replace 替换，防止写一半崩溃损坏文件
# - 并发安全：模块级 threading.Lock 包裹 read-modify-write（单进程 uvicorn 足够）
# - 容错：文件缺失或损坏时返回空集合，不导致服务崩溃

_PIN_LOCK = threading.Lock()


def _load_pinned_ids() -> set[str]:
    """读取置顶笔记 ID 集合；文件缺失或损坏时返回空集合"""
    if not os.path.isfile(PINNED_FILE):
        return set()
    try:
        with open(PINNED_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        ids = data.get("pinned_ids", []) if isinstance(data, dict) else data
        return set(ids) if isinstance(ids, list) else set()
    except (OSError, ValueError):
        # 文件损坏等异常 → 视为无置顶，避免服务崩溃
        return set()


def _write_pinned_ids(ids: set[str]) -> None:
    """原子写入置顶 ID 集合（临时文件 + os.replace 替换）"""
    tmp = PINNED_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump({"pinned_ids": sorted(ids)}, f, ensure_ascii=False, indent=2)
    os.replace(tmp, PINNED_FILE)


def set_note_pinned(note_id: str, pinned: bool) -> NoteSummary:
    """
    置顶 / 取消置顶（幂等）。
    笔记不存在时抛 FileNotFoundError；返回更新后的笔记摘要。
    """
    file_path = _resolve_safe_path(NOTES_ROOT, f"{note_id}.md")
    if not os.path.isfile(file_path):
        raise FileNotFoundError(f"笔记不存在: {note_id}")
    with _PIN_LOCK:
        ids = _load_pinned_ids()
        changed = (pinned and note_id not in ids) or (not pinned and note_id in ids)
        if changed:
            if pinned:
                ids.add(note_id)
            else:
                ids.discard(note_id)
            _write_pinned_ids(ids)
    return _build_note_summary(file_path, ids)


def _move_pinned_id(old_id: str, new_id: str) -> None:
    """重命名导致 ID 变化时迁移置顶状态（幂等；未置顶则无操作）"""
    with _PIN_LOCK:
        ids = _load_pinned_ids()
        if old_id not in ids:
            return
        ids.discard(old_id)
        ids.add(new_id)
        _write_pinned_ids(ids)


def _remove_pinned_id(note_id: str) -> None:
    """删除笔记时清理置顶记录（幂等）"""
    with _PIN_LOCK:
        ids = _load_pinned_ids()
        if note_id in ids:
            ids.discard(note_id)
            _write_pinned_ids(ids)


def _build_note_detail(note_id: str, file_path: str, content: str) -> NoteDetail:
    """
    构建 NoteDetail 响应。
    返回给前端的 content 已去除 frontmatter，编辑器看到的始终是纯净正文。
    """
    meta = _read_file_metadata(file_path)
    title = _extract_title(file_path, note_id)
    body = _strip_frontmatter(content)
    return NoteDetail(
        id=note_id,
        title=title,
        content=body,
        is_pinned=note_id in _load_pinned_ids(),
        **meta,
    )


def _build_note_summary(file_path: str, pinned_ids: set[str] | None = None) -> NoteSummary:
    """构建 NoteSummary 响应的辅助函数"""
    note_id = os.path.splitext(os.path.basename(file_path))[0]
    meta = _read_file_metadata(file_path)
    title = _extract_title(file_path, note_id)
    if pinned_ids is None:
        pinned_ids = _load_pinned_ids()
    return NoteSummary(id=note_id, title=title, is_pinned=note_id in pinned_ids, **meta)


# ═══════════════════════════════════════════════════════════
# 笔记 CRUD
# ═══════════════════════════════════════════════════════════

def list_notes() -> list[NoteSummary]:
    """
    获取笔记根目录下所有 .md 文件的摘要列表。
    排除隐藏文件（.开头）和子目录。
    结果按最后修改时间倒序排列。
    """
    notes: list[NoteSummary] = []

    if not os.path.isdir(NOTES_ROOT):
        return notes

    # 一次性读取置顶集合，避免每个文件重复读 pinned.json
    pinned_ids = _load_pinned_ids()
    for entry in sorted(os.listdir(NOTES_ROOT)):
        # 只处理 .md 文件，跳过隐藏文件和子目录
        if not entry.endswith(".md") or entry.startswith("."):
            continue
        file_path = os.path.join(NOTES_ROOT, entry)
        if not os.path.isfile(file_path):
            continue
        notes.append(_build_note_summary(file_path, pinned_ids))

    # 按修改时间倒序（最新的在前）
    notes.sort(key=lambda n: n.updated_at, reverse=True)
    return notes


def get_note(note_id: str) -> NoteDetail:
    """获取单篇笔记的完整内容（含正文）"""
    file_path = _resolve_safe_path(NOTES_ROOT, f"{note_id}.md")

    if not os.path.isfile(file_path):
        raise FileNotFoundError(f"笔记不存在: {note_id}")

    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    return _build_note_detail(note_id, file_path, content)


def create_note(data: NoteCreate) -> NoteDetail:
    """
    创建新笔记：
    1. 使用安全化后的标题作为 .md 文件名
    2. 若文件已存在，追加 8 位随机后缀避免覆盖
    3. 内容使用 frontmatter 存储标题，正文初始为空
    """
    safe_title = _sanitize_filename(data.title)
    file_path = _resolve_safe_path(NOTES_ROOT, f"{safe_title}.md")

    # 若文件已存在，追加随机后缀避免冲突
    if os.path.exists(file_path):
        suffix = uuid.uuid4().hex[:8]
        safe_title = f"{safe_title}_{suffix}"
        file_path = _resolve_safe_path(NOTES_ROOT, f"{safe_title}.md")

    # 初始内容为空，标题存于文件名，不在 md 文件中写入
    with open(file_path, "w", encoding="utf-8") as f:
        f.write("")

    return _build_note_detail(safe_title, file_path, "")


def update_note(note_id: str, data: NoteUpdate) -> NoteDetail:
    """
    更新笔记：
    - 所有写入统一使用 frontmatter 格式（旧格式笔记自动迁移）
    - 修改标题时同步重命名 .md 文件
    - 返回给前端的 content 不含 frontmatter
    """
    old_path = _resolve_safe_path(NOTES_ROOT, f"{note_id}.md")

    if not os.path.isfile(old_path):
        raise FileNotFoundError(f"笔记不存在: {note_id}")

    # 读取当前文件内容
    with open(old_path, "r", encoding="utf-8") as f:
        current_content = f.read()

    # ── 确定标题 ──────────────────────────────────────────
    # 若前端传了标题则使用，否则从现有文件中提取
    effective_title: str = (
        data.title
        if data.title is not None
        else _extract_title_from_content(current_content, note_id)
    )

    # ── 确定正文（去除 frontmatter 的纯净正文）────────────
    metadata, current_body = _parse_frontmatter(current_content)
    # 旧格式笔记（无 frontmatter）首次保存时，去掉正文中的 # 标题行
    # 注意：前端发回的 data.content 也可能包含旧格式标题行（首次 GET 时未剥离），
    # 因此新旧 body 都需处理，确保迁移后正文纯净
    if not metadata:
        if current_body.strip():
            current_body = _strip_first_heading(current_body)
        new_body_raw: str = data.content if data.content is not None else current_body
        if new_body_raw.strip():
            new_body_raw = _strip_first_heading(new_body_raw)
        new_body = new_body_raw
    else:
        new_body = data.content if data.content is not None else current_body

    # ── 拼接新文件内容（仅正文，不写 frontmatter）────────
    new_full_content: str = new_body

    # ── 判断是否需要重命名文件 ────────────────────────────
    new_id: str = note_id
    title_changed: bool = (
        data.title is not None
        and _sanitize_filename(data.title) != note_id
    )

    if title_changed:
        new_id = _sanitize_filename(data.title)
        new_path = _resolve_safe_path(NOTES_ROOT, f"{new_id}.md")

        # 仅大小写变化（大小写不敏感文件系统如 Windows / macOS）
        # new_path == old_path 说明底层文件系统认为它们是同一个文件
        # 不能直接"写新文件再删旧文件"，因为删的是刚写入的文件
        if new_path == old_path:
            # 通过临时文件名实现大小写重命名：old → tmp → NewCase
            tmp_name = f"{new_id}_{uuid.uuid4().hex[:8]}.md"
            tmp_path = _resolve_safe_path(NOTES_ROOT, tmp_name)
            with open(tmp_path, "w", encoding="utf-8") as f:
                f.write(new_full_content)
            os.remove(old_path)
            # 重要：删除旧文件后重新计算 new_path
            # 否则 Windows 上 realpath 会将其解析为已删除文件的旧大小写
            new_path = _resolve_safe_path(NOTES_ROOT, f"{new_id}.md")
            os.rename(tmp_path, new_path)
            file_path = new_path

        # 新路径已被其他文件占用 → 追加随机后缀避免冲突
        elif os.path.exists(new_path):
            suffix = uuid.uuid4().hex[:8]
            new_id = f"{new_id}_{suffix}"
            new_path = _resolve_safe_path(NOTES_ROOT, f"{new_id}.md")
            # 写入新文件，删除旧文件
            with open(new_path, "w", encoding="utf-8") as f:
                f.write(new_full_content)
            os.remove(old_path)
            file_path = new_path

        # 正常重命名（大小写敏感文件系统如 Linux）
        else:
            with open(new_path, "w", encoding="utf-8") as f:
                f.write(new_full_content)
            os.remove(old_path)
            file_path = new_path
    else:
        # 文件名未变 → 原地覆写
        with open(old_path, "w", encoding="utf-8") as f:
            f.write(new_full_content)
        file_path = old_path

    # 重命名导致 ID 变化 → 迁移置顶状态（new_id 此时已是最终值，含冲突后缀）
    if new_id != note_id:
        _move_pinned_id(note_id, new_id)

    return _build_note_detail(new_id, file_path, new_full_content)


# ═══════════════════════════════════════════════════════════
# 回收站操作
# ═══════════════════════════════════════════════════════════

def delete_note(note_id: str) -> None:
    """
    软删除：将笔记文件移入 notes/.recycle/ 目录。
    若回收站中已有同名文件，自动追加时间戳后缀防止覆盖。
    """
    file_path = _resolve_safe_path(NOTES_ROOT, f"{note_id}.md")

    if not os.path.isfile(file_path):
        raise FileNotFoundError(f"笔记不存在: {note_id}")

    # 确保回收站目录存在
    os.makedirs(RECYCLE_DIR, exist_ok=True)

    dest = os.path.join(RECYCLE_DIR, os.path.basename(file_path))

    # 回收站中已有同名文件 → 加时间戳
    if os.path.exists(dest):
        name, ext = os.path.splitext(os.path.basename(file_path))
        ts = datetime.now().strftime("%Y%m%d%H%M%S")
        dest = os.path.join(RECYCLE_DIR, f"{name}_{ts}{ext}")

    shutil.move(file_path, dest)

    # 记录删除时间：将回收站文件的修改时间重置为当前时间，
    # 使回收站列表的 updated_at 字段能准确反映"删除于"时间
    os.utime(dest)

    # 删除后清理置顶记录（笔记移入回收站，不再属于置顶）
    _remove_pinned_id(note_id)


def list_recycle() -> list[NoteSummary]:
    """列出回收站中的所有笔记文件"""
    notes: list[NoteSummary] = []

    if not os.path.isdir(RECYCLE_DIR):
        return notes

    for entry in sorted(os.listdir(RECYCLE_DIR)):
        if not entry.endswith(".md") or entry.startswith("."):
            continue
        file_path = os.path.join(RECYCLE_DIR, entry)
        if not os.path.isfile(file_path):
            continue
        notes.append(_build_note_summary(file_path))

    notes.sort(key=lambda n: n.updated_at, reverse=True)
    return notes


def get_recycle_note(note_id: str) -> NoteDetail:
    """
    获取回收站中某篇笔记的完整内容（供前端右侧只读预览）。
    与 get_note 对称，但读取目录为回收站，支持带时间戳后缀的文件名。
    """
    file_path = _find_in_recycle(note_id)

    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    # 以回收站中的实际文件名作为 id（可能带时间戳后缀）
    recycle_id = os.path.splitext(os.path.basename(file_path))[0]
    return _build_note_detail(recycle_id, file_path, content)


def restore_note(note_id: str) -> NoteDetail:
    """
    从回收站恢复笔记：
    1. 在回收站中查找匹配的文件（支持精确/模糊匹配）
    2. 移回笔记根目录，尽量恢复原始文件名
    """
    file_path = _find_in_recycle(note_id)

    # 目标文件名：优先使用原始 note_id
    dest_name = f"{_sanitize_filename(note_id)}.md"
    dest = os.path.join(NOTES_ROOT, dest_name)
    dest = _resolve_safe_path(NOTES_ROOT, dest_name)

    # 原位置已有文件 → 追加随机后缀
    if os.path.exists(dest):
        suffix = uuid.uuid4().hex[:8]
        dest_name = f"{_sanitize_filename(note_id)}_{suffix}.md"
        dest = _resolve_safe_path(NOTES_ROOT, dest_name)

    shutil.move(file_path, dest)

    # 恢复后重置修改时间为当前时间，
    # 避免笔记的"最后修改时间"残留为删除时间
    os.utime(dest)

    # 读取恢复后的笔记并返回
    new_id = os.path.splitext(os.path.basename(dest))[0]
    with open(dest, "r", encoding="utf-8") as f:
        content = f.read()
    return _build_note_detail(new_id, dest, content)


def permanent_delete(note_id: str) -> None:
    """
    从回收站中永久删除笔记文件。
    支持精确匹配和模糊匹配（处理带时间戳的文件名）。
    """
    file_path = _find_in_recycle(note_id)
    os.remove(file_path)
    # 防御性清理：确保彻底删除后不残留置顶记录
    _remove_pinned_id(note_id)


# ═══════════════════════════════════════════════════════════
# 文件导入 / 上传
# ═══════════════════════════════════════════════════════════

def import_markdown(file_content: bytes, original_filename: str) -> NoteDetail:
    """
    导入外部 .md 文件为笔记：
    1. 以原始文件名（去掉 .md 后缀）作为笔记 ID
    2. 解码文件内容（优先 UTF-8，失败则尝试 GBK）
    3. 自动规范化到 frontmatter 格式
    """
    # 从文件名提取基础名称
    base_name = os.path.splitext(original_filename)[0]
    safe_name = _sanitize_filename(base_name)

    # 若清理后为空，生成一个随机名
    if not safe_name:
        safe_name = f"imported_{uuid.uuid4().hex[:8]}"

    file_path = _resolve_safe_path(NOTES_ROOT, f"{safe_name}.md")

    # 避免覆盖已存在的笔记
    if os.path.exists(file_path):
        suffix = uuid.uuid4().hex[:8]
        safe_name = f"{safe_name}_{suffix}"
        file_path = _resolve_safe_path(NOTES_ROOT, f"{safe_name}.md")

    # 解码内容（尝试 UTF-8，失败回退 GBK）
    try:
        content = file_content.decode("utf-8")
    except UnicodeDecodeError:
        content = file_content.decode("gbk", errors="replace")

    # 规范化到 frontmatter 格式
    metadata, body = _parse_frontmatter(content)
    if metadata:
        # 已有 frontmatter → 保持不变
        final_content = content
    else:
        # 无 frontmatter → 提取标题并规范化
        title = _extract_title_from_content(content, base_name)
        body = _strip_first_heading(body)
        final_content = _build_frontmatter(title) + body

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(final_content)

    return _build_note_detail(safe_name, file_path, final_content)


def upload_image(file_content: bytes, original_filename: str) -> dict[str, str]:
    """
    上传图片到 assets/ 目录：
    1. 校验文件扩展名是否为允许的图片类型
    2. 使用 UUID 重命名防止冲突
    3. 返回可访问的相对路径

    Raises:
        ValueError: 文件类型不允许
    """
    # 校验扩展名
    _, ext = os.path.splitext(original_filename)
    ext_lower = ext.lower()
    if ext_lower not in _ALLOWED_IMAGE_EXTS:
        raise ValueError(
            f"不支持的图片格式：{ext}。"
            f"允许的格式：{', '.join(_ALLOWED_IMAGE_EXTS)}"
        )

    # 使用 UUID 生成唯一文件名，保留原始扩展名
    unique_name = f"{uuid.uuid4().hex}{ext_lower}"
    file_path = _resolve_safe_path(ASSETS_DIR, unique_name)

    # 确保 assets 目录存在
    os.makedirs(ASSETS_DIR, exist_ok=True)

    with open(file_path, "wb") as f:
        f.write(file_content)

    # 返回相对路径（供前端访问）
    return {
        "filename": unique_name,
        "original_name": original_filename,
        "path": f"/assets/{unique_name}",
        "url": f"/api/assets/{unique_name}",
    }


# ═══════════════════════════════════════════════════════════
# 孤儿图片清理
# ═══════════════════════════════════════════════════════════
# 背景：upload_image 只负责写入，不登记引用；删除笔记/删除图片时
# 也不清理 assets/。为避免磁盘空间被无用图片逐步占满，提供清理逻辑：
# 扫描全部笔记（含回收站）Markdown 中引用的 /api/assets/ 文件名，
# 删除 assets/ 下未被任何笔记引用的图片文件。

# 图片 URL 中文件名部分的正则（兼容绝对 URL 与相对路径）
_ASSET_URL_RE = re.compile(r"/api/assets/([A-Za-z0-9._-]+)")
# 兼容旧格式纯相对路径 /assets/<filename>（无 /api 前缀）
_LEGACY_ASSET_URL_RE = re.compile(r"/assets/([A-Za-z0-9._-]+)")


def _collect_referenced_asset_names() -> set[str]:
    """
    扫描所有笔记（笔记根目录 + 回收站）的 .md 原始内容，
    提取其中出现的图片文件名集合。

    回收站笔记也会被计入引用：回收站中的笔记仍可能被恢复，
    若提前删除了它引用的图片，恢复后图片将无法显示。

    Returns:
        被引用的 assets 文件名集合（不含目录前缀）
    """
    referenced: set[str] = set()

    # 依次扫描笔记根目录与回收站目录下的所有 .md 文件
    for directory in (NOTES_ROOT, RECYCLE_DIR):
        if not os.path.isdir(directory):
            continue
        for entry in os.listdir(directory):
            # 只处理 .md 文件，跳过隐藏文件与子目录
            if not entry.endswith(".md") or entry.startswith("."):
                continue
            file_path = os.path.join(directory, entry)
            if not os.path.isfile(file_path):
                continue
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    content = f.read()
            except (OSError, UnicodeDecodeError):
                # 单个文件读取失败不影响整体清理，跳过该文件
                print(f"[Cleanup] 读取笔记失败，跳过: {entry}")
                continue
            # 两种路径格式都收集（集合天然去重）
            referenced.update(_ASSET_URL_RE.findall(content))
            referenced.update(_LEGACY_ASSET_URL_RE.findall(content))

    return referenced


def cleanup_orphan_images() -> dict[str, object]:
    """
    清理 assets/ 下未被任何笔记引用的孤儿图片。

    触发时机：
    1. 服务启动时自动执行一次（见 main.py startup）
    2. 手动调用 POST /api/images/cleanup

    Returns:
        {
            "message": str,
            "total_images": assets 目录中的图片总数,
            "deleted_images": 本次删除的孤儿图片数,
            "referenced_images": 仍被引用的图片数,
            "deleted_files": 被删除的图片文件名列表,
        }
    """
    referenced: set[str] = _collect_referenced_asset_names()
    all_assets: list[str] = []
    deleted: list[str] = []

    if os.path.isdir(ASSETS_DIR):
        for entry in os.listdir(ASSETS_DIR):
            # 只处理文件，跳过隐藏文件与子目录
            if entry.startswith("."):
                continue
            file_path = os.path.join(ASSETS_DIR, entry)
            if not os.path.isfile(file_path):
                continue
            all_assets.append(entry)
            # 未被任何笔记引用 → 删除
            if entry not in referenced:
                try:
                    # 沿用路径安全校验（虽然文件名来自 listdir，但保持一致防御）
                    resolved = _resolve_safe_path(ASSETS_DIR, entry)
                    os.remove(resolved)
                    deleted.append(entry)
                except OSError as e:
                    # 单个文件删除失败不中断整体清理
                    print(f"[Cleanup] 删除图片失败 {entry}: {e}")

    return {
        "message": "孤儿图片清理完成",
        "total_images": len(all_assets),
        "deleted_images": len(deleted),
        "referenced_images": len(set(all_assets) & referenced),
        "deleted_files": deleted,
    }
