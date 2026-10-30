/* Spot — 3D text layer. Typed text as 3D letters on their own WebGL canvas
 * (#text3d) over the picture. Ported from text-sketch.html. three.js is
 * loaded by the host the first time Text is switched on. */
(function () {
  "use strict";

  window.createTextLayer = function (host) {
    const P = host.params;
    let T = null;
    const L = {
      ready: false, canvas: null, renderer: null, scene: null, camera: null, word: null,
      letters: [], wordW: 1, letterSize: 1, buildToken: 0, fonts: {}, shared: null,
      running: false, last: 0, time: 0, travel: 0, skinFrame: null, skinTex: null,
      bgTex: new Map(), rebuildTimer: 0,
    };

  const COVER = `
    uniform sampler2D uImg; uniform float uImgAspect; uniform vec2 uRes;
    vec2 coverUV(vec2 s) {
      float sa = uRes.x / uRes.y;
      vec2 uv = s;
      if (sa > uImgAspect) uv.y = (s.y - 0.5) * (uImgAspect / sa) + 0.5;
      else uv.x = (s.x - 0.5) * (sa / uImgAspect) + 0.5;
      return uv;
    }`;

  // ---------- geometry: letters, cut fine so they can bend ----------
  function subdivide(geo, maxEdge, cap) {
    const src = geo.attributes.position.array;
    let tris = [];
    for (let i = 0; i < src.length; i += 9) tris.push([src[i], src[i + 1], src[i + 2], src[i + 3], src[i + 4], src[i + 5], src[i + 6], src[i + 7], src[i + 8]]);
    const m2 = maxEdge * maxEdge;
    const d2 = (t, a, b) => (t[a] - t[b]) ** 2 + (t[a + 1] - t[b + 1]) ** 2 + (t[a + 2] - t[b + 2]) ** 2;
    let changed = true;
    while (changed && tris.length < cap) {
      changed = false;
      const out = [];
      for (const t of tris) {
        const e0 = d2(t, 0, 3), e1 = d2(t, 3, 6), e2 = d2(t, 6, 0);
        const L = Math.max(e0, e1, e2);
        if (L <= m2 || out.length + tris.length > cap) { out.push(t); continue; }
        changed = true;
        // split the longest edge at its midpoint
        let a, b, c; // edge a-b is longest, c opposite
        if (L === e0) { a = 0; b = 3; c = 6; } else if (L === e1) { a = 3; b = 6; c = 0; } else { a = 6; b = 0; c = 3; }
        const mid = [(t[a] + t[b]) / 2, (t[a + 1] + t[b + 1]) / 2, (t[a + 2] + t[b + 2]) / 2];
        const P = (k) => [t[k], t[k + 1], t[k + 2]];
        out.push([...P(a), ...mid, ...P(c)]);
        out.push([...mid, ...P(b), ...P(c)]);
      }
      tris = out;
    }
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(tris.flat(), 3));
    return g;
  }

  // Shared ("smooth") normals: every copy of a point gets the average of the
  // faces around it, so pushing along it inflates without cracking.
  function addSmoothNormals(g) {
    const p = g.attributes.position.array, n = g.attributes.normal.array;
    const acc = new Map();
    const key = (i) => `${Math.round(p[i] * 1e4)},${Math.round(p[i + 1] * 1e4)},${Math.round(p[i + 2] * 1e4)}`;
    for (let i = 0; i < p.length; i += 3) {
      const k = key(i); const a = acc.get(k) || [0, 0, 0];
      a[0] += n[i]; a[1] += n[i + 1]; a[2] += n[i + 2]; acc.set(k, a);
    }
    const s = new Float32Array(p.length);
    for (let i = 0; i < p.length; i += 3) {
      const a = acc.get(key(i)); const l = Math.hypot(a[0], a[1], a[2]) || 1;
      s[i] = a[0] / l; s[i + 1] = a[1] / l; s[i + 2] = a[2] / l;
    }
    g.setAttribute("aSmooth", new T.BufferAttribute(s, 3));
  }

  // ---------- material ----------
  const NOISE = `
    vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;} vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
    vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);} vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
    float snoise(vec3 v){const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0.0,0.5,1.0,2.0);
      vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.0-g;
      vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
      i=mod289(i);vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
      float n_=0.142857142857;vec3 ns=n_*D.wyz-D.xzx;vec4 j=p-49.0*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);
      vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.0-abs(x)-abs(y);vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
      vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;vec4 sh=-step(h,vec4(0.0));vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
      vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
      vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
      vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);m=m*m;
      return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));}`;

  const VERT = NOISE + `
    attribute vec3 aSmooth;
    uniform float uTime, uSize, uFlat, uInflate, uMelt, uSpinA, uOffX, uOffY, uSeed;
    uniform float uWordW, uTwist, uBend, uWave, uTravelX;
    varying vec3 vN; varying vec3 vWorld; varying vec3 vWord; varying float vSoft;
    vec2 rot(vec2 p, float a){ float c=cos(a), s=sin(a); return vec2(c*p.x - s*p.y, s*p.x + c*p.y); }
    void main(){
      vec3 p = position; vec3 n = normal; vec3 sn = aSmooth;
      // flat -> extruded
      p.z *= mix(0.03, 1.0, uFlat);
      // inflate (balloon) and melt (lumpy, drooping) along shared normals
      p += sn * uInflate * uSize * 0.1; // gentle enough to keep the counters (o, p, e…) open
      float nz = snoise(p / uSize * 1.6 + vec3(uSeed, 0.0, uTime * 0.25));
      p += sn * nz * uMelt * uSize * 0.22;
      p.y -= uMelt * uSize * 0.12 * (0.6 + 0.4 * nz);
      float soft = clamp(uInflate + uMelt, 0.0, 1.0);
      n = normalize(mix(n, sn, soft));
      // each letter's own spin, about its own centre
      p.xz = rot(p.xz, uSpinA); n.xz = rot(n.xz, uSpinA);
      // into the word
      p.x += uOffX + uTravelX; p.y += uOffY;
      // wave along the word
      p.y += uWave * uSize * 0.35 * sin(p.x / uSize * 1.4 + uTime * 1.6);
      // twist round the line of text
      float ta = uTwist * 3.14159 * p.x / max(uWordW, 0.001);
      p.yz = rot(p.yz, ta); n.yz = rot(n.yz, ta);
      // bend round a cylinder (positive bends away from you)
      if (abs(uBend) > 0.001) {
        float R = uWordW / (abs(uBend) * 3.14159);
        float sgn = sign(uBend);
        float th = p.x / R;
        float rr = R + p.z * sgn;
        p.x = rr * sin(th);
        p.z = sgn * (rr * cos(th) - R);
        n.xz = rot(n.xz, -th * sgn);
      }
      vWord = p;
      vec4 wp = modelMatrix * vec4(p, 1.0);
      vWorld = wp.xyz;
      vN = normalize(mat3(modelMatrix) * n);
      vSoft = soft;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`;

  const FRAG = COVER + `
    uniform float uSurface, uMagnify, uWordW, uSize, uDebug; uniform vec3 uTint; uniform sampler2D uSkin; uniform float uSkinAspect;
    varying vec3 vN; varying vec3 vWorld; varying vec3 vWord; varying float vSoft;
    void main(){
      vec3 fn = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
      vec3 N = normalize(mix(fn, normalize(vN), 0.35 + 0.65 * vSoft));
      if (!gl_FrontFacing) N = -N;
      vec3 V = normalize(cameraPosition - vWorld);
      vec3 L = normalize(vec3(0.4, 0.7, 0.6));
      float diff = max(dot(N, L), 0.0);
      float rim = pow(1.0 - max(dot(N, V), 0.0), 2.5);
      vec3 col;
      if (uSurface < 0.5) {
        // the picture laid across the whole word, front to back
        vec2 uv = vec2(vWord.x / uWordW + 0.5, vWord.y / (uWordW / uSkinAspect) + 0.5);
        col = texture2D(uSkin, uv).rgb * (0.38 + 0.72 * diff) + rim * 0.18;
      } else if (uSurface < 1.5) {
        // glass: the moving picture behind, bent through the letter
        vec2 s = gl_FragCoord.xy / uRes;
        vec2 off = N.xy * uMagnify * 0.09 - (s - 0.5) * uMagnify * 0.12;
        vec3 r = texture2D(uImg, coverUV(s - off)).rgb;
        vec3 g2 = texture2D(uImg, coverUV(s - off * 1.04)).rgb;
        col = vec3(r.r, mix(r.g, g2.g, 0.5), g2.b) * 1.05 + rim * 0.55 + pow(max(dot(reflect(-L, N), V), 0.0), 40.0) * 0.6;
      } else {
        col = vec3(0.07) + vec3(0.9) * pow(diff, 1.5) * 0.25 + rim * vec3(1.0, 0.88, 0.0) * 0.9;
      }
      if (uDebug > 0.5) {
        if (uDebug < 1.5) col = vec3(0.95);                       // wireframe lines
        else if (uDebug < 2.5) col = N * 0.5 + 0.5;               // normals
        else if (uDebug < 3.5) {                                  // faces: green = front/back, red/yellow = walls
          float wl = abs(fn.z);
          col = wl > 0.7 ? vec3(0.2, 0.75, 0.35) : mix(vec3(0.85, 0.2, 0.2), vec3(0.9, 0.7, 0.1), wl);
        } else col = uTint * (0.35 + 0.65 * diff);                // flat colour per letter
      }
      gl_FragColor = vec4(col, 1.0);
    }`;


  function makeMaterial() {
    const m = new T.ShaderMaterial({
      uniforms: {
        ...L.shared,
        uSize: { value: 1 }, uFlat: { value: 1 }, uInflate: { value: 0 }, uMelt: { value: 0 },
        uSpinA: { value: 0 }, uOffX: { value: 0 }, uOffY: { value: 0 }, uSeed: { value: 0 },
        uWordW: { value: 1 }, uTwist: { value: 0 }, uBend: { value: 0 }, uWave: { value: 0 }, uTravelX: { value: 0 },
        uSurface: { value: 0 }, uMagnify: { value: 0.45 },
        uDebug: { value: 0 }, uTint: { value: new T.Color(1, 1, 1) },
      },
      vertexShader: VERT, fragmentShader: FRAG, side: T.DoubleSide, transparent: false,
    });
    m.extensions.derivatives = true;
    return m;
  }

  const rand = (k, s) => { const x = Math.sin(k * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); };
  const viewH = () => 2 * L.camera.position.z * Math.tan((L.camera.fov * Math.PI) / 360);
  const viewW = () => viewH() * L.camera.aspect;
  // Letter size is relative to the smaller of the width and a screen-ish
  // height, so a word stays sensible on a phone, a laptop and the long Igloo strip.
  const unit = () => Math.min(viewW(), viewH() * 1.8);

  function getFont(key) {
    if (L.fonts[key]) return Promise.resolve(L.fonts[key]);
    return new Promise((res, rej) =>
      new T.FontLoader().load(`vendor/fonts/typeface/${key}.typeface.json`, (f) => { L.fonts[key] = f; res(f); }, undefined, rej)
    );
  }

  async function build() {
    if (!L.ready) return;
    const token = ++L.buildToken;
    let font;
    try {
      font = await getFont(P.textFace);
    } catch (e) {
      host.toast(`Text: couldn't load the typeface (${e.message || e})`);
      return;
    }
    if (token !== L.buildToken) return;
    const TESTS = { counters: "oepadgbq8B&@%R", alphabet: "abcdefghijklmnopqrstuvwxyz", caps: "ABCDEFGHIJKLMNOPQRSTUVWXYZ" };
    const text = TESTS[P.textTest] || P.textValue || " ";
    L.builtText = text;
    L.buildStats = [];
    const t0 = performance.now();
    const size = (P.textSize / 100) * unit() * 0.38;
    const depth = size * (P.textDepth / 100) * 0.9;
    const bevel = P.textBevel / 100;
    const track = (P.textTrack / 100) * size * 0.5;
    const scale = size / font.data.resolution;
    L.letterSize = size;

    L.letters.forEach((l) => { L.word.remove(l.mesh); l.mesh.geometry.dispose(); l.mesh.material.dispose(); });
    L.letters = [];
    let x = 0;
    const placed = [];
    [...text].forEach((ch, i) => {
      const glyph = font.data.glyphs[ch] || font.data.glyphs["?"];
      const adv = (glyph ? glyph.ha : font.data.resolution * 0.5) * scale;
      if (ch.trim() && glyph) {
        const shapes = font.generateShapes(ch, size);
        const holes = shapes.reduce((n, s) => n + (s.holes ? s.holes.length : 0), 0);
        let g = new T.ExtrudeGeometry(shapes, {
          depth, curveSegments: 10, bevelEnabled: bevel > 0.01,
          bevelThickness: depth * 0.5 * bevel + 0.0001, bevelSize: size * 0.045 * bevel, bevelSegments: 4,
        });
        if (g.index) g = g.toNonIndexed();
        g.computeBoundingBox();
        const bb = g.boundingBox;
        const cx = (bb.min.x + bb.max.x) / 2, cy = (bb.min.y + bb.max.y) / 2, cz = (bb.min.z + bb.max.z) / 2;
        g.translate(-cx, -cy, -cz);
        g = subdivide(g, size * 0.07, 60000);
        g.computeVertexNormals();
        addSmoothNormals(g);
        L.buildStats.push({ ch, shapes: shapes.length, holes, tris: Math.round(g.attributes.position.count / 3) });
        placed.push({ mesh: new T.Mesh(g, makeMaterial()), k: i + 1, centre: x + cx });
      }
      x += adv + track;
    });
    L.wordW = Math.max(size, x - track);
    placed.forEach((l) => { l.offX = l.centre - L.wordW / 2; L.word.add(l.mesh); L.letters.push(l); });
    L.buildMs = Math.round(performance.now() - t0);
  }

  const formStages = (f) => {
    const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    return { flat: ss(0, 0.33, f), inflate: ss(0.33, 0.66, f), melt: ss(0.66, 1, f) };
  };

  function init() {
    T = window.THREE;
    // three.js reads outlines as clockwise-solid unless told otherwise; the
    // converted typefaces have outer contours counter-clockwise (counters
    // clockwise), so ask for that reading. Without it the outer outline was
    // treated as the hole, which only looked right on letters with one counter.
    if (!T.ShapePath.prototype.spotCCW) {
      const orig = T.ShapePath.prototype.toShapes;
      T.ShapePath.prototype.toShapes = function (isCCW, noHoles) {
        return orig.call(this, true, noHoles);
      };
      T.ShapePath.prototype.spotCCW = true;
    }
    const canvas = document.createElement("canvas");
    canvas.id = "text3d";
    canvas.setAttribute("aria-hidden", "true");
    host.stage.appendChild(canvas);
    L.canvas = canvas;
    L.info = document.createElement("pre");
    L.info.id = "text3dInfo";
    L.info.hidden = true;
    host.stage.appendChild(L.info);
    L.renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true });
    L.renderer.setPixelRatio(1);
    L.renderer.autoClear = false;
    L.scene = new T.Scene();
    L.camera = new T.PerspectiveCamera(35, 1, 0.1, 200);
    L.camera.position.set(0, 0, 20);
    L.word = new T.Group();
    L.scene.add(L.word);
    L.shared = {
      uImg: { value: null }, uImgAspect: { value: 1 }, uRes: { value: new T.Vector2(1, 1) }, uTime: { value: 0 },
      uSkin: { value: null }, uSkinAspect: { value: 1 },
    };
    for (const c of host.canvases) {
      const t = new T.CanvasTexture(c);
      t.minFilter = T.LinearFilter;
      t.generateMipmaps = false;
      L.bgTex.set(c, t);
    }
    L.ready = true;
    resize(true);
  }

  function resize(noBuild) {
    if (!L.ready) return;
    const w = host.STAGE.w, h = host.STAGE.h;
    L.renderer.setSize(w, h, false);
    L.camera.aspect = w / h;
    L.camera.updateProjectionMatrix();
    L.shared.uRes.value.set(w, h);
    L.shared.uImgAspect.value = w / h;
    if (!noBuild) rebuildSoon();
  }

  function rebuildSoon() {
    clearTimeout(L.rebuildTimer);
    L.rebuildTimer = setTimeout(build, 160);
  }

  function updateInfo() {
    if (!L.info) return;
    const on = P.textOn && P.textInfo;
    L.info.hidden = !on;
    if (!on) return;
    const rows = L.buildStats.map((s) => `${s.ch}  shapes ${s.shapes}  holes ${s.holes}  tris ${s.tris}`);
    const total = L.buildStats.reduce((n, s) => n + s.tris, 0);
    L.info.textContent =
      `text layer · ${P.textFace}${P.textTest !== "off" ? " · test: " + P.textTest : ""}${P.textDebug !== "off" ? " · view: " + P.textDebug : ""}\n` +
      `${L.fps || 0} fps · ${total} tris built (${L.buildMs || 0} ms) · ${L.renderer.info.render.triangles} drawn · ${host.STAGE.w}×${host.STAGE.h}\n` +
      `holes = counters found in the outline (o, p, e… should be 1; B, 8, & more)\n` +
      rows.join("\n");
  }

  function active() {
    return P.textOn && L.ready;
  }

  function loop(now) {
    if (!active()) {
      L.running = false;
      return;
    }
    const dt = L.last ? Math.min(0.1, (now - L.last) / 1000) : 0;
    L.last = now;
    const run = host.paused() ? 0 : dt;
    L.time += run;
    const t = L.time * 1000;
    const U = L.shared;
    U.uTime.value = L.time;

    // The letters wear a different (earlier) finished picture, so they never camouflage.
    const frame = host.skinFrame();
    if (frame && frame !== L.skinFrame) {
      if (L.skinTex) L.skinTex.dispose();
      L.skinTex = new T.CanvasTexture(frame);
      L.skinTex.minFilter = T.LinearFilter;
      L.skinTex.generateMipmaps = false;
      L.skinFrame = frame;
      U.uSkin.value = L.skinTex;
      U.uSkinAspect.value = frame.width / frame.height;
    }
    const glass = P.textSurface === "glass";
    if (glass) {
      const bg = L.bgTex.get(host.front()) || L.bgTex.get(host.canvases[0]);
      bg.needsUpdate = true; // the picture changes every frame
      U.uImg.value = bg;
    }
    const surface = P.textSurface === "picture" && U.uSkin.value ? 0 : glass ? 1 : 2;

    const f = P.textForm / 100;
    const variety = P.textVariety / 100;
    const spin = P.textSpin / 100;
    const dbg = { wire: 1, normals: 2, parts: 3, flat: 4 }[P.textDebug] || 0;
    const letterMode = P.textLayout === "letters";
    L.travel += run * (P.textTravel / 100) * viewW() * 0.12;
    const span = viewW() + L.wordW;
    const tx = ((((L.travel + span / 2) % span) + span) % span) - span / 2;
    L.letters.forEach((l) => {
      const u = l.mesh.material.uniforms;
      const vary = (s) => (rand(l.k, s) - 0.5) * 2 * variety;
      const lf = Math.min(0.5, Math.max(0, f + vary(1) * 0.25)); // capped: past this the counters close up
      const ls = formStages(lf);
      u.uSize.value = L.letterSize;
      u.uFlat.value = ls.flat; u.uInflate.value = ls.inflate; u.uMelt.value = ls.melt;
      u.uSeed.value = l.k * 3.1;
      u.uOffX.value = l.offX;
      u.uOffY.value = letterMode ? Math.sin(t / 1400 + l.k * 1.7) * L.wordW * 0.04 * (0.3 + variety) : vary(2) * L.wordW * 0.015;
      u.uSpinA.value = letterMode ? (t / 1000) * spin * (0.6 + rand(l.k, 3)) * 1.6 + l.k : Math.sin(t / 2600 + l.k * 0.5) * spin * 0.9;
      u.uWordW.value = L.wordW;
      u.uTwist.value = P.textTwist / 100;
      u.uBend.value = P.textBend / 100;
      u.uWave.value = P.textWave / 100;
      u.uTravelX.value = tx;
      u.uSurface.value = surface;
      u.uMagnify.value = P.textMagnify / 100;
      u.uDebug.value = dbg;
      l.mesh.material.wireframe = dbg === 1;
      u.uTint.value.setHSL((l.k * 0.137) % 1, 0.65, 0.55);
    });
    L.word.rotation.y = letterMode ? 0 : Math.sin(t / 3200) * spin * 0.5;
    L.word.rotation.x = Math.sin(t / 4100) * 0.12 * spin;

    L.renderer.clear();
    L.renderer.info.reset();
    L.renderer.render(L.scene, L.camera);
    L.frames = (L.frames || 0) + 1;
    if (now - (L.infoAt || 0) > 500) {
      L.fps = Math.round((L.frames * 1000) / Math.max(1, now - (L.infoAt || now - 1000)));
      L.frames = 0;
      L.infoAt = now;
      updateInfo();
    }
    requestAnimationFrame(loop);
  }

  async function update() {
    if (!P.textOn) {
      if (L.canvas) L.canvas.hidden = true;
      return;
    }
    try {
      await host.loadThree();
    } catch (e) {
      host.toast(`Text unavailable: ${e.message}`);
      return;
    }
    if (!P.textOn) return;
    if (!L.ready) init();
    L.canvas.hidden = false;
    await build();
    if (P.textOn && !L.running) {
      L.running = true;
      L.last = 0;
      requestAnimationFrame(loop);
    }
  }

    return { update, rebuildSoon, resize, refreshInfo: updateInfo };
  };
})();
