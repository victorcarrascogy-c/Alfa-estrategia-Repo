#python -m uvicorn Backend.seba:app --reload
from __future__ import annotations

from fastapi import FastAPI, UploadFile, File, HTTPException, Query, Form, Response, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
import mimetypes
from pathlib import Path
from typing import Optional, List, Generator
from datetime import datetime, timedelta, date
import uuid
import re
from enum import Enum
from pydantic import BaseModel, field_validator, Field
from starlette.responses import FileResponse, StreamingResponse
import requests

from sqlalchemy import (
    create_engine, Column, Integer, String, Text, ForeignKey, DateTime, select,
    func, Date, Boolean, UniqueConstraint, Float, create_engine, case
)
from sqlalchemy.orm import declarative_base, relationship, sessionmaker, Session
from sqlalchemy.exc import IntegrityError
from sqlalchemy.engine import URL

from passlib.context import CryptContext
from jose import JWTError, jwt

import cloudinary
import cloudinary.uploader
import cloudinary.utils
# ----------------------------
# Core configuration (auth, CORS, files, DB)
# ----------------------------

SECRET_KEY = "COLEGIO_ARZOBISPADO" 
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")

print(pwd.hash("clave1234"))

def verify_password(plain: str, password_hash: str) -> bool:
    """Check a plaintext password against a bcrypt hash."""
    return pwd_context.verify(plain, password_hash)

def get_password_hash(password: str) -> str:
    """Generate a bcrypt hash for a password."""
    return pwd_context.hash(password)

def create_access_token(data: dict, minutes: int = ACCESS_TOKEN_EXPIRE_MINUTES) -> str:
    """Issue a short-lived JWT embedding the payload and an exp claim."""
    to_encode = data.copy()
    to_encode["exp"] = datetime.utcnow() + timedelta(minutes=minutes)
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

Base = declarative_base()
app = FastAPI(title="Strategic Plan API (DB-backed)")

# Allow browser apps to call the API during local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    """Create DB tables and ensure upload folder exists on startup."""
    Base.metadata.create_all(bind=engine)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

