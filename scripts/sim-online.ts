// 온라인 시계피 통합 시뮬레이션 하네스 (회귀 테스트)
//
// 목적: test 계정으로 3개 공식 스크립트의 온라인 게임을 "풀 루프"로 자동 플레이하며
//   서버 로직(상태머신·redaction·지목/순차투표·마커 duration·능력 상호작용)을 단언 검증한다.
// 안전: 실 DB(db/grimoire.db)는 절대 건드리지 않는다. 시작 시 백업 사본을 만들어 BOTC_DB_FILE로
//   그 사본에만 대고 돌린다. 실 유저 방/전적은 무영향(사본은 종료 시 삭제).
//
// 경계(미커버): 액션 레이어 가드(requireUser·phase게이팅·푸주한 nominatorLimit 하루한도),
//   SSE 전달, UI 렌더는 lib 직접호출이라 닿지 않는다 → 브라우저 e2e/사람 베타가 필요한 영역.
//
// 실행: npm run sim   (내부적으로 npx tsx scripts/sim-online.ts)

import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import Database from "better-sqlite3";
// 타입 전용 import — 컴파일 시 지워지므로 BOTC_DB_FILE 설정 전 동적 import 순서에 영향이 없다.
import type { Alignment, GamePlayer } from "@/lib/types";

// ── 임시 DB 사본 준비(실 DB → 일관 백업) ──
const REAL_DB = path.join(process.cwd(), "db", "grimoire.db");
const TMP_DB = path.join(os.tmpdir(), `botc-sim-${process.pid}.db`);

async function makeBackup() {
  const src = new Database(REAL_DB, { readonly: true });
  await src.backup(TMP_DB); // WAL 포함 일관 스냅샷
  src.close();
}

