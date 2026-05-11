import json
from openai import OpenAI
from scripts.utils import load_config, load_prompt, setup_logging

logger = setup_logging()

def generate_project_ideas(max_projects: int = 3) -> list:
    config = load_config("config/settings.yaml")
    prompt = load_prompt("config/ai-prompt.txt")
    ai_config = config["ai"]

    client = OpenAI(
        api_key=ai_config["api_key"],
        base_url=ai_config["base_url"],
    )

    response = client.chat.completions.create(
        model=ai_config["model"],
        max_tokens=2000,
        messages=[
            {
                "role": "user",
                "content": prompt,
            }
        ],
    )

    response_text = response.choices[0].message.content

    try:
        start_idx = response_text.find('[')
        end_idx = response_text.rfind(']') + 1
        if start_idx != -1 and end_idx > start_idx:
            json_str = response_text[start_idx:end_idx]
            ideas = json.loads(json_str)
            return ideas[:max_projects]
    except json.JSONDecodeError:
        logger.error("Failed to parse JSON from AI response")
        raise

    return []

if __name__ == "__main__":
    ideas = generate_project_ideas(max_projects=3)
    print(json.dumps(ideas, indent=2))
