"use client";

// STYLIZED 3D BATTING (experimental, hidden route /prototype-3d).
// Pass 2: a proper stadium (sky dome, floodlights, boundary, stands, creases),
// filmic tone mapping, ball bounce physics, a bat swing with a motion trail,
// and a SIX celebration (particle burst + camera follows the ball). Still a
// standalone demo — does NOT touch the simulation / draft core.
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

type Hud = { runs: number; balls: number; wkts: number; last: string; lastKind: string };

const CONTACT_Z = 2.0;
const CONTACT_TOL = 1.0;
const TRAVEL_MS = 1500;
const STUMP_X = 0.5;

export default function Prototype3D() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [hud, setHud] = useState<Hud>({ runs: 0, balls: 0, wkts: 0, last: "Tap or press Space as the ball arrives", lastKind: "idle" });
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!started) return;
    const mount = mountRef.current;
    if (!mount) return;
    const W = mount.clientWidth, H = mount.clientHeight;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x08121c, 30, 90);

    const camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 300);
    const camHome = new THREE.Vector3(0, 3.2, 6.4);
    camera.position.copy(camHome);
    camera.lookAt(0, 1.2, -8);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    // --- Sky dome (gradient: deep navy top -> teal horizon glow) ---
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(140, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        uniforms: { top: { value: new THREE.Color(0x05080d) }, bot: { value: new THREE.Color(0x0e3550) } },
        vertexShader: `varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 top; uniform vec3 bot; varying float h; void main(){ gl_FragColor = vec4(mix(bot, top, clamp(h*1.4+0.2,0.0,1.0)), 1.0); }`,
      })
    );
    scene.add(sky);

    // --- Lights ---
    scene.add(new THREE.AmbientLight(0x889aae, 0.8));
    const key = new THREE.DirectionalLight(0xffffff, 2.0);
    key.position.set(6, 16, 4);
    scene.add(key);
    const teal = new THREE.PointLight(0x22e6a8, 60, 60, 2);
    teal.position.set(-10, 7, 0);
    scene.add(teal);
    const gold = new THREE.PointLight(0xe8b34c, 40, 60, 2);
    gold.position.set(10, 6, -10);
    scene.add(gold);

    // --- Field (dark green, lit center) + boundary rope ---
    const field = new THREE.Mesh(
      new THREE.CircleGeometry(40, 48),
      new THREE.MeshStandardMaterial({ color: 0x0d3a22, roughness: 1 })
    );
    field.rotation.x = -Math.PI / 2;
    field.position.set(0, 0, -8);
    scene.add(field);

    const rope = new THREE.Mesh(
      new THREE.TorusGeometry(38, 0.18, 8, 64),
      new THREE.MeshStandardMaterial({ color: 0xf1ece0, emissive: 0x111111 })
    );
    rope.rotation.x = -Math.PI / 2;
    rope.position.set(0, 0.05, -8);
    scene.add(rope);

    // --- Pitch + crease lines ---
    const pitch = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 26),
      new THREE.MeshStandardMaterial({ color: 0xcbb98c, roughness: 0.95 })
    );
    pitch.rotation.x = -Math.PI / 2;
    pitch.position.set(0, 0.02, -8);
    scene.add(pitch);
    const creaseMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    for (const cz of [CONTACT_Z + 0.4, -18]) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 0.08), creaseMat);
      line.rotation.x = -Math.PI / 2;
      line.position.set(0, 0.03, cz);
      scene.add(line);
    }

    // --- Stands ring + floodlight pylons ---
    const stands = new THREE.Mesh(
      new THREE.CylinderGeometry(40, 40, 7, 64, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x11202e, side: THREE.DoubleSide, roughness: 1 })
    );
    stands.position.set(0, 3.5, -8);
    scene.add(stands);
    // crowd speckle (emissive dots)
    const speckGeo = new THREE.BufferGeometry();
    const sp: number[] = [];
    for (let i = 0; i < 1200; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 39.5;
      sp.push(Math.cos(a) * r, 1.5 + Math.random() * 5, -8 + Math.sin(a) * r);
    }
    speckGeo.setAttribute("position", new THREE.Float32BufferAttribute(sp, 3));
    scene.add(new THREE.Points(speckGeo, new THREE.PointsMaterial({ color: 0x9fb4c6, size: 0.14, sizeAttenuation: true })));

    for (const [px, pz] of [[-26, 14], [26, 14], [-26, -30], [26, -30]]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 24, 8), new THREE.MeshStandardMaterial({ color: 0x2a3a48 }));
      pole.position.set(px, 12, pz);
      scene.add(pole);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(3, 1.6, 0.4), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2cc, emissiveIntensity: 2 }));
      lamp.position.set(px, 24, pz > 0 ? pz - 0.5 : pz + 0.5);
      lamp.lookAt(0, 0, -8);
      scene.add(lamp);
    }

    // --- Stumps ---
    const stumpMat = new THREE.MeshStandardMaterial({ color: 0xf1ece0, roughness: 0.6 });
    const stumps = new THREE.Group();
    for (let i = -1; i <= 1; i++) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 10), stumpMat);
      s.position.set(i * 0.22, 0.5, 0);
      stumps.add(s);
    }
    stumps.position.set(0, 0, CONTACT_Z + 0.8);
    scene.add(stumps);

    // --- Bat + swing trail ---
    const batPivot = new THREE.Group();
    batPivot.position.set(0.55, 0.95, CONTACT_Z);
    const bat = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 1.05, 0.14),
      new THREE.MeshStandardMaterial({ color: 0xe8b34c, roughness: 0.4, metalness: 0.15, emissive: 0x3a2a00, emissiveIntensity: 0.4 })
    );
    bat.position.set(0, -0.38, 0);
    batPivot.add(bat);
    batPivot.rotation.z = 0.6;
    scene.add(batPivot);

    // --- Ball ---
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 24, 24),
      new THREE.MeshStandardMaterial({ color: 0xe23b2f, roughness: 0.35, emissive: 0x3a0a06, emissiveIntensity: 0.3 })
    );
    scene.add(ball);

    // --- Six celebration particles ---
    const pcount = 160;
    const pgeo = new THREE.BufferGeometry();
    pgeo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(pcount * 3), 3));
    const pvel: THREE.Vector3[] = Array.from({ length: pcount }, () => new THREE.Vector3());
    const particles = new THREE.Points(pgeo, new THREE.PointsMaterial({ color: 0x22e6a8, size: 0.22, transparent: true, opacity: 0 }));
    scene.add(particles);
    let partLife = 0;
    function burst(at: THREE.Vector3, color: number) {
      (particles.material as THREE.PointsMaterial).color.set(color);
      (particles.material as THREE.PointsMaterial).opacity = 1;
      const pos = pgeo.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < pcount; i++) {
        pos.setXYZ(i, at.x, at.y, at.z);
        pvel[i].set((Math.random() - 0.5) * 10, Math.random() * 10, (Math.random() - 0.5) * 10);
      }
      pos.needsUpdate = true;
      partLife = 1;
    }

    // --- Game state ---
    let runs = 0, balls = 0, wkts = 0;
    type Phase = "incoming" | "flying" | "resolved";
    let phase: Phase = "incoming";
    let deliveryStart = performance.now();
    let laneX = (Math.random() - 0.5) * 0.7;
    let swung = false;
    let camFollow = false;
    const vel = new THREE.Vector3();
    let resolveAt = 0;

    function pushHud(last: string, lastKind: string) { setHud({ runs, balls, wkts, last, lastKind }); }
    function newDelivery() {
      phase = "incoming"; swung = false; camFollow = false;
      laneX = (Math.random() - 0.5) * 0.7;
      deliveryStart = performance.now();
    }
    function resolve(last: string, kind: string, delay = 1300) {
      phase = "resolved"; balls += 1; pushHud(last, kind); resolveAt = performance.now() + delay;
    }
    function swing() {
      if (phase !== "incoming" || swung) return;
      swung = true;
      batPivot.rotation.z = -0.9;
      const z = ball.position.z;
      const q = 1 - Math.abs(z - CONTACT_Z) / CONTACT_TOL;
      if (q <= 0) return; // air swing; stumps check on pass
      phase = "flying";
      const contact = ball.position.clone();
      if (q > 0.72) { runs += 6; vel.set((Math.random() - 0.5) * 4, 11, -18); camFollow = true; burst(contact, 0x22e6a8); resolve("SIX! 🎯", "six"); }
      else if (q > 0.4) { runs += 4; vel.set((Math.random() - 0.5) * 7, 3, -15); burst(contact, 0xe8b34c); resolve("FOUR 🏏", "four"); }
      else { runs += 1; vel.set((Math.random() - 0.5) * 6, 2.5, 5); resolve("Edged — 1 run", "one"); }
    }

    const onPointer = () => swing();
    const onKey = (e: KeyboardEvent) => { if (e.code === "Space") { e.preventDefault(); swing(); } };
    renderer.domElement.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    const onResize = () => {
      const w = mount.clientWidth, h = mount.clientHeight;
      camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    let raf = 0, prev = performance.now();
    function frame(now: number) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min((now - prev) / 1000, 0.05);
      prev = now;

      if (phase === "incoming") {
        const p = (now - deliveryStart) / TRAVEL_MS;
        if (p >= 1.25) {
          if (Math.abs(laneX) < STUMP_X) { wkts += 1; burst(stumps.position.clone().setY(0.6), 0xf2545b); resolve("BOWLED! OUT", "out"); }
          else resolve(swung ? "Missed" : "Left it", "dot");
        } else {
          ball.position.z = THREE.MathUtils.lerp(-18, CONTACT_Z + 1.2, p);
          ball.position.x = laneX;
          // parabolic bounce around mid-pitch
          const bounce = Math.abs(Math.sin(p * Math.PI * 1.1));
          ball.position.y = 0.16 + (1.3 - bounce * 1.15) * (1 - p * 0.2);
          if (ball.position.y < 0.16) ball.position.y = 0.16;
          ball.rotation.x -= 0.5;
        }
      } else if (phase === "flying") {
        vel.y -= 18 * dt;
        ball.position.addScaledVector(vel, dt);
        ball.rotation.x -= 0.3;
        if (ball.position.y < 0.16) { ball.position.y = 0.16; vel.y *= -0.4; vel.multiplyScalar(0.6); }
      }

      // particles
      if (partLife > 0) {
        partLife -= dt * 0.8;
        const pos = pgeo.getAttribute("position") as THREE.BufferAttribute;
        for (let i = 0; i < pcount; i++) {
          pvel[i].y -= 14 * dt;
          pos.setXYZ(i, pos.getX(i) + pvel[i].x * dt, Math.max(0.05, pos.getY(i) + pvel[i].y * dt), pos.getZ(i) + pvel[i].z * dt);
        }
        pos.needsUpdate = true;
        (particles.material as THREE.PointsMaterial).opacity = Math.max(0, partLife);
      }

      if (phase === "resolved" && now >= resolveAt) {
        ball.position.set(laneX, 1.3, -18); ball.rotation.set(0, 0, 0); newDelivery();
      }

      // camera: follow the ball on a six, else ease home
      const target = camFollow ? camera.position.clone().lerp(new THREE.Vector3(ball.position.x * 0.4, 5, 8), 0.04) : camera.position.clone().lerp(camHome, 0.06);
      camera.position.copy(target);
      camera.lookAt(camFollow ? ball.position : new THREE.Vector3(0, 1.2, -8));

      // ease bat back to ready
      batPivot.rotation.z += (0.6 - batPivot.rotation.z) * 0.1;
      renderer.render(scene, camera);
    }
    ball.position.set(laneX, 1.3, -18);
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      renderer.domElement.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        if (m.material) {
          const mat = m.material as THREE.Material | THREE.Material[];
          if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
          else mat.dispose();
        }
      });
    };
  }, [started]);

  const kindColor: Record<string, string> = {
    six: "text-accent", four: "text-accent", one: "text-gold",
    out: "text-danger", dot: "text-foreground-muted", idle: "text-foreground-muted",
  };

  return (
    <main className="flex-1 flex flex-col">
      <div className="px-4 pt-4 pb-2 text-center">
        <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-gold">Experimental · 3D Prototype</p>
        <div className="mt-2 flex items-center justify-center gap-5 text-sm">
          <span className="font-mono"><b className="text-accent text-lg">{hud.runs}</b> runs</span>
          <span className="font-mono text-foreground-muted">{hud.balls} balls</span>
          <span className="font-mono"><b className="text-danger">{hud.wkts}</b> out</span>
        </div>
        <p className={`mt-1 text-lg font-black italic ${kindColor[hud.lastKind] ?? "text-foreground"}`}>{hud.last}</p>
      </div>

      <div className="relative mx-auto w-full max-w-2xl flex-1 min-h-[60vh]">
        <div ref={mountRef} className="absolute inset-0 rounded-2xl overflow-hidden border border-border" />
        {!started && (
          <button
            type="button"
            onClick={() => setStarted(true)}
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-2xl bg-black/50 backdrop-blur-sm"
          >
            <span className="text-2xl font-black italic text-accent">Tap to Bat 🏏</span>
            <span className="text-sm text-foreground-muted">Time your shot — tap or press Space as the ball arrives</span>
          </button>
        )}
      </div>

      <p className="px-4 py-3 text-center text-xs text-foreground-muted">
        Prototype only — not part of the main game. Tap / click / Space to swing.
      </p>
    </main>
  );
}
