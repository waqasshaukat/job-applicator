# Implementation Plan: Web UI + Job Control + Live Logs

## Goal
Add a Next.js UI that lets users log in, select Snaphunt, enter Snaphunt credentials in a one-time popup, start a job, view live logs, and stop the job with an “End” button. Show a final termination log and disable the End button on completion.

## Key Decisions
- UI framework: Next.js
- Log delivery: polling (5s interval) via JSON endpoint
- Stop control: POST endpoint (immediate stop)
- Snaphunt credentials: used in-memory only, never stored

## User Flow
1) Landing page → Login / Signup
2) After auth → Provider selection (radio: Snaphunt)
   - Note: “You must have an account and profile on Snaphunt.”
3) Select Snaphunt → Popup asks for Snaphunt email/password
   - Note: “Used only for logging in this time; never stored.”
4) Start job → Logs stream live to user
5) User can click “End” to stop job immediately
6) On termination: log “Job terminated successfully” and disable End button

## Backend Flow
1) Auth middleware verifies user session
2) POST /api/jobs/start
   - Body: { provider: "snaphunt", email, password, jobUrl? }
   - Starts job runner and returns jobId
3) GET /api/jobs/:id/logs?offset=0
   - Returns JSON: { lines, nextOffset, status }
   - Used by UI polling to append new lines every 5 seconds
4) POST /api/jobs/:id/end
   - Terminates the job immediately
   - Emits termination log message
5) Worker runs one job at a time for the MVP

## Refactor Requirements (Bot)
- Accept Snaphunt credentials via runtime input (not .env)
- Inject a logger sink that can store logs for polling
- Expose a job controller to allow external stop signal
- Ensure cleanup on stop (close browser, end process)

## Data Handling & Security
- Do not store Snaphunt credentials (memory only)
- Avoid logging credentials
- Use HTTPS in production

## Next Steps
1) Scaffold Next.js app and auth
2) Implement polling log endpoint
3) Implement job start + stop endpoints
4) Wire UI to backend APIs
5) Connect job runner to log polling + stop signal
6) Add termination message + disable End button
