"""
Python microservice to run PyTorch .pth model predictions
This service loads the new ConvNeXt model and provides predictions via HTTP API
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import torch
import torch.nn as nn
import torchvision.transforms as transforms
from PIL import Image
import io
import json
import os
import sys
import threading

app = Flask(__name__)
CORS(app)

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
        print("⚠️  timm not found. Installing...")
        os.system("pip install timm")
        import timm
        model = timm.create_model('convnext_tiny', pretrained=False, num_classes=num_classes)
        return model

def load_model():
    """Load the PyTorch model"""
    global model, model_info
    
    script_dir = os.path.dirname(os.path.abspath(__file__))
    pth_path = os.path.join(script_dir, 'best_model_convnext_base_acc0.7007.pth')
    model_info_path = os.path.join(script_dir, 'model_info.json')
    
    print(f"   Looking for model at: {pth_path}")
    if not os.path.exists(pth_path):
        print(f"⚠️  Model file not found: {pth_path}")
        print(f"   Current working directory: {os.getcwd()}")
        print(f"   Script directory: {script_dir}")
        
        # Try to download from MODEL_DOWNLOAD_URL if set, or use default GitHub release
        model_url = os.environ.get('MODEL_DOWNLOAD_URL')
        
        # Default GitHub release URL if not set
        if not model_url:
            model_url = "https://github.com/bhataakib02/-PashuVision/releases/download/v1.0/best_model_convnext_base_acc0.7007.pth"
            print("   MODEL_DOWNLOAD_URL not set, using default GitHub release")
        
        print(f"   Attempting to download model from: {model_url}")
        try:
            import urllib.request
            import sys
            
            # Show download progress for large files
            def show_progress(block_num, block_size, total_size):
                downloaded = block_num * block_size
                percent = min(100, (downloaded * 100) // total_size) if total_size > 0 else 0
                sys.stdout.write(f"\r   Downloading: {percent}% ({downloaded // 1024 // 1024}MB / {total_size // 1024 // 1024}MB)")
                sys.stdout.flush()
            
            print("   Downloading model file (this may take a few minutes)...")
            urllib.request.urlretrieve(model_url, pth_path, show_progress)
            print()  # New line after progress
            file_size = os.path.getsize(pth_path)
            print(f"✅ Model downloaded successfully: {pth_path} ({file_size / 1024 / 1024:.2f} MB)")
        except Exception as e:
            print(f"\n❌ Failed to download model: {e}")
            import traceback
            traceback.print_exc()
            return False
    else:
        file_size = os.path.getsize(pth_path)
        print(f"✅ Model file found: {pth_path} ({file_size} bytes)")
    
    # Load model info - declare local variable first, then assign to global
    local_model_info = None
    try:
        if os.path.exists(model_info_path):
            with open(model_info_path, 'r') as f:
                local_model_info = json.load(f)
            print(f"✅ Loaded model info: {len(local_model_info.get('classes', []))} breeds")
        else:
            print("⚠️  model_info.json not found, using defaults")
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
                print(f"✅ Loaded {len(checkpoint['classes'])} breed classes from checkpoint")
            
            # Extract config and num_classes
            if 'config' in checkpoint and isinstance(checkpoint['config'], dict):
                config = checkpoint['config']
                if 'num_classes' in config:
                    local_model_info['num_classes'] = config['num_classes']
                if 'model_name' in config:
                    print(f"   Model name from checkpoint: {config['model_name']}")
            
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
                    print(f"   Updating num_classes from {num_classes} to {inferred_classes} (from model)")
                    num_classes = inferred_classes
                    local_model_info['num_classes'] = num_classes
        
        # Try ConvNeXt Base first (since filename suggests convnext_base)
        try:
            import timm
            model = timm.create_model('convnext_base', pretrained=False, num_classes=num_classes)
            print("✅ Created ConvNeXt Base model")
        except Exception as e:
            print(f"   Failed to create ConvNeXt Base: {e}")
            # Fallback to ConvNeXt Tiny
            model = create_convnext_tiny(num_classes)
            print("✅ Created ConvNeXt Tiny model (fallback)")
        
        # Load weights
        if state_dict is not None:
            # Handle potential key mismatches (remove 'module.' prefix if present)
            if any(k.startswith('module.') for k in state_dict.keys()):
                state_dict = {k.replace('module.', ''): v for k, v in state_dict.items()}
            
            # Load with strict=False to handle any minor mismatches
            missing_keys, unexpected_keys = model.load_state_dict(state_dict, strict=False)
            if missing_keys:
                print(f"⚠️  Missing keys (using defaults): {len(missing_keys)} keys")
                if len(missing_keys) < 10:
                    print(f"   Examples: {missing_keys[:5]}")
            if unexpected_keys:
                print(f"⚠️  Unexpected keys (ignored): {len(unexpected_keys)} keys")
        else:
            print("❌ No state dict found in checkpoint")
            return False
        
        model = model.to(device)
        model.eval()
        
        # Now assign to global variable
        model_info = local_model_info
        
        print(f"✅ Model loaded successfully on {device}")
        print(f"   Model path: {pth_path}")
        print(f"   Number of classes: {num_classes}")
        if local_model_info.get('classes'):
            print(f"   Breed classes: {len(local_model_info['classes'])}")
        return True
        
    except Exception as e:
        print(f"❌ Error loading model: {e}")
        import traceback
        traceback.print_exc()
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
        print("🔄 Starting background model loading...")
        script_dir = os.path.dirname(os.path.abspath(__file__))
        print(f"   Script directory: {script_dir}")
        print(f"   Contents of {script_dir}:")
        try:
            for item in os.listdir(script_dir):
                item_path = os.path.join(script_dir, item)
                size = os.path.getsize(item_path) if os.path.isfile(item_path) else 0
                print(f"      - {item} ({size} bytes)" if os.path.isfile(item_path) else f"      - {item}/")
        except Exception as e:
            print(f"      Error listing directory: {e}")
        
        model_loaded = load_model()
        if model_loaded:
            print("✅ Model loaded successfully in background")
        else:
            model_load_error = "Model file not found or download failed"
            print(f"⚠️  {model_load_error}")
    except Exception as e:
        model_load_error = str(e)
        print(f"❌ Error loading model in background: {e}")
        import traceback
        traceback.print_exc()
    finally:
        model_loading = False

if __name__ == '__main__':
    # Force stdout/stderr to be unbuffered for Railway logs
    sys.stdout.reconfigure(line_buffering=True) if hasattr(sys.stdout, 'reconfigure') else None
    sys.stderr.reconfigure(line_buffering=True) if hasattr(sys.stderr, 'reconfigure') else None
    
    try:
        print("🚀 Starting PyTorch Prediction Service...", flush=True)
        print(f"   Device: {device}", flush=True)
        print(f"   Working directory: {os.getcwd()}", flush=True)
        print(f"   Script location: {os.path.abspath(__file__)}", flush=True)
        print(f"   Python version: {sys.version}", flush=True)
        print(f"   Python executable: {sys.executable}", flush=True)
        
        # Start model loading in background thread
        try:
            model_thread = threading.Thread(target=load_model_background, daemon=True)
            model_thread.start()
            print("   Model loading started in background thread", flush=True)
        except Exception as e:
            print(f"   ⚠️  Could not start model loading thread: {e}", flush=True)
            print("   Service will start anyway, but model won't be available", flush=True)
        
        # Start Flask server immediately (don't wait for model)
        port = int(os.environ.get('PORT', 5001))
        print(f"✅ Starting Flask server immediately on port {port}", flush=True)
        print(f"   Health check available at: http://0.0.0.0:{port}/health", flush=True)
        print(f"   Environment PORT variable: {os.environ.get('PORT', 'not set')}", flush=True)
        print(f"   Model will load in background - /predict will work once model is ready", flush=True)
        
        # Ensure Flask uses the correct host and port
        # Use threaded=True for better concurrency
        try:
            app.run(host='0.0.0.0', port=port, debug=False, threaded=True, use_reloader=False)
        except OSError as e:
            if "Address already in use" in str(e):
                print(f"❌ Port {port} is already in use", flush=True)
                sys.exit(1)
            else:
                raise
    except KeyboardInterrupt:
        print("\n⚠️  Service interrupted by user", flush=True)
        sys.exit(0)
    except Exception as e:
        print(f"❌ Fatal error starting service: {e}", flush=True)
        import traceback
        traceback.print_exc()
        sys.exit(1)

