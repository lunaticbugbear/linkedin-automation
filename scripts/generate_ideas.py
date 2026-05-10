import json
import os
from anthropic import Anthropic
from scripts.utils import load_config, load_prompt, setup_logging

logger = setup_logging()

def generate_project_ideas(max_projects: int = 3) -> list:
    """Generate project ideas using Claude API."""
    config = load_config("config/settings.yaml")
    prompt = load_prompt("config/ai-prompt.txt")

    client = Anthropic()

    message = client.messages.create(
        model=config["ai"]["model"],
        max_tokens=2000,
        messages=[
            {
                "role": "user",
                "content": prompt
            }
        ]
    )

    response_text = message.content[0].text

    # Extract JSON from response
    try:
        # Try to find JSON array in response
        start_idx = response_text.find('[')
        end_idx = response_text.rfind(']') + 1
        if start_idx != -1 and end_idx > start_idx:
            json_str = response_text[start_idx:end_idx]
            ideas = json.loads(json_str)
            return ideas[:max_projects]
    except json.JSONDecodeError:
        logger.error("Failed to parse JSON from Claude response")
        raise

    return []

if __name__ == "__main__":
    ideas = generate_project_ideas(max_projects=3)
    print(json.dumps(ideas, indent=2))
