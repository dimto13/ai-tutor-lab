const ref = process.argv[2] ?? "main";
if (ref !== "main" && !/^[a-f0-9]{40}$/.test(ref))
  throw new Error("Worker source ref must be main or exact validated SHA");
const shell = `#!/usr/bin/env bash
set -Eeuo pipefail
[[ "$WORKER_SCRIPT_REF" == main || "$WORKER_SCRIPT_REF" =~ ^[a-f0-9]{40}$ ]] || { echo INVALID_REF; exit 1; }
[[ "$WORKER_ACTION" == plan || "$WORKER_ACTION" == execute ]] || { echo INVALID_ACTION; exit 1; }
timeout --signal=TERM --kill-after=10s 50m ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=8 msi "bash -s -- $WORKER_SCRIPT_REF $WORKER_ACTION" <<'LOCAL_WORKER'
set -Eeuo pipefail
export PATH=/home/tobi/.local/share/ai-tutor-toolchain/node_modules/.bin:/usr/local/bin:/usr/bin:/bin
export AI_TUTOR_WORKER_HOME=/media/tobi/crucial/ssd/skripte/ai-tutor-lab-workers/runtime
export AI_TUTOR_WORKER_ACTION="$2"
mkdir -p "$AI_TUTOR_WORKER_HOME"
chmod 700 "$AI_TUTOR_WORKER_HOME"
exec 9>"$AI_TUTOR_WORKER_HOME/project.lock"
flock -n 9 || { echo WORKER_ALREADY_RUNNING; exit 0; }
export AI_TUTOR_WORKER_LOCKED=1
script_sha=$(gh api "repos/dimto13/ai-tutor-lab/commits/$1" --jq .sha)
echo "Worker source SHA: $script_sha; action: $AI_TUTOR_WORKER_ACTION"
gh api --method GET repos/dimto13/ai-tutor-lab/contents/scripts/jenkins-local-worker.mjs -f "ref=$script_sha" --jq .content | base64 --decode | timeout --signal=TERM --kill-after=10s 48m node --input-type=module
LOCAL_WORKER
`;
const xml = (value) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
console.log(`<?xml version="1.0" encoding="UTF-8"?>
<project><actions/><description>Explicit CONTROL dispatch to isolated local Codex coding worker. PREPARE ONLY: no automatic merge/deploy. Source dimto13/ai-tutor-lab scripts/jenkins-local-worker-config.mjs.</description>
<keepDependencies>false</keepDependencies><properties>
<jenkins.model.BuildDiscarderProperty><strategy class="hudson.tasks.LogRotator"><daysToKeep>14</daysToKeep><numToKeep>100</numToKeep><artifactDaysToKeep>-1</artifactDaysToKeep><artifactNumToKeep>-1</artifactNumToKeep></strategy></jenkins.model.BuildDiscarderProperty>
<hudson.model.ParametersDefinitionProperty><parameterDefinitions>
<hudson.model.StringParameterDefinition><name>WORKER_SCRIPT_REF</name><description>main normally; validated exact feature SHA only during initial executor acceptance.</description><defaultValue>${ref}</defaultValue><trim>true</trim></hudson.model.StringParameterDefinition>
<hudson.model.StringParameterDefinition><name>WORKER_ACTION</name><description>plan performs read-only dispatch inspection; execute invokes scoped coding.</description><defaultValue>execute</defaultValue><trim>true</trim></hudson.model.StringParameterDefinition>
</parameterDefinitions></hudson.model.ParametersDefinitionProperty></properties>
<scm class="hudson.scm.NullSCM"/><canRoam>true</canRoam><disabled>false</disabled><blockBuildWhenDownstreamBuilding>false</blockBuildWhenDownstreamBuilding><blockBuildWhenUpstreamBuilding>false</blockBuildWhenUpstreamBuilding>
<triggers><hudson.triggers.TimerTrigger><spec>H/20 * * * *</spec></hudson.triggers.TimerTrigger></triggers><concurrentBuild>false</concurrentBuild>
<builders><hudson.tasks.Shell><command>${xml(shell)}</command></hudson.tasks.Shell></builders><publishers/><buildWrappers/></project>`);
