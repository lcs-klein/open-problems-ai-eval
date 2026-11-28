-- Resolve locked terminology alerts (TERM-001 & TERM-002) in active Open Problems
-- and internal screening candidates without overwriting unrelated live records.

-- 1. Active public & internal open_problems (7 rows)
UPDATE open_problems
SET
  title = 'Unclear definitions of capabilities and propensities',
  terminology_alerts_json = '[]',
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  updated_by = 'migration:0002_resolve_terminology_alerts'
WHERE id = 'C.F2a';

UPDATE open_problems
SET
  description = 'A higher score may reflect a different test, population or difficulty rather than a more capable system. Evaluators need defensible scales for comparing results and describing how broadly capabilities apply, including when systems exceed existing tests.',
  terminology_alerts_json = '[]',
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  updated_by = 'migration:0002_resolve_terminology_alerts'
WHERE id = 'C.F3a';

UPDATE open_problems
SET
  description = 'How can evaluation procedures reveal consequential capabilities, propensities and failures under a specified system configuration and resource budget? We need evidence that the evaluation gave the system a suitable opportunity to act and that the test conditions did not substitute a different capability for the one of interest.',
  terminology_alerts_json = '[]',
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  updated_by = 'migration:0002_resolve_terminology_alerts'
WHERE id = 'C.T.ELICIT';

UPDATE open_problems
SET
  description = 'An evaluation score can reflect shortcuts or features of the test instead of the capability or risk it is meant to measure. Evaluators need to show which conclusions a result supports, for which people or settings, and what evidence rules out other explanations.',
  terminology_alerts_json = '[]',
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  updated_by = 'migration:0002_resolve_terminology_alerts'
WHERE id = 'C.V1a';

UPDATE open_problems
SET
  description = 'New uses can require capabilities that existing tests do not assess. We need ways to forecast which capabilities future workflows will require and how far in advance those forecasts are reliable enough to guide evaluation planning.',
  terminology_alerts_json = '[]',
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  updated_by = 'migration:0002_resolve_terminology_alerts'
WHERE id = 'C.D5';

UPDATE open_problems
SET
  description = 'Different organizations may control the model, deployment, logs and capability to intervene. How should evaluation, incident reporting and response duties be allocated so emerging problems are detected and acted on?',
  terminology_alerts_json = '[]',
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  updated_by = 'migration:0002_resolve_terminology_alerts'
WHERE id = 'N.I3.duties';

UPDATE open_problems
SET
  description = 'No agenda can investigate every important question. We need principled ways to allocate effort across immediate harms, future risks, benefits and neglected evidence gaps. Priorities should consider decision value, irreversibility and uncertainty, while resisting the propensity to equate convenient tests or abundant publications with importance.',
  terminology_alerts_json = '[]',
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  updated_by = 'migration:0002_resolve_terminology_alerts'
WHERE id = 'R.P3';

-- 2. Internal screening candidates (4 rows)
UPDATE internal_candidates
SET payload_json = json_set(
  payload_json,
  '$.description', 'What a system can do differs from what it tends to do. Both require concepts that survive beyond one benchmark and distinguish capabilities, preferences and context. The open problem is to connect explicit definitions, empirical structure and explanatory models without treating convenient scores as the properties themselves.',
  '$.terminology_alerts', json('[]')
)
WHERE id = 'R.F2';

UPDATE internal_candidates
SET payload_json = json_set(
  payload_json,
  '$.description', 'Evaluation scores often lack a shared meaning across tests, populations and time. A higher percentage need not represent the same improvement everywhere. We need defensible scales for breadth, difficulty and behavioural propensities, including extreme capability, without assuming that all valued properties fit one number.',
  '$.terminology_alerts', json('[]')
)
WHERE id = 'R.F3';

UPDATE internal_candidates
SET payload_json = json_set(
  payload_json,
  '$.description', 'Observed performance depends on how a system is prompted, assisted and challenged. Evaluation methods must expose consequential capabilities and propensities under specified resources, including behaviour hidden by training or strategic underperformance. The challenge is to elicit informative behaviour without silently changing what capability is being tested.',
  '$.terminology_alerts', json('[]')
)
WHERE id = 'R.T1';

UPDATE internal_candidates
SET payload_json = json_set(
  payload_json,
  '$.description', 'Not observing a failure or capability does not establish its absence. We need explicit assumptions linking search effort, coverage and adversarial behaviour to the assurance a decision requires. The central challenge is to state meaningful bounds and residual uncertainty when complete testing is impossible.',
  '$.terminology_alerts', json('[]')
)
WHERE id = 'R.V4';
