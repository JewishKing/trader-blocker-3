"""
FocusGuard Alert Service - Windows 11 Style with Floating Bounce Animation
FIXED: Service no longer crashes on dismiss
"""

import sys
import os
import threading
import time
import json
import requests
import winsound
import webbrowser
from datetime import datetime
import tkinter as tk
from tkinter import font
from collections import deque
import math
import random

class AlertService:
    def __init__(self):
        self.last_alert_id = None
        self.blocker_url = "http://localhost:5000"
        self.initialized = False
        self.current_notification = None
        self.notification_active = False
        self.alert_history = deque(maxlen=10)
        self.current_ticker = ""
        self.animation_running = False
        self.bounce_thread = None
        
        # Path to trumpet .wav file
        self.sound_file = os.path.join(os.path.dirname(__file__), "trumpet.wav")
        
    def stop_sound(self):
        """Stop any playing sound"""
        try:
            winsound.PlaySound(None, winsound.SND_PURGE)
        except:
            pass
    
    def play_trumpet(self):
        """Play trumpet sound when alert triggers"""
        if os.path.exists(self.sound_file):
            try:
                self.stop_sound()
                winsound.PlaySound(self.sound_file, winsound.SND_FILENAME | winsound.SND_ASYNC)
                return True
            except:
                return False
        return False
    
    def show_notification(self, ticker, message):
        """Show Windows 11 style notification with floating bounce animation"""
        
        self.current_ticker = ticker
        self.animation_running = True
        
        # Add to history
        self.alert_history.append({
            'ticker': ticker,
            'message': message,
            'time': datetime.now().strftime('%H:%M')
        })
        
        # Close previous notification if exists
        if self.notification_active and self.current_notification:
            try:
                self.stop_sound()
                self.animation_running = False
                # Wait for bounce thread to stop
                if self.bounce_thread and self.bounce_thread.is_alive():
                    time.sleep(0.2)
                self.current_notification.quit()
                self.current_notification.destroy()
            except:
                pass
        
        # Play sound
        sound_played = self.play_trumpet()
        
        # Create window
        window = tk.Tk()
        window.title(f"FocusGuard Alert - {ticker}")
        
        # Remove title bar
        window.overrideredirect(True)
        window.attributes('-topmost', True)
        window.attributes('-alpha', 0.95)
        window.lift()
        window.focus_force()
        
        # Position in bottom-right corner
        window_width = 380
        window_height = 180
        screen_width = window.winfo_screenwidth()
        screen_height = window.winfo_screenheight()
        
        # Store original position
        base_x = screen_width - window_width - 20
        base_y = screen_height - window_height - 80
        window.geometry(f'{window_width}x{window_height}+{base_x}+{base_y}')
        
        # Windows 11 colors
        colors = {
            'bg': '#202020',
            'surface': '#2D2D2D',
            'accent': '#4CC2FF',
            'text': '#FFFFFF',
            'text_secondary': '#9A9A9A',
            'hover': '#3D3D3D',
            'border': '#3D3D3D',
            'sound_active': '#4CC2FF',
            'sound_inactive': '#5D5D5D'
        }
        
        window.configure(bg=colors['bg'])
        window.configure(highlightbackground=colors['border'], highlightthickness=1)
        
        # Apply rounded corners
        window.configure(highlightthickness=0)
        
        # Create canvas for rounded rectangle background
        canvas = tk.Canvas(window, width=window_width, height=window_height, 
                          bg=colors['bg'], highlightthickness=0)
        canvas.place(x=0, y=0)
        
        # Draw rounded rectangle
        radius = 20
        def create_rounded_rect(x1, y1, x2, y2, r, **kwargs):
            points = [
                x1+r, y1, x2-r, y1, x2, y1, x2, y1+r, x2, y2-r, x2, y2, x2-r, y2, 
                x1+r, y2, x1, y2, x1, y2-r, x1, y1+r, x1, y1
            ]
            return canvas.create_polygon(points, smooth=True, **kwargs)
        
        bg_rect = create_rounded_rect(0, 0, window_width, window_height, radius, 
                                      fill=colors['bg'], outline=colors['border'], width=1)
        
        # Create main container frame
        main = tk.Frame(window, bg=colors['bg'], padx=15, pady=12)
        main.place(x=0, y=0, width=window_width, height=window_height)
        main.configure(highlightthickness=0)
        
        # ========== App Icon and Title Row ==========
        top_row = tk.Frame(main, bg=colors['bg'])
        top_row.pack(fill=tk.X, pady=(0, 8))
        
        # App icon
        icon_canvas = tk.Canvas(top_row, width=24, height=24, bg=colors['bg'], highlightthickness=0)
        icon_canvas.pack(side=tk.LEFT, padx=(0, 10))
        icon_canvas.create_oval(2, 2, 22, 22, fill=colors['accent'], outline="")
        
        # App name
        tk.Label(
            top_row,
            text="FocusGuard",
            font=('Segoe UI', 11, 'bold'),
            fg=colors['text'],
            bg=colors['bg']
        ).pack(side=tk.LEFT)
        
        # Time
        tk.Label(
            top_row,
            text=f"{datetime.now().strftime('%H:%M')}",
            font=('Segoe UI', 10),
            fg=colors['text_secondary'],
            bg=colors['bg']
        ).pack(side=tk.RIGHT)
        
        # ========== Message Content ==========
        content = tk.Frame(main, bg=colors['bg'])
        content.pack(fill=tk.BOTH, expand=True, pady=(0, 12))
        
        # Title
        tk.Label(
            content,
            text="New Trading Alert",
            font=('Segoe UI', 12, 'bold'),
            fg=colors['text'],
            bg=colors['bg']
        ).pack(anchor='w')
        
        # Symbol
        tk.Label(
            content,
            text=ticker,
            font=('Segoe UI', 11, 'bold'),
            fg=colors['accent'],
            bg=colors['bg']
        ).pack(anchor='w', pady=(2, 0))
        
        # Message
        msg_label = tk.Label(
            content,
            text=message,
            font=('Segoe UI', 10),
            fg=colors['text_secondary'],
            bg=colors['bg'],
            wraplength=320,
            justify='left'
        )
        msg_label.pack(anchor='w', pady=(2, 0))
        
        # ========== Action Buttons ==========
        actions = tk.Frame(main, bg=colors['bg'])
        actions.pack(fill=tk.X)
        
        def on_view():
            """View button - open TradingView chart"""
            print(f"[Action] View clicked for {ticker}")
            try:
                webbrowser.open(f"https://www.tradingview.com/chart/?symbol={ticker}")
            except Exception as e:
                print(f"Error opening chart: {e}")
        
        def on_dismiss():
            """FIXED: Dismiss button - safely stops everything"""
            print(f"[Action] Dismiss clicked for {ticker}")
            
            # Stop all animations first
            self.animation_running = False
            self.notification_active = False
            self.stop_sound()
            
            # Small delay to let threads stop
            time.sleep(0.2)
            
            # Destroy window from main thread
            window.after(0, window.quit)
            window.after(10, window.destroy)
        
        # Button style
        button_style = {
            'font': ('Segoe UI', 10, 'bold'),
            'bg': colors['surface'],
            'fg': colors['text'],
            'bd': 0,
            'padx': 25,
            'pady': 6,
            'cursor': 'hand2',
            'relief': 'flat'
        }
        
        # View button
        view_btn = tk.Button(
            actions,
            text="View",
            **button_style,
            command=on_view
        )
        view_btn.pack(side=tk.LEFT, padx=(0, 8))
        
        # View button hover
        def on_view_enter(e):
            view_btn.configure(bg=colors['hover'])
        def on_view_leave(e):
            view_btn.configure(bg=colors['surface'])
        view_btn.bind('<Enter>', on_view_enter)
        view_btn.bind('<Leave>', on_view_leave)
        
        # Dismiss button
        dismiss_btn = tk.Button(
            actions,
            text="Dismiss",
            **button_style,
            command=on_dismiss
        )
        dismiss_btn.pack(side=tk.LEFT)
        
        # Dismiss button hover
        def on_dismiss_enter(e):
            dismiss_btn.configure(bg=colors['hover'])
        def on_dismiss_leave(e):
            dismiss_btn.configure(bg=colors['surface'])
        dismiss_btn.bind('<Enter>', on_dismiss_enter)
        dismiss_btn.bind('<Leave>', on_dismiss_leave)
        
        # Sound indicator
        sound_label = tk.Label(
            actions,
            text="🔊" if sound_played else "🔈",
            font=('Segoe UI', 12),
            fg=colors['sound_active'] if sound_played else colors['sound_inactive'],
            bg=colors['bg']
        )
        sound_label.pack(side=tk.RIGHT, padx=(10, 0))
        
        # Persist indicator
        persist_label = tk.Label(
            actions,
            text="⏸️",
            font=('Segoe UI', 10),
            fg=colors['text_secondary'],
            bg=colors['bg']
        )
        persist_label.pack(side=tk.RIGHT, padx=(0, 5))
        
        # Store reference
        self.current_notification = window
        self.notification_active = True
        
        # ========== FLOATING BOUNCE ANIMATION (SAFE VERSION) ==========
        def bounce_animation():
            bounce_offset = 0
            bounce_direction = 1
            bounce_amplitude = 8
            bounce_speed = 0.3
            last_update = time.time()
            
            while self.animation_running and self.notification_active:
                try:
                    current_time = time.time()
                    if current_time - last_update < 0.03:  # Limit update rate
                        time.sleep(0.01)
                        continue
                    
                    bounce_offset += bounce_speed * bounce_direction
                    
                    if bounce_offset > bounce_amplitude:
                        bounce_offset = bounce_amplitude
                        bounce_direction = -1
                    elif bounce_offset < -bounce_amplitude:
                        bounce_offset = -bounce_amplitude
                        bounce_direction = 1
                    
                    new_y = base_y + bounce_offset
                    drift = math.sin(current_time * 2) * 3
                    new_x = base_x + drift
                    
                    # Use after() to safely update from main thread
                    if window.winfo_exists():
                        window.after_id = window.after(0, lambda: window.geometry(f'{window_width}x{window_height}+{int(new_x)}+{int(new_y)}'))
                    
                    last_update = current_time
                    time.sleep(0.03)
                    
                except:
                    break
        
        # Start bounce animation in separate thread
        self.bounce_thread = threading.Thread(target=bounce_animation, daemon=True)
        self.bounce_thread.start()
        
        # Keep on top
        def keep_on_top():
            if self.notification_active:
                try:
                    window.lift()
                    window.after(1000, keep_on_top)
                except:
                    pass
        
        window.after(100, keep_on_top)
        
        # Show notification in terminal
        print(f"   ⏸️ Notification will STAY until dismissed")
        print(f"   🎯 Floating bounce animation active")
        
        # Run window
        window.mainloop()
        
        # Clean up after window closes
        self.animation_running = False
    
    def check_for_alerts(self):
        """Monitor for alerts"""
        print("\n" + "="*70)
        print("🔔 FOCUSGUARD WINDOWS 11 NOTIFICATIONS")
        print("="*70)
        print("\n📢 FEATURES:")
        print("   • Modern Windows 11 style")
        print("   • Bottom-right corner")
        print("   • ⏸️ STAYS UNTIL YOU DISMISS")
        print("   • 🎯 FLOATING BOUNCE ANIMATION")
        print("   • Curvy rounded corners")
        print("   • View button - opens TradingView chart")
        print("   • Dismiss button - closes notification")
        print("   • ✅ FIXED: Service no longer crashes")
        print("="*70)
        print("\n📡 Monitoring for alerts...\n")
        print("   (Notifications will STAY until you click Dismiss)")
        print("   (Service will keep running after dismissal)\n")
        
        # Initialize
        try:
            response = requests.get(f"{self.blocker_url}/status", timeout=2)
            if response.status_code == 200:
                data = response.json()
                self.last_alert_id = f"{data.get('lastAlertTicker')}|{data.get('lastAlertMessage')}|{data.get('lastAlertTime')}"
        except:
            print("⚠️ Could not connect to blocker. Make sure focusguard_blocker.py is running.")
        
        self.initialized = True
        
        while True:
            try:
                response = requests.get(f"{self.blocker_url}/status", timeout=2)
                
                if response.status_code == 200:
                    data = response.json()
                    
                    current_alert = f"{data.get('lastAlertTicker')}|{data.get('lastAlertMessage')}|{data.get('lastAlertTime')}"
                    
                    if (current_alert != self.last_alert_id and 
                        data.get('lastAlertMessage') and 
                        self.initialized):
                        
                        self.last_alert_id = current_alert
                        
                        ticker = data.get('lastAlertTicker', 'ALERT')
                        message = data.get('lastAlertMessage', 'Alert triggered!')
                        
                        print(f"\n🔔 New Alert: {ticker}")
                        print(f"   Message: {message}")
                        print(f"   Time: {datetime.now().strftime('%H:%M:%S')}")
                        
                        # Show notification in separate thread
                        thread = threading.Thread(
                            target=self.show_notification,
                            args=(ticker, message),
                            daemon=True
                        )
                        thread.start()
                        
            except requests.exceptions.ConnectionError:
                # Silent on connection errors
                pass
            except Exception as e:
                print(f"Error: {e}")
            
            time.sleep(2)
    
    def run(self):
        """Start service"""
        print("\n" + "="*70)
        print("🔔 FOCUSGUARD SERVICE STARTED")
        print("="*70)
        print("✅ Crash fixes applied - service will keep running")
        print("✅ Safe thread handling implemented")
        print("✅ Clean shutdown on dismiss")
        print("="*70)
        
        try:
            self.check_for_alerts()
        except KeyboardInterrupt:
            print("\n👋 Shutting down...")
            self.stop_sound()
            self.animation_running = False

if __name__ == "__main__":
    service = AlertService()
    service.run()