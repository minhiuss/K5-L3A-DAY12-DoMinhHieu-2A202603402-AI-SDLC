# Author Mây's animation clips in Blender (headless) — view-only art, not game rules.
#   blender --background --python art/make_may_clips.py
# Imports public/assets/may.glb, keys 6 actions (idle, run, sprint, jump, dash, shoot) as bone rotations
# about the RIG axes used by src/view/may.js (x = Mây's left, y = up, z = forward), saves
# art/source/may_anim.blend and exports art/source/may_anim.glb (armature + actions only).
# art/merge_may_anims.mjs then copies the actions into public/assets/may.glb without touching the mesh.
import bpy, math, os, sys
from mathutils import Quaternion, Vector

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(REPO, 'public', 'assets', 'may.glb')
OUT = os.path.join(REPO, 'art', 'source')
FPS = 60
# glTF -> Blender is (x, y, z) -> (x, -z, y); the model faces glTF +X. Rig axes in Blender armature space:
AX = {'x': Vector((0, 1, 0)), 'y': Vector((0, 0, 1)), 'z': Vector((1, 0, 0))}  # left, up, forward

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
sc = bpy.context.scene
sc.render.fps = FPS
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='POSE')
pbs = arm.pose.bones
for pb in pbs:
    pb.rotation_mode = 'QUATERNION'
bpy.context.view_layer.update()
# import pose: B0 = basis, G = pose matrix without the basis -> rotating about armature axis A is
# basis' = Quaternion(G^-1 A, angle) @ B0 (same idea as pose() in may.js: axis taken in the parent frame)
B0 = {pb.name: pb.rotation_quaternion.copy() for pb in pbs}
GINV = {}
for pb in pbs:
    g = (pb.matrix @ pb.matrix_basis.inverted()).to_3x3().normalized()
    GINV[pb.name] = g.inverted()


def pose_frame(rots):
    """rots: {bone: [(axis, angle), ...]} applied in order (each premultiplied, like poseMulti)."""
    out = {}
    for name, lst in rots.items():
        q = B0[name].copy()
        for axis, ang in lst:
            q = Quaternion((GINV[name] @ AX[axis]).normalized(), ang) @ q
        out[name] = q
    return out


def make_action(name, frames, fn):
    """fn(f) -> rots; keys every frame 0..frames (last == first for loops)."""
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    arm.animation_data_create()
    arm.animation_data.action = act
    prev = {}
    bones = None
    for f in range(frames + 1):
        rots = fn(f)
        bones = bones or sorted(rots)
        qs = pose_frame(rots)
        for b in bones:
            q = qs[b]
            if b in prev:
                q.make_compatible(prev[b])
            prev[b] = q
            pbs[b].rotation_quaternion = q
            pbs[b].keyframe_insert('rotation_quaternion', frame=f, group=b)
    for pb in pbs:
        pb.rotation_quaternion = B0[pb.name]
    act.frame_range = (0, frames)
    return act


TAU = 2 * math.pi
pos = lambda v: max(0.0, v)


def legs_cycle(ph, amp, knee):
    s = math.sin(ph)
    # +x rotation swings a hanging limb backward (top toward forward); thigh forward = negative
    return {
        'L_Thigh': [('x', -amp * s)], 'R_Thigh': [('x', amp * s)],
        'L_Calf': [('x', 0.2 + knee * pos(math.sin(ph + 1.2)))],
        'R_Calf': [('x', 0.2 + knee * pos(math.sin(ph + 1.2 + math.pi)))],
        'L_Foot': [('x', -0.25 * s)], 'R_Foot': [('x', 0.25 * s)],
    }


def idle(f):
    b = math.sin(TAU * f / 120)
    return {
        'Spine01': [('x', 0.025 * b)], 'Spine02': [('x', 0.015 * b)], 'Head': [('x', -0.03 * b), ('y', 0.06 * math.sin(TAU * f / 120 * 0.5))],
        'L_Upperarm': [('z', -0.12 + 0.03 * b)], 'R_Upperarm': [('z', 0.12 - 0.03 * b)],
    }


def run_like(n, amp, knee, arm_amp, elbow, lean, twist):
    def fn(f):
        ph = TAU * f / n
        s = math.sin(ph)
        r = legs_cycle(ph, amp, knee)
        r.update({
            'Spine01': [('x', lean)], 'Spine02': [('y', twist * s)], 'Head': [('x', -lean * 0.6), ('y', -twist * s)],
            'L_Upperarm': [('z', -0.15), ('x', arm_amp * s)], 'R_Upperarm': [('z', 0.15), ('x', -arm_amp * s)],
            'L_Forearm': [('x', -elbow)], 'R_Forearm': [('x', -elbow)],
        })
        return r
    return fn


def jump(f):
    w = 0.05 * math.sin(TAU * f / 60)
    return {
        'L_Thigh': [('x', -0.8 + w)], 'R_Thigh': [('x', -0.15 - w)], 'L_Calf': [('x', 1.1)], 'R_Calf': [('x', 0.45)],
        'Spine01': [('x', 0.08)],
        'L_Upperarm': [('z', 0.45 + w), ('x', -0.3)], 'R_Upperarm': [('z', -0.45 - w), ('x', -0.3)],
        'L_Forearm': [('x', -0.4)], 'R_Forearm': [('x', -0.4)],
    }


