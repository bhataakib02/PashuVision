// Lazy load modules only when needed
let sharp = null;
let ortModule = null;

function getSharp() {
  if (sharp === null) {
    try {
      sharp = require('sharp');
    } catch (error) {
      console.warn('⚠️  Sharp module not available. ONNX preprocessing will not work.');
      return null;
    }
  }
  return sharp;
}

function getOrt() {
  if (ortModule === null) {
    try {
      ortModule = require('onnxruntime-node');
    } catch (error) {
      console.warn('⚠️  onnxruntime-node not available');
      return null;
    }
  }
  return ortModule;
}

const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const fetch = require('node-fetch');
const crypto = require('crypto');

class PyTorchPredictor {
  constructor() {
    this.usePythonService = false;
    this.pythonServiceUrl = process.env.PYTORCH_SERVICE_URL || 'http://localhost:5001';
    // __dirname is backend/src/ai, so go up two levels to backend/models
    // Using the new ConvNeXt model
    this.modelPath = path.join(__dirname, '..', '..', 'models', process.env.MODEL_NAME_ONNX || 'model.onnx');
    this.modelPathPth = path.join(__dirname, '..', '..', 'models', 'best_model_convnext_base_acc0.7007.pth');
    this.modelInfoPath = path.join(__dirname, '..', '..', 'models', 'model_info.json');
    this.breeds = [];
    this.modelInfo = null;
    this.species = ['cattle', 'buffalo', 'non_animal'];
    this.loadModelInfo();
    this.checkModelAvailability();
  }

