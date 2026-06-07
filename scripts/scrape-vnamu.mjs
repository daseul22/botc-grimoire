// vnamu(botc.vnamu.com) 데이터 수집 → data/characters.json, data/sheets.json + public/icons/
//
// 실행: npm run data:scrape
//
// 2단계 수집:
//  1) 루트('/') HTML(약 6MB): 브라우저 UA 붙이면 200(기본 403). 임베드 데이터에서
//       · .char-card DOM data-* → 공식 id 목록(is-custom=0), 팀 코드, 아이콘 URL(→에디션)
//       · const JINXES = {...} → 징크스(직업 상호작용, 한/영). 상세 페이지보다 완전(soldier 등).
//         키에 -104 등 버전 접미사 가능 → stripVersion으로 매칭.
//  2) 상세('/library/{id}') HTML: DOM에 풍부한 한/영 데이터(lang-sw + data-ko/data-en)
//       · lib-char-name → 이름, lib-flavor → 분위기 글
//       · lib-card-title "능력" → 능력, "상세정보" → 상세설명, "운영방식" → #howKo/#howEn 단계
//       · lib-meta-row 라벨 페어 → 첫째밤/그외밤 순서 + 리마인더(한/영)
//
// 주의: data/rules.json은 건드리지 않는다(별도 수기 관리).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const HDRS = { "User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9" };

function decode(s) {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    // vnamu 인라인 마커 정리 (:reminder: = 리마인더 토큰 삽입 표시)
    .replace(/\s*:reminder:\s*/g, " ")
    .replace(/[ \t]{2,}/g, " ");
}

const stripVersion = (id) => id.replace(/-\d+$/, "");

// vnamu 징크스 텍스트의 옛/대체 번역 → 카드명으로 통일 (필요 시 항목 추가)
const ALIASES = { 용사: "군인" };
// 한글 받침 유무 (조사 선택용)
const hasBatchim = (w) => {
  const ch = w.charCodeAt(w.length - 1);
  return ch >= 0xac00 && ch <= 0xd7a3 && (ch - 0xac00) % 28 !== 0;
};
// 받침 있는 단어용 조사 / 받침 없는 단어용 조사
const JOSA = { 는: "은", 가: "이", 를: "을", 와: "과", 로: "으로" };
function applyAliases(s) {
  for (const [a, b] of Object.entries(ALIASES)) {
    const bat = hasBatchim(b);
    // 별칭 + 모음형 조사 → 새 단어의 받침에 맞춰 조사 교정
    s = s.replace(new RegExp(a + "([는가를와로])", "g"), (_, j) =>
      bat ? b + JOSA[j] : b + j,
    );
    s = s.split(a).join(b); // 남은 별칭(조사 없거나 받침무관 조사)
  }
  return s;
}

// balanced JS literal extractor (for const JINXES = {...})
function extractLiteral(html, marker, open) {
  const close = open === "[" ? "]" : "}";
  const i = html.indexOf(open, html.indexOf(marker));
  let depth = 0, inStr = false, esc = false, q = null;
  for (let j = i; j < html.length; j++) {
    const ch = html[j];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === q) inStr = false;
    } else if (ch === '"' || ch === "'") { inStr = true; q = ch; }
    else if (ch === open) depth++;
    else if (ch === close && --depth === 0) return html.slice(i, j + 1);
  }
  throw new Error("unbalanced " + marker);
}

