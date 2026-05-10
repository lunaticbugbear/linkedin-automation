import requests
import json
from datetime import datetime
from scripts.utils import load_config, setup_logging

logger = setup_logging()

def format_repo_name(title: str, date: str) -> str:
    """Format project title into GitHub repo name."""
    # Convert to lowercase, replace spaces with hyphens, remove special chars
    name = title.lower().replace(" ", "-")
    name = "".join(c for c in name if c.isalnum() or c == "-")
    # Remove date hyphens for compact format
    date_compact = date.replace("-", "")
    return f"project-{name}-{date_compact}"

def create_github_repo(repo_name: str, description: str, token: str) -> dict:
    """Create a new GitHub repository."""
    url = "https://api.github.com/user/repos"
    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json"
    }
    data = {
        "name": repo_name,
        "description": description,
        "private": False,
        "auto_init": True
    }

    response = requests.post(url, headers=headers, json=data)

    if response.status_code != 201:
        logger.error(f"Failed to create repo: {response.text}")
        raise Exception(f"GitHub API error: {response.status_code}")

    return response.json()

if __name__ == "__main__":
    config = load_config("config/settings.yaml")
    # Example usage
    repo = create_github_repo(
        repo_name="test-project-20260510",
        description="Test project",
        token=config["github"]["token"]
    )
    print(json.dumps(repo, indent=2))
