#!/usr/bin/env bash
# PostToolUse(Write|Edit): 코드 파일이 수정되면 세션별 dirty 플래그를 남긴다.
# docs/ 와 .claude/ 변경은 무시한다 — 위키/설정 편집이 스스로를 트리거하지 않도록.
input=$(cat)
f=$(printf '%s' "$input" | jq -r '.tool_input.file_path // ""')
sid=$(printf '%s' "$input" | jq -r '.session_id // "nosession"')
case "$f" in
  */docs/*|*/.claude/*|"") ;;                                  # 무시
  *) : >"${TMPDIR:-/tmp}/claude-wiki-dirty-$sid" ;;            # dirty 플래그 생성
esac
exit 0
