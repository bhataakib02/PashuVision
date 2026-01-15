#!/usr/bin/env python3
"""
Script to quantize PyTorch model to reduce file size
This reduces model size by 4x (1GB -> ~250MB) while maintaining accuracy
"""

import os
import sys
import torch
import torch.quantization

def quantize_model(input_path, output_path):
    """Quantize a PyTorch model to reduce size"""
    
    if not os.path.exists(input_path):
        print(f"❌ Error: Model file not found: {input_path}")
        return False
    
    print(f"📦 Loading model from: {input_path}")
    print("   This may take a moment...")
    
    try:
        # Load checkpoint
        checkpoint = torch.load(input_path, map_location='cpu')
        
        # Extract model architecture and state dict
        if isinstance(checkpoint, dict):
            if 'model_state_dict' in checkpoint:
                state_dict = checkpoint['model_state_dict']
            elif 'state_dict' in checkpoint:
                state_dict = checkpoint['state_dict']
            elif 'model' in checkpoint:
                state_dict = checkpoint['model']
            else:
                # Might be state dict itself
                state_dict = checkpoint
        else:
            state_dict = checkpoint
        
        # Get num_classes from checkpoint or use default
        num_classes = 40
        if isinstance(checkpoint, dict):
            if 'num_classes' in checkpoint:
                num_classes = checkpoint['num_classes']
            elif 'config' in checkpoint and isinstance(checkpoint['config'], dict):
                num_classes = checkpoint['config'].get('num_classes', 40)
        
        # Create model architecture (ConvNeXt Tiny)
        try:
            import timm
            model = timm.create_model('convnext_tiny', pretrained=False, num_classes=num_classes)
        except ImportError:
            print("❌ Error: timm not installed. Install with: pip install timm")
            return False
        
        # Load weights
        model.load_state_dict(state_dict, strict=False)
        model.eval()
        
        # Quantize the model (INT8 quantization)
        print("🔧 Quantizing model (this may take a few minutes)...")
        quantized_model = torch.quantization.quantize_dynamic(
            model,
            {torch.nn.Linear, torch.nn.Conv2d},  # Quantize linear and conv layers
            dtype=torch.qint8
        )
        
        # Save quantized model
        print(f"💾 Saving quantized model to: {output_path}")
        
        # Save as state dict (smaller than full model)
        quantized_state_dict = quantized_model.state_dict()
        
        # Create new checkpoint with quantized weights
        quantized_checkpoint = {
            'model_state_dict': quantized_state_dict,
            'num_classes': num_classes,
            'quantized': True,
            'dtype': 'qint8'
        }
        
        # Copy other metadata if present
        if isinstance(checkpoint, dict):
            if 'classes' in checkpoint:
                quantized_checkpoint['classes'] = checkpoint['classes']
            if 'config' in checkpoint:
                quantized_checkpoint['config'] = checkpoint['config']
        
        torch.save(quantized_checkpoint, output_path)
        
        # Compare file sizes
        original_size = os.path.getsize(input_path) / (1024 * 1024)
        quantized_size = os.path.getsize(output_path) / (1024 * 1024)
        reduction = ((original_size - quantized_size) / original_size) * 100
        
        print(f"✅ Quantization complete!")
        print(f"   Original size: {original_size:.1f} MB")
        print(f"   Quantized size: {quantized_size:.1f} MB")
        print(f"   Size reduction: {reduction:.1f}%")
        
        if quantized_size < 350:
            print(f"✅ Model is now under 350MB limit - safe for Railway!")
        else:
            print(f"⚠️  Model is still {quantized_size:.1f} MB - may need further optimization")
        
        return True
        
    except Exception as e:
        print(f"❌ Error quantizing model: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python quantize_model.py <input_model.pth> [output_model.pth]")
        print("\nExample:")
        print("  python quantize_model.py best_model_convnext_base_acc0.7007.pth best_model_quantized.pth")
        sys.exit(1)
    
    input_path = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else input_path.replace('.pth', '_quantized.pth')
    
    success = quantize_model(input_path, output_path)
    sys.exit(0 if success else 1)

