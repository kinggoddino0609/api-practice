"""로컬 테스트/UI 확인용 더미 데이터 생성 스크립트.

사용법: python seed.py
health.db가 비어있을 때만 동작합니다 (이미 데이터가 있으면 건너뜁니다).
"""
import json
import random
from datetime import date, timedelta

import auth
import models
from database import Base, SessionLocal, engine
from main import RecordIn, analyze_health

SURNAMES = ["김", "이", "박", "최", "정", "강", "조", "윤", "장", "임", "한", "오", "서", "신", "권"]
GIVEN_FIRST = ["민", "서", "도", "지", "하", "유", "준", "현", "수", "은", "재", "선", "우", "시", "연"]
GIVEN_SECOND = ["준", "연", "우", "윤", "진", "호", "아", "빈", "율", "경", "훈", "영", "은", "서", "현"]


def get_or_create_staff(db, email, password, name, role):
    staff = db.query(models.Staff).filter(models.Staff.email == email).first()
    if staff:
        return staff

    staff = models.Staff(
        email=email,
        hashed_password=auth.hash_password(password),
        name=name,
        role=role
    )
    db.add(staff)
    db.commit()
    db.refresh(staff)
    return staff


def create_patient(db, name, phone, birth_date, gender):
    patient = models.Patient(
        name=name,
        phone=phone,
        phone_last4=phone[-4:],
        birth_date=birth_date,
        gender=gender
    )
    db.add(patient)
    db.commit()
    db.refresh(patient)
    return patient


def add_record(db, patient_id, staff_id, days_ago, weight, height, systolic, diastolic,
                blood_sugar, steps=0, sleep_hours=0.0, memo=""):
    record_date = (date.today() - timedelta(days=days_ago)).isoformat()
    record_in = RecordIn(
        date=record_date,
        weight=weight,
        height=height,
        systolic=systolic,
        diastolic=diastolic,
        blood_sugar=blood_sugar,
        steps=steps,
        sleep_hours=sleep_hours,
        memo=memo
    )
    analysis = analyze_health(record_in)

    record = models.Record(
        **record_in.model_dump(),
        patient_id=patient_id,
        recorded_by=staff_id,
        bmi=analysis["bmi"],
        bmi_category=analysis["bmi_category"],
        bp_category=analysis["bp_category"],
        sugar_category=analysis["sugar_category"],
        warnings=json.dumps(analysis["warnings"], ensure_ascii=False)
    )
    db.add(record)
    db.commit()


def random_name():
    return random.choice(SURNAMES) + random.choice(GIVEN_FIRST) + random.choice(GIVEN_SECOND)


def random_phone():
    return f"010-{random.randint(1000, 9999)}-{random.randint(1000, 9999)}"


def random_birth_date():
    year = random.randint(1945, 2005)
    month = random.randint(1, 12)
    day = random.randint(1, 28)
    return f"{year:04d}-{month:02d}-{day:02d}"


def create_bulk_patients(db, staff_ids, count):
    for _ in range(count):
        patient = create_patient(db, random_name(), random_phone(), random_birth_date(),
                                  random.choice(["M", "F"]))

        if random.random() >= 0.7:
            continue  # 30%는 등록만 하고 진료 기록 없음 (실제 병원처럼)

        num_records = random.randint(1, 6)
        base_weight = random.uniform(50, 95)
        height = round(random.uniform(155, 185), 1)

        for i in range(num_records):
            days_ago = (num_records - i) * random.randint(10, 30)
            weight = round(base_weight + random.uniform(-3, 3), 1)
            add_record(
                db, patient.id, random.choice(staff_ids), days_ago,
                weight, height,
                systolic=random.randint(105, 155),
                diastolic=random.randint(65, 98),
                blood_sugar=random.randint(75, 140),
                steps=random.randint(1000, 12000),
                sleep_hours=round(random.uniform(4.5, 8.5), 1)
            )


