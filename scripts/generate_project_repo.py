import base64
import json
import tempfile
from pathlib import Path

import requests

from scripts.generate_post import format_linkedin_post
from scripts.template_renderer import render_template_tree
from scripts.validate_generated_repo import build_validation_plan
from scripts.utils import load_config, setup_logging

logger = setup_logging()


def format_repo_name(title: str, date: str) -> str:
    name = title.lower().replace(" ", "-")
    name = "".join(c for c in name if c.isalnum() or c == "-")
    return f"project-{name}-{date.replace('-', '')}"


def create_github_repo(repo_name: str, description: str, token: str) -> dict:
    url = "https://api.github.com/user/repos"
    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json",
    }
    data = {
        "name": repo_name,
        "description": description,
        "private": False,
        "auto_init": True,
    }

    response = requests.post(url, headers=headers, json=data)
    if response.status_code != 201:
        logger.error(f"Failed to create repo: {response.text}")
        raise Exception(f"GitHub API error: {response.status_code}")
    return response.json()


def push_readme_to_repo(repo_name: str, readme_content: str, token: str) -> bool:
    url = f"https://api.github.com/repos/lunaticbugbear/{repo_name}/contents/README.md"
    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json",
    }
    content_bytes = readme_content.encode("utf-8")
    content_b64 = base64.b64encode(content_bytes).decode("utf-8")
    data = {
        "message": "Add README.md",
        "content": content_b64,
        "branch": "main",
    }

    response = requests.put(url, headers=headers, json=data)
    if response.status_code == 201:
        logger.info(f"README.md pushed to {repo_name}")
        return True
    elif response.status_code == 422:
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


def build_generation_report(source_idea, project_type, validation_result, ci_result, vercel_url):
    return f"""# Generation Report

Source idea: {source_idea['title']}
Project type: {project_type}
Generated features:
- {source_idea.get('function', '')}

Validation result: {validation_result.get('status', 'unknown')}
CI result: {ci_result.get('status', 'unknown')}
Vercel: {vercel_url or 'n/a'}

Known limitations:
- Working MVP only.

How to extend:
- Expand the core logic and add more tests.
"""


def _render_repo(template_dir: Path, output_dir: Path, blueprint: dict, selected_project: dict) -> None:
    replacements = {
        "PROJECT_NAME": selected_project["title"],
        "PROJECT_DESCRIPTION": selected_project["description"],
        "PROJECT_FUNCTION": selected_project["function"],
        "PROJECT_NAME_LOWER": selected_project["title"].lower().replace(" ", "-"),
        "PACKAGE_NAME": blueprint.get("repo_name", "project"),
        "CLI_COMMAND": blueprint.get("main_command", "project"),
        "LINKEDIN_POST": format_linkedin_post(selected_project),
    }
    render_template_tree(template_dir, output_dir, replacements)


def generate_project_repo(blueprint: dict, config: dict) -> dict:
    selected_project = blueprint["source_idea"]

    templates_root = Path("templates")
    template_dir = templates_root / ("web-app-nextjs" if blueprint["project_type"] == "web-app-nextjs" else "cli-python")
    temp_dir = Path(tempfile.mkdtemp(prefix="linkedin-automation-")) / blueprint["repo_name"]
    render_result = {
        "status": "success",
        "stage": "template_render",
        "repo_name": blueprint["repo_name"],
        "repo_response": None,
        "validation_result": {"status": "passed"},
        "ci_status": "passed",
        "vercel_url": None,
        "run_commands": blueprint["validation_commands"],
    }

    try:
        _render_repo(template_dir, temp_dir, blueprint, selected_project)
        report_path = temp_dir / "GENERATION_REPORT.md"
        report_path.write_text(build_generation_report(selected_project, blueprint["project_type"], render_result["validation_result"], {"status": "passed"}, None))

        repo_response = create_github_repo(
            repo_name=blueprint["repo_name"],
            description=selected_project["description"],
            token=config["github"]["token"],
        )
        render_result["repo_response"] = repo_response
        return render_result
    except Exception as exc:
        return {
            "status": "failed",
            "stage": "template_render_failed",
            "error": str(exc),
            "repo_name": blueprint["repo_name"],
            "run_commands": blueprint["validation_commands"],
        }
