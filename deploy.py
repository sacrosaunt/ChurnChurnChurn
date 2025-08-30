#!/usr/bin/env python3
"""
Deployment script for ChurnChurnChurn.
This script creates a distributable package without complex Python packaging.
"""

import os
import shutil
import zipfile
import tarfile
import re
from pathlib import Path
from datetime import datetime

def get_app_version():
    """Reads the version from src/__init__.py to avoid importing the package."""
    init_py = Path("src/__init__.py").read_text()
    match = re.search(r"^__version__\s*=\s*['\"]([^'\"]+)['\"]", init_py, re.M)
    if match:
        return match.group(1)
    raise RuntimeError("Unable to find version string in src/__init__.py.")

def create_distribution():
    """Create a distributable package."""
    print("🚀 Creating ChurnChurnChurn distribution...")
    
    # Create distribution directory
    dist_dir = Path("dist")
    if dist_dir.exists():
        shutil.rmtree(dist_dir)
    dist_dir.mkdir()
    
    # Create package directory
    version = get_app_version()
    package_name = f"ChurnChurnChurn-{version}"
    package_dir = dist_dir / package_name
    package_dir.mkdir()
    
    # Files and directories to include
    include_patterns = [
        "app.py",
        "requirements.txt",
        "README.md",
        "LICENSE",
        "install.py",
        "deploy.py",
        "src/",
        "static/",
        "templates/",
    ]
    
    # Copy files and directories
    for pattern in include_patterns:
        source = Path(pattern)
        if source.exists():
            if source.is_file():
                shutil.copy2(source, package_dir / source.name)
                print(f"✅ Copied file: {pattern}")
            elif source.is_dir():
                shutil.copytree(source, package_dir / source.name)
                print(f"✅ Copied directory: {pattern}")
        else:
            print(f"⚠️  Warning: {pattern} not found")
    
    # --- Create Unix (macOS/Linux) Launcher ---
    launcher_content_unix = """#!/bin/bash
# Churn Launcher Script

# Get the directory where the script is located
BASE_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$BASE_DIR"

# Check if installation is complete
if [ ! -f ".install_complete" ]; then
    echo "First-time setup: Installing dependencies and creating virtual environment..."
    CCC_INSTALL_MODE=launcher python3 install.py
    
    # Check if installation was successful
    if [ $? -ne 0 ]; then
        echo "❌ Installation failed. Please run 'python3 install.py' manually to see the error."
        exit 1
    fi
fi

# Define path to python executable in venv
VENV_PYTHON="$BASE_DIR/.venv/bin/python"

# Check if the venv python executable exists
if [ ! -f "$VENV_PYTHON" ]; then
    echo "❌ Virtual environment python not found! It should have been created by the installer."
    echo "Please try running 'python3 install.py' again."
    exit 1
fi

# Run the application using the venv's python
echo "🚀 Starting ChurnChurnChurn..."
"$VENV_PYTHON" app.py
"""
    
    launcher_path_unix = package_dir / "churn"
    with open(launcher_path_unix, "w", newline='\n') as f:
        f.write(launcher_content_unix)
    os.chmod(launcher_path_unix, 0o755)
    print("✅ Created Unix launcher script")

    # --- Create Windows Launcher ---
    launcher_content_windows = """@echo off
REM Churn Launcher Script

REM Get the directory where the script is located
cd /d "%~dp0"

REM Check if installation is complete
if not exist ".install_complete" (
    echo First-time setup: Installing dependencies and creating virtual environment...
    set "CCC_INSTALL_MODE=launcher" && python3 install.py
    
    if %errorlevel% neq 0 (
        echo ❌ Installation failed. Please run 'python3 install.py' manually to see the error.
        exit /b 1
    )
)

REM Define path to python executable in venv
set "VENV_PYTHON=%~dp0.venv\\Scripts\\python.exe"

REM Check if the venv python executable exists
if not exist "%VENV_PYTHON%" (
    echo ❌ Virtual environment python not found! It should have been created by the installer.
    echo Please try running 'python3 install.py' again.
    exit /b 1
)

REM Run the application using the venv's python
echo 🚀 Starting ChurnChurnChurn...
"%VENV_PYTHON%" app.py
"""
    launcher_path_windows = package_dir / "churn.bat"
    with open(launcher_path_windows, "w", newline='\r\n') as f:
        f.write(launcher_content_windows)
    print("✅ Created Windows launcher script")
    
    # Create installation instructions
    install_instructions = """# ChurnChurnChurn Installation

## Quick Start

1. Install Python 3.8 or higher
2. Run the installation script:
   ```bash
   python3 install.py
   ```

3. Run the application:
   ```bash
   python3 app.py
   # or
   ./churnchurnchurn
   ```

## Manual Installation

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

2. Run the application:
   ```bash
   python3 app.py
   ```

## Setup

On first run, you'll be prompted to enter your API keys for OpenAI and/or Google Gemini.
"""
    
    with open(package_dir / "INSTALL.md", "w") as f:
        f.write(install_instructions)
    print("✅ Created installation instructions")
    
    # Create archives
    print("📦 Creating distribution archives...")
    
    # ZIP archive
    zip_path = dist_dir / f"{package_name}.zip"
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(package_dir):
            for file in files:
                file_path = Path(root) / file
                arcname = file_path.relative_to(package_dir)
                zipf.write(file_path, arcname)
    print(f"✅ Created ZIP archive: {zip_path}")
    
    # TAR.GZ archive
    tar_path = dist_dir / f"{package_name}.tar.gz"
    with tarfile.open(tar_path, "w:gz") as tar:
        tar.add(package_dir, arcname=package_name)
    print(f"✅ Created TAR.GZ archive: {tar_path}")
    
    print(f"\n🎉 Distribution created successfully in {dist_dir}/")
    print(f"Package directory: {package_dir}")
    print(f"ZIP archive: {zip_path}")
    print(f"TAR.GZ archive: {tar_path}")
    
    return dist_dir

def main():
    """Main deployment process."""
    try:
        create_distribution()
    except Exception as e:
        print(f"❌ Deployment failed: {e}")
        return 1
    
    return 0

if __name__ == "__main__":
    exit(main())
