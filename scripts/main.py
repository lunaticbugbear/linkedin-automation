import json
from datetime import datetime
from scripts.utils import load_config, setup_logging
from scripts.generate_ideas import generate_project_ideas
from scripts.generate_project_repo import create_github_repo, format_repo_name
from scripts.generate_post import format_linkedin_post
from scripts.notify import send_notifications

logger = setup_logging()

def run_cycle():
    """Run one complete cycle: generate ideas, create repos, send notifications."""
    logger.info("Starting LinkedIn automation cycle")

    config = load_config("config/settings.yaml")

    # Step 1: Generate project ideas
    logger.info("Generating project ideas...")
    ideas = generate_project_ideas(max_projects=config["ai"]["max_projects"])
    logger.info(f"Generated {len(ideas)} project ideas")

    # Step 2: Create GitHub repos and format posts
    projects_with_repos = []
    for idea in ideas:
        try:
            # Format repo name
            repo_name = format_repo_name(idea["title"], datetime.now().strftime("%Y-%m-%d"))

            # Create GitHub repo
            logger.info(f"Creating repo: {repo_name}")
            repo_response = create_github_repo(
                repo_name=repo_name,
                description=idea["description"],
                token=config["github"]["token"]
            )

            # Format LinkedIn post
            post = format_linkedin_post(idea)

            projects_with_repos.append({
                "title": idea["title"],
                "description": idea["description"],
                "repo_name": repo_name,
                "repo_url": repo_response.get("html_url"),
                "linkedin_post": post
            })

            logger.info(f"Created repo: {repo_response.get('html_url')}")
        except Exception as e:
            logger.error(f"Failed to create repo for {idea['title']}: {e}")
            continue

    # Step 3: Send notifications
    logger.info(f"Sending notifications for {len(projects_with_repos)} projects")
    send_notifications(projects_with_repos, config)

    logger.info("Cycle complete")
    return projects_with_repos

if __name__ == "__main__":
    run_cycle()
