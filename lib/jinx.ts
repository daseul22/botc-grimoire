// 징크스 항목 파싱 — 순수 모듈(클라/서버 공용).
//
// 징크스 시드 데이터 형식은 "상대 직업 : 규칙"(구분자 " : " = 공백-콜론-공백).
// 구분자를 단순 ":"로 자르면 규칙 텍스트 안의 콜론에서 잘못 잘린다. 파싱을 한곳에 모아
// CharacterDetail·AbilityModal·ScriptExporter가 동일 규칙을 쓰게 한다.
//
// 구분자가 없으면 partner="" 이고 rule=전체 문자열(파트너 없는 일반 설명).
export function parseJinxEntry(entry: string): { partner: string; rule: string } {
  const i = entry.indexOf(" : ");
  if (i < 0) return { partner: "", rule: entry };
  return { partner: entry.slice(0, i), rule: entry.slice(i + 3) };
}