cloudinary.config( 
  cloud_name = "drwbiyolo", 
  api_key = "134946251886415", 
  api_secret = "oisJ4SVzs9FqB7vLkcBSeEw-2Uc",
  secure = True
)
UPLOAD_DIR = Path("./uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# --- DB (AWS MySQL - ALPHA) ---
DATABASE_URL = (
    "mysql+pymysql://app_alpha_dev:"
    "Alpha%402025.DevHub%21"
    "@dev-db-alpha.unabdevhub.cl:3306/alpha_dev"
)

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,          
    pool_recycle=1800,           
    future=True,
    connect_args={
        "ssl": {}   
    },
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency that yields a SQLAlchemy session with commit/rollback."""
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> "UserModel":
    """
    (Dependency) Decode JWT, load the user, and ensure the account is active.
    Raises 401 HTTPException if invalid.
    """
    cred_exc = HTTPException(status_code=401, detail="No autorizado")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        uid = payload.get("uid")
        if uid is None:
            raise cred_exc
    except JWTError:
        raise cred_exc
    user = db.get(UserModel, uid)
    if not user or not user.is_active:
        raise cred_exc
    return user

def require_role(*roles: str):
    """
    (Dependency Factory) Restricts a route to specific user roles.
    Raises 403 HTTPException if the user role is not allowed.
    """
    def _dep(user: "UserModel" = Depends(get_current_user)) -> "UserModel":
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="Permisos insuficientes")
        return user
    return _dep

# ----------------------------
# Helpers and validators
# ----------------------------

def _dv_mod11(num: str) -> str:
    """Compute Chilean RUT check digit using mod-11."""
    serie = [2,3,4,5,6,7]
    s, i = 0, 0
    for d in reversed(num):
        s += int(d) * serie[i % len(serie)]
        i += 1
    resto = 11 - (s % 11)
    if resto == 11: return "0"
    if resto == 10: return "K"
    return str(resto)

def normalize_rut(rut: str) -> str:
    """Normalize and validate a RUT; return digits+DV without separators."""
    s = re.sub(r"[^0-9kK]", "", rut or "")
    if len(s) < 2:
        raise HTTPException(status_code=400, detail="RUT inválido")
    cuerpo, dv = s[:-1], s[-1].upper()
    if not cuerpo.isdigit():
        raise HTTPException(status_code=400, detail="RUT inválido")
    if _dv_mod11(cuerpo) != dv:
        raise HTTPException(status_code=401, detail="Credenciales inválidas")
    return cuerpo + dv

def asdict(model: BaseModel) -> dict:
    """Compatible way to turn Pydantic v1/v2 models into dicts."""
    if hasattr(model, "model_dump"):
        return model.model_dump()
    return model.dict()

def get_cloudinary_resource_type(filename: str):
    """Determina el resource_type de Cloudinary basado en la extensión."""
    ext = Path(filename).suffix.lower()
    if ext in ['.png', '.jpg', '.jpeg', '.gif', '.webp']:
        return 'image'
    if ext in ['.mp4', '.mov', '.avi']:
        return 'video'
    return 'raw'

CURRENT_YEAR = datetime.utcnow().year
MIN_YEAR = 1900
MAX_YEAR = CURRENT_YEAR + 10

ALLOWED_EXTS = {".pdf", ".png", ".jpg", ".jpeg", ".xlsx", ".docx", ".ppt", ".pptx"}
MAX_UPLOAD_BYTES = 50 * 1024 * 1024 # 50 MB
COPY_CHUNK_SIZE = 1024 * 1024 # 1 MB

# ----------------------------
# Pydantic schemas (request/response)
# ----------------------------

class ObjectiveCreate(BaseModel):
    """Payload for creating a new Objective."""
    name: str
    dimension: str
    description: Optional[str] = None
    start_year: int
    end_year: int

    @field_validator("start_year", "end_year")
    @classmethod
    def _reasonable_year(cls, v: int):
        if v < MIN_YEAR or v > MAX_YEAR:
            raise ValueError(f"year must be between {MIN_YEAR} and {MAX_YEAR}")
        return v

    @field_validator("end_year")
    @classmethod
    def _end_after_start(cls, v: int, info):
        if start := info.data.get("start_year"):
            if v < start:
                raise ValueError("end_year must be >= start_year")
        return v

class Objective(ObjectiveCreate):
    """Public representation of an Objective, including its ID and progress."""
    id: int
    average_progress_pct: Optional[float] = None

class GoalCreate(BaseModel):
    """Payload for creating a new Goal."""
    title: str
    description: Optional[str] = None
    year: int

    @field_validator("year")
    @classmethod
    def _reasonable_year(cls, v: int):
        if v < MIN_YEAR or v > MAX_YEAR:
            raise ValueError(f"year must be between {MIN_YEAR} and {MAX_YEAR}")
        return v

class Goal(GoalCreate):
    """Public representation of a Goal, including its ID."""
    id: int
    objective_id: int

class IndicatorCreate(BaseModel):
    """Payload for creating a new Indicator."""
    title: str
    target: Optional[str] = None
    unit: Optional[str] = None
    progress_total: Optional[float] = None
    progress_obtained: Optional[float] = None
    progress_free: Optional[str] = None

class Indicator(IndicatorCreate):
    """Public representation of an Indicator, including its ID."""
    id: int
    goal_id: int
    progress_total: Optional[float] = None
    progress_obtained: Optional[float] = None
    progress_free: Optional[str] = None
    class Config:
        orm_mode = True # Use from_attributes = True for Pydantic v2

class IndicatorProgressUpdate(BaseModel):
    """Payload for updating an Indicator's progress."""
    progress_total: Optional[float] = Field(None, ge=0)
    progress_obtained: Optional[float] = Field(None, ge=0)
    progress_free: Optional[str] = None

class EvidenceCreate(BaseModel):
    description: Optional[str] = ""
    filename: str
    original_filename: Optional[str] = None
    plan_id: Optional[int] = None
class Evidence(EvidenceCreate):
    id: int
    indicator_id: Optional[int] = None
    uploaded_at: datetime
    download_url: Optional[str] = None

class ObjectiveEvidenceOut(BaseModel):
    id: int
    indicator_id: int
    indicator_title: str
    description: Optional[str] = None
    original_filename: Optional[str] = None
    filename: str
    uploaded_at: datetime
    download_url: str

class DimensionEnum(str, Enum):
    """Enum for the four main dimensions of the strategic plan."""
    LIDERAZGO = "LIDERAZGO"
    GESTION_PEDAGOGICA = "GESTION_PEDAGOGICA"
    CONVIVENCIA_ESCOLAR = "CONVIVENCIA_ESCOLAR"
    GESTION_RECURSOS = "GESTION_RECURSOS"

class RoleEnum(str, Enum):
    """Enum for user roles."""
    editor = "editor"
    viewer = "viewer"
    progress_editor = "progress_editor"

class StrategicPlanCreate(BaseModel):
    """Payload for creating a Strategic Plan (Action)."""
    dimension: DimensionEnum
    colegio: str
    objetivo_estrategico: str
    estrategia: str
    subdimension: Optional[str] = None
    accion: str
    descripcion: Optional[str] = None
    fecha_inicio: date
    fecha_termino: date
    programa_asociado: Optional[str] = None
    responsable: str

    @field_validator("fecha_termino")
    @classmethod
    def _fin_despues_de_inicio(cls, v: date, info):
        ini = info.data.get("fecha_inicio")
        if ini and v < ini:
            raise ValueError("La Fecha Término debe ser mayor o igual a la Fecha Inicio")
        return v

class StrategicResourceCreate(BaseModel):
    """Payload for creating a resource/budget breakdown for a Plan."""
    recursos_necesarios: Optional[str] = None
    ate: Optional[str] = None
    tic: Optional[str] = None
    planes: Optional[str] = None
    medios_verificacion: Optional[str] = None
    monto_subvencion_general: Optional[int] = 0
    monto_sep: Optional[int] = 0
    monto_pie: Optional[int] = 0
    monto_eib: Optional[int] = 0
    monto_mantenimiento: Optional[int] = 0
    monto_pro_retencion: Optional[int] = 0
    monto_internado: Optional[int] = 0
    monto_reforzamiento: Optional[int] = 0
    monto_faep: Optional[int] = 0
    monto_aporte_municipal: Optional[int] = 0
    monto_total: Optional[int] = 0

class StrategicResource(StrategicResourceCreate):
    """Public representation of a resource/budget breakdown."""
    id: int
    plan_id: int

class StrategicPlan(StrategicPlanCreate):
    """Public representation of a Strategic Plan (Action)."""
    id: int
    created_at: datetime

class LoginRequest(BaseModel):
    """Payload for the /auth/login endpoint."""
    rut: str
    password: str

class TokenResponse(BaseModel):
    """Response from a successful /auth/login."""
    access_token: str
    token_type: str = "bearer"

class MeOut(BaseModel):
    """Response for the /auth/me endpoint."""
    id: int
    rut: str
    name: str
    email: str
    role: str
    is_active: bool

class StrategicGoalIn(BaseModel):
    """DEPRECATED? Payload for creating a 'strategic_goal'."""
    dimension: str
    objetivo: str
    plan_id: int
    meta_estrategica: str
    estrategia_periodo: str
    descripcion_indicador: str

class StrategicGoalUpdate(BaseModel):
    """DEPRECATED? Payload for updating a 'strategic_goal'."""
    plan_id: int | None = None
    meta_estrategica: str | None = None
    estrategia_periodo: str | None = None
    descripcion_indicador: str | None = None

class StrategicGoalOut(BaseModel):
    """DEPRECATED? Public representation of a 'strategic_goal'."""
    id: int
    dimension: str
    objetivo: str
    plan_id: int
    meta_estrategica: str
    estrategia_periodo: str
    descripcion_indicador: str
    class Config: from_attributes = True

class StatsTotals(BaseModel):
    indicadores: int
    metas: int
    actividades: int
    recursos: int
# ----------------------------
# ORM models (SQLAlchemy)
# ----------------------------

class ObjectiveModel(Base):
    """DB model for Objectives."""
    __tablename__ = "objectives"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(300), nullable=False)
    description = Column(String(1024), nullable=True)
    start_year = Column(Integer, nullable=False)
    end_year = Column(Integer, nullable=False)
    dimension = Column(String(64), nullable=False)
    __table_args__ = (
        UniqueConstraint('dimension', 'name', name='uniq_objective_dim_name'),
    )
    goals = relationship(
        "GoalModel",
        back_populates="objective",
        cascade="all, delete-orphan")

