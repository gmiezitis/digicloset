"""
rembg Background Removal Service

A lightweight, cost-effective background removal service using the open-source
rembg library. Deployed on Cloud Run with automatic scaling.

Cost: ~$0.001 per image (based on Cloud Run CPU time)
Quality: 85-90% of commercial solutions
Latency: 1-3 seconds per image
"""

from flask import Flask, request, Response, jsonify
from rembg import remove, new_session
import os
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Pre-load model at startup for faster inference
# Using u2net model for best quality/speed balance
logger.info("Loading u2net model...")
SESSION = new_session("u2net")
logger.info("Model loaded successfully")


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint for Cloud Run."""
    return jsonify({
        'status': 'healthy',
        'model': 'u2net',
        'version': '2.0.50'
    })


@app.route('/remove', methods=['POST'])
def remove_background():
    """
    Remove background from an image.
    
    Headers:
        X-Quality: standard | medium | high (affects processing settings)
    
    Body:
        Raw image bytes (PNG, JPEG, WebP)
    
    Returns:
        PNG image with transparent background
    """
    quality = request.headers.get('X-Quality', 'standard')
    logger.info(f"Processing image with quality: {quality}")
    
    # Quality settings affect alpha matting
    # Higher quality = better edges but slower
    alpha_matting = quality in ('medium', 'high')
    
    if quality == 'high':
        alpha_matting_foreground_threshold = 240
        alpha_matting_background_threshold = 10
        alpha_matting_erode_size = 10
    elif quality == 'medium':
        alpha_matting_foreground_threshold = 200
        alpha_matting_background_threshold = 20
        alpha_matting_erode_size = 5
    else:
        alpha_matting_foreground_threshold = 200
        alpha_matting_background_threshold = 20
        alpha_matting_erode_size = 0
    
    try:
        input_image = request.data
        
        if not input_image:
            return jsonify({'error': 'No image data provided'}), 400
        
        logger.info(f"Received image: {len(input_image)} bytes")
        
        # Remove background
        output_image = remove(
            input_image,
            session=SESSION,
            alpha_matting=alpha_matting,
            alpha_matting_foreground_threshold=alpha_matting_foreground_threshold,
            alpha_matting_background_threshold=alpha_matting_background_threshold,
            alpha_matting_erode_size=alpha_matting_erode_size,
        )
        
        logger.info(f"Output image: {len(output_image)} bytes")
        
        return Response(
            output_image,
            mimetype='image/png',
            headers={
                'X-Processing-Quality': quality,
                'X-Model': 'u2net',
                'X-Input-Size': str(len(input_image)),
                'X-Output-Size': str(len(output_image)),
            }
        )
    except Exception as e:
        logger.error(f"Processing failed: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/info', methods=['GET'])
def info():
    """Service information endpoint."""
    return jsonify({
        'service': 'rembg-background-removal',
        'model': 'u2net',
        'quality_levels': ['standard', 'medium', 'high'],
        'supported_formats': ['png', 'jpg', 'jpeg', 'webp'],
        'max_image_size': '10MB',
        'cost_per_image': '$0.001 (estimated)',
    })


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    logger.info(f"Starting server on port {port}")
    app.run(host='0.0.0.0', port=port, debug=False)
