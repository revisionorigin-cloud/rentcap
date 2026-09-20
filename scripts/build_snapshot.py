"""국토교통부 실거래가 공개시스템(rt.molit.go.kr)에서 내려받은 오피스텔 CSV를
앱이 읽는 압축 JSON 스냅샷으로 변환한다.

사용법:  python scripts/build_snapshot.py <CSV 폴더>
CSV 파일명 규칙: <시군구코드>_<rent|trade>_<임의>.csv  (CP949, 헤더는 'NO'로 시작하는 줄)

스냅샷은 data.go.kr 인증키가 없을 때의 대체 데이터다. 키가 있으면 앱은 OpenAPI를 직접 호출한다.
"""
import csv, glob, io, json, os, re, sys
from datetime import date

src = sys.argv[1]
root = os.path.join(os.path.dirname(__file__), "..", "data")
os.makedirs(os.path.join(root, "snapshot"), exist_ok=True)


def rows_of(path):
    text = open(path, "rb").read().decode("cp949")
    lines = text.splitlines()
    head = next(i for i, l in enumerate(lines) if l.startswith('"NO"'))
    period = next((l for l in lines[:head] if "계약일자" in l), "")
    return period, list(csv.DictReader(io.StringIO("\n".join(lines[head:]))))


def num(s):
    s = (s or "").replace(",", "").strip()
    return int(float(s)) if s and s != "-" else 0


regions = {}
for path in sorted(glob.glob(os.path.join(src, "*_*_*.csv"))):
    code, kind, _ = os.path.basename(path).split("_", 2)
    period, rows = rows_of(path)
    reg = regions.setdefault(code, {"rent": [], "trade": [], "cx": {}, "cxl": [], "periods": set(), "name": ""})
    m = re.search(r"(\d{4}-\d{2}-\d{2}) ~ (\d{4}-\d{2}-\d{2})", period)
    if m:
        reg["periods"].update(m.groups())
    for r in rows:
        sgg = r["시군구"].split()
        reg["name"] = " ".join(sgg[:2])
        dong = " ".join(sgg[2:])
        key = (dong, r["번지"], r["단지명"])
        if key not in reg["cx"]:
            reg["cx"][key] = len(reg["cxl"])
            reg["cxl"].append([r["단지명"], dong, r["번지"], r.get("도로명", ""), num(r["건축년도"])])
        ci = reg["cx"][key]
        area = round(float(r["전용면적(㎡)"]), 2)
        ymd = int(r["계약년월"]) * 100 + int(r["계약일"])
        if kind == "rent":
            ctype = {"신규": 1, "갱신": 2}.get(r["계약구분"].strip(), 0)
            reg["rent"].append([ci, area, ymd, num(r["보증금(만원)"]), num(r["월세금(만원)"]), num(r["층"]),
                                ctype, 1 if r["갱신요구권 사용"].strip() == "사용" else 0,
                                num(r["종전계약 보증금(만원)"]), num(r["종전계약 월세(만원)"])])
        else:
            canceled = 0 if r["해제사유발생일"].strip() in ("", "-") else 1
            reg["trade"].append([ci, area, ymd, num(r["거래금액(만원)"]), num(r["층"]), canceled])

index = []
for code, reg in regions.items():
    periods = sorted(reg["periods"])
    out = {
        "meta": {
            "code": code, "name": reg["name"], "asset": "오피스텔",
            "source": "국토교통부 실거래가 공개시스템 CSV (rt.molit.go.kr)",
            "from": periods[0], "to": periods[-1], "fetchedAt": date.today().isoformat(),
        },
        "complexFields": ["name", "dong", "jibun", "road", "buildYear"],
        "rentFields": ["cx", "area", "ymd", "deposit", "rent", "floor", "ctype", "rrr", "prevDeposit", "prevRent"],
        "tradeFields": ["cx", "area", "ymd", "price", "floor", "canceled"],
        "complexes": reg["cxl"], "rent": reg["rent"], "trade": reg["trade"],
    }
    p = os.path.join(root, "snapshot", f"{code}.json")
    json.dump(out, open(p, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    index.append({**out["meta"], "rentCount": len(reg["rent"]), "tradeCount": len(reg["trade"])})
    print(code, len(reg["cxl"]), "complexes", len(reg["rent"]), "rent", len(reg["trade"]), "trade", os.path.getsize(p) // 1024, "KB")

json.dump(index, open(os.path.join(root, "snapshot", "index.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

reg_src = os.path.join(src, "regions.json")
if os.path.exists(reg_src):
    regs = json.load(open(reg_src, encoding="utf-8"))
    json.dump(regs, open(os.path.join(root, "regions.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print("regions", sum(len(x["sgg"]) for x in regs))
