from datetime import datetime

from sqlalchemy import Column, Integer, String, Float, Boolean, Text, DateTime

from database import Base


class UserSettings(Base):
    __tablename__ = "user_settings"

    id = Column(Integer, primary_key=True, default=1)
    master_device_id = Column(String(500), default="")
    headphone_device_id = Column(String(500), default="")
    master_volume = Column(Float, default=1.0)
    headphone_volume = Column(Float, default=0.8)
    headphone_cue_mix = Column(Float, default=0.0)
    cue_a = Column(Boolean, default=False)
    cue_b = Column(Boolean, default=False)
    crossfader_curve = Column(String(20), default="smooth")
    midi_mappings = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
