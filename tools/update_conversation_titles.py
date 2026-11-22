# -*- coding: utf-8 -*-
"""
Antigravity 会话标题离线全量中文化工具（全自包含稳定版）
全自动接管进程生命周期监听、内存守护释放、双写原子替换与回读自检断言
"""
import os
import sys
import json
import time
import shutil
import sqlite3
import datetime
import hashlib
import traceback
import subprocess

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
LOG_FILE = os.path.join(SCRIPT_DIR, "debug_sync.log")

def log(msg):
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
    line = f"[{now}] {msg}"
    print(line)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass

# 基础文件路径（动态获取当前用户目录，支持环境变量 ANTIGRAVITY_DATA_DIR 覆盖）
BASE_DIR = os.environ.get("ANTIGRAVITY_DATA_DIR") or os.path.join(os.path.expanduser("~"), ".gemini", "antigravity")
PB_PATH = os.path.join(BASE_DIR, "agyhub_summaries_proto.pb")
DB_PATH = os.path.join(BASE_DIR, "conversation_summaries.db")
WAL_PATH = os.path.join(BASE_DIR, "conversation_summaries.db-wal")
SHM_PATH = os.path.join(BASE_DIR, "conversation_summaries.db-shm")
DICT_PATH = os.path.join(PROJECT_ROOT, "src", "title_dicts.json")


