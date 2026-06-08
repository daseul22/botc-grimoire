import { getDb } from "./db";
import { getCharacter } from "./data";
import type { Sheet } from "./types";

// 서버 전용 (better-sqlite3 import). 커스텀 시트는 가변 데이터이므로
// seed-db가 건드리지 않는 별도 테이블에 저장한다. 재시드해도 보존됨.
getDb().exec(`
CREATE TABLE IF NOT EXISTS custom_sheets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS custom_sheet_characters (
  sheet_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (sheet_id, character_id)
);
`);

type Row = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
};

function toSheet(r: Row, ids: string[]): Sheet {
  const s: Sheet = {
    id: r.id,
    name: { ko: r.name, en: r.name },
    characterIds: ids,
    custom: true,
  };
  if (r.description) s.description = { ko: r.description, en: r.description };
  return s;
}

export function listCustomSheets(): Sheet[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM custom_sheets ORDER BY created_at DESC")
    .all() as Row[];
  const idsBy: Record<string, string[]> = {};
  for (const r of db
    .prepare(
      "SELECT sheet_id, character_id FROM custom_sheet_characters ORDER BY position",
    )
    .all() as { sheet_id: string; character_id: string }[]) {
    (idsBy[r.sheet_id] ??= []).push(r.character_id);
  }
  return rows.map((r) => toSheet(r, idsBy[r.id] ?? []));
}

export function getCustomSheet(id: string): Sheet | undefined {
  const db = getDb();
  const r = db.prepare("SELECT * FROM custom_sheets WHERE id = ?").get(id) as
    | Row
    | undefined;
  if (!r) return undefined;
  const ids = (
    db
      .prepare(
        "SELECT character_id FROM custom_sheet_characters WHERE sheet_id = ? ORDER BY position",
      )
      .all(id) as { character_id: string }[]
  ).map((x) => x.character_id);
  return toSheet(r, ids);
}

export function createCustomSheet(input: {
  name: string;
  description?: string;
  characterIds: string[];
}): string {
  const db = getDb();
  const id = "c-" + crypto.randomUUID().slice(0, 8);
  const createdAt = new Date().toISOString();
  // 존재하는 공식 직업만, 입력 순서·중복 제거 후 저장
  const seen = new Set<string>();
  const valid = input.characterIds.filter(
    (cid) => getCharacter(cid) && !seen.has(cid) && seen.add(cid),
  );
  const tx = db.transaction(() => {
    db.prepare(
      "INSERT INTO custom_sheets (id,name,description,created_at) VALUES (?,?,?,?)",
    ).run(id, input.name, input.description ?? null, createdAt);
    const ins = db.prepare(
      "INSERT INTO custom_sheet_characters (sheet_id,character_id,position) VALUES (?,?,?)",
    );
    valid.forEach((cid, i) => ins.run(id, cid, i));
  });
  tx();
  return id;
}

export function updateCustomSheet(
  id: string,
  input: { name: string; description?: string; characterIds: string[] },
): void {
  const db = getDb();
  const seen = new Set<string>();
  const valid = input.characterIds.filter(
    (cid) => getCharacter(cid) && !seen.has(cid) && seen.add(cid),
  );
  const tx = db.transaction(() => {
    db.prepare(
      "UPDATE custom_sheets SET name = ?, description = ? WHERE id = ?",
    ).run(input.name, input.description ?? null, id);
    db.prepare("DELETE FROM custom_sheet_characters WHERE sheet_id = ?").run(id);
    const ins = db.prepare(
      "INSERT INTO custom_sheet_characters (sheet_id,character_id,position) VALUES (?,?,?)",
    );
    valid.forEach((cid, i) => ins.run(id, cid, i));
  });
  tx();
}

export function deleteCustomSheet(id: string): void {
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM custom_sheet_characters WHERE sheet_id = ?").run(id);
    db.prepare("DELETE FROM custom_sheets WHERE id = ?").run(id);
  });
  tx();
}
