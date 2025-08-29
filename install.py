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
    """Run a command and handle errors."""
    print(f"🔄 {description}...")
    try:
        result = subprocess.run(cmd, shell=True, check=True, capture_output=True, text=True)
        print(f"✅ {description} completed successfully")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ {description} failed: {e}")
        if e.stdout:
            print(f"   stdout: {e.stdout}")
        if e.stderr:
            print(f"   stderr: {e.stderr}")
        return False

def create_launcher_script():
    """Create a launcher script for easy execution."""
    launcher_content = """#!/bin/bash
# ChurnChurnChurn Launcher Script
cd "$(dirname "$0")"
python3 app.py
"""
    
    launcher_path = Path("churnchurnchurn")
    with open(launcher_path, "w") as f:
        f.write(launcher_content)
    
    # Make it executable
    os.chmod(launcher_path, 0o755)
    print(f"✅ Created launcher script: {launcher_path}")

def main():
    """Main installation process."""
    print("🚀 Installing ChurnChurnChurn...")
    
    # Check Python version
    if sys.version_info < (3, 8):
        print("❌ Python 3.8 or higher is required")
        sys.exit(1)
    
    print(f"✅ Python {sys.version_info.major}.{sys.version_info.minor} detected")
    
    # Install dependencies
    if not run_command("pip install -r requirements.txt", "Installing dependencies"):
        print("❌ Failed to install dependencies")
        sys.exit(1)
    
    # Create launcher script
    create_launcher_script()
    
    print("\n🎉 Installation completed successfully!")
    print("\nYou can now run the application using:")
    print("  - python app.py")
    print("  - ./churnchurnchurn")
    print("\nThe application will open in your browser at http://127.0.0.1:5000")

if __name__ == "__main__":
    main()
