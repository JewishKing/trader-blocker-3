"""
FocusGuard Blocker - Windows Process Blocker with Auto-Launch
=============================================================
Blocks TradingView and cTrader from running on your Windows PC.
They can ONLY be opened when a TradingView alert fires via webhook.
When an alert fires, apps are automatically launched for you.
"""

import sys
import os
import time
import json
import signal
import argparse
import datetime
import ctypes
import threading
import subprocess
from pathlib import Path

try:
    import psutil
except ImportError:
    print("[FocusGuard] ERROR: psutil is not installed.")
    print("[FocusGuard] Run:  pip install psutil")
    sys.exit(1)

try:
    import requests as http_requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False

from http.server import HTTPServer, BaseHTTPRequestHandler


# ── Configuration ──────────────────────────────────────────
# EDIT THESE PATHS IF NEEDED:
TRADINGVIEW_PATH = r"C:\Program Files\WindowsApps\TradingView.Desktop_3.0.0.7652_x64__n534cwy3pjxzj\TradingView.exe"
CTRADER_PATH = r"C:\Users\Maphuma\AppData\Local\Spotware\cTrader\abb70432efbee65d18af69e79fe8efe1\cTrader.exe"
# ──────────────────────────────────────────────────────────

BLOCKED_PROCESSES = {
    "tradingview.exe",
    "tradingview",
    "ctrader.exe",
    "ctrader",
}


# ── Shared State ───────────────────────────────────────────