def dash(f):  # 0.2 s knee tuck; the full 360° flip stays on the `roller` group in may.js
    k = math.sin(math.pi * f / 12)
    return {
        'L_Thigh': [('x', -1.6 * k)], 'R_Thigh': [('x', -1.6 * k)], 'L_Calf': [('x', 2.0 * k)], 'R_Calf': [('x', 2.0 * k)],
        'Spine01': [('x', 0.5 * k)], 'Spine02': [('x', 0.25 * k)], 'Head': [('x', 0.35 * k)],
        'L_Upperarm': [('x', -1.0 * k), ('z', -0.2 * k)], 'R_Upperarm': [('x', -1.0 * k), ('z', 0.2 * k)],
        'L_Forearm': [('x', -1.2 * k)], 'R_Forearm': [('x', -1.2 * k)],
    }


def ease(a, b, f):
    t = min(1.0, max(0.0, (f - a) / (b - a)))
    return t * t * (3 - 2 * t)


def shoot(f):  # 0.35 s, upper body only (played additively over the legs); frame 0 = rest
    aim = ease(0, 5, f) * (1 - ease(16, 21, f))   # raise bow, lower at the end
    draw = ease(4, 14, f) * (1 - ease(14.5, 16, f))  # pull string to the chin, release at f15
    return {
        'Spine02': [('y', -0.35 * aim)], 'Head': [('y', 0.35 * aim)],
        'L_Upperarm': [('x', -1.4 * aim), ('z', 0.15 * aim)], 'L_Forearm': [('x', -0.1 * aim)],
        'R_Upperarm': [('x', -1.35 * aim), ('y', (0.25 - 0.45 * draw) * aim)],
        'R_Forearm': [('y', (0.4 + 1.9 * draw) * aim)],
    }


make_action('idle', 120, idle)
make_action('run', 36, run_like(36, 0.6, 1.1, 0.45, 0.5, 0.1, 0.12))      # 0.6 s cycle (~10.5 rad/s like before)
make_action('sprint', 29, run_like(29, 0.85, 1.4, 0.75, 1.0, 0.25, 0.18))  # 0.48 s cycle (13 rad/s)
make_action('jump', 60, jump)
make_action('dash', 12, dash)
make_action('shoot', 21, shoot)
arm.animation_data.action = None
bpy.ops.object.mode_set(mode='OBJECT')

os.makedirs(OUT, exist_ok=True)
for o in list(bpy.data.objects):
    if o.name == 'Icosphere':
        bpy.data.objects.remove(o)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'may_anim.blend'))
bpy.ops.object.select_all(action='DESELECT')
arm.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.export_scene.gltf(
    filepath=os.path.join(OUT, 'may_anim.glb'), export_format='GLB', use_selection=True,
    export_animations=True, export_animation_mode='ACTIONS', export_force_sampling=True,
    export_frame_step=1, export_optimize_animation_size=False, export_skins=True)

# optional contact sheet: blender -b -P art/make_may_clips.py -- --render <png>
if '--render' in sys.argv:
    png = sys.argv[sys.argv.index('--render') + 1]
    import numpy as np
    # preview only (after export): the bow on her back is auto-weighted to legs/arms; may.js rebinds it
    # rigidly to Spine02 at load time, so do the same here to judge the poses
    for o in bpy.data.objects:
        if o.type == 'MESH' and any(s.material and s.material.name == 'Material_tripo_part_2' for s in o.material_slots):
            for g in list(o.vertex_groups):
                o.vertex_groups.remove(g)
            o.vertex_groups.new(name='Spine02').add(range(len(o.data.vertices)), 1.0, 'REPLACE')
    cam =bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = 1.2
    sc.collection.objects.link(cam); sc.camera = cam
    sc.render.engine = 'BLENDER_WORKBENCH'; sc.render.resolution_x = sc.render.resolution_y = 300
    sc.display.shading.color_type = 'TEXTURE'
    shots = [('idle', 0), ('run', 9), ('run', 27), ('sprint', 7), ('jump', 0), ('dash', 6), ('shoot', 5), ('shoot', 14)]
    views = [((0, -2, 0.42), (math.pi / 2, 0, 0)), ((2, 0, 0.42), (math.pi / 2, 0, math.pi / 2)), ((0.05, 0, 2.2), (0, 0, math.pi / 2))]
    rows = []
    tmp = os.path.join(os.path.dirname(png), '_shot.png')
    for loc, rot in views:
        row = []
        for act, fr in shots:
            for pb in pbs:  # bones a clip does not key would keep the previous clip's pose
                pb.rotation_quaternion = B0[pb.name]
            arm.animation_data.action = bpy.data.actions[act]
            sc.frame_set(fr)
            cam.location = loc; cam.rotation_euler = rot
            sc.render.filepath = tmp
            bpy.ops.render.render(write_still=True)
            im = bpy.data.images.load(tmp, check_existing=False)
            a = np.array(im.pixels[:]).reshape(im.size[1], im.size[0], 4)
            bpy.data.images.remove(im)
            row.append(a)
        rows.append(np.concatenate(row, axis=1))
    sheet = np.concatenate(rows[::-1], axis=0)
    img = bpy.data.images.new('sheet', sheet.shape[1], sheet.shape[0], alpha=True)
    img.pixels = sheet.ravel()
    img.filepath_raw = png; img.file_format = 'PNG'; img.save()
