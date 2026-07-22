# 마이 헬스 로그 API

건강 기록(체중·혈압·혈당 등)을 기록하면 BMI/혈압/혈당을 자동 분류해주는 API.

- 로컬 실행: `uvicorn main:app --reload` → `/docs`
- Docker 실행: `docker build -t my-health-log .` → `docker run -p 8000:8000 --env-file .env my-health-log`

> TODO: 기능 다 구현되면 상세 내용(엔드포인트 표, 기술스택 등) 채우기
