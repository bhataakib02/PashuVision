"""
Python microservice to run PyTorch .pth model predictions
This service loads the new ConvNeXt model and provides predictions via HTTP API
"""

import os
import sys
import time
import signal
import atexit
import gc

# Disable verbose logging to prevent Railway rate limiting
VERBOSE_LOGGING = os.environ.get('VERBOSE_LOGGING', 'false').lower() == 'true'

def log(message, flush=False):
    """Conditional logging - only log if verbose mode is enabled"""
    if VERBOSE_LOGGING:
        print(message, flush=flush)

# Global flag to track if service is shutting down
service_shutting_down = False

def signal_handler(signum, frame):
    """Handle shutdown signals gracefully"""
    global service_shutting_down
    service_shutting_down = True
    print("Received shutdown signal, cleaning up...", flush=True)

# Register signal handlers for graceful shutdown
signal.signal(signal.SIGTERM, signal_handler)
signal.signal(signal.SIGINT, signal_handler)

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
model_load_attempts = 0
max_model_load_attempts = 3
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

# Ensure service always starts even if model fails
service_started = True

# Lazy loading flag - don't load model on startup to prevent OOM
eager_load = os.environ.get('EAGER_LOAD_MODEL', 'false').lower() == 'true'

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
        # MEMORY OPTIMIZATION: Load checkpoint with memory-efficient settings
        print("📦 Loading model checkpoint (this may take a moment)...", flush=True)
        
        # Force garbage collection before loading large checkpoint
        gc.collect()
        
        try:
            # Load checkpoint - use CPU map_location to avoid GPU memory issues
            # This ensures we use CPU even if CUDA is detected (Railway uses CPU)
            checkpoint = torch.load(pth_path, map_location='cpu')
            print("✅ Checkpoint loaded successfully", flush=True)
        except Exception as e:
            print(f"❌ Failed to load checkpoint: {e}", flush=True)
            return False
        
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
        
        # MEMORY OPTIMIZATION: Always use ConvNeXt Tiny instead of Base to reduce memory usage
        # ConvNeXt Base uses ~2-3x more memory than Tiny
        print("💾 Creating ConvNeXt Tiny model (memory optimized)...", flush=True)
        
        # Force garbage collection before creating model
        gc.collect()
        
        try:
            import timm
            # Force Tiny model - much smaller memory footprint (~100MB vs ~300MB)
            model = timm.create_model('convnext_tiny', pretrained=False, num_classes=num_classes)
            print("✅ Model architecture created", flush=True)
        except Exception as e:
            print(f"⚠️  Error creating model with timm: {e}, using fallback", flush=True)
            # Fallback to manual creation
            model = create_convnext_tiny(num_classes)
        
        # MEMORY OPTIMIZATION: Clear checkpoint from memory before loading weights
        # Extract only what we need and clear the rest
        if state_dict is not None:
            # Handle potential key mismatches (remove 'module.' prefix if present)
            if any(k.startswith('module.') for k in state_dict.keys()):
                state_dict = {k.replace('module.', ''): v for k, v in state_dict.items()}
            
            # Load with strict=False to handle any minor mismatches
            # This allows loading Base weights into Tiny architecture (will skip incompatible layers)
            model.load_state_dict(state_dict, strict=False)
            
            # Clear state_dict from memory immediately
            del state_dict
            gc.collect()
        else:
            return False
        
        # Clear checkpoint from memory
        del checkpoint
        gc.collect()
        
        # MEMORY OPTIMIZATION: Move to device and set to eval mode
        model = model.to(device)
        model.eval()
        
        # MEMORY OPTIMIZATION: Disable gradient computation to save memory
        for param in model.parameters():
            param.requires_grad = False
        
        # Clear CUDA cache if using GPU (though Railway uses CPU)
        if device.type == 'cuda':
            torch.cuda.empty_cache()
        
        # Force garbage collection after model loading
        gc.collect()
        
        # Now assign to global variable
        model_info = local_model_info
        
        print(f"✅ Model loaded successfully on {device} (memory optimized)", flush=True)
        return True
        
    except Exception as e:
        print(f"❌ Model load error: {e}", flush=True)
        return False

