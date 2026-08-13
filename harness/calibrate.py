#!/usr/bin/env python3
"""하네스 보정 실험 — 같은 LSI 기준으로 벤치마크 서비스(트위치) 채점.
목적: 평가 도구 자체의 닻 내림 여부 확인. 트위치가 75점 근처면 LSI 저울에 천장 존재.
"""
import base64, concurrent.futures as cf, json, os, re, time, urllib.request, io, sys
from PIL import Image

CFG = open(os.path.expanduser("~/.hermes/config.yaml")).read()
API_KEY = re.search(r'custom_providers:\s*\n\s*- api_key:\s*(\S+)', CFG).group(1).strip()
BASE = "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions"
MODEL = "qwen3.8-max"

TARGET = sys.argv[1] if len(sys.argv) > 1 else "twitch"
SHOTS = {
    "twitch": ("/home/watch/.hermes/cache/screenshots/bench_just-chatting.png",
               "Twitch — 인간 방송자의 라이브 방송을 다른 인간들이 관전하는 세계 최대 라이브 스트리밍 플랫폼. 좌측 추천 목록, 중앙 영상+채팅, 우측 라이브 채팅 구조."),
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

personas = json.load(open("/home/watch/projects/Lirkai/harness/personas.json"))[:30]  # 보정용 샘플 30명

def build_prompt(persona, img):
    shot_path, desc = SHOTS[TARGET]
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

{{"A": <0-20>, "B": <0-20>, "C": <0-20>, "D": <0-20>, "E": <0-20>, "total": <합계>, "feedback": ["<구체적 개선 제안>"]}}"""
    return [{"role": "user", "content": [
        {"type": "text", "text": text},
        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img}"}},
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

img = b64(SHOTS[TARGET][0])
print(f"보정 실험: {TARGET}, 페르소나 {len(personas)}명", flush=True)
results = []
with cf.ThreadPoolExecutor(max_workers=6) as ex:
    for r in ex.map(lambda p: call_llm(build_prompt(p, img)), personas):
        results.append(r)

ok = [r for r in results if "error" not in r]
print(f"성공 {len(ok)} / 실패 {len(results)-len(ok)}")
composite = round(sum(r["total"] for r in ok)/len(ok), 1)
axes = {c: round(sum(r[c] for r in ok)/len(ok), 1) for c, _, _ in AXES}
print(f"\n{'='*50}")
print(f"[{TARGET}] 보정 점수: {composite} / 100")
for c, n, _ in AXES: print(f"  {c} {n}: {axes[c]}/20")
dist = {"90+": sum(1 for r in ok if r["total"]>=90), "80-89": sum(1 for r in ok if 80<=r["total"]<90),
        "70-79": sum(1 for r in ok if 70<=r["total"]<80), "<70": sum(1 for r in ok if r["total"]<70)}
print(f"분포: {dist}")
print(f"\n해석: 트위치 점수가 Lirkai(75)와 비슷하면 → LSI 저울 자체에 천장 존재 (평가 보정 필요)")
print(f"      트위치가 훨씬 높으면 → Lirkai UI에 진짜 개선 필요")
