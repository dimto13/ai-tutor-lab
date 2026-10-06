const ref = process.argv[2] ?? "main";
if (ref !== "main" && !/^[a-f0-9]{40}$/.test(ref))
  throw new Error("Worker source ref must be main or exact validated SHA");
const shell = `#!/usr/bin/env bash
set -Eeuo pipefail
[[ "$WORKER_SCRIPT_REF" == main || "$WORKER_SCRIPT_REF" =~ ^[a-f0-9]{40}$ ]] || { echo INVALID_REF; exit 1; }
[[ "$WORKER_ACTION" == plan || "$WORKER_ACTION" == execute || "$WORKER_ACTION" == quota || "$WORKER_ACTION" == setup ]] || { echo INVALID_ACTION; exit 1; }
[[ "$WORKER_PROVIDER" == codex || "$WORKER_PROVIDER" == claude ]] || { echo INVALID_PROVIDER; exit 1; }
[[ "$WORKER_MODEL" =~ ^[a-zA-Z0-9_.-]+$ && "$WORKER_REASONING" =~ ^(low|medium|high|xhigh|max|ultra)$ ]] || { echo INVALID_MODEL; exit 1; }
timeout --signal=TERM --kill-after=10s 50m ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=8 rmi "bash -s -- $WORKER_SCRIPT_REF $WORKER_ACTION $WORKER_PROVIDER $WORKER_MODEL $WORKER_REASONING" <<'RMI_WORKER'
set -Eeuo pipefail
[[ "$(hostname)" == rmi ]] || { echo RMI_ONLY; exit 1; }
export PATH=/home/tobi/skripte/ai-tutor-lab-jenkins/toolchain/node_modules/.bin:/usr/local/bin:/usr/bin:/bin
export AI_TUTOR_WORKER_HOME=/home/tobi/skripte/ai-tutor-lab-jenkins/workspaces
export AI_TUTOR_WORKER_STATE_HOME=/home/tobi/skripte/ai-tutor-lab-jenkins/state
export AI_TUTOR_WORKER_ACTION="$2"
export AI_TUTOR_WORKER_PROVIDER="$3"
export AI_TUTOR_WORKER_MODEL="$4"
export AI_TUTOR_WORKER_REASONING="$5"
umask 077
mkdir -p "$AI_TUTOR_WORKER_STATE_HOME"
exec 9>"$AI_TUTOR_WORKER_STATE_HOME/project.lock"
flock -n 9 || { echo WORKER_ALREADY_RUNNING; exit 0; }
export AI_TUTOR_WORKER_LOCKED=1
script_sha=$(gh api "repos/dimto13/ai-tutor-lab/commits/$1" --jq .sha)
source_dir=/home/tobi/skripte/ai-tutor-lab-jenkins/source/$script_sha
mkdir -p "$source_dir"
for file in executor-contract.mjs executor-quota.mjs jenkins-local-worker.mjs jenkins-rmi-setup.sh jenkins-rmi-worker.Dockerfile; do
  if [[ ! -f "$source_dir/$file" ]]; then
    gh api --method GET "repos/dimto13/ai-tutor-lab/contents/scripts/$file" -f "ref=$script_sha" --jq .content | base64 --decode > "$source_dir/$file.part"
    mv "$source_dir/$file.part" "$source_dir/$file"
  fi
done
echo "Executor host: $(hostname); user: $(id -un); source SHA: $script_sha; action: $AI_TUTOR_WORKER_ACTION; provider: $AI_TUTOR_WORKER_PROVIDER; model: $AI_TUTOR_WORKER_MODEL"
if [[ "$AI_TUTOR_WORKER_ACTION" == setup ]]; then
  timeout --signal=TERM --kill-after=10s 15m bash "$source_dir/jenkins-rmi-setup.sh" "$source_dir"
  exit
fi
timeout --signal=TERM --kill-after=10s 48m node "$source_dir/jenkins-local-worker.mjs"
RMI_WORKER
`;
const xml = (value) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
console.log(`<?xml version="1.0" encoding="UTF-8"?>
<project><actions/><description>PLAN external-executor:v1 dispatch; Jenkins to RMI only. All quota windows must have at least 50 percent remaining. Below floor: daily SKIP, no coding; unknown quota: fail closed. PREPARE ONLY: no merge/deploy or work-stealing. Source dimto13/ai-tutor-lab scripts/jenkins-local-worker-config.mjs.</description>
<keepDependencies>false</keepDependencies><properties>
<jenkins.model.BuildDiscarderProperty><strategy class="hudson.tasks.LogRotator"><daysToKeep>14</daysToKeep><numToKeep>100</numToKeep><artifactDaysToKeep>-1</artifactDaysToKeep><artifactNumToKeep>-1</artifactNumToKeep></strategy></jenkins.model.BuildDiscarderProperty>
<hudson.model.ParametersDefinitionProperty><parameterDefinitions>
<hudson.model.StringParameterDefinition><name>WORKER_SCRIPT_REF</name><description>main normally; validated exact feature SHA only during initial executor acceptance.</description><defaultValue>${ref}</defaultValue><trim>true</trim></hudson.model.StringParameterDefinition>
<hudson.model.StringParameterDefinition><name>WORKER_ACTION</name><description>execute enforces quota before any work; plan is read-only; quota reports without coding; setup is explicit one-time toolchain/image provisioning, never the timer default.</description><defaultValue>execute</defaultValue><trim>true</trim></hudson.model.StringParameterDefinition>
<hudson.model.StringParameterDefinition><name>WORKER_PROVIDER</name><description>codex is configured; claude is fail-closed until a reliable quota adapter exists. Never automatic fallback.</description><defaultValue>codex</defaultValue><trim>true</trim></hudson.model.StringParameterDefinition>
<hudson.model.StringParameterDefinition><name>WORKER_MODEL</name><description>Explicit model; default matches the existing RMI choice, not hidden user config.</description><defaultValue>gpt-5.6-sol</defaultValue><trim>true</trim></hudson.model.StringParameterDefinition>
<hudson.model.StringParameterDefinition><name>WORKER_REASONING</name><description>Explicit reasoning effort; existing RMI choice.</description><defaultValue>xhigh</defaultValue><trim>true</trim></hudson.model.StringParameterDefinition>
</parameterDefinitions></hudson.model.ParametersDefinitionProperty></properties>
<scm class="hudson.scm.NullSCM"/><canRoam>true</canRoam><disabled>false</disabled><blockBuildWhenDownstreamBuilding>false</blockBuildWhenDownstreamBuilding><blockBuildWhenUpstreamBuilding>false</blockBuildWhenUpstreamBuilding>
<triggers><hudson.triggers.TimerTrigger><spec>H/20 * * * *</spec></hudson.triggers.TimerTrigger></triggers><concurrentBuild>false</concurrentBuild>
<builders><hudson.tasks.Shell><command>${xml(shell)}</command></hudson.tasks.Shell></builders><publishers/><buildWrappers/></project>`);
