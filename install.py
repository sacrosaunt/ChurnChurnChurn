#!/usr/bin/env python3
"""
Simple installation script for ChurnChurnChurn.
This script installs the application and its dependencies.
"""

import os
import sys
import subprocess
import shutil
from pathlib import Path

def run_command(cmd, description):
    """Run a command and handle errors, updating the line in place."""
    print(f"🔄 {description}...", end="", flush=True)
    try:
        result = subprocess.run(cmd, shell=True, check=True, capture_output=True, text=True)
        # Move cursor to the beginning of the line and overwrite with "done!" message
        print(f"\r✅ {description}... done!{' ' * 20}")
        return True
    except subprocess.CalledProcessError as e:
        # On failure, move to the beginning of the line, report failure, and then print details
        print(f"\r❌ {description}... failed!{' ' * 20}")
        if e.stdout:
            print(f"   stdout: {e.stdout}")
        if e.stderr:
            print(f"   stderr: {e.stderr}")
        return False

def create_launcher_script():
    """Create platform-specific launcher scripts for easy execution."""
    # --- Create Unix (macOS/Linux) Launcher ---
    launcher_content_unix = f"""#!/bin/bash
# Churn Launcher Script
cd "$(dirname "$0")"
# Use the python from the virtual environment
"{Path('.venv/bin/python').absolute()}" app.py
"""
    launcher_path_unix = Path("churn")
    with open(launcher_path_unix, "w", newline='\n') as f:
        f.write(launcher_content_unix)
    os.chmod(launcher_path_unix, 0o755)
    print(f"✅ Created Unix launcher: {launcher_path_unix}")

    # --- Create Windows Launcher ---
    launcher_content_windows = f"""@echo off
REM Churn Launcher Script
cd /d "%~dp0"
REM Use the python from the virtual environment
"{Path('.venv/Scripts/python.exe').absolute()}" app.py
"""
    launcher_path_windows = Path("churn.bat")
    with open(launcher_path_windows, "w", newline='\r\n') as f:
        f.write(launcher_content_windows)
    print(f"✅ Created Windows launcher: {launcher_path_windows}")


def main():
    """Main installation process."""
    print("🚀 Installing ChurnChurnChurn...")
    
    # Check Python version
    if sys.version_info < (3, 8):
        print("❌ Python 3.8 or higher is required")
        sys.exit(1)
    
    print(f"✅ Python {sys.version_info.major}.{sys.version_info.minor} detected")
    
    # Create virtual environment
    venv_dir = Path(".venv")
    if not venv_dir.exists():
        if not run_command(f"{sys.executable} -m venv {venv_dir}", "Creating virtual environment"):
            print("❌ Failed to create virtual environment.")
            sys.exit(1)
    else:
        print("✅ Virtual environment already exists.")

    # Determine python executable path in venv
    if sys.platform == "win32":
        python_executable = venv_dir / "Scripts" / "python.exe"
    else:
        python_executable = venv_dir / "bin" / "python"

    # Install dependencies into the virtual environment
    pip_command = f'"{python_executable}" -m pip install -r requirements.txt'
    if not run_command(pip_command, "Installing dependencies"):
        print("❌ Failed to install dependencies")
        sys.exit(1)
    
    # Create launcher script only if not being run from the packaged launcher
    if os.getenv("CCC_INSTALL_MODE") != "launcher":
        create_launcher_script()
    
    # Create a marker file to indicate successful installation
    Path(".install_complete").touch()
    
    print("\n🎉 Installation completed successfully!")
    # Show a different message if being run from the launcher
    if os.getenv("CCC_INSTALL_MODE") != "launcher":
        print("\nYou can now run the application using:")
        print("  - ./churn (on macOS/Linux)")
        print("  - churn.bat (on Windows)")
    print("\nThe application will open in your browser at http://127.0.0.1:5000")

if __name__ == "__main__":
    main()
