import json
import logging
import uuid
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)

MAX_CONNECTIONS = 100


class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []
        # Remote control: session rooms
        # session_id -> { "host": websocket, "remotes": [websocket, ...], "state": {...} }
        self.session_rooms: dict[int, dict] = {}
        # websocket -> { "client_id": str, "session_id": int | None, "role": str }
        self.client_info: dict[WebSocket, dict] = {}

    async def connect(self, websocket: WebSocket):
        # Reject if too many connections
        if len(self.active_connections) >= MAX_CONNECTIONS:
            await websocket.close(code=1013, reason="Too many connections")
            return False
        await websocket.accept()
        self.active_connections.append(websocket)
        client_id = str(uuid.uuid4())[:8]
        self.client_info[websocket] = {
            "client_id": client_id,
            "session_id": None,
            "role": "none",
        }
        # Send client its ID
        await websocket.send_text(json.dumps({
            "event": "client_id",
            "data": {"client_id": client_id},
        }))
        return True

    def disconnect(self, websocket: WebSocket):
        info = self.client_info.pop(websocket, None)
        if info and info["session_id"] is not None:
            self._leave_room(websocket, info["session_id"], info["role"])
        try:
            self.active_connections.remove(websocket)
        except ValueError:
            pass  # Already removed by broadcast() cleanup

    def _leave_room(self, websocket: WebSocket, session_id: int, role: str):
        room = self.session_rooms.get(session_id)
        if not room:
            return
        if role == "host" and room.get("host") is websocket:
            room["host"] = None
            room["state"] = {}
        elif role == "remote":
            try:
                room["remotes"].remove(websocket)
            except ValueError:
                pass
        # Clean up empty rooms
        if not room.get("host") and not room.get("remotes"):
            del self.session_rooms[session_id]

    async def handle_message(self, websocket: WebSocket, raw: str):
        """Handle incoming messages from clients for remote control."""
        try:
            msg = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            return

        event = msg.get("event")
        data = msg.get("data", {})

        if event == "join_session":
            await self._handle_join(websocket, data)
        elif event == "leave_session":
            await self._handle_leave(websocket)
        elif event == "playback_state":
            await self._handle_playback_state(websocket, data)
        elif event == "playback_command":
            await self._handle_playback_command(websocket, data)

    async def _handle_join(self, websocket: WebSocket, data: dict):
        session_id = data.get("session_id")
        role = data.get("role", "remote")  # "host" or "remote"
        if session_id is None:
            return

        info = self.client_info.get(websocket)
        if not info:
            return

        # Leave previous room if any
        if info["session_id"] is not None:
            self._leave_room(websocket, info["session_id"], info["role"])

        # Join new room
        if session_id not in self.session_rooms:
            self.session_rooms[session_id] = {
                "host": None,
                "remotes": [],
                "state": {},
            }

        room = self.session_rooms[session_id]

        if role == "host":
            # If there's already a host, demote it to remote
            if room["host"] is not None and room["host"] is not websocket:
                old_host = room["host"]
                old_info = self.client_info.get(old_host)
                if old_info:
                    old_info["role"] = "remote"
                    room["remotes"].append(old_host)
                    try:
                        await old_host.send_text(json.dumps({
                            "event": "role_changed",
                            "data": {"role": "remote"},
                        }))
                    except Exception:
                        pass
            room["host"] = websocket
        else:
            if websocket not in room["remotes"]:
                room["remotes"].append(websocket)

        info["session_id"] = session_id
        info["role"] = role

        # Send confirmation
        await websocket.send_text(json.dumps({
            "event": "joined_session",
            "data": {
                "session_id": session_id,
                "role": role,
                "has_host": room["host"] is not None,
            },
        }))

        # If joining as remote and host has state, send current state
        if role == "remote" and room["state"]:
            await websocket.send_text(json.dumps({
                "event": "playback_state",
                "data": room["state"],
            }))

    async def _handle_leave(self, websocket: WebSocket):
        info = self.client_info.get(websocket)
        if not info or info["session_id"] is None:
            return
        self._leave_room(websocket, info["session_id"], info["role"])
        info["session_id"] = None
        info["role"] = "none"

    async def _handle_playback_state(self, websocket: WebSocket, data: dict):
        """Host sends its playback state; broadcast to all remotes."""
        info = self.client_info.get(websocket)
        if not info or info["role"] != "host" or info["session_id"] is None:
            return

        room = self.session_rooms.get(info["session_id"])
        if not room:
            return

        room["state"] = data
        message = json.dumps({"event": "playback_state", "data": data})

        disconnected = []
        for remote in room["remotes"]:
            try:
                await remote.send_text(message)
            except Exception:
                disconnected.append(remote)

        for remote in disconnected:
            try:
                room["remotes"].remove(remote)
            except ValueError:
                pass

    async def _handle_playback_command(self, websocket: WebSocket, data: dict):
        """Remote sends a command; forward to host."""
        info = self.client_info.get(websocket)
        if not info or info["session_id"] is None:
            return

        room = self.session_rooms.get(info["session_id"])
        if not room or not room["host"]:
            return

        message = json.dumps({"event": "playback_command", "data": data})
        try:
            await room["host"].send_text(message)
        except Exception:
            pass

    async def broadcast(self, event: str, data: Any):
        message = json.dumps({"event": event, "data": data})
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception:
                disconnected.append(connection)
        for conn in disconnected:
            try:
                self.active_connections.remove(conn)
            except ValueError:
                pass


ws_manager = ConnectionManager()