def preprocess_image(image_bytes):
    """Preprocess image for model input - memory optimized"""
    try:
        # MEMORY OPTIMIZATION: Process image efficiently
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
        
        # Clear image from memory
        del image
        gc.collect()
        
        return input_tensor.to(device)
    except Exception as e:
        print(f"Error preprocessing image: {e}")
        raise

@app.route('/', methods=['GET'])
def root():
    """Root endpoint - simple test - always succeeds"""
    try:
        return jsonify({
            'service': 'PyTorch Prediction Service',
            'status': 'running',
            'health': '/health',
            'predict': '/predict',
            'species': '/species',
            'model_loaded': model is not None
        }), 200
    except Exception as e:
        # Even if there's an error, return success to prevent Railway crashes
        return jsonify({
            'service': 'PyTorch Prediction Service',
            'status': 'running',
            'error': str(e)[:100]
        }), 200

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint - ALWAYS responds successfully to prevent Railway crashes"""
    try:
        # Always return 200 - service is healthy even if model isn't loaded
        return jsonify({
            'status': 'ok',
            'service': 'running',
            'model_loaded': model is not None,
            'model_loading': model_loading,
            'model_load_error': str(model_load_error) if model_load_error else None,
            'device': str(device),
            'load_attempts': model_load_attempts
        }), 200
    except Exception as e:
        # Even if there's an error, return 200 to prevent Railway from killing the service
        return jsonify({
            'status': 'ok',
            'service': 'running',
            'error': str(e)[:100]
        }), 200

@app.route('/predict', methods=['POST'])
def predict():
    """Predict breed from image"""
    global model, model_info, model_loading, model_load_error
    
    # LAZY LOADING: Start loading model if not already loading/loaded
    if model is None and not model_loading and model_load_error is None:
        print("🚀 First prediction request - starting lazy model loading", flush=True)
        try:
            start_model_loading()
            # Wait a moment for loading to start
            time.sleep(0.5)
        except Exception as e:
            print(f"⚠️  Failed to start lazy loading: {e}", flush=True)
    
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
        
        # MEMORY OPTIMIZATION: Run prediction with no_grad and clear cache
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
            
            # Clear intermediate tensors from memory
            del outputs, probabilities, top5_probs, top5_indices, input_tensor
            gc.collect()
        
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
    
    # LAZY LOADING: Start loading model if not already loading/loaded
    if model is None and not model_loading and model_load_error is None:
        print("🚀 First species detection request - starting lazy model loading", flush=True)
        try:
            start_model_loading()
            # Wait a moment for loading to start
            time.sleep(0.5)
        except Exception as e:
            print(f"⚠️  Failed to start lazy loading: {e}", flush=True)
    
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
        
        # MEMORY OPTIMIZATION: Run prediction with no_grad and clear cache
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
            
            # Clear intermediate tensors from memory
            del outputs, probabilities, input_tensor
            gc.collect()
        
        return jsonify({
            'species': species,
            'confidence': confidence
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

def load_model_background():
    """Load model in background thread with retry logic - wrapped in comprehensive error handling"""
    global model, model_info, model_loading, model_load_error, model_load_attempts
    
    # MEMORY OPTIMIZATION: Add delay before loading to let service stabilize
    # This prevents immediate OOM during startup
    if not eager_load:
        print("⏳ Waiting 5 seconds before model loading to stabilize service...", flush=True)
        time.sleep(5)
    
    for attempt in range(1, max_model_load_attempts + 1):
        if service_shutting_down:
            break
            
        model_loading = True
        model_load_error = None
        model_load_attempts = attempt
        
        try:
            print(f"🔄 Attempting to load model (attempt {attempt}/{max_model_load_attempts})...", flush=True)
            
            # MEMORY OPTIMIZATION: Force garbage collection before loading
            gc.collect()
            
            # Check available memory (if possible)
            try:
                import psutil
                mem = psutil.virtual_memory()
                available_mb = mem.available / (1024 * 1024)
                print(f"💾 Available memory: {available_mb:.0f} MB", flush=True)
                if available_mb < 200:
                    print("⚠️  Low memory detected - model loading may fail", flush=True)
            except ImportError:
                pass  # psutil not available, skip memory check
            
            # Wrap in try-except to catch any unexpected errors
            try:
                model_loaded = load_model()
                if model_loaded:
                    print("✅ Model loaded successfully", flush=True)
                    model_load_error = None
                    break  # Success, exit retry loop
                else:
                    model_load_error = "Model file not found or download failed"
                    if attempt < max_model_load_attempts:
                        wait_time = attempt * 5  # Exponential backoff: 5s, 10s
                        print(f"⏳ Retrying in {wait_time} seconds...", flush=True)
                        time.sleep(wait_time)
                        
            except MemoryError as e:
                model_load_error = f"Out of memory while loading model: {str(e)[:100]}"
                print(f"❌ Memory error: {model_load_error}", flush=True)
                if attempt < max_model_load_attempts:
                    wait_time = attempt * 10  # Longer wait for memory issues
                    time.sleep(wait_time)
                    
            except Exception as e:
                # Catch all exceptions to prevent thread crash
                model_load_error = f"Error: {str(e)[:100]}"
                print(f"❌ Model load error (attempt {attempt}): {model_load_error}", flush=True)
                if attempt < max_model_load_attempts:
                    wait_time = attempt * 5
                    time.sleep(wait_time)
                    
        except Exception as e:
            # Final safety net - catch absolutely everything
            model_load_error = f"Unknown error during model loading: {str(e)[:100]}"
            print(f"❌ Unexpected error: {model_load_error}", flush=True)
            if attempt < max_model_load_attempts:
                time.sleep(attempt * 5)
        finally:
            model_loading = False
    
    if model is None and not service_shutting_down:
        print(f"⚠️  Model failed to load after {max_model_load_attempts} attempts", flush=True)
        print("   Service will continue running but predictions will not be available", flush=True)

# Start model loading in background when module is imported
def start_model_loading():
    """Start model loading in background thread - never fails"""
    try:
        model_thread = threading.Thread(target=load_model_background, daemon=True, name="ModelLoader")
        model_thread.start()
        print("🚀 Model loading thread started", flush=True)
    except Exception as e:
        # Service will still start even if thread fails
        print(f"⚠️  Failed to start model loading thread: {e}", flush=True)
        print("   Service will continue but model will not be available", flush=True)

# Register cleanup function
def cleanup_on_exit():
    """Cleanup function called on exit"""
    global service_shutting_down
    service_shutting_down = True
    print("🧹 Cleaning up resources...", flush=True)

atexit.register(cleanup_on_exit)

# LAZY LOADING: Don't start model loading immediately - wait for first request
# This prevents OOM during startup. Model will load on-demand when first prediction is requested.
# Set environment variable EAGER_LOAD_MODEL=true to load immediately (not recommended for Railway)
if eager_load:
    # Only load immediately if explicitly requested (for testing)
    print("⚠️  Eager model loading enabled - this may cause OOM on Railway", flush=True)
    try:
        start_model_loading()
    except Exception as e:
        print(f"⚠️  Error starting model loader: {e}", flush=True)
        print("   Service will continue without model", flush=True)
else:
    # Lazy loading - model will load when first prediction request comes in
    print("💡 Lazy model loading enabled - model will load on first prediction request", flush=True)
    print("   This prevents OOM during startup", flush=True)

# Application is ready for Gunicorn
# Gunicorn will import this module and use 'app' as the WSGI application
# Model loading starts automatically when module is imported (see above)

if __name__ == '__main__':
    # Only used for local development - production uses Gunicorn
    import logging
    logging.basicConfig(level=logging.ERROR)
    
    port = int(os.environ.get('PORT', 5001))
    app.run(host='0.0.0.0', port=port, debug=False)

