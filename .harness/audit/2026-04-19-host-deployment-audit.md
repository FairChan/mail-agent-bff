# Host Deployment Restoration Audit

- Task type: `Code`
- Implementer: Codex main thread
- Scope: host deployment scripts, GitHub Actions deployment workflow, deployment docs/checklist, and Redis type compatibility fix required for deploy-gating checks.
- User constraint: this thread is the only frontend-modifying thread; audit agents were read-only and did not edit frontend source.

## Validation

- `bash -n deploy.sh deploy/host/deploy.sh` passed.
- Ruby YAML parse of `.github/workflows/deploy.yml` passed (`DEPLOY_WORKFLOW_YAML_OK`).
- `git diff --check` on changed deployment/backend files passed.
- Local deploy artifact generation simulation passed and confirmed:
  - `deploy/host/deploy.sh` included.
  - `deploy/host/nginx-mail-agent.conf.example` included.
  - `deploy/host/openclaw-mail-bff.service.example` included.
  - `apps/bff/prisma/migrations/202604191830_multi_tenant_isolation_hardening/migration.sql` included.
- `npm run check` passed.
- `npm run build` passed.

## Audit Rounds

### Round 1

- Reviewer: Anscombe, separate Codex sub-agent, read-only.
- Time: `2026-04-19T18:45:00+08:00` approximate local thread time.
- Findings:
  - High: manual production workflow dispatch could deploy arbitrary refs.
  - High: host deploy skipped Prisma migrations.
  - Medium: SSH host verification fell back to `ssh-keyscan` TOFU.
  - Medium: Nginx example served HTTP only despite HTTPS deployment assumptions.
- Fixes:
  - Added production ref guard.
  - Added default `RUN_PRISMA_MIGRATE=true`.
  - Required pinned `SSH_KNOWN_HOSTS`.
  - Changed Nginx example to HTTP redirect plus HTTPS/TLS server.

### Round 2

- Reviewer: Kuhn, separate Codex sub-agent, read-only.
- Time: `2026-04-19T18:58:00+08:00` approximate local thread time.
- Findings:
  - High: production ref guard still ran after checkout/install scripts.
  - Medium: public healthcheck path was inconsistent.
  - Medium: deploy sync was exclusion-based and could copy private workspace files.
- Fixes:
  - Moved production dispatch guard to job-level before checkout/install.
  - Added `permissions: contents: read` and `persist-credentials: false`.
  - Aligned public checks on `/api/ready` and proxied public short health routes to `/api/*`.
  - Replaced root workspace sync with a deploy artifact generated from selected runtime/build inputs.

### Round 3

- Reviewer: Hypatia, separate Codex sub-agent, read-only.
- Time: `2026-04-19T19:05:00+08:00` approximate local thread time.
- Findings:
  - High: current worktree artifact could omit untracked `deploy/host` helper files.
  - High: current worktree artifact could omit the untracked Prisma migration.
  - Medium: local `skills/` could be removed from production artifact.
  - Medium: example systemd unit ran the BFF as root.
- Fixes after audit cap:
  - Artifact generation now allows deploy-critical `deploy/host` and `apps/bff/prisma` files from tracked plus non-ignored generated/current files.
  - Artifact step asserts host deploy helper, Prisma schema/migrations, migration count, and `skills/` are present.
  - `skills/` is included in the deployment artifact.
  - Example systemd unit now uses a dedicated `mail-agent` user/group and systemd hardening options.

## Final Status

- Sub-agent audit cap reached after three rounds.
- No Critical findings were reported in any round.
- All High findings returned by audit were fixed before delivery.
- All Medium findings returned by audit were fixed before delivery.
- No Low findings were reported.
- No fourth sub-agent audit was run because the workspace rule caps sub-agent audit at three rounds per task.
