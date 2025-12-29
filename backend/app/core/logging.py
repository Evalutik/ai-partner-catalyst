"""
Logging configuration for Aeyes Backend.
"""
import logging
import sys

def setup_logging():
    """
    Set up basic logging configuration.
    """
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout)
        ]
    )
    
    # Set levels for noisy libraries
    logging.getLogger("uvicorn.error").setLevel(logging.INFO)
    logging.getLogger("uvicorn.access").setLevel(logging.INFO)

# Run setup on import if needed, or call from app factory
setup_logging()
logger = logging.getLogger("aeyes")
