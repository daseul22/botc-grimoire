import Database from "better-sqlite3";
import path from "node:path";

// 서버 전용. better-sqlite3는 클라이언트로 번들될 수 없으므로
// 실수로 클라이언트 컴포넌트에서 import 하면 빌드가 실패한다(의도된 가드).

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    // 기본은 프로젝트의 실제 DB. BOTC_DB_FILE(테스트/시뮬 하네스용)이 있으면 그 파일을 연다 —
    // 실 DB를 절대 건드리지 않고 사본에 대고 통합 시뮬을 돌리기 위한 격리 훅(운영엔 영향 없음).
    const file = process.env.BOTC_DB_FILE ?? path.join(process.cwd(), "db", "grimoire.db");
    // fileMustExist: 시드 전이면 명확히 실패 → `npm run db:seed`
    _db = new Database(file, { fileMustExist: true });
    _db.pragma("journal_mode = WAL");
    // 다중 디바이스 동시 사용(노트북 ST + 폰 폴링) 시 일시적 락에 대해 즉시 throw 대신
    // 최대 5초까지 자동 재시도. UI가 '잠깐 멈춤'으로만 보이고 실패하지 않는다.
    _db.pragma("busy_timeout = 5000");
    _db.pragma("synchronous = NORMAL");
  }
  return _db;
}
