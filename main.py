import json
import os
from datetime import date as Date
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

import auth
import models
from database import Base, SessionLocal, engine, get_db


app = FastAPI(
    title="마이 헬스 로그 API",
    version="2.0.0"
)

Base.metadata.create_all(bind=engine)

app.mount("/app", StaticFiles(directory="static", html=True), name="static")


def bootstrap_admin():
    """Staff 계정이 하나도 없으면 .env의 ADMIN_EMAIL/ADMIN_PASSWORD로 최초 admin 계정을 만든다."""
    db = SessionLocal()
    try:
        if db.query(models.Staff).first() is not None:
            return

        admin_email = os.environ.get("ADMIN_EMAIL")
        admin_password = os.environ.get("ADMIN_PASSWORD")

        if not admin_email or not admin_password:
            return

        admin = models.Staff(
            email=admin_email,
            hashed_password=auth.hash_password(admin_password),
            name="관리자",
            role="admin"
        )
        db.add(admin)
        db.commit()
    finally:
        db.close()


bootstrap_admin()


class StaffCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    name: str
    role: Literal["admin", "staff"] = "staff"


class Token(BaseModel):
    access_token: str
    token_type: str


class PatientCreate(BaseModel):
    name: str
    phone: str
    birth_date: str
    gender: str


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


def staff_to_dict(staff: models.Staff):
    return {
        "id": staff.id,
        "email": staff.email,
        "name": staff.name,
        "role": staff.role
    }


def patient_to_dict(patient: models.Patient):
    return {
        "id": patient.id,
        "name": patient.name,
        "phone": patient.phone,
        "birth_date": patient.birth_date,
        "gender": patient.gender
    }


