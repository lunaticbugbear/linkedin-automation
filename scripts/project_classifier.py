def classify_project_type(idea: dict) -> str:
    text = f"{idea.get('title', '')} {idea.get('description', '')} {idea.get('function', '')}".lower()
    if any(word in text for word in ["dashboard", "ui", "web", "portal", "tracker", "visualizer", "status page", "chart", "form", "report viewer"]):
        return "web-app-nextjs"
    return "cli-python"
