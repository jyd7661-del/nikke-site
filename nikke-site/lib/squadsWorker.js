// 팀 나누기(솔로레이드 5팀 · PvP 3팀) 계산용 웹 워커 (2026-10-25).
// 로스터 50명이면 recommendTeams 한 번이 10초쯤 걸린다(로컬 실측) — 화면 스레드에서 돌리면 그동안 페이지가 멈춘다.
// Set은 메시지로 못 넘겨 treasureIds를 배열로 받아 되돌린다. 결과는 JSON으로 한 번 걸러 순수 객체만 보낸다.
import { pickPvpSquads, pickRaidSquads } from './synergyEngine';

self.onmessage = (e) => {
  const { kind, roster, opts } = e.data || {};
  const o = { ...opts, treasureIds: new Set(opts?.treasureIds || []) };
  const r = kind === 'pvp' ? pickPvpSquads(roster || [], o) : pickRaidSquads(roster || [], o);
  self.postMessage(JSON.parse(JSON.stringify(r)));
};
