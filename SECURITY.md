# Security Policy

The Alberta AI Academy is a static Vue 3 / Vite site. All learning content lives in JSON files
and there is no backend or database, so the main risks are supply-chain issues in build
dependencies, misconfigured deployment workflows, and accidental disclosure of information in
content files.

## Supported Versions

Only the code currently deployed from the `main` branch is supported. Fixes are applied to
`main` and flow to the live site through the automated mirror and GitHub Pages deployment.

| Version | Supported |
|---------|-----------|
| `main` (live site) | :white_check_mark: |
| Any older commit, tag, or fork | :x: |

## Reporting a Vulnerability

**Do not open a public issue for a security vulnerability.**

Report privately using one of the following:

1. **GitHub private vulnerability reporting** (preferred) — on the private source repository
   `GovAlta-EMU/AIM-AI-ACADEMY`, go to the **Security** tab and choose
   **Report a vulnerability**.
2. **Email** — contact the Government of Alberta AI Academy maintainers through your usual
   ministry channel, or the repository owners listed in `CODEOWNERS` / the repository
   About section.

Please include:

- A description of the issue and its potential impact
- Steps to reproduce, or a proof of concept
- Affected URL, file path, or dependency and version
- Any suggested remediation

### What to expect

| Stage | Target |
|-------|--------|
| Acknowledgement of your report | Within 3 business days |
| Initial assessment and severity triage | Within 10 business days |
| Fix or mitigation for confirmed high-severity issues | As quickly as practical, typically within 30 days |
| Notification when the issue is resolved | At time of deployment |

Please give us reasonable time to remediate before any public disclosure. We are happy to
credit reporters in the resolution notes unless you prefer to remain anonymous.

## Scope

In scope:

- The site code in this repository (Vue components, stores, build configuration, Python scripts)
- The GitHub Actions workflows, including `mirror-to-public.yml` and `deploy-pages.yml`
- Content JSON files under `frontend/src/data/`
- The deployed GitHub Pages site

Out of scope:

- Third-party services linked from course content (YouTube, external articles, vendor tools)
- Findings that require a compromised maintainer account or physical access
- Missing security headers or best practices with no demonstrable impact on a static site
- Automated scanner output without a working proof of concept
- Denial of service, social engineering, and spam

## Handling Sensitive Information

This repository is public-facing. Do not commit:

- Credentials, API keys, or personal access tokens
- Personal information about staff or learners
- Internal-only Government of Alberta documents or unpublished material

If you believe sensitive data has been committed, report it privately as described above so it
can be removed and any exposed credential rotated. Note that the private repository
`GovAlta-EMU/AIM-AI-ACADEMY` is the source of truth and the public repository receives
snapshot commits, so removal must be done in the private repository first.

## Repository Security Practices

- The private repository `GovAlta-EMU/AIM-AI-ACADEMY` is the authoritative source; the public
  repository `GovAlta/Alberta-AI-Academy` is a mirror and should never be pushed to directly.
- Dependency and code scanning alerts are reviewed by maintainers on the private repository.
- Workflow permissions are kept to the minimum required, and secrets are stored only as
  GitHub Actions secrets.
