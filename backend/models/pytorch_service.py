"""
Python microservice to run PyTorch .pth model predictions
This service loads the new ConvNeXt model and provides predictions via HTTP API
"""

import os
import sys

# Disable verbose logging to prevent Railway rate limiting
VERBOSE_LOGGING = os.environ.get('VERBOSE_LOGGING', 'false').lower() == 'true'

def log(message, flush=False):
    """Conditional logging - only log if verbose mode is enabled"""
    if VERBOSE_LOGGING:
        print(message, flush=flush)

# Check NumPy version BEFORE importing torch to catch compatibility issues early
try:
    import numpy as np
    numpy_version = np.__version__
    major_version = int(numpy_version.split('.')[0])
    if major_version >= 2:
        print(f"❌ ERROR: NumPy {numpy_version} is incompatible with PyTorch 2.1.0", flush=True)
        print("   PyTorch 2.1.0 requires NumPy <2.0", flush=True)
        sys.exit(1)
except ImportError:
    pass  # NumPy will be installed by PyTorch

from flask import Flask, request, jsonify
from flask_cors import CORS
import torch
import torch.nn as nn
import torchvision.transforms as transforms
from PIL import Image
import io
import json
import threading

app = Flask(__name__)
CORS(app)

# Disable Flask's default request logging to reduce log volume
import logging
log = logging.getLogger('werkzeug')
log.setLevel(logging.ERROR)

# Global model variable
model = None
model_info = None
model_loading = False
model_load_error = None
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

def create_convnext_tiny(num_classes=41):
    """Create ConvNeXt Tiny model architecture"""
    try:
        import timm
        model = timm.create_model('convnext_tiny', pretrained=False, num_classes=num_classes)
        return model
    except ImportError:
        # Silently install timm if missing
        os.system("pip install timm > /dev/null 2>&1")
        import timm
        model = timm.create_model('convnext_tiny', pretrained=False, num_classes=num_classes)
        return model

def load_model():
    """Load the PyTorch model"""
    global model, model_info
    
    script_dir = os.path.dirname(os.path.abspath(__file__))
    pth_path = os.path.join(script_dir, 'best_model_convnext_base_acc0.7007.pth')
    model_info_path = os.path.join(script_dir, 'model_info.json')
    
    if not os.path.exists(pth_path):
        # Try to download from MODEL_DOWNLOAD_URL if set, or use default GitHub release
        model_url = os.environ.get('MODEL_DOWNLOAD_URL')
        
        # Default GitHub release URL if not set
        if not model_url:
            model_url = "https://github.com/bhataakib02/-PashuVision/releases/download/v1.0/best_model_convnext_base_acc0.7007.pth"
        
        try:
            import urllib.request
            # Download silently - no progress updates to avoid log spam
            urllib.request.urlretrieve(model_url, pth_path)
        except Exception as e:
            print(f"❌ Failed to download model: {e}", flush=True)
            return False
    
    # Load model info - declare local variable first, then assign to global
    local_model_info = None
    try:
        if os.path.exists(model_info_path):
            with open(model_info_path, 'r') as f:
                local_model_info = json.load(f)
        else:
            # Use defaults silently
            local_model_info = {
                'classes': [
                    'Alambadi', 'Amritmahal', 'Ayrshire', 'Banni', 'Bargur', 'Bhadawari', 
                    'Brown_Swiss', 'Dangi', 'Deoni', 'Gir', 'Guernsey', 'Hallikar', 
                    'Hariana', 'Holstein_Friesian', 'Jaffrabadi', 'Jersey', 'Kangayam', 
                    'Kankrej', 'Kasargod', 'Kenkatha', 'Kherigarh', 'Khillari', 
                    'Krishna_Valley', 'Malnad_gidda', 'Mehsana', 'Murrah', 'Nagori', 
                    'Nagpuri', 'Nili_Ravi', 'Nimari', 'Ongole', 'Pulikulam', 'Rathi', 
                    'Red_Dane', 'Red_Sindhi', 'Sahiwal', 'Surti', 'Tharparkar', 'Toda', 
                    'Umblachery', 'Vechur'
                ],
                'num_classes': 40
            }
    except Exception as e:
        print(f"⚠️  Error loading model info: {e}, using defaults")
        local_model_info = {'classes': [], 'num_classes': 40}
    
    # Now assign to global variable
    model_info = local_model_info
    
    try:
        # Load checkpoint first to get actual config and classes
        checkpoint = torch.load(pth_path, map_location=device)
        
        # Extract metadata from checkpoint if available
        if isinstance(checkpoint, dict):
            # Extract classes from checkpoint
            if 'classes' in checkpoint and checkpoint['classes']:
                local_model_info['classes'] = checkpoint['classes']
            
            # Extract config and num_classes
            if 'config' in checkpoint and isinstance(checkpoint['config'], dict):
                config = checkpoint['config']
                if 'num_classes' in config:
                    local_model_info['num_classes'] = config['num_classes']
            
            # Also check direct num_classes key
            if 'num_classes' in checkpoint:
                local_model_info['num_classes'] = checkpoint['num_classes']
        
        # Extract state dict from checkpoint
        state_dict = None
        if isinstance(checkpoint, dict):
            if 'model_state_dict' in checkpoint:
                state_dict = checkpoint['model_state_dict']
            elif 'model' in checkpoint:
                state_dict = checkpoint['model']
            elif 'state_dict' in checkpoint:
                state_dict = checkpoint['state_dict']
            else:
                # Check if it's actually a state dict itself
                if any(key.startswith(('stem.', 'stages.', 'head.')) for key in checkpoint.keys()):
                    state_dict = checkpoint
        else:
            state_dict = checkpoint
        
        # Get number of classes - try to infer from state dict if not set
        num_classes = local_model_info.get('num_classes', 40)
        if state_dict is not None:
            # Try to infer num_classes from state dict
            if 'head.fc.weight' in state_dict:
                inferred_classes = state_dict['head.fc.weight'].shape[0]
                if num_classes != inferred_classes:
                    num_classes = inferred_classes
                    local_model_info['num_classes'] = num_classes
        
        # Try ConvNeXt Base first (since filename suggests convnext_base)
        try:
            import timm
            model = timm.create_model('convnext_base', pretrained=False, num_classes=num_classes)
        except Exception as e:
            # Fallback to ConvNeXt Tiny silently
            model = create_convnext_tiny(num_classes)
        
        # Load weights
        if state_dict is not None:
            # Handle potential key mismatches (remove 'module.' prefix if present)
            if any(k.startswith('module.') for k in state_dict.keys()):
                state_dict = {k.replace('module.', ''): v for k, v in state_dict.items()}
            
            # Load with strict=False to handle any minor mismatches
            model.load_state_dict(state_dict, strict=False)
        else:
            return False
        
        model = model.to(device)
        model.eval()
        
        # Now assign to global variable
        model_info = local_model_info
        
        return True
        
    except Exception as e:
        print(f"❌ Model load error: {e}", flush=True)
        return False