class GoalModel(Base):
    """DB model for Goals (Metas)."""
    __tablename__ = "goals"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    year = Column(Integer, nullable=False)
    objective_id = Column(Integer, ForeignKey("objectives.id", ondelete="RESTRICT"), nullable=False, index=True)
    objective = relationship("ObjectiveModel", back_populates="goals")
    indicators = relationship("IndicatorModel", back_populates="goal", cascade="all, delete-orphan") # <-- LÍNEA CORREGIDA
    __table_args__ = (
        UniqueConstraint('objective_id', 'title', 'year', name='uniq_goal_obj_title_year'),
    )

class IndicatorModel(Base):
    """DB model for Indicators."""
    __tablename__ = "indicators"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    target = Column(Text, nullable=True)
    unit = Column(String(50), nullable=True)
    goal_id = Column(Integer, ForeignKey("goals.id", ondelete="RESTRICT"), nullable=False, index=True)
    goal = relationship("GoalModel", back_populates="indicators")
    evidences = relationship("EvidenceModel", back_populates="indicator", cascade="all, delete-orphan") # Added cascade
    progress_total = Column(Float, nullable=True) 
    progress_obtained = Column(Float, nullable=True)
    progress_free = Column(String(255), nullable=True)
    __table_args__ = (
        UniqueConstraint('goal_id', 'title', 'unit', name='uniq_indicator_goal_title_unit'),
    )

class EvidenceModel(Base):
    """DB model for Evidences (linked to Indicators OR Plans)."""
    __tablename__ = "evidences"
    id = Column(Integer, primary_key=True, index=True)
    description = Column(Text, nullable=True)
    filename = Column(String(255), nullable=False)
    original_filename = Column(String(255), nullable=True)
    uploaded_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    indicator_id = Column(Integer, ForeignKey("indicators.id", ondelete="RESTRICT"), nullable=True, index=True) 
    indicator = relationship("IndicatorModel", back_populates="evidences")
    plan_id = Column(Integer, ForeignKey("strategic_plans.id", ondelete="SET NULL"), nullable=True, index=True)
    plan = relationship("StrategicPlanModel", backref="evidences")

class UserModel(Base):
    """DB model for Users."""
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    rut = Column(String(12), unique=True, nullable=False, index=True)
    name = Column(String(190), unique=True, nullable=False, index=True)
    email = Column(String(190), unique=True, nullable=False, index=True)
    password = Column(String(255), nullable=False)
    is_active = Column(Boolean, nullable=False, server_default="1")
    role = Column(String(20), nullable=False, server_default="viewer")
    created_at = Column(DateTime, server_default=func.current_timestamp())

class StrategicPlanModel(Base):
    """DB model for Strategic Plans (Actions)."""
    __tablename__ = "strategic_plans"
    id = Column(Integer, primary_key=True, index=True)
    dimension = Column(String(40), nullable=False, index=True)
    colegio = Column(String(200), nullable=False)
    objetivo_estrategico = Column(Text, nullable=False)
    estrategia = Column(Text, nullable=False)
    subdimension = Column(String(120), nullable=True)
    accion = Column(String(255), nullable=False)
    descripcion = Column(Text, nullable=True)
    fecha_inicio = Column(Date, nullable=False)
    fecha_termino = Column(Date, nullable=False)
    programa_asociado = Column(String(255), nullable=True)
    responsable = Column(String(120), nullable=False)
    created_at = Column(DateTime, server_default=func.current_timestamp())
    resources = relationship("StrategicResourceModel", back_populates="plan", cascade="all, delete-orphan")

class StrategicResourceModel(Base):
    """DB model for Plan Resources (Budgets)."""
    __tablename__ = "plan_resources"
    id   = Column(Integer, primary_key=True, index=True)
    plan_id = Column(Integer, ForeignKey("strategic_plans.id", ondelete="CASCADE"), nullable=False, index=True)
    recursos_necesarios = Column(Text, nullable=True)
    ate = Column(String(120), nullable=True)
    tic = Column(String(120), nullable=True)
    planes = Column(String(255), nullable=True)
    medios_verificacion = Column(Text, nullable=True)
    monto_subvencion_general = Column(Integer, nullable=True, default=0)
    monto_sep = Column(Integer, nullable=True, default=0)
    monto_pie = Column(Integer, nullable=True, default=0)
    monto_eib = Column(Integer, nullable=True, default=0)
    monto_mantenimiento = Column(Integer, nullable=True, default=0)
    monto_pro_retencion = Column(Integer, nullable=True, default=0)
    monto_internado = Column(Integer, nullable=True, default=0)
    monto_reforzamiento = Column(Integer, nullable=True, default=0)
    monto_faep = Column(Integer, nullable=True, default=0)
    monto_aporte_municipal = Column(Integer, nullable=True, default=0)
    monto_total = Column(Integer, nullable=True, default=0)
    plan = relationship("StrategicPlanModel", back_populates="resources")

