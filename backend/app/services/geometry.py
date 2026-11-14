# app/services/geometry.py
"""
Measurements taken directly from part files, so quotes are priced from the
real geometry instead of a description of it.

  * DXF (2D profiles for laser / plasma / waterjet): total cut length, number of
    separate contours (one pierce each), and the bounding blank size.
  * STL (3D meshes): volume, surface area and bounding box.

STEP/IGES solids, bend detection, nesting and machining-feature recognition are
out of scope here: they need a CAD kernel.
"""
import io
import math
import os
import struct

MAX_PART_FILE_BYTES = 10 * 1024 * 1024
MAX_STL_TRIANGLES = 2_000_000
GEOMETRY_EXTENSIONS = {".dxf", ".stl"}

# DXF $INSUNITS code -> (unit name, millimetres per unit)
_DXF_UNITS = {1: ("in", 25.4), 2: ("ft", 304.8), 4: ("mm", 1.0), 5: ("cm", 10.0), 6: ("m", 1000.0)}


class GeometryError(ValueError):
    pass


def analyze_dxf(data: bytes) -> dict:
    import ezdxf
    from ezdxf import path as ezpath

    try:
        text = data.decode("utf-8", errors="ignore")
        doc = ezdxf.read(io.StringIO(text))
    except Exception:
        raise GeometryError("This DXF file could not be read.")

    unit_name, mm_per_unit = _DXF_UNITS.get(int(doc.header.get("$INSUNITS", 0) or 0), ("mm", 1.0))
    units_assumed = int(doc.header.get("$INSUNITS", 0) or 0) not in _DXF_UNITS

    total = 0.0
    min_x = min_y = math.inf
    max_x = max_y = -math.inf
    segments = []  # (start, end, closed)
    for entity in doc.modelspace():
        if entity.dxftype() in ("TEXT", "MTEXT", "DIMENSION", "HATCH", "INSERT", "POINT", "LEADER", "IMAGE"):
            continue
        try:
            p = ezpath.make_path(entity)
            points = list(p.flattening(0.01))
        except Exception:
            continue
        if len(points) < 2:
            continue
        length = sum(points[i].distance(points[i + 1]) for i in range(len(points) - 1))
        if length <= 0:
            continue
        total += length
        for pt in points:
            min_x, max_x = min(min_x, pt.x), max(max_x, pt.x)
            min_y, max_y = min(min_y, pt.y), max(max_y, pt.y)
        closed = points[0].distance(points[-1]) < 1e-6
        segments.append(((points[0].x, points[0].y), (points[-1].x, points[-1].y), closed))

    if not segments:
        raise GeometryError("No cuttable geometry was found in this DXF file.")

    # Contours: entities that touch end-to-end are one continuous cut (one pierce).
    parent = list(range(len(segments)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    tolerance = max((max_x - min_x), (max_y - min_y), 1.0) * 1e-5
    seen: dict[tuple[int, int], int] = {}
    for index, (start, end, closed) in enumerate(segments):
        if closed:
            continue
        for point in (start, end):
            key = (round(point[0] / tolerance), round(point[1] / tolerance))
            if key in seen:
                parent[find(index)] = find(seen[key])
            else:
                seen[key] = index
    contours = len({find(i) for i in range(len(segments))})

    width, height = (max_x - min_x) * mm_per_unit, (max_y - min_y) * mm_per_unit
    return {
        "kind": "dxf",
        "drawing_units": unit_name,
        "units_assumed": units_assumed,
        "cut_length_mm": round(total * mm_per_unit, 1),
        "contours": contours,
        "width_mm": round(width, 2),
        "height_mm": round(height, 2),
        "blank_area_mm2": round(width * height, 1),
    }


def _stl_triangles(data: bytes):
    """Yields triangles as three (x, y, z) tuples from a binary or ASCII STL."""
    if len(data) >= 84:
        count = struct.unpack_from("<I", data, 80)[0]
        if 84 + count * 50 == len(data):
            if count > MAX_STL_TRIANGLES:
                raise GeometryError("This STL file has too many triangles to analyse.")
            for i in range(count):
                v = struct.unpack_from("<9f", data, 84 + i * 50 + 12)
                yield v[0:3], v[3:6], v[6:9]
            return
    vertices = []
    for line in data.decode("utf-8", errors="ignore").splitlines():
        parts = line.split()
        if len(parts) == 4 and parts[0] == "vertex":
            try:
                vertices.append((float(parts[1]), float(parts[2]), float(parts[3])))
            except ValueError:
                raise GeometryError("This STL file could not be read.")
            if len(vertices) == 3:
                yield vertices[0], vertices[1], vertices[2]
                vertices = []


def analyze_stl(data: bytes) -> dict:
    volume = area = 0.0
    lo = [math.inf] * 3
    hi = [-math.inf] * 3
    count = 0
    for a, b, c in _stl_triangles(data):
        count += 1
        if count > MAX_STL_TRIANGLES:
            raise GeometryError("This STL file has too many triangles to analyse.")
        for vertex in (a, b, c):
            if not all(math.isfinite(x) for x in vertex):
                raise GeometryError("This STL file contains invalid coordinates.")
            for axis in range(3):
                lo[axis] = min(lo[axis], vertex[axis])
                hi[axis] = max(hi[axis], vertex[axis])
        # Signed volume of the tetrahedron formed with the origin
        volume += (
            a[0] * (b[1] * c[2] - b[2] * c[1])
            - a[1] * (b[0] * c[2] - b[2] * c[0])
            + a[2] * (b[0] * c[1] - b[1] * c[0])
        ) / 6.0
        ux, uy, uz = b[0] - a[0], b[1] - a[1], b[2] - a[2]
        vx, vy, vz = c[0] - a[0], c[1] - a[1], c[2] - a[2]
        area += 0.5 * math.sqrt((uy * vz - uz * vy) ** 2 + (uz * vx - ux * vz) ** 2 + (ux * vy - uy * vx) ** 2)
    if count == 0:
        raise GeometryError("No triangles were found in this STL file.")
    size = [hi[i] - lo[i] for i in range(3)]
    return {
        "kind": "stl",
        "triangles": count,
        "volume_cm3": round(abs(volume) / 1000.0, 3),
        "surface_area_cm2": round(area / 100.0, 2),
        "size_x_mm": round(size[0], 2),
        "size_y_mm": round(size[1], 2),
        "size_z_mm": round(size[2], 2),
        "bounding_volume_cm3": round(size[0] * size[1] * size[2] / 1000.0, 3),
    }


def analyze_part_file(filename: str, data: bytes) -> dict:
    ext = os.path.splitext(filename or "")[1].lower()
    if ext not in GEOMETRY_EXTENSIONS:
        raise GeometryError("Only DXF and STL part files can be measured.")
    if not data:
        raise GeometryError("The file is empty.")
    if len(data) > MAX_PART_FILE_BYTES:
        raise GeometryError("Part files must be 10 MB or smaller.")
    return analyze_dxf(data) if ext == ".dxf" else analyze_stl(data)


def describe_geometry(filename: str, g: dict) -> str:
    """Text block appended to a request so the quote engine prices from measured values."""
    name = os.path.basename(filename or "part")
    if g["kind"] == "dxf":
        lines = [
            f"--- Part geometry (measured from {name}) ---",
            f"2D profile for cutting. Total cut length: {g['cut_length_mm']:.1f} mm ({g['cut_length_mm'] / 1000:.3f} m).",
            f"Separate contours (one pierce each): {g['contours']}.",
            f"Blank size needed: {g['width_mm']:.2f} x {g['height_mm']:.2f} mm ({g['blank_area_mm2'] / 1e6:.4f} m2).",
        ]
        if g.get("units_assumed"):
            lines.append("The drawing does not state its units; millimetres were assumed.")
        lines.append("Material thickness is not in a 2D drawing and must come from the request.")
    else:
        lines = [
            f"--- Part geometry (measured from {name}) ---",
            f"3D model. Volume: {g['volume_cm3']:.3f} cm3. Surface area: {g['surface_area_cm2']:.2f} cm2.",
            f"Overall size: {g['size_x_mm']:.2f} x {g['size_y_mm']:.2f} x {g['size_z_mm']:.2f} mm "
            f"(stock block volume {g['bounding_volume_cm3']:.3f} cm3).",
            "STL files carry no units; millimetres were assumed. Weight = volume x material density.",
        ]
    return "\n".join(lines)
