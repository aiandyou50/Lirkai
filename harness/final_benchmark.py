#!/usr/bin/env python3
"""Lirkai 최종 벤치마크 — 상대 지표(LSI-R) 공식 평가.
동일 페르소나 30명이 Lirkai(데스크톱/모바일)와 Twitch 벤치마크를 같은 LSI 5축으로 채점.
상대 성과 = Lirkai 점수 - Twitch 점수 (축별 델타 포함).
"""
import base64, concurrent.futures as cf, json, os, re, time, urllib.request, io, sys
from PIL import Image

CFG = open(os.path.expanduser("~/.hermes/config.yaml")).read()
API_KEY = re.search(r'custom_providers:\s*\n\s*- api_key:\s*(\S+)', CFG).group(1).strip()
BASE = "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions"
MODEL = "qwen3.8-max"

SCREENS = {
    "lirkai_desktop": ("/home/watch/.hermes/cache/screenshots/lirkai_prod_final.png",
        "Lirkai — AI 전용 하이브리드 SNS. 인간은 관전자이고, AI 캐릭터들이 터미널/해킹 미학의 무대에서 대화 공연을 하는 서비스. 좌측 극장 현황(통계·인기 발언자), 중앙 스테이지(실시간 대화+리액션), 우측 THINK LOG(AI 속마음 도청)."),
    "lirkai_mobile": ("/home/watch/.hermes/cache/screenshots/lirkai_prod_mobile.png",
        "Lirkai — AI 전용 하이브리드 SNS의 모바일 화면. 인간은 관전자이고, AI 캐릭터들이 터미널/해킹 미학의 무대에서 대화 공연을 하는 서비스. 상단 탭바(무대/속마음/현황/게시판), 중앙 실시간 대화 스테이지."),
    "twitch": ("/home/watch/.hermes/cache/screenshots/bench_just-chatting.png",
        "Twitch — 인간 방송자의 라이브 방송을 다른 인간들이 관전하는 세계 최대 라이브 스트리밍 플랫폼. 좌측 추천 목록, 중앙 영상, 우측 라이브 채팅 구조."),
}

AXES = [
    ("A", "첫인상 이해도", "화면만 보고 '무언가를 인간이 관전하는 서비스'라는 컨셉이 3초 안에 전달되는가"),
    ("B", "시각 테마 몰입감", "서비스의 고유 디자인 언어가 차분하고 세련되게 몰입감을 주는가"),
    ("C", "가독성·편의성", "콘텐츠, 채팅, 버튼, 통계가 편하게 읽히고 조작 방법이 명확한가"),
    ("D", "정보 위계", "핵심 콘텐츠가 주인공이고 보조 요소가 명확히 구분되는가"),
    ("E", "관전 지속 욕구", "계속 지켜보고 싶고, 다음에 어떤 내용이 나올지 궁금한가"),
]

def b64(path, max_w=1200):
    img = Image.open(path)
    w, h = img.size
    if max(w, h) > max_w:
        s = max_w / max(w, h)
        img = img.resize((int(w*s), int(h*s)), Image.LANCZOS)
    buf = io.BytesIO()
    img.convert("RGB").save(buf, "JPEG", quality=82)
    return base64.b64encode(buf.getvalue()).decode()

personas = json.load(open("/home/watch/projects/Lirkai/harness/personas.json"))[:30]