def record_to_dict(record: models.Record):
    return {
        "id": record.id,
        "patient_id": record.patient_id,
        "recorded_by": record.recorded_by,
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


def get_patient_or_404(patient_id: int, db: Session) -> models.Patient:
    patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()

    if not patient:
        raise HTTPException(
            status_code=404,
            detail="해당 환자를 찾을 수 없습니다."
        )

    return patient


@app.get("/")
def read_root():
    return {"message": "마이 헬스 로그 API"}


@app.post("/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    staff = db.query(models.Staff).filter(models.Staff.email == form_data.username).first()

    if not staff or not auth.verify_password(form_data.password, staff.hashed_password):
        raise HTTPException(
            status_code=401,
            detail="이메일 또는 비밀번호가 올바르지 않습니다.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    access_token = auth.create_access_token(staff.email)

    return {"access_token": access_token, "token_type": "bearer"}


@app.get("/me")
def get_me(current_user: models.Staff = Depends(auth.get_current_user)):
    return staff_to_dict(current_user)


@app.post("/staff")
def create_staff(
    staff: StaffCreate,
    db: Session = Depends(get_db),
    current_admin: models.Staff = Depends(auth.get_current_admin)
):
    existing = db.query(models.Staff).filter(models.Staff.email == staff.email).first()

    if existing:
        raise HTTPException(
            status_code=400,
            detail="이미 등록된 이메일입니다."
        )

    new_staff = models.Staff(
        email=staff.email,
        hashed_password=auth.hash_password(staff.password),
        name=staff.name,
        role=staff.role
    )

    db.add(new_staff)
    db.commit()
    db.refresh(new_staff)

    return staff_to_dict(new_staff)


@app.get("/staff")
def list_staff(
    db: Session = Depends(get_db),
    current_admin: models.Staff = Depends(auth.get_current_admin)
):
    staff_list = db.query(models.Staff).all()

    return {
        "count": len(staff_list),
        "staff": [staff_to_dict(s) for s in staff_list]
    }


@app.delete("/staff/{staff_id}")
def delete_staff(
    staff_id: int,
    db: Session = Depends(get_db),
    current_admin: models.Staff = Depends(auth.get_current_admin)
):
    if staff_id == current_admin.id:
        raise HTTPException(
            status_code=400,
            detail="본인 계정은 삭제할 수 없습니다."
        )

    staff = db.query(models.Staff).filter(models.Staff.id == staff_id).first()

    if not staff:
        raise HTTPException(
            status_code=404,
            detail="해당 직원을 찾을 수 없습니다."
        )

    db.delete(staff)
    db.commit()

    return {"message": "직원 계정이 삭제되었습니다."}


@app.post("/patients")
def create_patient(
    patient: PatientCreate,
    db: Session = Depends(get_db),
    current_user: models.Staff = Depends(auth.get_current_user)
):
    new_patient = models.Patient(
        name=patient.name,
        phone=patient.phone,
        phone_last4=patient.phone[-4:],
        birth_date=patient.birth_date,
        gender=patient.gender
    )

    db.add(new_patient)
    db.commit()
    db.refresh(new_patient)

    return patient_to_dict(new_patient)


@app.get("/patients/search")
def search_patients(
    name: str,
    phone_last4: str,
    db: Session = Depends(get_db),
    current_user: models.Staff = Depends(auth.get_current_user)
):
    results = db.query(models.Patient).filter(
        models.Patient.name == name,
        models.Patient.phone_last4 == phone_last4
    ).all()

    return {
        "count": len(results),
        "patients": [patient_to_dict(p) for p in results]
    }


@app.get("/patients")
def list_patients(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: models.Staff = Depends(auth.get_current_user)
):
    total = db.query(models.Patient).count()
    patients = (
        db.query(models.Patient)
        .order_by(models.Patient.id)
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return {
        "count": total,
        "page": page,
        "page_size": page_size,
        "patients": [patient_to_dict(p) for p in patients]
    }


@app.get("/patients/{patient_id}")
def get_patient(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user: models.Staff = Depends(auth.get_current_user)
):
    patient = get_patient_or_404(patient_id, db)
    return patient_to_dict(patient)


@app.post("/patients/{patient_id}/records")
def create_record(
    patient_id: int,
    record: RecordIn,
    db: Session = Depends(get_db),
    current_user: models.Staff = Depends(auth.get_current_user)
):
    get_patient_or_404(patient_id, db)
    analysis = analyze_health(record)

    new_record = models.Record(
        **record.model_dump(),
        patient_id=patient_id,
        recorded_by=current_user.id,
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


@app.get("/patients/{patient_id}/records")
def get_records(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user: models.Staff = Depends(auth.get_current_user)
):
    get_patient_or_404(patient_id, db)
    records = db.query(models.Record).filter(models.Record.patient_id == patient_id).all()

    return {
        "count": len(records),
        "records": [record_to_dict(record) for record in records]
    }


@app.get("/patients/{patient_id}/records/{record_id}")
def get_record(
    patient_id: int,
    record_id: int,
    db: Session = Depends(get_db),
    current_user: models.Staff = Depends(auth.get_current_user)
):
    get_patient_or_404(patient_id, db)
    record = db.query(models.Record).filter(
        models.Record.id == record_id,
        models.Record.patient_id == patient_id
    ).first()

    if not record:
        raise HTTPException(
            status_code=404,
            detail="해당 기록을 찾을 수 없습니다."
        )

    return record_to_dict(record)


@app.put("/patients/{patient_id}/records/{record_id}")
def update_record(
    patient_id: int,
    record_id: int,
    record: RecordIn,
    db: Session = Depends(get_db),
    current_user: models.Staff = Depends(auth.get_current_user)
):
    get_patient_or_404(patient_id, db)
    existing = db.query(models.Record).filter(
        models.Record.id == record_id,
        models.Record.patient_id == patient_id
    ).first()

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


@app.delete("/patients/{patient_id}/records/{record_id}")
def delete_record(
    patient_id: int,
    record_id: int,
    db: Session = Depends(get_db),
    current_user: models.Staff = Depends(auth.get_current_user)
):
    get_patient_or_404(patient_id, db)
    record = db.query(models.Record).filter(
        models.Record.id == record_id,
        models.Record.patient_id == patient_id
    ).first()

    if not record:
        raise HTTPException(
            status_code=404,
            detail="해당 기록을 찾을 수 없습니다."
        )

    db.delete(record)
    db.commit()

    return {"message": "기록이 삭제되었습니다."}


@app.get("/patients/{patient_id}/records/search")
def search_records(
    patient_id: int,
    start: str | None = None,
    end: str | None = None,
    db: Session = Depends(get_db),
    current_user: models.Staff = Depends(auth.get_current_user)
):
    get_patient_or_404(patient_id, db)

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

    query = db.query(models.Record).filter(models.Record.patient_id == patient_id)

    if start:
        query = query.filter(models.Record.date >= start)

    if end:
        query = query.filter(models.Record.date <= end)

    result = query.all()

    return {
        "count": len(result),
        "records": [record_to_dict(record) for record in result]
    }


@app.get("/patients/{patient_id}/stats")
def get_stats(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user: models.Staff = Depends(auth.get_current_user)
):
    get_patient_or_404(patient_id, db)
    base_query = db.query(models.Record).filter(models.Record.patient_id == patient_id)
    count = base_query.count()

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
    ).filter(models.Record.patient_id == patient_id).first()

    avg_weight, avg_bmi, avg_steps, avg_sleep_hours = averages

    return {
        "count": count,
        "average_weight": round(avg_weight, 2),
        "average_bmi": round(avg_bmi, 2),
        "average_steps": round(avg_steps, 2),
        "average_sleep_hours": round(avg_sleep_hours, 2)
    }
