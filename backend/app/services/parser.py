# app/services/parser.py
import os
import pandas as pd
from pypdf import PdfReader
import io
import logging

logger = logging.getLogger(__name__)

def sanitize_filename(filename: str) -> str:
    """
    Sanitizes filename using path.basename to prevent directory traversal.
    """
    # Enforce path & file system security
    basename = os.path.basename(filename)
    # Strip any directory traversal characters or prefixes
    clean_name = basename.replace("../", "").replace("..\\", "")
    return clean_name

def parse_file_content(file_bytes: bytes, filename: str) -> str:
    """
    Parses CSV, Excel, or PDF content and returns a normalized text representation.
    """
    clean_name = sanitize_filename(filename)
    ext = os.path.splitext(clean_name)[1].lower()
    
    if ext == '.csv':
        try:
            df = pd.read_csv(io.BytesIO(file_bytes))
            # Format DataFrame to markdown table or string
            return df.to_string(index=False)
        except Exception as e:
            logger.error(f"Error parsing CSV file {clean_name}: {str(e)}")
            raise ValueError(f"Failed to parse CSV file: {str(e)}")
            
    elif ext in ['.xlsx', '.xls']:
        try:
            # openpyxl engine is standard for reading .xlsx files
            xls = pd.ExcelFile(io.BytesIO(file_bytes), engine='openpyxl')
            sheets_text = []
            for sheet_name in xls.sheet_names:
                df = pd.read_excel(xls, sheet_name=sheet_name)
                sheets_text.append(f"--- Sheet: {sheet_name} ---\n{df.to_string(index=False)}")
            return "\n\n".join(sheets_text)
        except Exception as e:
            logger.error(f"Error parsing Excel file {clean_name}: {str(e)}")
            raise ValueError(f"Failed to parse Excel file: {str(e)}")
            
    elif ext == '.pdf':
        try:
            pdf_reader = PdfReader(io.BytesIO(file_bytes))
            pages_text = []
            for i, page in enumerate(pdf_reader.pages):
                text = page.extract_text()
                if text:
                    pages_text.append(f"--- Page {i + 1} ---\n{text}")
            return "\n\n".join(pages_text)
        except Exception as e:
            logger.error(f"Error parsing PDF file {clean_name}: {str(e)}")
            raise ValueError(f"Failed to parse PDF file: {str(e)}")
            
    else:
        raise ValueError(f"Unsupported file extension: {ext}")
