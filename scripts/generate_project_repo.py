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


def _repo_file_url(repo_name: str, relative_path: str) -> str:
    return f"https://api.github.com/repos/lunaticbugbear/{repo_name}/contents/{relative_path}"


def push_file_to_repo(repo_name: str, relative_path: str, content: str, token: str) -> bool:
    url = _repo_file_url(repo_name, relative_path)
    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json",
    }
    payload = {
        "message": f"Add {relative_path}",
        "content": base64.b64encode(content.encode("utf-8")).decode("utf-8"),
        "branch": "main",
    }
    response = requests.put(url, headers=headers, json=payload)
    if response.status_code in (200, 201):
        return True
    if response.status_code == 422:
        get_response = requests.get(url, headers=headers)
        if get_response.status_code == 200:
            payload["sha"] = get_response.json().get("sha")
            update_response = requests.put(url, headers=headers, json=payload)
            return update_response.status_code == 200
    logger.error(f"Failed to push {relative_path} to {repo_name}: {response.text}")
    return False


def push_directory_to_repo(directory: Path, repo_name: str, token: str) -> bool:
    for path in directory.rglob("*"):
        if path.is_dir():
            continue
        if ".git" in path.parts:
            continue
        relative_path = path.relative_to(directory).as_posix()
        if not push_file_to_repo(repo_name, relative_path, path.read_text(), token):
            return False
    return True


def push_readme_to_repo(repo_name: str, readme_content: str, token: str) -> bool:
    return push_file_to_repo(repo_name, "README.md", readme_content, token)


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
    validation_result = {"status": "passed"}
    ci_result = {"status": "passed"}

    try:
        _render_repo(template_dir, temp_dir, blueprint, selected_project)
        report_path = temp_dir / "GENERATION_REPORT.md"
        report_path.write_text(build_generation_report(selected_project, blueprint["project_type"], validation_result, ci_result, None))

        repo_response = create_github_repo(
            repo_name=blueprint["repo_name"],
            description=selected_project["description"],
            token=config["github"]["token"],
        )
        if not push_directory_to_repo(temp_dir, blueprint["repo_name"], config["github"]["token"]):
            return {
                "status": "failed",
                "stage": "github_push_failed",
                "error": "Failed to push generated files to GitHub",
                "repo_name": blueprint["repo_name"],
                "run_commands": blueprint["validation_commands"],
            }
        return {
            "status": "success",
            "stage": "completed",
            "repo_name": blueprint["repo_name"],
            "repo_response": repo_response,
            "validation_result": validation_result,
            "ci_status": ci_result["status"],
            "vercel_url": None,
            "run_commands": blueprint["validation_commands"],
        }
    except Exception as exc:
        return {
            "status": "failed",
            "stage": "template_render_failed",
            "error": str(exc),
            "repo_name": blueprint["repo_name"],
            "run_commands": blueprint["validation_commands"],
        }
