#!/usr/bin/env python3
import os
import sys
import json
import shutil
import datetime
import argparse
import subprocess
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

BACKUP_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKUP_DIR.parent

current_task = {
    "status": "idle",
    "operation": None,
    "started_at": None,
    "finished_at": None,
    "exit_code": None,
    "logs": []
}

def load_default_env():
    defaults = {"uri": "", "db": "novaroom"}
    env_paths = [BACKUP_DIR / ".env", PROJECT_ROOT / "deploy" / ".env", PROJECT_ROOT / ".env"]
    for p in env_paths:
        if p.exists():
            try:
                for line in p.read_text(encoding="utf-8").splitlines():
                    line = line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    k, v = line.split("=", 1)
                    k = k.strip()
                    v = v.strip().strip("'\"")
                    if k in ("MONGO_DB", "MONGO_URI") and not defaults["uri"]:
                        defaults["uri"] = v
                    elif k in ("MONGO_DB_NAME", "DB_NAME"):
                        defaults["db"] = v
            except Exception:
                pass
    return defaults

def list_backups():
    results = []
    for item in sorted(BACKUP_DIR.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
        if not item.is_dir() or item.name.startswith((".", "_")) or item.name in ("templates", "static"):
            continue
        bson_files = list(item.glob("*.bson")) + list(item.glob("*/*.bson"))
        if not bson_files:
            continue
        total_size = sum(f.stat().st_size for f in bson_files)
        collections = [f.stem for f in bson_files if not f.stem.endswith(".metadata")]
        collections = sorted(list(set(collections)))
        mtime = datetime.datetime.fromtimestamp(item.stat().st_mtime).strftime("%Y-%m-%d %H:%M:%S")
        results.append({
            "name": item.name,
            "created_at": mtime,
            "size_bytes": total_size,
            "size_human": f"{total_size / (1024 * 1024):.2f} MB" if total_size > 1024 * 1024 else f"{total_size / 1024:.1f} KB",
            "collections_count": len(collections),
            "collections": collections
        })
    return results

def run_backup_task(uri: str, db_name: str, custom_name: str = ""):
    global current_task
    current_task["status"] = "running"
    current_task["operation"] = "backup"
    current_task["started_at"] = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    current_task["finished_at"] = None
    current_task["exit_code"] = None
    current_task["logs"] = []

    if not custom_name:
        custom_name = f"{db_name}_backup_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}"
    
    safe_name = "".join(c for c in custom_name if c.isalnum() or c in ("-", "_"))
    target_folder = BACKUP_DIR / safe_name
    temp_out = BACKUP_DIR / f".tmp_{safe_name}"

    current_task["logs"].append(f"[*] Starting backup from DB: '{db_name}'")
    current_task["logs"].append(f"[*] Target folder: {safe_name}")

    cmd = [
        "mongodump",
        f"--uri={uri}",
        f"--db={db_name}",
        f"--out={temp_out}"
    ]

    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1
        )

        for line in iter(proc.stdout.readline, ""):
            line_clean = line.rstrip()
            if line_clean:
                current_task["logs"].append(line_clean)
        
        proc.wait()
        current_task["exit_code"] = proc.returncode

        if proc.returncode == 0:
            dump_inner = temp_out / db_name
            if dump_inner.exists() and dump_inner.is_dir():
                if target_folder.exists():
                    shutil.rmtree(target_folder)
                shutil.move(str(dump_inner), str(target_folder))
            else:
                if target_folder.exists():
                    shutil.rmtree(target_folder)
                shutil.move(str(temp_out), str(target_folder))

            current_task["status"] = "success"
            current_task["logs"].append(f"[✓] Backup completed successfully! Saved to: {safe_name}")
        else:
            current_task["status"] = "failed"
            current_task["logs"].append(f"[!] Backup failed with exit code: {proc.returncode}")
    except Exception as e:
        current_task["status"] = "failed"
        current_task["logs"].append(f"[!] Error: {str(e)}")
    finally:
        if temp_out.exists():
            shutil.rmtree(temp_out, ignore_errors=True)
        current_task["finished_at"] = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