  async checkModelAvailability() {
    // Check if .pth file exists (use Python service)
    if (fs.existsSync(this.modelPathPth)) {
      // Check if Python service is running (with retry)
      let retries = 3;
      for (let i = 0; i < retries; i++) {
        try {
          // Create a timeout promise
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Request timeout')), 2000)
          );
          
          const fetchPromise = fetch(`${this.pythonServiceUrl}/health`);
          const response = await Promise.race([fetchPromise, timeoutPromise]);
          
          if (response.ok) {
            const data = await response.json();
            if (data.model_loaded) {
              this.usePythonService = true;
              console.log('✅ Using Python PyTorch service for predictions');
              console.log(`   Service URL: ${this.pythonServiceUrl}`);
              return;
            }
          }
        } catch (error) {
          if (i === retries - 1) {
            // Last retry failed
            console.log('❌ Python PyTorch service not available');
            console.log(`   Start the service with: cd backend/models && python pytorch_service.py`);
            console.log(`   Service URL: ${this.pythonServiceUrl}`);
            console.log('   Predictions will fail until service is running.');
          } else {
            // Wait a bit before retrying
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }
    }
    
    // Check if ONNX model exists (direct Node.js inference)
    if (fs.existsSync(this.modelPath)) {
      try {
        const ort = getOrt();
        if (!ort) {
          throw new Error('onnxruntime-node not available');
        }
        this.session = await ort.InferenceSession.create(this.modelPath);
        console.log('✅ PyTorch model (ONNX) loaded successfully');
        this.usePythonService = false;
        return;
      } catch (error) {
        console.log('⚠️  Failed to load ONNX model:', error.message);
      }
    }
    
      console.log('❌ No model available - predictions will fail');
  }

  loadModelInfo() {
    try {
      if (fs.existsSync(this.modelInfoPath)) {
        this.modelInfo = JSON.parse(fs.readFileSync(this.modelInfoPath, 'utf8'));
        this.breeds = this.modelInfo.classes || [];
        console.log(`Loaded model info: ${this.breeds.length} breeds`);
      } else {
        // Fallback to default breeds
        this.breeds = [
          'Alambadi', 'Amritmahal', 'Ayrshire', 'Banni', 'Bargur', 'Bhadawari', 
          'Brown_Swiss', 'Dangi', 'Deoni', 'Gir', 'Guernsey', 'Hallikar', 
          'Hariana', 'Holstein_Friesian', 'Jaffrabadi', 'Jersey', 'Kangayam', 
          'Kankrej', 'Kasargod', 'Kenkatha', 'Kherigarh', 'Khillari', 
          'Krishna_Valley', 'Malnad_gidda', 'Mehsana', 'Murrah', 'Nagori', 
          'Nagpuri', 'Nili_Ravi', 'Nimari', 'Ongole', 'Pulikulam', 'Rathi', 
          'Red_Dane', 'Red_Sindhi', 'Sahiwal', 'Surti', 'Tharparkar', 'Toda', 
          'Umblachery', 'Vechur'
        ];
        console.log('Using default breed list');
      }
    } catch (error) {
      console.error('Failed to load model info:', error);
      this.breeds = [];
    }
  }

  async loadModel() {
    // Model loading is now handled in checkModelAvailability()
    // This method is kept for backward compatibility
    return this.usePythonService || this.session !== null;
  }

  async preprocessImage(imageBuffer) {
    try {
      // Get sharp module (lazy load)
      const sharpModule = getSharp();
      if (!sharpModule) {
        throw new Error('Sharp module not available. Cannot preprocess image for ONNX model.');
      }
      
      // Get normalization values from model info or use defaults
      const mean = this.modelInfo?.mean || [0.485, 0.456, 0.406];
      const std = this.modelInfo?.std || [0.229, 0.224, 0.225];
      const imgSize = this.modelInfo?.input_size?.[0] || 224;
      
      // Resize and normalize image for model input
      const processed = await sharpModule(imageBuffer)
        .resize(imgSize, imgSize)
        .removeAlpha()
        .raw()
        .toBuffer();
      
      // Convert to float32 array and normalize
      const pixels = new Float32Array(processed.length);
      
      for (let i = 0; i < processed.length; i += 3) {
        const r = processed[i] / 255.0;
        const g = processed[i + 1] / 255.0;
        const b = processed[i + 2] / 255.0;
        
        pixels[i] = (r - mean[0]) / std[0];
        pixels[i + 1] = (g - mean[1]) / std[1];
        pixels[i + 2] = (b - mean[2]) / std[2];
      }
      
      // Reshape to [1, 3, imgSize, imgSize] for RGB channels (ONNX format)
      const ort = getOrt();
      if (!ort) {
        throw new Error('onnxruntime-node not available');
      }
      const input = new ort.Tensor('float32', pixels, [1, 3, imgSize, imgSize]);
      return input;
    } catch (error) {
      console.error('Image preprocessing failed:', error);
      throw error;
    }
  }

  async predictBreed(imageBuffer) {
    try {
      // PRIORITY 1: Use Python service if model file exists (primary method)
      if (fs.existsSync(this.modelPathPth)) {
        // Always try Python service first if model file exists
        try {
          const result = await this.predictViaPythonService(imageBuffer);
          if (result && result.length > 0 && result[0].breed !== 'Unknown') {
            return result;
          }
        } catch (error) {
          console.error('⚠️  Python service prediction failed, retrying...', error.message);
        }
        
        // Retry Python service check - maybe it just started
        if (!this.usePythonService) {
          await this.checkModelAvailability();
          if (this.usePythonService) {
            try {
              const result = await this.predictViaPythonService(imageBuffer);
              if (result && result.length > 0 && result[0].breed !== 'Unknown') {
                return result;
              }
            } catch (error) {
              console.error('⚠️  Python service still unavailable', error.message);
            }
          }
        }
        
        // If model file exists but service unavailable, throw error instead of mock
        throw new Error('Model file exists but Python service is not running. Please start the service.');
      }
      
      // PRIORITY 2: Use ONNX model if available (fallback method)
      if (this.session) {
        const ort = getOrt();
        if (ort) {
          try {
            const input = await this.preprocessImage(imageBuffer);
            const results = await this.session.run({ input });
            
            // Get predictions from model output
            const predictions = Array.from(results.output.data);
            const topIndices = predictions
              .map((score, index) => ({ score, index }))
              .sort((a, b) => b.score - a.score)
              .slice(0, 5);

            return topIndices.map(({ score, index }) => ({
              breed: this.breeds[index] || 'Unknown',
              confidence: Math.max(0, Math.min(1, score))
            }));
          } catch (preprocessError) {
            console.error('ONNX preprocessing failed:', preprocessError.message);
            throw new Error('ONNX model preprocessing failed: ' + preprocessError.message);
          }
        }
      }
      
      // NO MOCK PREDICTIONS - Only use actual model
      throw new Error('No model available. Please ensure best_model_convnext_base_acc0.7007.pth exists and Python service is running.');
    } catch (error) {
      console.error('❌ Prediction failed:', error.message);
      throw error; // Re-throw instead of returning mock predictions
    }
  }

  async predictViaPythonService(imageBuffer) {
    const formData = new FormData();
    formData.append('image', imageBuffer, {
      filename: 'image.jpg',
      contentType: 'image/jpeg'
    });

    const response = await fetch(`${this.pythonServiceUrl}/predict`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Python service error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    
    // Validate response has predictions
    if (!data.predictions || !Array.isArray(data.predictions) || data.predictions.length === 0) {
      throw new Error('Python service returned empty predictions');
    }
    
    return data.predictions;
  }

  async detectSpecies(imageBuffer) {
    try {
      // PRIORITY 1: Use Python service species endpoint if model exists
      if (fs.existsSync(this.modelPathPth)) {
        try {
          const formData = new FormData();
          formData.append('image', imageBuffer, {
            filename: 'image.jpg',
            contentType: 'image/jpeg'
          });

          const response = await fetch(`${this.pythonServiceUrl}/species`, {
            method: 'POST',
            body: formData
          });

          if (response.ok) {
            const data = await response.json();
            if (data.species) {
              return {
                species: data.species,
                confidence: data.confidence || 0.85
              };
            }
          }
        } catch (error) {
          console.error('Python service species detection failed:', error.message);
        }
      }

      // PRIORITY 2: Infer from breed prediction (from actual model only)
      const predictions = await this.predictBreed(imageBuffer);
      if (!predictions || predictions.length === 0) {
        throw new Error('No predictions available for species detection');
      }
      
      const topBreed = predictions[0].breed;
      
      // Classify as cattle or buffalo based on breed name (from model)
      const buffaloBreeds = ['Murrah', 'Mehsana', 'Surti', 'Jaffrabadi', 'Nili_Ravi', 'Nagpuri', 'Bhadawari', 'Banni'];
      const isBuffalo = buffaloBreeds.some(breed => topBreed.toLowerCase().includes(breed.toLowerCase()));
      
      return {
        species: isBuffalo ? 'buffalo' : 'cattle',
        confidence: predictions[0].confidence || 0.85
      };
    } catch (error) {
      console.error('Species detection failed:', error);
      throw new Error('Species detection failed: ' + error.message);
    }
  }

  // REMOVED: getMockPrediction() - All predictions MUST come from the actual model
  // The model best_model_convnext_base_acc0.7007.pth must be loaded via Python service

  async isCrossbreed(predictions) {
    // Simple heuristic: if top prediction confidence is low and multiple breeds have similar scores
    if (predictions.length < 2) return false;
    
    const topConfidence = predictions[0].confidence;
    const secondConfidence = predictions[1].confidence;
    
    return topConfidence < 0.7 && (topConfidence - secondConfidence) < 0.2;
  }

  async generateHeatmap(imageBuffer, predictions) {
    try {
      // For now, return a simple heatmap
      // In a real implementation, you would use Grad-CAM or similar techniques
      const heatmapData = {
        width: 224,
        height: 224,
        data: Array(224 * 224).fill(0.5) // Simple uniform heatmap
      };
      
      return heatmapData;
    } catch (error) {
      console.error('Heatmap generation failed:', error);
      return null;
    }
  }
}

module.exports = PyTorchPredictor;

