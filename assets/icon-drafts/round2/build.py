# 건뿌 아이콘 2차 시안 D · E · F 전경 렌더(Blender Cycles, 투명 바탕 + 그림자 받이).
# "C:/Program Files/Blender Foundation/Blender 5.1/blender.exe" -b --factory-startup -P build.py -- <D|E|F> <out.png> [samples] [size]
# 화면 = 적응형 108dp 판 전체. 핵심은 가운데 66dp 원(반지름 0.306) 안. 빛은 왼쪽 위 한 방향 + 오른쪽 뒤 따뜻한 림.
# 배경은 여기서 그리지 않는다(make.mjs가 SVG 그라데이션으로 굽는다). 그림자는 그림자 받이로 알파에 담긴다.
import bpy, bmesh, math, sys
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
DRAFT, OUT = argv[0], argv[1]
SAMPLES = int(argv[2]) if len(argv) > 2 else 192
SIZE = int(argv[3]) if len(argv) > 3 else 1024

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene

def lin(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c) + (1,)

# ---------- 재질 ----------
def mat(name, color, rough=0.3, metal=0.0, coat=0.0, emit=None, strength=0.0, bump=0.0, scale=40, aniso=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; p = nt.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = lin(color)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    p.inputs['Coat Weight'].default_value = coat
    p.inputs['Coat Roughness'].default_value = 0.03
    if aniso: p.inputs['Anisotropic'].default_value = aniso
    if emit:
        p.inputs['Emission Color'].default_value = lin(emit)
        p.inputs['Emission Strength'].default_value = strength
    if bump:  # 먹 · 옻칠 결
        n = nt.nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = 10
        b = nt.nodes.new('ShaderNodeBump'); b.inputs['Strength'].default_value = bump
        nt.links.new(n.outputs['Fac'], b.inputs['Height']); nt.links.new(b.outputs['Normal'], p.inputs['Normal'])
    return m

INK = mat('ink', '#0A0A0E', rough=0.2, coat=1.0, bump=0.05, scale=60)          # 옻칠한 먹
SEAL = mat('seal', '#C4301E', rough=0.38, coat=0.7, bump=0.08, scale=90)         # 주홍(끈 · 자루)
GOLD = mat('cut', '#FFB800', rough=0.35, emit='#FFB000', strength=1.1)          # 벤 면(달아오른 칼빛)
GLOW = mat('glow', '#FFE14D', emit='#FFD21A', strength=1.25)                      # 칼빛 줄 · 호
WIN = mat('win', '#F4E6C4', rough=0.5, emit='#FFD98A', strength=0.75)            # 불 켜진 창(한지빛)
STEEL = mat('steel', '#D8DCE4', rough=0.26, metal=1.0, aniso=0.6)

def assign(o, *ms):
    o.data.materials.clear()
    for m in ms: o.data.materials.append(m)

def bevel(o, w=0.03, seg=4):
    md = o.modifiers.new('bv', 'BEVEL'); md.width = w; md.segments = seg; md.limit_method = 'ANGLE'
    bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier=md.name)

def box(name, size, loc, m, bv=0.03):
    bpy.ops.mesh.primitive_cube_add(location=loc); o = bpy.context.object; o.name = name
    o.scale = (size[0] / 2, size[1] / 2, size[2] / 2); bpy.ops.object.transform_apply(scale=True)
    if bv: bevel(o, bv)
    assign(o, m); return o

def smooth(o):
    for p in o.data.polygons: p.use_smooth = True

def join(objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]; bpy.ops.object.join(); return objs[0]

def group(objs, loc=(0, 0, 0), rot=(0, 0, 0)):
    g = bpy.data.objects.new('g', None); bpy.context.collection.objects.link(g)
    for o in objs: o.parent = g
    g.location = loc; g.rotation_euler = rot; return g

def slice_obj(o, co, no, keep_above, cut_mat_index):
    """평면(co, no)으로 잘라 한쪽만 남기고 벤 면을 메운다(메운 면 = 칼빛 재질)."""
    me = o.data; bm = bmesh.new(); bm.from_mesh(me)
    r = bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=co, plane_no=no,
                               clear_inner=keep_above, clear_outer=not keep_above)
    edges = [e for e in r['geom_cut'] if isinstance(e, bmesh.types.BMEdge)]
    f = bmesh.ops.holes_fill(bm, edges=edges, sides=0)
    for fc in f['faces']: fc.material_index = cut_mat_index; fc.smooth = False
    bm.to_mesh(me); bm.free()

