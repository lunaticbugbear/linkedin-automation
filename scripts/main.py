from datetime import datetime
from scripts.utils import load_config, setup_logging
from scripts.generate_ideas import generate_project_ideas
from scripts.project_classifier import classify_project_type
from scripts.project_blueprint import build_blueprint
from scripts.generate_project_repo import generate_project_repo
from scripts.generate_visual import generate_project_banner
from scripts.notify import (
    answer_callback_query,
    send_generation_failure,
    send_final_project,
    send_project_options,
    send_telegram_notification,
    wait_for_project_selection,
)

logger = setup_logging()


def run_cycle():
    logger.info("Starting LinkedIn automation cycle")
    config = load_config("config/settings.yaml")
    telegram = config["notifications"]["telegram"]

    logger.info("Generating project ideas...")
    ideas = generate_project_ideas(max_projects=config["ai"]["max_projects"])
    logger.info(f"Generated {len(ideas)} project ideas")

    message_id = send_project_options(
        ideas=ideas,
        bot_token=telegram["bot_token"],
        chat_id=telegram["chat_id"],
    )
    logger.info(f"Sent project options message: {message_id}")

    selection = wait_for_project_selection(
        bot_token=telegram["bot_token"],
        chat_id=telegram["chat_id"],
        message_id=message_id,
        timeout_seconds=telegram["selection_timeout_seconds"],
    )

    if selection is None:
        logger.info("No project selection received")
        send_telegram_notification("No selection received. Cycle cancelled.", telegram["bot_token"], telegram["chat_id"])
        return None

    selected_index = selection["index"]
    selected_project = ideas[selected_index]
    answer_callback_query(telegram["bot_token"], selection["callback_query_id"], f"Project {selected_index + 1} dipilih")

    project_type = classify_project_type(selected_project)
    blueprint = build_blueprint(selected_project, project_type)

    logger.info(f"Creating selected repo: {blueprint['repo_name']}")
    generation_result = generate_project_repo(blueprint, config)

    if generation_result["status"] != "success":
        logger.error(f"Project generation failed at {generation_result['stage']}")
        send_generation_failure(generation_result, telegram["bot_token"], telegram["chat_id"])
        return generation_result

    repo_response = generation_result["repo_response"]
    repo_name = generation_result["repo_name"]
    final_project = {
        **selected_project,
        "repo_name": repo_name,
        "repo_url": repo_response.get("html_url"),
        "project_type": project_type,
        "ci_status": generation_result.get("ci_status", "passed"),
        "vercel_url": generation_result.get("vercel_url"),
        "validation_result": generation_result.get("validation_result", {}),
        "run_commands": generation_result.get("run_commands", []),
    }

    image_path = generate_project_banner(final_project, config["linkedin"]["visual_output_dir"])
    send_final_project(final_project, image_path, telegram["bot_token"], telegram["chat_id"])

    logger.info("Cycle complete")
    return final_project


if __name__ == "__main__":
    run_cycle()
