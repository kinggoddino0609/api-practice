from sqlalchemy import Column, Float, ForeignKey, Integer, String

from database import Base


class Staff(Base):
    __tablename__ = "staff"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    hashed_password_alt = Column(String, nullable=True)
    name = Column(String, nullable=False)
    role = Column(String, nullable=False)  # "admin" | "doctor" | "nurse"


class Patient(Base):
    __tablename__ = "patients"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    phone = Column(String, nullable=False)
    phone_last4 = Column(String, nullable=False, index=True)
    birth_date = Column(String, nullable=False)
    gender = Column(String, nullable=False)


class Record(Base):
    __tablename__ = "records"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False, index=True)
    recorded_by = Column(Integer, ForeignKey("staff.id"), nullable=False)

    date = Column(String, nullable=False, index=True)
    weight = Column(Float, nullable=False)
    height = Column(Float, nullable=False)
    systolic = Column(Integer, nullable=False)
    diastolic = Column(Integer, nullable=False)
    blood_sugar = Column(Integer, nullable=False)
    steps = Column(Integer, default=0)
    sleep_hours = Column(Float, default=0.0)
    memo = Column(String, default="")

    bmi = Column(Float, nullable=False)
    bmi_category = Column(String, nullable=False)
    bp_category = Column(String, nullable=False)
    sugar_category = Column(String, nullable=False)
    warnings = Column(String, nullable=False, default="[]")


class Appointment(Base):
    __tablename__ = "appointments"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False, index=True)
    staff_id = Column(Integer, ForeignKey("staff.id"), nullable=False, index=True)

    date = Column(String, nullable=False, index=True)
    time = Column(String, nullable=False)
    reason = Column(String, default="")
    status = Column(String, nullable=False, default="예정")  # "예정" | "완료" | "취소"
