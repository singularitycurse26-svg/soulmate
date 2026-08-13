"""QR code generation utility for Soulmate OS sharing.

Generates QR codes offline using the qrcode library — no external API needed.
Used for sharing Soulmate OS links, SoulMovies videos, and SoulTube channels.
"""

from __future__ import annotations

import io
import logging
from typing import Optional

logger = logging.getLogger(__name__)

try:
    import qrcode
    from qrcode.constants import ERROR_CORRECT_L, ERROR_CORRECT_M, ERROR_CORRECT_Q, ERROR_CORRECT_H
    _QRCODE_AVAILABLE = True
except ImportError:
    _QRCODE_AVAILABLE = False
    logger.warning("qrcode library not installed — QR code generation disabled")


def generate_qr_code_png(
    url: str,
    box_size: int = 10,
    border: int = 2,
    error_correction: str = "M",
) -> Optional[bytes]:
    """Generate a QR code as PNG bytes.

    Args:
        url: The URL to encode in the QR code
        box_size: Pixel size of each QR code box
        border: Number of border boxes (minimum 2)
        error_correction: L, M, Q, or H (low, medium, quartile, high)

    Returns:
        PNG image bytes, or None if qrcode library is not available
    """
    if not _QRCODE_AVAILABLE:
        logger.error("qrcode library not available — cannot generate QR code")
        return None

    ec_map = {
        "L": ERROR_CORRECT_L,
        "M": ERROR_CORRECT_M,
        "Q": ERROR_CORRECT_Q,
        "H": ERROR_CORRECT_H,
    }
    ec = ec_map.get(error_correction.upper(), ERROR_CORRECT_M)

    qr = qrcode.QRCode(
        version=None,
        error_correction=ec,
        box_size=box_size,
        border=border,
    )
    qr.add_data(url)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return buf.getvalue()


def generate_qr_code_svg(
    url: str,
    box_size: int = 10,
    border: int = 2,
    error_correction: str = "M",
) -> Optional[str]:
    """Generate a QR code as SVG string.

    Args:
        url: The URL to encode in the QR code
        box_size: Pixel size of each QR code box
        border: Number of border boxes (minimum 2)
        error_correction: L, M, Q, or H

    Returns:
        SVG string, or None if qrcode library is not available
    """
    if not _QRCODE_AVAILABLE:
        logger.error("qrcode library not available — cannot generate QR code")
        return None

    ec_map = {
        "L": ERROR_CORRECT_L,
        "M": ERROR_CORRECT_M,
        "Q": ERROR_CORRECT_Q,
        "H": ERROR_CORRECT_H,
    }
    ec = ec_map.get(error_correction.upper(), ERROR_CORRECT_M)

    qr = qrcode.QRCode(
        version=None,
        error_correction=ec,
        box_size=box_size,
        border=border,
    )
    qr.add_data(url)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white", image_factory=qrcode.image.svg.SvgImage)
    buf = io.BytesIO()
    img.save(buf)
    buf.seek(0)
    return buf.read().decode("utf-8")
