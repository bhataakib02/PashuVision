// Lazy load modules to avoid errors if they're not installed
let ortModule = null;
let sharpModule = null;

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

function getSharp() {
  if (sharpModule === null) {
    try {
      sharpModule = require('sharp');
    } catch (error) {
      console.warn('⚠️  Sharp module not available');
      return null;
    }
  }
  return sharpModule;
}

const fs = require('fs');
const path = require('path');

class ConvNeXtPredictor {
  constructor() {
    this.session = null;
    // Update this path to point to your new model
    this.modelPath = path.join(__dirname, '..', '..', 'models', process.env.CONVNEXT_MODEL_NAME || 'convnext_model.onnx');
    this.modelInfoPath = path.join(__dirname, '..', '..', 'models', 'model_info.json');
    this.breeds = [];
    this.modelInfo = null;
    this.species = ['cattle', 'buffalo', 'non_animal'];
    this.loadModelInfo();
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
    try {
      if (!fs.existsSync(this.modelPath)) {
        console.log('❌ ConvNeXt model not found. This predictor is deprecated. Use PyTorchPredictor instead.');
        return false;
      }
      
      const ort = getOrt();
      if (!ort) {
        throw new Error('onnxruntime-node not available');
      }
      this.session = await ort.InferenceSession.create(this.modelPath);
      console.log('ConvNeXt model loaded successfully');
      return true;
    } catch (error) {
      console.log('❌ Failed to load ConvNeXt model:', error.message);
      return false;
    }
  }

  async preprocessImage(imageBuffer) {
    try {
      // Get normalization values from model info or use defaults
      const mean = this.modelInfo?.mean || [0.485, 0.456, 0.406];
      const std = this.modelInfo?.std || [0.229, 0.224, 0.225];
      const imgSize = this.modelInfo?.input_size?.[0] || 224;
      
      // Get sharp module (lazy load)
      const sharpModule = getSharp();
      if (!sharpModule) {
        throw new Error('Sharp module not available. Cannot preprocess image.');
      }
      
      // Resize and normalize image for ConvNeXt model input
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
      
      // Reshape to [1, 3, imgSize, imgSize] for RGB channels
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
      if (!this.session) {
        throw new Error('Model not loaded. This predictor is deprecated. Use PyTorchPredictor with best_model_convnext_base_acc0.7007.pth instead.');
      }

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
    } catch (error) {
      console.error('Prediction failed:', error);
      throw new Error('Breed prediction failed: ' + error.message);
    }
  }

  async detectSpecies(imageBuffer) {
    try {
      if (!this.session) {
        throw new Error('Model not loaded. This predictor is deprecated. Use PyTorchPredictor instead.');
      }

      // Use breed prediction to determine species
      const predictions = await this.predictBreed(imageBuffer);
      if (!predictions || predictions.length === 0) {
        throw new Error('No predictions available for species detection');
      }
      
      const topBreed = predictions[0].breed;
      
      // Classify as cattle or buffalo based on breed
      const buffaloBreeds = ['Murrah', 'Mehsana', 'Surti', 'Jaffrabadi', 'Nili_Ravi', 'Nagpuri', 'Bhadawari', 'Banni'];
      const isBuffalo = buffaloBreeds.some(breed => topBreed.includes(breed));
      
      return {
        species: isBuffalo ? 'buffalo' : 'cattle',
        confidence: predictions[0].confidence
      };
    } catch (error) {
      console.error('Species detection failed:', error);
      throw new Error('Species detection failed: ' + error.message);
    }
  }

  // REMOVED: getMockPrediction() - All predictions MUST come from the actual model
  // This predictor is deprecated. Use PyTorchPredictor with best_model_convnext_base_acc0.7007.pth instead.

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

module.exports = ConvNeXtPredictor;