def capsule(a, b, r, m):
    a, b = Vector(a), Vector(b); d = b - a
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=d.length, vertices=40, location=(a + b) / 2)
    c = bpy.context.object; c.rotation_mode = 'QUATERNION'; c.rotation_quaternion = d.to_track_quat('Z', 'Y')
    parts = [c]
    for p in (a, b):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=p, segments=40, ring_count=20); parts.append(bpy.context.object)
    o = join(parts); assign(o, m); smooth(o); return o

def ribbon(pts, radii, depth, m):
    """칼빛 호 · 줄: 베지어 관, 반지름이 점마다 달라 양끝이 뾰족하다."""
    cu = bpy.data.curves.new('rb', 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = depth; cu.bevel_resolution = 8
    sp = cu.splines.new('BEZIER'); sp.bezier_points.add(len(pts) - 1)
    for i, (p, rr) in enumerate(zip(pts, radii)):
        bp = sp.bezier_points[i]; bp.co = p; bp.handle_left_type = bp.handle_right_type = 'AUTO'; bp.radius = rr
    o = bpy.data.objects.new('rb', cu); bpy.context.collection.objects.link(o); o.data.materials.append(m); return o

def blade(L=2.6, Wd=0.62, thick=0.09):
    """철거칼 한 자루(날끝 = +z, 날 = +x 쪽). 먹 칼등 · 강철 몸 · 칼빛 날 · 먹 코등이 · 주홍 끈 자루."""
    h = Wd / 2
    prof = [(-h, 0.0), (h * 0.88, 0.0), (h, L * 0.72), (h * 0.85, L * 0.9), (h * 0.1, L), (-h, L * 0.94)]
    me = bpy.data.meshes.new('blade'); bm = bmesh.new()
    f = bm.faces.new([bm.verts.new((x, 0, z)) for x, z in prof])
    ext = bmesh.ops.extrude_face_region(bm, geom=[f])
    for v in [e for e in ext['geom'] if isinstance(e, bmesh.types.BMVert)]: v.co.y += thick
    # 날 쪽을 얇게 깎아 쐐기로(빛이 날 면에 걸리게)
    for v in bm.verts:
        if v.co.x > h * 0.3: v.co.y = thick / 2 + (v.co.y - thick / 2) * 0.25
    bmesh.ops.translate(bm, verts=bm.verts[:], vec=(0, -thick / 2, 0)); bm.to_mesh(me); bm.free()
    b = bpy.data.objects.new('blade', me); bpy.context.collection.objects.link(b); bevel(b, 0.02, 3); assign(b, STEEL)
    spine = box('spine', (0.1, thick * 1.5, L * 0.93), (-h, 0, L * 0.465), INK, 0.035)
    edge = ribbon([(h * 0.9, -0.005, 0.05), (h * 1.0, -0.005, L * 0.5), (h * 0.95, -0.005, L * 0.85), (h * 0.2, -0.005, L * 0.99)],
                  (0.2, 1.0, 0.8, 0.1), 0.028, GLOW)
    bpy.ops.mesh.primitive_cylinder_add(radius=h * 1.25, depth=0.12, vertices=64, location=(0, 0, -0.06))
    guard = bpy.context.object; bevel(guard, 0.03, 3); assign(guard, INK)
    grip = capsule((0, 0, -0.12), (0, 0, -L * 0.38), 0.12, SEAL)
    parts = [b, spine, edge, guard, grip]
    n = 7
    for i in range(n):  # 감은 끈 결
        bpy.ops.mesh.primitive_torus_add(major_radius=0.125, minor_radius=0.032, location=(0, 0, -0.22 - i * (L * 0.36 - 0.2) / n),
                                         rotation=(math.radians(16 if i % 2 else -16), 0, 0))
        t = bpy.context.object; assign(t, SEAL); smooth(t); parts.append(t)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.15, location=(0, 0, -L * 0.4)); pm = bpy.context.object; assign(pm, INK); smooth(pm)
    parts.append(pm); return parts