def preprocess_image(image_bytes):
    """Preprocess image for model input"""
    try:
        image = Image.open(io.BytesIO(image_bytes))
        
        # Convert to RGB if needed
        if image.mode != 'RGB':
            image = image.convert('RGB')
        
        # Get image size from model info or use default
        img_size = model_info.get('input_size', [224, 224])[0] if model_info else 224
        
        # Normalization values
        mean = model_info.get('mean', [0.485, 0.456, 0.406]) if model_info else [0.485, 0.456, 0.406]
        std = model_info.get('std', [0.229, 0.224, 0.225]) if model_info else [0.229, 0.224, 0.225]
        
        transform = transforms.Compose([
            transforms.Resize((img_size, img_size)),
            transforms.ToTensor(),
            transforms.Normalize(mean=mean, std=std)
        ])
        
        input_tensor = transform(image).unsqueeze(0)
        return input_tensor.to(device)
    except Exception as e:
        print(f"Error preprocessing image: {e}")
        raise

@app.route('/', methods=['GET'])
def root():
    """Root endpoint - simple test"""
    return jsonify({
        'service': 'PyTorch Prediction Service',
        'status': 'running',
        'health': '/health',
        'predict': '/predict',
        'species': '/species'
    }), 200

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint - responds immediately even if model is loading"""
    return jsonify({
        'status': 'ok',
        'model_loaded': model is not None,
        'model_loading': model_loading,
        'model_load_error': str(model_load_error) if model_load_error else None,
        'device': str(device)
    }), 200

@app.route('/predict', methods=['POST'])
def predict():
    """Predict breed from image"""
    global model, model_info, model_loading, model_load_error
    
    if model is None:
        if model_loading:
            return jsonify({
                'error': 'Model is still loading',
                'status': 'loading',
                'message': 'Please wait a few moments and try again'
            }), 503
        elif model_load_error:
            return jsonify({
                'error': 'Model failed to load',
                'status': 'error',
                'message': model_load_error
            }), 503
        else:
            return jsonify({
                'error': 'Model not loaded',
                'status': 'not_loaded',
                'message': 'Model is not available'
            }), 503
    
    try:
        # Get image from request
        if 'image' not in request.files:
            return jsonify({'error': 'No image provided'}), 400
        
        image_file = request.files['image']
        image_bytes = image_file.read()
        
        # Preprocess image
        input_tensor = preprocess_image(image_bytes)
        
        # Run prediction
        with torch.no_grad():
            outputs = model(input_tensor)
            probabilities = torch.nn.functional.softmax(outputs[0], dim=0)
            
            # Get top 5 predictions
            top5_probs, top5_indices = torch.topk(probabilities, 5)
            
            # Load breed names
            breeds = model_info.get('classes', []) if model_info else []
            
            predictions = []
            for prob, idx in zip(top5_probs, top5_indices):
                breed_name = breeds[idx.item()] if idx.item() < len(breeds) else f'Class_{idx.item()}'
                predictions.append({
                    'breed': breed_name,
                    'confidence': float(prob.item())
                })
        
        return jsonify({
            'predictions': predictions,
            'device': str(device)
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/species', methods=['POST'])
def detect_species():
    """Detect species (cattle/buffalo/non_animal)"""
    global model, model_info, model_loading, model_load_error
    
    if model is None:
        if model_loading:
            return jsonify({
                'error': 'Model is still loading',
                'status': 'loading',
                'message': 'Please wait a few moments and try again'
            }), 503
        elif model_load_error:
            return jsonify({
                'error': 'Model failed to load',
                'status': 'error',
                'message': model_load_error
            }), 503
        else:
            return jsonify({
                'error': 'Model not loaded',
                'status': 'not_loaded',
                'message': 'Model is not available'
            }), 503
    
    try:
        if 'image' not in request.files:
            return jsonify({'error': 'No image provided'}), 400
        
        image_file = request.files['image']
        image_bytes = image_file.read()
        
        input_tensor = preprocess_image(image_bytes)
        
        with torch.no_grad():
            outputs = model(input_tensor)
            probabilities = torch.nn.functional.softmax(outputs[0], dim=0)
            top_idx = probabilities.argmax().item()
            
            breeds = model_info.get('classes', []) if model_info else []
            breed_name = breeds[top_idx] if top_idx < len(breeds) else 'Unknown'
            
            # Classify as cattle or buffalo based on breed
            buffalo_breeds = ['Murrah', 'Mehsana', 'Surti', 'Jaffrabadi', 'Nili_Ravi', 'Nagpuri', 'Bhadawari']
            is_buffalo = any(b in breed_name for b in buffalo_breeds)
            
            species = 'buffalo' if is_buffalo else 'cattle'
            confidence = float(probabilities[top_idx].item())
        
        return jsonify({
            'species': species,
            'confidence': confidence
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

def load_model_background():
    """Load model in background thread"""
    global model, model_info, model_loading, model_load_error
    model_loading = True
    model_load_error = None
    
    try:
        model_loaded = load_model()
        if not model_loaded:
            model_load_error = "Model file not found or download failed"
    except Exception as e:
        model_load_error = str(e)
    finally:
        model_loading = False

if __name__ == '__main__':
    # Force stdout/stderr to be unbuffered for Railway logs
    sys.stdout.reconfigure(line_buffering=True) if hasattr(sys.stdout, 'reconfigure') else None
    sys.stderr.reconfigure(line_buffering=True) if hasattr(sys.stderr, 'reconfigure') else None
    
    try:
        # Start model loading in background thread
        try:
            model_thread = threading.Thread(target=load_model_background, daemon=True)
            model_thread.start()
        except Exception:
            pass  # Silently fail - service will still start
        
        # Start Flask server immediately (don't wait for model)
        port = int(os.environ.get('PORT', 5001))
        
        # Suppress Flask/Werkzeug logging completely
        import logging
        logging.getLogger('werkzeug').setLevel(logging.ERROR)
        logging.getLogger('flask').setLevel(logging.ERROR)
        
        # Ensure Flask uses the correct host and port
        # Use threaded=True for better concurrency
        # Disable Flask's default logging
        import warnings
        warnings.filterwarnings('ignore')
        
        try:
            app.run(host='0.0.0.0', port=port, debug=False, threaded=True, use_reloader=False)
        except OSError as e:
            if "Address already in use" in str(e):
                sys.exit(1)
            else:
                raise
    except KeyboardInterrupt:
        sys.exit(0)
    except Exception as e:
        print(f"❌ Fatal error: {e}", flush=True)
        sys.exit(1)