def build_prompt(persona, key):
    shot_path, desc = SCREENS[key]
    axes_desc = "\n".join(f"  {c}. {n} (0~20점): {d}" for c, n, d in AXES)
    text = f"""당신은 아래 프로필의 **인간 사용자**입니다. 이 입장에서 웹사이트 스크린샷을 평가하세요.

[내 프로필]
- 나이: {persona['age']}세 / 직업: {persona['job']}
- SNS 습관: {persona['sns']}
- {persona['tech']}

[이 화면의 의도된 컨셉]
{desc}

[평가 항목 — 각 0~20점, 총 100점]
{axes_desc}

[규칙]
- 이 분야의 대표 서비스들을 써본 경험과 비교해 냉정하게 평가.
- 잘 만든 서비스는 90점 이상 받기 어렵다는 기준으로 엄격하게. 다만 실제로 훌륭하면 높은 점수를 줘도 됨.
- 반드시 아래 JSON 형식으로만 응답. 다른 텍스트 금지.

{{"A": <0-20>, "B": <0-20>, "C": <0-20>, "D": <0-20>, "E": <0-20>, "total": <합계>, "feedback": ["<구체적 개선 제안 1~2개>"]}}"""
    return [{"role": "user", "content": [
        {"type": "text", "text": text},
        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{imgs[key]}"}},
    ]}]

def call_llm(messages, attempt=0):
    payload = {"model": MODEL, "messages": messages, "max_tokens": 400, "temperature": 0.8}
    req = urllib.request.Request(BASE, data=json.dumps(payload).encode(),
        headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            d = json.load(r)
        content = d["choices"][0]["message"]["content"]
        m = re.search(r'\{.*\}', content, re.S)
        parsed = json.loads(m.group(0))
        for k in ["A","B","C","D","E","total"]: parsed[k] = float(parsed[k])
        return parsed
    except Exception as e:
        if attempt < 2:
            time.sleep(2 + attempt*3); return call_llm(messages, attempt+1)
        return {"error": str(e)[:150]}

print("스크린샷 인코딩...", flush=True)
imgs = {k: b64(v[0]) for k, v in SCREENS.items()}

# 페어 설계: 각 페르소나가 3개 화면 모두 채점 (총 90회 호출)
jobs = [(p, k) for p in personas for k in SCREENS]
print(f"평가 시작: 페르소나 {len(personas)}명 × {len(SCREENS)}화면 = {len(jobs)}회", flush=True)

raw = {}
with cf.ThreadPoolExecutor(max_workers=6) as ex:
    futs = {ex.submit(call_llm, build_prompt(p, k)): (p["id"], k) for p, k in jobs}
    done = 0
    for fut in cf.as_completed(futs):
        pid, key = futs[fut]
        raw.setdefault(key, []).append(fut.result())
        done += 1
        if done % 15 == 0: print(f"  진행: {done}/{len(jobs)}", flush=True)

report = {"timestamp": time.strftime("%Y-%m-%d %H:%M:%S"), "personas": len(personas), "screens": {}}
for key in SCREENS:
    ok = [r for r in raw[key] if "error" not in r]
    comp = round(sum(r["total"] for r in ok)/len(ok), 1)
    axes = {c: round(sum(r[c] for r in ok)/len(ok), 1) for c, _, _ in AXES}
    report["screens"][key] = {"ok": len(ok), "composite": comp, "axes": axes,
        "feedback": [f for r in ok for f in r.get("feedback", [])]}
    print(f"  {key}: LSI {comp} (n={len(ok)})")

tw = report["screens"]["twitch"]["composite"]
print(f"\n{'='*56}")
print(f"  상대 성과 (vs Twitch {tw})")
print(f"{'='*56}")
for key in ["lirkai_desktop", "lirkai_mobile"]:
    s = report["screens"][key]
    delta = round(s["composite"] - tw, 1)
    sign = "+" if delta >= 0 else ""
    print(f"  {key}: {s['composite']} ({sign}{delta})")
    for c, n, _ in AXES:
        d = round(s["axes"][c] - report["screens"]["twitch"]["axes"][c], 1)
        print(f"     {c} {n}: {s['axes'][c]} vs {report['screens']['twitch']['axes'][c]} ({'+' if d>=0 else ''}{d})")

out = f"/home/watch/projects/Lirkai/harness/reports/final_benchmark_{time.strftime('%Y%m%d_%H%M%S')}.json"
json.dump(report, open(out, "w"), ensure_ascii=False, indent=1)
print(f"\n보고서: {out}")
