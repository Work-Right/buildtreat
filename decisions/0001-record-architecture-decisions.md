# 0001 — Record architecture decisions

**Status:** Accepted

**Date:** {{CREATION_DATE}}

## Context

We need a lightweight way to record architecturally significant decisions
made during the life of {{PROJECT_NAME}}. Without a record, the reasoning
behind decisions gets lost; future-us re-litigates the same trade-offs;
new collaborators have to reverse-engineer intent from code.

The project also uses [deciduous](https://github.com/notactuallytreyanastasio/deciduous)
to capture decisions in a finer-grained, queryable graph form. ADRs and
deciduous nodes are complementary, not redundant:

- **ADRs** are durable, narrative-style documents pinned to git history.
  They survive context compression, are easy to read in a browser, and
  show up in code review.
- **Deciduous nodes** are short, structured, queryable. They live in a
  graph that captures relationships between goals, options, decisions,
  and outcomes.

Use both when a decision warrants both. Use just deciduous for things
that are too small or too in-the-moment for an ADR.

## Decision

Use Architecture Decision Records (ADRs) as described by Michael Nygard
in [Documenting Architecture Decisions](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions).

ADRs live in `docs/decisions/`, numbered sequentially, and follow the
format: Status, Date, Context, Decision, Consequences.

## Consequences

- New decisions get a short markdown file. The cost is low; the payoff
  is paid out over the life of the project.
- Code reviewers see ADRs change in PRs and can push back on decisions
  before they get baked in.
- The decision history is grep-able and lives next to the code, not in
  a separate wiki that drifts out of sync.
- Some decisions will get logged in deciduous but not as ADRs (too small),
  and some in both (significant + worth a narrative). That overlap is fine.
