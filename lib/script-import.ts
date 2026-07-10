// 공식 Script Tool JSON(script.bloodontheclocktower.com) 파서 — 순수(서버/클라 공용, db 의존 없음).
//
// 형식: 문자열(직업 id) 또는 {id: "..."} 객체의 배열. 특수 항목 {id:"_meta", name, author}는 메타.
//   ["_meta는 객체", "washerwoman", {"id":"investigator"}, ...]
// 이 앱의 시트는 '알려진 공식 직업 id의 모음'이라(홈브루 직업 정의는 미지원), 스크립트의 id를
// 앱이 아는 id로 정규화 매칭한다. 매칭 실패한 id는 unknown으로 모아 사용자에게 알린다.
import type { Character } from "./types";

export type ScriptImportResult = {
  /** _meta.name (없으면 null). */
  name: string | null;
  /** 매칭된 앱 직업 id — 스크립트 순서·중복 제거. */
  matched: string[];
  /** 앱에 없는(홈브루·오탈자) 원본 id — 경고 표시용. */
  unknown: string[];
  /** 파싱 자체 실패 사유(형식 오류). 있으면 matched는 빈 배열. */
  error?: string;
};

/** 매칭용 정규화 — 대소문자·언더스코어·공백·기호 차이를 흡수(snake_charmer ↔ snakecharmer). */
const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function idOf(entry: unknown): string | null {
  if (typeof entry === "string") return entry;
  if (entry && typeof entry === "object" && "id" in entry) {
    const id = (entry as { id: unknown }).id;
    if (typeof id === "string") return id;
  }
  return null;
}

export function parseScriptJson(text: string, characters: Character[]): ScriptImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { name: null, matched: [], unknown: [], error: "JSON 형식이 아닙니다." };
  }
  if (!Array.isArray(data)) {
    return { name: null, matched: [], unknown: [], error: "공식 스크립트 형식(직업 배열)이 아닙니다." };
  }
  const byId = new Map(characters.map((c) => [c.id, c.id]));
  const byNorm = new Map(characters.map((c) => [norm(c.id), c.id]));
  let name: string | null = null;
  const matched: string[] = [];
  const unknown: string[] = [];
  const seen = new Set<string>();
  for (const entry of data) {
    const id = idOf(entry);
    if (!id) continue;
    if (id === "_meta") {
      const meta = entry as { name?: unknown };
      if (typeof meta.name === "string" && meta.name.trim()) name = meta.name.trim();
      continue;
    }
    const appId = byId.get(id) ?? byNorm.get(norm(id));
    if (appId) {
      if (!seen.has(appId)) {
        seen.add(appId);
        matched.push(appId);
      }
    } else {
      unknown.push(id);
    }
  }
  return { name, matched, unknown };
}
