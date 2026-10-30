"use client";

// STYLIZED 3D BATTING (experimental, hidden route /prototype-3d).
// Pass 3-5: low-poly batsman + bowler with a run-up/release and a batting swing;
// over-the-shoulder camera with a six-follow; field lighting; shot direction;
// optional sound (muted by default, WebAudio, no asset files); and a batting
// LINEUP where each batter's rating sets the timing window + power. Standalone
// demo — does NOT touch the simulation / draft core. (When promoted to a real
// in-game mode it reads the user's actual drafted XI; here it uses a sample XI.)
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

type Hud = { runs: number; wkts: number; balls: number; last: string; kind: string; batter: string; rating: number };

const CONTACT_Z = 2.0;
const TRAVEL_MS = 1500;
const RUNUP_MS = 900;
const STUMP_X = 0.5;

// Sample XI (name + batting rating). A real in-game mode swaps this for the
// drafted XI; ratings here drive the feel so the integration is demonstrable.
const LINEUP = [
  { name: "R. Sharma", rating: 90 },
  { name: "V. Kohli", rating: 93 },
  { name: "S. Gill", rating: 85 },
  { name: "S. Samson", rating: 82 },
  { name: "H. Pandya", rating: 80 },
  { name: "R. Pant", rating: 86 },
  { name: "R. Jadeja", rating: 74 },
];

function makeHumanoid(skin: number, kit: number) {
  const g = new THREE.Group();
  const kitMat = new THREE.MeshStandardMaterial({ color: kit, roughness: 0.8 });
  const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.7 });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 16), skinMat);
  head.position.y = 1.62;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.62, 0.26), kitMat);
  torso.position.y = 1.15;
  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.26), kitMat);
  hips.position.y = 0.8;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.8, 0.18), kitMat);
  legL.position.set(-0.1, 0.4, 0);
  const legR = legL.clone(); legR.position.x = 0.1;
  const shoulders = new THREE.Group(); shoulders.position.y = 1.38;
  const armL = new THREE.Group(); const armLmesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.6, 0.12), skinMat);
  armLmesh.position.y = -0.3; armL.add(armLmesh); armL.position.set(-0.27, 0, 0);
  const armR = new THREE.Group(); const armRmesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.6, 0.12), skinMat);
  armRmesh.position.y = -0.3; armR.add(armRmesh); armR.position.set(0.27, 0, 0);
  shoulders.add(armL, armR);
  g.add(head, torso, hips, legL, legR, shoulders);
  return { group: g, shoulders, armL, armR };
}

