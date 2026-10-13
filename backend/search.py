import logging
from typing import Dict, List

from ddgs import DDGS

log = logging.getLogger(__name__)


def search_web(query: str, max_results: int = 3) -> List[Dict[str, str]]:
    """
    Search the web using DuckDuckGo.

    Returns a list of dictionaries with 'title', 'snippet', and 'url' keys,
    or an empty list on error so a failed search never breaks a chat answer.
    """
    try:
        return [
            {'title': r.get('title', ''), 'snippet': r.get('body', ''), 'url': r.get('href', '')}
            for r in DDGS().text(query, max_results=max_results)
        ]
    except Exception as e:
        log.warning("Web search failed: %s", e)
        return []
