import yaml
import os
import re
from typing import Dict, Any

def load_config(config_path: str) -> Dict[str, Any]:
    """Load YAML config and substitute environment variables."""
    with open(config_path, 'r') as f:
        content = f.read()

    # Replace ${VAR_NAME} with environment variable values
    def replace_env_var(match):
        var_name = match.group(1)
        return os.getenv(var_name, match.group(0))

    content = re.sub(r'\$\{([^}]+)\}', replace_env_var, content)
    config = yaml.safe_load(content)
    return config

def load_prompt(prompt_path: str) -> str:
    """Load AI prompt template."""
    with open(prompt_path, 'r') as f:
        return f.read()

def setup_logging():
    """Configure logging for scripts."""
    import logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    return logging.getLogger(__name__)
