#!/usr/bin/env python3
"""
Startup validation script for Railway deployment
Validates environment and dependencies before starting the service
"""

import os
import sys

def validate_environment():
    """Validate that all required environment variables and dependencies are available"""
    errors = []
    warnings = []
    
    # Check PORT is set (Railway sets this automatically)
    port = os.environ.get('PORT')
    if not port:
        warnings.append("PORT environment variable not set, will use default 5001")
    else:
        try:
            port_int = int(port)
            if port_int < 1 or port_int > 65535:
                errors.append(f"Invalid PORT value: {port}")
        except ValueError:
            errors.append(f"PORT must be a number, got: {port}")
    
    # Check Python version
    python_version = sys.version_info
    if python_version.major < 3 or (python_version.major == 3 and python_version.minor < 8):
        errors.append(f"Python 3.8+ required, got {python_version.major}.{python_version.minor}")
    
    # Check critical imports
    try:
        import flask
    except ImportError:
        errors.append("Flask not installed")
    
    try:
        import torch
    except ImportError:
        errors.append("PyTorch not installed")
    
    try:
        import gunicorn
    except ImportError:
        errors.append("Gunicorn not installed")
    
    # Check model file exists (warning, not error - it can be downloaded)
    script_dir = os.path.dirname(os.path.abspath(__file__))
    model_path = os.path.join(script_dir, 'best_model_convnext_base_acc0.7007.pth')
    if not os.path.exists(model_path):
        warnings.append("Model file not found, will attempt download on startup")
    
    # Print results
    if warnings:
        for warning in warnings:
            print(f"⚠️  WARNING: {warning}", flush=True)
    
    if errors:
        print("❌ STARTUP VALIDATION FAILED:", flush=True)
        for error in errors:
            print(f"   - {error}", flush=True)
        return False
    
    print("✅ Startup validation passed", flush=True)
    return True

if __name__ == '__main__':
    success = validate_environment()
    sys.exit(0 if success else 1)