const EDMAP = { tb: "trouble-brewing", bmr: "bad-moon-rising", snv: "sects-and-violets" };
function editionFromImg(img) {
  const c = (img && img.match(/\/icons\/([a-z0-9]+)\//i)?.[1]?.toLowerCase()) || "";
  return EDMAP[c] || (c === "loric" ? "loric" : "other");
}
const extOf = (url) =>
  ((url || "").split("?")[0].match(/\.(webp|png|jpe?g|gif|svg)$/i)?.[1] || "png").toLowerCase();

// ── detail page parsing ──
function cardBody(html, title) {
  const ti = html.indexOf('lib-card-title">' + title);
  if (ti < 0) return null;
  const m = html.slice(ti, ti + 12000).match(/data-ko="([^"]*)"[^>]*data-en="([^"]*)"/);
  return m ? { ko: decode(m[1]), en: decode(m[2]) } : null;
}
function divContent(html, marker) {
  const i = html.indexOf(marker);
  if (i < 0) return "";
  const start = html.indexOf(">", i) + 1;
  return html.slice(start, html.indexOf("</div>", start));
}
function liList(block) {
  return [...block.matchAll(/<li>([\s\S]*?)<\/li>/g)]
    .map((x) => decode(x[1].replace(/<[^>]+>/g, " ")).replace(/[ \t]+/g, " ").trim())
    .filter(Boolean);
}
function parseDetail(html) {
  const out = {};
  const nm = html.match(/class="[^"]*lib-char-name[^"]*"[^>]*data-ko="([^"]*)"[^>]*data-en="([^"]*)"/);
  if (nm) out.name = { ko: decode(nm[1]), en: decode(nm[2]) };
  const fl = html.match(/class="[^"]*lib-flavor[^"]*"[^>]*data-ko="([^"]*)"[^>]*data-en="([^"]*)"/);
  if (fl) out.flavor = { ko: decode(fl[1]), en: decode(fl[2]) };
  out.ability = cardBody(html, "능력");
  out.detail = cardBody(html, "상세정보");
  const ko = liList(divContent(html, 'id="howKo"'));
  const en = liList(divContent(html, 'id="howEn"'));
  out.howTo = ko.length || en.length ? { ko, en } : null;

  let fo = 0, oo = 0, fr = null, or = null;
  const rowRe = /<span class="lib-meta-label">([^<]+)<\/span>\s*<span class="lib-meta-value([^>]*)>([\s\S]*?)<\/span>/g;
  for (let m; (m = rowRe.exec(html)); ) {
    const label = m[1].trim();
    const dk = m[2].match(/data-ko="([^"]*)"/);
    const de = m[2].match(/data-en="([^"]*)"/);
    const rem = dk ? { ko: decode(dk[1]), en: de ? decode(de[1]) : "" } : null;
    if (label === "첫째 밤") fo = Number(decode(m[3]).trim()) || 0;
    else if (label === "그 외 밤") oo = Number(decode(m[3]).trim()) || 0;
    else if (label === "첫째 밤 리마인더") fr = rem;
    else if (label === "그 외 밤 리마인더") or = rem;
  }
  out.firstNight = fo > 0 ? { order: fo, reminder: fr } : null;
  out.otherNight = oo > 0 ? { order: oo, reminder: or } : null;
  return out;
}

async function fetchText(url, tries = 2) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: HDRS });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.text();
    } catch (e) {
      if (i === tries - 1) throw e;
    }
  }
}

async function pool(items, n, worker) {
  const q = [...items];
  let done = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (q.length) {
        await worker(q.pop());
        if (++done % 25 === 0) console.log("  ...", done, "/", items.length);
      }
    }),
  );
}

