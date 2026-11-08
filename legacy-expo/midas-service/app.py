"""
MiDaS Depth Estimation & Shadow Generation Service

Generates depth maps and realistic floor shadows for clothing images.
Uses MiDaS small model for fast CPU inference.

Cost: ~$0.0005 per image (Cloud Run CPU time)
Latency: 2-4 seconds per image
"""

from flask import Flask, request, Response, jsonify
import torch
import cv2
import numpy as np
from PIL import Image
from io import BytesIO
import os
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Load MiDaS model at startup
logger.info("Loading MiDaS model...")
midas = torch.hub.load('intel-isl/MiDaS', 'MiDaS_small', trust_repo=True)
midas.eval()

# Load transform
midas_transforms = torch.hub.load("intel-isl/MiDaS", "transforms", trust_repo=True)
transform = midas_transforms.small_transform
logger.info("MiDaS model loaded successfully")


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint for Cloud Run."""
    return jsonify({
        'status': 'healthy',
        'model': 'MiDaS_small',
    })


@app.route('/depth', methods=['POST'])
def generate_depth():
    """
    Generate a depth map from an image.
    
    Body: Raw image bytes (PNG with transparency)
    Returns: Grayscale depth map PNG
    """
    try:
        input_bytes = request.data
        if not input_bytes:
            return jsonify({'error': 'No image data provided'}), 400
        
        logger.info(f"Processing depth map: {len(input_bytes)} bytes")
        
        # Load image
        img = Image.open(BytesIO(input_bytes)).convert('RGB')
        img_np = np.array(img)
        
        # Transform for MiDaS
        input_batch = transform(img_np)
        
        # Predict depth
        with torch.no_grad():
            prediction = midas(input_batch)
            prediction = torch.nn.functional.interpolate(
                prediction.unsqueeze(1),
                size=img_np.shape[:2],
                mode="bicubic",
                align_corners=False,
            ).squeeze()
        
        # Normalize to 0-255
        depth_map = prediction.numpy()
        depth_normalized = cv2.normalize(
            depth_map, None, 0, 255, cv2.NORM_MINMAX, dtype=cv2.CV_8U
        )
        
        # Encode as PNG
        _, buffer = cv2.imencode('.png', depth_normalized)
        
        logger.info("Depth map generated successfully")
        
        return Response(
            buffer.tobytes(),
            mimetype='image/png',
            headers={'X-Model': 'MiDaS_small'}
        )
    except Exception as e:
        logger.error(f"Depth estimation failed: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/shadow', methods=['POST'])
def generate_shadow():
    """
    Generate a realistic floor shadow from a transparent PNG.
    
    The shadow is created using the alpha channel and transformed
    to simulate a floor shadow with perspective.
    
    Body: Raw image bytes (PNG with transparency)
    Returns: PNG with shadow composited on transparent background
    """
    try:
        input_bytes = request.data
        if not input_bytes:
            return jsonify({'error': 'No image data provided'}), 400
        
        logger.info(f"Processing shadow: {len(input_bytes)} bytes")
        
        # Load image with alpha channel
        img = Image.open(BytesIO(input_bytes)).convert('RGBA')
        img_np = np.array(img)
        
        # Extract alpha channel
        alpha = img_np[:, :, 3]
        
        # Create shadow
        shadow = create_floor_shadow(alpha)
        
        # Composite shadow below the original image
        result = composite_with_shadow(img_np, shadow)
        
        # Encode result
        result_img = Image.fromarray(result)
        buffer = BytesIO()
        result_img.save(buffer, format='PNG', optimize=True)
        
        logger.info("Shadow generated successfully")
        
        return Response(
            buffer.getvalue(),
            mimetype='image/png',
            headers={'X-Effect': 'floor-shadow'}
        )
    except Exception as e:
        logger.error(f"Shadow generation failed: {e}")
        return jsonify({'error': str(e)}), 500


def create_floor_shadow(alpha: np.ndarray) -> np.ndarray:
    """
    Create a realistic floor shadow from an alpha mask.
    
    The shadow is:
    1. Blurred for soft edges
    2. Transformed with perspective to simulate a floor
    3. Made semi-transparent
    """
    h, w = alpha.shape
    
    # Blur for soft shadow edges
    shadow = cv2.GaussianBlur(alpha.astype(np.float32), (31, 31), 15)
    
    # Create perspective transform (squash and stretch)
    # This makes the shadow appear as if it's on a floor
    src_pts = np.float32([[0, 0], [w, 0], [0, h], [w, h]])
    dst_pts = np.float32([
        [w * 0.15, 0],      # Top left moves right
        [w * 0.85, 0],      # Top right moves left
        [0, h * 0.4],       # Bottom left stays wider
        [w, h * 0.4],       # Bottom right stays wider
    ])
    
    matrix = cv2.getPerspectiveTransform(src_pts, dst_pts)
    shadow_warped = cv2.warpPerspective(shadow, matrix, (w, h))
    
    # Additional blur after warp
    shadow_warped = cv2.GaussianBlur(shadow_warped, (21, 21), 10)
    
    # Reduce opacity (shadows shouldn't be too dark)
    shadow_final = (shadow_warped * 0.35).astype(np.uint8)
    
    return shadow_final


def composite_with_shadow(img: np.ndarray, shadow: np.ndarray) -> np.ndarray:
    """
    Composite the original image over the shadow.
    
    The result is a RGBA image with the shadow below the original.
    """
    h, w = img.shape[:2]
    
    # Create result with shadow
    result = np.zeros((h, w, 4), dtype=np.uint8)
    
    # Place shadow (offset downward from center)
    shadow_offset = int(h * 0.15)
    shadow_layer = np.zeros((h, w), dtype=np.uint8)
    
    if shadow_offset > 0 and shadow_offset < h:
        valid_h = min(h - shadow_offset, shadow.shape[0])
        shadow_layer[shadow_offset:shadow_offset + valid_h, :] = shadow[:valid_h, :]
    
    # Set shadow color (black with computed alpha)
    result[:, :, 0] = 0  # R
    result[:, :, 1] = 0  # G
    result[:, :, 2] = 0  # B
    result[:, :, 3] = shadow_layer  # A
    
    # Composite original on top using alpha blending
    orig_alpha = img[:, :, 3:4].astype(np.float32) / 255.0
    
    # Blend RGB
    for c in range(3):
        result[:, :, c] = (
            img[:, :, c] * orig_alpha[:, :, 0] +
            result[:, :, c] * (1 - orig_alpha[:, :, 0])
        ).astype(np.uint8)
    
    # Blend alpha (max of shadow and original)
    result[:, :, 3] = np.maximum(result[:, :, 3], img[:, :, 3])
    
    return result


@app.route('/info', methods=['GET'])
def info():
    """Service information endpoint."""
    return jsonify({
        'service': 'midas-depth-shadow',
        'model': 'MiDaS_small',
        'endpoints': ['/depth', '/shadow'],
        'cost_per_image': '$0.0005 (estimated)',
    })


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    logger.info(f"Starting server on port {port}")
    app.run(host='0.0.0.0', port=port, debug=False)