# ---------- 소재 ----------
def draft_D():
    """베인 먹 빌딩: 옻칠한 먹 빌딩(창 = 한지빛)을 사선으로 베어 윗동이 미끄러진다. 벤 면이 칼빛으로 달아오른다."""
    W, Dp, H = 1.15, 0.95, 2.5
    parts = [box('body', (W, Dp, H), (0, 0, H / 2), INK, 0.06), box('tank', (0.4, 0.4, 0.3), (-0.2, 0.1, H + 0.13), INK, 0.04),
             box('cornice', (W + 0.12, Dp + 0.12, 0.12), (0, 0, H - 0.02), INK, 0.035),   # 처마
             box('plinth', (W + 0.1, Dp + 0.1, 0.16), (0, 0, 0.08), INK, 0.035)]          # 기단
    for z in (0.665, 1.195, 1.725, 2.255):  # 층 띠(창 사이)
        parts.append(box('band', (W + 0.04, Dp + 0.04, 0.045), (0, 0, z), INK, 0.015))
    for face in (0, 1):  # 앞(-y) · 오른(+x) 두 면에 창 2 × 4
        for c in range(2):
            for r in range(4):
                u = (c - 0.5) * (W * 0.44 if face == 0 else Dp * 0.44); z = 0.4 + r * 0.53
                if face == 0: parts.append(box('w', (0.3, 0.05, 0.34), (u, -Dp / 2 + 0.012, z), WIN, 0.015))
                else: parts.append(box('w', (0.05, 0.26, 0.34), (W / 2 - 0.012, u, z), WIN, 0.015))
    bld = join(parts); bld.data.materials.append(GOLD); gi = len(bld.data.materials) - 1
    top = bld.copy(); top.data = bld.data.copy(); bpy.context.collection.objects.link(top)
    co, no = Vector((0, 0, 1.3)), Vector((-0.45, 0.15, 1)).normalized()
    slice_obj(bld, co, no, keep_above=False, cut_mat_index=gi)
    slice_obj(top, co, no, keep_above=True, cut_mat_index=gi)
    top.location += Vector((0.36, -0.05, 0.3))     # 벤 면을 따라 오른쪽 위로 밀려남 + 틈
    top.rotation_euler = (0, math.radians(-5), 0)
    gl = ribbon([(-1.35, -0.62, 0.72), (0.0, -0.62, 1.42), (1.45, -0.62, 2.1)], (0.05, 1.0, 0.05), 0.026, GLOW)
    group([bld, top], rot=(0, 0, math.radians(-30)))
    return dict(target=Vector((0.1, 0, 1.5)), dist=11.4, lens=70, elev=12, azim=0, floor=True)

def draft_E():
    """졸라맨 일격: 옻칠 먹으로 빚은 졸라맨이 뛰어올라 철거칼을 머리 뒤로 젖혔다. 칼끝이 그은 칼빛 호."""
    r = 0.14
    hip, neck = Vector((-0.05, 0, 1.0)), Vector((0.0, 0, 1.78))
    sh = neck - Vector((0, 0, 0.06))
    hand = Vector((0.42, -0.12, 2.5))
    figs = [capsule(hip, neck, r, INK)]
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.3, location=(-0.12, 0.02, 2.18), segments=64, ring_count=32)
    head = bpy.context.object; assign(head, INK); smooth(head); figs.append(head)
    for el in (Vector((0.48, -0.02, 1.95)), Vector((0.3, -0.22, 2.0))):   # 두 팔: 어깨 → 팔꿈치 → 쳐든 손
        figs += [capsule(sh, el, r * 0.85, INK), capsule(el, hand, r * 0.85, INK)]
    k1, k2 = Vector((0.5, -0.05, 0.72)), Vector((-0.5, 0.05, 0.78))
    figs += [capsule(hip, k1, r, INK), capsule(k1, Vector((0.25, -0.05, 0.22)), r, INK),
             capsule(hip, k2, r, INK), capsule(k2, Vector((-0.35, 0.05, 0.2)), r, INK)]
    bp = blade(L=1.55, Wd=0.4, thick=0.07)
    group(bp, loc=hand, rot=(0, math.radians(-55), 0))                    # 손에서 왼쪽 위 뒤로 젖힌 칼
    ribbon([(-1.25, 0.3, 1.55), (-0.85, 0.3, 2.95), (0.6, 0.3, 3.12), (1.3, 0.3, 2.0)], (0.05, 0.9, 1.0, 0.05), 0.085, GLOW)
    return dict(target=Vector((0.0, 0, 1.68)), dist=12.6, lens=70, elev=6, azim=-12, floor=False)

