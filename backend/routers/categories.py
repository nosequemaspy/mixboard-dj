from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models.category import Category
from schemas.category import CategoryCreate, CategoryUpdate, CategoryResponse

router = APIRouter(prefix="/api/categories", tags=["categories"])


@router.get("", response_model=list[CategoryResponse])
def list_categories(db: Session = Depends(get_db)):
    cats = db.query(Category).order_by(Category.sort_order, Category.name).all()
    result = []
    for c in cats:
        resp = CategoryResponse(
            id=c.id, name=c.name, color=c.color,
            sort_order=c.sort_order, song_count=len(c.songs),
        )
        result.append(resp)
    return result


@router.post("", response_model=CategoryResponse)
def create_category(data: CategoryCreate, db: Session = Depends(get_db)):
    existing = db.query(Category).filter(Category.name == data.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Category already exists")
    cat = Category(name=data.name, color=data.color, sort_order=data.sort_order)
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return CategoryResponse(id=cat.id, name=cat.name, color=cat.color, sort_order=cat.sort_order, song_count=0)


@router.put("/{category_id}", response_model=CategoryResponse)
def update_category(category_id: int, data: CategoryUpdate, db: Session = Depends(get_db)):
    cat = db.query(Category).filter(Category.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    if data.name is not None:
        cat.name = data.name
    if data.color is not None:
        cat.color = data.color
    if data.sort_order is not None:
        cat.sort_order = data.sort_order
    db.commit()
    db.refresh(cat)
    return CategoryResponse(id=cat.id, name=cat.name, color=cat.color, sort_order=cat.sort_order, song_count=len(cat.songs))


@router.delete("/{category_id}")
def delete_category(category_id: int, db: Session = Depends(get_db)):
    cat = db.query(Category).filter(Category.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    db.delete(cat)
    db.commit()
    return {"ok": True}