// ── 미니 단언 프레임워크 ──
let PASS = 0;
const FAILS: string[] = [];
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    PASS++;
  } else {
    FAILS.push(`✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
function section(title: string) {
  console.log(`\n\x1b[1m── ${title} ──\x1b[0m`);
}

async function main() {
  await makeBackup();
  process.env.BOTC_DB_FILE = TMP_DB; // lib/db.ts가 이 사본을 열도록(동적 import 전에 설정)

  // 동적 import — env 설정 이후에 lib가 DB를 열어야 하므로.
  const auth = await import("@/lib/auth");
  const data = await import("@/lib/data");
  const ratio = await import("@/lib/ratio");
  const roleAssign = await import("@/lib/role-assign");
  const games = await import("@/lib/games");
  const noms = await import("@/lib/nominations");
  const nreq = await import("@/lib/night-requests");
  const voting = await import("@/lib/voting");
  const redact = await import("@/lib/redact");
  const markers = await import("@/lib/markers");
  const na = await import("@/lib/night-actions");
  const showcase = await import("@/lib/showcase");
  const schema = await import("@/lib/games/schema");
  type Character = import("@/lib/types").Character;
  type Game = import("@/lib/types").Game;

  const charMap: Record<string, Character> = Object.fromEntries(
    data.characters.map((c) => [c.id, c]),
  );
  const teamOf = (id: string) => charMap[id]?.team;

  // ════════════════════════════════════════════════════════════════════
  // Phase A — 순수 불변식 배터리 (스크립트 무관 + 공식 87직업 스펙 커버리지)
  // ════════════════════════════════════════════════════════════════════

  // A1. computeOrder — 시계바늘 순서(지명자 다음부터, 지명자 마지막), 자격 스킵
  section("A1. computeOrder (순차 투표 순서)");
  {
    const seats8 = Array.from({ length: 8 }, (_, s) => ({
      seat: s,
      status: "alive" as const,
      ghostVoteUsed: false,
    }));
    const o3 = noms.computeOrder(seats8, 3);
    check("nominee=3 순서", JSON.stringify(o3) === JSON.stringify([4, 5, 6, 7, 0, 1, 2, 3]), JSON.stringify(o3));
    const o0 = noms.computeOrder(seats8, 0);
    check("nominee=0 순서", JSON.stringify(o0) === JSON.stringify([1, 2, 3, 4, 5, 6, 7, 0]), JSON.stringify(o0));
    check("지명자가 항상 마지막", o3[o3.length - 1] === 3 && o0[o0.length - 1] === 0);

    // 죽은 좌석(유령표 소진)은 스킵, 유령표 남으면 포함
    const withDead = seats8.map((s) =>
      s.seat === 5 ? { ...s, status: "dead" as const, ghostVoteUsed: true } : s,
    );
    const od = noms.computeOrder(withDead, 3);
    check("유령표 소진 죽은 좌석 스킵", !od.includes(5), JSON.stringify(od));
    const withGhost = seats8.map((s) =>
      s.seat === 5 ? { ...s, status: "dead" as const, ghostVoteUsed: false } : s,
    );
    check("유령표 남은 죽은 좌석 포함", noms.computeOrder(withGhost, 3).includes(5));
    // 추방(exile): 죽은 자도 전원 포함
    check("exile는 전원 포함", noms.computeOrder(withDead, 3, true).includes(5));
  }

  // A2. computeTally — 커트라인 수학 + 동률 차단
  section("A2. computeTally (처형 커트라인·동률)");
  {
    const mk = (
      seat: number,
      characterId: string,
      status: "alive" | "dead" = "alive",
    ): GamePlayer => ({
      seat,
      nickname: `${seat}`,
      characterId,
      alignment: "good" as const,
      x: 0,
      y: 0,
      locked: false,
      status,
      markers: [] as string[],
      memo: "",
      deathCause: "" as const,
      ghostVoteUsed: false,
    });
    // 7 생존(주민들)
    const players = Array.from({ length: 7 }, (_, s) => mk(s, "chef"));
    const t0 = voting.computeTally(players, [], charMap);
    check("생존7 처형선 ceil(7/2)=4", t0.executionCutoff === 4, `${t0.executionCutoff}`);
    check("생존7 추방선 floor(7/2)+1=4", t0.exileCutoff === 4, `${t0.exileCutoff}`);
    // 동률: 두 지목 모두 4표 → 차단
    const tieVotes = [
      { nominator: 0, nominee: 1, votes: 4, executed: false },
      { nominator: 2, nominee: 3, votes: 4, executed: false },
    ];
    const tt = voting.computeTally(players, tieVotes, charMap);
    check("동률(2명 최다)이면 isTie", tt.isTie);
    check("동률+커트라인충족이면 tieBlocks", tt.tieBlocks);
    // 처형된 좌석은 당일 생존수에 도로 포함
    const execVotes = [{ nominator: 0, nominee: 1, votes: 5, executed: true }];
    const te = voting.computeTally(
      players.map((p) => (p.seat === 1 ? { ...p, status: "dead" as const } : p)),
      execVotes,
      charMap,
    );
    check("처형 좌석 생존수 보존", te.aliveCount === 7, `${te.aliveCount}`);
  }

  // A3. 마커 duration — phase 제거 / dusk 밤→낮 생존·낮→밤 소멸 / permanent 유지
  section("A3. 마커 duration (keepMarkerOnAdvance)");
  {
    const dur = (id: string) => markers.MARKER_MAP[markers.parseMarker(id).base]?.duration;
    // keepMarkerOnAdvance(marker, leavingDay)
    const keep = markers.keepMarkerOnAdvance;
    check("protected=phase", dur("protected") === "phase");
    check("phase 마커 밤→낮 제거", !keep("protected", false));
    check("phase 마커 낮→밤 제거", !keep("protected", true));
    // dusk: 밤→낮(leavingDay=false) 유지, 낮→밤(leavingDay=true) 소멸
    check("execsafe=dusk (지난 세션 수정)", dur("execsafe") === "dusk", String(dur("execsafe")));
    check("dusk 마커 밤→낮 생존", keep("execsafe", false));
    check("dusk 마커 낮→밤 소멸", !keep("drunk-dusk", true));
    check("drunk-dusk=dusk", dur("drunk-dusk") === "dusk");
    // permanent
    check("drunk=permanent 유지", keep("drunk", false) && keep("drunk", true));
  }

  // A4. redaction — 뷰어 외 좌석 비밀 제거
  section("A4. redactGameForSeat (좌석 비밀 누수)");
  {
    const g: Game = {
      id: "gx",
      sheetId: "trouble-brewing",
      sheetName: "TB",
      label: "",
      status: "playing",
      phase: "night",
      day: 1,
      result: null,
      phaseIndex: 0,
      phaseCount: 1,
      players: Array.from({ length: 6 }, (_, s) => ({
        seat: s,
        nickname: `p${s}`,
        characterId: ["imp", "poisoner", "chef", "empath", "monk", "washerwoman"][s],
        alignment: s < 2 ? "evil" : "good",
        x: 0,
        y: 0,
        locked: false,
        status: "alive",
        markers: s === 2 ? ["poisoned"] : [],
        memo: `secret-memo-${s}`,
        deathCause: "",
        ghostVoteUsed: false,
      })),
      actions: [{ actorSeat: 0, characterId: "imp", targets: [3], result: "", bluff: false }],
      votes: [{ nominator: 0, nominee: 1, votes: 3, executed: false }],
      bluffs: ["baron", "saint", "recluse"],
      doneSeats: [0],
      note: "st-note",
      globalMarkers: [],
      lunaticBluffs: [],
      lunaticMinions: [],
      disguises: {},
      phaseTimers: {},
      nominationsOpen: false,
      undo: null,
      claimedSeats: [],
      lastExecution: null,
    } as unknown as Game;

    for (let v = 0; v < 6; v++) {
      const r = redact.redactGameForSeat(g, v);
      let leak = false;
      for (const p of r.players) {
        if (p.seat === v) continue;
        if (p.characterId !== "" || p.markers.length > 0 || p.memo !== "") leak = true;
      }
      check(`seat ${v} 뷰: 타 좌석 직업/마커/메모 누수 없음`, !leak);
      check(`seat ${v} 뷰: 본인 직업 유지`, r.players[v].characterId === g.players[v].characterId);
    }
    const r0 = redact.redactGameForSeat(g, 3);
    check("전역 비밀(actions/votes/bluffs/note) 제거", r0.actions.length === 0 && r0.votes.length === 0 && r0.bluffs.length === 0 && r0.note === "");
  }

  // A5. 공식 87직업 스펙/능력 상호작용 커버리지
  section("A5. 공식 3스크립트 전 직업 스펙·showcase 커버리지");
  {
    const VALID_KINDS = new Set(["none", "number", "yesno", "role", "team", "text"]);
    const sheetIds = ["trouble-brewing", "bad-moon-rising", "sects-and-violets"];
    let charCount = 0;
    let markerMissing = 0;
    let onceMismatch = 0;
    let specThrow = 0;
    let showcaseThrow = 0;
    for (const sid of sheetIds) {
      const sheet = data.getSheet(sid)!;
      for (const c of data.charactersForSheet(sheet)) {
        charCount++;
        // 스펙이 세 페이즈 모두 유효 kind
        try {
          for (const [ph, day] of [["night", 1], ["night", 2], ["day", 1]] as const) {
            const spec = na.specForPhase(c.id, ph, day);
            if (!VALID_KINDS.has(spec.result)) specThrow++;
            // 마커가 있으면 MARKER_MAP에 실존해야(=오프라인 그리모어에 그릴 수 있음 → 지난 세션 execsafe 갭 유형)
            if (spec.marker && !markers.MARKER_MAP[markers.parseMarker(spec.marker).base]) {
              markerMissing++;
              FAILS.push(`✗ ${c.id}: 스펙 마커 '${spec.marker}'가 MARKER_MAP에 없음`);
            }
            // oncePerGame 스펙이면 isOncePerGame 일치
            if (spec.oncePerGame && !na.isOncePerGame(c.id)) {
              onceMismatch++;
              FAILS.push(`✗ ${c.id}: oncePerGame 스펙인데 isOncePerGame=false`);
            }
          }
        } catch (e) {
          specThrow++;
          FAILS.push(`✗ ${c.id}: specForPhase throw — ${(e as Error).message}`);
        }
        // resolveShowcase가 이 직업을 담은 합성 게임에서 throw 없이 동작
        try {
          const synthetic = makeSyntheticGame(c.id);
          na.showcaseVariants(na.specForPhase(c.id, "night", 1)).forEach((_, vi) => {
            showcase.resolveShowcase(synthetic, 0, { variant: vi }, teamOf);
          });
          // 특수 모드도 확인(악마·하수인·첩자 등)
          for (const mode of ["grimoire", "demon-info", "minion-info", "bluffs", "minions"]) {
            showcase.resolveShowcase(synthetic, 0, { mode }, teamOf);
          }
        } catch (e) {
          showcaseThrow++;
          FAILS.push(`✗ ${c.id}: resolveShowcase throw — ${(e as Error).message}`);
        }
      }
    }
    check(`공식 직업 수 == 87`, charCount === 87, `${charCount}`);
    check("스펙 마커 전부 MARKER_MAP 실존", markerMissing === 0, `${markerMissing} 누락`);
    check("oncePerGame 스펙 일치", onceMismatch === 0, `${onceMismatch} 불일치`);
    check("specForPhase throw 없음", specThrow === 0, `${specThrow}`);
    check("resolveShowcase throw 없음", showcaseThrow === 0, `${showcaseThrow}`);
  }

  // A6. 커스텀 직업 라운드트립 — 저장 → 조회 → 스펙 반영 → 시트/게임 편입 → showcase → 삭제.
  // 직업 동작이 코드가 아니라 데이터가 됐으므로, "만든 직업이 실제 진행 경로를 그대로 탄다"를
  // 사람 눈이 아니라 하네스가 확인한다.
  section("A6. 커스텀 직업 라운드트립");
  {
    const cc = await import("@/lib/custom-characters");
    const cs = await import("@/lib/custom-sheets");
    const gc = await import("@/lib/game-characters");

    // 1) 생성 — 공식에 없는 조합(지목 2 + 예/아니오 + 보호 마커 + 대상에게 보여주기)
    const cid = cc.createCustomCharacter({
      nameKo: "검증용 직업",
      team: "townsfolk",
      abilityKo: "매일 밤 두 명을 고른다. 둘이 같은 진영인지 알게 된다.",
      firstOrder: 41,
      otherOrder: 41,
      firstReminderKo: "두 명을 가리키게 한 뒤 같은 진영이면 끄덕인다.",
      behavior: {
        night: {
          targets: 2,
          result: "yesno",
          marker: "protected",
          hint: "둘이 같은 진영인가",
          oncePerGame: true,
          showcase: {
            heading: "두 사람이 같은 진영인가: {yn}",
            tokens: ["name", "name2"],
            recipient: "actor",
          },
        },
        criteria: "고른 2명의 진영이 같으면 예.",
        stChoosesTargets: true,
      },
    });
    check("커스텀 직업 id는 x- 접두", cid.startsWith("x-"), cid);

    // 2) 조회 — getCharacter가 공식 miss 시 커스텀을 찾아야 기존 소비자가 전부 따라온다
    const got = data.getCharacter(cid);
    check("getCharacter로 커스텀 직업 조회", !!got && got.name.ko === "검증용 직업");
    check("커스텀 플래그·밤순서 보존", !!got?.custom && got?.firstNight?.order === 41);

    // 3) 스펙 반영 — 레지스트리에 install돼 조회 함수가 커스텀 값을 돌려주는가
    const spec = na.specForPhase(cid, "night", 1);
    check("커스텀 스펙 targets=2", spec.targets === 2, `${spec.targets}`);
    check("커스텀 스펙 result=yesno", spec.result === "yesno", spec.result);
    check("커스텀 스펙 marker=protected", spec.marker === "protected", `${spec.marker}`);
    check("커스텀 oncePerGame 인식", na.isOncePerGame(cid));
    check("커스텀 criteria 노출", na.actionCriteria(cid) === "고른 2명의 진영이 같으면 예.");
    check("stChoosesTargets → 플레이어 지목 아님", !na.playerChoosesTargets(cid, spec));
    // otherNight 미정의 → 첫밤 스펙으로 폴백해야 한다(밤마다 스펙이 사라지면 순서표가 깨진다)
    check("otherNight 미정의 시 첫밤 폴백", na.specForPhase(cid, "night", 3).targets === 2);

    // 4) 시트 편입 — 커스텀 직업이 든 시트가 정상 조립되는가
    const sheetId = cs.createCustomSheet({
      name: "검증용 시트",
      characterIds: ["washerwoman", "imp", "poisoner", cid],
    });
    const built = data.charactersForSheet(cs.getCustomSheet(sheetId)!);
    check("커스텀 직업이 시트에 포함", built.some((c) => c.id === cid), `${built.length}개`);

    // 5) 게임 직업맵 — 진행 화면이 클라이언트로 나르는 payload에 behavior가 실리는가
    const map = gc.characterMapForGame({
      sheetId,
      players: [{ characterId: cid }, { characterId: "imp" }],
    });
    const carried = map.get(cid);
    check("characterMapForGame이 커스텀 직업 포함", !!carried);
    check("payload에 behavior 동봉(클라 주입용)", carried?.behavior?.night?.targets === 2);
    check("공식 직업엔 behavior 미동봉", map.get("imp")?.behavior === undefined);

    // 6) 보여주기 — 커스텀 showcase 문구/슬롯이 실제 payload로 풀리는가
    {
      const syn = makeSyntheticGame(cid);
      syn.actions = [{ actorSeat: 0, characterId: cid, targets: [1, 2], result: "yes" }];
      const p = showcase.resolveShowcase(syn, 0, {}, teamOf);
      check("커스텀 showcase kind=standard", p?.kind === "standard");
      if (p?.kind === "standard") {
        check("heading 커스텀 문구 사용", p.showcase?.heading === "두 사람이 같은 진영인가: {yn}");
        check("결과 전달", p.resultStr === "yes");
        // name/name2는 정체 비노출 슬롯 → characterId가 새면 안 된다
        check("닉네임 슬롯에서 정체 비노출", p.targets.every((t) => t.characterId === null));
      }
    }

    // 7) 공식 직업 override — 덮어쓰기 후 조회 반영, 되돌리면 기본값 복귀
    {
      const before = na.actionSpec("chef");
      cc.setBehaviorOverride("chef", { night: { targets: 3, result: "text" } });
      check("override 적용", na.actionSpec("chef").targets === 3, `${na.actionSpec("chef").targets}`);
      check("override가 payload에 실림", data.getCharacter("chef")?.behavior?.night?.targets === 3);
      cc.clearBehaviorOverride("chef");
      const after = na.actionSpec("chef");
      check("override 해제 시 기본값 복귀", after.targets === before.targets && after.result === before.result,
        `${after.targets}/${after.result}`);
      check("해제 후 payload에서 behavior 제거", data.getCharacter("chef")?.behavior === undefined);
    }

    // 7-b) 커스텀 직업의 '동작만' 갱신 — 직업 상세의 동작 설정 패널이 쓰는 좁은 쓰기 경로.
    //      이름·아이콘은 그대로 두고 스펙만 바뀌어야 한다.
    {
      cc.updateCustomCharacterBehavior(cid, { night: { targets: 3, result: "number" } });
      check("동작만 갱신 — 스펙 반영", na.specForPhase(cid, "night", 1).targets === 3);
      check("동작만 갱신 — 이름 보존", data.getCharacter(cid)?.name.ko === "검증용 직업");
      check("동작만 갱신 — 밤 순서 보존", data.getCharacter(cid)?.firstNight?.order === 41);
      // 원상 복구(뒤 단계가 원래 스펙을 전제로 한다)
      cc.updateCustomCharacterBehavior(cid, {
        night: { targets: 2, result: "yesno", marker: "protected", oncePerGame: true },
        criteria: "고른 2명의 진영이 같으면 예.",
        stChoosesTargets: true,
      });
      check("복구 확인", na.specForPhase(cid, "night", 1).targets === 2);
    }

    // 8) 삭제 가드 — 게임에 쓰인 직업은 지우면 그 게임·복기가 깨진다(좌석 character_id는 남는데
    //    정의가 사라져 직업맵에서 빠진다). 액션이 countGamesUsing으로 막는지 값으로 확인한다.
    {
      const usedBefore = cc.countGamesUsing(cid);
      check("미사용 직업은 사용 게임 0", usedBefore === 0, `${usedBefore}`);
      const gid = games.createGame({
        sheetId,
        sheetName: "검증용 시트",
        config: { excludedIds: [], counts: { townsfolk: 1, outsider: 0, minion: 1, demon: 1 } },
        players: [
          { seat: 0, nickname: "A", characterId: cid, alignment: "good", x: 0, y: 0 },
          { seat: 1, nickname: "B", characterId: "imp", alignment: "evil", x: 0, y: 0 },
        ],
      });
      check("게임에 쓰이면 사용 게임 1", cc.countGamesUsing(cid) === 1, `${cc.countGamesUsing(cid)}`);
      games.deleteGame(gid);
      check("게임 삭제 후 다시 0", cc.countGamesUsing(cid) === 0, `${cc.countGamesUsing(cid)}`);
    }

    // 8-b) behaviorKey — 편집 UI의 '변경 사항 있음' 판정 근거.
    //      예전엔 JSON.stringify(b, Object.keys(b).sort())를 썼는데 배열 2번째 인자는 정렬이 아니라
    //      replacer(허용 키 목록)라, 중첩된 targets/result가 통째로 잘려 `{"night":{}}`로 뭉개졌다
    //      → 스펙을 어떻게 바꿔도 '변경 없음'이 되어 저장 버튼이 죽어 있던 버그. 값으로 고정한다.
    {
      const bh = await import("@/lib/behaviors");
      const k = bh.behaviorKey;
      check(
        "중첩 스펙 변경을 감지",
        k({ night: { targets: 2, result: "yesno" } }) !== k({ night: { targets: 3, result: "yesno" } }),
      );
      check(
        "중첩 필드 추가를 감지",
        k({ night: { targets: 2, result: "yesno" } }) !==
          k({ night: { targets: 2, result: "yesno", marker: "poisoned" } }),
      );
      check(
        "키 순서가 달라도 같은 값은 같다",
        k({ night: { targets: 2, result: "yesno" }, criteria: "x" }) ===
          k({ criteria: "x", night: { result: "yesno", targets: 2 } }),
      );
      check(
        "undefined 필드는 없는 것과 같다",
        k({ night: { targets: 2, result: "none", marker: undefined } }) ===
          k({ night: { targets: 2, result: "none" } }),
      );
      check(
        "배열(showcase 변형) 차이를 감지",
        k({ night: { targets: 0, result: "none", showcase: [{ heading: "a" }] } }) !==
          k({ night: { targets: 0, result: "none", showcase: [{ heading: "b" }] } }),
      );
    }

    // 9) 동작 값 검증 — 손상된 스펙은 저장 전에 걸러야 한다(throw가 아니라 조용히 오작동하는 종류).
    {
      const cat = await import("@/lib/ability-catalog");
      check("정상 동작은 통과", cat.validateBehavior({ night: { targets: 2, result: "yesno" } }) === undefined);
      check("지목 범위 밖 거부", !!cat.validateBehavior({ night: { targets: -5, result: "yesno" } }));
      check("없는 결과 종류 거부", !!cat.validateBehavior({ night: { targets: 1, result: "bogus" as never } }));
      check("없는 마커 거부", !!cat.validateBehavior({ night: { targets: 1, result: "none", marker: "nope" } }));
      check(
        "지목 0인데 대상 슬롯 거부",
        !!cat.validateBehavior({ night: { targets: 0, result: "none", showcase: { tokens: ["name"] } } }),
      );
      check(
        "지목 0인데 대상 수신자 거부",
        !!cat.validateBehavior({ night: { targets: 0, result: "none", showcase: { recipient: "target" } } }),
      );
    }

    // 10) 삭제 — 직업이 사라지고, 그 직업이 든 시트에서도 함께 빠진다
    cc.deleteCustomCharacter(cid);
    check("삭제 후 조회 불가", !data.getCharacter(cid));
    check(
      "삭제 시 시트에서도 제거",
      !cs.getCustomSheet(sheetId)!.characterIds.includes(cid),
      cs.getCustomSheet(sheetId)!.characterIds.join(","),
    );
    cs.deleteCustomSheet(sheetId);
  }

  // 합성 게임 — resolveShowcase 커버리지용(대상 직업이 seat 0)
  function makeSyntheticGame(charId: string): Game {
    return {
      id: "syn",
      sheetId: "trouble-brewing",
      sheetName: "TB",
      label: "",
      status: "playing",
      phase: "night",
      day: 1,
      result: null,
      phaseIndex: 0,
      phaseCount: 1,
      players: Array.from({ length: 6 }, (_, s) => ({
        seat: s,
        nickname: `p${s}`,
        characterId: s === 0 ? charId : ["poisoner", "imp", "chef", "empath", "monk"][s - 1] ?? "chef",
        alignment: s === 0 ? (charMap[charId]?.team === "minion" || charMap[charId]?.team === "demon" ? "evil" : "good") : s <= 2 ? "evil" : "good",
        x: 0,
        y: 0,
        locked: false,
        status: "alive",
        markers: [],
        memo: "",
        deathCause: "",
        ghostVoteUsed: false,
      })),
      actions: [{ actorSeat: 0, characterId: charId, targets: [1, 2], result: charMap["empath"] ? "empath" : "1", bluff: false }],
      votes: [],
      bluffs: ["baron", "saint", "recluse"],
      doneSeats: [],
      note: "",
      globalMarkers: [],
      lunaticBluffs: ["chef", "monk", "empath"],
      lunaticMinions: [1],
      disguises: {},
      phaseTimers: {},
      nominationsOpen: false,
      undo: null,
      claimedSeats: [],
      lastExecution: null,
    } as unknown as Game;
  }

  // ════════════════════════════════════════════════════════════════════
  // 계정 준비 — test000(ST) + test001..015(플레이어). 사본 DB에 멱등 생성.
  // ════════════════════════════════════════════════════════════════════
  section("계정 생성 (test000 ST + test001..015)");
  // 결정성: 사본 DB에 남아있을 수 있는 기존 test 계정을 제거하고 새로 만든다(사본이라 안전 — 실 DB 무관).
  schema.db.prepare("DELETE FROM users WHERE login_id LIKE 'test%'").run();
  function ensureUser(loginId: string, nickname: string, roles: import("@/lib/auth").Role[]) {
    const u = auth.createUser({ loginId, nickname, password: "asdf", roles });
    return u.id;
  }
  const stId = ensureUser("test000", "테스트ST", ["storyteller", "player"]);
  const playerIds: number[] = [];
  for (let i = 1; i <= 15; i++) {
    const n = String(i).padStart(3, "0");
    playerIds.push(ensureUser(`test${n}`, `테스트${i}`, ["player"]));
  }
  check("ST 계정 생성", stId > 0);
  check("플레이어 15명 생성", playerIds.every((id) => id > 0) && playerIds.length === 15);
  check("비밀번호 asdf 검증", !!auth.verifyCredentials("test001", "asdf"));

  // ════════════════════════════════════════════════════════════════════
  // Phase B — 공식 3스크립트 풀게임 통합 (사본 DB)
  // ════════════════════════════════════════════════════════════════════
  const SHEETS = ["trouble-brewing", "bad-moon-rising", "sects-and-violets"];
  for (const sid of SHEETS) {
    section(`B. 풀게임 통합 — ${data.getSheet(sid)!.name.ko ?? sid}`);
    try {
      await playFullGame(sid);
    } catch (e) {
      FAILS.push(`✗ [${sid}] 풀게임 중 예외 — ${(e as Error).stack ?? (e as Error).message}`);
    }
  }

  async function playFullGame(sid: string) {
    const N = 8;
    const sheet = roleAssign.resolveSheet(sid)!;
    const counts = ratio.defaultRatio(N);
    const assigned = roleAssign.assignRoles(sheet, [], counts);
    if ("error" in assigned) {
      FAILS.push(`✗ [${sid}] 역할배정 실패 — ${assigned.error}`);
      return;
    }
    const roles = assigned.roles;
    const gid = games.createGame({
      sheetId: sid,
      sheetName: sheet.name.ko ?? sid,
      config: { excludedIds: [], counts },
      ownerId: stId,
      players: roles.map((r, i) => ({
        seat: r.seat,
        nickname: `테스트${i + 1}`,
        characterId: r.characterId,
        alignment: r.alignment as Alignment,
        x: Math.cos((i / N) * 2 * Math.PI),
        y: Math.sin((i / N) * 2 * Math.PI),
        userId: playerIds[i],
      })),
    });
    check(`[${sid}] createGame`, !!games.getGame(gid));

    let g = games.getGame(gid)!;
    // 좌석↔계정 바인딩 확인
    check(`[${sid}] seatForUser 바인딩`, games.seatForUser(gid, playerIds[0]) === 0);

    const demonSeat = g.players.find((p) => charMap[p.characterId]?.team === "demon")!.seat;

    // ── 밤 1: 각 좌석 밤 행동 핸드셰이크(있으면) + 능력 부수효과 ──
    let nightRequests = 0;
    for (const p of g.players) {
      const spec = na.specForPhase(p.characterId, "night", 1);
      const acts = spec.targets > 0 || spec.result !== "none" || spec.marker || na.showcaseVariants(spec).length > 0;
      if (!acts) continue;
      nightRequests++;
      // 대상 후보(자기 외 생존)
      const others = g.players.filter((q) => q.seat !== p.seat).map((q) => q.seat);
      const pick = others.slice(0, Math.max(1, spec.targets));
      if (na.playerChoosesTargets(p.characterId, spec)) {
        const rid = nreq.createRequest({ gameId: gid, seat: p.seat, kind: "pick-players", maxTargets: spec.targets, prompt: "대상 선택" });
        nreq.respond(rid, pick, "");
        nreq.complete(rid);
      } else if (spec.playerPicks) {
        const rid = nreq.createRequest({ gameId: gid, seat: p.seat, kind: "pick-character", prompt: "직업 추측" });
        nreq.respond(rid, [], "chef");
        nreq.complete(rid);
      } else {
        // info 류 — ST가 곧장 전달
        nreq.createRequest({ gameId: gid, seat: p.seat, kind: "info", info: { kind: "text", forNickname: p.nickname, recipientSeat: p.seat, heading: "정보", body: "테스트" } });
      }
      // 룰상 즉시 결정되는 마커/효과는 commitActionRecord로
      if (spec.marker || spec.result !== "none") {
        games.commitActionRecord(gid, {
          actorSeat: p.seat,
          characterId: p.characterId,
          targets: spec.targets > 0 ? pick : [],
          result: spec.result === "role" ? "chef" : spec.result === "number" ? "1" : spec.result === "yesno" ? "예" : "",
          bluff: false,
        });
      }
    }
    check(`[${sid}] 밤1 요청 다수 생성`, nightRequests >= 1, `${nightRequests}건`);

    // 데몬 킬: 마을주민 1명에게 dying → advance 때 자동 사망
    const victim = g.players.find(
      (p) => p.seat !== demonSeat && charMap[p.characterId]?.team === "townsfolk" && p.status !== "dead",
    );
    if (victim) games.toggleMarker(gid, victim.seat, "dying");

    // redaction 표본 검증(밤1 상태에서)
    g = games.getGame(gid)!;
    for (const v of [0, demonSeat, N - 1]) {
      const r = redact.redactGameForSeat(g, v);
      const leak = r.players.some((p) => p.seat !== v && (p.characterId !== "" || p.markers.length > 0));
      check(`[${sid}] seat ${v} redaction 무누수`, !leak);
    }

    // ── 밤 → 낮 1 전환: dying 자동 사망 + 마커 duration ──
    games.advancePhase(gid);
    g = games.getGame(gid)!;
    check(`[${sid}] 낮1 전환(phase=day)`, g.phase === "day");
    if (victim) {
      const vp = g.players.find((p) => p.seat === victim.seat)!;
      check(`[${sid}] 밤 살해 대상 자동 사망(cause=night)`, vp.status === "dead" && vp.deathCause === "night", `${vp.status}/${vp.deathCause}`);
    }
    // phase 마커(protected 등)는 전부 사라져야
    const anyPhaseMarker = g.players.some((p) =>
      p.markers.some((m) => markers.MARKER_MAP[markers.parseMarker(m).base]?.duration === "phase"),
    );
    check(`[${sid}] 낮 전환 후 phase 마커 소멸`, !anyPhaseMarker);

    // ── 낮 1: 지목 → 순차 투표 → 처형 ──
    games.setNominationsOpen(gid, true);
    const alive = g.players.filter((p) => p.status !== "dead");
    const nominator = alive.find((p) => p.seat !== demonSeat)!.seat;
    const nominee = demonSeat; // 악마를 처형 시도
    const seatLite = g.players.map((p) => ({
      seat: p.seat,
      status: (p.status === "dead" ? "dead" : "alive") as "alive" | "dead",
      ghostVoteUsed: p.ghostVoteUsed,
    }));
    const nomId = noms.openNomination({ gameId: gid, day: g.day, nominator, nominee, seats: seatLite });
    const nom0 = noms.getById(nomId)!;
    check(`[${sid}] openNomination order 말미=지명자`, nom0.order[nom0.order.length - 1] === nominee);
    check(`[${sid}] 지명자/피지명 하루한도 목록`, noms.listForDay(gid, g.day).length === 1);

    noms.startVote(nomId);
    // 순차 스윕: order를 돌며 손 들기(대부분 up → 처형선 초과 유도)
    let guard = 0;
    let ghostVoterSeat = -1;
    while (guard++ < 50) {
      const cur = noms.getById(nomId)!;
      if (cur.status !== "voting") break;
      const seat = cur.order[cur.pointer];
      const pl = g.players.find((p) => p.seat === seat)!;
      const isGhost = pl.status === "dead" && !pl.ghostVoteUsed;
      if (isGhost) ghostVoterSeat = seat;
      // 지명자 본인 외 전원 up
      const hand = seat === nominee ? 0 : 1;
      noms.setHand(nomId, seat, hand as 0 | 1, isGhost);
      const res = noms.advance(nomId, cur.step);
      check(`[${sid}] advance CAS 유효`, res !== "noop" || cur.status !== "voting");
    }
    const tallied = noms.getById(nomId)!;
    check(`[${sid}] 스윕 종료 → tallied`, tallied.status === "tallied", tallied.status);
    // CAS 멱등: 이미 tallied면 재-advance는 noop
    check(`[${sid}] tallied 후 advance는 noop`, noms.advance(nomId, tallied.step) === "noop");

    const up = noms.countUp(nomId);
    const tally = voting.computeTally(g.players, g.votes, charMap);
    check(`[${sid}] 찬성표 >= 처형선`, up >= tally.executionCutoff, `up=${up}, cutoff=${tally.executionCutoff}`);

    // 정산·처형 커밋(액션 레이어의 commitNomination이 하는 것): recordVote + setStatus + markCommitted
    games.recordVote(gid, { nominator, nominee, votes: up, executed: true });
    games.setStatus(gid, nominee, "dead", "execution");
    noms.markCommitted(nomId);
    g = games.getGame(gid)!;
    const execP = g.players.find((p) => p.seat === nominee)!;
    check(`[${sid}] 처형 대상 사망(cause=execution)`, execP.status === "dead" && execP.deathCause === "execution");
    check(`[${sid}] committed VoteRecord 반영`, g.votes.some((v) => v.nominee === nominee && v.executed));

    // 유령표: 죽은 좌석이 up으로 투표했으면 소모 확정
    if (ghostVoterSeat >= 0) {
      const gv = g.players.find((p) => p.seat === ghostVoterSeat)!;
      check(`[${sid}] 유령표 up 후 소모 확정`, gv.ghostVoteUsed, `seat ${ghostVoterSeat}`);
    }

    // ── 낮 → 밤 2 → 낮 2: 2차 사이클(간단) ──
    games.advancePhase(gid); // 낮1 → 밤2
    g = games.getGame(gid)!;
    check(`[${sid}] 밤2 전환(phase=night, day=2)`, g.phase === "night" && g.day === 2, `${g.phase}/${g.day}`);
    // 처형 대상은 여전히 죽어있어야(사망 이월)
    check(`[${sid}] 사망 상태 밤2로 이월`, g.players.find((p) => p.seat === nominee)!.status === "dead");

    // 밤2 킬 하나 더
    const victim2 = g.players.find((p) => p.status !== "dead" && p.seat !== demonSeat);
    if (victim2) games.toggleMarker(gid, victim2.seat, "dying");
    games.advancePhase(gid); // 밤2 → 낮2
    g = games.getGame(gid)!;
    check(`[${sid}] 낮2 전환`, g.phase === "day" && g.day === 2);
    if (victim2) {
      check(`[${sid}] 밤2 살해 자동 사망`, g.players.find((p) => p.seat === victim2.seat)!.status === "dead");
    }

    // 복기(getHistory) 무결성 — 스냅샷 수 == phaseCount
    const hist = games.getHistory(gid);
    check(`[${sid}] getHistory 스냅샷 수 일치`, hist.length === g.phaseCount, `${hist.length} vs ${g.phaseCount}`);

    // 종료 처리
    games.finishGame(gid, "good");
    check(`[${sid}] finishGame`, games.getGame(gid)!.status === "finished");

    // (사본이라 삭제는 무의미하지만 deleteGame 경로도 태워 정합성 확인)
    games.deleteGame(gid);
    check(`[${sid}] deleteGame 후 조회 불가`, !games.getGame(gid));
  }

  // ── 결과 출력 ──
  section("결과");
  console.log(`\x1b[32m통과 ${PASS}건\x1b[0m` + (FAILS.length ? `,  \x1b[31m실패 ${FAILS.length}건\x1b[0m` : ",  실패 0건"));
  if (FAILS.length) {
    console.log("\n" + FAILS.join("\n"));
  }
}

main()
  .catch((e) => {
    console.error("HARNESS ERROR:", e);
    FAILS.push(`✗ 하네스 자체 예외 — ${(e as Error).stack}`);
  })
  .finally(() => {
    // 임시 DB 정리
    for (const f of [TMP_DB, `${TMP_DB}-wal`, `${TMP_DB}-shm`]) {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch {
        /* ignore */
      }
    }
    process.exit(FAILS.length ? 1 : 0);
  });
