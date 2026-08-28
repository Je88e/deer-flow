"""Middleware for automatic thread title generation."""

import logging
import re
from collections.abc import Sequence
from typing import TYPE_CHECKING, Any, NotRequired, override

from langchain.agents import AgentState
from langchain.agents.middleware import AgentMiddleware
from langgraph.config import get_config
from langgraph.constants import TAG_NOSTREAM
from langgraph.runtime import Runtime

from deerflow.agents.middlewares.dynamic_context_middleware import is_dynamic_context_reminder
from deerflow.config.title_config import get_title_config
from deerflow.models import create_chat_model

if TYPE_CHECKING:
    from deerflow.config.app_config import AppConfig
    from deerflow.config.title_config import TitleConfig

logger = logging.getLogger(__name__)

# ``UploadsMiddleware`` wraps attachments in a ``<current_uploads>`` block that
# also carries paths, document previews, and tool hints — hundreds to thousands
# of characters that would otherwise consume the title budget and hide the
# actual request.
_UPLOADS_BLOCK_RE = re.compile(r"<current_uploads>[\s\S]*?</current_uploads>", re.IGNORECASE)
# File entry lines inside the block look like ``- 批31772-COA.pdf (420.7 KB)``.
_UPLOADED_FILENAME_RE = re.compile(r"^\s*-\s+(?P<name>.+?)\s+\([^()]*\)\s*$", re.MULTILINE)


class TitleMiddlewareState(AgentState):
    """Compatible with the `ThreadState` schema."""

    title: NotRequired[str | None]


