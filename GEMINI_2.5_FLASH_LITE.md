# Gemini 2.5 Flash-Lite Preview Integration

## Overview

This addon now supports Google's latest **Gemini 2.5 Flash-Lite Preview** model (`gemini-2.5-flash-lite-preview-06-17`), which is optimized for cost efficiency and low latency - perfect for subtitle processing tasks.

## Model Details

### Gemini 2.5 Flash-Lite Preview
- **Model ID**: `gemini-2.5-flash-lite-preview-06-17`
- **Optimization**: Cost efficiency and low latency
- **Best for**: Real-time, high-throughput subtitle processing
- **Input support**: Text, images, video, and audio
- **Output**: Text responses

## Key Benefits

1. **Cost Efficiency**: Most cost-efficient Gemini model available
2. **Low Latency**: Optimized for real-time processing
3. **High Throughput**: Supports high volume subtitle processing
4. **Quality**: Maintains high quality while being more economical
5. **Latest Technology**: Preview version with cutting-edge capabilities

## Usage

### Environment Variable
```bash
AI_MODEL=gemini-2.5-flash-lite-preview-06-17
```

### UI Configuration
1. Go to Settings tab in the addon UI
2. Select "Gemini 2.5 Flash-Lite Preview (Recommended)" from the AI Model dropdown
3. Click "Save Settings"

### API Configuration
The model is automatically used when:
- Environment variable `AI_MODEL` is set to `gemini-2.5-flash-lite-preview-06-17`
- Or selected via the UI settings
- Or used as the default when no other model is specified

## Comparison with Other Models

| Model | Use Case | Cost | Latency | Throughput |
|-------|----------|------|---------|------------|
| Gemini 2.5 Pro | Complex reasoning | High | Medium | Medium |
| Gemini 2.5 Flash | Balanced performance | Medium | Low | High |
| **Gemini 2.5 Flash-Lite** | **Cost-efficient processing** | **Lowest** | **Lowest** | **Highest** |
| Gemini 2.0 Flash | Next-gen features | Medium | Low | High |
| Gemini 1.5 Flash | General purpose | Medium | Medium | Medium |

## Implementation Details

### Supported in Files:
- `ui/index.html` - Model selection dropdowns
- `lib/subtitleMatcher.js` - AI processing logic
- `ui-api.js` - Settings management
- `config.js` - Default configuration

### Model Validation
The addon includes built-in validation to ensure the selected model is supported and properly configured.

### Error Handling
- Automatic fallback to default model if custom model fails
- Detailed logging for debugging model-related issues
- Graceful degradation when API limits are reached

## Migration Guide

### From Previous Versions
If you were using an older model, you can:

1. **Automatic**: The addon will use the new model as default
2. **Manual**: Update your environment variable:
   ```bash
   # Old
   AI_MODEL=gemini-2.0-flash-exp
   
   # New (recommended)
   AI_MODEL=gemini-2.5-flash-lite-preview-06-17
   ```

### Performance Improvements
Users should expect:
- Faster subtitle processing
- Lower API costs
- Improved reliability
- Better handling of concurrent requests

## Troubleshooting

### Model Not Working
1. Verify your Gemini API key is valid
2. Check if the model is available in your region
3. Ensure you have sufficient API quota
4. Review console logs for specific error messages

### Performance Issues
1. Monitor API rate limits
2. Adjust temperature settings if needed
3. Check network connectivity
4. Verify model selection in UI

## Future Updates

Google regularly updates their models. The addon is designed to be compatible with future Gemini model releases by following the standard naming convention and API structure.

## Links
- [Google AI Gemini API Documentation](https://ai.google.dev/gemini-api/docs/models)
- [Gemini 2.5 Flash-Lite Model Details](https://ai.google.dev/gemini-api/docs/models#gemini-2.5-flash-lite-preview)
- [Model Pricing](https://ai.google.dev/gemini-api/docs/pricing)