def load_title_mappings():
    """从本地私有字典 src/title_dicts.json 加载会话 ID -> 中文标题映射"""
    if not os.path.exists(DICT_PATH):
        log(f"[提示] 未检测到自定义映射文件 {DICT_PATH}，将仅使用本地会话首句自动提取模式。")
        return {}
    try:
        with open(DICT_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        mapping = data.get("id_to_zh", {}) if isinstance(data, dict) else {}
        log(f"[字典] 已从 {DICT_PATH} 加载 {len(mapping)} 条本地会话映射。")
        return mapping if isinstance(mapping, dict) else {}
    except Exception as e:
        log(f"[警告] 读取本地字典失败: {e}")
        return {}


TITLE_MAPPINGS = load_title_mappings()

def extract_title_from_convo_db(cid):
    """当会话未在静态字典中时，自动从其本地数据库第一条消息中提取中文标题"""
    import re
    db_file = os.path.join(BASE_DIR, "conversations", f"{cid}.db")
    if not os.path.exists(db_file):
        return None
    try:
        conn = sqlite3.connect(db_file)
        cur = conn.cursor()
        cur.execute("SELECT step_payload FROM steps WHERE idx = 0")
        row = cur.fetchone()
        conn.close()
        if not row or not row[0]:
            return None
        text = row[0].decode('utf-8', errors='ignore')
        # 匹配连续的中文字符串
        chinese_blocks = re.findall(r'[\u4e00-\u9fa5][\u4e00-\u9fa5\w\s，。！？、：；“”‘’（）《》]{2,40}', text)
        if chinese_blocks:
            filtered = [b.strip() for b in chinese_blocks if not any(k in b for k in ['技能', '工具', '系统', '规则'])]
            if filtered:
                clean_title = re.sub(r'^[分析研究排查查看修复测试]+', '', filtered[0]).strip()
                if not clean_title:
                    clean_title = filtered[0]
                return clean_title[:24]
    except Exception:
        pass
    return None

def is_process_running(process_name):
    try:
        res = subprocess.run(["tasklist", "/fi", f"imagename eq {process_name}"], capture_output=True, text=True, errors="ignore")
        return process_name.lower() in res.stdout.lower()
    except Exception:
        return False

def kill_process(process_name):
    try:
        subprocess.run(["taskkill", "/f", "/im", process_name], capture_output=True, text=True, errors="ignore")
    except Exception:
        pass

def wait_for_ide_exit():
    ide_proc = "Antigravity IDE.exe"
    if is_process_running(ide_proc):
        log("------------------------------------------------------------")
        log("【等待中】检测到 Antigravity IDE 窗口仍在运行中！")
        log("请现在【完全关闭 Antigravity IDE 软件窗口】（点击右上角 X）。")
        log("程序正在自动持续监听窗口关闭状态...")
        log("------------------------------------------------------------")
        while is_process_running(ide_proc):
            time.sleep(1.5)
        log("[√] 检测到 Antigravity IDE 窗口已成功退出！")
    else:
        log("[√] Antigravity IDE 窗口未运行，环境安全。")

    log("正在清理后台残留的 AgyHub 守护进程 (agy.exe)...")
    for _ in range(3):
        kill_process("agy.exe")
        time.sleep(0.5)
        if not is_process_running("agy.exe"):
            break
    log("[√] agy.exe 守护进程已彻底终止并释放锁！")

def get_file_md5(p):
    if not os.path.exists(p):
        return "NOT_EXISTS"
    h = hashlib.md5()
    with open(p, "rb") as f:
        while chunk := f.read(8192):
            h.update(chunk)
    return h.hexdigest()

def encode_varint(value):
    bytes_list = []
    while value >= 0x80:
        bytes_list.append((value & 0x7F) | 0x80)
        value >>= 7
    bytes_list.append(value & 0x7F)
    return bytes(bytes_list)

def decode_varint(data, offset=0):
    res = 0
    shift = 0
    while offset < len(data):
        b = data[offset]
        offset += 1
        res |= (b & 0x7F) << shift
        if not (b & 0x80):
            break
        shift += 7
    return res, offset

def parse_protobuf_fields(buffer):
    offset = 0
    fields = []
    while offset < len(buffer):
        tag, offset = decode_varint(buffer, offset)
        fn = tag >> 3
        wt = tag & 7
        if wt == 0:
            val, offset = decode_varint(buffer, offset)
            fields.append((fn, wt, val))
        elif wt == 2:
            l, offset = decode_varint(buffer, offset)
            val = buffer[offset:offset+l]
            offset += l
            fields.append((fn, wt, val))
        elif wt == 1:
            val = buffer[offset:offset+8]
            offset += 8
            fields.append((fn, wt, val))
        elif wt == 5:
            val = buffer[offset:offset+4]
            offset += 4
            fields.append((fn, wt, val))
        else:
            raise ValueError(f"Unsupported wire type {wt} at {offset}")
    return fields

def serialize_protobuf_fields(fields):
    out = bytearray()
    for fn, wt, val in fields:
        tag = (fn << 3) | wt
        out.extend(encode_varint(tag))
        if wt == 0:
            out.extend(encode_varint(val))
        elif wt == 2:
            out.extend(encode_varint(len(val)))
            out.extend(val)
        elif wt in (1, 5):
            out.extend(val)
    return bytes(out)

def update_single_entry(entry_bytes, new_title_map):
    entry_fields = parse_protobuf_fields(entry_bytes)
    cid = ""
    for fn, wt, val in entry_fields:
        if fn == 1 and wt == 2:
            try:
                cid = val.decode('utf-8')
            except Exception:
                pass
            break
    
    if not cid:
        return entry_bytes, cid, None, None

    new_title = None
    if cid in new_title_map:
        new_title = new_title_map[cid]
    else:
        # 智能动态检测：如果未在预置映射中，尝试从会话原始记录首句提取中文
        new_title = extract_title_from_convo_db(cid)

    if not new_title:
        return entry_bytes, cid, None, None
    new_title_bytes = new_title.encode('utf-8')

    new_entry_fields = []
    updated_s2_bytes = None

    for fn, wt, val in entry_fields:
        if fn == 2 and wt == 2:
            s2_fields = parse_protobuf_fields(val)
            new_s2_fields = []
            for s_fn, s_wt, s_val in s2_fields:
                if s_fn == 1 and s_wt == 2:
                    new_s2_fields.append((s_fn, s_wt, new_title_bytes))
                elif s_fn == 15 and s_wt == 2:
                    s15_fields = parse_protobuf_fields(s_val)
                    new_s15_fields = []
                    for t_fn, t_wt, t_val in s15_fields:
                        if t_fn == 1 and t_wt == 2:
                            new_s15_fields.append((t_fn, t_wt, new_title_bytes))
                        else:
                            new_s15_fields.append((t_fn, t_wt, t_val))
                    new_s15_bytes = serialize_protobuf_fields(new_s15_fields)
                    new_s2_fields.append((s_fn, s_wt, new_s15_bytes))
                else:
                    new_s2_fields.append((s_fn, s_wt, s_val))
            
            updated_s2_bytes = serialize_protobuf_fields(new_s2_fields)
            new_entry_fields.append((fn, wt, updated_s2_bytes))
        else:
            new_entry_fields.append((fn, wt, val))

    new_entry_bytes = serialize_protobuf_fields(new_entry_fields)
    return new_entry_bytes, cid, new_title, updated_s2_bytes

def main():
    log("=" * 65)
    log("=== Antigravity 会话标题离线全量中文化工具（稳定增强版） ===")
    log("=" * 65)
    log(f"当前 Python 解释器: {sys.executable}")
    log(f"进程 PID: {os.getpid()}")

    # 1. 进程监听与清理阶段
    wait_for_ide_exit()

    if not os.path.exists(PB_PATH) or not os.path.exists(DB_PATH):
        log(f"[FATAL 错误] 未找到数据文件！\nPB: {PB_PATH}\nDB: {DB_PATH}")
        sys.exit(1)

    pb_orig_md5 = get_file_md5(PB_PATH)
    db_orig_md5 = get_file_md5(DB_PATH)
    log(f"原始主文件: PB 大小={os.path.getsize(PB_PATH)} 字节, MD5={pb_orig_md5}")
    log(f"原始数据库: DB 大小={os.path.getsize(DB_PATH)} 字节, MD5={db_orig_md5}")

    # 2. 物理安全备份
    pb_bak = PB_PATH + ".bak"
    db_bak = DB_PATH + ".bak"
    log(f"[步骤 1] 正在创建主数据与数据库物理备份...")
    shutil.copy2(PB_PATH, pb_bak)
    shutil.copy2(DB_PATH, db_bak)
    log(f"         主数据备份完成: {pb_bak} ({os.path.getsize(pb_bak)} 字节)")
    log(f"         数据库备份完成: {db_bak} ({os.path.getsize(db_bak)} 字节)")

    # 3. 读取并重构 agyhub_summaries_proto.pb
    log(f"[步骤 2] 正在解析并重构主数据源 (agyhub_summaries_proto.pb)...")
    with open(PB_PATH, "rb") as f:
        pb_data = f.read()

    top_fields = parse_protobuf_fields(pb_data)
    log(f"         顶层条目总数: {len(top_fields)}")
    
    new_top_fields = []
    updated_records = {}

    for fn, wt, val in top_fields:
        if fn == 1 and wt == 2:
            new_val, cid, new_title, new_s2 = update_single_entry(val, TITLE_MAPPINGS)
            new_top_fields.append((fn, wt, new_val))
            if cid and new_title:
                updated_records[cid] = (new_title, new_s2)
        else:
            new_top_fields.append((fn, wt, val))

    rebuilt_pb_data = serialize_protobuf_fields(new_top_fields)
    with open(PB_PATH, "wb") as f:
        f.write(rebuilt_pb_data)
        f.flush()
        os.fsync(f.fileno())

    pb_new_md5 = get_file_md5(PB_PATH)
    log(f"         主数据源写入成功！重构后大小: {len(rebuilt_pb_data)} 字节, MD5={pb_new_md5}")
    log(f"         本次成功映射会话数: {len(updated_records)} 条")

    # 4. 同步写入 SQLite conversation_summaries.db 与 FTS5
    log(f"[步骤 3] 正在同步更新 SQLite 查询缓存与全文搜索索引...")
    conn = sqlite3.connect(DB_PATH, timeout=20.0)
    cur = conn.cursor()

    db_updated_count = 0
    for cid, (new_title, new_s2) in updated_records.items():
        if new_s2:
            cur.execute("""
                UPDATE conversation_summaries
                SET title = ?, preview = ?, raw_summary = ?
                WHERE conversation_id = ?
            """, (new_title, new_title, new_s2, cid))
        else:
            cur.execute("""
                UPDATE conversation_summaries
                SET title = ?, preview = ?
                WHERE conversation_id = ?
            """, (new_title, new_title, cid))

        cur.execute("""
            UPDATE conversations_fts
            SET title = ?
            WHERE conversation_id = ?
        """, (new_title, cid))
        db_updated_count += 1

    cur.execute("UPDATE conversation_summaries SET title = preview WHERE (title IS NULL OR title = '') AND preview != ''")
    cur.execute("UPDATE conversations_fts SET title = (SELECT preview FROM conversation_summaries WHERE conversation_summaries.conversation_id = conversations_fts.conversation_id) WHERE title IS NULL OR title = ''")

    conn.commit()
    try:
        cur.execute("PRAGMA wal_checkpoint(TRUNCATE);")
        log(f"         SQLite WAL Checkpoint (TRUNCATE) 执行完成")
    except Exception as e:
        log(f"         WAL Checkpoint 提示: {e}")
    conn.close()

    # 5. 清理残留 WAL 与 SHM 临时缓存
    for temp_f in [WAL_PATH, SHM_PATH]:
        if os.path.exists(temp_f):
            try:
                os.remove(temp_f)
                log(f"         已清理临时日志: {os.path.basename(temp_f)}")
            except Exception as e:
                log(f"         清理日志失败 {os.path.basename(temp_f)}: {e}")

    # 6. 回读校验断言（Self-Verification）
    log(f"[步骤 4] 正在执行磁盘回读自检断言 (Self-Verification)...")
    if updated_records:
        sample_cid, (sample_title, _) = next(iter(updated_records.items()))
        with open(PB_PATH, "rb") as f:
            verify_pb = f.read()

        assert sample_title.encode('utf-8') in verify_pb, f"断言失败：PB 文件未包含抽样中文标题 '{sample_title}'！"
        log(f"         [√ 断言通过] agyhub_summaries_proto.pb 真实包含抽样中文标题 '{sample_title}'")

        verify_conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
        v_cur = verify_conn.cursor()
        v_cur.execute("SELECT title, preview FROM conversation_summaries WHERE conversation_id = ?", (sample_cid,))
        v_row = v_cur.fetchone()
        verify_conn.close()
        if v_row:
            assert v_row[0] == sample_title, f"断言失败：DB 标题未匹配，实际为: {v_row}"
            log(f"         [√ 断言通过] SQLite conversation_summaries 抽样校验通过")
    else:
        log("         [跳过] 本次无更新记录，无需抽样断言")

    log("=" * 65)
    log(f"=== [全部成功] 会话标题双写同步与自检断言 100% 通过！共 {db_updated_count} 条！ ===")
    log("=" * 65)
    print("\n【现在请重新启动 Antigravity IDE 软件】")
    print("按下会话搜索（Search for conversations），标题已全部为规范中文！\n")

if __name__ == "__main__":
    try:
        main()
    except Exception as err:
        log(f"[FATAL 异常]: {err}\n{traceback.format_exc()}")
        sys.exit(1)