class StrategicGoal(Base):
    __tablename__ = "strategic_goals"
    id = Column(Integer, primary_key=True, index=True)
    dimension = Column(String(64), nullable=False)
    objetivo = Column(String(512), nullable=False)
    plan_id = Column(Integer, ForeignKey("strategic_plans.id"), nullable=False)
    meta_estrategica = Column(String(512), nullable=False)
    estrategia_periodo = Column(String(512), nullable=False)
    descripcion_indicador = Column(String(1024), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    plan = relationship("StrategicPlanModel", backref="strategic_goals")

# ----------------------------
# ORM -> Pydantic converters
# ----------------------------

def objective_to_pydantic(m: ObjectiveModel, avg_pct: Optional[float] = None) -> Objective:
    """Map ObjectiveModel to API schema."""
    return Objective(id=m.id, name=m.name, description=m.description, start_year=m.start_year, end_year=m.end_year, dimension=m.dimension, average_progress_pct=avg_pct if avg_pct is not None else 0.0)

def goal_to_pydantic(m: GoalModel) -> Goal:
    """Map GoalModel to API schema."""
    return Goal(id=m.id, objective_id=m.objective_id, title=m.title, description=m.description, year=m.year)

def indicator_to_pydantic(m: IndicatorModel) -> Indicator:
    """Map IndicatorModel to API schema."""
    return Indicator(id=m.id, goal_id=m.goal_id, title=m.title, target=m.target, unit=m.unit, progress_total=m.progress_total,
        progress_obtained=m.progress_obtained,
        progress_free=m.progress_free)

def evidence_to_pydantic(m: EvidenceModel) -> Evidence:
    """Map EvidenceModel to API schema."""
    return Evidence(
        id=m.id,
        indicator_id=m.indicator_id,
        plan_id=getattr(m, "plan_id", None),
        description=m.description or "",
        filename=m.filename,
        original_filename=m.original_filename,
        uploaded_at=m.uploaded_at,
        download_url=f"/uploads/{m.filename}", 
    )

def plan_to_pydantic(m: StrategicPlanModel) -> StrategicPlan:
    """Map StrategicPlanModel to API schema."""
    return StrategicPlan(
        id=m.id,
        dimension=m.dimension,
        colegio=m.colegio,
        objetivo_estrategico=m.objetivo_estrategico,
        estrategia=m.estrategia,
        subdimension=m.subdimension,
        accion=m.accion,
        descripcion=m.descripcion,
        fecha_inicio=m.fecha_inicio,
        fecha_termino=m.fecha_termino,
        programa_asociado=m.programa_asociado,
        responsable=m.responsable,
        created_at=m.created_at,
    )

def Resource_to_pydantic(m: StrategicResourceModel) -> StrategicResource:
    """Map StrategicResourceModel to API schema."""
    return StrategicResource(
        id=m.id,
        plan_id=m.plan_id,
        recursos_necesarios=m.recursos_necesarios,
        ate=m.ate,
        tic=m.tic,
        planes=m.planes,
        medios_verificacion=m.medios_verificacion,
        monto_subvencion_general=m.monto_subvencion_general,
        monto_sep=m.monto_sep,
        monto_pie=m.monto_pie,
        monto_eib=m.monto_eib,
        monto_mantenimiento=m.monto_mantenimiento,
        monto_pro_retencion=m.monto_pro_retencion,
        monto_internado=m.monto_internado,
        monto_reforzamiento=m.monto_reforzamiento,
        monto_faep=m.monto_faep,
        monto_aporte_municipal=m.monto_aporte_municipal,
        monto_total=m.monto_total,
    )

def objective_get_by_dim_and_name(db: Session, dimension: str, name: str) -> Optional[ObjectiveModel]:
    """Fetch an objective by its unique (dimension, name) composite key."""
    return (
        db.query(ObjectiveModel)
          .filter(
              ObjectiveModel.dimension == dimension,
              ObjectiveModel.name == name
          ).first()
    )

def objective_create_or_get(db: Session, payload: ObjectiveCreate) -> ObjectiveModel:
    """
    Idempotently create an Objective by (dimension, name).
    If it already exists, return the existing one.
    """
    existing = objective_get_by_dim_and_name(db, payload.dimension, payload.name)
    if existing:
        return existing

    m = ObjectiveModel(**asdict(payload))
    db.add(m)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        again = objective_get_by_dim_and_name(db, payload.dimension, payload.name)
        if again:
            return again
        raise HTTPException(status_code=409, detail="Objective already exists")
    return m

# ----------------------------
# Business routes (Objectives/Goals/Indicators/Evidences)
# ----------------------------

@app.post("/objectives", response_model=Objective, status_code=201)
def create_objective(
    payload: ObjectiveCreate,
    db: Session = Depends(get_db),
    response: Response = None
):
    """
    Create an Objective. Idempotent by (dimension, name).
    Returns 201 if created, 200 if it already existed.
    """
    obj = objective_create_or_get(db, payload)
    if response is not None:
        exists = db.query(ObjectiveModel).filter(
            ObjectiveModel.id == obj.id
        ).count() > 0 and objective_get_by_dim_and_name(db, payload.dimension, payload.name) is not None
        response.status_code = 200 if exists else 201
    return objective_to_pydantic(obj)


@app.get("/objectives", response_model=List[Objective])
def list_objectives(
    dimension: Optional[str] = Query(None),
    name: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db)
):
    """
    Lista objetivos con filtros opcionales por dimension y/o name,
    incluyendo el avance promedio de sus indicadores.
    """
    pct_per_indicator = func.coalesce(
        case(
            (IndicatorModel.progress_total > 0, 
             (IndicatorModel.progress_obtained / IndicatorModel.progress_total) * 100),
            else_=None
        )
    )

    avg_progress_subquery = (
        select(
            GoalModel.objective_id,
            func.avg(pct_per_indicator).label('avg_pct')
        )
        .join(IndicatorModel, IndicatorModel.goal_id == GoalModel.id)
        .where(IndicatorModel.title != 'Evidencias')
        .group_by(GoalModel.objective_id)
        .subquery()
    )

    q = db.query(ObjectiveModel).filter(ObjectiveModel.dimension != None).order_by(ObjectiveModel.id.asc())
    q = q.outerjoin(
        avg_progress_subquery,
        avg_progress_subquery.c.objective_id == ObjectiveModel.id
    )
    if dimension:
        q = q.filter(ObjectiveModel.dimension == dimension)
    if name:
        q = q.filter(ObjectiveModel.name == name)       

    q = q.with_entities(
        ObjectiveModel,
        avg_progress_subquery.c.avg_pct.label('average_progress_pct')
    ).order_by(ObjectiveModel.id.asc())

    objs_data = q.offset(skip).limit(limit).all()
    
    results = []
    for obj_model, avg_pct in objs_data:
        results.append(objective_to_pydantic(obj_model, avg_pct if avg_pct is not None else 0.0))
        
    return results


@app.get("/objectives/{objective_id}", response_model=Objective)
def get_objective(objective_id: int, db: Session = Depends(get_db)):
    """Fetch a single objective by ID."""
    m = db.get(ObjectiveModel, objective_id)
    if not m:
        raise HTTPException(status_code=404, detail="Objective not found")
    return objective_to_pydantic(m)

@app.delete("/objectives/{objective_id}", status_code=204)
def delete_objective(objective_id: int, db: Session = Depends(get_db)):
    """Delete an objective. Fails (409) if it has child goals."""
    m = db.get(ObjectiveModel, objective_id)
    if not m:
        raise HTTPException(status_code=404, detail="Objective not found")
    #child_count = db.execute(select(func.count(GoalModel.id)).where(GoalModel.objective_id == objective_id)).scalar()
    #if child_count and child_count > 0:
        #aise HTTPException(status_code=409, detail="Objective has goals; delete them first")
    db.delete(m)
    return Response(status_code=204)

