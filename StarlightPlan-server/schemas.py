"""
Pydantic v2 数据模型定义
- NoteCreate  ：创建笔记请求，包含标题合法性校验
- NoteUpdate  ：更新笔记请求，所有字段可选
- NoteSummary ：笔记列表项响应（不含正文内容）
- NoteDetail  ：笔记详情响应（含完整正文内容）
"""
import re
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

# ── 常量 ──────────────────────────────────────────────────
# Windows 文件名非法字符正则（< > : " / \ | ? *）
_WINDOWS_ILLEGAL_RE = re.compile(r'[<>:"/\\|?*]')

# 标题最大长度
_TITLE_MAX_LENGTH = 200


# ═══════════════════════════════════════════════════════════
# 请求模型
# ═══════════════════════════════════════════════════════════

class NoteCreate(BaseModel):
    """创建笔记请求体 —— 只需要标题，内容默认为空"""
    title: str = Field(
        ...,
        min_length=1,
        max_length=_TITLE_MAX_LENGTH,
        description="笔记标题，将作为 .md 文件名（不含扩展名）",
        examples=["我的第一篇笔记"],
    )

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: str) -> str:
        """
        标题合法性校验：
        1. 去除首尾空白后不能为空
        2. 不能包含 Windows 非法文件名字符：< > : " / \\ | ? *
        3. 不能以 . 开头（避免创建隐藏文件）
        """
        stripped = v.strip()
        if not stripped:
            raise ValueError("标题不能为空或仅包含空白字符")
        if _WINDOWS_ILLEGAL_RE.search(stripped):
            raise ValueError(
                f"标题不能包含以下字符：< > : \" / \\ | ? *"
            )
        if stripped.startswith("."):
            raise ValueError("标题不能以 . 开头")
        return stripped


class NoteUpdate(BaseModel):
    """更新笔记请求体 —— 标题和内容均为可选，至少传一个"""
    title: str | None = Field(
        None,
        min_length=1,
        max_length=_TITLE_MAX_LENGTH,
        description="新的笔记标题（可选），修改后会同步更新文件内的一级标题",
    )
    content: str | None = Field(
        None,
        description="新的笔记正文内容（可选），会完整覆盖旧内容",
    )

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: str | None) -> str | None:
        """校验规则与 NoteCreate 一致"""
        if v is None:
            return v
        stripped = v.strip()
        if not stripped:
            raise ValueError("标题不能为空或仅包含空白字符")
        if _WINDOWS_ILLEGAL_RE.search(stripped):
            raise ValueError(
                f"标题不能包含以下字符：< > : \" / \\ | ? *"
            )
        if stripped.startswith("."):
            raise ValueError("标题不能以 . 开头")
        return stripped


# ═══════════════════════════════════════════════════════════
# 响应模型
# ═══════════════════════════════════════════════════════════

class NoteSummary(BaseModel):
    """笔记列表项 —— 摘要信息，不含正文"""
    id: str = Field(description="笔记唯一标识（即文件名去除 .md 后缀）")
    title: str = Field(description="笔记显示标题（取自文件内一级标题或文件名）")
    created_at: datetime = Field(description="文件创建时间")
    updated_at: datetime = Field(description="文件最后修改时间")
    is_pinned: bool = Field(default=False, description="是否置顶（置顶笔记在侧边栏置顶区展示）")


class NoteDetail(NoteSummary):
    """笔记详情 —— 包含完整正文内容"""
    content: str = Field(description="笔记完整 Markdown 正文")
