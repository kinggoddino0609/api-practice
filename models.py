from sqlalchemy import Column, Float, Integer, String

from database import Base


class Record(Base):
    __tablename__ = "records"

    id = Column(Integer, primary_key=True, index=True)

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