def draft_F():
    """철거칼 한 자루: 넓은 날이 사선으로 선다. 먹 옻칠 칼등 · 강철 날 몸 · 칼빛 날끝 · 주홍 끈 감은 자루."""
    group(blade(L=2.55, Wd=0.72, thick=0.1), loc=(-0.15, 0, 0.55), rot=(math.radians(-24), math.radians(40), math.radians(-12)))
    return dict(target=Vector((0.18, 0, 1.18)), dist=12.1, lens=70, elev=6, azim=0, floor=False)

cfg = {'D': draft_D, 'E': draft_E, 'F': draft_F}[DRAFT]()
t = cfg['target']

# ---------- 그림자 받이 · 빛 · 반사용 스튜디오 하늘 · 카메라 ----------
bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 1.1, 0), rotation=(math.radians(90), 0, 0))
bpy.context.object.is_shadow_catcher = True
if cfg['floor']:
    bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, -0.01)); bpy.context.object.is_shadow_catcher = True

def light(name, loc, energy, color, size):
    l = bpy.data.lights.new(name, 'AREA'); l.energy = energy; l.color = lin(color)[:3]; l.size = size
    o = bpy.data.objects.new(name, l); bpy.context.collection.objects.link(o); o.location = loc
    o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = (t - Vector(loc)).to_track_quat('-Z', 'Y')

light('key', (-5, -6, 7), 1100, '#FFF3E2', 4.5)       # 왼쪽 위 앞 — 한 방향
light('rim', (4.5, 4.5, 5), 1300, '#FFC85A', 2.0)     # 오른쪽 뒤 — 따뜻한 림
light('fill', (5, -7, 1.0), 90, '#C8D6FF', 7.0)

# 금속이 비출 스튜디오 반사판 둘(카메라 · 그림자에는 안 보임)
def card(loc, size, strength, color):
    bpy.ops.mesh.primitive_plane_add(size=size, location=loc); o = bpy.context.object
    o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = (t - Vector(loc)).to_track_quat('Z', 'Y')
    m = mat('card', color, emit=color, strength=strength); assign(o, m)
    o.visible_camera = False; o.visible_shadow = False; return o
card((-3.5, -7, 4.5), 6, 2.2, '#FFF6EA')
card((5, -5, -1.5), 5, 0.8, '#D9E2FF')
card((1.5, -17, 9), 10, 0.45, '#E8EEFF')      # 카메라 뒤 위 — 칼 면이 비추는 하늘

w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; nt = w.node_tree
tc = nt.nodes.new('ShaderNodeTexCoord'); sx = nt.nodes.new('ShaderNodeSeparateXYZ'); ramp = nt.nodes.new('ShaderNodeValToRGB')
nt.links.new(tc.outputs['Generated'], sx.inputs[0]); nt.links.new(sx.outputs['Z'], ramp.inputs['Fac'])
ramp.color_ramp.elements[0].position = 0.0; ramp.color_ramp.elements[0].color = (0.03, 0.03, 0.035, 1)
ramp.color_ramp.elements[1].position = 0.6; ramp.color_ramp.elements[1].color = (0.55, 0.52, 0.48, 1)   # 위가 밝은 스튜디오
nt.links.new(ramp.outputs['Color'], nt.nodes['Background'].inputs['Color'])
nt.nodes['Background'].inputs['Strength'].default_value = 0.6

cd = bpy.data.cameras.new('cam'); cd.lens = cfg['lens']
cam = bpy.data.objects.new('cam', cd); bpy.context.collection.objects.link(cam); sc.camera = cam
el, az = math.radians(cfg['elev']), math.radians(cfg['azim'])
cam.location = t + Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el))) * cfg['dist']
cam.rotation_mode = 'QUATERNION'; cam.rotation_quaternion = (t - cam.location).to_track_quat('-Z', 'Y')

# ---------- 렌더 ----------
sc.render.engine = 'CYCLES'
pr = bpy.context.preferences.addons['cycles'].preferences
for kind in ('OPTIX', 'CUDA'):
    try:
        pr.compute_device_type = kind; pr.get_devices()
        if any(d.type == kind for d in pr.devices): break
    except Exception: pass
for d in pr.devices: d.use = d.type != 'CPU'
sc.cycles.device = 'GPU' if any(d.use for d in pr.devices) else 'CPU'
print('DEVICE', pr.compute_device_type, sc.cycles.device)
sc.cycles.samples = SAMPLES; sc.cycles.use_denoising = True
sc.render.film_transparent = True
sc.render.resolution_x = sc.render.resolution_y = SIZE; sc.render.resolution_percentage = 100
sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
sc.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print('WROTE', OUT)
