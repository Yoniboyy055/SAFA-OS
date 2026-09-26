# YK Systems HQ Service Boundary

**Repository:** `Yoniboyy055/SAFA-OS`  
**Repository lane:** Ark / SAFA Core shared orchestration  
**Canonical YK Systems HQ:** `Yoniboyy055/Yksystems-HQ-Operations`

This repository is not reclassified as a YK Systems product/client repository by this file. Its own Ark/SAFA role remains intact.

## When YK Systems HQ policy applies

Whenever work in this repository:

- operates on YK Systems data, projects, products, clients or repositories;
- executes, reviews or orchestrates a YK Systems task;
- consumes YK Systems HQ decisions/standards;
- proposes changes that materially affect YK Systems;

the current YK Systems HQ governance applies.

Canonical policy paths:
- `operations/governance/cross-model-authority-standard-v1.md`
- `operations/governance/yk-mandatory-operating-standard-v1.md`
- `operations/governance/yk-repository-governance-bootstrap-standard-v1.md`

For YK Systems work automatically apply the relevant Executive Cabinet, Income & Asset Engine, Security & Production Readiness, Design & UX Quality, and Interaction Cost / Path Efficiency gates.

**"It works" is not enough.** When speed conflicts with quality: **ship smaller, not weaker**.

If private HQ cannot be accessed and the task requires current YK authority/policy, apply the compact baseline above and stop/escalate rather than guess.

Do not copy HQ secrets, client data, credentials or unrelated confidential information into this repository.

## Shared simulation tool — MiroFish

When work in this repository falls inside the YK Systems governance boundary, MiroFish is a registered **shared YK Systems synthetic-audience and multi-agent scenario-simulation tool**. It is not a dependency to install inside this repository by default.

Automatically consider MiroFish when material YK Systems work depends on likely customer/audience/stakeholder reactions, objections, adoption behavior, pricing or offer response, onboarding/flow response, launch/message response, or second-order multi-actor effects.

If using MiroFish would materially reduce uncertainty or expose failure modes, route the scenario through the shared YK Systems MiroFish capability when available. The owner does not need to remember to request it.

Rules:
- label MiroFish output as **synthetic evidence**;
- never present it as proof of demand, willingness to pay, conversion, retention, or statistically representative customer behavior;
- use real-user/customer/payment evidence for consequential commercial validation;
- do not copy secrets, credentials, unnecessary PII, or confidential client data into a simulation seed;
- do not embed/fork MiroFish here without a separate owner-approved technical/licensing decision.

If MiroFish is materially required but unavailable in the active runtime, report `MIROFISH_REQUIRED_BUT_UNAVAILABLE`. Do not silently replace it with one model pretending to be a multi-agent simulation.

This rule applies only to YK Systems work and does not reclassify this repository into the YK Systems company lane.

## Immediate activation for ongoing YK Systems work

Whenever work in this repository falls inside the YK Systems governance boundary, the current YK Systems HQ rules are **effective immediately**, including YK-related tasks, branches, pull requests, reviews, release candidates, orchestration work and deliverables that began before this bootstrap was installed.

Before the next material YK-related edit, review, merge, release, orchestration action or completion claim:

1. re-read this `YK_SYSTEMS_HQ.md` and the current repository-local instructions;
2. re-evaluate the active YK work against the applicable mandatory systems and six-question completion gate;
3. correct material gaps before proceeding;
4. record N/A gates, blockers, known debt and owner-authorized exceptions explicitly.

There is no grandfathering for open YK Systems work.

Finally closed historical work does not need to be reopened solely for this policy. If reactivated, modified, re-released or used as the active basis for new YK work, current governance applies.

A running model/agent session does not receive Git updates automatically. It must reload/re-read current instructions before its next material YK-related action. If current YK governance cannot be verified when required, stop/escalate rather than continue from stale instructions.

This rule does **not** reclassify this repository into the YK Systems company lane; it applies only when the work is inside the YK Systems boundary.

## Six-question completion gate

Before material work is called **done**, **ready**, **approved**, **launch-ready**, or **production-ready**, the executor/reviewer must determine which of the five operating systems apply and provide evidence for the applicable gates.

At minimum, the completion evidence must answer:

1. **Business/authority:** Is the work aligned with the current owner decision and commercial/operational objective?
2. **Execution:** Is the smallest coherent scope actually complete, testable and supportable?
3. **Security/reliability:** Are applicable security, privacy, failure-path, rollback and production-readiness checks verified?
4. **Design/UX:** Does the customer/user-facing result meet YK Systems' visual, usability, accessibility, trust and responsive-quality bar?
5. **Path efficiency:** Is the important happy path clear, and have avoidable clicks, decisions, fields, waits and dead ends been removed?
6. **Evidence:** What was tested/reviewed, what remains unverified, and what known debt or exception is being accepted?

If a gate is irrelevant, mark it **N/A with a short reason** rather than silently omitting it.
