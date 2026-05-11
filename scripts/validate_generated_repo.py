def build_validation_plan(project_type: str) -> list[str]:
    if project_type == "web-app-nextjs":
        return ["npm install", "npm run lint", "npm run typecheck", "npm test", "npm run build"]
    return ["python -m pytest", "python -m ruff check .", "python -m mypy src", "python -m build"]
