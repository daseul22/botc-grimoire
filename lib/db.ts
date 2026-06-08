import Database from "better-sqlite3";
import path from "node:path";

// 서버 전용. better-sqlite3는 클라이언트로 번들될 수 없으므로
// 실수로 클라이언트 컴포넌트에서 import 하면 빌드가 실패한다(의도된 가드).

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    const file = path.join(process.cwd(), "db", "grimoire.db");
    // fileMustExist: 시드 전이면 명확히 실패 → `npm run db:seed`
    _db = new Database(file, { fileMustExist: true });
    _db.pragma("journal_mode = WAL");
  }
  return _db;
}
