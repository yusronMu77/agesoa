"""Handlers for the events routed to delivery by packages/contracts/events/catalog.json.

Each handler runs inside the inbox transaction (once per event id). Replace `not_handled_yet` with a real
handler as features land; the app refuses to start if this mapping and the catalog disagree.
"""

from agesoa_platform.inbox import EventHandler
from agesoa_platform.push import consumed_events, not_handled_yet

from agesoa_delivery import SERVICE

HANDLERS: dict[str, EventHandler] = {event_type: not_handled_yet for event_type in consumed_events(SERVICE)}
