#!/usr/bin/env python3
"""Lirkai 하네스 엔지니어링 — 100 인간 페르소나 종합 평가.

종합 평가지수 LSI (Lirkai Spectator Index, 100점 만점):
  A. 첫인상 이해도 (20) — 화면만 보고 "AI들이 노는 걸 인간이 관전한다"는 컨셉이 즉시 전달되는가
  B. 터미널 몰입감 (20) — 해킹/CRT 터미널 연출이 차분하고 세련되게 몰입을 주는가
  C. 가독성·편의성 (20) — 메시지·로그·버튼이 편하게 읽히고 조작이 명확한가
  D. 정보 위계 (20) — 핵심(무대)과 보조(통계·속마음)가 명확히 구분되는가
  E. 관전 지속 욕구 (20) — 더 보고 싶고, 머물고 싶은가 (재미·호기심)

출력: harness/reports/round_<n>_<ts>.json
"""
import base64, concurrent.futures as cf, json, os, re, sys, time, urllib.request
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).parent
CFG = open(os.path.expanduser("~/.hermes/config.yaml")).read()
API_KEY = re.search(r'custom_providers:\s*\n\s*- api_key:\s*(\S+)', CFG).group(1).strip()
BASE = "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions"
MODEL = "qwen3.8-max"
WORKERS = 8

SCREENSHOTS = {
    "desktop": "/home/watch/.hermes/cache/screenshots/lirkai_prod_final.png",
    "mobile": "/home/watch/.hermes/cache/screenshots/lirkai_prod_mobile.png",
}

AXES = [
    ("A", "첫인상 이해도", "화면만 보고 'AI들이 노는 것을 인간이 관전하는 서비스'라는 컨셉이 3초 안에 전달되는가"),
    ("B", "터미널 몰입감", "해킹/CRT 터미널 연출이 과하지 않게 차분하고 세련된 몰입감을 주는가"),
    ("C", "가독성·편의성", "채팅 메시지, 속마음 로그, 버튼, 통계가 편하게 읽히고 조작 방법이 명확한가"),
    ("D", "정보 위계", "중앙 무대가 주인공이고 좌측 통계/우측 속마음이 보조라는 위계가 명확한가"),
    ("E", "관전 지속 욕구", "계속 지켜보고 싶고, 다음에 어떤 대화가 나올지 궁금한가"),
]

def load_personas() -> list[dict]:
    f = HERE / "personas.json"
    if f.exists():
        return json.load(open(f))
    # 100개 페르소나 결정적 생성
    ages = [16,17,19,21,22,24,25,27,28,29,30,31,33,34,36,38,39,41,43,45,47,49,52,55,58,62]
    jobs = ["고등학생","대학생(컴퓨터공학과)","대학생(경영학과)","취업준비생","주니어 개발자","시니어 개발자","UX 디자이너","그래픽 디자이너","마케팅 담당자","콘텐츠 크리에이터","트위치 스트리머","유튜버","회사원(영업)","회사원(재무)","자영업자(카페)","자영업자(음식점)","프리랜서 번역가","대학원생(AI 연구)","중학교 교사","은퇴자","주부","게임 커뮤니티 운영자","IT 기자","스타트업 대표","PM(프로덕트 매니저)","QA 엔지니어"]
    sns = ["트위치 헤비 유저(하루 3시간)","엑스(트위터) 헤비 유저","인스타그램 중심 사용자","레딧/커뮤니티 헤비 유저","유튜브 중심 사용자","SNS를 거의 안 함","디스코드 커뮤니티 중심","틱톡 중심 사용자"]
    tech = ["기술 숙련도 높음 — IT 용어에 익숙","기술 숙련도 중간 — 앱은 잘 쓰지만 개발은 모름","기술 숙련도 낮음 — 복잡한 화면을 어려워함"]
    personas = []
    for i in range(100):
        personas.append({
            "id": i + 1,
            "age": ages[i % len(ages)],
            "job": jobs[(i * 7) % len(jobs)],
            "sns": sns[(i * 3) % len(sns)],
            "tech": tech[i % 3],
            "note": "유명한 SNS(트위치·엑스·레딧 등)를 써본 인간 사용자 입장에서 평가"
        })
    json.dump(personas, open(f, "w"), ensure_ascii=False, indent=1)
    return personas

def b64(path: str, max_w: int = 1200) -> str:
    from PIL import Image
    import io
    img = Image.open(path)
    w, h = img.size
    if max(w, h) > max_w:
        s = max_w / max(w, h)
        img = img.resize((int(w*s), int(h*s)), Image.LANCZOS)
    buf = io.BytesIO()
    img.convert("RGB").save(buf, "JPEG", quality=82)
    return base64.b64encode(buf.getvalue()).decode()

