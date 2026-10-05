// Canonical job configuration; rendered to stdout and published through SVN + Jenkins APIs.
const ref = process.argv[2] ?? "main";
if (ref !== "main" && !/^[a-f0-9]{40}$/.test(ref)) {
  throw new Error("Script ref must be main or an exact reviewed commit SHA");
}

const shell = `#!/usr/bin/env bash
set -Eeuo pipefail
if [[ "$HEALTH_SCRIPT_REF" != "main" && ! "$HEALTH_SCRIPT_REF" =~ ^[a-f0-9]{40}$ ]]; then
  echo 'MONITORING_GAP: invalid script ref'
  exit 1
fi
timeout --signal=TERM --kill-after=10s 180s \\
  ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=8 \\
  msi "bash -s -- $HEALTH_SCRIPT_REF" <<'CHECKOUT_HEALTH'
set -Eeuo pipefail
export PATH=/home/tobi/.local/share/ai-tutor-toolchain/node_modules/.bin:/usr/local/bin:/usr/bin:/bin
cd /media/tobi/crucial/ssd/skripte/ai-tutor-lab
echo "Checkout host: $(hostname), user: $(id -un)"
npm run worker:doctor
script_sha=$(gh api "repos/dimto13/ai-tutor-lab/commits/$1" --jq .sha)
echo "Evidence script SHA: $script_sha"
gh api --method GET repos/dimto13/ai-tutor-lab/contents/scripts/control-health.mjs \\
  -f "ref=$script_sha" --jq .content | base64 --decode | node --input-type=module
CHECKOUT_HEALTH
`;

function xml(text) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

console.log(`<?xml version="1.0" encoding="UTF-8"?>
<project>
  <actions/>
  <description>Read-only AI Tutor control-plane and real local checkout verification. PLAN remains dispatcher. Source: dimto13/ai-tutor-lab scripts/jenkins-control-health-config.mjs.</description>
  <keepDependencies>false</keepDependencies>
  <properties>
    <jenkins.model.BuildDiscarderProperty>
      <strategy class="hudson.tasks.LogRotator">
        <daysToKeep>14</daysToKeep><numToKeep>100</numToKeep>
        <artifactDaysToKeep>-1</artifactDaysToKeep><artifactNumToKeep>-1</artifactNumToKeep>
      </strategy>
    </jenkins.model.BuildDiscarderProperty>
    <hudson.model.ParametersDefinitionProperty>
      <parameterDefinitions>
        <hudson.model.StringParameterDefinition>
          <name>HEALTH_SCRIPT_REF</name>
          <description>main normally; exact tested feature SHA only during initial scheduler validation.</description>
          <defaultValue>${ref}</defaultValue><trim>true</trim>
        </hudson.model.StringParameterDefinition>
      </parameterDefinitions>
    </hudson.model.ParametersDefinitionProperty>
  </properties>
  <scm class="hudson.scm.NullSCM"/>
  <canRoam>true</canRoam><disabled>false</disabled>
  <blockBuildWhenDownstreamBuilding>false</blockBuildWhenDownstreamBuilding>
  <blockBuildWhenUpstreamBuilding>false</blockBuildWhenUpstreamBuilding>
  <triggers><hudson.triggers.TimerTrigger><spec>H/20 * * * *</spec></hudson.triggers.TimerTrigger></triggers>
  <concurrentBuild>false</concurrentBuild>
  <builders><hudson.tasks.Shell><command>${xml(shell)}</command></hudson.tasks.Shell></builders>
  <publishers/><buildWrappers/>
</project>`);
