import json
import os
from typing import Any, Dict, List, Optional

import httpx
from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP
from mcp.types import TextContent

load_dotenv()

CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")
FALLBACK_MODEL = "z-ai/glm-5.2"


def _load_config() -> Dict[str, Any]:
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _auth_headers() -> Dict[str, str]:
    # Re-read config.json on every call so a key saved via the TUI's API tab
    # takes effect immediately, without restarting this server process.
    key = _load_config().get("api_key") or os.getenv("NIM_API_KEY")
    if not key:
        raise ValueError(
            "No NIM API key found. Set it via the TUI's API tab (config.json), "
            "or NIM_API_KEY in .env."
        )
    return {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}


client = httpx.Client(base_url="https://integrate.api.nvidia.com/v1", timeout=120.0)

mcp = FastMCP("nim-mcp")


@mcp.tool(
    description="""Generate a chat completion using any model hosted on NVIDIA NIM (build.nvidia.com).
    One API key works for every model in the catalog -- just change the `model` string
    (e.g. "z-ai/glm-5.2", "meta/llama-3.1-405b-instruct", "qwen/qwen3-coder-480b-a35b-instruct").

    Vision: for VLM models, a message's `content` can be a list of parts instead of a plain
    string, e.g. [{"type": "text", "text": "..."}, {"type": "image_url", "image_url": {"url":
    "data:image/png;base64,..."}}]. Only models tagged as vision/VLM support this.

    Tool calling: pass `tools` (OpenAI-style function schemas) to let the model request tool
    calls. If the response contains tool calls, this returns the raw JSON of `message` (including
    `tool_calls`) instead of plain text, so the caller can execute the tools and continue the
    conversation.

    Args:
        messages: List of message dicts with 'role' and 'content' keys (content may be a string
            or a list of content parts for vision input)
        model: NIM model id (see list_models for the full catalog). If omitted, uses the
            default_model currently selected in the TUI's MODELS tab (config.json)
        temperature: Sampling temperature
        max_tokens: Maximum tokens to generate
        top_p: Nucleus sampling parameter
        seed: Optional seed for deterministic output
        tools: Optional list of OpenAI-style tool/function definitions
        tool_choice: Optional tool choice control ("auto", "none", or a specific tool dict)

    Returns:
        Text content with the model's response, or the raw assistant message JSON if it
        contains tool_calls
    """
)
def chat_completion(
    messages: List[Dict[str, Any]],
    model: Optional[str] = None,
    temperature: float = 0.7,
    max_tokens: int = 4096,
    top_p: float = 1.0,
    seed: Optional[int] = None,
    tools: Optional[List[Dict[str, Any]]] = None,
    tool_choice: Optional[Any] = None,
) -> TextContent:
    # No model specified -- use whatever is currently selected in the TUI's
    # MODELS tab (config.json's default_model), falling back if unset.
    resolved_model = model or _load_config().get("default_model") or FALLBACK_MODEL

    payload = {
        "model": resolved_model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "top_p": top_p,
        "stream": False,
    }
    if seed is not None:
        payload["seed"] = seed
    if tools is not None:
        payload["tools"] = tools
    if tool_choice is not None:
        payload["tool_choice"] = tool_choice

    resp = client.post("/chat/completions", json=payload, headers=_auth_headers())
    resp.raise_for_status()
    message = resp.json()["choices"][0]["message"]

    if message.get("tool_calls"):
        return TextContent(type="text", text=json.dumps(message))
    return TextContent(type="text", text=message["content"])


@mcp.tool(
    description="""List all models available through this NVIDIA NIM API key.

    Returns:
        Text content with the list of model ids returned by the /v1/models endpoint.
    """
)
def list_models() -> TextContent:
    resp = client.get("/models", headers=_auth_headers())
    resp.raise_for_status()
    models = [m["id"] for m in resp.json().get("data", [])]
    return TextContent(type="text", text="\n".join(sorted(models)))


def main():
    mcp.run()


if __name__ == "__main__":
    main()
