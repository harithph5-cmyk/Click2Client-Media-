// The permission policy for agent tools. This runs in the backend for every tool call; the model cannot change it.
//   AUDIT      read-only. Anything above LOW risk is denied.
//   ASSISTED   (default) LOW runs; MEDIUM and HIGH are held for the owner's approval.
//   AUTONOMOUS LOW runs; MEDIUM runs only if the owner allowlisted that exact tool; HIGH always needs approval.
// RESTRICTED actions are denied in every mode.
export const MODES = ['audit', 'assisted', 'autonomous'];
export const RISKS = ['low', 'medium', 'high', 'restricted'];
export const DEFAULT_MODE = 'assisted';

export const normaliseMode = (m) => (MODES.includes(m) ? m : DEFAULT_MODE);

export function decide({ risk, mode = DEFAULT_MODE, allowlisted = false }) {
  if (!RISKS.includes(risk)) return { decision: 'deny', reason: 'unknown_risk' };       // fail closed
  const m = normaliseMode(mode);
  if (risk === 'restricted') return { decision: 'deny', reason: 'restricted_action' };
  if (risk === 'low') return { decision: 'allow', reason: 'low_risk' };
  if (m === 'audit') return { decision: 'deny', reason: 'read_only_mode' };
  if (m === 'autonomous' && risk === 'medium' && allowlisted) return { decision: 'allow', reason: 'allowlisted' };
  return { decision: 'approve', reason: 'needs_owner_approval' };
}
