/* VULPIXISM 5.32 — vulpixism.js */
'use strict';

const VULPIXISM = (() => {

  /* ─── State ─────────────────────────────────────────── */
  const state = {
    history: [],
    historyIndex: -1,
    clipboard: null,
    project: { name: 'Untitled Project', clips: [], effects: [], keyframes: [] },
    activeClip: null,
    activeEffect: null,
    mode: 'classic',
    duration: 30 * 60,
    currentTime: 0,
    playing: false,
    cache: {},
    selectedKeyframe: null,
  };

  /* ─── History ────────────────────────────────────────── */
  function snapshot() {
    const s = JSON.stringify(state.project);
    state.history = state.history.slice(0, state.historyIndex + 1);
    state.history.push(s);
    if (state.history.length > 200) state.history.shift();
    state.historyIndex = state.history.length - 1;
  }

  /* ─── EDIT MENU ──────────────────────────────────────── */
  function editmenu(action) {
    switch (action) {
      case 'undo': {
        if (state.historyIndex > 0) {
          state.historyIndex--;
          state.project = JSON.parse(state.history[state.historyIndex]);
          dispatchEvent(new CustomEvent('v:statechange'));
        }
        break;
      }
      case 'redo': {
        if (state.historyIndex < state.history.length - 1) {
          state.historyIndex++;
          state.project = JSON.parse(state.history[state.historyIndex]);
          dispatchEvent(new CustomEvent('v:statechange'));
        }
        break;
      }
      case 'copy': {
        if (state.activeClip) {
          state.clipboard = JSON.parse(JSON.stringify(state.activeClip));
          toast('Copied');
        }
        break;
      }
      case 'paste': {
        if (state.clipboard) {
          const clone = JSON.parse(JSON.stringify(state.clipboard));
          clone.id = uid();
          clone.start = (state.activeClip ? state.activeClip.start + state.activeClip.duration + 0.5 : 0);
          state.project.clips.push(clone);
          snapshot();
          dispatchEvent(new CustomEvent('v:statechange'));
          toast('Pasted');
        }
        break;
      }
      case 'duplicate': {
        if (state.activeClip) {
          const clone = JSON.parse(JSON.stringify(state.activeClip));
          clone.id = uid();
          clone.start = state.activeClip.start + state.activeClip.duration + 0.1;
          state.project.clips.push(clone);
          snapshot();
          dispatchEvent(new CustomEvent('v:statechange'));
          toast('Duplicated');
        }
        break;
      }
    }
  }

  /* ─── FILE MENU ──────────────────────────────────────── */
  function filemenu(action) {
    switch (action) {
      case 'upload': {
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = 'video/*,image/*,audio/*';
        inp.multiple = true;
        inp.onchange = (e) => {
          Array.from(e.target.files).forEach(file => {
            const url = URL.createObjectURL(file);
            const clip = {
              id: uid(), name: file.name, type: file.type.startsWith('video') ? 'video' : file.type.startsWith('image') ? 'image' : 'audio',
              src: url, start: 0, duration: file.type.startsWith('image') ? 5 : 10,
              x: 0, y: 0, width: 1280, height: 720, opacity: 1, effects: [], keyframes: []
            };
            state.project.clips.push(clip);
            snapshot();
            dispatchEvent(new CustomEvent('v:statechange'));
            toast('Imported: ' + file.name);
          });
        };
        inp.click();
        break;
      }
      case 'shape': {
        const shape = {
          id: uid(), name: 'Shape', type: 'shape', shapeType: 'rect',
          src: null, start: state.currentTime, duration: 5,
          x: 100, y: 100, width: 300, height: 200, fill: '#ffffff', opacity: 1, effects: [], keyframes: []
        };
        state.project.clips.push(shape);
        snapshot();
        dispatchEvent(new CustomEvent('v:statechange'));
        toast('Shape added');
        break;
      }
      case 'draw': {
        dispatchEvent(new CustomEvent('v:drawmode'));
        toast('Draw mode activated');
        break;
      }
      case 'new': {
        if (confirm('Start a new project? Unsaved changes will be lost.')) {
          state.project = { name: 'Untitled Project', clips: [], effects: [], keyframes: [] };
          state.history = [];
          state.historyIndex = -1;
          snapshot();
          dispatchEvent(new CustomEvent('v:statechange'));
          toast('New project created');
        }
        break;
      }
      case 'open': {
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = '.vulpix,.json';
        inp.onchange = (e) => {
          const file = e.target.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (ev) => {
            try {
              state.project = JSON.parse(ev.target.result);
              snapshot();
              dispatchEvent(new CustomEvent('v:statechange'));
              toast('Project opened: ' + file.name);
            } catch {
              toast('Invalid project file');
            }
          };
          reader.readAsText(file);
        };
        inp.click();
        break;
      }
      case 'export': {
        exportMedia();
        break;
      }
      case 'save': {
        const blob = new Blob([JSON.stringify(state.project, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = (state.project.name || 'project') + '.vulpix';
        a.click();
        toast('Project saved');
        break;
      }
    }
  }

  /* ─── PREFERENCES MENU ───────────────────────────────── */
  function preferencesmenu(action) {
    switch (action) {
      case 'clearcache': {
        state.cache = {};
        try { localStorage.removeItem('vulpixism_cache'); } catch (_) {}
        toast('Cache cleared');
        break;
      }
      case 'fixunsupported': {
        state.project.clips = state.project.clips.filter(c => {
          if (c.type === 'video') {
            const v = document.createElement('video');
            if (c.src && !v.canPlayType) return false;
          }
          return true;
        });
        snapshot();
        dispatchEvent(new CustomEvent('v:statechange'));
        toast('Unsupported media removed');
        break;
      }
      case 'fixwebgl': {
        try {
          const canvas = document.getElementById('glCanvas') || document.createElement('canvas');
          const gl = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
          if (!gl) { window.location.href = 'missingsupport.html'; return; }
          toast('WebGL OK — ' + (canvas.getContext('webgl2') ? 'WebGL 2.0' : 'WebGL 1.0'));
        } catch (_) {
          window.location.href = 'missingsupport.html';
        }
        break;
      }
      case 'matchduration': {
        if (!state.activeClip) { toast('No clip selected'); return; }
        const ratio = state.activeClip.width / state.activeClip.height;
        state.project.clips.forEach(c => {
          c.duration = Math.min(c.duration, state.duration);
        });
        dispatchEvent(new CustomEvent('v:matchduration', { detail: { ratio } }));
        toast('Duration matched to aspect ratio ' + ratio.toFixed(2));
        break;
      }
    }
  }

  /* ─── EFFECTS ────────────────────────────────────────── */
  const EFFECT_DEFS = {
    noise:      { label: 'Noise', params: { intensity: { min:0, max:1, default:0.3 }, animated: { type:'bool', default:true } } },
    tzatzki:    { label: 'Tzatzki Lens', params: { radius: { min:0.01, max:1, default:0.4 }, strength: { min:0, max:3, default:1 } } },
    tint:       { label: 'Tint', params: { r: { min:0, max:2, default:1 }, g: { min:0, max:2, default:1 }, b: { min:0, max:2, default:1 }, a: { min:0, max:1, default:0.5 } } },
    turbulent:  { label: 'Turbulent Displace', params: { amount: { min:0, max:200, default:30 }, size: { min:1, max:200, default:50 }, speed: { min:0, max:5, default:1 } } },
    wavewarp:   { label: 'Wave Warp', params: { amplitude: { min:0, max:200, default:20 }, frequency: { min:0, max:50, default:5 }, speed: { min:0, max:10, default:2 }, direction: { min:0, max:360, default:0 } } },
    kaleidoscope:{ label: 'Kaleidoscope', params: { segments: { min:2, max:32, default:6 }, angle: { min:0, max:360, default:0 } } },
    motiontile: { label: 'Motion Tile', params: { tilesH: { min:1, max:20, default:3 }, tilesV: { min:1, max:20, default:3 }, phase: { min:0, max:1, default:0 } } },
    chromatic:  { label: 'Chromatic Aberration', params: { amount: { min:0, max:50, default:5 }, angle: { min:0, max:360, default:0 } } },
    huesat:     { label: 'Hue/Saturation', params: { hue: { min:-180, max:180, default:0 }, saturation: { min:-100, max:100, default:0 }, lightness: { min:-100, max:100, default:0 } } },
    swirl:      { label: 'Swirl', params: { angle: { min:-720, max:720, default:180 }, radius: { min:0.01, max:2, default:0.5 } } },
    halftone:   { label: 'Halftone', params: { dotSize: { min:1, max:30, default:6 }, softness: { min:0, max:1, default:0.5 } } },
    colorbalance:{ label: 'Color Balance', params: { shadows: { min:-1, max:1, default:0 }, midtones: { min:-1, max:1, default:0 }, highlights: { min:-1, max:1, default:0 } } },
    meshglitch: { label: 'Mesh Glitch', params: { intensity: { min:0, max:1, default:0.3 }, segments: { min:2, max:30, default:10 } } },
    glitch:     { label: 'Glitch', params: { intensity: { min:0, max:1, default:0.3 }, speed: { min:0, max:10, default:3 } } },
    bloom:      { label: 'Bloom', params: { threshold: { min:0, max:1, default:0.7 }, intensity: { min:0, max:5, default:1.5 }, radius: { min:0, max:50, default:10 } } },
    lightrays:  { label: 'Light Rays', params: { intensity: { min:0, max:2, default:0.8 }, decay: { min:0, max:1, default:0.95 }, angle: { min:0, max:360, default:45 } } },
    mirror:     { label: 'Mirror', params: { axis: { type:'select', options:['horizontal','vertical','both'], default:'horizontal' } } },
    pinchbulge: { label: 'Pinch & Bulge', params: { amount: { min:-2, max:2, default:0.5 }, radius: { min:0.01, max:2, default:0.5 } } },
  };

  function addEffect(clipId, effectType) {
    const clip = state.project.clips.find(c => c.id === clipId);
    if (!clip) return;
    if (!EFFECT_DEFS[effectType]) return;
    const def = EFFECT_DEFS[effectType];
    const params = {};
    Object.entries(def.params).forEach(([k, v]) => { params[k] = v.default; });
    const effect = { id: uid(), type: effectType, enabled: true, params };
    clip.effects.push(effect);
    snapshot();
    dispatchEvent(new CustomEvent('v:statechange'));
    return effect;
  }

  function removeEffect(clipId, effectId) {
    const clip = state.project.clips.find(c => c.id === clipId);
    if (!clip) return;
    clip.effects = clip.effects.filter(e => e.id !== effectId);
    snapshot();
    dispatchEvent(new CustomEvent('v:statechange'));
  }

  function setEffectParam(clipId, effectId, param, value) {
    const clip = state.project.clips.find(c => c.id === clipId);
    if (!clip) return;
    const effect = clip.effects.find(e => e.id === effectId);
    if (!effect) return;
    effect.params[param] = value;
    dispatchEvent(new CustomEvent('v:renderframe'));
  }

  /* ─── KEYFRAMES ──────────────────────────────────────── */
  function addKeyframe(clipId, property, time, value) {
    const clip = state.project.clips.find(c => c.id === clipId);
    if (!clip) return;
    const kf = { id: uid(), property, time, value };
    clip.keyframes.push(kf);
    clip.keyframes.sort((a, b) => a.time - b.time);
    snapshot();
    dispatchEvent(new CustomEvent('v:statechange'));
    return kf;
  }

  function removeKeyframe(clipId, keyframeId) {
    const clip = state.project.clips.find(c => c.id === clipId);
    if (!clip) return;
    clip.keyframes = clip.keyframes.filter(k => k.id !== keyframeId);
    snapshot();
    dispatchEvent(new CustomEvent('v:statechange'));
  }

  function getInterpolatedValue(clip, property, time) {
    const kfs = clip.keyframes.filter(k => k.property === property).sort((a, b) => a.time - b.time);
    if (!kfs.length) return clip[property];
    if (time <= kfs[0].time) return kfs[0].value;
    if (time >= kfs[kfs.length - 1].time) return kfs[kfs.length - 1].value;
    for (let i = 0; i < kfs.length - 1; i++) {
      if (time >= kfs[i].time && time <= kfs[i + 1].time) {
        return beziercurve(kfs[i].time, kfs[i + 1].time, kfs[i].value, kfs[i + 1].value, time);
      }
    }
    return clip[property];
  }

  /* ─── BEZIER CURVE ───────────────────────────────────── */
  function beziercurve(t0, t1, v0, v1, t) {
    const u = (t - t0) / (t1 - t0);
    const cu = u * u * (3 - 2 * u);
    if (typeof v0 === 'number' && typeof v1 === 'number') {
      return v0 + (v1 - v0) * cu;
    }
    return u < 0.5 ? v0 : v1;
  }

  /* ─── HELP MENU ──────────────────────────────────────── */
  function helpmenu(action) {
    switch (action) {
      case 'wiki': {
        window.open('https://vulpixism.fandom.com/wiki/Vulpixismpedia_Wiki', '_blank');
        break;
      }
      case 'about': {
        toast('VULPIXISM 5.32 · Since 2024');
        break;
      }
    }
  }

  /* ─── FREELANCE WEB DEVELOPER ────────────────────────── */
  function freelancewebdeveloper() {
    dispatchEvent(new CustomEvent('v:showpanel', { detail: { panel: 'freelance' } }));
  }

  /* ─── SOCIAL LINKS ───────────────────────────────────── */
  function socialinks() {
    dispatchEvent(new CustomEvent('v:showpanel', { detail: { panel: 'social' } }));
  }

  /* ─── EXPORT ─────────────────────────────────────────── */
  function exportMedia() {
    dispatchEvent(new CustomEvent('v:export'));
    toast('Export started — check your downloads');
  }

  /* ─── UTILS ──────────────────────────────────────────── */
  function uid() {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  function toast(msg) {
    const el = document.createElement('div');
    el.className = 'v-toast';
    el.textContent = msg;
    el.style.cssText = `position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#fff;color:#000;padding:8px 20px;border-radius:20px;font-family:'Open Sans',sans-serif;font-size:13px;font-weight:600;z-index:9999;pointer-events:none;opacity:0;transition:opacity .2s;`;
    document.body.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '1'; });
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 2000);
  }

  snapshot();

  return {
    state, editmenu, filemenu, preferencesmenu,
    addEffect, removeEffect, setEffectParam, EFFECT_DEFS,
    addKeyframe, removeKeyframe, getInterpolatedValue,
    beziercurve, helpmenu, freelancewebdeveloper, socialinks,
    exportMedia, snapshot, uid, toast
  };
})();

window.VULPIXISM = VULPIXISM;