def run_restore_task(backup_name: str, target_uri: str, target_db: str, drop: bool = True):
    global current_task
    current_task["status"] = "running"
    current_task["operation"] = "restore"
    current_task["started_at"] = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    current_task["finished_at"] = None
    current_task["exit_code"] = None
    current_task["logs"] = []

    src_dir = BACKUP_DIR / backup_name
    if not src_dir.exists():
        current_task["status"] = "failed"
        current_task["logs"].append(f"[!] Backup folder not found: {backup_name}")
        current_task["finished_at"] = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        return

    sub_dirs = [d for d in src_dir.iterdir() if d.is_dir()]
    restore_path = sub_dirs[0] if len(sub_dirs) == 1 and list(sub_dirs[0].glob("*.bson")) else src_dir

    current_task["logs"].append(f"[*] Starting restore from backup: '{backup_name}'")
    current_task["logs"].append(f"[*] Target DB: '{target_db}' (Drop existing: {drop})")

    cmd = [
        "mongorestore",
        f"--uri={target_uri}",
        f"--db={target_db}"
    ]
    if drop:
        cmd.append("--drop")
    cmd.append(str(restore_path))

    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1
        )

        for line in iter(proc.stdout.readline, ""):
            line_clean = line.rstrip()
            if line_clean:
                current_task["logs"].append(line_clean)
        
        proc.wait()
        current_task["exit_code"] = proc.returncode

        if proc.returncode == 0:
            current_task["status"] = "success"
            current_task["logs"].append(f"[✓] Restore completed successfully into '{target_db}'!")
        else:
            current_task["status"] = "failed"
            current_task["logs"].append(f"[!] Restore failed with exit code: {proc.returncode}")
    except Exception as e:
        current_task["status"] = "failed"
        current_task["logs"].append(f"[!] Error: {str(e)}")
    finally:
        current_task["finished_at"] = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")


