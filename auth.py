import os
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from dotenv import load_dotenv
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

import models
from database import get_db

load_dotenv()

SECRET_KEY = os.environ["SECRET_KEY"]
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")


CHOSEONG = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
            "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"]
JUNGSEONG = ["ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅘ",
             "ㅙ", "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ"]
JONGSEONG = ["", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ",
             "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ",
             "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"]

# 2벌식 자판에서 각 자모를 입력할 때 눌러야 하는 영문 키
JAMO_TO_QWERTY_KEY = {
    "ㄱ": "r", "ㄲ": "R", "ㄴ": "s", "ㄷ": "e", "ㄸ": "E", "ㄹ": "f", "ㅁ": "a",
    "ㅂ": "q", "ㅃ": "Q", "ㅅ": "t", "ㅆ": "T", "ㅇ": "d", "ㅈ": "w", "ㅉ": "W",
    "ㅊ": "c", "ㅋ": "z", "ㅌ": "x", "ㅍ": "v", "ㅎ": "g",
    "ㅏ": "k", "ㅐ": "o", "ㅑ": "i", "ㅒ": "O", "ㅓ": "j", "ㅔ": "p", "ㅕ": "u",
    "ㅖ": "P", "ㅗ": "h", "ㅛ": "y", "ㅜ": "n", "ㅠ": "b", "ㅡ": "m", "ㅣ": "l",
    "ㅘ": "hk", "ㅙ": "ho", "ㅚ": "hl", "ㅝ": "nj", "ㅞ": "np", "ㅟ": "nl", "ㅢ": "ml",
    "ㄳ": "rt", "ㄵ": "sw", "ㄶ": "sg", "ㄺ": "fr", "ㄻ": "fa", "ㄼ": "fq",
    "ㄽ": "ft", "ㄾ": "fx", "ㄿ": "fv", "ㅀ": "fg", "ㅄ": "qt"
}


def hangul_to_qwerty(text: str) -> str:
    """한글을 2벌식 자판으로 쳤을 때 나오는 영문 키 입력값으로 변환한다 (한/영 전환을 깜빡했을 때 대비)."""
    result = []

    for char in text:
        code = ord(char) - 0xAC00

        if 0 <= code <= 11171:
            cho = CHOSEONG[code // (21 * 28)]
            jung = JUNGSEONG[(code % (21 * 28)) // 28]
            jong = JONGSEONG[code % 28]
            result.append(JAMO_TO_QWERTY_KEY[cho])
            result.append(JAMO_TO_QWERTY_KEY[jung])
            if jong:
                result.append(JAMO_TO_QWERTY_KEY[jong])
        else:
            result.append(char)

    return "".join(result)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def hash_password_variants(password: str) -> tuple[str, str | None]:
    """비밀번호와, 한/영 전환을 깜빡하고 쳤을 때의 대체 입력값을 함께 해싱해 반환한다."""
    primary = hash_password(password)
    alt_plain = hangul_to_qwerty(password)

    if alt_plain == password:
        return primary, None

    return primary, hash_password(alt_plain)


def verify_password(password: str, hashed_password: str, hashed_password_alt: str | None = None) -> bool:
    if bcrypt.checkpw(password.encode("utf-8"), hashed_password.encode("utf-8")):
        return True

    if hashed_password_alt:
        return bcrypt.checkpw(password.encode("utf-8"), hashed_password_alt.encode("utf-8"))

    return False


def create_access_token(email: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": email, "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> models.Staff:
    credentials_exception = HTTPException(
        status_code=401,
        detail="인증 정보가 유효하지 않습니다.",
        headers={"WWW-Authenticate": "Bearer"}
    )

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email = payload.get("sub")

        if email is None:
            raise credentials_exception
    except jwt.PyJWTError:
        raise credentials_exception

    user = db.query(models.Staff).filter(models.Staff.email == email).first()

    if user is None:
        raise credentials_exception

    return user


def get_current_admin(
    current_user: models.Staff = Depends(get_current_user)
) -> models.Staff:
    if current_user.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="관리자만 접근할 수 있습니다."
        )

    return current_user
