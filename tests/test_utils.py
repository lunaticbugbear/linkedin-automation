import pytest
import os
from scripts.utils import load_config

def test_load_config_returns_dict():
    config = load_config("config/settings.yaml")
    assert isinstance(config, dict)
    assert "cycle" in config
    assert "notifications" in config
    assert "github" in config

def test_load_config_with_env_substitution():
    os.environ["TEST_VAR"] = "test_value"
    config = load_config("config/settings.yaml")
    # Verify env vars are substituted (e.g., ${GITHUB_TOKEN})
    assert config["github"]["token"] is not None
