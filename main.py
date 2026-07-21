import json
from datetime import date as Date

from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

import models
from database import Base, engine, get_db


app = FastAPI(
    title="마이 헬스 로그 API",
    version="1.0.0"
)

Base.metadata.create_all(bind=engine)


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


def record_to_dict(record: models.Record):
    return {
        "id": record.id,
        "date": record.date,
        "weight": record.weight,
        "height": record.height,
        "systolic": record.systolic,
        "diastolic": record.diastolic,
        "blood_sugar": record.blood_sugar,
        "steps": record.steps,
        "sleep_hours": record.sleep_hours,
        "memo": record.memo,
        "bmi": record.bmi,
        "bmi_category": record.bmi_category,
        "bp_category": record.bp_category,
        "sugar_category": record.sugar_category,
        "warnings": json.loads(record.warnings)
    }


@app.get("/")
def read_root():
    return {"message": "마이 헬스 로그 API"}


@app.post("/records")
def create_record(record: RecordIn, db: Session = Depends(get_db)):
    analysis = analyze_health(record)

    new_record = models.Record(
        **record.model_dump(),
        bmi=analysis["bmi"],
        bmi_category=analysis["bmi_category"],
        bp_category=analysis["bp_category"],
        sugar_category=analysis["sugar_category"],
        warnings=json.dumps(analysis["warnings"], ensure_ascii=False)
    )

    db.add(new_record)
    db.commit()
    db.refresh(new_record)

    return record_to_dict(new_record)


@app.get("/records")
def get_records(db: Session = Depends(get_db)):
    records = db.query(models.Record).all()

    return {
        "count": len(records),
        "records": [record_to_dict(record) for record in records]
    }


@app.get("/records/{record_id}")
def get_record(record_id: int, db: Session = Depends(get_db)):
    record = db.query(models.Record).filter(models.Record.id == record_id).first()

    if not record:
        raise HTTPException(
            status_code=404,
            detail="해당 기록을 찾을 수 없습니다."
        )

    return record_to_dict(record)


@app.put("/records/{record_id}")
def update_record(record_id: int, record: RecordIn, db: Session = Depends(get_db)):
    existing = db.query(models.Record).filter(models.Record.id == record_id).first()

    if not existing:
        raise HTTPException(
            status_code=404,
            detail="해당 기록을 찾을 수 없습니다."
        )

    analysis = analyze_health(record)

    for field, value in record.model_dump().items():
        setattr(existing, field, value)

    existing.bmi = analysis["bmi"]
    existing.bmi_category = analysis["bmi_category"]
    existing.bp_category = analysis["bp_category"]
    existing.sugar_category = analysis["sugar_category"]
    existing.warnings = json.dumps(analysis["warnings"], ensure_ascii=False)

    db.commit()
    db.refresh(existing)

    return record_to_dict(existing)


@app.delete("/records/{record_id}")
def delete_record(record_id: int, db: Session = Depends(get_db)):
    record = db.query(models.Record).filter(models.Record.id == record_id).first()

    if not record:
        raise HTTPException(
            status_code=404,
            detail="해당 기록을 찾을 수 없습니다."
        )

    db.delete(record)
    db.commit()

    return {"message": "기록이 삭제되었습니다."}


@app.get("/search")
def search_records(
    start: str | None = None,
    end: str | None = None,
    db: Session = Depends(get_db)
):
    try:
        if start:
            Date.fromisoformat(start)
        if end:
            Date.fromisoformat(end)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="날짜는 YYYY-MM-DD 형식으로 입력해주세요."
        )

    query = db.query(models.Record)

    if start:
        query = query.filter(models.Record.date >= start)

    if end:
        query = query.filter(models.Record.date <= end)

    result = query.all()

    return {
        "count": len(result),
        "records": [record_to_dict(record) for record in result]
    }


@app.get("/stats")
def get_stats(db: Session = Depends(get_db)):
    count = db.query(models.Record).count()

    if count == 0:
        return {
            "count": 0,
            "average_weight": 0,
            "average_bmi": 0,
            "average_steps": 0,
            "average_sleep_hours": 0
        }

    averages = db.query(
        func.avg(models.Record.weight),
        func.avg(models.Record.bmi),
        func.avg(models.Record.steps),
        func.avg(models.Record.sleep_hours)
    ).first()

    avg_weight, avg_bmi, avg_steps, avg_sleep_hours = averages

    return {
        "count": count,
        "average_weight": round(avg_weight, 2),
        "average_bmi": round(avg_bmi, 2),
        "average_steps": round(avg_steps, 2),
        "average_sleep_hours": round(avg_sleep_hours, 2)
    }
