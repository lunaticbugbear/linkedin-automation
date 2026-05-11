def build_blueprint(idea: dict, project_type: str) -> dict:
    repo_name = f"project-{idea['title'].lower().replace(' ', '-')}-20260511"
    if project_type == "web-app-nextjs":
        validation_commands = ["npm install", "npm run lint", "npm run typecheck", "npm test", "npm run build"]
        files = ["app/page.tsx", "components/dashboard-card.tsx", "GENERATION_REPORT.md", "linkedin-post.md"]
    else:
        validation_commands = ["python -m pytest", "python -m ruff check .", "python -m mypy src", "python -m build"]
        files = ["src/project_package/cli.py", "src/project_package/core.py", "GENERATION_REPORT.md", "linkedin-post.md"]

    return {
        "project_type": project_type,
        "repo_name": repo_name,
        "main_command": "health-snapshot" if project_type == "cli-python" else "",
        "mvp_goal": idea.get("description", ""),
        "features": [idea.get("function", "")],
        "files_to_generate": files,
        "validation_commands": validation_commands,
    }