# --- Goals ---
@app.post("/objectives/{objective_id}/goals", response_model=Goal, status_code=201)
def create_goal(objective_id: int, payload: GoalCreate, db: Session = Depends(get_db), response: Response = None, user: "UserModel" = Depends(require_role("editor"))):
    """
    Create a goal under an objective. Idempotent by (objective_id, title, year).
    Returns 201 if created, 200 if it already existed.
    """
    obj = db.get(ObjectiveModel, objective_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Objective not found")
    if not (obj.start_year <= payload.year <= obj.end_year):
        raise HTTPException(status_code=400, detail="Goal year must be within the objective period")

    # 1) Check if exists
    existing = (
        db.query(GoalModel)
          .filter(
              GoalModel.objective_id == objective_id,
              GoalModel.title == payload.title,
              GoalModel.year == payload.year
          )
          .first()
    )
    if existing:
        if response is not None:
            response.status_code = 200
        return goal_to_pydantic(existing)

    # 2) Create
    m = GoalModel(objective_id=objective_id, **asdict(payload))
    db.add(m)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        again = (
            db.query(GoalModel)
              .filter(
                  GoalModel.objective_id == objective_id,
                  GoalModel.title == payload.title,
                  GoalModel.year == payload.year
              )
              .first()
        )
        if again:
            if response is not None:
                response.status_code = 200
            return goal_to_pydantic(again)
        raise HTTPException(status_code=409, detail="Goal already exists")
    return goal_to_pydantic(m)


@app.get("/objectives/{objective_id}/goals", response_model=List[Goal])
def list_goals(objective_id: int, skip: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=500), db: Session = Depends(get_db)):
    """List all goals for a specific objective."""
    stmt = select(GoalModel).where(GoalModel.objective_id == objective_id).order_by(GoalModel.id).offset(skip).limit(limit)
    goals = db.execute(stmt).scalars().all()
    return [goal_to_pydantic(g) for g in goals]

@app.get("/goals/{goal_id}", response_model=Goal)
def get_goal(goal_id: int, db: Session = Depends(get_db)):
    """Retrieve a single goal by ID."""
    m = db.get(GoalModel, goal_id)
    if not m:
        raise HTTPException(status_code=404, detail="Goal not found")
    return goal_to_pydantic(m)

@app.delete("/goals/{goal_id}", status_code=204)
def delete_goal(goal_id: int, db: Session = Depends(get_db), user: "UserModel" = Depends(require_role("editor"))):
    """Delete a goal. Fails (409) if it has child indicators."""
    m = db.get(GoalModel, goal_id)
    if not m:
        raise HTTPException(status_code=404, detail="Goal not found")
    child_count = db.execute(select(func.count(IndicatorModel.id)).where(IndicatorModel.goal_id == goal_id)).scalar()
    if child_count and child_count > 0:
        raise HTTPException(status_code=409, detail="Goal has indicators; delete them first")
    db.delete(m)
    return Response(status_code=204)

# --- Indicators ---
@app.post("/goals/{goal_id}/indicators", response_model=Indicator, status_code=201)
def create_indicator(goal_id: int, payload: IndicatorCreate, db: Session = Depends(get_db), response: Response = None, user: "UserModel" = Depends(require_role("editor"))):
    """
    Create an indicator for a goal. Idempotent by (goal_id, title, unit).
    Returns 201 if created, 200 if it already existed.
    """
    parent = db.get(GoalModel, goal_id)
    if not parent:
        raise HTTPException(status_code=404, detail="Goal not found")

    unit = getattr(payload, "unit", None)
    q = db.query(IndicatorModel).filter(
        IndicatorModel.goal_id == goal_id,
        IndicatorModel.title == payload.title,
        (IndicatorModel.unit == unit) if unit is not None else IndicatorModel.unit.is_(None)
    )
    existing = q.first()
    if existing:
        if response is not None:
            response.status_code = 200
        return indicator_to_pydantic(existing)

    m = IndicatorModel(goal_id=goal_id, **asdict(payload))
    db.add(m)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        again = db.query(IndicatorModel).filter(
            IndicatorModel.goal_id == goal_id,
            IndicatorModel.title == payload.title,
            (IndicatorModel.unit == unit) if unit is not None else IndicatorModel.unit.is_(None)
        ).first()
        if again:
            if response is not None:
                response.status_code = 200
            return indicator_to_pydantic(again)
        raise HTTPException(status_code=409, detail="Indicator already exists")
    return indicator_to_pydantic(m)


@app.get("/goals/{goal_id}/indicators", response_model=List[Indicator])
def list_indicators(goal_id: int, skip: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=500), db: Session = Depends(get_db)):
    """List all indicators under a goal."""
    stmt = select(IndicatorModel).where(IndicatorModel.goal_id == goal_id).order_by(IndicatorModel.id).offset(skip).limit(limit)
    inds = db.execute(stmt).scalars().all()
    return [indicator_to_pydantic(i) for i in inds]

@app.get("/indicators/{indicator_id}", response_model=Indicator)
def get_indicator(indicator_id: int, db: Session = Depends(get_db)):
    """Fetch a single indicator by ID."""
    m = db.get(IndicatorModel, indicator_id)
    if not m:
        raise HTTPException(status_code=404, detail="Indicator not found")
    return indicator_to_pydantic(m)

@app.delete("/indicators/{indicator_id}", status_code=204)
def delete_indicator(indicator_id: int, db: Session = Depends(get_db), user: "UserModel" = Depends(require_role("editor"))):
    """Delete an indicator. Fails (409) if it has child evidences."""
    m = db.get(IndicatorModel, indicator_id)
    if not m:
        raise HTTPException(status_code=404, detail="Indicator not found")
    child_count = db.execute(select(func.count(EvidenceModel.id)).where(EvidenceModel.indicator_id == indicator_id)).scalar()
    if child_count and child_count > 0:
        raise HTTPException(status_code=409, detail="Indicator has evidences; delete them first")
    db.delete(m)
    return Response(status_code=204)

@app.patch("/indicators/{indicator_id}/progress", status_code=204) 
async def update_indicator_progress(
    indicator_id: int,
    data: IndicatorProgressUpdate,
    db: Session = Depends(get_db), user : "UserModel" = Depends(require_role("editor" , "progress_editor"))
):
    """
    Update an indicator's progress (total, obtained, or free text).
    """
    indicator = db.get(IndicatorModel, indicator_id)
    if not indicator:
        raise HTTPException(status_code=404, detail=f"Indicator with ID {indicator_id} not found")

    update_data = data.model_dump(exclude_none=True) 
    for key, value in update_data.items():
        setattr(indicator, key, value) 

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error during update: {e}")

    return Response(status_code=204)

