# HEARTBEAT.md

# Mail Agent Heartbeat — Background Tasks
# Keep tasks below when you want the agent to check something periodically.
# Each task is a cron-style expression followed by the task description.

# ─── Event-Driven Mail Pipeline (Phase 1) ───────────────────────────────────
# Primary: Webhook-driven via Composio OUTLOOK_NEW_MESSAGE_TRIGGER
#   → Ngrok tunnel → BFF /api/webhook/mail-event
#   → OpensClaw sub-agent → Mail processor agent
#   → SSE push to WebUI + calendar sync + knowledge store
#
# Backup: Periodic poll (every 5 min) if webhook delivery fails
#   → BFF internal timer → OUTLOOK_QUERY_EMAILS (fetch new since last check)
#   → Same downstream processing as webhook path
#   → Prevents missed events during tunnel downtime
# ───────────────────────────────────────────────────────────────────────────

# ─── Cron Tasks ──────────────────────────────────────────────────────────────
# Format: cron expression | agent_id | task description
#
# Daily digest at 7:00 AM (Asia/Shanghai timezone)
# ┌─────────── minute (0)
# │ ┌───────── hour (7)
# │ │ ┌─────── day of month (*)
# │ │ │ ┌───── month (*)
# │ │ │ │ ┌─── day of week (1-5 = Mon-Fri)
# │ │ │ │ │
# 0 7 * * 1-5 | mail-processor | Daily briefing: summarize past 24h, push to WeChat/DingTalk, write to calendar
#
# Webhook health check every 10 minutes
# ┌─────────── minute (*/10)
# │ ┌───────── hour (*)
# │ │ ┌─────── day of month (*)
# │ │ │ ┌───── month (*)
# │ │ │ │ ┌─── day of week (*)
# │ │ │ │ │
# */10 * * * * | system | Check ngrok tunnel + webhook endpoint health, alert if down

# ─── Heartbeat Task: Periodic Mail Poll (Backup for Webhook) ────────────────
# If Composio OUTLOOK_NEW_MESSAGE_TRIGGER is not configured or the tunnel is down,
# this periodic poll ensures no new mail is missed.
#
# Frequency: Every 5 minutes
# Logic:
#   1. Call OUTLOOK_QUERY_EMAILS with filter: receivedDateTime > lastPollTimestamp
#   2. For each new message:
#      a. Fetch full content via OUTLOOK_GET_MESSAGE
#      b. Trigger mail processor sub-agent
#      c. If quadrant=urgent_important → push notification
#      d. Store to memory/knowledge-base
#   3. Update lastPollTimestamp in persistent state
#   4. Log summary: "{count} new emails processed, {urgent} urgent"

# ─── Implementation Note ─────────────────────────────────────────────────────
# The periodic poll is implemented as a setInterval timer in the BFF server,
# started during server initialization. This avoids relying on OpenClaw's
# heartbeat system for millisecond-accurate polling.
#
# See: apps/bff/src/server.ts → mailPollingTimer initialization
# See: apps/bff/src/webhook-handler.ts → processNewMailEvent()
#
# OpenClaw heartbeat is used for:
#   1. Daily digest cron (morning briefing)
#   2. Tunnel health monitoring
#   3. Agent-level memory compaction
