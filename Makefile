.PHONY: help clean install test lint format check dist clean-dist run run-package setup

help:  ## Show this help message
	@echo "ChurnChurnChurn - Available commands:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

clean:  ## Clean build artifacts and cache
	@echo "🧹 Cleaning build artifacts..."
	rm -rf dist/
	rm -rf __pycache__/
	rm -rf src/__pycache__/
	rm -rf src/*/__pycache__/
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete 2>/dev/null || true

install:  ## Install dependencies and create launcher
	@echo "📦 Installing ChurnChurnChurn..."
	python3 install.py

test:  ## Run tests
	@echo "🧪 Running tests..."
	pytest

lint:  ## Run linting checks
	@echo "🔍 Running linting checks..."
	flake8 src/ app.py
	mypy src/ app.py

format:  ## Format code with Black
	@echo "🎨 Formatting code..."
	black src/ app.py

check: format lint test  ## Run all quality checks

dist:  ## Create distribution packages
	@echo "📦 Creating distribution packages..."
	python3 deploy.py

clean-dist:  ## Clean distribution files
	@echo "🧹 Cleaning distribution files..."
	rm -rf dist/

run:  ## Run the application
	@echo "🚀 Starting ChurnChurnChurn..."
	python3 app.py

run-package:  ## Run the application using the launcher script
	@echo "🚀 Starting ChurnChurnChurn (using launcher)..."
	./churnchurnchurn

setup:  ## Initial setup for development
	@echo "🔧 Setting up development environment..."
	python3 -m venv .venv
	@echo "✅ Virtual environment created. Activate it with:"
	@echo "   source .venv/bin/activate  # On macOS/Linux"
	@echo "   .venv\\Scripts\\activate     # On Windows"
	@echo "Then run: make install"

.DEFAULT_GOAL := help