# --- Evidences (Indicator-linked) ---
@app.post("/indicators/{indicator_id}/evidences", response_model=Evidence, status_code=201)
def upload_evidence(indicator_id: int, file: UploadFile = File(...), description: str = Form(""), db: Session = Depends(get_db), user: "UserModel" = Depends(require_role("editor"))):
    """Upload an evidence file and link it to an Indicator."""
    ind = db.get(IndicatorModel, indicator_id)
    if not ind:
        raise HTTPException(status_code=404, detail="Indicator not found")
    
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTS:
        raise HTTPException(status_code=415, detail=f"Unsupported file type '{ext}'")
    
    # Usaremos el UUID sin la extensión como el "public_id" en Cloudinary
    public_id_base = str(uuid.uuid4())
    public_id_completo = f"evidencias/{public_id_base}"
    filename = f"{public_id_base}{ext}"
    
    try:
        cloudinary.uploader.upload(
            file.file,
            public_id = public_id_completo,
            resource_type = "auto"
        )
    except Exception as e:
        print(f"Error al subir a Cloudinary: {e}")
        raise HTTPException(status_code=500, detail="Error al guardar el archivo en la nube.")
    
    # Create DB record
    m = EvidenceModel(
        indicator_id=indicator_id,
        description=description,
        filename=filename,
        original_filename=file.filename,
        uploaded_at=datetime.utcnow()
    )
    db.add(m)
    db.flush()
    return evidence_to_pydantic(m)

@app.get("/indicators/{indicator_id}/evidences", response_model=List[Evidence])
def list_evidences(indicator_id: int, skip: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=500), db: Session = Depends(get_db)):
    """List evidences for a specific indicator."""
    if not db.get(IndicatorModel, indicator_id):
        raise HTTPException(status_code=404, detail="Indicator not found")
    stmt = select(EvidenceModel).where(EvidenceModel.indicator_id == indicator_id).order_by(EvidenceModel.id).offset(skip).limit(limit)
    evs = db.execute(stmt).scalars().all()
    return [evidence_to_pydantic(e) for e in evs]

@app.get("/evidences/{evidence_id}", response_model=Evidence)
def get_evidence(evidence_id: int, db: Session = Depends(get_db)):
    """Fetch a single (indicator-linked) evidence record."""
    m = db.get(EvidenceModel, evidence_id)
    if not m:
        raise HTTPException(status_code=404, detail="Evidence not found")
    return evidence_to_pydantic(m)



# ----------------------------
# Auth API
# ----------------------------

@app.post("/auth/login", response_model=TokenResponse)
def login(
    rut: str = Form(None),
    password: str = Form(None),
    payload: Optional[LoginRequest] = None,
    db: Session = Depends(get_db)
):
    """
    Authenticate by RUT + password.
    Accepts either form fields (rut,password) or JSON body matching LoginRequest.
    """
    # prefer form fields if provided (frontend sends form-urlencoded)
    if rut is None or password is None:
        # try JSON body
        if payload is None:
            raise HTTPException(status_code=422, detail="rut and password are required")
        rut = payload.rut
        password = payload.password

    # normalize and validate rut (normalize_rut raises HTTPException on invalid)
    try:
        rut_norm = normalize_rut(rut)
    except HTTPException:
        raise HTTPException(status_code=401, detail="Credenciales inválidas")

    user = db.execute(select(UserModel).where(UserModel.rut == rut_norm)).scalar_one_or_none()
    if not user or not verify_password(password, user.password):
        raise HTTPException(status_code=401, detail="Credenciales inválidas")
    token = create_access_token({"sub": user.rut, "uid": user.id, "role": user.role})
    return TokenResponse(access_token=token)

@app.get("/auth/me", response_model=MeOut)
def me(u: "UserModel" = Depends(get_current_user)):
    """Return the authenticated user's profile."""
    return MeOut(id=u.id, rut=u.rut, name=u.name, email=u.email, role=u.role, is_active=u.is_active)

# ----------------------------
# Strategic Plans API (plans + resources + strategic goals)
# ----------------------------

@app.post("/plans", response_model=StrategicPlan, status_code=201)
def create_plan(
    payload: StrategicPlanCreate,
    db: Session = Depends(get_db),
    current_user: "UserModel" = Depends(require_role("editor")),
):
    """Create a StrategicPlan row (Action). Editor role required."""
    m = StrategicPlanModel(
        dimension=payload.dimension.value,
        colegio=payload.colegio,
        objetivo_estrategico=payload.objetivo_estrategico,
        estrategia=payload.estrategia,
        subdimension=payload.subdimension,
        accion=payload.accion,
        descripcion=payload.descripcion,
        fecha_inicio=payload.fecha_inicio,
        fecha_termino=payload.fecha_termino,
        programa_asociado=payload.programa_asociado,
        responsable=payload.responsable,
    )
    db.add(m)
    db.flush()
    return plan_to_pydantic(m)

