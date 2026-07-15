# app/api/kb.py
from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import List
from pydantic import BaseModel
import os
from app.core.security import get_current_user
from app.schemas.pydantic_models import KnowledgeBaseResponse
from app.services.parser import parse_file_content
from supabase import create_client, Client
from app.core.config import settings

router = APIRouter(prefix="/kb", tags=["Knowledge Base"])

supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)

def get_content_type_from_ext(filename: str) -> str:
    ext = os.path.splitext(filename)[1].lower()
    if ext == '.csv':
        return 'csv'
    elif ext in ['.xlsx', '.xls']:
        return 'xlsx'
    elif ext == '.pdf':
        return 'pdf'
    return 'unknown'

@router.post("/process", response_model=KnowledgeBaseResponse, status_code=status.HTTP_201_CREATED)
def process_kb_file(
    file_path: str = Query(..., description="Path of the file inside the storage bucket"),
    filename: str = Query(..., description="Original name of the file"),
    current_user: dict = Depends(get_current_user)
):
    """
    Downloads a newly uploaded file from Supabase Storage bucket,
    parses its contents (CSV/Excel/PDF), and saves it to the database.
    Strictly validates that the user is only processing their own storage folder.
    """
    # Enforce Tenant Isolation: storage path must begin with user's ID
    user_prefix = f"{current_user['id']}/"
    if not file_path.startswith(user_prefix):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Cannot process files outside of your user folder"
        )
        
    try:
        # Download the file from Supabase Storage
        logger_name = "app.api.kb"
        import logging
        logger = logging.getLogger(logger_name)
        logger.info(f"Downloading file {file_path} from storage...")
        
        file_bytes = supabase.storage.from_("knowledge_base").download(file_path)
        
        # Parse content based on file extension
        parsed_content = parse_file_content(file_bytes, filename)
        
        content_type = get_content_type_from_ext(filename)
        
        # Insert parsed data and metadata into knowledge_base table
        response = supabase.table("knowledge_base").insert({
            "user_id": current_user["id"],
            "company_id": current_user["company_id"],
            "filename": filename,
            "file_path": file_path,
            "content_type": content_type,
            "parsed_content": parsed_content
        }).execute()
        
        if not response.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to record parsed file in database"
            )
            
        return response.data[0]
        
    except ValueError as val_err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(val_err)
        )
    except Exception as e:
        logger.error(f"Failed to process knowledge base file {filename}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Knowledge base processing failed: {str(e)}"
        )

@router.get("", response_model=List[KnowledgeBaseResponse])
def list_knowledge_files(current_user: dict = Depends(get_current_user)):
    """
    Lists all processed Knowledge Base files for the authenticated user's company.
    """
    try:
        response = supabase.table("knowledge_base")\
            .select("*")\
            .eq("company_id", current_user["company_id"])\
            .order("created_at", desc=True)\
            .execute()
        return response.data
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve knowledge base: {str(e)}"
        )

@router.delete("/{kb_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_knowledge_file(kb_id: str, current_user: dict = Depends(get_current_user)):
    """
    Deletes the database metadata and removes the file from Supabase Storage.
    Validates company ownership before execution.
    """
    try:
        # Check ownership
        db_response = supabase.table("knowledge_base")\
            .select("*")\
            .eq("id", kb_id)\
            .eq("company_id", current_user["company_id"])\
            .execute()
            
        if not db_response.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Knowledge base file not found or unauthorized"
            )
            
        kb_file = db_response.data[0]
        file_path = kb_file["file_path"]
        
        # Remove metadata from PostgreSQL
        supabase.table("knowledge_base").delete().eq("id", kb_id).execute()
        
        # Remove file from Supabase Storage
        try:
            supabase.storage.from_("knowledge_base").remove([file_path])
        except Exception as storage_err:
            # Non-blocking, DB record is already clean
            import logging
            logging.getLogger("app.api.kb").warning(f"Failed to clean up storage path {file_path}: {str(storage_err)}")
            
        return
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete knowledge base item: {str(e)}"
        )

class KbUpdateInput(BaseModel):
    filename: str
    parsed_content: str

@router.put("/{kb_id}", response_model=KnowledgeBaseResponse)
def update_knowledge_file(
    kb_id: str,
    data: KbUpdateInput,
    current_user: dict = Depends(get_current_user)
):
    """
    Updates the parsed content or filename of an existing Knowledge Base entry.
    """
    try:
        # Check ownership
        db_response = supabase.table("knowledge_base")\
            .select("*")\
            .eq("id", kb_id)\
            .eq("company_id", current_user["company_id"])\
            .execute()
            
        if not db_response.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Knowledge base file not found or unauthorized"
            )
            
        res = supabase.table("knowledge_base")\
            .update({
                "filename": data.filename,
                "parsed_content": data.parsed_content
            })\
            .eq("id", kb_id)\
            .execute()
            
        return res.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update knowledge base file: {str(e)}"
        )
