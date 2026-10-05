#!/usr/bin/env bash
set -Eeuo pipefail
[[ "$(hostname)" == rmi && "$(id -un)" == tobi ]] || { echo RMI_SETUP_CONTEXT_REQUIRED; exit 1; }
source_dir="${1:?Exact source directory required}"
[[ "$source_dir" == /home/tobi/skripte/ai-tutor-lab-jenkins/source/* ]] || { echo INVALID_SOURCE_DIRECTORY; exit 1; }
echo 'Explicit one-time Jenkins setup. No coding/model request, host security or login/config change.'
umask 077
task_root=/home/tobi/skripte/ai-tutor-lab-jenkins
mkdir -p "$task_root/toolchain"
npm install --prefix "$task_root/toolchain" --no-save --package-lock=false node@22.23.2 npm@10.9.8
"$task_root/toolchain/node_modules/.bin/node" --version
"$task_root/toolchain/node_modules/.bin/node" "$task_root/toolchain/node_modules/npm/bin/npm-cli.js" --version
docker build --pull --tag ai-tutor-lab-coding:node22-codex0.160.0 --file "$source_dir/jenkins-rmi-worker.Dockerfile" "$source_dir"
docker image inspect ai-tutor-lab-coding:node22-codex0.160.0 --format 'Worker image ID: {{.Id}}'
docker run --rm --read-only --network none --cap-drop ALL --security-opt no-new-privileges \
  ai-tutor-lab-coding:node22-codex0.160.0 sh -c 'node --version; npm --version; codex --version'