@app.get("/plans", response_model=List[StrategicPlan])
def list_plans(
    dimension: Optional[DimensionEnum] = Query(None),
    colegio: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """List plans with optional dimension/college filters."""
    stmt = select(StrategicPlanModel).order_by(StrategicPlanModel.id)
    if dimension:
        stmt = stmt.where(StrategicPlanModel.dimension == dimension.value)
    if colegio:
        stmt = stmt.where(StrategicPlanModel.colegio == colegio)
    rows = db.execute(stmt.offset(skip).limit(limit)).scalars().all()
    return [plan_to_pydantic(r) for r in rows]

@app.get("/plans/dimensions", response_model=List[str])
def list_dimensions():
    """Return the static list of valid dimensions (Enum values)."""
    return [d.value for d in DimensionEnum]

@app.get("/plans/{plan_id}", response_model=StrategicPlan)
def get_plan(plan_id: int, db: Session = Depends(get_db)):
    """Retrieve a single plan by ID."""
    m = db.get(StrategicPlanModel, plan_id)
    if not m:
        raise HTTPException(status_code=404, detail="Plan no encontrado")
    return plan_to_pydantic(m)

@app.delete("/plans/{plan_id}", status_code=204)
def delete_plan(
    plan_id: int,
    db: Session = Depends(get_db),
    current_user: "UserModel" = Depends(require_role("editor")),
):
    """Delete a plan. Editor role required."""
    m = db.get(StrategicPlanModel, plan_id)
    if not m:
        raise HTTPException(status_code=404, detail="Plan no encontrado")
    db.delete(m)
    return Response(status_code=204)

@app.post("/plans/{plan_id}/resources", response_model=StrategicResource, status_code=201)
def create_resource(
    plan_id: int,
    payload: StrategicResourceCreate,
    db: Session = Depends(get_db),
    current_user: "UserModel" = Depends(require_role("editor")),
):
    """Create resource/budget row for a plan. Auto-calculates total if missing."""
    plan = db.get(StrategicPlanModel, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan no encontrado")

    # Auto-calculate total if not provided
    if not payload.monto_total:
        nums = [
            payload.monto_subvencion_general or 0,
            payload.monto_sep or 0,
            payload.monto_pie or 0,
            payload.monto_eib or 0,
            payload.monto_mantenimiento or 0,
            payload.monto_pro_retencion or 0,
            payload.monto_internado or 0,
            payload.monto_reforzamiento or 0,
            payload.monto_faep or 0,
            payload.monto_aporte_municipal or 0,
        ]
        payload.monto_total = sum(nums)

    m = StrategicResourceModel(plan_id=plan_id, **asdict(payload))
    db.add(m)
    db.flush()
    return Resource_to_pydantic(m)

@app.get("/plans/{plan_id}/resources", response_model=List[StrategicResource])
def list_resources(plan_id: int, db: Session = Depends(get_db)):
    """List all resources for a given plan."""
    if not db.get(StrategicPlanModel, plan_id):
        raise HTTPException(status_code=404, detail="Plan no encontrado")
    rows = db.execute(
        select(StrategicResourceModel).where(StrategicResourceModel.plan_id == plan_id)
    ).scalars().all()
    return [Resource_to_pydantic(r) for r in rows]

@app.delete("/resources/{resource_id}", status_code=204)
def delete_resource(
    resource_id: int,
    db: Session = Depends(get_db),
    current_user: "UserModel" = Depends(require_role("editor")),
):
    """Delete a single resource row. Editor role required."""
    m = db.get(StrategicResourceModel, resource_id)
    if not m:
        raise HTTPException(status_code=404, detail="Recurso no encontrado")
    db.delete(m)
    return Response(status_code=204)

@app.get("/strategic-goals", response_model=list[StrategicGoalOut])
def list_strategic_goals(
    dimension: str = Query(...),
    objetivo: str = Query(...),
    db: Session = Depends(get_db),
    user = Depends(get_current_user),
):
    """DEPRECATED? Query all strategic goals matching a (dimension, objetivo) pair."""
    q = db.query(StrategicGoal).filter(
        StrategicGoal.dimension == dimension,
        StrategicGoal.objetivo == objetivo
    ).order_by(StrategicGoal.id.asc())
    return q.all()

@app.post("/strategic-goals", response_model=StrategicGoalOut)
def create_strategic_goal(
    payload: StrategicGoalIn,
    db: Session = Depends(get_db),
    user = Depends(require_role("editor"))
):
    """DEPRECATED? Create a strategic goal record. Editor role required."""
    plan = db.query(StrategicPlanModel).get(payload.plan_id)
    if not plan:
        raise HTTPException(404, "Plan no existe")

    rec = StrategicGoal(
        dimension=payload.dimension,
        objetivo=payload.objetivo,
        plan_id=payload.plan_id,
        meta_estrategica=payload.meta_estrategica,
        estrategia_periodo=payload.estrategia_periodo,
        descripcion_indicador=payload.descripcion_indicador
    )
    db.add(rec); db.commit(); db.refresh(rec)
    return rec

@app.put("/strategic-goals/{sid}", response_model=StrategicGoalOut)
def update_strategic_goal(
    sid: int, payload: StrategicGoalUpdate,
    db: Session = Depends(get_db),
    user = Depends(require_role("editor"))
):
    """DEPRECATED? Partial update for strategic goals. Editor role required."""
    rec = db.query(StrategicGoal).get(sid)
    if not rec:
        raise HTTPException(404, "No encontrado")
    if payload.plan_id:
        plan = db.query(StrategicPlanModel).get(payload.plan_id)
        if not plan: raise HTTPException(404, "Plan no existe")
        rec.plan_id = payload.plan_id
    if payload.meta_estrategica is not None: rec.meta_estrategica = payload.meta_estrategica
    if payload.estrategia_periodo is not None: rec.estrategia_periodo = payload.estrategia_periodo
    if payload.descripcion_indicador is not None: rec.descripcion_indicador = payload.descripcion_indicador
    db.commit(); db.refresh(rec)
    return rec

@app.delete("/strategic-goals/{sid}")
def delete_strategic_goal(
    sid: int,
    db: Session = Depends(get_db),
    user = Depends(require_role("editor"))
):
    """DEPRECATED? Delete a strategic goal. Editor role required."""
    rec = db.query(StrategicGoal).get(sid)
    if not rec: raise HTTPException(404, "No encontrado")
    db.delete(rec); db.commit()
    return {"ok": True}

# --- Evidences (Plan-linked) ---
@app.post("/plans/{plan_id}/evidences", response_model=Evidence, status_code=201)
def upload_plan_evidence(plan_id: int, file: UploadFile = File(...), description: str = Form(""), db: Session = Depends(get_db), user: "UserModel" = Depends(require_role("editor"))):
    plan = db.get(StrategicPlanModel, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTS:
        raise HTTPException(status_code=415, detail=f"Unsupported file type '{ext}'")
    public_id_base = str(uuid.uuid4())
    public_id_completo = f"evidencias/{public_id_base}"
    filename = f"{public_id_base}{ext}"
    
    try:
        cloudinary.uploader.upload(
            file.file,
            public_id = public_id_completo, 
            resource_type = "auto"
        )
    except Exception as e:
        print(f"Error al subir a Cloudinary: {e}")
        raise HTTPException(status_code=500, detail="Error al guardar el archivo en la nube.")
    m = EvidenceModel(
        plan_id=plan_id, 
        description=description,
        filename=filename,
        original_filename=file.filename,
        uploaded_at=datetime.utcnow()
    )
    db.add(m)
    db.flush()
    return evidence_to_pydantic(m)

@app.get("/plans/{plan_id}/evidences", response_model=List[Evidence])
def list_plan_evidences(plan_id: int, skip: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=500), db: Session = Depends(get_db)):
    if not db.get(StrategicPlanModel, plan_id):
        raise HTTPException(status_code=404, detail="Plan not found")
    stmt = select(EvidenceModel).where(EvidenceModel.plan_id == plan_id).order_by(EvidenceModel.id).offset(skip).limit(limit)
    evs = db.execute(stmt).scalars().all()
    return [evidence_to_pydantic(e) for e in evs]


@app.delete("/evidences/{evidence_id}", status_code=204)
def delete_evidence(evidence_id: int, db: Session = Depends(get_db), user: "UserModel" = Depends(require_role("editor"))):
    """Delete an evidence row and remove the physical file if present."""
    m = db.get(EvidenceModel, evidence_id)
    if not m:
        raise HTTPException(status_code=404, detail="Evidence not found")
    filename = m.filename
    db.delete(m)
    try:
        public_id_base = Path(filename).stem
        public_id_completo = f"evidencias/{public_id_base}"
        res_type = get_cloudinary_resource_type(filename)
        cloudinary.uploader.destroy(
            public_id_completo, 
            resource_type = res_type
        )
    except Exception as e:
        print(f"Error al borrar de Cloudinary: {e}")
        pass
    return Response(status_code=204)

@app.get("/uploads/{filename}")
def download_upload(filename: str, db: Session = Depends(get_db)):
    # intentar recuperar original_filename desde la BD para usar en Content-Disposition
    ev = db.query(EvidenceModel).filter(EvidenceModel.filename == filename).first()
    download_name = ev.original_filename if ev and ev.original_filename else filename

    public_id_base = Path(filename).stem
    public_id_completo = f"evidencias/{public_id_base}"
    res_type = get_cloudinary_resource_type(filename)

    try:
        url, options = cloudinary.utils.cloudinary_url(
            public_id_completo,
            resource_type=res_type,
            attachment="attachment",
        )
    except Exception as e:
        print(f"Error al generar URL de Cloudinary: {e}")
        raise HTTPException(status_code=404, detail="Archivo no encontrado")

    try:
        r = requests.get(url, stream=True, timeout=30)
        r.raise_for_status()

        # importante: permitir que requests decodifique el contenido comprimido si aplica
        r.raw.decode_content = True

        content_type = r.headers.get("Content-Type", "application/octet-stream")
        headers = {
            "Content-Disposition": f'attachment; filename="{download_name}"',
            "Cache-Control": "no-cache"
        }
        # pasar Content-Length si está disponible
        if "Content-Length" in r.headers:
            headers["Content-Length"] = r.headers["Content-Length"]

        # usar r.raw (file-like) para StreamingResponse — mantiene los bytes intactos
        return StreamingResponse(r.raw, media_type=content_type, headers=headers)
    except Exception as e:
        print(f"Error proxy download from Cloudinary: {e}")
        raise HTTPException(status_code=404, detail="No se pudo obtener el archivo")
@app.get("/objectives/{objective_id}/evidences", response_model=list[ObjectiveEvidenceOut])
def list_evidences_by_objective(objective_id: int, db: Session = Depends(get_db)):
    stmt = (
        select(
            EvidenceModel.id,
            EvidenceModel.indicator_id,
            IndicatorModel.title.label("indicator_title"),
            EvidenceModel.description,
            EvidenceModel.original_filename,
            EvidenceModel.filename,
            EvidenceModel.uploaded_at
        )
        .join(IndicatorModel, IndicatorModel.id == EvidenceModel.indicator_id)
        .join(GoalModel, GoalModel.id == IndicatorModel.goal_id)
        .where(GoalModel.objective_id == objective_id)
        .order_by(EvidenceModel.uploaded_at.desc())
    )
    rows = db.execute(stmt).all()

    out: list[ObjectiveEvidenceOut] = []
    for r in rows:
        out.append(ObjectiveEvidenceOut(
            id=r.id,
            indicator_id=r.indicator_id,
            indicator_title=r.indicator_title,
            description=r.description,
            original_filename=r.original_filename,
            filename=r.filename,
            uploaded_at=r.uploaded_at,
            download_url=f"/uploads/{r.filename}",
        ))
    return out

@app.get("/objectives/{objective_id}/evidences/count")
def count_evidences_by_objective(objective_id: int, db: Session = Depends(get_db)):
    stmt = (
        select(func.count(EvidenceModel.id))
        .join(IndicatorModel, IndicatorModel.id == EvidenceModel.indicator_id)
        .join(GoalModel, GoalModel.id == IndicatorModel.goal_id)
        .where(GoalModel.objective_id == objective_id)
    )
    return { "count": db.scalar(stmt) or 0 }

@app.get("/stats/totals", response_model=StatsTotals)
def get_stats_totals(
    db: Session = Depends(get_db),
    user: "UserModel" = Depends(get_current_user)
):
    total_indicadores = db.execute(select(func.count(IndicatorModel.id))).scalar() or 0
    total_metas = db.execute(select(func.count(GoalModel.id))).scalar() or 0
    total_actividades = db.execute(select(func.count(StrategicPlanModel.id))).scalar() or 0
    total_recursos = db.execute(select(func.sum(StrategicResourceModel.monto_total))).scalar() or 0

    return StatsTotals(
        indicadores=total_indicadores,
        metas=total_metas,
        actividades=total_actividades,
        recursos=total_recursos
    )
@app.get("/stats/resources-by-dimension")
def get_resources_by_dimension(db: Session = Depends(get_db), user = Depends(get_current_user)):
    """
    Retorna la suma total de 'monto_total' por dimensión.
    """
    results = (
        db.query(
            StrategicPlanModel.dimension,
            func.sum(StrategicResourceModel.monto_total)
        )
        .join(StrategicResourceModel, StrategicPlanModel.id == StrategicResourceModel.plan_id)
        .group_by(StrategicPlanModel.dimension)
        .all()
    )

    return [
        {"dimension": r[0], "total": r[1] or 0}
        for r in results
    ]

# ----------------------------
# Healthcheck
# ----------------------------

@app.get("/")
def health():
    """Simple health endpoint for readiness checks."""
    return {"status": "ok"}
