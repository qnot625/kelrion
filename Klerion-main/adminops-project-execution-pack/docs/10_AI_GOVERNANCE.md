# AI Governance

## Purpose

AI is an assistive platform capability, not a reason to bypass evidence, permissions, due process or human accountability.

## Authority classes

| Class | Meaning | Examples | Default control |
|---|---|---|---|
| Assist | Draft, summarize, search or extract; user decides | Draft case note, summarize policy, transcribe interview | User review before record/action |
| Recommend | Rank or suggest a next action | Suggest routing, highlight SLA risk, recommend interview follow-up | Explain evidence; accountable reviewer decides |
| Act | Execute a bounded low-risk action | Send approved reminder, schedule within rules, create follow-up task | Allowlisted tool, thresholds, audit and rollback |
| Prohibited autonomous decision | High-impact decision delegated to model | Reject applicant, discipline employee, approve payment, legal/security determination | Not permitted |

## Required AI use-case record

Every AI feature must define:

- Business purpose and owner.
- Authority class.
- Users and affected people.
- Data inputs and sensitive fields.
- Model/provider and deployment region.
- Retrieval sources and permission checks.
- Tools/actions available.
- Human-review and appeal path.
- Accuracy, bias, security, privacy and multilingual evaluations.
- Cost and latency budget.
- Logging, retention and incident procedure.
- Kill switch and fallback behavior.

## AI gateway requirements

- Provider-independent model interface.
- Tenant and user permission context.
- Prompt template/version registry.
- Data-loss prevention and sensitive-field filters.
- Retrieval that respects record and field permissions.
- Tool allowlist with typed arguments.
- Approval policy before high-impact actions.
- Model response/schema validation.
- Complete interaction and tool-use audit.
- Usage/cost controls by tenant and feature.
- Evaluation and regression testing before model/prompt changes.

## Recruitment and interview safeguards

Allowed early features:

- Job-related question templates.
- Interview scheduling and consent.
- Recording/transcription where lawful and disclosed.
- Structured interviewer notes and evidence extraction.
- Summary against explicit competency rubrics.
- Candidate accommodation workflow.
- Reviewer consistency and missing-evidence prompts.

Not allowed:

- Facial emotion recognition.
- Voice-based personality, honesty or health inference.
- Opaque “culture fit” or protected-trait proxies.
- Automatic rejection without meaningful human review.
- Training or evaluation on applicant data without a documented basis and controls.

## Evaluation dimensions

- Factual accuracy and groundedness.
- Retrieval permission correctness.
- Action/tool correctness.
- Refusal and escalation behavior.
- Bias/fairness across relevant populations and languages.
- Privacy leakage and prompt injection resistance.
- Hallucination and unsupported certainty.
- Latency, availability and cost.
- Human override and appeal effectiveness.

## Change management

A model, provider, prompt, retrieval method or tool-list change is a product release. It requires evaluation results, security/privacy review proportional to risk, rollback capability and monitoring after deployment.

## AI incident examples

- Unauthorized source retrieved.
- Sensitive information exposed in response/log.
- Action executed for wrong tenant/person.
- Systematic unfair recommendation.
- Unsupported answer causes operational harm.
- Prompt injection changes tool behavior.
- Model/provider outage blocks essential workflow.

Each incident has containment, audit preservation, customer/affected-person assessment, remediation and regression tests.