def main():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    if db.query(models.Patient).first() is not None:
        print("이미 환자 데이터가 있어서 건너뜁니다. 깨끗하게 다시 채우려면 health.db를 지우고 실행하세요.")
        db.close()
        return

    nurse = get_or_create_staff(db, "nurse1@example.com", "nurse1234", "김간호", "nurse")
    doctor = get_or_create_staff(db, "doctor1@example.com", "doctor1234", "박의사", "doctor")

    # 1. 홍길동 - 고혈압 악화 추세
    p1 = create_patient(db, "홍길동", "010-1234-5678", "1975-03-15", "M")
    add_record(db, p1.id, nurse.id, 60, 78, 175, 128, 82, 98, steps=6000, sleep_hours=6.5)
    add_record(db, p1.id, nurse.id, 45, 79, 175, 132, 85, 101, steps=5500, sleep_hours=6.0)
    add_record(db, p1.id, doctor.id, 30, 80, 175, 138, 88, 105, steps=4800, sleep_hours=5.8, memo="혈압 관리 필요")
    add_record(db, p1.id, doctor.id, 15, 81, 175, 144, 92, 110, steps=4200, sleep_hours=5.5, memo="고혈압 약물 상담")
    add_record(db, p1.id, doctor.id, 1, 82, 175, 148, 94, 115, steps=4000, sleep_hours=5.5, memo="약 처방, 2주 후 재방문")

    # 2. 김영희 - 전반적으로 건강
    p2 = create_patient(db, "김영희", "010-2222-3333", "1990-11-02", "F")
    add_record(db, p2.id, nurse.id, 40, 55, 162, 110, 70, 88, steps=9000, sleep_hours=7.5)
    add_record(db, p2.id, nurse.id, 20, 54, 162, 108, 68, 85, steps=9500, sleep_hours=7.8)
    add_record(db, p2.id, nurse.id, 2, 54.5, 162, 112, 72, 87, steps=8800, sleep_hours=7.2)

    # 3. 이철수 - 비만 + 당뇨 의심, 경고 다중 발생
    p3 = create_patient(db, "이철수", "010-4444-5555", "1968-07-20", "M")
    add_record(db, p3.id, doctor.id, 50, 95, 172, 142, 90, 128, steps=3000, sleep_hours=6.0, memo="비만, 당뇨 전단계")
    add_record(db, p3.id, doctor.id, 25, 97, 172, 145, 92, 132, steps=2800, sleep_hours=5.5)
    add_record(db, p3.id, doctor.id, 3, 98, 172, 150, 95, 138, steps=2500, sleep_hours=5.0, memo="식이조절 시급, 내분비내과 의뢰")

    # 4. 박민지 - 체중 감량 중, 전반적 개선 추세
    p4 = create_patient(db, "박민지", "010-6666-7777", "1985-05-10", "F")
    add_record(db, p4.id, nurse.id, 70, 68, 165, 122, 80, 102, steps=5000, sleep_hours=6.5)
    add_record(db, p4.id, nurse.id, 40, 65, 165, 118, 78, 96, steps=7000, sleep_hours=7.0)
    add_record(db, p4.id, nurse.id, 10, 62, 165, 114, 74, 92, steps=8500, sleep_hours=7.2, memo="꾸준한 운동으로 체중 감량 중")

    # 5. 최준호 - 고령, 경계성(주의) 수치
    p5 = create_patient(db, "최준호", "010-8888-9999", "1955-01-30", "M")
    add_record(db, p5.id, doctor.id, 30, 70, 168, 135, 86, 118, steps=3500, sleep_hours=6.0, memo="정기 검진")
    add_record(db, p5.id, doctor.id, 5, 71, 168, 130, 84, 120, steps=3800, sleep_hours=6.2)

    # 6. 정하늘 - 첫 방문, 기록 1건뿐 (단일 포인트 차트 케이스)
    p6 = create_patient(db, "정하늘", "010-1111-2222", "1998-09-05", "F")
    add_record(db, p6.id, nurse.id, 0, 58, 160, 105, 68, 80, steps=6000, sleep_hours=7.0, memo="첫 방문")

    # 7. 강태양 - 등록만 하고 진료 기록 없음 (빈 상태 케이스)
    create_patient(db, "강태양", "010-3333-4444", "1992-12-25", "M")

    # 8~100. 나머지는 랜덤 생성 (페이지네이션 테스트용 물량)
    random.seed(42)
    create_bulk_patients(db, [nurse.id, doctor.id], count=93)

    db.close()

    print("더미 데이터 생성 완료! (환자 100명)")
    print("추가 로그인 계정 (일반 직원):")
    print("  nurse1@example.com  / nurse1234")
    print("  doctor1@example.com / doctor1234")


if __name__ == "__main__":
    main()
