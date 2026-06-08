// data/*.json → db/grimoire.db (SQLite) 시드.
// JSON을 사람이 편집하는 소스로 유지하고, 런타임/빌드는 SQLite에서 읽는다.
// 실행: npm run db:seed  (predev/prebuild에서 자동 실행)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, "data", f), "utf8"));

const characters = readJson("characters.json");
const sheets = readJson("sheets.json");
const rules = readJson("rules.json");

fs.mkdirSync(path.join(ROOT, "db"), { recursive: true });
const db = new Database(path.join(ROOT, "db", "grimoire.db"));
db.pragma("journal_mode = WAL");

db.exec(`
DROP TABLE IF EXISTS sheet_characters;
DROP TABLE IF EXISTS characters;
DROP TABLE IF EXISTS sheets;
DROP TABLE IF EXISTS rules;

CREATE TABLE characters (
  id TEXT PRIMARY KEY,
  sort INTEGER NOT NULL,
  name_ko TEXT NOT NULL, name_en TEXT NOT NULL,
  edition TEXT NOT NULL, team TEXT NOT NULL,
  ability_ko TEXT NOT NULL DEFAULT '', ability_en TEXT NOT NULL DEFAULT '',
  first_order INTEGER, first_reminder_ko TEXT, first_reminder_en TEXT,
  other_order INTEGER, other_reminder_ko TEXT, other_reminder_en TEXT,
  reminders TEXT NOT NULL DEFAULT '[]',
  setup INTEGER NOT NULL DEFAULT 0,
  setup_note_ko TEXT, setup_note_en TEXT,
  flavor_ko TEXT, flavor_en TEXT,
  detail_ko TEXT, detail_en TEXT,
  howto_ko TEXT NOT NULL DEFAULT '[]', howto_en TEXT NOT NULL DEFAULT '[]',
  jinxes_ko TEXT NOT NULL DEFAULT '[]', jinxes_en TEXT NOT NULL DEFAULT '[]',
  image TEXT
);
CREATE INDEX idx_char_edition ON characters(edition);
CREATE INDEX idx_char_team ON characters(team);

CREATE TABLE sheets (
  id TEXT PRIMARY KEY,
  sort INTEGER NOT NULL,
  name_ko TEXT NOT NULL, name_en TEXT NOT NULL,
  description_ko TEXT, description_en TEXT,
  difficulty TEXT
);

CREATE TABLE sheet_characters (
  sheet_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (sheet_id, character_id)
);

CREATE TABLE rules (
  id TEXT PRIMARY KEY,
  ord INTEGER NOT NULL,
  title_ko TEXT NOT NULL, title_en TEXT NOT NULL DEFAULT '',
  body_ko TEXT NOT NULL DEFAULT '', body_en TEXT NOT NULL DEFAULT ''
);
`);

const insChar = db.prepare(`INSERT INTO characters
 (id,sort,name_ko,name_en,edition,team,ability_ko,ability_en,
  first_order,first_reminder_ko,first_reminder_en,
  other_order,other_reminder_ko,other_reminder_en,
  reminders,setup,setup_note_ko,setup_note_en,
  flavor_ko,flavor_en,detail_ko,detail_en,
  howto_ko,howto_en,jinxes_ko,jinxes_en,image)
 VALUES (@id,@sort,@name_ko,@name_en,@edition,@team,@ability_ko,@ability_en,
  @first_order,@first_reminder_ko,@first_reminder_en,
  @other_order,@other_reminder_ko,@other_reminder_en,
  @reminders,@setup,@setup_note_ko,@setup_note_en,
  @flavor_ko,@flavor_en,@detail_ko,@detail_en,
  @howto_ko,@howto_en,@jinxes_ko,@jinxes_en,@image)`);

const insSheet = db.prepare(`INSERT INTO sheets
 (id,sort,name_ko,name_en,description_ko,description_en,difficulty)
 VALUES (@id,@sort,@name_ko,@name_en,@description_ko,@description_en,@difficulty)`);
const insSheetChar = db.prepare(
  `INSERT INTO sheet_characters (sheet_id,character_id,position) VALUES (?,?,?)`,
);
const insRule = db.prepare(`INSERT INTO rules
 (id,ord,title_ko,title_en,body_ko,body_en)
 VALUES (@id,@ord,@title_ko,@title_en,@body_ko,@body_en)`);

const seed = db.transaction(() => {
  characters.forEach((c, i) => {
    insChar.run({
      id: c.id,
      sort: i,
      name_ko: c.name?.ko ?? "",
      name_en: c.name?.en ?? "",
      edition: c.edition,
      team: c.team,
      ability_ko: c.ability?.ko ?? "",
      ability_en: c.ability?.en ?? "",
      first_order: c.firstNight?.order ?? null,
      first_reminder_ko: c.firstNight?.reminder?.ko ?? null,
      first_reminder_en: c.firstNight?.reminder?.en ?? null,
      other_order: c.otherNight?.order ?? null,
      other_reminder_ko: c.otherNight?.reminder?.ko ?? null,
      other_reminder_en: c.otherNight?.reminder?.en ?? null,
      reminders: JSON.stringify(c.reminders ?? []),
      setup: c.setup ? 1 : 0,
      setup_note_ko: c.setupNote?.ko ?? null,
      setup_note_en: c.setupNote?.en ?? null,
      flavor_ko: c.flavor?.ko ?? null,
      flavor_en: c.flavor?.en ?? null,
      detail_ko: c.detail?.ko ?? null,
      detail_en: c.detail?.en ?? null,
      howto_ko: JSON.stringify(c.howTo?.ko ?? []),
      howto_en: JSON.stringify(c.howTo?.en ?? []),
      jinxes_ko: JSON.stringify(c.jinxes?.ko ?? []),
      jinxes_en: JSON.stringify(c.jinxes?.en ?? []),
      image: c.image ?? null,
    });
  });

  sheets.forEach((s, i) => {
    insSheet.run({
      id: s.id,
      sort: i,
      name_ko: s.name?.ko ?? "",
      name_en: s.name?.en ?? "",
      description_ko: s.description?.ko ?? null,
      description_en: s.description?.en ?? null,
      difficulty: s.difficulty ?? null,
    });
    (s.characterIds ?? []).forEach((cid, pos) => insSheetChar.run(s.id, cid, pos));
  });

  rules.forEach((r) => {
    insRule.run({
      id: r.id,
      ord: r.order,
      title_ko: r.title?.ko ?? "",
      title_en: r.title?.en ?? "",
      body_ko: r.body?.ko ?? "",
      body_en: r.body?.en ?? "",
    });
  });
});
seed();

const n = (t) => db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
console.log(
  `seeded db/grimoire.db → characters ${n("characters")}, sheets ${n("sheets")}, ` +
    `sheet_characters ${n("sheet_characters")}, rules ${n("rules")}`,
);
db.close();
