/**
 * 5 посохов в 3D: процедурное моделирование на three.js → GLB (без Meshy/Blender).
 * Концепт-арты из Nano Banana (public/assets/images/staffs) — референс формы и цвета.
 *
 *   node scripts/build-staffs.mjs && sh scripts/optimize-models.sh
 *
 * Система координат модели: посох вдоль +Y, длина ≈ 1, точка хвата (запястье) в начале координат.
 * Меши с именем, начинающимся на "glow", игра подкрашивает цветом текущего заклинания.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

// GLTFExporter в бинарном режиме использует FileReader — в Node его нет
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = buf;
      this.onloadend?.();
      this.onload?.({ target: this });
    });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = `data:${blob.type};base64,${Buffer.from(buf).toString('base64')}`;
      this.onloadend?.();
      this.onload?.({ target: this });
    });
  }
};

const OUT = resolve(import.meta.dirname, '.cache/models');
mkdirSync(OUT, { recursive: true });

// --- материалы ---
const mat = (color, { rough = 0.7, metal = 0, emissive = 0x000000, emissiveIntensity = 0, opacity = 1 } = {}) =>
  new THREE.MeshStandardMaterial({
    color,
    roughness: rough,
    metalness: metal,
    emissive,
    emissiveIntensity,
    transparent: opacity < 1,
    opacity,
  });
const glowMat = (color, intensity = 1.1, opacity = 1) =>
  mat(color, { rough: 0.25, emissive: color, emissiveIntensity: intensity, opacity });
const GOLD = () => mat(0xd9a93c, { rough: 0.3, metal: 0.9 });

// --- примитивы ---
function mesh(geo, material, name) {
  const m = new THREE.Mesh(geo, material);
  if (name) m.name = name;
  return m;
}

/** Древко: цилиндр от y0 до y1; gnarl > 0 — кривой «живой» ствол. */
function shaft(y0, y1, r0, r1, material, gnarl = 0) {
  const h = y1 - y0;
  const geo = new THREE.CylinderGeometry(r1, r0, h, 12, 32);
  if (gnarl) {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const a = Math.atan2(p.getZ(i), p.getX(i));
      const bump = 1 + gnarl * (Math.sin(y * 38 + a * 3) * 0.5 + Math.sin(y * 91 - a * 2) * 0.3);
      p.setX(i, p.getX(i) * bump + Math.sin(y * 9) * gnarl * 0.02);
      p.setZ(i, p.getZ(i) * bump);
    }
    geo.computeVertexNormals();
  }
  geo.translate(0, y0 + h / 2, 0);
  return mesh(geo, material, 'shaft');
}

function band(y, r, material, tube = 0.006) {
  const geo = new THREE.TorusGeometry(r, tube, 8, 24);
  geo.rotateX(Math.PI / 2);
  geo.translate(0, y, 0);
  return mesh(geo, material, 'band');
}

function tube(points, r, material, name) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  return mesh(new THREE.TubeGeometry(curve, 48, r, 8, false), material, name);
}

function orb(y, r, material, name = 'glow_orb') {
  const geo = new THREE.IcosahedronGeometry(r, 3);
  geo.translate(0, y, 0);
  return mesh(geo, material, name);
}

function crystal(pos, len, r, tilt, material) {
  const geo = new THREE.OctahedronGeometry(r, 0);
  geo.scale(1, len / (2 * r), 1);
  geo.translate(0, len / 2, 0);
  const m = mesh(geo, material, 'glow_crystal');
  m.position.set(...pos);
  m.rotation.set(tilt[0], 0, tilt[1]);
  return m;
}

function leaf(pos, rot, material) {
  const geo = new THREE.SphereGeometry(0.02, 8, 6);
  geo.scale(1, 0.18, 0.55);
  const m = mesh(geo, material, 'leaf');
  m.position.set(...pos);
  m.rotation.set(...rot);
  return m;
}