class LockState:
    def __init__(self, unlock_minutes: int, enable_auto_launch: bool = True):
        self.is_locked = True
        self.unlock_expires_at = None
        self.unlock_minutes = unlock_minutes
        self.enable_auto_launch = enable_auto_launch
        self.last_alert_ticker = None
        self.last_alert_message = None
        self.last_alert_time = None
        self.kill_count = 0
        self.launch_count = 0
        self.launch_errors = []
        self.kill_log = []
        self.agent_connected = True
        
        # Manual paths (will be set via command line)
        self.ctrader_path = CTRADER_PATH
        self.tradingview_path = TRADINGVIEW_PATH
        
        self._lock = threading.Lock()
        
        self.reminder_sent_at = {
            5: False,
            1: False,
        }

    def launch_ctrader(self) -> bool:
        """Launch cTrader with multiple methods"""
        if not self.ctrader_path:
            error_msg = "cTrader path not configured"
            print(f"[FocusGuard] ✗ {error_msg}")
            self.launch_errors.append({"app": "cTrader", "error": error_msg, "time": datetime.datetime.now().isoformat()})
            return False
        
        if not os.path.exists(self.ctrader_path):
            error_msg = f"cTrader not found at: {self.ctrader_path}"
            print(f"[FocusGuard] ✗ {error_msg}")
            self.launch_errors.append({"app": "cTrader", "error": error_msg, "time": datetime.datetime.now().isoformat()})
            return False
        
        print(f"[FocusGuard] Attempting to launch cTrader from: {self.ctrader_path}")
        
        # Method 1: os.startfile (Windows default)
        try:
            print(f"[FocusGuard]   Method 1: os.startfile()")
            os.startfile(self.ctrader_path)
            self.launch_count += 1
            ts = datetime.datetime.now().strftime("%H:%M:%S")
            print(f"[FocusGuard] ✓ [{ts}] Successfully launched cTrader (method 1)")
            return True
        except Exception as e1:
            print(f"[FocusGuard]   Method 1 failed: {e1}")
            
            # Method 2: subprocess.Popen with shell=True
            try:
                print(f"[FocusGuard]   Method 2: subprocess.Popen(shell=True)")
                subprocess.Popen([self.ctrader_path], shell=True)
                self.launch_count += 1
                ts = datetime.datetime.now().strftime("%H:%M:%S")
                print(f"[FocusGuard] ✓ [{ts}] Successfully launched cTrader (method 2)")
                return True
            except Exception as e2:
                print(f"[FocusGuard]   Method 2 failed: {e2}")
                
                # Method 3: cmd /c start
                try:
                    print(f"[FocusGuard]   Method 3: cmd /c start")
                    subprocess.Popen(f'cmd /c start "" "{self.ctrader_path}"', shell=True)
                    self.launch_count += 1
                    ts = datetime.datetime.now().strftime("%H:%M:%S")
                    print(f"[FocusGuard] ✓ [{ts}] Successfully launched cTrader (method 3)")
                    return True
                except Exception as e3:
                    error_msg = f"All launch methods failed: {e1}, {e2}, {e3}"
                    print(f"[FocusGuard] ✗ Failed to launch cTrader: {error_msg}")
                    self.launch_errors.append({
                        "app": "cTrader", 
                        "error": str(e3), 
                        "time": datetime.datetime.now().isoformat()
                    })
                    return False

    def launch_tradingview(self) -> bool:
        """Launch TradingView (MS Store version) with multiple methods"""
        print(f"\n[FocusGuard] 🚀 TRADINGVIEW LAUNCH ATTEMPT")
        print(f"[FocusGuard] ==================================")
        
        if not self.tradingview_path:
            print(f"[FocusGuard] ❌ TradingView path not configured - skipping")
            return False
        
        print(f"[FocusGuard] 📍 Path: {self.tradingview_path}")
        path_exists = os.path.exists(self.tradingview_path)
        print(f"[FocusGuard] 📁 File exists: {path_exists}")
        print(f"[FocusGuard] 🔒 Locked state: {self.is_locked}")
        
        if not path_exists:
            print(f"[FocusGuard] ❌ TradingView executable not found")
            return False
        
        # METHOD 1: os.startfile (most reliable for Windows)
        try:
            print(f"[FocusGuard]   Method 1: os.startfile()")
            os.startfile(self.tradingview_path)
            self.launch_count += 1
            ts = datetime.datetime.now().strftime("%H:%M:%S")
            print(f"[FocusGuard] ✓ [{ts}] Successfully launched TradingView (method 1)")
            return True
        except Exception as e1:
            print(f"[FocusGuard]   Method 1 failed: {e1}")
        
        # METHOD 2: subprocess.Popen
        try:
            print(f"[FocusGuard]   Method 2: subprocess.Popen()")
            result = subprocess.Popen([self.tradingview_path], shell=True)
            print(f"[FocusGuard]   Process ID: {result.pid}")
            self.launch_count += 1
            ts = datetime.datetime.now().strftime("%H:%M:%S")
            print(f"[FocusGuard] ✓ [{ts}] Successfully launched TradingView (method 2)")
            return True
        except Exception as e2:
            print(f"[FocusGuard]   Method 2 failed: {e2}")
        
        # METHOD 3: cmd /c start
        try:
            print(f"[FocusGuard]   Method 3: cmd /c start")
            cmd = f'cmd /c start "" "{self.tradingview_path}"'
            result = subprocess.Popen(cmd, shell=True)
            self.launch_count += 1
            ts = datetime.datetime.now().strftime("%H:%M:%S")
            print(f"[FocusGuard] ✓ [{ts}] Successfully launched TradingView (method 3)")
            return True
        except Exception as e3:
            print(f"[FocusGuard]   Method 3 failed: {e3}")
        
        # METHOD 4: PowerShell Start-Process
        try:
            print(f"[FocusGuard]   Method 4: PowerShell Start-Process")
            ps_command = f'powershell -Command "Start-Process \'{self.tradingview_path}\'"'
            result = subprocess.Popen(ps_command, shell=True)
            self.launch_count += 1
            ts = datetime.datetime.now().strftime("%H:%M:%S")
            print(f"[FocusGuard] ✓ [{ts}] Successfully launched TradingView (method 4)")
            return True
        except Exception as e4:
            print(f"[FocusGuard]   Method 4 failed: {e4}")
        
        # METHOD 5: App Execution Alias
        try:
            print(f"[FocusGuard]   Method 5: 'start tradingview:' command")
            result = subprocess.Popen('start tradingview:', shell=True)
            self.launch_count += 1
            ts = datetime.datetime.now().strftime("%H:%M:%S")
            print(f"[FocusGuard] ✓ [{ts}] Successfully launched TradingView (method 5)")
            return True
        except Exception as e5:
            print(f"[FocusGuard]   Method 5 failed: {e5}")
        
        print(f"[FocusGuard] ✗ All TradingView launch methods failed")
        self.launch_errors.append({
            "app": "TradingView",
            "error": "All launch methods failed",
            "time": datetime.datetime.now().isoformat()
        })
        return False

    def launch_all_apps(self) -> list:
        """Launch both trading apps"""
        launched = []
        print(f"[FocusGuard] {'='*50}")
        print(f"[FocusGuard] Auto-launching trading applications...")
        print(f"[FocusGuard] {'='*50}")
        
        # Launch cTrader first
        if self.launch_ctrader():
            launched.append("cTrader")
            time.sleep(2)
        
        # Launch TradingView
        if self.tradingview_path:
            if self.launch_tradingview():
                launched.append("TradingView")
                time.sleep(2)
        
        if launched:
            print(f"[FocusGuard] {'='*50}")
            print(f"[FocusGuard] ✓ Successfully launched: {', '.join(launched)}")
            print(f"[FocusGuard] {'='*50}")
        else:
            print(f"[FocusGuard] {'='*50}")
            print(f"[FocusGuard] ✗ No apps were launched")
            print(f"[FocusGuard] {'='*50}")
        
        return launched

    def unlock(self, ticker="", message="", duration_override=None):
        with self._lock:
            duration = duration_override or self.unlock_minutes
            
            # Set unlocked FIRST so apps aren't killed
            self.is_locked = False
            self.unlock_expires_at = datetime.datetime.now() + datetime.timedelta(minutes=duration)
            
            ts = datetime.datetime.now().strftime("%H:%M:%S")
            print(f"\n[FocusGuard] {'='*50}")
            print(f"[FocusGuard] [{ts}] *** ALERT RECEIVED ***")
            print(f"[FocusGuard]   Ticker:  {ticker or 'N/A'}")
            print(f"[FocusGuard]   Message: {message or 'N/A'}")
            print(f"[FocusGuard]   UNLOCKED for {duration} minutes")
            print(f"[FocusGuard]   Expires: {self.unlock_expires_at.strftime('%H:%M:%S')}")
            print(f"[FocusGuard] {'='*50}")
            
            # Auto-launch apps
            if self.enable_auto_launch:
                self.launch_all_apps()
            
            # Update alert info
            self.last_alert_ticker = ticker
            self.last_alert_message = message
            self.last_alert_time = datetime.datetime.now().isoformat()
            self.reminder_sent_at = {5: False, 1: False}

    def force_lock(self):
        with self._lock:
            self.is_locked = True
            self.unlock_expires_at = None
            self.reminder_sent_at = {5: False, 1: False}
            ts = datetime.datetime.now().strftime("%H:%M:%S")
            print(f"[FocusGuard] [{ts}] Force-locked. Apps are now BLOCKED.\n")

    def check_expiry(self):
        with self._lock:
            if not self.is_locked and self.unlock_expires_at:
                now = datetime.datetime.now()
                
                if now >= self.unlock_expires_at:
                    self.is_locked = True
                    self.unlock_expires_at = None
                    self.reminder_sent_at = {5: False, 1: False}
                    ts = now.strftime("%H:%M:%S")
                    print(f"\n[FocusGuard] [{ts}] Unlock window EXPIRED. Apps are now BLOCKED again.\n")
                    return "expired"
                
                remaining_seconds = (self.unlock_expires_at - now).total_seconds()
                remaining_minutes = int(remaining_seconds // 60)
                
                if remaining_minutes <= 5 and not self.reminder_sent_at[5] and remaining_minutes > 1:
                    self.reminder_sent_at[5] = True
                    print(f"[FocusGuard] ⚠️ 5 minutes remaining until lock!")
                    return "5min_warning"
                
                if remaining_minutes <= 1 and not self.reminder_sent_at[1]:
                    self.reminder_sent_at[1] = True
                    print(f"[FocusGuard] 🔥 1 minute remaining!")
                    return "1min_warning"
        
        return None

    def record_kill(self, process_name):
        with self._lock:
            self.kill_count += 1
            self.kill_log.insert(0, {
                "process": process_name,
                "timestamp": datetime.datetime.now().isoformat(),
            })
            self.kill_log = self.kill_log[:100]

    def to_dict(self):
        with self._lock:
            remaining_minutes = 0
            remaining_seconds = 0
            warning_type = None
            
            if not self.is_locked and self.unlock_expires_at:
                now = datetime.datetime.now()
                if now < self.unlock_expires_at:
                    delta = self.unlock_expires_at - now
                    remaining_minutes = int(delta.total_seconds() // 60)
                    remaining_seconds = int(delta.total_seconds() % 60)
                    
                    if remaining_minutes <= 5 and remaining_minutes > 1:
                        warning_type = "5min"
                    elif remaining_minutes <= 1 and remaining_minutes > 0:
                        warning_type = "1min"
                    elif remaining_minutes == 0:
                        if remaining_seconds <= 30:
                            warning_type = "critical"
                        elif remaining_seconds <= 60:
                            warning_type = "warning"
            
            return {
                "isLocked": self.is_locked,
                "unlockExpiresAt": self.unlock_expires_at.isoformat() if self.unlock_expires_at else None,
                "unlockMinutes": self.unlock_minutes,
                "remainingMinutes": remaining_minutes,
                "remainingSeconds": remaining_seconds,
                "warningType": warning_type,
                "killCount": self.kill_count,
                "launchCount": self.launch_count,
                "killLog": self.kill_log[:20],
                "lastAlertTicker": self.last_alert_ticker,
                "lastAlertMessage": self.last_alert_message,
                "lastAlertTime": self.last_alert_time,
                "agentConnected": True,
                "autoLaunchEnabled": self.enable_auto_launch,
                "ctraderPath": self.ctrader_path,
                "tradingviewPath": self.tradingview_path,
            }

    def apply_server_state(self, server_data):
        with self._lock:
            server_locked = server_data.get("isLocked", True)
            server_expires = server_data.get("unlockExpiresAt")

            if not server_locked and self.is_locked:
                self.is_locked = False
                if server_expires:
                    self.unlock_expires_at = datetime.datetime.fromisoformat(server_expires)
                self.last_alert_ticker = server_data.get("lastAlertTicker", self.last_alert_ticker)
                self.last_alert_message = server_data.get("lastAlertMessage", self.last_alert_message)
                self.last_alert_time = server_data.get("lastAlertTime", self.last_alert_time)
                ts = datetime.datetime.now().strftime("%H:%M:%S")
                print(f"[FocusGuard] [{ts}] Server says UNLOCKED -- syncing")
                
                if self.enable_auto_launch:
                    print(f"[FocusGuard] Auto-launching from server sync...")
                    self.launch_all_apps()

            elif server_locked and not self.is_locked:
                self.is_locked = True
                self.unlock_expires_at = None
                ts = datetime.datetime.now().strftime("%H:%M:%S")
                print(f"[FocusGuard] [{ts}] Server says LOCKED -- syncing")


# Global state
state = None


# ── Webhook Server ─────────────────────────────────────────

class AlertHandler(BaseHTTPRequestHandler):
    """Handles incoming TradingView webhook alerts + status queries."""

    def log_message(self, format, *args):
        pass

    def _send_json(self, code, data):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def do_OPTIONS(self):
        self._send_json(200, {"ok": True})

    def do_POST(self):
        print(f"[FocusGuard] POST request to: {self.path}")
        
        if self.path in ("/alert", "/api/alert"):
            try:
                content_length = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(content_length).decode("utf-8")
                ticker = ""
                message = ""
                try:
                    data = json.loads(body)
                    ticker = data.get("ticker", data.get("symbol", ""))
                    message = data.get("message", data.get("action", ""))
                except json.JSONDecodeError:
                    message = body.strip()

                state.unlock(ticker=ticker, message=message)
                
                apps_launched = []
                if state.ctrader_path:
                    apps_launched.append("cTrader")
                if state.tradingview_path:
                    apps_launched.append("TradingView")
                    
                self._send_json(200, {
                    "success": True,
                    "unlocked": True,
                    "expires_in_minutes": state.unlock_minutes,
                    "apps_launched": apps_launched,
                })
            except Exception as e:
                self._send_json(500, {"error": str(e)})

        elif self.path in ("/lock", "/api/lock"):
            state.force_lock()
            self._send_json(200, {"success": True, "locked": True})

        elif self.path == "/launch":
            launched = state.launch_all_apps()
            self._send_json(200, {"success": True, "launched": launched})
            
        elif self.path == "/settings":
            try:
                content_length = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(content_length).decode("utf-8")
                data = json.loads(body)
                
                if "unlockMinutes" in data:
                    new_duration = int(data["unlockMinutes"])
                    state.unlock_minutes = new_duration
                    print(f"[FocusGuard] ✅ Unlock duration updated to {new_duration} minutes")
                    
                self._send_json(200, {"success": True, "unlockMinutes": state.unlock_minutes})
            except Exception as e:
                self._send_json(500, {"error": str(e)})

        else:
            self._send_json(404, {"error": "Not found"})

    def do_GET(self):
        if self.path in ("/status", "/api/status"):
            self._send_json(200, state.to_dict())
        else:
            self._send_json(200, {
                "service": "FocusGuard Blocker Agent",
                "locked": state.is_locked,
                "killCount": state.kill_count,
                "launchCount": state.launch_count,
                "autoLaunchEnabled": state.enable_auto_launch,
                "ctraderPath": state.ctrader_path,
                "tradingviewPath": state.tradingview_path,
            })


def start_webhook_server(port):
    server = HTTPServer(("0.0.0.0", port), AlertHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server


# ── Process Killer ─────────────────────────────────────────

def kill_blocked_processes():
    killed = []
    for proc in psutil.process_iter(["pid", "name"]):
        try:
            name = proc.info["name"]
            if name and name.lower() in BLOCKED_PROCESSES:
                proc.kill()
                killed.append(name)
                state.record_kill(name)
                ts = datetime.datetime.now().strftime("%H:%M:%S")
                print(f"[FocusGuard] [{ts}] BLOCKED: Killed {name} (PID {proc.info['pid']})")
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            pass
    return killed


# ── Admin Check ────────────────────────────────────────────

def is_admin():
    try:
        return ctypes.windll.shell32.IsUserAnAdmin()
    except Exception:
        return False


# ── Main Loop ──────────────────────────────────────────────

def main():
    global state

    # Parse command line arguments but use hardcoded paths as defaults
    parser = argparse.ArgumentParser(
        description="FocusGuard - Block TradingView & cTrader until alerts fire"
    )
    parser.add_argument("--port", type=int, default=5000, help="Local webhook listener port")
    parser.add_argument("--unlock-minutes", type=int, default=30, help="Minutes to stay unlocked")
    parser.add_argument("--interval", type=float, default=2.0, help="Process scan interval in seconds")
    parser.add_argument("--no-auto-launch", action="store_true", help="Disable auto-launching apps")
    parser.add_argument("--tradingview-path", type=str, default=TRADINGVIEW_PATH, help="Path to TradingView executable")
    parser.add_argument("--ctrader-path", type=str, default=CTRADER_PATH, help="Path to cTrader executable")
    args = parser.parse_args()

    state = LockState(
        unlock_minutes=args.unlock_minutes,
        enable_auto_launch=not args.no_auto_launch
    )

    # Set cTrader path
    if args.ctrader_path and os.path.exists(args.ctrader_path):
        state.ctrader_path = args.ctrader_path
        print(f"[FocusGuard] ✓ cTrader path set")
    else:
        print(f"[FocusGuard] ⚠️ cTrader path not found: {args.ctrader_path}")
    
    # Set TradingView path
    if args.tradingview_path and os.path.exists(args.tradingview_path):
        state.tradingview_path = args.tradingview_path
        print(f"[FocusGuard] ✓ TradingView path set")
    else:
        print(f"[FocusGuard] ⚠️ TradingView path not found: {args.tradingview_path}")
        print(f"[FocusGuard]    Please check the path in the script (line 22)")

    # Start webhook server
    start_webhook_server(args.port)

    admin = is_admin()

    print()
    print("=" * 64)
    print("   FocusGuard - Trading App Blocker for Windows")
    print("=" * 64)
    print(f"   Status:          LOCKED")
    print(f"   Webhook:         http://localhost:{args.port}/alert")
    print(f"   Unlock duration: {args.unlock_minutes} minutes")
    print(f"   Auto-launch:     {'ON' if state.enable_auto_launch else 'OFF'}")
    print(f"   cTrader:         {'✓ Found' if state.ctrader_path and os.path.exists(state.ctrader_path) else '✗ Not found'}")
    print(f"   TradingView:     {'✓ Found' if state.tradingview_path and os.path.exists(state.tradingview_path) else '✗ Not found'}")
    print(f"   Admin:           {'✓ Yes' if admin else '✗ NO - Run as Admin!'}")
    print("=" * 64)
    print()

    if not admin:
        print("[FocusGuard] ⚠️  WARNING: Not running as Administrator!")
        print("[FocusGuard]    TradingView may not launch without admin rights")
        print("[FocusGuard]    Close this window and run as Administrator\n")

    # Test launches
    if state.ctrader_path and os.path.exists(state.ctrader_path):
        print("[FocusGuard] Testing cTrader launch...")
        state.launch_ctrader()
        time.sleep(1)
    
    if state.tradingview_path and os.path.exists(state.tradingview_path):
        print("[FocusGuard] Testing TradingView launch...")
        state.launch_tradingview()
        time.sleep(1)

    print("\n[FocusGuard] Apps are LOCKED. Waiting for alerts...")
    print("[FocusGuard] Press Ctrl+C to stop.\n")

    running = True

    def signal_handler(sig, frame):
        nonlocal running
        print("\n[FocusGuard] Shutting down...")
        running = False

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    while running:
        try:
            state.check_expiry()
            if state.is_locked:
                kill_blocked_processes()
            time.sleep(args.interval)
        except KeyboardInterrupt:
            break
        except Exception as e:
            print(f"[FocusGuard] Error: {e}")
            time.sleep(args.interval)

    print("[FocusGuard] Stopped.")


if __name__ == "__main__":
    # Check if running as admin, if not, restart as admin
    if not is_admin():
        print("[FocusGuard] 🔄 Restarting with administrator privileges...")
        ctypes.windll.shell32.ShellExecuteW(None, "runas", sys.executable, " ".join(sys.argv), None, 1)
        sys.exit()
    
    main()