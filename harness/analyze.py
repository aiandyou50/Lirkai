#!/usr/bin/env python3
"""하네스 라운드 보고서 분석 — 피드백 빈도 클러스터링 + 개선 우선순위."""
import json, re, sys
from pathlib import Path
from collections import Counter

def load_latest():
    reports = sorted(Path("/home/watch/projects/Lirkai/harness/reports").glob("round_*.json"))
    if not reports:
        print("보고서 없음"); sys.exit(1)
    return json.load(open(reports[-1])), reports[-1].name

def cluster(feedbacks: list[str]):
    """키워드 기반 클러스터링."""
    buckets = {
        "여백·공간 활용": ["여백", "빈 공간", "텅", "비어", "공간 낭비", "허전"],
        "통계/숫자 가독성": ["통계", "숫자", "카운트", "수치", "지표"],
        "색상·대비": ["색상", "대비", "색", "어두", "밝기", "가독", "흐릿", "연한"],
        "메시지 밀도·길이": ["밀도", "너무 많", "빽빽", "길", "압축", "요약", "말줄임"],
        "빈 상태 안내": ["빈 상태", "아직", "대기", "없음", "시작 전", "활성"],
        "LIVE 상태 표시": ["LIVE", "대기 중", "실시간", "진행 중", "상태 표시"],
        "폰트·타이포": ["폰트", "글꼴", "타이포", "글자 크기", "자간"],
        "모바일 레이아웃": ["모바일", "좁은 화면", "탭"],
        "봇 프로필·정보": ["페르소나", "프로필", "봇 소개", "캐릭터"],
        "시간 표시": ["시간", "타임스탬프", "날짜", "최신"],
        "리액션 UI": ["리액션", "이모지", "반응 버튼"],
        "헤더·브랜딩": ["헤더", "로고", "브랜딩", "타이틀", "상단"],
        "속마음 패널": ["속마음", "THINK", "도청"],
        "아이콘·장식": ["아이콘", "장식", "이모지 과"],
        "설명·가이드": ["설명", "가이드", "이해", "안내", "온보딩", "튜토리얼"],
    }
    counts = Counter()
    unmatched = []
    for fb in feedbacks:
        hit = False
        for bucket, kws in buckets.items():
            if any(k in fb for k in kws):
                counts[bucket] += 1
                hit = True
        if not hit:
            unmatched.append(fb)
    return counts.most_common(), unmatched

def main():
    report, fname = load_latest()
    print(f"=== {fname} ===")
    print(f"종합 LSI: {report['composite_LSI']} / 100 (목표 90)")
    print(f"항목: " + " | ".join(f"{k}:{v}" for k, v in report['axes'].items()))
    print(f"분포: {report['distribution']}")
    print(f"\n--- 피드백 클러스터 (총 {len(report['feedback_all'])}건) ---")
    clusters, unmatched = cluster(report['feedback_all'])
    for name, cnt in clusters:
        print(f"  {cnt:3d}건  {name}")
    print(f"  {len(unmatched):3d}건  (미분류)")
    print("\n--- 미분류 샘플 (최대 15건) ---")
    for fb in unmatched[:15]:
        print(f"  · {fb[:110]}")

if __name__ == "__main__":
    main()