class TitleMiddleware(AgentMiddleware[TitleMiddlewareState]):
    """Automatically generate a title for the thread after the first user message."""

    state_schema = TitleMiddlewareState

    def __init__(
        self,
        *,
        app_config: "AppConfig | None" = None,
        title_config: "TitleConfig | None" = None,
        extensions=None,
    ):
        super().__init__()
        self._app_config = app_config
        self._title_config = title_config
        if extensions is None:
            from deerflow.extensions import get_agent_build_extensions

            extensions = get_agent_build_extensions()
        self._extensions = extensions

    def _get_title_config(self):
        if self._title_config is not None:
            return self._title_config
        if self._app_config is not None:
            return self._app_config.title
        return get_title_config()

    def _normalize_content(self, content: object) -> str:
        if isinstance(content, str):
            return content

        if isinstance(content, list):
            parts = [self._normalize_content(item) for item in content]
            return "\n".join(part for part in parts if part)

        if isinstance(content, dict):
            text_value = content.get("text")
            if isinstance(text_value, str):
                return text_value

            nested_content = content.get("content")
            if nested_content is not None:
                return self._normalize_content(nested_content)

        return ""

    @staticmethod
    def _message_type(message: object) -> str | None:
        message_type = getattr(message, "type", None)
        if message_type is None and isinstance(message, dict):
            message_type = message.get("type") or message.get("role")
        if message_type == "user":
            return "human"
        if message_type == "assistant":
            return "ai"
        return message_type if isinstance(message_type, str) else None

    @staticmethod
    def _message_content(message: object) -> object:
        if isinstance(message, dict):
            return message.get("content", "")
        return getattr(message, "content", "")

    @staticmethod
    def _is_dynamic_context_reminder_message(message: object) -> bool:
        if is_dynamic_context_reminder(message):
            return True
        if isinstance(message, dict):
            additional_kwargs = message.get("additional_kwargs")
            return isinstance(additional_kwargs, dict) and bool(additional_kwargs.get("dynamic_context_reminder"))
        return False

    @staticmethod
    def _is_user_message_for_title(message: object) -> bool:
        return TitleMiddleware._message_type(message) == "human" and not TitleMiddleware._is_dynamic_context_reminder_message(message)

    def _get_title_user_message(self, state: TitleMiddlewareState) -> str:
        messages = state.get("messages") or []
        user_msg_content = next((self._message_content(m) for m in messages if self._is_user_message_for_title(m)), "")
        return self._normalize_content(user_msg_content)

    def _split_uploads_block(self, text: str) -> tuple[str, list[str]]:
        """Split normalized user text into the real body and uploaded-file names.

        The ``<current_uploads>`` wrapper is removed from the body so the
        user's actual request stays visible to the title budget. File names
        are high-signal title context and survive; paths, document previews,
        and tool hints inside the block are dropped.
        """
        names: list[str] = []
        for block in _UPLOADS_BLOCK_RE.findall(text):
            names.extend(_UPLOADED_FILENAME_RE.findall(block))
        body = _UPLOADS_BLOCK_RE.sub(" ", text).strip()
        return body, list(dict.fromkeys(names))

    def _get_title_user_parts(self, state: TitleMiddlewareState) -> tuple[str, list[str]]:
        return self._split_uploads_block(self._get_title_user_message(state))

    @staticmethod
    def _compose_title_user_msg(body: str, attachment_names: Sequence[str]) -> str:
        """Join body and attachment names; the attachment suffix is never length-capped."""
        if not attachment_names:
            return body
        suffix = f"(Attachments: {', '.join(attachment_names)})"
        return f"{body}\n{suffix}" if body else suffix

    def _should_generate_title(self, state: TitleMiddlewareState, *, allow_partial_exchange: bool = False) -> bool:
        """Check if we should generate a title for this thread."""
        config = self._get_title_config()
        if not config.enabled:
            return False

        # Check if thread already has a title in state
        if state.get("title"):
            return False

        # Check if this is the first turn (has at least one user message and one assistant response).
        # Defensively coerce a None ``messages`` channel (possible when reading a
        # partially-initialized checkpoint) into an empty list so ``len()`` is safe.
        messages = state.get("messages") or []
        min_messages = 1 if allow_partial_exchange else 2
        if len(messages) < min_messages:
            return False

        # Count user and assistant messages
        user_messages = [m for m in messages if self._is_user_message_for_title(m)]
        assistant_messages = [m for m in messages if self._message_type(m) == "ai"]

        # Normal path: title only after first complete exchange. Interrupted path
        # (``allow_partial_exchange=True``) accepts a lone first-turn user message
        # so a fallback title can still be persisted when the run is cancelled
        # before any AI chunk reaches the checkpoint.
        return len(user_messages) == 1 and (len(assistant_messages) >= 1 or allow_partial_exchange)

    def _build_title_prompt(self, state: TitleMiddlewareState) -> tuple[str, str]:
        """Extract user/assistant messages and build the title prompt.

        The user body keeps the 500-char cut; the attachment-name suffix is
        appended whole after it (never truncated). Returns (prompt_string,
        user_msg) so callers can use user_msg as fallback.
        """
        config = self._get_title_config()
        messages = state.get("messages") or []

        assistant_msg_content = next((self._message_content(m) for m in messages if self._message_type(m) == "ai"), "")

        body, attachment_names = self._get_title_user_parts(state)
        user_msg = self._compose_title_user_msg(body[:500], attachment_names)
        assistant_msg = self._strip_think_tags(self._normalize_content(assistant_msg_content))

        prompt = config.prompt_template.format(
            max_words=config.max_words,
            # Body was already cut to 500 chars before the attachment suffix was
            # appended, so the composed value goes in whole.
            user_msg=user_msg,
            assistant_msg=assistant_msg[:500],
        )
        return prompt, user_msg

    def _strip_think_tags(self, text: str) -> str:
        """Remove <think>...</think> blocks emitted by reasoning models (e.g. minimax, DeepSeek-R1)."""
        return re.sub(r"<think>[\s\S]*?</think>", "", text, flags=re.IGNORECASE).strip()

    def _parse_title(self, content: object) -> str:
        """Normalize model output into a clean title string."""
        config = self._get_title_config()
        title_content = self._normalize_content(content)
        title_content = self._strip_think_tags(title_content)
        title = title_content.strip().strip('"').strip("'")
        return title[: config.max_chars] if len(title) > config.max_chars else title

    def _fallback_title(self, user_msg: str, attachment_names: Sequence[str] = ()) -> str:
        config = self._get_title_config()
        # An attachments-only first message still earns a meaningful title:
        # the first uploaded file name beats the generic default.
        source = user_msg or (attachment_names[0] if attachment_names else "")
        fallback_chars = min(config.max_chars, 50)
        if len(source) > fallback_chars:
            # Reserve room for the ellipsis so this path honours ``max_chars``
            # exactly as ``_parse_title`` does on the model path.
            ellipsis = "..."
            body = min(fallback_chars, config.max_chars - len(ellipsis))
            return source[:body].rstrip() + ellipsis
        return source if source else "New Conversation"

    def _get_runnable_config(self) -> dict[str, Any]:
        """Inherit the parent RunnableConfig and add middleware tag.

        This ensures RunJournal identifies LLM calls from this middleware
        as ``middleware:title`` instead of ``lead_agent``.
        """
        try:
            parent = get_config()
        except Exception:
            parent = {}
        config = {**parent}
        config["run_name"] = "title_agent"
        config["tags"] = [
            *(config.get("tags") or []),
            "middleware:title",
            TAG_NOSTREAM,
        ]
        return config

    def _generate_title_result(self, state: TitleMiddlewareState, *, allow_partial_exchange: bool = False) -> dict | None:
        """Generate a local fallback title without blocking on an LLM call."""
        if not self._should_generate_title(state, allow_partial_exchange=allow_partial_exchange):
            return None

        body, attachment_names = self._get_title_user_parts(state)
        return {"title": self._fallback_title(body, attachment_names)}

    async def _agenerate_title_result(
        self,
        state: TitleMiddlewareState,
        *,
        task_store=None,
    ) -> dict | None:
        """Generate a configured LLM title asynchronously and fall back locally."""
        if not self._should_generate_title(state):
            return None

        config = self._get_title_config()
        body, attachment_names = self._get_title_user_parts(state)
        if not config.model_name:
            return {"title": self._fallback_title(body, attachment_names)}

        try:
            prompt, _ = self._build_title_prompt(state)
            # attach_tracing=False because ``_get_runnable_config()`` inherits
            # the graph-level RunnableConfig (set in ``_make_lead_agent``) whose
            # callbacks already carry tracing handlers; binding them again at
            # the model level would emit duplicate spans.
            model_kwargs = {"thinking_enabled": False, "attach_tracing": False}
            if self._app_config is not None:
                model_kwargs["app_config"] = self._app_config
            model = create_chat_model(name=config.model_name, **model_kwargs)
            invoke_config = self._get_runnable_config()

            from deerflow_extension_api import SystemOperationKind

            from deerflow.extensions.notify import observe_system_model_call

            response = await observe_system_model_call(
                self._extensions,
                SystemOperationKind.TITLE,
                messages=prompt,
                model_name=config.model_name,
                invoke_config=invoke_config,
                invoke=lambda: model.ainvoke(prompt, config=invoke_config),
                task_store=task_store,
            )
            title = self._parse_title(response.content)
            if title:
                return {"title": title}
        except Exception:
            logger.debug("Failed to generate async title; falling back to local title", exc_info=True)
        return {"title": self._fallback_title(body, attachment_names)}

    @override
    def after_model(self, state: TitleMiddlewareState, runtime: Runtime) -> dict | None:
        return self._generate_title_result(state)

    @override
    async def aafter_model(self, state: TitleMiddlewareState, runtime: Runtime) -> dict | None:
        from deerflow_extension_api import task_store_from_runtime

        return await self._agenerate_title_result(
            state,
            task_store=task_store_from_runtime(runtime),
        )
