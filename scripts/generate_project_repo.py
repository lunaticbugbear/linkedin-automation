import requests
import json
import base64
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


def push_readme_to_repo(repo_name: str, readme_content: str, token: str) -> bool:
    """Push README.md to an existing GitHub repository."""
    url = f"https://api.github.com/repos/lunaticbugbear/{repo_name}/contents/README.md"
    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json"
    }
    content_bytes = readme_content.encode("utf-8")
    content_b64 = base64.b64encode(content_bytes).decode("utf-8")
    data = {
        "message": "Add README.md",
        "content": content_b64,
        "branch": "main"
    }

    response = requests.put(url, headers=headers, json=data)

    if response.status_code == 201:
        logger.info(f"README.md pushed to {repo_name}")
        return True
    elif response.status_code == 422:
        # File already exists, update it
        # First get the SHA of the existing file
        get_url = f"https://api.github.com/repos/lunaticbugbear/{repo_name}/contents/README.md"
        get_response = requests.get(get_url, headers=headers)
        if get_response.status_code == 200:
            sha = get_response.json().get("sha")
            data["sha"] = sha
            update_response = requests.put(url, headers=headers, json=data)
            if update_response.status_code == 200:
                logger.info(f"README.md updated in {repo_name}")
                return True
    logger.error(f"Failed to push README.md to {repo_name}: {response.text}")
    return False

if __name__ == "__main__":
    config = load_config("config/settings.yaml")
    # Example usage
    repo = create_github_repo(
        repo_name="test-project-20260510",
        description="Test project",
        token=config["github"]["token"]
    )
    print(json.dumps(repo, indent=2))
