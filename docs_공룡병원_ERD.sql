-- 공룡 병원 환자 차트 관리 시스템 - ERD용 스키마
-- ERD Cloud(erdcloud.com) 등에서 "DDL Import" 기능으로 붙여넣으면 다이어그램이 자동 생성됩니다.

CREATE TABLE staff (
    id INT PRIMARY KEY AUTO_INCREMENT,
    email VARCHAR(255) NOT NULL UNIQUE COMMENT '로그인용 이름(아이디로 사용)',
    hashed_password VARCHAR(255) NOT NULL COMMENT '비밀번호 해시(한글 입력 기준)',
    hashed_password_alt VARCHAR(255) COMMENT '비밀번호 해시(2벌식 영타 입력 대응, nullable)',
    name VARCHAR(255) NOT NULL COMMENT '표시용 이름',
    role VARCHAR(20) NOT NULL COMMENT 'admin | doctor | nurse'
);

CREATE TABLE patients (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    phone_last4 VARCHAR(4) NOT NULL COMMENT '검색용 전화번호 뒷 4자리',
    birth_date VARCHAR(10) NOT NULL,
    gender VARCHAR(1) NOT NULL COMMENT 'M | F'
);

CREATE TABLE records (
    id INT PRIMARY KEY AUTO_INCREMENT,
    patient_id INT NOT NULL,
    recorded_by INT NOT NULL COMMENT '기록을 남긴 staff.id',
    date VARCHAR(10) NOT NULL COMMENT '측정일 YYYY-MM-DD',
    weight FLOAT NOT NULL COMMENT '체중(kg)',
    height FLOAT NOT NULL COMMENT '키(cm)',
    systolic INT NOT NULL COMMENT '수축기 혈압',
    diastolic INT NOT NULL COMMENT '이완기 혈압',
    blood_sugar INT NOT NULL COMMENT '공복혈당(mg/dL)',
    steps INT DEFAULT 0,
    sleep_hours FLOAT DEFAULT 0.0,
    memo VARCHAR(500) DEFAULT '' COMMENT '소견/메모',
    bmi FLOAT NOT NULL COMMENT '자동 계산된 BMI',
    bmi_category VARCHAR(20) NOT NULL COMMENT '저체중|정상|과체중|비만',
    bp_category VARCHAR(20) NOT NULL COMMENT '정상|주의|고혈압',
    sugar_category VARCHAR(20) NOT NULL COMMENT '정상|공복혈당장애|당뇨 의심',
    warnings VARCHAR(500) NOT NULL DEFAULT '[]' COMMENT '경고 메시지 목록(JSON)',
    FOREIGN KEY (patient_id) REFERENCES patients(id),
    FOREIGN KEY (recorded_by) REFERENCES staff(id)
);

CREATE TABLE appointments (
    id INT PRIMARY KEY AUTO_INCREMENT,
    patient_id INT NOT NULL,
    staff_id INT NOT NULL COMMENT '담당 의료진',
    date VARCHAR(10) NOT NULL,
    time VARCHAR(5) NOT NULL,
    reason VARCHAR(255) DEFAULT '',
    status VARCHAR(10) NOT NULL DEFAULT '예정' COMMENT '예정|완료|취소',
    FOREIGN KEY (patient_id) REFERENCES patients(id),
    FOREIGN KEY (staff_id) REFERENCES staff(id)
);
