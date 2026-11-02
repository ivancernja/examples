---
name: Encore Backend
description: Backend team that designs, builds and deploys Encore.ts services to Encore Cloud or the company's own AWS or GCP account.
schema: agentcompanies/v1
slug: encore-backend
category: software-development
key: encoredev/optional/software-development/encore-backend
manager: agents/backend-lead/AGENTS.md
includes:
  - agents/encore-engineer/AGENTS.md
  - agents/deploy-reviewer/AGENTS.md
  - skills/encore-service/SKILL.md
  - skills/encore-api/SKILL.md
  - skills/encore-database/SKILL.md
  - skills/encore-pubsub/SKILL.md
  - skills/encore-cron/SKILL.md
  - skills/encore-deploy/SKILL.md
  - projects/encore-backend/PROJECT.md
defaultInstall: false
recommendedForCompanyTypes:
  - software
  - startup
tags:
  - engineering
  - backend
  - encore
  - deployment
---

# Encore Backend

A backend pod for companies whose product needs APIs, databases, queues and scheduled jobs. Agents write Encore.ts services. Encore reads the infrastructure from the code (Postgres, Pub/Sub, cron, secrets) and provisions it locally with `encore run` and in Encore Cloud or the company's own AWS or GCP account on `git push encore`.

## Contents

- `backend-lead`: team root. Splits backend work into one task per service and reviews the design.
- `encore-engineer`: builds services with the vendored Encore skills and runs them with `encore run` and `encore test`.
- `deploy-reviewer`: checks preview and staging deploys and reports the URL or the failing step.
- `encore-backend` project and `weekly-deploy-check` routine.

Skills are vendored from https://github.com/encoredev/skills at commit e86a3ab6f8bfda84ba8a8ae0f64e5cb7290c7284 (Apache-2.0, see `LICENSE-encoredev-skills`).