export default function Prototype3D() {
  const mountRef = useRef<HTMLDivElement>(null);
  const soundOnRef = useRef(false);
  const [soundOn, setSoundOn] = useState(false);
  const [started, setStarted] = useState(false);
  const [hud, setHud] = useState<Hud>({ runs: 0, wkts: 0, balls: 0, last: "Time your shot", kind: "idle", batter: LINEUP[0].name, rating: LINEUP[0].rating });

  useEffect(() => {
    if (!started) return;
    const mount = mountRef.current;
    if (!mount) return;
    const W = mount.clientWidth, H = mount.clientHeight;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x08121c, 34, 95);
    const camera = new THREE.PerspectiveCamera(52, W / H, 0.1, 320);
    const camHome = new THREE.Vector3(1.3, 3.5, 7.2);
    camera.position.copy(camHome);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    // sky dome
    scene.add(new THREE.Mesh(
      new THREE.SphereGeometry(150, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        uniforms: { top: { value: new THREE.Color(0x05080d) }, bot: { value: new THREE.Color(0x103a56) } },
        vertexShader: `varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);} `,
        fragmentShader: `uniform vec3 top; uniform vec3 bot; varying float h; void main(){ gl_FragColor = vec4(mix(bot,top,clamp(h*1.5+0.25,0.0,1.0)),1.0);} `,
      })
    ));

    // lights (brighter field)
    scene.add(new THREE.AmbientLight(0x9fb2c4, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(6, 18, 6); scene.add(key);
    const fieldLight = new THREE.PointLight(0xdfeaff, 120, 70, 2); fieldLight.position.set(0, 16, -6); scene.add(fieldLight);
    const teal = new THREE.PointLight(0x22e6a8, 50, 60, 2); teal.position.set(-12, 7, 2); scene.add(teal);
    const gold = new THREE.PointLight(0xe8b34c, 36, 60, 2); gold.position.set(12, 6, -12); scene.add(gold);

    // field + boundary + pitch + creases
    const field = new THREE.Mesh(new THREE.CircleGeometry(42, 48), new THREE.MeshStandardMaterial({ color: 0x115a33, roughness: 1 }));
    field.rotation.x = -Math.PI / 2; field.position.z = -8; scene.add(field);
    const rope = new THREE.Mesh(new THREE.TorusGeometry(40, 0.2, 8, 72), new THREE.MeshStandardMaterial({ color: 0xf1ece0 }));
    rope.rotation.x = -Math.PI / 2; rope.position.set(0, 0.06, -8); scene.add(rope);
    const pitch = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 26), new THREE.MeshStandardMaterial({ color: 0xcbb98c, roughness: 0.95 }));
    pitch.rotation.x = -Math.PI / 2; pitch.position.set(0, 0.02, -8); scene.add(pitch);
    const creaseMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    for (const cz of [CONTACT_Z + 0.4, -18]) {
      const l = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 0.08), creaseMat);
      l.rotation.x = -Math.PI / 2; l.position.set(0, 0.03, cz); scene.add(l);
    }

    // stands + crowd + floodlights
    scene.add(Object.assign(new THREE.Mesh(new THREE.CylinderGeometry(42, 42, 8, 64, 1, true), new THREE.MeshStandardMaterial({ color: 0x12222f, side: THREE.DoubleSide })), { position: new THREE.Vector3(0, 4, -8) }));
    const sp: number[] = [];
    for (let i = 0; i < 1400; i++) { const a = Math.random() * Math.PI * 2; sp.push(Math.cos(a) * 41.5, 1.5 + Math.random() * 6, -8 + Math.sin(a) * 41.5); }
    const speck = new THREE.BufferGeometry(); speck.setAttribute("position", new THREE.Float32BufferAttribute(sp, 3));
    scene.add(new THREE.Points(speck, new THREE.PointsMaterial({ color: 0xaebccb, size: 0.15 })));
    for (const [px, pz] of [[-28, 16], [28, 16], [-28, -32], [28, -32]]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 26, 8), new THREE.MeshStandardMaterial({ color: 0x2a3a48 }));
      pole.position.set(px, 13, pz); scene.add(pole);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.8, 0.4), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2cc, emissiveIntensity: 2.2 }));
      lamp.position.set(px, 26, pz > 0 ? pz - 0.5 : pz + 0.5); lamp.lookAt(0, 0, -8); scene.add(lamp);
    }

    // stumps
    const stumps = new THREE.Group();
    const stumpMat = new THREE.MeshStandardMaterial({ color: 0xf1ece0 });
    for (let i = -1; i <= 1; i++) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 10), stumpMat); s.position.set(i * 0.22, 0.5, 0); stumps.add(s); }
    stumps.position.set(0, 0, CONTACT_Z + 0.85); scene.add(stumps);

    // batsman (holds the bat) + bowler
    const batsman = makeHumanoid(0x8d5a3b, 0x17356b);
    batsman.group.position.set(0.55, 0, CONTACT_Z); batsman.group.rotation.y = -0.2; scene.add(batsman.group);
    const bat = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.0, 0.13), new THREE.MeshStandardMaterial({ color: 0xe8b34c, metalness: 0.15, roughness: 0.4 }));
    bat.position.set(0, -0.5, 0.1);
    const batSwing = new THREE.Group(); batSwing.position.set(0.2, 1.3, CONTACT_Z); batSwing.add(bat); batSwing.rotation.z = 0.7; scene.add(batSwing);

    const bowler = makeHumanoid(0x8d5a3b, 0xb23b2f);
    bowler.group.position.set(0.2, 0, -18); bowler.group.rotation.y = Math.PI; scene.add(bowler.group);

    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 24), new THREE.MeshStandardMaterial({ color: 0xe23b2f, roughness: 0.35, emissive: 0x3a0a06, emissiveIntensity: 0.3 }));
    scene.add(ball);

    // six particles
    const pc = 160, pgeo = new THREE.BufferGeometry();
    pgeo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(pc * 3), 3));
    const pvel = Array.from({ length: pc }, () => new THREE.Vector3());
    const parts = new THREE.Points(pgeo, new THREE.PointsMaterial({ color: 0x22e6a8, size: 0.24, transparent: true, opacity: 0 }));
    scene.add(parts); let plife = 0;
    function burst(at: THREE.Vector3, color: number) {
      (parts.material as THREE.PointsMaterial).color.set(color);
      const pos = pgeo.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < pc; i++) { pos.setXYZ(i, at.x, at.y, at.z); pvel[i].set((Math.random() - 0.5) * 11, Math.random() * 11, (Math.random() - 0.5) * 11); }
      pos.needsUpdate = true; plife = 1;
    }

    // --- WebAudio (muted by default; synthesized, no files) ---
    let actx: AudioContext | null = null;
    function audio() { if (!actx) actx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)(); return actx; }
    function thock() {
      if (!soundOnRef.current) return; const c = audio(); const o = c.createOscillator(); const g = c.createGain();
      o.type = "triangle"; o.frequency.setValueAtTime(220, c.currentTime); o.frequency.exponentialRampToValueAtTime(80, c.currentTime + 0.12);
      g.gain.setValueAtTime(0.5, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.18);
      o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + 0.2);
    }
    function cheer() {
      if (!soundOnRef.current) return; const c = audio(); const buf = c.createBuffer(1, c.sampleRate * 1.2, c.sampleRate); const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.min(1, i / (c.sampleRate * 0.2)) * Math.max(0, 1 - i / d.length);
      const src = c.createBufferSource(); src.buffer = buf; const f = c.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 900;
      const g = c.createGain(); g.gain.value = 0.25; src.connect(f).connect(g).connect(c.destination); src.start();
    }

    // --- Game state ---
    let runs = 0, wkts = 0, balls = 0, bi = 0;
    type Phase = "runup" | "incoming" | "flying" | "resolved";
    let phase: Phase = "runup";
    let phaseStart = performance.now();
    let laneX = (Math.random() - 0.5) * 0.7, swung = false, camFollow = false, resolveAt = 0;
    const vel = new THREE.Vector3();

    function push(last: string, kind: string) { setHud({ runs, wkts, balls, last, kind, batter: LINEUP[Math.min(bi, LINEUP.length - 1)].name, rating: LINEUP[Math.min(bi, LINEUP.length - 1)].rating }); }
    function nextDelivery() { phase = "runup"; phaseStart = performance.now(); swung = false; camFollow = false; laneX = (Math.random() - 0.5) * 0.7; }
    function wicket(msg: string) {
      wkts += 1; bi += 1; balls += 1; burst(stumps.position.clone().setY(0.6), 0xf2545b); phase = "resolved"; resolveAt = performance.now() + 1400;
      if (bi >= LINEUP.length) push("ALL OUT — " + runs + " runs", "out"); else push(msg, "out");
    }
    function resolve(last: string, kind: string) { phase = "resolved"; balls += 1; push(last, kind); resolveAt = performance.now() + 1300; }

    function swing() {
      if (phase !== "incoming" || swung) return;
      swung = true; batSwing.rotation.z = -1.0; batsman.shoulders.rotation.y = -0.9;
      const rating = LINEUP[Math.min(bi, LINEUP.length - 1)].rating;
      const tol = 0.7 + (rating - 70) / 40; // better batter = wider timing window
      const q = 1 - Math.abs(ball.position.z - CONTACT_Z) / tol;
      if (q <= 0) return;
      phase = "flying"; thock();
      const powerBoost = (rating - 70) / 60;
      if (q > 0.72) { runs += 6; vel.set((Math.random() - 0.5) * 5, 11 + powerBoost * 3, -18 - powerBoost * 4); camFollow = true; burst(ball.position.clone(), 0x22e6a8); cheer(); resolve("SIX! 🎯", "six"); }
      else if (q > 0.4) { runs += 4; vel.set((Math.random() - 0.5) * 8, 3, -15); burst(ball.position.clone(), 0xe8b34c); resolve("FOUR 🏏", "four"); }
      else { runs += 2; vel.set((Math.random() - 0.5) * 7, 2.5, 4); resolve("Worked away — 2", "one"); }
    }

    const onPointer = () => swing();
    const onKey = (e: KeyboardEvent) => { if (e.code === "Space") { e.preventDefault(); swing(); } };
    renderer.domElement.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    const onResize = () => { const w = mount.clientWidth, h = mount.clientHeight; camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h); };
    window.addEventListener("resize", onResize);

    let raf = 0, prev = performance.now();
    function frame(now: number) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min((now - prev) / 1000, 0.05); prev = now;

      if (phase === "runup") {
        const p = (now - phaseStart) / RUNUP_MS;
        bowler.group.position.z = -18 + p * 2.2;
        bowler.armR.rotation.x = -p * Math.PI * 2; // windmill
        ball.position.set(0.2, 1.4, bowler.group.position.z + 0.3);
        if (p >= 1) { phase = "incoming"; phaseStart = now; bowler.armR.rotation.x = 0; }
      } else if (phase === "incoming") {
        const p = (now - phaseStart) / TRAVEL_MS;
        if (p >= 1.25) {
          if (Math.abs(laneX) < STUMP_X) wicket("BOWLED! OUT");
          else resolve(swung ? "Missed" : "Left it", "dot");
        } else {
          ball.position.z = THREE.MathUtils.lerp(-16, CONTACT_Z + 1.2, p);
          ball.position.x = laneX;
          const bounce = Math.abs(Math.sin(p * Math.PI * 1.1));
          ball.position.y = Math.max(0.16, 0.16 + (1.3 - bounce * 1.15) * (1 - p * 0.2));
          ball.rotation.x -= 0.5;
        }
      } else if (phase === "flying") {
        vel.y -= 18 * dt; ball.position.addScaledVector(vel, dt); ball.rotation.x -= 0.3;
        if (ball.position.y < 0.16) { ball.position.y = 0.16; vel.y *= -0.4; vel.multiplyScalar(0.6); }
      }

      if (plife > 0) {
        plife -= dt * 0.8; const pos = pgeo.getAttribute("position") as THREE.BufferAttribute;
        for (let i = 0; i < pc; i++) { pvel[i].y -= 14 * dt; pos.setXYZ(i, pos.getX(i) + pvel[i].x * dt, Math.max(0.05, pos.getY(i) + pvel[i].y * dt), pos.getZ(i) + pvel[i].z * dt); }
        pos.needsUpdate = true; (parts.material as THREE.PointsMaterial).opacity = Math.max(0, plife);
      }

      if (phase === "resolved" && now >= resolveAt) {
        if (bi >= LINEUP.length) { runs = 0; wkts = 0; bi = 0; } // new innings
        bowler.group.position.z = -18; ball.position.set(0.2, 1.4, -17.7); ball.rotation.set(0, 0, 0); nextDelivery();
      }

      // camera
      if (camFollow) { camera.position.lerp(new THREE.Vector3(ball.position.x * 0.4, 5, 8), 0.04); camera.lookAt(ball.position); }
      else { camera.position.lerp(camHome, 0.06); camera.lookAt(0, 1.2, -8); }

      // ease bat + shoulders back to ready
      batSwing.rotation.z += (0.7 - batSwing.rotation.z) * 0.1;
      batsman.shoulders.rotation.y += (0 - batsman.shoulders.rotation.y) * 0.1;
      renderer.render(scene, camera);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      renderer.domElement.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      if (actx) actx.close();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        if (m.material) { const mat = m.material as THREE.Material | THREE.Material[]; if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat.dispose(); }
      });
    };
  }, [started]);

  const kc: Record<string, string> = { six: "text-accent", four: "text-accent", one: "text-gold", out: "text-danger", dot: "text-foreground-muted", idle: "text-foreground-muted" };

  return (
    <main className="flex-1 flex flex-col">
      <div className="px-4 pt-4 pb-2 text-center">
        <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-gold">Experimental · 3D Prototype</p>
        <div className="mt-2 flex items-center justify-center gap-5 text-sm">
          <span className="font-mono"><b className="text-accent text-lg">{hud.runs}</b> runs</span>
          <span className="font-mono text-foreground-muted">{hud.balls} balls</span>
          <span className="font-mono"><b className="text-danger">{hud.wkts}</b> out</span>
        </div>
        <p className="mt-1 text-xs text-foreground-muted">Batting: <b className="text-foreground">{hud.batter}</b> <span className="text-accent">({hud.rating})</span></p>
        <p className={`mt-1 text-lg font-black italic ${kc[hud.kind] ?? "text-foreground"}`}>{hud.last}</p>
      </div>

      <div className="relative mx-auto w-full max-w-2xl flex-1 min-h-[60vh]">
        <div ref={mountRef} className="absolute inset-0 rounded-2xl overflow-hidden border border-border" />
        {started && (
          <button
            type="button"
            onClick={() => { const v = !soundOn; setSoundOn(v); soundOnRef.current = v; }}
            className="absolute right-3 top-3 z-10 rounded-full border border-border bg-background-elevated/80 px-3 py-1.5 text-xs font-semibold text-foreground-muted backdrop-blur"
          >
            {soundOn ? "🔊 Sound on" : "🔇 Sound off"}
          </button>
        )}
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
        Prototype only — not part of the main game. Each batter&apos;s rating widens the timing window and adds power.
      </p>
    </main>
  );
}
