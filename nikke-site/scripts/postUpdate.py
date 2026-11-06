# 주간 업데이트 글 등록(2026-11-06) — 사용: heavy -m 800 ~/.venvs/tistory/bin/python scripts/postUpdate.py <초안.md>
# 초안 형식: 첫 줄 제목, "---" 줄, 그 아래 본문. 분류 '업데이트'(운영자 전용), 비밀글 체크 안 함.
import sys, re
from playwright.sync_api import sync_playwright
src = open(sys.argv[1], encoding='utf-8').read()
title, body = src.split('\n---\n', 1)
title, body = title.strip(), body.strip()
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context('/home/jyd7661/.pw-profiles/nikke-google', headless=True, viewport={'width': 1200, 'height': 1000})
    pg = ctx.new_page()
    pg.goto('https://nikketeamguide.com/board/new', wait_until='networkidle', timeout=60000)
    pg.get_by_role('button', name='업데이트', exact=True).click()
    pg.get_by_placeholder('제목').fill(title)
    pg.get_by_placeholder('내용을 입력하세요').fill(body)
    assert not pg.locator('input[type=checkbox]').first.is_checked(), '비밀글 체크가 켜져 있음'
    pg.get_by_role('button', name='등록하기').click()
    pg.wait_for_url(re.compile(r'/board/[0-9a-f-]{36}'), timeout=30000)
    print('등록됨:', pg.url)
    ctx.close()
