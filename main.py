import json
from datetime import date as Date
from pathlib import Path

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field


app = FastAPI(
    title="마이 헬스 로그 API",
    version="1.0.0"
)


DATA_FILE = Path(__file__).resolve().parent / "data.json"


class RecordIn(BaseModel):
    date: str
    weight: float = Field(gt=0)
    height: float = Field(gt=0)
    systolic: int = Field(gt=0)
    diastolic: int = Field(gt=0)
    blood_sugar: int = Field(ge=0)
    steps: int = Field(default=0, ge=0)
    sleep_hours: float = Field(default=0.0, ge=0)
    memo: str = ""


def load_records():
    if not DATA_FILE.exists():
        return []

    try:
        with open(DATA_FILE, "r", encoding="utf-8") as file:
            data = json.load(file)
            return data if isinstance(data, list) else []
    except (json.JSONDecodeError, OSError):
        return []


def save_records():
    with open(DATA_FILE, "w", encoding="utf-8") as file:
        json.dump(records, file, ensure_ascii=False, indent=2)


records = load_records()
next_id = max(
    (record.get("id", 0) for record in records),
    default=0
) + 1


def analyze_health(record: RecordIn):
    height_m = record.height / 100
    bmi = round(record.weight / (height_m ** 2), 2)

    if bmi < 18.5:
        bmi_category = "저체중"
    elif bmi < 23:
        bmi_category = "정상"
    elif bmi < 25:
        bmi_category = "과체중"
    else:
        bmi_category = "비만"

    if record.systolic < 120 and record.diastolic < 80:
        bp_category = "정상"
    elif record.systolic >= 140 or record.diastolic >= 90:
        bp_category = "고혈압"
    else:
        bp_category = "주의"

    if record.blood_sugar < 100:
        sugar_category = "정상"
    elif record.blood_sugar < 126:
        sugar_category = "공복혈당장애"
    else:
        sugar_category = "당뇨 의심"

    warnings = []

    if bmi_category == "비만":
        warnings.append("BMI가 비만 범위입니다.")

    if bp_category == "고혈압":
        warnings.append("혈압이 고혈압 범위입니다.")

    if sugar_category == "당뇨 의심":
        warnings.append("공복 혈당이 당뇨 의심 범위입니다.")

    return {
        "bmi": bmi,
        "bmi_category": bmi_category,
        "bp_category": bp_category,
        "sugar_category": sugar_category,
        "warnings": warnings
    }


@app.get("/")
def read_root():
    return {"message": "마이 헬스 로그 API"}


@app.post("/records")
def create_record(record: RecordIn):
    global next_id

    new_record = {
        "id": next_id,
        **record.model_dump(),
        **analyze_health(record)
    }

    records.append(new_record)
    save_records()
    next_id += 1

    return new_record


@app.get("/records")
def get_records():
    return {
        "count": len(records),
        "records": records
    }


@app.get("/records/{record_id}")
def get_record(record_id: int):
    for record in records:
        if record["id"] == record_id:
            return record

    raise HTTPException(
        status_code=404,
        detail="해당 기록을 찾을 수 없습니다."
    )


@app.put("/records/{record_id}")
def update_record(record_id: int, record: RecordIn):
    for index, old_record in enumerate(records):
        if old_record["id"] == record_id:
            updated_record = {
                "id": record_id,
                **record.model_dump(),
                **analyze_health(record)
            }

            records[index] = updated_record
            save_records()

            return updated_record

    raise HTTPException(
        status_code=404,
        detail="해당 기록을 찾을 수 없습니다."
    )


@app.delete("/records/{record_id}")
def delete_record(record_id: int):
    for index, record in enumerate(records):
        if record["id"] == record_id:
            records.pop(index)
            save_records()

            return {"message": "기록이 삭제되었습니다."}

    raise HTTPException(
        status_code=404,
        detail="해당 기록을 찾을 수 없습니다."
    )


@app.get("/search")
def search_records(
    start: str | None = None,
    end: str | None = None
):
    try:
        start_date = Date.fromisoformat(start) if start else None
        end_date = Date.fromisoformat(end) if end else None
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="날짜는 YYYY-MM-DD 형식으로 입력해주세요."
        )

    result = []

    for record in records:
        record_date = Date.fromisoformat(record["date"])

        if start_date and record_date < start_date:
            continue

        if end_date and record_date > end_date:
            continue

        result.append(record)

    return {
        "count": len(result),
        "records": result
    }


@app.get("/stats")
def get_stats():
    if not records:
        return {
            "count": 0,
            "average_weight": 0,
            "average_bmi": 0,
            "average_steps": 0,
            "average_sleep_hours": 0
        }

    count = len(records)

    return {
        "count": count,
        "average_weight": round(
            sum(record["weight"] for record in records) / count,
            2
        ),
        "average_bmi": round(
            sum(record["bmi"] for record in records) / count,
            2
        ),
        "average_steps": round(
            sum(record["steps"] for record in records) / count,
            2
        ),
        "average_sleep_hours": round(
            sum(record["sleep_hours"] for record in records) / count,
            2
        )
    }