def build_prompt(persona: dict, imgs: dict[str, str]) -> list[dict]:
    axes_desc = "\n".join(f"  {code}. {name} (0~20점): {desc}" for code, name, desc in AXES)
    text = f"""당신은 아래 프로필의 **인간 사용자**입니다. 이 입장에서 두 장의 웹사이트 스크린샷(데스크톱, 모바일)을 평가하세요.

[내 프로필]
- 나이: {persona['age']}세 / 직업: {persona['job']}
- SNS 습관: {persona['sns']}
- {persona['tech']}
- {persona['note']}

[이 서비스의 의도된 컨셉]
"Lirkai — AI들끼리 자유롭게 대화하고, 인간은 관전만 하는 AI 전용 SNS". 터미널 해킹 무드의 연출 유지. 인간 관전자는 실시간 무대(중앙), AI 속마음 로그(우측), 극장 통계(좌측)를 보며 AI들이 노는 것을 편하게 구경한다.

[평가 항목 — LSI (각 0~20점, 총 100점)]
{axes_desc}

[규칙]
- 유명 SNS(트위치의 관전 레이아웃, 엑스의 메시지 밀도, 레딧의 게시판)를 써본 경험과 비교해 냉정하게 평가할 것.
- 잘 만든 서비스는 90점 이상 받기 어렵다는 기준으로 엄격하게. 다만 실제로 훌륭하면 높은 점수를 줘도 됨.
- 개선 제안은 "이 화면에서 당장" 적용 가능한 구체적 UI/디자인 제안만 (기능 추가/백엔드 변경 제외).
- 반드시 아래 JSON 형식으로만 응답할 것. 다른 텍스트 금지.

{{"A": <0-20>, "B": <0-20>, "C": <0-20>, "D": <0-20>, "E": <0-20>, "total": <합계>, "feedback": ["<구체적 개선 제안 1>", "<제안 2>", "<제안 3>"]}}"""
    return [{"role": "user", "content": [
        {"type": "text", "text": text},
        {"type": "text", "text": "[데스크톱 화면]"},
        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{imgs['desktop']}"}},
        {"type": "text", "text": "[모바일 화면]"},
        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{imgs['mobile']}"}},
    ]}]

def call_llm(messages: list[dict], attempt: int = 0) -> dict:
    payload = {"model": MODEL, "messages": messages, "max_tokens": 500, "temperature": 0.8}
    req = urllib.request.Request(BASE, data=json.dumps(payload).encode(),
        headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            d = json.load(r)
        content = d["choices"][0]["message"]["content"]
        m = re.search(r'\{.*\}', content, re.S)
        if not m: raise ValueError(f"no JSON in response: {content[:100]}")
        parsed = json.loads(m.group(0))
        for k in ["A","B","C","D","E","total"]:
            parsed[k] = float(parsed[k])
        parsed["feedback"] = list(parsed.get("feedback", []))[:4]
        return parsed
    except Exception as e:
        if attempt < 2:
            time.sleep(2 + attempt * 3)
            return call_llm(messages, attempt + 1)
        return {"error": str(e)[:200]}

def main():
    personas = load_personas()
    print(f"페르소나 {len(personas)}명 로드 완료", flush=True)
    imgs = {k: b64(v) for k, v in SCREENSHOTS.items()}
    print("스크린샷 인코딩 완료", flush=True)

    results = [None] * len(personas)
    done = 0
    def run(i_p):
        i, p = i_p
        return i, call_llm(build_prompt(p, imgs))

    with cf.ThreadPoolExecutor(max_workers=WORKERS) as ex:
        for i, res in ex.map(run, enumerate(personas)):
            results[i] = res
            done += 1
            if done % 20 == 0: print(f"  진행: {done}/100", flush=True)

    ok = [r for r in results if "error" not in r]
    err = [r for r in results if "error" in r]
    print(f"성공 {len(ok)} / 실패 {len(err)}", flush=True)

    if not ok:
        print("전원 실패:", err[0] if err else "unknown")
        sys.exit(1)

    # 집계
    def avg(key): return round(sum(r[key] for r in ok) / len(ok), 1)
    composite = round(sum(r["total"] for r in ok) / len(ok), 1)
    axis_scores = {code: avg(code) for code, _, _ in AXES}
    dist = {"90+": sum(1 for r in ok if r["total"] >= 90), "80-89": sum(1 for r in ok if 80 <= r["total"] < 90),
            "70-79": sum(1 for r in ok if 70 <= r["total"] < 80), "<70": sum(1 for r in ok if r["total"] < 70)}

    # 피드백 집계 (전체 리스트 보존)
    all_fb = []
    for r in ok:
        all_fb.extend(r["feedback"])

    round_no = len(list((HERE / "reports").glob("round_*.json"))) + 1 if (HERE / "reports").exists() else 1
    (HERE / "reports").mkdir(exist_ok=True)
    report = {
        "round": round_no,
        "timestamp": datetime.now().isoformat(timespec="seconds"),
        "model": MODEL,
        "personas_ok": len(ok), "personas_err": len(err),
        "composite_LSI": composite,
        "axes": axis_scores,
        "distribution": dist,
        "feedback_all": all_fb,
        "details": [{"persona": i+1, **r} for i, r in enumerate(results)],
        "screenshots": SCREENSHOTS,
    }
    out = HERE / "reports" / f"round_{round_no:02d}_{datetime.now():%Y%m%d_%H%M%S}.json"
    json.dump(report, open(out, "w"), ensure_ascii=False, indent=1)
    print(f"\n{'='*50}")
    print(f"라운드 {round_no} 종합 평가지수 LSI: {composite} / 100")
    for code, name, _ in AXES:
        print(f"  {code} {name}: {axis_scores[code]}/20")
    print(f"분포: {dist}")
    print(f"피드백 {len(all_fb)}건 수집")
    print(f"보고서: {out}")

if __name__ == "__main__":
    main()
