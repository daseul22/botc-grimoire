#!/usr/bin/env bash
# Stop: 이번 턴에 코드 수정이 있었으면(=dirty 플래그 존재) Claude가 멈추는 대신
# docs/wiki 업데이트 지침을 다시 내려보낸다. stop_hook_active 가드로 무한루프 방지.
input=$(cat)
active=$(printf '%s' "$input" | jq -r '.stop_hook_active // false')
sid=$(printf '%s' "$input" | jq -r '.session_id // "nosession"')
flag="${TMPDIR:-/tmp}/claude-wiki-dirty-$sid"
[ "$active" = "true" ] && exit 0          # 이미 hook 때문에 이어진 턴이면 재주입 금지
if [ -f "$flag" ]; then
  rm -f "$flag"
  printf '%s' '{"decision":"block","reason":"이번 작업에서 코드가 수정되었습니다. 작업이 일단락된 시점이라면 변경 내용에 맞춰 deep wiki(docs/wiki)의 관련 문서를 업데이트하세요. 아직 작업이 진행 중이라면 위키 업데이트는 생략하고 계속 진행하세요."}'
fi
exit 0
