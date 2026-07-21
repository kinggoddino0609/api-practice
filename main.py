from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(
    title="마이 헬스 로그 API",
    version="1.0.0"
)

records = []
next_id = 1


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
    next_id +=1

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
            return {"message": "기록이 삭제되었습니다."}

    raise HTTPException(
        status_code=404,
        detail="해당 기록을 찾을 수 없습니다."
    )