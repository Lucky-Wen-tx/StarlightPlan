"""
拾光Plan — FastAPI 应用入口
- 注册所有 /api 接口路由
- 统一错误处理（HTTPException）
- 启动时初始化目录结构
- 通过 uvicorn 启动服务
"""
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from config import NOTES_ROOT, ASSETS_DIR, PORT, HOST, init_directories
from schemas import NoteCreate, NoteUpdate
from services import note_service

# ── 应用实例 ──────────────────────────────────────────────
app = FastAPI(
    title="拾光Plan API",
    description="拾光Plan 笔记后端服务 MVP",
    version="1.0.0",
)

# ── CORS 中间件（允许前端 localhost:3000 跨域请求）────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── 启动事件 ──────────────────────────────────────────────
@app.on_event("startup")
async def startup() -> None:
    """应用启动时初始化目录结构，并清理一次未被引用的孤儿图片"""
    init_directories()
    result = note_service.cleanup_orphan_images()
    if result["deleted_images"] > 0:
        print(f"🧹 启动清理孤儿图片: 删除 {result['deleted_images']} 张")


# ═══════════════════════════════════════════════════════════
# 静态资源（图片访问）
# ═══════════════════════════════════════════════════════════

# 将 assets 目录挂载为静态文件服务，前端可通过 /api/assets/xxx 访问上传的图片
app.mount("/api/assets", StaticFiles(directory=ASSETS_DIR), name="assets")


# ═══════════════════════════════════════════════════════════
# 笔记 CRUD 接口
# ═══════════════════════════════════════════════════════════

@app.get("/api/notes", response_model=list)
async def list_notes():
    """获取所有笔记的摘要列表（按修改时间倒序）"""
    try:
        return note_service.list_notes()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取笔记列表失败: {e}")


@app.get("/api/notes/{note_id}")
async def get_note(note_id: str):
    """获取单篇笔记的完整内容"""
    try:
        return note_service.get_note(note_id)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))


@app.post("/api/notes", status_code=201)
async def create_note(data: NoteCreate):
    """创建一篇新笔记（以标题作为文件名）"""
    try:
        return note_service.create_note(data)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))


@app.put("/api/notes/{note_id}")
async def update_note(note_id: str, data: NoteUpdate):
    """
    更新笔记：
    - 可单独修改内容，或同时修改标题和内容
    - 修改标题时会同步更新文件内的一级标题并重命名文件
    """
    try:
        return note_service.update_note(note_id, data)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))


@app.delete("/api/notes/{note_id}")
async def delete_note(note_id: str):
    """删除笔记（移入回收站，可恢复）"""
    try:
        note_service.delete_note(note_id)
        return {"message": "笔记已移入回收站", "note_id": note_id}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))


@app.put("/api/notes/{note_id}/pin")
async def pin_note(note_id: str):
    """置顶一篇笔记（幂等）"""
    try:
        return note_service.set_note_pinned(note_id, True)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))


@app.delete("/api/notes/{note_id}/pin")
async def unpin_note(note_id: str):
    """取消置顶一篇笔记（幂等）"""
    try:
        return note_service.set_note_pinned(note_id, False)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))


# ═══════════════════════════════════════════════════════════
# 回收站接口
# ═══════════════════════════════════════════════════════════

@app.get("/api/recycle")
async def list_recycle():
    """列出回收站中的所有笔记"""
    try:
        return note_service.list_recycle()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取回收站列表失败: {e}")


@app.get("/api/recycle/{note_id}")
async def get_recycle_note(note_id: str):
    """获取回收站中某篇笔记的完整内容（用于右侧只读预览）"""
    try:
        return note_service.get_recycle_note(note_id)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))


@app.post("/api/recycle/{note_id}/restore")
async def restore_note(note_id: str):
    """从回收站恢复指定笔记"""
    try:
        return note_service.restore_note(note_id)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))


@app.delete("/api/recycle/{note_id}")
async def permanent_delete_note(note_id: str):
    """从回收站永久删除笔记（不可恢复）"""
    try:
        note_service.permanent_delete(note_id)
        return {"message": "笔记已永久删除", "note_id": note_id}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))


# ═══════════════════════════════════════════════════════════
# 文件导入 / 上传接口
# ═══════════════════════════════════════════════════════════

@app.post("/api/notes/import", status_code=201)
async def import_markdown(file: UploadFile = File(...)):
    """导入外部 .md 文件为新笔记"""
    # 校验文件类型
    if not file.filename or not file.filename.lower().endswith(".md"):
        raise HTTPException(
            status_code=400,
            detail="仅支持 .md 格式的 Markdown 文件",
        )

    try:
        content = await file.read()
        return note_service.import_markdown(content, file.filename)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"导入失败: {e}")


@app.post("/api/images/upload", status_code=201)
async def upload_image(file: UploadFile = File(...)):
    """上传图片到资源目录"""
    try:
        content = await file.read()
        result = note_service.upload_image(content, file.filename or "image")
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"上传失败: {e}")


@app.post("/api/images/cleanup")
async def cleanup_images():
    """
    手动清理未被任何笔记引用的孤儿图片。
    服务启动时也会自动执行一次，此接口供按需手动触发。
    """
    try:
        return note_service.cleanup_orphan_images()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"清理失败: {e}")


# ═══════════════════════════════════════════════════════════
# 启动入口
# ═══════════════════════════════════════════════════════════

if __name__ == "__main__":
    import uvicorn

    # 启动前确保目录结构就绪
    init_directories()
    print(f"📝 笔记根目录: {NOTES_ROOT}")
    print(f"🗑️  回收站目录: {NOTES_ROOT}/.recycle")
    print(f"🖼️  资源目录: {ASSETS_DIR}")
    print(f"🚀 服务启动中...")
    print(f"   本地访问: http://127.0.0.1:{PORT}")
    print(f"   API 文档: http://127.0.0.1:{PORT}/docs")
    print()

    uvicorn.run(
        "main:app",
        host=HOST,
        port=PORT,
        reload=False,  # 生产模式；开发调试时可改为 True
    )
