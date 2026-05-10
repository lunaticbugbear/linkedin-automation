from scripts.utils import load_config, setup_logging

logger = setup_logging()


def format_linkedin_post(project_data: dict) -> str:
    """Format project data into LinkedIn post."""
    post = project_data.get("linkedin_post", "")

    # Add hashtags from config
    config = load_config("config/settings.yaml")
    hashtags = " ".join(config["linkedin"]["hashtags"])

    formatted_post = f"{post}\n\n{hashtags}"
    return formatted_post.strip()


def save_post_to_file(post_content: str, repo_name: str, output_dir: str = ".") -> str:
    """Save LinkedIn post to file."""
    filepath = f"{output_dir}/{repo_name}/linkedin-post.md"
    with open(filepath, 'w') as f:
        f.write(post_content)
    logger.info(f"Saved post to {filepath}")
    return filepath


if __name__ == "__main__":
    # Example usage
    project = {
        "title": "Test Project",
        "linkedin_post": "This is a test post"
    }
    post = format_linkedin_post(project)
    print(post)