HTML_PAGE = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MongoDB Helper - Backup & Restore</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        body { background-color: #0d1117; color: #c9d1d9; }
        .card { background-color: #161b22; border: 1px solid #30363d; border-radius: 0.75rem; }
        .input-box { background-color: #0d1117; border: 1px solid #30363d; color: #f0f6fc; border-radius: 0.5rem; }
        .input-box:focus { border-color: #58a6ff; outline: none; }
        pre::-webkit-scrollbar { width: 8px; height: 8px; }
        pre::-webkit-scrollbar-track { background: #0d1117; }
        pre::-webkit-scrollbar-thumb { background: #30363d; border-radius: 4px; }
    </style>
</head>
<body class="min-h-screen flex flex-col font-sans">
    <header class="border-b border-[#30363d] bg-[#161b22]/90 backdrop-blur sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
        <div class="flex items-center space-x-3">
            <div class="w-10 h-10 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xl font-bold">
                <i class="fa-solid fa-database"></i>
            </div>
            <div>
                <h1 class="text-lg font-bold text-white flex items-center gap-2">
                    MongoDB Helper
                    <span class="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30">NovaRoom</span>
                </h1>
                <p class="text-xs text-gray-400">Easy Database Backup & Migration Utility</p>
            </div>
        </div>
        <div class="flex items-center gap-3" id="tool-status">
            <span class="text-xs px-2.5 py-1 rounded bg-[#21262d] border border-[#30363d] text-gray-400">
                <i class="fa-solid fa-spinner fa-spin mr-1"></i> Checking tools...
            </span>
        </div>
    </header>

    <main class="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        <!-- Live Status Alert -->
        <div id="task-banner" class="hidden p-4 rounded-lg border text-sm flex items-center justify-between">
            <div class="flex items-center gap-3">
                <div id="task-spinner" class="animate-spin text-lg"><i class="fa-solid fa-circle-notch"></i></div>
                <div>
                    <span id="task-title" class="font-bold">Operation Running</span>
                    <span id="task-desc" class="text-gray-400 ml-2">Please wait...</span>
                </div>
            </div>
            <button onclick="scrollToLogs()" class="text-xs px-3 py-1 rounded bg-[#30363d] hover:bg-[#484f58] text-white">View Console</button>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <!-- Backup Card -->
            <div class="card p-6 flex flex-col justify-between">
                <div>
                    <div class="flex items-center gap-2 text-emerald-400 font-semibold mb-4 text-base">
                        <i class="fa-solid fa-cloud-arrow-down"></i>
                        <span>1. Backup Database</span>
                    </div>
                    <p class="text-xs text-gray-400 mb-4">Export collections from a live MongoDB instance directly to the backup folder.</p>
                    
                    <div class="space-y-4">
                        <div>
                            <label class="block text-xs font-medium text-gray-300 mb-1">Source MongoDB URI</label>
                            <input type="text" id="backup-uri" class="w-full px-3 py-2 text-xs input-box font-mono" placeholder="mongodb+srv://user:pass@cluster.mongodb.net/...">
                        </div>
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="block text-xs font-medium text-gray-300 mb-1">Database Name</label>
                                <input type="text" id="backup-db" class="w-full px-3 py-2 text-xs input-box" placeholder="novaroom" value="novaroom">
                            </div>
                            <div>
                                <label class="block text-xs font-medium text-gray-300 mb-1">Custom Tag / Name (Optional)</label>
                                <input type="text" id="backup-name" class="w-full px-3 py-2 text-xs input-box" placeholder="Auto timestamp if empty">
                            </div>
                        </div>
                    </div>
                </div>

                <div class="mt-6 pt-4 border-t border-[#30363d] flex justify-end">
                    <button id="btn-backup" onclick="startBackup()" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold flex items-center gap-2 shadow">
                        <i class="fa-solid fa-download"></i> Start Backup
                    </button>
                </div>
            </div>

            <!-- Restore Card -->
            <div class="card p-6 flex flex-col justify-between">
                <div>
                    <div class="flex items-center gap-2 text-blue-400 font-semibold mb-4 text-base">
                        <i class="fa-solid fa-cloud-arrow-up"></i>
                        <span>2. Restore / Migrate Database</span>
                    </div>
                    <p class="text-xs text-gray-400 mb-4">Select an existing backup and restore it into any local or remote MongoDB database.</p>
                    
                    <div class="space-y-4">
                        <div>
                            <label class="block text-xs font-medium text-gray-300 mb-1">Choose Backup File / Folder</label>
                            <select id="restore-backup" class="w-full px-3 py-2 text-xs input-box">
                                <option value="">Loading backups...</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-300 mb-1">Target MongoDB URI</label>
                            <input type="text" id="restore-uri" class="w-full px-3 py-2 text-xs input-box font-mono" placeholder="mongodb://localhost:27017 or remote URI">
                        </div>
                        <div class="grid grid-cols-2 gap-3 items-center">
                            <div>
                                <label class="block text-xs font-medium text-gray-300 mb-1">Target Database Name</label>
                                <input type="text" id="restore-db" class="w-full px-3 py-2 text-xs input-box" placeholder="novaroom" value="novaroom">
                            </div>
                            <div class="pt-5">
                                <label class="inline-flex items-center text-xs text-gray-300 cursor-pointer">
                                    <input type="checkbox" id="restore-drop" checked class="rounded border-gray-700 text-blue-600 shadow-sm focus:ring-0 mr-2 bg-[#0d1117]">
                                    <span>Drop existing collections (--drop)</span>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="mt-6 pt-4 border-t border-[#30363d] flex justify-end">
                    <button id="btn-restore" onclick="startRestore()" class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-semibold flex items-center gap-2 shadow">
                        <i class="fa-solid fa-upload"></i> Start Restore
                    </button>
                </div>
            </div>
        </div>

        <!-- Available Backups List -->
        <div class="card p-6">
            <div class="flex items-center justify-between mb-4">
                <div class="flex items-center gap-2 text-white font-semibold text-base">
                    <i class="fa-solid fa-box-archive text-gray-400"></i>
                    <span>Available Backups</span>
                    <span id="backup-count" class="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-300 border border-gray-700">0</span>
                </div>
                <button onclick="refreshData()" class="text-xs px-3 py-1.5 rounded bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-gray-300 flex items-center gap-1.5">
                    <i class="fa-solid fa-rotate-right"></i> Refresh
                </button>
            </div>

            <div class="overflow-x-auto">
                <table class="w-full text-left text-xs">
                    <thead>
                        <tr class="border-b border-[#30363d] text-gray-400 uppercase text-[10px] tracking-wider">
                            <th class="py-2.5 px-3">Backup Name</th>
                            <th class="py-2.5 px-3">Created Date</th>
                            <th class="py-2.5 px-3">Size</th>
                            <th class="py-2.5 px-3">Collections</th>
                            <th class="py-2.5 px-3 text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody id="backups-tbody" class="divide-y divide-[#21262d]">
                        <tr>
                            <td colspan="5" class="py-4 text-center text-gray-500">Scanning backups directory...</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Live Console Logs -->
        <div class="card p-6" id="logs-container">
            <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2 text-sm font-semibold text-gray-300">
                    <i class="fa-solid fa-terminal text-yellow-500"></i>
                    <span>Console Output</span>
                </div>
                <div class="flex items-center gap-2">
                    <span id="log-status-badge" class="text-[11px] px-2 py-0.5 rounded bg-gray-800 border border-gray-700 text-gray-400">Idle</span>
                    <button onclick="clearLogs()" class="text-xs px-2.5 py-1 rounded bg-[#21262d] hover:bg-[#30363d] text-gray-400">Clear</button>
                </div>
            </div>
            <pre id="console-logs" class="w-full h-56 bg-[#090d13] border border-[#21262d] rounded-lg p-3 text-[11px] font-mono text-gray-300 overflow-y-auto leading-relaxed">No operations running.</pre>
        </div>
    </main>

    <footer class="border-t border-[#21262d] py-3 text-center text-xs text-gray-500">
        NovaRoom MongoDB Helper &bull; Powered by mongodump & mongorestore
    </footer>

    <script>
        let isPolling = false;

        async function fetchStatus() {
            try {
                const res = await fetch('/api/status');
                const data = await res.json();
                
                // Tool status
                const ts = document.getElementById('tool-status');
                ts.innerHTML = `
                    <span class="text-xs px-2.5 py-1 rounded ${data.mongodump_available ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/10 text-red-400 border border-red-500/30'}">
                        mongodump: ${data.mongodump_available ? 'OK' : 'Missing'}
                    </span>
                    <span class="text-xs px-2.5 py-1 rounded ${data.mongorestore_available ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/10 text-red-400 border border-red-500/30'}">
                        mongorestore: ${data.mongorestore_available ? 'OK' : 'Missing'}
                    </span>
                `;

                if (!document.getElementById('backup-uri').value && data.default_uri) {
                    document.getElementById('backup-uri').value = data.default_uri;
                }
                if (!document.getElementById('restore-uri').value && data.default_uri) {
                    document.getElementById('restore-uri').value = data.default_uri;
                }
                if (data.default_db) {
                    document.getElementById('backup-db').value = data.default_db;
                    document.getElementById('restore-db').value = data.default_db;
                }

                renderBackups(data.backups);
            } catch (err) {
                console.error(err);
            }
        }

        function renderBackups(backups) {
            document.getElementById('backup-count').innerText = backups.length;
            const tbody = document.getElementById('backups-tbody');
            const select = document.getElementById('restore-backup');

            if (backups.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="py-4 text-center text-gray-500">No backup directories found.</td></tr>';
                select.innerHTML = '<option value="">-- No backups available --</option>';
                return;
            }

            let tbodyHtml = '';
            let selectHtml = '';

            backups.forEach((b, idx) => {
                selectHtml += `<option value="${b.name}">${b.name} (${b.size_human} - ${b.collections_count} collections)</option>`;
                tbodyHtml += `
                    <tr class="hover:bg-[#21262d]/50">
                        <td class="py-2.5 px-3 font-mono font-medium text-white">${b.name}</td>
                        <td class="py-2.5 px-3 text-gray-400">${b.created_at}</td>
                        <td class="py-2.5 px-3 text-emerald-400 font-mono">${b.size_human}</td>
                        <td class="py-2.5 px-3">
                            <span class="text-gray-300 font-medium">${b.collections_count} cols</span>
                            <span class="text-gray-500 text-[10px] block truncate max-w-xs" title="${b.collections.join(', ')}">${b.collections.join(', ')}</span>
                        </td>
                        <td class="py-2.5 px-3 text-right">
                            <button onclick="selectForRestore('${b.name}')" class="px-2.5 py-1 bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white rounded text-[11px] font-medium border border-blue-500/30 transition">
                                <i class="fa-solid fa-arrow-up-right-from-square mr-1"></i> Quick Select
                            </button>
                        </td>
                    </tr>
                `;
            });

            tbody.innerHTML = tbodyHtml;
            select.innerHTML = selectHtml;
        }

        function selectForRestore(name) {
            document.getElementById('restore-backup').value = name;
            document.getElementById('restore-backup').scrollIntoView({ behavior: 'smooth' });
        }

        async function startBackup() {
            const uri = document.getElementById('backup-uri').value.trim();
            const db = document.getElementById('backup-db').value.trim();
            const name = document.getElementById('backup-name').value.trim();

            if (!uri || !db) {
                alert('Please enter both MongoDB URI and Database Name.');
                return;
            }

            disableButtons(true);
            try {
                const res = await fetch('/api/backup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ uri, db, name })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Failed');
                startPollingLogs();
            } catch (err) {
                alert(err.message);
                disableButtons(false);
            }
        }

        async function startRestore() {
            const backup_name = document.getElementById('restore-backup').value;
            const target_uri = document.getElementById('restore-uri').value.trim();
            const target_db = document.getElementById('restore-db').value.trim();
            const drop = document.getElementById('restore-drop').checked;

            if (!backup_name || !target_uri || !target_db) {
                alert('Please select a backup and enter Target URI and Database Name.');
                return;
            }

            if (!confirm(`Are you sure you want to restore backup '${backup_name}' into '${target_db}'?${drop ? '\\nWarning: Existing collections in target DB will be DROPPED.' : ''}`)) {
                return;
            }

            disableButtons(true);
            try {
                const res = await fetch('/api/restore', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ backup_name, target_uri, target_db, drop })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Failed');
                startPollingLogs();
            } catch (err) {
                alert(err.message);
                disableButtons(false);
            }
        }

        function disableButtons(disabled) {
            document.getElementById('btn-backup').disabled = disabled;
            document.getElementById('btn-restore').disabled = disabled;
            if (disabled) {
                document.getElementById('btn-backup').classList.add('opacity-50', 'cursor-not-allowed');
                document.getElementById('btn-restore').classList.add('opacity-50', 'cursor-not-allowed');
            } else {
                document.getElementById('btn-backup').classList.remove('opacity-50', 'cursor-not-allowed');
                document.getElementById('btn-restore').classList.remove('opacity-50', 'cursor-not-allowed');
            }
        }

        let pollInterval = null;
        function startPollingLogs() {
            if (pollInterval) clearInterval(pollInterval);
            pollInterval = setInterval(pollLogs, 1000);
            pollLogs();
        }

        async function pollLogs() {
            try {
                const res = await fetch('/api/logs');
                const data = await res.json();
                
                const banner = document.getElementById('task-banner');
                const badge = document.getElementById('log-status-badge');
                const logBox = document.getElementById('console-logs');

                if (data.status === 'running') {
                    banner.className = 'p-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 text-yellow-400 flex items-center justify-between';
                    document.getElementById('task-title').innerText = data.operation === 'backup' ? 'Backup In Progress...' : 'Restore In Progress...';
                    document.getElementById('task-desc').innerText = `Started at ${data.started_at}`;
                    badge.innerText = 'Running';
                    badge.className = 'text-[11px] px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/40';
                    disableButtons(true);
                } else if (data.status === 'success') {
                    banner.className = 'p-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 flex items-center justify-between';
                    document.getElementById('task-title').innerText = 'Operation Succeeded';
                    document.getElementById('task-desc').innerText = `Finished at ${data.finished_at}`;
                    badge.innerText = 'Completed';
                    badge.className = 'text-[11px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40';
                    disableButtons(false);
                    fetchStatus();
                } else if (data.status === 'failed') {
                    banner.className = 'p-4 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 flex items-center justify-between';
                    document.getElementById('task-title').innerText = 'Operation Failed';
                    document.getElementById('task-desc').innerText = `Exit Code: ${data.exit_code}`;
                    badge.innerText = 'Failed';
                    badge.className = 'text-[11px] px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/40';
                    disableButtons(false);
                } else {
                    banner.classList.add('hidden');
                    badge.innerText = 'Idle';
                    badge.className = 'text-[11px] px-2 py-0.5 rounded bg-gray-800 border border-gray-700 text-gray-400';
                    disableButtons(false);
                }

                if (data.logs && data.logs.length > 0) {
                    logBox.innerText = data.logs.join('\\n');
                    logBox.scrollTop = logBox.scrollHeight;
                }
            } catch (e) {
                console.error(e);
            }
        }

        function scrollToLogs() {
            document.getElementById('logs-container').scrollIntoView({ behavior: 'smooth' });
        }

        function clearLogs() {
            document.getElementById('console-logs').innerText = 'Console cleared.';
        }

        function refreshData() {
            fetchStatus();
            pollLogs();
        }

        fetchStatus();
        pollLogs();
    </script>
</body>
</html>
"""

class RequestHandler(BaseHTTPRequestHandler):
    def _send_json(self, status: int, data: dict):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_HEAD(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path in ("/", "/index.html"):
            body = HTML_PAGE.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        elif parsed.path == "/api/status":
            env_defaults = load_default_env()
            data = {
                "mongodump_available": shutil.which("mongodump") is not None,
                "mongorestore_available": shutil.which("mongorestore") is not None,
                "default_uri": env_defaults["uri"],
                "default_db": env_defaults["db"],
                "backups": list_backups()
            }
            self._send_json(200, data)
        elif parsed.path == "/api/logs":
            self._send_json(200, current_task)
        else:
            self.send_error(404, "Not Found")

    def do_POST(self):
        parsed = urlparse(self.path)
        content_length = int(self.headers.get("Content-Length", 0))
        post_data = self.rfile.read(content_length)

        try:
            payload = json.loads(post_data.decode("utf-8")) if post_data else {}
        except Exception:
            return self._send_json(400, {"error": "Invalid JSON body"})

        if parsed.path == "/api/backup":
            if current_task["status"] == "running":
                return self._send_json(409, {"error": "Another operation is already in progress."})
            
            uri = payload.get("uri")
            db = payload.get("db")
            name = payload.get("name", "")

            if not uri or not db:
                return self._send_json(400, {"error": "Missing 'uri' or 'db'."})
            
            import threading
            threading.Thread(target=run_backup_task, args=(uri, db, name), daemon=True).start()
            return self._send_json(202, {"status": "started", "message": "Backup started"})

        elif parsed.path == "/api/restore":
            if current_task["status"] == "running":
                return self._send_json(409, {"error": "Another operation is already in progress."})

            backup_name = payload.get("backup_name")
            target_uri = payload.get("target_uri")
            target_db = payload.get("target_db")
            drop = payload.get("drop", True)

            if not backup_name or not target_uri or not target_db:
                return self._send_json(400, {"error": "Missing backup_name, target_uri, or target_db."})
            
            import threading
            threading.Thread(target=run_restore_task, args=(backup_name, target_uri, target_db, drop), daemon=True).start()
            return self._send_json(202, {"status": "started", "message": "Restore started"})

        else:
            self.send_error(404, "Endpoint not found")

    def log_message(self, format, *args):
        pass


def main():
    parser = argparse.ArgumentParser(description="MongoDB Helper Web UI")
    parser.add_argument("--port", type=int, default=5050, help="Port to listen on (default: 5050)")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="Host address (default: 0.0.0.0)")
    args = parser.parse_args()

    server = HTTPServer((args.host, args.port), RequestHandler)
    print(f"[✓] MongoDB Helper running at http://localhost:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[*] Stopping MongoDB Helper server...")
        server.server_close()


if __name__ == "__main__":
    main()