async function main() {
  console.log("fetching botc.vnamu.com/ ...");
  const html = await fetchText("https://botc.vnamu.com/");
  console.log("  got", (html.length / 1e6).toFixed(1), "MB");

  // root cards
  const cards = [];
  const cardRe = /<div class="char-card"([^>]*?)>/g;
  for (let m; (m = cardRe.exec(html)); ) {
    const attrs = {};
    const aRe = /data-([a-z-]+)="([^"]*)"/g;
    for (let a; (a = aRe.exec(m[1])); ) attrs[a[1]] = decode(a[2]);
    if (attrs["char-id"]) cards.push(attrs);
  }
  const customById = {};
  const wrapRe = /<div class="char-card-wrap"([\s\S]*?)>/g;
  for (let m; (m = wrapRe.exec(html)); ) {
    const id = m[1].match(/data-char-id="([^"]*)"/)?.[1];
    if (id) customById[id] = m[1].match(/data-is-custom="([^"]*)"/)?.[1];
  }
  const official = cards.filter((c) => customById[c["char-id"]] === "0");
  console.log("  official characters:", official.length);

  // 징크스(직업 상호작용): 루트 const JINXES = { charId: [{id,name_kr,reason_kr,name_en,reason_en}] }
  const JINXES = JSON.parse(extractLiteral(html, "const JINXES =", "{"));
  const jinxByBase = {};
  for (const k in JINXES) jinxByBase[stripVersion(k)] = JINXES[k];
  console.log("  jinx entries:", Object.keys(jinxByBase).length);

  // fetch + parse each detail page
  console.log("fetching detail pages /library/{id} ...");
  const details = {};
  await pool(official, 8, async (c) => {
    const id = c["char-id"];
    const url = c["detail-url"] || `https://botc.vnamu.com/library/${id}`;
    try {
      details[id] = parseDetail(await fetchText(url));
    } catch {
      details[id] = null;
    }
  });
  const okDetail = Object.values(details).filter(Boolean).length;
  console.log("  detail parsed:", okDetail, "/", official.length);

  // merge
  const icons = [];
  const characters = official.map((c) => {
    const id = c["char-id"];
    const d = details[id] || {};
    const ability = d.ability || { ko: c["ability-kr"] || "", en: c["ability-en"] || "" };
    const setup = /\[.*\]/.test(ability.en || "") || /\[.*\]/.test(ability.ko || "");
    if (c.img) icons.push({ id, url: c.img, ext: extOf(c.img) });
    const obj = {
      id,
      name: d.name || { ko: c["name-kr"] || "", en: c["name-en"] || "" },
      edition: editionFromImg(c.img),
      team: c.team,
      ability,
      firstNight: d.firstNight ?? null,
      otherNight: d.otherNight ?? null,
      reminders: [],
      setup,
    };
    if (setup) {
      // 능력 대괄호 안의 셋업 효과 추출 (예: [외지인 +2명] → "외지인 +2명")
      const sk = (ability.ko.match(/\[([^\]]*)\]/) || [])[1] || "";
      const se = (ability.en.match(/\[([^\]]*)\]/) || [])[1] || "";
      if (sk || se) obj.setupNote = { ko: sk, en: se };
    }
    if (d.flavor && (d.flavor.ko || d.flavor.en)) obj.flavor = d.flavor;
    if (d.detail && (d.detail.ko || d.detail.en)) obj.detail = d.detail;
    if (d.howTo && (d.howTo.ko.length || d.howTo.en.length)) obj.howTo = d.howTo;
    const jx = jinxByBase[stripVersion(id)];
    if (jx?.length) {
      const ko = jx
        .filter((j) => j.name_kr)
        .map((j) => applyAliases(j.reason_kr ? `${j.name_kr} : ${j.reason_kr}` : j.name_kr));
      const en = jx
        .filter((j) => j.name_en && j.reason_en)
        .map((j) => `${j.name_en} : ${j.reason_en}`);
      if (ko.length || en.length) obj.jinxes = { ko, en };
    }
    return obj;
  });

  const EDORDER = ["trouble-brewing", "bad-moon-rising", "sects-and-violets", "loric", "other"];
  const TEAMORDER = ["townsfolk", "outsider", "minion", "demon", "traveller", "fabled", "loric"];
  characters.sort(
    (a, b) =>
      EDORDER.indexOf(a.edition) - EDORDER.indexOf(b.edition) ||
      TEAMORDER.indexOf(a.team) - TEAMORDER.indexOf(b.team) ||
      a.name.ko.localeCompare(b.name.ko, "ko"),
  );

  // download icons
  console.log("downloading icons ...");
  const iconDir = path.join(ROOT, "public", "icons");
  fs.mkdirSync(iconDir, { recursive: true });
  const okExt = {};
  await pool(icons, 10, async (it) => {
    try {
      const r = await fetch(it.url, { headers: { ...HDRS, Referer: "https://botc.vnamu.com/" } });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const b = Buffer.from(await r.arrayBuffer());
      if (b.length < 100) throw new Error("too small");
      fs.writeFileSync(path.join(iconDir, `${it.id}.${it.ext}`), b);
      okExt[it.id] = it.ext;
    } catch {
      /* leave unset → letter fallback */
    }
  });
  console.log("  icons:", Object.keys(okExt).length, "/", icons.length);
  for (const c of characters) if (okExt[c.id]) c.image = `/icons/${c.id}.${okExt[c.id]}`;

  // official sheets = edition grouping
  const SHEET_META = [
    { id: "trouble-brewing", name: { ko: "트러블 브루잉", en: "Trouble Brewing" }, difficulty: "beginner", description: { ko: "입문용 공식 에디션. 정보가 명확해 처음 배우기 좋다.", en: "The introductory official edition." } },
    { id: "bad-moon-rising", name: { ko: "배드 문 라이징", en: "Bad Moon Rising" }, difficulty: "intermediate", description: { ko: "죽음과 정보 보호가 핵심인 중급 에디션.", en: "An intermediate edition centred on death." } },
    { id: "sects-and-violets", name: { ko: "종파의 제비꽃", en: "Sects & Violets" }, difficulty: "intermediate", description: { ko: "거짓 정보와 광기가 핵심인 중급 에디션.", en: "An intermediate edition centred on misinformation." } },
  ];
  const sheets = SHEET_META.map((s) => ({
    ...s,
    characterIds: characters.filter((c) => c.edition === s.id).map((c) => c.id),
  }));

  fs.writeFileSync(path.join(ROOT, "data", "characters.json"), JSON.stringify(characters, null, 2));
  fs.writeFileSync(path.join(ROOT, "data", "sheets.json"), JSON.stringify(sheets, null, 2));
  console.log(
    "wrote data/characters.json (" + characters.length + "), data/sheets.json (" + sheets.length + ")",
  );
  console.log(
    "  with flavor:", characters.filter((c) => c.flavor).length,
    "detail:", characters.filter((c) => c.detail).length,
    "howTo:", characters.filter((c) => c.howTo).length,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
