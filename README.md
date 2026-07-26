# 🦖 공룡 병원 — 통합 환자 차트 관리 시스템

> 병원 직원(원장·의사·간호사)이 환자를 등록하고, 진료 기록을 남기고, 예약을 관리하며, 병원 운영 현황을 한눈에 파악할 수 있는 웹 기반 환자 차트 관리 시스템입니다.
>
> 처음엔 "체중·혈압·혈당을 기록하면 자동으로 분류해주는" 개인용 건강 기록 API 과제로 시작했지만, 여러 직원이 함께 쓰는 실제 병원 워크플로우(등록 → 진료 → 예약 → 통계)를 구현해보고 싶어서 병원 환자 차트 시스템으로 확장했습니다.

<br>

## 📋 목차

- [주요 기능](#-주요-기능)
- [화면 미리보기](#-화면-미리보기)
- [기술 스택](#-기술-스택)
- [API 엔드포인트](#-api-엔드포인트)
- [실행 방법](#-실행-방법)
- [테스트 계정](#-테스트-계정)
- [프로젝트 구조](#-프로젝트-구조)

<br>

## ✨ 주요 기능

### 인증 · 권한
- 회원가입 없이, **관리자(원장)가 발급한 계정으로만 로그인**하는 보안 체계
- 로그인은 이메일이 아니라 **이름**으로, 비밀번호는 **한글 입력 / 2벌식 영타 입력을 모두 인식** (한영키 잘못 눌러도 로그인 가능)
- **원장 / 의사 / 간호사** 역할에 따라 보이는 화면과 호출 가능한 기능이 다름

### 환자 관리
- 이름 + 전화번호 뒷 4자리로 환자 검색, 없으면 그 자리에서 바로 등록
- 전체 환자 목록 페이지네이션(10명씩)

### 진료 기록
- 체중 · 키 · 혈압 · 공복혈당 · 걸음 수 · 수면 시간 · 소견 입력
- **BMI 자동 계산** 및 BMI/혈압/공복혈당 **자동 분류(정상·주의·위험)** + 경고 메시지
- 위험 기록은 표 전체가 옅은 붉은색으로 강조
- 최근 8건 **추이 그래프**(BMI / 혈압 / 혈당 탭 전환), 정상·주의·위험 구간을 배경색으로 켜고 끌 수 있음
- 소견/메모는 아이콘으로 표시되고, 클릭하면 팝오버로 전체 내용 확인
- 진료 기록 7개씩 페이지네이션

### 예약 관리
- 환자 차트에서 담당 의료진 · 날짜 · 시간 · 사유로 예약 등록
- "예약 현황" 탭에서 의사 6명을 카드로 보여주고, 각 카드에 오늘/이번달 예약 건수 표시 → 클릭해서 그 의사의 달력·예약 목록 확인
- 의사 본인 로그인 시에는 본인 예약만 자동으로 보임

### 직원 관리 (원장 전용)
- 이름 + 직급만 입력하면 계정 발급 (비밀번호는 "이름+1234"로 자동 생성)
- 발급한 계정 목록, 직급별 인원 수 색상 칩으로 표시
- 필요 없는 계정 해고(삭제)

### 병원 통계 (원장 전용)
- 전체 환자·직원 수, 이번달 진료 건수, 예약 현황
- 위험군(비만·고혈압·당뇨의심) 인원 현황
- 최근 14일 진료 추이 그래프
- 의사별 이번달 진료 순위

<br>

## 🖼 화면 미리보기

> 아래 이미지는 준비 중입니다. `docs/screenshots/` 폴더에 캡처 이미지를 추가한 뒤 각 항목의 `이미지 경로` 부분만 채워 넣으면 바로 보입니다.

<details>
<summary><b>로그인 화면</b></summary>
<br>

이름 + 비밀번호로 로그인, 우측에 테스트 계정 안내 패널 포함

`![로그인 화면](docs/screenshots/login.png)`

</details>

<details>
<summary><b>환자 관리</b></summary>
<br>

이름 + 전화번호 뒷자리로 환자 검색/등록, 전체 환자 목록

`![환자 관리](docs/screenshots/patients.png)`

</details>

<details>
<summary><b>환자 차트 (진료 기록)</b></summary>
<br>

오늘의 요약 카드, 진료 기록 추가 폼, BMI/혈압/혈당 추이 그래프, 분류 기준 참고표

`![환자 차트](docs/screenshots/chart.png)`

</details>

<details>
<summary><b>예약 현황</b></summary>
<br>

의사별 카드(오늘/이번달 예약 건수), 달력, 예약 목록

`![예약 현황](docs/screenshots/appointments.png)`

</details>

<details>
<summary><b>직원 관리 (원장 전용)</b></summary>
<br>

계정 발급 폼, 직급별 인원 현황, 직원 목록

`![직원 관리](docs/screenshots/staff.png)`

</details>

<details>
<summary><b>병원 통계 (원장 전용)</b></summary>
<br>

병원 현황 카드, 위험군 현황, 진료 추이 그래프, 의사별 순위

`![병원 통계](docs/screenshots/stats.png)`

</details>

<br>

## 🛠 기술 스택

| 구분 | 스택 |
|---|---|
| Backend | FastAPI, SQLAlchemy, Pydantic |
| Database | SQLite |
| 인증 | JWT(PyJWT), bcrypt |
| Frontend | HTML / CSS / Vanilla JavaScript (프레임워크 없음) |
| 배포 | Docker, AWS Lightsail |

<br>

## 🔌 API 엔드포인트

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/login` | 로그인, JWT 발급 |
| GET | `/me` | 내 정보 조회 |
| POST | `/staff` | 직원 계정 발급 (원장 전용) |
| GET | `/staff` | 직원 목록 (원장 전용) |
| DELETE | `/staff/{staff_id}` | 직원 계정 삭제 (원장 전용) |
| GET | `/doctors` | 예약 등록용 의료진 목록 |
| POST | `/patients` | 환자 등록 |
| GET | `/patients/search` | 이름+전화번호 뒷자리로 환자 검색 |
| GET | `/patients` | 전체 환자 목록 (페이지네이션) |
| GET | `/patients/{patient_id}` | 환자 상세 |
| POST/GET/PUT/DELETE | `/patients/{patient_id}/appointments` | 예약 등록/조회/수정/삭제 |
| POST/GET/PUT/DELETE | `/patients/{patient_id}/records` | 진료 기록 등록/조회/수정/삭제 |
| GET | `/patients/{patient_id}/records/search` | 진료 기록 날짜 범위 검색 |
| GET | `/patients/{patient_id}/stats` | 환자별 통계 |
| GET | `/appointments` | 날짜별 전체 예약 조회 |
| GET | `/appointments/summary` | 월별 예약 집계 (달력용) |
| GET | `/stats/hospital` | 병원 통계 대시보드 (원장 전용) |

> 전체 API는 서버 실행 후 `/docs`(Swagger UI)에서 직접 테스트할 수 있습니다.

<br>

## 🚀 실행 방법

### 로컬 실행

```bash
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -r requirements.txt

# .env 파일 생성 (.env.example 참고)
# SECRET_KEY=아무-랜덤-문자열

python seed.py                 # 더미 데이터(환자 3000명 등) 생성, 최초 1회만
uvicorn main:app --reload
```

- 웹 화면: http://127.0.0.1:8000/app
- API 문서: http://127.0.0.1:8000/docs

### Docker 실행

```bash
docker build -t dino-hospital .
docker run -d -p 8000:8000 --env-file .env --name dino-hospital dino-hospital
docker exec -it dino-hospital python seed.py   # 더미 데이터 생성, 최초 1회만
```

<br>

## 🔑 테스트 계정

`seed.py` 실행 시 아래 계정이 자동 생성됩니다. (비밀번호는 한글/2벌식 영타 입력 모두 가능)

| 아이디(이름) | 비밀번호 | 역할 |
|---|---|---|
| 양종석 | 양종석1234 | 원장 |
| 김동환 외 5명 | 이름+1234 | 의사 |
| 권보람 외 8명 | 이름+1234 | 간호사 |

<br>

## 📁 프로젝트 구조

```
api-practice/
├── main.py           # FastAPI 앱, API 라우트
├── models.py          # SQLAlchemy 모델 (Staff/Patient/Record/Appointment)
├── auth.py            # 로그인/비밀번호 해싱/JWT
├── database.py        # DB 연결 설정
├── seed.py             # 더미 데이터 생성 스크립트
├── static/             # 프론트엔드 (HTML/CSS/JS)
├── requirements.txt
├── Dockerfile
└── docs_공룡병원_PRD.xlsx / docs_공룡병원_ERD.sql   # 제출용 기획 문서
```