// --- посохи ---
const staffs = {
  staff_apprentice() {
    const g = new THREE.Group();
    const wood = mat(0xb88a55, { rough: 0.85 });
    g.add(shaft(-0.4, 0.56, 0.017, 0.013, wood));
    g.add(band(-0.04, 0.019, mat(0x4a3322), 0.007), band(0.04, 0.019, mat(0x4a3322), 0.007));
    // завиток навершия
    const curl = [];
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      const a = t * Math.PI * 1.6;
      const r = 0.06 * (1 - t * 0.45);
      curl.push([Math.sin(a) * r, 0.56 + (1 - Math.cos(a)) * r * 0.9 + t * 0.03, 0]);
    }
    g.add(tube(curl, 0.012, wood, 'curl'));
    g.add(orb(0.625, 0.036, glowMat(0x3f8cff, 1.3)));
    g.add(orb(-0.41, 0.018, mat(0x6b4a2c), 'pommel'));
    return g;
  },

  staff_oak() {
    const g = new THREE.Group();
    const bark = mat(0x5a3a22, { rough: 0.95 });
    g.add(shaft(-0.42, 0.52, 0.024, 0.019, bark, 0.12));
    // ветви-«пальцы», держащие огненный шар
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      const [c, s] = [Math.cos(a), Math.sin(a)];
      g.add(
        tube(
          [
            [c * 0.012, 0.5, s * 0.012],
            [c * 0.05, 0.56, s * 0.05],
            [c * 0.06, 0.63, s * 0.06],
            [c * 0.025, 0.7, s * 0.025],
          ],
          0.008,
          bark,
          'branch',
        ),
      );
    }
    g.add(orb(0.62, 0.05, glowMat(0xff6a10, 1.4)));
    const green = mat(0x4f9a3a, { rough: 0.8 });
    g.add(
      leaf([0.035, 0.5, 0.01], [0.3, 0.2, -0.6], green),
      leaf([-0.03, 0.47, 0.02], [0.1, -0.4, 0.7], green),
      leaf([0.01, 0.53, -0.035], [-0.6, 0.3, 0.2], green),
      leaf([0.028, 0.2, 0.0], [0.2, 0.0, -0.9], green),
    );
    return g;
  },

  staff_ice() {
    const g = new THREE.Group();
    const silver = mat(0xbcd3e6, { rough: 0.3, metal: 0.8 });
    g.add(shaft(-0.42, 0.56, 0.015, 0.013, silver));
    g.add(band(0.52, 0.02, silver, 0.008), band(-0.05, 0.018, silver), band(0.05, 0.018, silver));
    const ice = glowMat(0x5fd0ff, 0.9, 0.85);
    g.add(crystal([0, 0.55, 0], 0.26, 0.035, [0, 0], ice));
    g.add(crystal([0.015, 0.56, 0.0], 0.15, 0.022, [0.15, -0.5], ice));
    g.add(crystal([-0.015, 0.56, 0.01], 0.14, 0.02, [-0.2, 0.55], ice));
    g.add(crystal([0.0, 0.56, 0.015], 0.12, 0.018, [0.6, 0.1], ice));
    g.add(crystal([0.0, 0.56, -0.015], 0.11, 0.017, [-0.6, -0.1], ice));
    g.add(crystal([0, -0.42, 0], 0.07, 0.014, [Math.PI, 0], ice));
    return g;
  },

  staff_thunder() {
    const g = new THREE.Group();
    const iron = mat(0x2c3040, { rough: 0.45, metal: 0.75 });
    const gold = GOLD();
    g.add(shaft(-0.42, 0.52, 0.017, 0.015, iron));
    g.add(band(0.5, 0.022, gold, 0.008), band(0.25, 0.019, gold), band(-0.05, 0.02, gold), band(-0.4, 0.019, gold));
    // три зубца-когтя вокруг сферы
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      const [c, s] = [Math.cos(a), Math.sin(a)];
      g.add(
        tube(
          [
            [c * 0.015, 0.5, s * 0.015],
            [c * 0.07, 0.56, s * 0.07],
            [c * 0.075, 0.64, s * 0.075],
            [c * 0.035, 0.72, s * 0.035],
          ],
          0.007,
          gold,
          'prong',
        ),
      );
    }
    g.add(orb(0.625, 0.042, glowMat(0xffd21f, 1.4)));
    // плоская молния-плавник
    const bolt = new THREE.Shape();
    [
      [0, 0],
      [0.03, 0.05],
      [0.012, 0.05],
      [0.04, 0.11],
      [-0.005, 0.045],
      [0.013, 0.045],
    ].forEach(([x, y], i) => (i ? bolt.lineTo(x, y) : bolt.moveTo(x, y)));
    const fin = new THREE.ExtrudeGeometry(bolt, { depth: 0.004, bevelEnabled: false });
    fin.translate(0.012, 0.36, -0.002);
    g.add(mesh(fin, glowMat(0xffd21f, 1.2), 'glow_fin'));
    return g;
  },

  staff_archmage() {
    const g = new THREE.Group();
    const ivory = mat(0xf1ead8, { rough: 0.35, metal: 0.1 });
    const gold = GOLD();
    g.add(shaft(-0.44, 0.54, 0.017, 0.015, ivory));
    // золотая спираль по древку
    const helix = [];
    for (let i = 0; i <= 60; i++) {
      const t = i / 60;
      const a = t * Math.PI * 10;
      helix.push([Math.cos(a) * 0.019, -0.35 + t * 0.85, Math.sin(a) * 0.019]);
    }
    g.add(tube(helix, 0.004, gold, 'helix'));
    // полумесяц вокруг парящей сферы
    const crescent = new THREE.TorusGeometry(0.09, 0.011, 10, 40, Math.PI * 1.45);
    crescent.rotateZ(-Math.PI / 2 - Math.PI * 0.725 + Math.PI);
    crescent.translate(0, 0.64, 0);
    g.add(mesh(crescent, gold, 'crescent'));
    g.add(orb(0.64, 0.045, glowMat(0x9b4dff, 1.4)));
    const star = glowMat(0xffe27a, 1.4);
    [
      [0.1, 0.72, 0.03],
      [-0.09, 0.7, -0.03],
      [0.02, 0.77, -0.05],
    ].forEach((p) => {
      const s = mesh(new THREE.OctahedronGeometry(0.012, 0), star, 'glow_star');
      s.position.set(...p);
      g.add(s);
    });
    g.add(band(0.54, 0.02, gold, 0.008), orb(-0.45, 0.02, gold, 'pommel'));
    return g;
  },
};

const exporter = new GLTFExporter();
for (const [id, build] of Object.entries(staffs)) {
  const scene = new THREE.Scene();
  const staff = build();
  staff.name = id;
  scene.add(staff);
  const glb = await exporter.parseAsync(scene, { binary: true });
  writeFileSync(resolve(OUT, `${id}.glb`), Buffer.from(glb));
  console.log(`✓ ${id}.glb ${(glb.byteLength / 1024).toFixed(0)} KB`);
}
